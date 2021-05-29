import { Component, ViewChild, ElementRef, Input, Output, EventEmitter, OnInit, AfterViewInit, OnChanges } from '@angular/core';
import { ImagesService } from '../service/images.service';

//TODO - Bug when viewing a main image, if this has multiple images to the left, and the main image
//       is the second visible thumbnail, clicking on the first thumbnail causes
//       the carousel to slide so that the just clicked on thumbnail
//       is now at the far right

@Component({
  selector: 'app-carousel',
  templateUrl: './carousel.component.html',
  styleUrls: ['./carousel.component.scss']
})

export class CarouselComponent implements OnInit, AfterViewInit, OnChanges { 

	@ViewChild('width') domWidth: ElementRef;

	@Input() mainciindex: number;
	@Output() selectedThumb: EventEmitter<any> = new EventEmitter();

	public left   = 0;
	public thumbsWidth  = 0;
	public thumbs = [];

	private timeout;

	constructor(private images: ImagesService) { }

	public ngOnInit() {
		//We can't read from the dom, as the dom node doesn't 49exist yet
		
		this.thumbsWidth = this.images.setThumbnailHeights(150);
		this.getWindow();
	}

	public ngOnChanges() {
		this.ngAfterViewInit();
	}

	public ngAfterViewInit() {
		if (this.mainciindex && this.domWidth) {
			let left = this.images.getThumbnailLeft(this.mainciindex);
			if (left) {

				//Work out if this thumbnail is visible on the screen
				let width = this.images.getThumbnailWidth(this.mainciindex);

				let dom = this.domWidth.nativeElement.parentElement;

				let minLeft = dom.scrollLeft;
				let maxLeft = minLeft + dom.clientWidth - width;

				if (left < minLeft || left > maxLeft) {
					this.domWidth.nativeElement.parentElement.scrollLeft = left + width - dom.clientWidth;
				}
			}
		}
	}

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
		this.domWidth.nativeElement.parentElement.scrollLeft = 0;
		this.getWindow();
	}

	public setThumbsSelect(select : boolean, affected_images?) {
		for (let thumb of this.thumbs) {

			if (affected_images && affected_images.indexOf(thumb.index) == -1) {
				continue;
			}

			thumb.s = select;
		}
	}

	private getWindow() {

			let left = 0;
			if (this.domWidth && this.domWidth.nativeElement) {
				left = Math.floor(this.domWidth.nativeElement.parentElement.scrollLeft);
			}

			this.thumbs = this.images.getThumbnailWindowByLeft(left, 50);

			this.left = Math.round(this.thumbs[0].left);

	}


}
