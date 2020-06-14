<?php
/**
 * GET preview/id
 */

require_once('../lib/init.lib');

class REST_Diffs extends REST {

	/**
	 * Returns the differences between the database.json (which represents what is inside the actual image
	 * files) and the database which contains changes
	 */
	public function GET() {

		$images = array();
		
		$primary_sql = $this->primary_sql();

		while ($row = $primary_sql->getnext()) {

			$images[$row->id]['r']  = $row->Width / $row->Height;

			//Last mod time
			$fullpath = $this->config('images','basedir') . $row->Location;
			$stat = stat($fullpath);
			$images[$row->id]['cb'] = $stat[9];

		}

		$add_tags_sql = $this->get_tags_sql(FALSE);
		while ($row = $add_tags_sql->getnext()) {
			$images[$row->ImageID]['add'][] = $row->Tag;
		}

		$del_tags_sql = $this->get_tags_sql(TRUE);
		while ($row = $del_tags_sql->getnext()) {
			$images[$row->ImageID]['del'][] = $row->Tag;
		}

		header('Content-Type: application/json');
		print json_encode(array('diffs' => $images));
		exit();

	}

	private function primary_sql() {
		
		$sql = new SELECT_SQL($this->db, 'image');
		$sql->col("{$sql->getAlias()}.id");
		$sql->col("{$sql->getAlias()}.Location");
		$sql->col("{$sql->getAlias()}.Width");
		$sql->col("{$sql->getAlias()}.Height");
		$sql->where("{$sql->getAlias()}.IsDiffFromPrimaryJSONDB = 1");

		return $sql;
	}

	private function get_tags_sql($deleted) {
		$JA = SQL::JA;

		$sql = new SELECT_SQL($this->db, 'image');
		$sql->col("{$sql->getAlias()}.id AS ImageID");
		if ($deleted ) {
			//There shouldn't be any records that are marked as IsDeleted AND IsWritten
			$it_alias = $sql->join('image_tag', "{$sql->getAlias()}.id = {$JA}.ImageID AND {$JA}.IsDeleted = 1");
		} else {
			$it_alias = $sql->join('image_tag', "{$sql->getAlias()}.id = {$JA}.ImageID AND {$JA}.IsWritten = 0");
		}

		$tag_alias = $sql->join('tag', "{$it_alias}.TagID = {$JA}.id");
		$sql->col("{$tag_alias}.Tag");

		return $sql;

	}

}

REST_Diffs::handle();
