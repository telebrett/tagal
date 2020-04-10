import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';

import { ImagesService } from '../service/images.service';

@Component({
	selector: 'app-browser',
	templateUrl: './browser.component.html',
	styleUrls: ['./browser.component.scss']
})
export class BrowserComponent implements OnInit {

	@ViewChild('thumbwidth') domThumbWidth: ElementRef;
	@ViewChild('thumbnails') domThumbnails: ElementRef;
	@ViewChild('mainimage') domMainImage: ElementRef;
	@ViewChild('verticalmainimage') domVerticalMainImage: ElementRef;

	@ViewChild('main') domMain: ElementRef;
	@ViewChild('verticalthumbs') domVerticalThumbs: ElementRef;

	public thumbnailWidth = '0px';
	public thumbnailLeft = '0px';

	public thumbnailHeight = 0;
	public thumbnailTop = 0;

	public thumbnailWindowHeight = 0;
	public thumbnailWindowWidth  = 0;

	public menuTags = [];
	public currentTags = [];

	public windowThumbs = [];

	public mainImage;

	public isVerticalView = true;

	public mainImageLoading = false;

	private scrollTimeout;

	constructor(private images: ImagesService) { }

	ngOnInit() {
		this.images.loadImages().subscribe(() => {
		 	this.menuTags = this.images.getRemainingTags();
		});
		
	}

	public mainImageLoaded() {
		this.mainImageLoading = false;
		return false;
	}

	public hideMainImage() {
		this.mainImage = null;
	}

	//TODO - When showing thumbnails for videos, overlay the 'play' icon

	public viewImage(thumb) {
	
		let ref;	
		let height;
		let width;

		this.mainImageLoading = true;

		if (this.isVerticalView) {
			ref = this.domVerticalMainImage.nativeElement;
			height = ref.parentNode.clientHeight
			width = ref.parentNode.clientWidth;
		} else {
			ref = this.domMainImage.nativeElement;
			height = ref.clientHeight;
			width = ref.clientWidth;
		}

		this.mainImage = this.images.getImage(thumb.index, width, height);
	}

	private reset() {

		this.menuTags = this.images.getRemainingTags();
		this.currentTags = this.images.getCurrentTags();

		if (this.isVerticalView) {

			let maxWidth = this.domMain.nativeElement.clientWidth - 30;

			this.thumbnailHeight = this.images.setvblocks(25, 200, maxWidth);

			this.thumbnailWindowWidth = maxWidth; 

			this.domMain.nativeElement.scrollTop = 0;
			this.getWindowThumbs();

		} else {
			let width = this.images.setThumbnailHeights(this.domThumbWidth.nativeElement.parentElement.clientHeight);
			this.thumbnailWidth = width + 'px';
			this.thumbnailLeft = '0px';
			this.domThumbWidth.nativeElement.parentElement.scrollLeft = 0;

			this.getWindowThumbs();
		}


	}

	public thumbReport(event) {
		console.log('Block Top : ' + (event.srcElement.offsetTop + event.srcElement.offsetParent.offsetTop - 5) + ', left' + event.srcElement.offsetLeft);
	}

	public scrollThumbnails(event) {
		//TODO - This could do a performance improvement and ONLY redo the thumbs
		//       if we are close to the edge
		//     - Investigate if moving to doing this in a timeout means that the browser
		//       doesn't 'stall' waiting for this handler to return
		this.getWindowThumbs();
	}

	public getWindowThumbs() {
		if (this.isVerticalView) {

			if (this.scrollTimeout) {
				clearTimeout(this.scrollTimeout);
			}

			this.scrollTimeout = setTimeout(() => {

				let buffer = 3000;

				let top = Math.max(0, Math.floor(this.domMain.nativeElement.scrollTop) - buffer);
				this.windowThumbs = this.images.getThumbnailWindowByTop(top, this.domMain.nativeElement.clientHeight + buffer*2);

				this.thumbnailTop = Math.round(this.windowThumbs[0].tl);

				let last = this.windowThumbs[this.windowThumbs.length-1];
				this.thumbnailWindowHeight = Math.ceil(last.tl + last.height - this.thumbnailTop + 5);

				console.log('Num ' + this.windowThumbs.length + ', top ' + this.thumbnailTop + ', height ' + this.thumbnailWindowHeight + ', for ' + this.domMain.nativeElement.clientHeight);

			}, 300);


		} else {
			let left = Math.floor(this.domThumbWidth.nativeElement.parentElement.scrollLeft);
			this.windowThumbs = this.images.getThumbnailWindowByLeft(left, 50);
			this.thumbnailLeft = Math.round(this.windowThumbs[0].left) + 'px';
		}
	}

	public selectTag(tag: any) {
		this.images.selectTag(tag.index);
		this.reset();
	}

	public deselectTag(tag: any) {
		this.images.deselectTag(tag.index);
		this.reset();
	}


}
