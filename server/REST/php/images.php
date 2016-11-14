<?php
print "Running\n";
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
require_once('init.lib');

REST_Images::handle();

class REST_Images extends REST {

	protected static $POST_ARGS = array('images'=>true,'tags'=>true);

	private $tag_ids;

	/*
	 * @param array $images hash [image_id] => [tag_index_1,tag_index_2,...,_tag_index_N] - note an empty array is allowed, this would remove all tags
	 * @param array $tags hash  [tag_index] => {t:tag label (string),m=>hash} - "m "is the metadata, unused at this point
	 */
	protected function POST($images,$tags) {

		if (is_array($images) || ! is_array($tags)) {
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

		//if (! $this->db->commit()) {
		//TODO - put the commit back, I'll error log all database statements to check correctness
		if (TRUE) {
			$this->db->rollback();
			self::send_error_message('Could not commit transaction');
		}

		if ( ! $this->start_background_process) {
			self::send_error_message('Could not start background process to update images');
		}

		http_response_code(200);
		exit(0);
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

			$tag = $sql->get();

			if ($tag) {
				$this->tag_ids[$tag_index] = $tag_id;
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
				$delete_all_tags_count++;
				$delete_all_tags[] = $image_id;

				if ($delete_all_tags_count > 1000) {
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

					if ($set_tags_count > 1000) {
						if (! $set_tags_sql->exec()) {
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

	}

	private function set_dirty($image_ids) {

		if (empty($image_ids)) {
			return TRUE;
		}

		$sql = new UPDATE_SQL($this->db,'image');
		$sql->col($sql->getAlias() . '.IsDirty',1);
		$sql->where(array($sql::IN,$sql->getAlias() . '.ImageID'),$image_ids);

		return $sql->exec();

	}

	private function delete_all_tags($image_ids) {

		if (empty($image_ids)) {
			return TRUE;
		}

		$sql = new DELETE_SQL($this->db,'image_tag');
		$sql->col($sql->getAlias() . '.*');
		$sql->where(array($sql::IN,$sql->getAlias() . '.ImageID'),$image_ids);

		return $sql->exec();

	}

}

//OLD CODE

update_images();
start_background_process();

http_response_code(200);
exit(0);

function check_request() {
	if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
		//Not acceptable
		send_error_message('Only POST accepted',406);
		exit(0);
	}

	if (! isset($_POST['images']) || ! is_array($_POST['images']) || ! isset($_POST['tags']) || ! is_array($_POST['tags'])) {
		send_error_message('Either images or tags is missing or is not an array');
	}
}



function update_images() {

	$update_images_count = 0;
	$update_images = [];

	$delete_tag_statement_count = 0;
	$delete_tag_statements = [];
	$delete_tag_list_args  = [];

	//TODO - need to insert tags
	//     - then retrieve a hash, all tags indexed by label
	//     - Update images
	//     - delete any tag that has no image against it

	$insert_tag_count = 0;
	$insert_tag = [];

	$tags = $_POST['tags'];

	foreach ($_POST['images'] as $image_id => $tag_index_list) {

		if (empty($tag_index_list)) {
			//moved
		} else {

			$delete_tag_statement_count++;

			$delete_tag_list_args[] = $image_id;

			foreach ($tag_index_list as $tag_index) {
				if (! isset($tags[$tag_index])) {
					send_error_message($tag_index . ' missing from tags');
				}

				$delete_tag_list_args[] = $tags[$tag_index]['t'];
			}

			$delete_tag_statements[] = 'it.ImageID = ? AND t.Tag NOT IN (' . implode(',',array_map(function(){return '?';},$tag_index_list)) . ')';
		}

		$update_images_count++;
		$update_images[] = $image_id;

		if ($update_images_count >= 1000) {

			$SQL = 'UPDATE image SET IsDirty = 1 WHERE id IN (?';

			for ($i = 1; $i < $update_images_count; $i++) {
				$SQL .= ',?';
			}
			
			$SQL .= ')';

			if (! db_exec($SQL,$update_images)) {
				send_error_message('Could not update images');
			}

			$update_images = [];
			$update_images_count = 0;
		}

		if ($delete_tag_statement_count > 0) {

		}

	}
}

function start_background_process() {
}

function db_exec($SQL,$args) {



}

