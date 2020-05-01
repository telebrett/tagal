import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';

import { ImagesService } from '../service/images.service';

import { MapComponent }      from '../map/map.component';
import { CarouselComponent } from '../carousel/carousel.component';
import { VarouselComponent } from '../varousel/varousel.component';


/*
 * TODO - Handle window resize
 *
 * BUGS - Doesn't always happen, but if you click quickly through the images using the "next" button, sometimes it doesn't load the final image
 */

@Component({
	selector: 'app-browser',
	templateUrl: './browser.component.html',
	styleUrls: ['./browser.component.scss']
})
export class BrowserComponent implements OnInit {

	//@ViewChild('carousel') domCarousel: ElementRef;
	@ViewChild('map')      map     : MapComponent;
	@ViewChild('carousel') carousel: CarouselComponent;
	@ViewChild('varousel') varousel: VarouselComponent;

	@ViewChild('main') domMain: ElementRef;
	@ViewChild('video') domVideo: ElementRef;

	public carouselWidth = 0;

	public thumbnailHeight = 0;
	public thumbnailTop = 0;

	public thumbnailWindowHeight = 0;
	public thumbnailWindowWidth  = 0;

	public mainImageHeight = 0;
	public mainImageWidth  = 0;

	public menuTags = [];
	public currentTags = [];

	public windowThumbs = [];

	public mainImage;
	public mainciindex;

	public isMapMode = false;

	public mainImageLoading = false;

	private scrollTimeout;

	constructor(private images: ImagesService) { }

	ngOnInit() {
		this.images.loadImages().subscribe(() => {
		 	this.menuTags = this.images.getRemainingTags();
		});
		
	}

	public toggleMap() {
		this.isMapMode = ! this.isMapMode;
		this.mainImage = this.mainciindex = null;
		this.reset();
	}

	public mainImageLoaded() {
		this.mainImageLoading = false;
		this.mainImageHeight = this.mainImage.height;
		this.mainImageWidth = this.mainImage.width;
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

		ref = this.domMain.nativeElement;
		height = ref.clientHeight - 150; //Horizontal thumbnail height
		width = ref.clientWidth;

		this.mainImage = this.images.getImage(index, width, height);

		if (this.mainImage.v) {
			//Videos don't fire an onload
			this.mainImageHeight = this.mainImage.height;
			this.mainImageWidth = this.mainImage.width;

			//Required if a video is already playing
			if (this.domVideo) {
				this.domVideo.nativeElement.load();
			}
		}
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

		if (this.isMapMode && this.map) {
			this.map.reset();
		} else if(this.varousel) {
			this.varousel.reset();
		}

	}

	public selectTagHideMap(event: any) {

		this.isMapMode = false;
		this.selectTag(event.tag, event.imageIndex);

	}

	public selectTag(tag: any, imageIndex?: number) {

		this.mainImage = null;
		if (tag.index !== undefined) {
			this.images.selectTag(tag.index);
		} else {
			this.images.selectTag(tag);
		}
		this.reset();

		if (imageIndex) {

			let ciindex = this.images.getCurrentImageIndex(imageIndex);
			if (ciindex !== false) {
				this.viewImageFromIndex(ciindex);
			}

		}

	}

	public deselectTag(tag: any) {
		this.mainImage = null;
		this.images.deselectTag(tag.index);
		this.reset();
	}

}
