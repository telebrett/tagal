import { Component, ViewChild, ElementRef, Input, Output, EventEmitter, OnInit, AfterViewInit } from '@angular/core';
import { ImagesService } from '../service/images.service';

/*
 * TODO - Right click when in select mode to view the image
 *      - If you click on a heading, at the moment it sets the tags for that heading
 *
 *        This will be tricky though, as we probably want to remember the vertical scroll position as well
 *        maybe add a "CTRL+Z" keypress command
 *
 *        This is probably not required, better to work on a "next day" or "previous day" feature in the tags
 */

@Component({
  selector: 'app-varousel',
  templateUrl: './varousel.component.html',
  styleUrls: ['./varousel.component.scss']
})
export class VarouselComponent implements OnInit, AfterViewInit {
	
	@ViewChild('scroller') domScroller: ElementRef;
	@ViewChild('content') domContent: ElementRef;

	@Input() mainciindex: number;
	@Input() selectMode: boolean;

	@Output() selectedThumb: EventEmitter<any> = new EventEmitter();
	@Output() selectTags: EventEmitter<any> = new EventEmitter();
	@Output() selectImages: EventEmitter<any> = new EventEmitter();
	@Output() contextThumb: EventEmitter<any> = new EventEmitter();

	//This is set to the total height of the content we are scrolling through
	public varouselHeight = 0;

	public windowTop    = 0;
	public windowHeight = 0;
	public windowWidth  = 0;

	public thumbs = [];

	private timeout;

	constructor(private images: ImagesService, private elRef: ElementRef) { }

	public ngOnInit() {
		this.reset();
	}

	public ngAfterViewInit() {
		if (this.mainciindex) {
			let left = this.images.getThumbnailLeft(this.mainciindex);
			if (left) {
				this.domScroller.nativeElement.scrollTop = left;
			}
		}
	}

	public setTagsByHeading(heading) {
		this.selectTags.emit(heading.tagIndexes);
	}

	public selectByHeading(heading,select:boolean) {

		if (heading.tmpAllSelected != undefined) {
			//The user just double clicked, we actually want to do the inverse
			select = ! heading.tmpAllSelected;
			heading.allSelected = ! select;
		}

		this.selectImages.emit({indexes:heading.tagIndexes,select:select});

		//If we change the allSelected in here, it show straight away in the UI
		//which is weird when the user still has there cursor over it
		heading.tmpAllSelected = select;
	}

	public headingMouseleave(heading) {
		if (heading.tmpAllSelected != undefined) {
			heading.allSelected = heading.tmpAllSelected;
			delete heading.tmpAllSelected;
		}
	}

	public editTagsByHeading(heading) {
		console.log('c');
		console.log(heading);
	}

	public setThumbsSelect(select : boolean, affected_images?) {

		for (let thumb of this.thumbs) {

			if (affected_images && affected_images.indexOf(thumb.index) == -1) {
				continue;
			}

			thumb.s = select;
		}
	}
	
	public reset() {

		let maxWidth = this.elRef.nativeElement.offsetParent.clientWidth - 30;

		this.varouselHeight = this.images.setvblocks(25, 200, maxWidth);

		this.windowWidth = maxWidth; 

		if (this.domScroller && this.domScroller.nativeElement) {
			this.domScroller.nativeElement.scrollTop = 0;
		}

		this.getWindow();

	}

	public open(thumb) {
		this.selectedThumb.emit(thumb);
	}

	public debugReport(event) {
		console.log('Block Top : ' + (event.srcElement.offsetTop + event.srcElement.offsetParent.offsetTop - 5) + ', left' + event.srcElement.offsetLeft);
	}

	public scroll() {

			if (this.timeout) {
				clearTimeout(this.timeout);
			}

			this.timeout = setTimeout(() => {
				this.getWindow();
			}, 300);

	}

	private getWindow() {

		let buffer = 3000;

		let top = 0;
		if (this.domScroller && this.domScroller.nativeElement) {
			top = Math.max(0, Math.floor(this.domScroller.nativeElement.scrollTop) - buffer);
		}

		this.thumbs = this.images.getThumbnailWindowByTop(top, this.elRef.nativeElement.offsetParent.clientHeight + buffer*2);

		if (this.thumbs.length) {

			this.windowTop = Math.round(this.thumbs[0].tl);

			let last = this.thumbs[this.thumbs.length-1];
			this.windowHeight = Math.ceil(last.tl + last.height - this.windowTop + 5);
		}

		//console.log('Num ' + this.thumbs.length + ', top ' + this.windowTop + ', height ' + this.windowHeight + ', for ' + this.domContent.nativeElement.clientHeight);

	}

}
