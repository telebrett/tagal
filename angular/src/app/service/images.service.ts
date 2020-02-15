import { Injectable } from '@angular/core';
import {Observable} from "rxjs";
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

import {HttpClient, HttpHeaders} from '@angular/common/http';


@Injectable({
  providedIn: 'root'
})
export class ImagesService {

	/**
	 * Each element is a hash with keys
	 * string  p  Image path, relative to /pictures
	 * int     o  sort order of the image
	 * string  f  Image filename eg 'foo.jpg'
	 * float   r  The ratio of height to width TODO width to height?
	 * object  t  hash of tag indexes - the tags that have possibly been added / removed
	 * object  ot hash of tag indexes - this is the list of tags that the image has on disk
	 * bool    s  True if the image is currently marked as selected
	 *
	 * The following keys are set by setThumbnails and will change - eg tl
	 * int tw Thumbnail width
	 * int th Thumbnail height
	 * int tl Thumbnail left position
	 */

	private images = [];

	/**
	 * Each element is a hash with keys
	 * string t  The tag name
	 * string l  The label name, optional
	 * object m  Metadata for the tag, note key only exists if there is metadata
	 * object i  keys are the image indexes, value is true
	 */
	private tags   = [];

	/**
	 * keys are the tags, values is the index for the tag
	 */
	private tagIndex = {};

	private monthNames = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ];

	private dirty;
	private currentTags = [];
	private remainingTags = [];

	private currentImages = [];
	private thumbnailAvgWidth;

  	constructor(private http: HttpClient) { 
  	}

	public loadImages() : Observable<boolean> {
		return this.http.get('/assets/database.json').pipe(map((data:any) => {

			for (var i in data.images) {

				let image = data.images[i];

				let path = image[0].match(/^(.*)\/(.*)$/);

				this.images[i] = {p:path[1],f:path[2],r:image[1],t:{},ot:{},o:image[2]};
			}

			for (var i in data.tags) {
				this.addTag(i, data.tags[i], data.tagmetadata[i], true);
			}

			this.setRemainingTags();

			return true;
		}));
	}

	public getRemainingTags() {

		let showMonth = false;
		let showDay   = false;
        
		//Only show the month tags if a year has been selected, only show the day tag if a year and month has been selected
		for (let i = 0; i < this.currentTags.length; i++) {
			let tag = this.tags[this.currentTags[i]];
        
			if (tag.m && tag.m.datetype) {
				switch (tag.m.datetype) {
					case 'year':
						showMonth = true;
						break;
					case 'month':
						showDay = true;
						break;
				}
			}
		}
        
		let unsorted = [];
        
		for (let i = 0; i < this.remainingTags.length; i++) {
			let tag = this.tags[this.remainingTags[i]];
        
			if (tag.m && tag.m.datetype) {
				//if (realTagsOnly) {
				//	continue;
				//}
				switch (tag.m.datetype) {
					case 'month':
						if (! showMonth) {
							continue;
						}
						break;
					case 'day':
						if (! showDay) {
							continue;
						}
						break;
				}
			}
        
			unsorted.push(tag);
		}
        
		let sorted = unsorted.sort(this.sortTags);
        
		let o = [];
        
		for (let i = 0; i < sorted.length; i++) {
			o.push(this.niceTag(sorted[i]));
		}
		return o;
		
	}

	public getCurrentTags() {

		let tags = [];

		for (let i = 0; i < this.currentTags.length; i++) {
			tags.push(this.niceTag(this.tags[this.currentTags[i]]));
		}

		return tags;

	}

	public getThumbnailWindowByLeft(left: number, count: number) {

		let start_index = this.calcStartIndex(left);

		return this.getThumbnailWindow(start_index, count);

	}

	public getThumbnailsByPage(pageOffset: number,count: number) {

		let start_index = count * pageOffset;

		return this.getThumbnailWindow(start_index, count);

	}

	private getThumbnailWindow(start_index,count) {

		let win = [];

		let end_index   = Math.min(this.currentImages.length,start_index + count);

		var promises = [];

		for (let i = start_index; i < end_index; i++) {
			var image = this.images[this.currentImages[i]];
			var thumb = {
				width    : Math.round(image.tw),
				height   : Math.round(image.th),
				index    : this.currentImages[i],
				left     : image.tl,
				src      : null
				//TODO - This is for admin mode - not ported yet
				//selected : this.selected[this.currentImages[i]]
			};

			//if (this.s3) {

			//	var s3path = this.rootImageDir + image.p + '/.thumb/' + image.f;

			//	if (this.s3fails[s3path]) {
			//		thumb.src = 'failed.png';
			//		continue;
			//	}

			//	var s3cached = this.s3lru.get(s3path);

			//	//Still flickers, but only the thumbnails that were not already on the screen
			//	if (s3cached) {
			//		thumb.src = s3cached;
			//	} else {
			//		thumb.src   =  'spacer.png';
			//		thumb.s3src = s3path;
			//	}
			//} else {
				thumb.src = environment.imageSource + image.p + '/.thumb/' + image.f;
			//}

			win.push(thumb);
		}
		
		return win;
	}

	private calcStartIndex(left: number) {
		let startindex = 0;
			
		if (left > 0) {

			let search = Math.floor(left / this.thumbnailAvgWidth);

			if (search > 0 ){
				if (search >= this.currentImages.length) {
					//Way too far to the right
					search = this.currentImages.length;
					while (--search > 0) {
						let possible = this.images[this.currentImages[search]];
						let possible_right = possible.tl + possible.tw;

						if (possible.tl <= left && possible_right > left) {
							startindex = search;
							break;
						}
					}
				} else {
					let possible = this.images[this.currentImages[search]];

					let possible_right = possible.tl + possible.tw;

					if (possible.tl <= left && possible_right > left) {
						startindex = search;
					} else {

						if (possible_right > left) {
							//we are to the right of where we want to be, go backwards
							while (--search > 0) {
								possible = this.images[this.currentImages[search]];
								possible_right = possible.tl + possible.tw;

								if (possible.tl <= left && possible_right > left) {
									startindex = search;
									break;
								}
							}
							
						} else {
							while (++search <= this.currentImages.length) {
								possible = this.images[this.currentImages[search]];
								possible_right = possible.tl + possible.tw;

								if (possible.tl <= left && possible_right > left) {
									startindex = search;
									break;
								}
							}
						}
					}
				}
			}
		}

		return startindex;

	}

	public selectTag(index: number) {

		if (this.currentTags.indexOf(index) !== -1) {
			return;
		}

		this.currentTags.push(index);

		if (this.currentTags.length == 1) {
			this.currentImages = Object.keys(this.tags[index].i);
		} else {
			let ts = this.tags[index].i;
			this.currentImages = this.currentImages.filter(function(v){return ts[v] !== undefined});
		}

		this.currentImages.sort((a_index, b_index) => {
			let a_o = this.images[a_index].o;
			let b_o = this.images[b_index].o;

			if (a_o == b_o) {
				return 0;
			} else if(a_o < b_o) {
				return -1;
			} else {
				return 1;
			}

		});

		this.setRemainingTags();
	}

	public deselectTag(index: number) {

		let ct_index = this.currentTags.indexOf(index);

		if (ct_index != -1) {
			this.currentTags.splice(ct_index,1);
		}

		this.currentImages = [];

		if (this.currentTags.length == 0) {
			this.remainingTags = [];
			//values need to be ints so can't use Object.keys
			for (let i = 0; i < this.tags.length; i++) {
				this.remainingTags.push(i);
			}
			return;
		}

		let images;

		for (let i = 0; i < this.currentTags.length; i++) {
			var newimages = {};
			for (let x in this.tags[this.currentTags[i]].i) {
				if (i > 0 && ! images[x]) {
					continue;
				}
				newimages[x] = true;
			}

			images = newimages;
		}

		for (let i in images) {
			this.currentImages.push(parseInt(i));
		}

		this.setRemainingTags();
	}

	public setThumbnailHeights(height: number) {

		let totalWidth = 0;

		this.thumbnailAvgWidth = height * 1.25;

		//TODO - could possible do some performance improvements here, cache the height
		//       and if the same as the last time, just reset the tl property

		for (var i = 0; i < this.currentImages.length; i++) {
			var image = this.images[this.currentImages[i]];

			image.th = height;
			image.tw = Math.ceil(image.r * height);
			image.tl = totalWidth;

			//The 1px is for the right border
			totalWidth += image.tw + 1;
		}

		return totalWidth;
	}

	public getImage(index: number,maxWidth: number,maxHeight: number) {

		let image = this.images[index];

		let fullImage = {
			index : index,
			src : environment.imageSource + image.p + '/' + image.f,
			name : image.f,
			height: null,
			width: null,
			previewSrc: null
		};

		let height_from_maxwidth = Math.ceil((1/image.r) * maxWidth);
		let width_from_maxheight = Math.ceil((image.r * maxHeight));

		if (width_from_maxheight <= maxWidth) {
			//max will be the height
			fullImage.height = maxHeight;
			fullImage.width  = Math.ceil(image.r * maxHeight);
		}else{
			fullImage.width  = maxWidth;
			fullImage.height = height_from_maxwidth;
		}

		//if (this.s3) {
		//	fullImage.src = 'spacer.png';
		//	fullImage.s3src = this.rootImageDir + image.p + '/' + image.f;
		//} else {
		if (environment.api) {
			fullImage.previewSrc = environment.api + 'preview/' + index + '/' + fullImage.width + '/' + fullImage.height; 
		}

		return fullImage;

	}

	private niceTag(tag) {

		var o = {
			index:this.tagIndex[tag.t],
			label:tag.l === undefined ? tag.t : tag.l,
		};

		if (tag.m && tag.m.datetype) {
			switch (tag.m.datetype) {
				case 'year':
					o['type'] = 'y';
					break;
				case 'month':
					o['type'] = 'm';
					break;
				case 'day':
					o['type'] = 'd';
					break;
			}
		}

		return o;
	}

	//Sets the remainingTags from the tags from the _currentImages
	//but not already selected
	private setRemainingTags() {

		this.remainingTags = new Array();

		if (this.currentTags.length == 0) {
			this.remainingTags = Object.keys(this.tags);
		} else {

			let image_tags = {};

			for (let i = 0; i < this.currentImages.length; i++) {
				for (let tag_index in this.images[this.currentImages[i]].t) {
					image_tags[tag_index] = true;
				}
			}


			for (let tag_index in image_tags) {
				if (this.currentTags.indexOf(parseInt(tag_index,10)) == -1) {
					this.remainingTags.push(tag_index);
				}
			}
		}
	}

	/**
	 * object a See tag definition above
	 * object b see tag definition above
	 */
	private sortTags(a,b) {
		if (a.m && a.m.datetype && (! b.m || ! b.m.datetype)) {
			//a is a "year", "month" or "day" marker
			return -1;
		} else if (b.m && b.m.datetype && (! a.m || ! a.m.datetype)) {
			//b is a "year", "month" or "day" marker
			return 1;
		} else if (a.m && a.m.datetype && b.m && b.m.datetype) {
			if (a.m.datetype != b.m.datetype) {
				//Years before months before days

				if (a.m.datetype == 'year' || b.m.datetype == 'year') {
					return a.m.datetype == 'year' ? -1 : 1;
				}

				if (a.m.datetype == 'month' || b.m.datetype == 'month') {
					return a.m.datetype == 'month' ? -1 : 1;
				}
			}

			var as = parseInt(a.m.dateval, 10);
			var bs = parseInt(b.m.dateval, 10);
			
			if (a.m.datetype == 'year') {
				//year descending
				return as > bs ? -1 : 1;
			} else {
				//both is a "month" or "day" marker
				return as < bs ? -1 : 1;
			}
		}

		var al = a.l !== undefined ? a.l : a.t
		var bl = b.l !== undefined ? b.l : b.t

		return al.toLowerCase() < bl.toLowerCase() ? -1 : 1;
	}

	private addTag(key: string, imageIndexes: any, metadata: any, initialLoad: boolean) {
		
		if (this.tagIndex[key] !== undefined) {
			return false;
		}

		var tagIndex = this.tags.length;

		var o = {t:key,i:{}};

		for (var i = 0; i < imageIndexes.length; i++) {
			o.i[imageIndexes[i]] = true;
			this.images[imageIndexes[i]].t[tagIndex] = true;

			if (initialLoad) {
				this.images[imageIndexes[i]].ot[tagIndex] = true;
			} else {
				this.dirty[imageIndexes[i]] = true;
			}
		}

		if (metadata) {
			o['m'] = metadata;

			if (o['m'].datetype) {
				o['l'] = this.buildDateLabel(metadata.dateval, metadata.datetype);
			}
		}

		this.tags.push(o);
		this.tagIndex[key] = tagIndex;

		return tagIndex;
	}

	private buildDateLabel(key: any, datetype: string) {

		key = parseInt(key, 10);

		switch (datetype){
			case 'month':
				return this.monthNames[key-1];
				break;
			case 'day':
				switch (key) {
					case 1:
					case 21:
					case 31:
						return key + 'st';
						break;
					case 2:
					case 22:
						return key + 'nd';
						break;
					case 3:
					case 23:
						return key + 'rd';
						break;
					default:
						return key + 'th';
						break;
				}
				break;
			default:
				return key;
		}
	}
}
