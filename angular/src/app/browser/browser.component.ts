import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';

import { ImagesService } from '../service/images.service';

import { MapComponent } from '../map/map.component';

import { CarouselComponent } from '../carousel/carousel.component';
import { VarouselComponent } from '../varousel/varousel.component';

/*
 * TODO - Move the position of the previous, next buttons - they jump around
 *      - Don't change the width of the current main image until after it loads
 *      - When in vertical list mode and you click on an image, show the main image with
 *        the horizontal thumbnails instead of taking up the full screen
 *      - Change the lat/lng points to normal tags with metadata
 */

@Component({
	selector: 'app-browser',
	templateUrl: './browser.component.html',
	styleUrls: ['./browser.component.scss']
})
export class BrowserComponent implements OnInit {

	//@ViewChild('carousel') domCarousel: ElementRef;
	@ViewChild('carousel') carousel: CarouselComponent;
	@ViewChild('varousel') varousel: VarouselComponent;

	@ViewChild('mainimage') domMainImage: ElementRef;
	@ViewChild('verticalmainimage') domVerticalMainImage: ElementRef;

	@ViewChild('main') domMain: ElementRef;
	@ViewChild('verticalthumbs') domVerticalThumbs: ElementRef;

	public carouselWidth = 0;

	public thumbnailHeight = 0;
	public thumbnailTop = 0;

	public thumbnailWindowHeight = 0;
	public thumbnailWindowWidth  = 0;

	public menuTags = [];
	public currentTags = [];

	public windowThumbs = [];

	public mainImage;
	private mainciindex;

	public isVerticalView = true;
	public isMapMode = false;

	public mainImageLoading = false;

	private scrollTimeout;

	public currentPoints;

	constructor(private images: ImagesService) { }

	ngOnInit() {
		this.images.loadImages().subscribe(() => {
		 	this.menuTags = this.images.getRemainingTags();
		});
		
	}

	public toggleMap() {
		this.isMapMode = ! this.isMapMode;
		this.reset();
	}

	public mainImageLoaded() {
		this.mainImageLoading = false;
		return false;
	}

	public hideMainImage() {
		this.mainImage = null;
	}

	public viewImageFromThumb(thumb) {
	
		//videos don't trigger a 'load' event
		this.mainImageLoading = ! thumb.v;

		this.viewImageFromIndex(thumb.ciindex);
	}
	
	public viewImageFromIndex(ciindex: number) {

		let index = this.images.getImageIndex(ciindex);

		if (index == false) {
			return false;
		}

		//The browsers list of thumbnails is incomplete, the ciindex is the index of the thumb from the images service
		this.mainciindex = ciindex;

		let ref;	
		let height;
		let width;

		if (this.isVerticalView) {
			ref = this.domVerticalMainImage.nativeElement;
			height = ref.parentNode.clientHeight
			width = ref.parentNode.clientWidth;
			ref.style.marginTop = this.domMain.nativeElement.scrollTop + 'px';
		} else {
			ref = this.domMainImage.nativeElement;
			height = ref.clientHeight;
			width = ref.clientWidth;
		}

		this.mainImage = this.images.getImage(index, width, height);
	}

	public prevMain() {
		this.viewImageFromIndex(this.mainciindex - 1);
	}

	public nextMain() {
		this.viewImageFromIndex(this.mainciindex + 1);
	}

	public download() {
	}

	//public download() : Observable<any> {
	//	return this.images.download(this.mainImage.src);
	//}

	private reset() {

		this.menuTags = this.images.getRemainingTags();
		this.currentTags = this.images.getCurrentTags();

		if (this.isMapMode) {
			this.currentPoints = this.images.getCurrentPoints();
		} else if (this.isVerticalView) {
			this.varousel.reset();
		} else {
			this.carousel.reset();
		}

	}

	public selectTag(tag: any) {
		this.mainImage = null;
		this.images.selectTag(tag.index);
		this.reset();
	}

	public deselectTag(tag: any) {
		this.mainImage = null;
		this.images.deselectTag(tag.index);
		this.reset();
	}

}
