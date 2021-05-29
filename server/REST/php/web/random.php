<?php
/**
 * Extremely simple endpoint
 * 
 * GET - technically this should be a PUT
 * 
 * Returns the URL's of N random images
 * 
 * This is used for a desktop 
 *
 */
require_once('../lib/init.lib');

class REST_Random extends REST {

	protected static $GET_ARGS = array('number' => false, 'base' => false);

	protected function GET($number, $base) {

		if ($number) {
			$number = (int)$number;
		} else {
			$number = 1;
		}

		header('Content-Type: application/json');

		$sql = new SELECT_SQL($this->db, 'image');
		$sql->col($sql->getAlias() . '.Location');

		if ($base) {
			$sql->where($sql->getAlias() . ".Location LIKE CONCAT(?,'%')", $base);
		}

		//Restrict to images only
		$sql->where($sql->getAlias() . ".Location LIKE '%.JPG'");

		$sql->orderby('RAND()');
		$sql->limit($number);

		$images = array();

		while ($image = $sql->getnext()) {
			$images[] = $image->Location;
		}

		$result = Array();
		$result['images'] = $images;

		print json_encode($result);
		exit(0);

	}

}

REST_Random::handle();
