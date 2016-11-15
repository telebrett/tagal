<?php
/**
 * POST image/id
 */

//TODO - mkpath equivalent
require_once('init.lib');

REST_Image::handle();

class REST_Image extends REST {

	protected static $POST_ARGS = array('tags'=>true);

	/**
	 * @param array $tags An array of tag names
	 */
	public function POST($tags) {

		$tag_ids = array();

	}

}
