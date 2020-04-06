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

	private scrollTimeout;

	constructor(private images: ImagesService) { }

	ngOnInit() {
		this.images.loadImages().subscribe(() => {
		 	this.menuTags = this.images.getRemainingTags();
		});
		
	}

	//TODO - When showing thumbnails for videos, overlay the 'play' icon

	public viewImage(thumb) {

		let ref = this.domMainImage.nativeElement;

		this.mainImage = this.images.getImage(thumb.index, ref.clientWidth, ref.clientHeight);
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

				let top = Math.floor(this.domMain.nativeElement.scrollTop);

				this.windowThumbs = this.images.getThumbnailWindowByTop(top, this.domMain.nativeElement.clientHeight);

				//var l = 'HEADING';
				//if (this.windowThumbs[0].src) {
				//	l = 'IMAGE';
				//}
				//console.log(top + ':' + this.windowThumbs[0].tl + ' -> ' + (top - this.windowThumbs[0].tl) + ' : ' + l);

				this.thumbnailTop = Math.round(this.windowThumbs[0].tl);
				//this.thumbnailWindowHeight = 400;

				let last = this.windowThumbs[this.windowThumbs.length-1];

				//console.log('Top to ' + this.windowThumbs[0].tl);
				//console.log('Height to ' + (last.tl + last.height - this.windowThumbs[0].tl));

				this.thumbnailWindowHeight = (Math.ceil(last.tl + last.height - this.thumbnailTop));
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
