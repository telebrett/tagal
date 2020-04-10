<?php
/**
 * GET preview/id
 */

require_once('../lib/init.lib');

class REST_Preview extends REST {

	static $URL_MATCH = array('GET'=>'#/preview/(\d+)/(\d+)/(\d+)$#');

	private $width;
	private $height;
	private $image;

	/**
	 * Returns the resized image
	 */
	public function GET($id,$width,$height) {

		$this->width = $width;
		$this->height = $height;

		$sql = new SELECT_SQL($this->db,'image');
		$sql->col($sql->getAlias() . '.*');
		$sql->where($sql->getAlias() . '.id = ?',$id);

		$this->image = $sql->get();

		if (! $this->image) {
			self::send_error_message(FALSE,404);
		}

		if ($this->image->IsVideo) {
			//ImageMagick tries valiantly, and takes ... forever
			http_response_code(405);
			print "Cannot preview videos\n";
			exit(0);
		}


		$this->buildPreview();
		$this->sendPreview();

	}

	private function getPreviewFile() {
		return '/tmp/tagal-preview-' . $this->image->id . '-' . $this->width . '-' . $this->height;
	}

	private function sendPreview() {
		header('Content-type: image/jpeg');
		print file_get_contents($this->getPreviewFile());
		exit(0);
	}

	private function buildPreview() {

		$preview_file = $this->getPreviewFile();
		
		if (file_exists($preview_file)) {
			return;
		}

		$fullpath = $this->config('images','basedir') . $this->image->Location;

		if (! file_exists($fullpath)) {
			self::die_error_message("$fullpath does not exist");
		}

		$use_imagick = TRUE;
		
		if ($use_imagick) {
			//This takes about twice as long, but the results are significantly better
			$image = new Imagick($fullpath);
			$image->resizeImage($this->width,$this->height,imagick::FILTER_LANCZOS,1);
			$image->writeImage($this->getPreviewFile());
		} else {
			$image = imagecreatefromjpeg($fullpath);
			$resize = imagecreatetruecolor($this->width,$this->height);
			imagecopyresized($resize,$image,0,0,0,0,$this->width,$this->height,$this->image->Width,$this->image->Height);
			imagejpeg($resize,$this->getPreviewFile());
		}
	}

}

REST_Preview::handle();
