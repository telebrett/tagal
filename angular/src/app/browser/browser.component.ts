import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { FormGroup, FormControl } from '@angular/forms';
import { Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';

import { ImagesService } from '../service/images.service';

import { MapComponent }      from '../map/map.component';
import { CarouselComponent } from '../carousel/carousel.component';
import { VarouselComponent } from '../varousel/varousel.component';


/*
 * TODO - Handle window resize
 *      - Is there any reason to have the "Point" tag dropdown?
 *      - Selection tools. I'm not happy with how the "select all" / "select none" inverts when in "view selected"
 *      - "View selected" - this should toggle it's label, and also when "viewing the selected", it should grey
 *        out the selected tags at the top, as that's not what is in the current view
 *      - When clicking on a year, show the months as sub menus, and inside them, show the days as sub sub menus
 *        OR have a "tag search" box, if you type a date eg "2019/12/28" it would select "2019" "december" and "28"
 *        maybe the tag search box should have a calenadar icon on the right, so you get a popup calendar
 *        to choose from
 *      - Vertical view mode - clicking on the vblock header "3rd August, 2019" should set the tags for that day
 *        Also add a "select all" link
 *      - Editing image tags
 *        - Create a new/edit tag form component. Provide a tool to geocode the tag
 *        - Clicking on edit tag should also show a "apply to all selected images" checkbox
 *        - Remove tag from images
 *        - Delete tag completely
 *        - If the following series of events occurs
 *          1. Click on tags to show a set eg "2019", "June", "10th"
 *          2. Click on edit tags
 *
 *          then we are editing tags that apply to the current view
 *
 *          BUT if we do
 *          1. Click on tags to show a set eg "2019", "June", "10th"
 *          2. Select one or more images
 *          3. Click on edit tags
 *
 *          THEN at that point, "edit tags" should ONLY apply to those images I just selected
 *
 *          POSSIBLY with the visible images behind the modal ONLY showing the images that the tags will affect
 *
 *
 * BUGS - Doesn't always happen, but if you click quickly through the images using the "next" button, sometimes it doesn't load the final image
 */

@Component({
	selector: 'app-browser',
	templateUrl: './browser.component.html',
	styleUrls: ['./browser.component.scss'],
})
export class BrowserComponent implements OnInit {

	//@ViewChild('carousel') domCarousel: ElementRef;
	@ViewChild('map')      map     : MapComponent;
	@ViewChild('carousel') carousel: CarouselComponent;
	@ViewChild('varousel') varousel: VarouselComponent;

	@ViewChild('main') domMain: ElementRef;
	@ViewChild('video') domVideo: ElementRef;
	@ViewChild('exif') domExif: ElementRef;

	@ViewChild('edittags') domModalEditTags: ElementRef;

	searchTag = (text$: Observable<string>) => 
		text$.pipe(
			debounceTime(200),
			distinctUntilChanged(),
			map(term => {
				//TODO - Pass in the tags that the selected set all have already
				//       so they can be excluded from the results
				let tags = this.images.searchTag(term);
				for (let tag of tags) {
					if (term.toLowerCase() == tag.label.toLowerCase()) {
						return tags;
					}
				}

				tags.unshift({
					index   : -1,
					label   : term,
					applyAll: true,
					delete  : false
				});
				return tags;

			})
	);

	tagFormatter = (tag: {label: string}) => tag.label;

	public tagModel: any;

	public imageTags = new FormGroup({
		addTagName: new FormControl('')
	});

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

	public currentEditTags = [];
	public currentImagesLength = 0;

	private scrollTimeout;

	constructor(private images: ImagesService, private modalService: NgbModal) { }

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

		//TODO - If API available, then show the tags that apply to this image
	}

	public hideMainImage() {
		this.mainImage = null;
		this.mainImageExif = null;
	}

	public editTags() {

		this.currentEditTags = [];
		this.currentImagesLength = this.images.getCurrentImagesLength();

		for (let tag of this.images.getCurrentImagesTags()) {

			tag.applyAll = tag.countInCurrent == this.currentImagesLength;
			tag.delete = false;

			this.currentEditTags.push(tag);
		}

		//TODO - Set focus on the typeahead

		this.modalService.open(this.domModalEditTags, { centered: true});
	}

	public clickThumb(thumb) {

		if (this.selectMode) {
			this.images.toggleSelectImageFromIndex(thumb);
			this.numSelected = this.images.getNumSelected();
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

	public toggleTagAll(tag) {
		if (tag.countInCurrent == this.currentImagesLength) {
			return;
		}
		tag.applyAll = ! tag.applyAll;
	}

	public toggleUnsetTag(tag){ 

		if (tag.index == -1 || tag.countInCurrent === undefined) {

			for (let [index, searchTag] of this.currentEditTags.entries()) {
				if (searchTag == tag) {
					this.currentEditTags.splice(index, 1);
				}
			}

			return;

		}

		tag.delete = ! tag.delete;
		//this.currentEditTags = this.images.unsetTagAgainstCurrentImages(index);
	}

	public addTagFromSearch(event) {
		console.log(event);

		this.tagModel = null;
		event.preventDefault();

		if (event.item.index == -1) {
			event.item.countInCurrent = this.currentImagesLength;
		}

		this.currentEditTags.push(event.item);
	}

	public applyTagChanges() {
		//TODO - probably need to, you know, do stuff
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
