<?php
/**
 * Extremely simple endpoint
 * 
 * POST - technically this should be a PUT
 * 
 * images[] : 
 * add_tags[] : 
 * del_tags[] : array of tag labels to remove from these images (note, some images may not have the tags applied)
 *
 */
require_once('../lib/init.lib');

class REST_Images extends REST {

	protected static $POST_ARGS = array('images'=>true,'add'=>true,'del'=>true);

	private $images;
	private $add_tags;
	private $del_tags;

	/*
	 * @param array $images array of image ids to apply the tags to
	 * @param array $add_tags array of tag labels to add to these images (note, some images may already have these tags applied)
	 * @param array $del_tags array of tag labels to remove from these images (note, some images may not have the tags applied)
	 */
	protected function POST($images,$add_tags,$del_tags) {

		if (! is_array($images) || ! is_array($add_tags) || ! is_array($del_tags)) {
			self::send_error_message('images, add_tags and del_tags must be arrays');
		}

		$this->images = $images;
		$this->add_tags = $add_tags;
		$this->del_tags = $del_tags;

		if (! $this->db->beginTransaction()) {
			self::send_error_message('Could not start transaction');
		}

		if (! $this->add_tags()) {
			$this->db->rollback();
			self::send_error_message('Could not add tags');
		}

		if (! $this->del_tags()) {
			$this->db->rollback();
			self::send_error_message('Could not add tags');
		}

		if (! $this->db->commit()) {
			$this->db->rollback();
			self::send_error_message('Could not commit transaction');
		}

		http_response_code(200);
		exit(0);
	}

	private function get_tag_id($tag, $add) {
		//The number of tags that are going to be passed is expected to be small
		$sql = new SELECT_SQL($this->db, 'tag');
		$sql->col('id');
		$sql->where("LOWER({$sql->getAlias()}.tag) = ?",strtolower($tag));

		$existing = $sql->get();

		if ($existing) {
			return $existing->id;
		} else if ($add) {
			$sql = new INSERT_SQL($this->db,'tag');
			$sql->col('Tag',$tag);

			return $sql->exec();
		}
	}

	private function del_tags() {

		foreach ($this->add_tags as $tag) {

			$tag_id = $this->get_tag_id($tag, FALSE);

			if (! $tag_id) {
				next;
			}

			//Operate in sets of 1000
			$offset = 0;
			$chunk = 1000;
			$count = count($this->images);

			while ($offset < $count) {

				$set = array_slice($this->images, $offset, $chunk);
				$offset += $chunk;

				if (! $this->mark_deleted($set, $tag_id, TRUE)) {
					return FALSE;
				}

			}
		}

		return TRUE;

	}

	private function mark_deleted($set, $tag_id, $deleted) {

		$JA = SQL::JA;

		$in_string = implode(', ', array_fill(0, count($set), '?'));

		$sql = new UPDATE_SQL($this->db, 'image_tag');
		$sql->join('image', "{$JA}.id = {$sql->getAlias()}.ImageID AND {$JA}.id IN ({$in_string})", FALSE, $set);
		$sql->join('tag'  , "{$JA}.id = {$sql->getAlias()}.TagID AND {$JA}.id = ?", FALSE, $tag_id);
		$sql->col('IsDeleted',$deleted ? 1 : 0);
		$sql->where('IsDeleted = ?', $deleted ? 0 : 1);

		return $sql->exec();
	}

	private function add_tags() {
		/*
		INSERT INTO image_tag (ImageID, TagID)
		SELECT i.id AS ImageID, t.id AS TagID
		FROM images i
		 JOIN tag t ON t.id = 456 
		 LEFT JOIN image_tag it ON it.ImageID = i.id AND it.TagID = t.id
		WHERE i.id IN(1,2,3) AND it.ImageID IS NULL
		
		-- As the image_tag may have been marked as deleted on a previous update
		-- the insert above would not modify that record
		UPDATE image_tag it
		 JOIN image i ON i.id IN (1,2,3) AND i.id = it.ImageID
		 JOIN tag t ON t.Label = 456 AND t.id = it.TagID
		SET IsDeleted = 0
		*/

		foreach ($this->add_tags as $tag) {

			$tag_id = $this->get_tag_id($tag, TRUE);

			//Operate in sets of 1000
			$offset = 0;
			$chunk = 1000;
			$count = count($this->images);

			$JA = SQL::JA;

			while ($offset < $count) {

				$set = array_slice($this->images, $offset, $chunk);
				$offset += $chunk;

				$sql = new INSERTSELECT_SQL($this->db, 'image');

				$sql->insertTable('image_tag');
				$sql->insertCol('ImageID');
				$sql->insertCol('TagID');

				$sql->col($sql->getAlias() . '.id AS ImageID');

				$tag_alias = $sql->join('tag', "{$JA}.id = ?", FALSE, $tag_id);
				$sql->col("{$tag_alias}.id AS TagID");

				$existing_alias = $sql->join('image_tag', "{$JA}.ImageID = {$sql->getAlias()}.id AND {$JA}.TagID = {$tag_alias}.id", TRUE);
				$sql->where("{$existing_alias}.ImageID IS NULL");

				$in_string = implode(', ', array_fill(0, count($set), '?'));

				$sql->where("{$sql->getAlias()}.id IN ({$in_string})", $set);
				
				if ($sql->exec() === FALSE) {
					return FALSE;
				}

				if (! $this->mark_deleted($set, $tag_id, FALSE)) {
					return FALSE;
				}

			}
		}

		return TRUE;

	}


}

REST_IMAGES::handle();
