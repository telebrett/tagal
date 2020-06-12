import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { FormGroup, FormControl } from '@angular/forms';
import { Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';

import { ImagesService } from '../service/images.service';

import { MapComponent }      from '../map/map.component';
import { CarouselComponent } from '../carousel/carousel.component';
import { VarouselComponent } from '../varousel/varousel.component';


/*
 * TODO 
 *      - Rotate buttons
 *        If viewing a main image, then rotate only that image
 *        Otherwise, rotate the entire set AFTER confirming. The confirmation should also have the number of images that are going to be rotated
 *
 *        One thing we could also do is a "rotate tool", so you click the tool, and any thumbnail you click on is rotated?
 *
 *      - Handle window resize
 *      - Add a "clear changes" option for admin mode
 *      - Add a "Show diffs" option for admin mode
 *      - Is there any reason to have the "Point" tag dropdown?
 *      - When clicking on a year, show the months as sub menus, and inside them, show the days as sub sub menus
 *        OR have a "tag search" box, if you type a date eg "2019/12/28" it would select "2019" "december" and "28"
 *        maybe the tag search box should have a calenadar icon on the right, so you get a popup calendar
 *        to choose from
 *      - If the following series of events occurs
 *        1. Click on tags to show a set eg "2019", "June", "10th"
 *        2. Click on edit tags
 *
 *        then we are editing tags that apply to the current view
 *
 *        BUT if we do
 *        1. Click on tags to show a set eg "2019", "June", "10th"
 *        2. Select one or more images
 *        3. Click on edit tags
 *
 *        THEN at that point, "edit tags" should ONLY apply to those images I just selected
 *
 *        POSSIBLY with the visible images behind the modal ONLY showing the images that the tags will affect
 *      - When viewing the main image
 *        - if you click on "Edit tags" then it only applies to that ONE image
 *        - Show main info without having to click on the Info icon, info to show
 *          - Date
 *          - Camera
 *          - Tags (with clickable links to set that tag)
 *      - In the edit tags modal, show an indicator of how many images this will apply to
 *      - Editing image tags
 *        - Create a new/edit tag form component. Provide a tool to geocode the tag
 *        - Clicking on edit tag should also show a "apply to all selected images" checkbox
 *        - Remove tag from images
 *        - Delete tag completely
 *      - When viewing a specific image, show the remaining "manual tags"
 *      - Year / Month / Day tags. When in the "current tags" list, do something to advance, go back from the current datepart combination
 *        eg if the only date part is the year 2019 selected, advance goes to 2020
 *        if the only date parts are 2019, January, advance goes to february 2019
 *        if a year, month and day are selected then advance one day (need to know the number of days in that month - watch out for leap years)
 *      - Add a "date span" indicator, if I click on "camping" it should show that images go from "Mar 2012 -> Dec 2019"
 *      - Edit tags window, clicking on the text for a tag should allow the tag to be modified, watch out for changing to a tag that already exists (that isn't
 *        the current tag obviously)
 *      - Add a dedupe tags feature - once we have labels for geocoded tags, make sure when merging that a warning is issued if one has a geocode and you are about
 *        to delete that "manual" tag (which is actually the label for the geocode)
 *        also, warn if the labels are both geocode points for different points
 *      - When viewing a full size image, the carousel should have an indicator around the thumbnail that is currently being shown
 *      - Provide a full screen mode for the image, video already has this by default
 *     
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
				let tags = this.images.searchTag(term, this.currentEditTags);
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

	public activeModal: NgbActiveModal;

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
	public currentAllSelected;
	public tmpAllSelected;

	public mainImageLoading = false;

	public currentEditTags = [];
	public currentImagesLength = 0;

	private scrollTimeout;

	constructor(private images: ImagesService, private modalService: NgbModal) { }

	ngOnInit() {
		this.images.loadImages().subscribe(() => {
		 	this.menuTags = this.images.getRemainingTags();
			this.numSelected = this.images.getNumSelected();
			this.currentAllSelected = this.images.getCurrentImagesAllSelected();
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

		this.activeModal = this.modalService.open(this.domModalEditTags, { centered: true});
	}

	/**
	 * Bulk select images based on tags
	 */
	public selectImages(tag_indexes, select: boolean) {
		if (! this.selectMode) {
			console.error('Not in select mode');
			return;
		}

		let affected = this.images.selectImages(tag_indexes, select);
		this.numSelected = this.images.getNumSelected();
		this.currentAllSelected = this.images.getCurrentImagesAllSelected();

		if (this.varousel) {
			this.varousel.setThumbsSelect(select, affected);
		}

		if (this.carousel) {
			this.carousel.setThumbsSelect(select, affected);
		}


	}

	public clickThumb(thumb) {

		if (this.selectMode) {
			this.images.toggleSelectImageFromIndex(thumb);
			this.numSelected = this.images.getNumSelected();
			this.currentAllSelected = this.images.getCurrentImagesAllSelected();
		} else {
			//videos don't trigger a 'load' event
			this.mainImageLoading = ! thumb.v;

			this.viewImageFromIndex(thumb.ciindex);
		}
	}

	public selectAll() {
		//If we are "viewing selected" than "select" actually deselects
		this.setSelectAll(true);
		this.numSelected = this.images.getNumSelected();
	}

	public changeSelectAllLeave() {
		this.currentAllSelected = this.images.getCurrentImagesAllSelected();
	}

	public selectNone() {
		//If we are "viewing selected" than "deselect" actually selects
		this.setSelectAll(false);
		this.numSelected = this.images.getNumSelected();
	}

	private setSelectAll(select: boolean) {

		if (this.tmpAllSelected != undefined) {
			//The user just double clicked, so we actually want to do the inverse
			select = ! this.tmpAllSelected;
			this.currentAllSelected = ! select;
		}

		this.images.setCurrentImagesSelect(select);

		this.tmpAllSelected = select;

		if (this.varousel) {
			this.varousel.setThumbsSelect(select);
		}

		if (this.carousel) {
			this.carousel.setThumbsSelect(select);
		}

		this.numSelected = this.images.getNumSelected();
		//this.currentAllSelected = this.images.getCurrentImagesAllSelected();
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

	public toggleViewSelected() {
		this.viewingSelected = ! this.viewingSelected;

		if (this.viewingSelected) {
			this.images.setCurrentImagesToSelected();
		} else {
			this.images.setCurrentImagesToTags();
		}

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
	}

	public addTagFromSearch(event) {
		this.tagModel = null;
		event.preventDefault();

		event.item.applyAll = true;

		this.currentEditTags.push(event.item);
	}

	public applyTagChanges() {

		let add_tags = [];
		let del_tags = [];

		for (let editTag of this.currentEditTags) {

			if (editTag.delete) {
				del_tags.push(editTag.label);
			} else {

				if (
					editTag.index != -1
					&& (
						! editTag.applyAll
						|| editTag.countInCurrent == this.currentImagesLength 
					)
				) {
					//This is an existing tag that is not applying to all and the user didn't want to make it apply to all or it's an existing tag that was already applying to all
					continue;
				}

				add_tags.push(editTag.label);

			}

		}

		if (del_tags.length > 0 || add_tags.length > 0) {
			this.images.applyTagChanges(add_tags, del_tags).subscribe((result) => {

				if (result) {

					this.activeModal.close();
					this.activeModal = undefined;

					//TODO - reset the tags - but this is complicated
					//       IF this.viewingSelected then we possibly don't want to change the
					//       tags
					//
					//       But there are definitly problems when the user goes back to "view tags"
					//       where the new tags don't appear and the deleted tags may sometimes appear

					if (! this.viewingSelected) {
						this.images.setCurrentTagsFromCurrentImages();
					}

					this.reset();
				}
			});

		} else {
			this.activeModal.close();
			this.activeModal = undefined;
		}

	}

	private reset() {

		this.menuTags = this.images.getRemainingTags();
		this.currentTags = this.images.getCurrentTags();

		this.numSelected = this.images.getNumSelected();
		this.currentAllSelected = this.images.getCurrentImagesAllSelected();

		this.mainImage = this.mainciindex = this.mainImageExif = null;

		if (this.isMapMode && this.map) {
			this.map.reset();
		} else if(this.varousel) {
			this.varousel.reset();
		}

	}

	public rotate(clockwise: boolean) {

		if (! this.mainImage) {
			alert('TODO - Only supports rotating when viewing an image');
			return;
		}

		this.images.rotate(this.mainImage, clockwise).subscribe((result) => {
			if (result) {
				if (this.mainImage) {
					this.viewImageFromIndex(this.mainciindex);
				}

				if (this.carousel) {
					this.carousel.ngOnInit();
				}

				if (this.varousel) {
					this.varousel.reset();
				}

			}
		});

	}

	public openContextThumb(event, thumb) {
		//TODO - This needs to show the context menu
		console.log(event);
		console.log(thumb);
	}

	public selectTagHideMap(event: any) {
		this.isMapMode = false;
		this.selectTag(event.tag, event.imageIndex);
	}

	public selectTags(tags) {

		this.viewingSelected = false;

		this.mainImage = null;

		this.images.selectTags(tags);
		this.reset();
		
	}

	public selectTag(tag: any, imageIndex?: number) {

		let tags = [] ;

		if (tag.index !== undefined) {
			tags.push(tag.index);
		} else {
			tags.push(tag);
		}
		this.selectTags(tags);

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
