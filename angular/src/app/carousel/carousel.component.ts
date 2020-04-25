import { Component, ViewChild, ElementRef, Output, EventEmitter } from '@angular/core';
import { ImagesService } from '../service/images.service';

@Component({
  selector: 'app-carousel',
  templateUrl: './carousel.component.html',
  styleUrls: ['./carousel.component.scss']
})

export class CarouselComponent { 

	@ViewChild('width') domWidth: ElementRef;

	@Output() selectedThumb: EventEmitter<any> = new EventEmitter();

	public left   = 0;
	public thumbsWidth  = 0;
	public thumbs = [];

	private timeout;

	constructor(private images: ImagesService) { }

	public scroll(event) {

		if (this.timeout) {
			clearTimeout(this.timeout);
		}

		this.timeout = setTimeout(() => {

			this.timeout = null;
			this.getWindow();
			
		}, 300);
	}

	public open(thumb) {
		this.selectedThumb.emit(thumb);
	}

	public reset() {

		this.thumbsWidth = this.images.setThumbnailHeights(this.domWidth.nativeElement.parentElement.clientHeight);
		this.domWidth.nativeElement.parentElement.scrollLeft = 0;
		this.getWindow();
	}

	private getWindow() {

			let left = Math.floor(this.domWidth.nativeElement.parentElement.scrollLeft);

			this.thumbs = this.images.getThumbnailWindowByLeft(left, 50);

			this.left = Math.round(this.thumbs[0].left);

	}


}
