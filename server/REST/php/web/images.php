<?php
/**
 * Extremely simple endpoint
 * 
 * TODO - Possibly add an end point for tags, the metadata could go there
 *
 * POST - technically this should be a PUT
 * 
 * images will contain the list of modified images. The value is the complete list of tags for that image, ie this will remove tags
 * 
 * 
 * images : hash. [image_id] => [tag_index_1,tag_index_2,...,_tag_index_N] - note an empty array is allowed, this would remove all tags
 * tags   : hash  [tag_index] => {t:tag label (string),m=>hash} - "m "is the metadata, unused at this point
 *
 */
require_once('../lib/init.lib');

class REST_Images extends REST {

	protected static $POST_ARGS = array('images'=>true,'tags'=>true);

	private $tag_ids;

	/*
	 * @param array $images hash [image_id] => [tag_index_1,tag_index_2,...,_tag_index_N] - note an empty array is allowed, this would remove all tags
	 * @param array $tags hash  [tag_index] => {t:tag label (string),m=>hash} - "m "is the metadata, unused at this point
	 */
	protected function POST($images,$tags) {

		if (! is_array($images) || ! is_array($tags)) {
			self::send_error_message('images and tags must be arrays');
		}

		if (! $this->db->beginTransaction()) {
			self::send_error_message('Could not start transaction');
		}

		if (! $this->set_tags($tags)) {
			$this->db->rollback();
			self::send_error_message('Could not insert / update tags');
		}

		if (! $this->update_images($images)) {
			$this->db->rollback();
			self::send_error_message('Could not update images');
		}

		if (! $this->db->commit()) {
			$this->db->rollback();
			self::send_error_message('Could not commit transaction');
		}

		if ( ! $this->start_background_process()) {
			self::send_error_message('Could not start background process to update images');
		}

		http_response_code(200);
		exit(0);
	}

	private function start_background_process() {
		//TODO - build
		return TRUE;
	}

	private function set_tags_sql() {
		$sql = new INSERT_SQL($this->db,'image_tag',TRUE);

		$sql->col('ImageID');
		$sql->col('TagID');

		return $sql;
	}

	private function set_tags($tags) {

		foreach ($tags as $tag_index => $tag) {

			//TODO add date metadata detection

			$sql = new SELECT_SQL($this->db,'tag');
			$sql->col('id');
			$sql->where("{$sql->getAlias()}.tag = ?",strtolower($tag['t']));

			$existing_tag = $sql->get();

			if ($existing_tag) {
				$this->tag_ids[$tag_index] = $existing_tag->id;
			} else {

				$sql = new INSERT_SQL($this->db,'tag');
				$sql->col('Tag',$tag['t']);

				//TODO - insert metadata

				$tag_id = $sql->exec();
				if (! $tag_id) {
					return FALSE;
				}
				
				$this->tag_ids[$tag_index] = $tag_id;

			}
		}

		return TRUE;
	}

	private function update_images($images) {

		$delete_all_tags = array();
		$delete_all_tags_count = 0;

		$dirty = array();
		$dirty_count = 0;

		$set_tags_sql = $this->set_tags_sql();
		$set_tags_count = 0;

		foreach ($images as $image_id => $tag_index_list) {

			$dirty[] = $image_id;
			$dirty_count++;

			if (empty($tag_index_list)) {
				$delete_all_tags[] = $image_id;

				if ($delete_all_tags_count++ > 1000) {
					$this->delete_all_tags($delete_all_tags);
					$delete_all_tags = array();
					$delete_all_tags_count = 0;
				}
			} else {

				foreach ($tag_index_list as $tag_index) {
					if (! isset($this->tag_ids[$tag_index])) {
						trigger_error('Could not find tag for ' . $tag_index,E_USER_ERROR);
						return FALSE;
					}

					$set_tags_sql->addData(array($image_id,$this->tag_ids[$tag_index]));

					if ($set_tags_count++ > 1000) {
						if (! $set_tags_sql->exec()) {
							error_log('HERE');

							return FALSE;
						}
						$set_tags_sql = $this->set_tags_sql();
						$set_tags_count = 0;
					}
				}

			}

			if ($dirty_count > 1000) {
				$this->set_dirty($dirty);
				$dirty = array();
				$dirty_count = 0;
			}

		}

		if (! $this->delete_all_tags($delete_all_tags)) {
			return FALSE;
		}

		if (! $this->set_dirty($dirty)) {
			return FALSE;
		}

		if ($set_tags_count) {
			if (! $set_tags_sql->exec()) {
				return FALSE;
			}
		}

		return TRUE;

	}

	private function set_dirty($image_ids) {

		if (empty($image_ids)) {
			return TRUE;
		}

		$sql = new UPDATE_SQL($this->db,'image');
		$sql->col($sql->getAlias() . '.IsDirty',1);
		$sql->where(array($sql::IN,$sql->getAlias() . '.id'),$image_ids);

		return $sql->exec() !== FALSE;

	}

	private function delete_all_tags($image_ids) {

		if (empty($image_ids)) {
			return TRUE;
		}

		$sql = new DELETE_SQL($this->db,'image_tag');
		$sql->col($sql->getAlias() . '.*');
		$sql->where(array($sql::IN,$sql->getAlias() . '.ImageID'),$image_ids);

		return $sql->exec() !== FALSE;

	}

}

REST_IMAGES::handle();
