import { Component, ViewChild, ElementRef, Input, Output, EventEmitter, OnInit, AfterViewInit } from '@angular/core';
import { ImagesService } from '../service/images.service';

@Component({
  selector: 'app-varousel',
  templateUrl: './varousel.component.html',
  styleUrls: ['./varousel.component.scss']
})
export class VarouselComponent implements OnInit, AfterViewInit {
	
	@ViewChild('scroller') domScroller: ElementRef;
	@ViewChild('content') domContent: ElementRef;

	@Input() mainciindex: number;
	@Output() selectedThumb: EventEmitter<any> = new EventEmitter();

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
