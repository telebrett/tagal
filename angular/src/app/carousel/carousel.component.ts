import { Component, ViewChild, ElementRef, Input, Output, EventEmitter, OnInit, AfterViewInit } from '@angular/core';
import { ImagesService } from '../service/images.service';

@Component({
  selector: 'app-carousel',
  templateUrl: './carousel.component.html',
  styleUrls: ['./carousel.component.scss']
})

export class CarouselComponent implements OnInit, AfterViewInit { 

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

	public ngAfterViewInit() {
		if (this.mainciindex) {
			//TODO - if we are at the end, we probably want to find the leftmost image
			//       keeps the mainimage in frame
			let left = this.images.getThumbnailLeft(this.mainciindex);
			if (left) {
				this.domWidth.nativeElement.parentElement.scrollLeft = left;
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

	private getWindow() {

			let left = 0;
			if (this.domWidth && this.domWidth.nativeElement) {
				left = Math.floor(this.domWidth.nativeElement.parentElement.scrollLeft);
			}

			this.thumbs = this.images.getThumbnailWindowByLeft(left, 50);

			this.left = Math.round(this.thumbs[0].left);

	}


}
