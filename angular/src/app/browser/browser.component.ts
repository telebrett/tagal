import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';

import { ImagesService } from '../service/images.service';

import { MapComponent }      from '../map/map.component';
import { CarouselComponent } from '../carousel/carousel.component';
import { VarouselComponent } from '../varousel/varousel.component';


/*
 * TODO - Handle window resize
 *      - Is there any reason to have the "Point" tag dropdown?
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
	@ViewChild('exif') domExif: ElementRef;

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
	public mainImageExif;
	public mainciindex;

	public isMapMode = false;
	public showTools = false;

	public selectMode = false;
	public viewingSelected = false;
	public numSelected;

	public mainImageLoading = false;

	private scrollTimeout;

	constructor(private images: ImagesService) { }

	ngOnInit() {
		this.images.loadImages().subscribe(() => {
		 	this.menuTags = this.images.getRemainingTags();
			this.numSelected = this.images.getNumSelected();
			this.selectMode = this.images.storageGet('selectMode');
		});

		this.showTools = this.images.hasAPI();
	}

	public toggleSelectMode() {
		this.selectMode = ! this.selectMode;
		this.images.storageSet('selectMode', this.selectMode);
		//TODO - Should we hide the map when select mode is on?
	}

	public toggleMap() {
		this.isMapMode = ! this.isMapMode;
		this.reset();
	}

	public mainImageLoaded() {
		this.mainImageLoading = false;
		this.mainImageHeight = this.mainImage.height;
		this.mainImageWidth = this.mainImage.width;
	}

	public hideMainImage() {
		this.mainImage = null;
		this.mainImageExif = null;
	}

	public clickThumb(thumb) {

		if (this.selectMode) {
			this.images.toggleSelectImageFromIndex(thumb);
		} else {
			//videos don't trigger a 'load' event
			this.mainImageLoading = ! thumb.v;

			this.viewImageFromIndex(thumb.ciindex);
		}
	}

	public selectAll() {
		//If we are "viewing selected" than "select" actually deselects
		this.setSelectAll(this.viewingSelected ? false : true);
		this.numSelected = this.images.getNumSelected();
	}

	public selectNone() {
		//If we are "viewing selected" than "deselect" actually selects
		this.setSelectAll(this.viewingSelected ? true : false);
		this.numSelected = this.images.getNumSelected();
	}

	private setSelectAll(select: boolean) {
		this.images.setCurrentImagesSelect(select);

		if (this.varousel) {
			this.varousel.setThumbsSelect(select);
		}

		if (this.carousel) {
			this.carousel.setThumbsSelect(select);
		}

		this.numSelected = this.images.getNumSelected();
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

	public viewSelected() {
		this.viewingSelected = true;
		this.images.setCurrentImagesToSelected();
		this.reset();
	}

	public prevMain() {
		this.viewImageFromIndex(this.mainciindex - 1);
	}

	public nextMain() {
		this.viewImageFromIndex(this.mainciindex + 1);
	}

	public toggleExifData() {
		if (this.mainImageExif) {
			this.mainImageExif = false;
		} else {

			this.images.exifdata(this.mainciindex).subscribe((result) => {
				this.mainImageExif = result.pop();

				let removeTags = ['SourceFile', 'Directory', 'FileAccessDate', 'FileInodeChangeDate' ,'FileModifyDate', 'FileName', 'FilePermissions', 'FileNumber', 'SourceFile'];

				for (let tag of removeTags) {
					delete this.mainImageExif[tag];
				}

				this.domExif.nativeElement.style.top = '38px';

				let height = this.domMain.nativeElement.clientHeight;
				height -= 38;
				height -= 150;

				this.domExif.nativeElement.style.height = height + 'px';
			});

		}
	}

	private reset() {

		this.menuTags = this.images.getRemainingTags();
		this.currentTags = this.images.getCurrentTags();

		this.mainImage = this.mainciindex = this.mainImageExif = null;

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

		this.viewingSelected = false;

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
		this.viewingSelected = false;
		this.images.deselectTag(tag.index);
		this.reset();
	}

}
