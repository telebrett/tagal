<?php
/**
 * PUT rotateimage/id/(cw|ccw)
 */

require_once('../lib/init.lib');

class REST_RotateImage extends REST {

	static $URL_MATCH = array('PUT'=>'#/rotateimage/(\d+)/(cw|ccw)$#');

	/**
	 * @param int $id
	 * @param string $direction Either 'cw' or 'ccw'
	 */
	public function PUT($id, $direction) {

		list($exit_code, $stdout, $stderr) = $this->invokeperl('rotate.pl', ['-id', $id, '-d', $direction, '-c']);

		if ($exit_code != 0) {

			if ($exit_code == 2) {
				$stderr .= " Run rotate.pl -i {$id} -d {$direction} on the tagal server manually";
			}

			return self::send_error_message($stderr);
		}
	
	}

}

REST_RotateImage::handle();
