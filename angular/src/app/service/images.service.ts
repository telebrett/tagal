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
	 * bool    v  True if the image is actually a video.
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
	 * object p  keys are the point indexes, value is true
	 */
	private tags   = [];

	/**
	 * Each element is a hash with keys
	 * float x The longitude of the point
	 * float y The latitude of the point
	 * object i  keys are the image indexes, value is true
	 */
	private points = [];

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

	private vblocks = [];

	constructor(private http: HttpClient) { 
	}

	public loadImages() : Observable<boolean> {

		let database_source = environment.databaseSource;

		return this.http.get(database_source).pipe(map((data:any) => {

			for (let i in data.images) {

				let image = data.images[i];

				let path = image[0].match(/^(.*)\/(.*)$/);

				let imagehash = {p:path[1],f:path[2],r:image[1],t:{},ot:{},o:image[2],v:image.length>3};

				this.images[i] = imagehash;
			}

			//Note, this must be done before the tags
			for (let i in data.points) {
				this.addPoint(i, data.points[i]);
			}

			for (let i in data.tags) {
				this.addTag(i, data.tags[i], data.tagmetadata[i], true);
			}

			this.setRemainingTags();

			return true;
		}));
	}

	public download(src: string) : Observable<any> {
		return this.http.get(src);
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
		let groups = {};
        
		for (let i = 0; i < this.remainingTags.length; i++) {
			let tag = this.tags[this.remainingTags[i]];
        
			//Tags with metadata that also have 'single' don't have subtags, eg if an image has the "video" tag
			if (tag.m && ! tag.m.single) {

				let group;

				//Tags with metadata get grouped
				if (tag.m.datetype) {
					group = tag.m.datetype;
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
				} else {
					group = tag.m.type;
				}

				if (! groups[group]) {
					groups[group] = {
						tags: [],
						type: group
					}
				}

				groups[group].tags.push(tag);
				
			} else {
				unsorted.push(tag);
			}
		}

		//Do groups
		let tags = this.sortGroupTags(groups);

		let sorted = unsorted.sort(this.sortTags);
        
		for (let i = 0; i < sorted.length; i++) {
			tags.push(this.niceTag(sorted[i]));
		}

		return tags;
		
	}

	public getCurrentTags() {

		let tags = [];

		for (let i = 0; i < this.currentTags.length; i++) {
			tags.push(this.niceTag(this.tags[this.currentTags[i]]));
		}

		return tags;

	}

	public getCurrentPoints() {

		let points = {};

		//The point needs to be in ALL the tags
		for (let i = 0; i < this.currentTags.length; i++) {
			for (let pointIndex in this.tags[this.currentTags[i]].p) {
				if (points[pointIndex] === undefined) {
					points[pointIndex] = 1;
				} else {
					points[pointIndex]++;
				}
			}
		}

		let matchingPoints = [];

		for (let p in points) {
			if (points[p] == this.currentTags.length) {
				matchingPoints.push(this.points[p]);
			}
		}

		return matchingPoints;

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

		let promises = [];

		for (let i = start_index; i < end_index; i++) {
			let image = this.images[this.currentImages[i]];
			let thumb = {
				width    : Math.round(image.tw),
				height   : Math.round(image.th),
				index    : this.currentImages[i],
				left     : image.tl,
				src      : null,
				ciindex  : i
				//TODO - This is for admin mode - not ported yet
				//selected : this.selected[this.currentImages[i]]
			};

			let src = image.p;
			if (image.v) {
				src += '/.preview/' + image.f + '.png';
			} else {
				src += '/.thumb/' + image.f;
			}

			src = environment.imageSource + src;

			//if (this.s3) {

			//	let s3path = this.rootImageDir + image.p + '/.thumb/' + image.f;

			//	if (this.s3fails[s3path]) {
			//		thumb.src = 'failed.png';
			//		continue;
			//	}

			//	let s3cached = this.s3lru.get(s3path);

			//	//Still flickers, but only the thumbnails that were not already on the screen
			//	if (s3cached) {
			//		thumb.src = s3cached;
			//	} else {
			//		thumb.src   =  'spacer.png';
			//		thumb.s3src = s3path;
			//	}
			//} else {
				thumb.src = src;
			//}

			win.push(thumb);
		}
		
		return win;
	}

	public getImageIndex(ciindex: number) {

		if (ciindex < 0 || ciindex >= this.currentImages.length) {
			return false;
		}

		return this.currentImages[ciindex];

	}

	public getThumbnailWindowByTop(top: number, maxHeight: number) {

		let start_index = this.calcTopIndex(top);

		let stop = top + maxHeight;

		let thumbs = [];

		//Find the first vblock
		let vblock_index = 0;
		while (true) {

			if ((vblock_index + 1) >= this.vblocks.length) {
				break;
			}

			if (this.vblocks[vblock_index + 1].ii > start_index) {
				break;
			}

			vblock_index++;
		}

		if (start_index == 0) {
			thumbs.push(this.vblocks[vblock_index++]);
		} else {
			if (this.images[this.currentImages[start_index -1]].tl < this.vblocks[vblock_index].tl) {
				thumbs.push(this.vblocks[vblock_index++]);
			} else {
				//The heading for the starting index is too far up to show
				vblock_index++;
			}

		}

		let max_run = 0;
		while(true) {

			let image = this.images[this.currentImages[start_index]];

			if (start_index >= this.currentImages.length || image.tl > stop ) {
				break;
			}

			let src = image.p;
			if (image.v) {
				src += '/.preview/' + image.f + '.png';
				//src += '/.thumb/' + image.f + '.png';
			} else {
				src += '/.thumb/' + image.f;
			}

			src = environment.imageSource + src;

			let thumb = {
				width    : Math.round(image.tw),
				height   : Math.round(image.th),
				index    : this.currentImages[start_index],
				tl       : image.tl,
				src      : src,
				v        : image.v,
				ciindex  : start_index
			}

			if (
				vblock_index < this.vblocks.length
				&& this.vblocks[vblock_index].tl < image.tl
			) {
				thumbs.push(this.vblocks[vblock_index++]);
			}

			thumbs.push(thumb);

			start_index++;

		}

		return thumbs;

	}

	private calcTopIndex(top: number) {

		if (top == 0) {
			return 0;
		}

		//Just do a binary search
		let start_index = 0;
		let end_index = this.currentImages.length-1;
		let result = 0;

		let attempts = 0;
		let diff = 0;


		while (true) {

			if (attempts++ > 1000) {
				console.log('could not find start point for window : ' + top);
				break;
			}

			result = start_index + Math.floor((end_index - start_index) / 2);

			let p_start_index = start_index;
			let p_end_index = end_index;

			let image = this.images[this.currentImages[result]];

			if (image.tl <= top && (image.tl + image.th) >= top) {
				//The image spans the 'top' line
				break;
			} else {

				//If the tl is within 30 
				if ( (image.tl - 30) < top && (image.tl) > top) {
					//Check for a heading
					while (result > 0 && this.images[this.currentImages[result]].tl == this.images[this.currentImages[result-1]].tl) {
						result--;
					}

					if (result == 0) {
						return 0;
					}

					let prev_row_image = this.images[this.currentImages[result]];
					if ( (prev_row_image.tl + prev_row_image.th) < top) {
						return result;
					}
				}

				diff = image.tl - top;

				if (diff > 0) {
					//We are down from where we want to be
					end_index = result;
				} else {
					//We are above from where we want to be
					start_index = result;
				}
			}

			if (p_start_index == start_index && p_end_index == end_index) {
				result = start_index;
				break;
			}

		}

		//Although we got the correct top left, there might be images to the left with the same top left
		while (result > 0 && this.images[this.currentImages[result]].tl == this.images[this.currentImages[result-1]].tl) {
			result--;
		}

		return result;


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

	public getThumbnails(maxWidth: number, maxHeight: number, imageIndexes: any[]) {

		let thumbs = [];

		for (let index of imageIndexes) {
			let image = this.images[index];

			thumbs.push(this.getImage(index, maxWidth, maxHeight, true));

		}

		return thumbs;
		
	}

	public selectTag(index: number) {

		if (this.currentTags.indexOf(index) !== -1) {
			return;
		}

		this.currentTags.push(index);

		if (this.currentTags.length == 1) {
			this.currentImages = Object.keys(this.tags[index].i);

			//Object.keys converts the int's to strings
			for (let i = 0; i < this.currentImages.length; i++) {
				this.currentImages[i] = parseInt(this.currentImages[i], 10);
			}

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
			let newimages = {};
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

	public setvblocks(headingHeight: number, thumbnailHeight: number, maxWidth: number) : number {

		//Note this function relies upon currentImages being sorted already

		// What this function does is set the 'tl' (top left), 'th' (thumbnail height) and 'tw' (thumbnail width) to each image in this.currentImages
		// This is calculated based on the asked for thumbnail height for the maximim width
		// 
		// The vblocks contain the image index for which they appear directly before

		this.vblocks = [];

		let borderandpadding = 10;

		let current_block;
		let top_left = borderandpadding / 2;
		let left: 0 ;
		let row_max_height = 0;

		let multi_image = false;

		//Note, we could make this smarter, group by Year until the number of images exceeds X, then group by month, until it also exceeds X and THEN group
		//by day, but for now, just group by day
		for (let i = 0; i < this.currentImages.length; i++) {

			let image = this.images[this.currentImages[i]];
			let image_key = [];

			for (let tagIndex in image.t) {
				let tag = this.tags[tagIndex];

				if (! tag.m || ! tag.m.datetype) {
					continue;
				}

				switch (tag.m.datetype) {
					case 'year' : image_key[0] = tag.m.dateval; break;
					case 'month': image_key[1] = tag.m.dateval; break;
					case 'day'  : image_key[2] = tag.m.dateval; break;
				}
			}

			let image_rawkey = image_key.join('-');

			if (! current_block || current_block.k != image_rawkey) {

				top_left += row_max_height;

				if (current_block) {
					top_left += borderandpadding;
				}

				current_block = {
					ii: i,            //image index
					k: image_rawkey, 
					tl: top_left, 
					height: headingHeight,
					width: maxWidth,
					heading: this.buildDateLabel(image_key[2], 'day') + ' ' + this.buildDateLabel(image_key[1], 'month') + ', ' + image_key[0]
				};

				//This initial height is the height of the heading, yes it sucks for the service to be tied to the UI in this way, but this needs to know the heights for performance
				top_left += headingHeight + borderandpadding;
				left = 0;
				row_max_height = 0;
				multi_image = false;

				this.vblocks.push(current_block);

			}

			image.th = thumbnailHeight;
			image.tw = Math.ceil(image.r * thumbnailHeight);

			//Damn you panorama images
			if (image.tw > maxWidth) {
				//the 10 is the margin and border
				image.tw = maxWidth - borderandpadding;

				image.th = Math.ceil((1/image.r) * image.th);
			}

			if (image.tw + borderandpadding + left > maxWidth) {
				//New row

				top_left += row_max_height + borderandpadding;

				row_max_height = image.th;
				left = image.tw + borderandpadding;
				multi_image = true;

			} else {
				left += image.tw + borderandpadding;
				if (image.th > row_max_height) {
					row_max_height = image.th;
				}
			}

			image.tl = top_left;

		}

		return top_left + row_max_height + borderandpadding;

	}

	public setThumbnailHeights(thumbnailHeight: number) {

		let totalWidth = 0;

		this.thumbnailAvgWidth = thumbnailHeight * 1.25;

		//TODO - could possible do some performance improvements here, cache the thumbnailHeight
		//       and if the same as the last time, just reset the tl property

		for (let i = 0; i < this.currentImages.length; i++) {
			let image = this.images[this.currentImages[i]];

			image.th = thumbnailHeight;
			image.tw = Math.ceil(image.r * thumbnailHeight);
			image.tl = totalWidth;

			//The 1px is for the right border
			totalWidth += image.tw + 1;
		}

		return totalWidth;
	}

	public getImage(index: number,maxWidth: number,maxHeight: number, thumb?: boolean) {

		let image = this.images[index];

		let image_src;
		if (thumb) {
			image_src = image.p + '/.thumb/' + image.f;
			if (image.v) {
				image_src += '.png';
			}
		} else {
			image_src = image.p + '/' + image.f;
		}

		let fullImage = {
			index : index,
			src : environment.imageSource + image_src,
			name : image.f,
			height: null,
			width: null,
			previewSrc: null,
			v: image.v
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

		//Don't have previews of images
		if (! image.v && environment.api) {
			fullImage.previewSrc = environment.api + 'preview/' + index + '/' + fullImage.width + '/' + fullImage.height; 
		}

		return fullImage;

	}

	private niceTag(tag) {

		let o = {
			index:this.tagIndex[tag.t],
			label:tag.l === undefined ? tag.t : tag.l,
		};

		/*
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
	 	*/

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

			let as = parseInt(a.m.dateval, 10);
			let bs = parseInt(b.m.dateval, 10);
			
			if (a.m.datetype == 'year') {
				//year descending
				return as > bs ? -1 : 1;
			} else {
				//both is a "month" or "day" marker
				return as < bs ? -1 : 1;
			}
		}

		let al = a.l !== undefined ? a.l : a.t
		let bl = b.l !== undefined ? b.l : b.t

		return al.toLowerCase() < bl.toLowerCase() ? -1 : 1;
	}

	private sortGroupTags(groups) {

		let unsorted = [];

		for (let group in groups) {

			let tags = groups[group].tags;

			tags = tags.sort(this.sortTags);

			groups[group].tags = [];
			for (let i = 0; i < tags.length; i++) {
				groups[group].tags.push(this.niceTag(tags[i]));
			}

			unsorted.push(groups[group]);

		}

		return unsorted.sort((a,b) => {
			if (a.type == 'year') {
				return -1;
			} else if(b.type == 'year') {
				return 1;
			}

			if (a.type == 'month') {
				return -1;
			} else if(b.type == 'month') {
				return 1;
			}

			if (a.type == 'day') {
				return -1;
			} else if(b.type == 'day') {
				return 1;
			}

			return a.type < b.type ? -1 : 1;
		});

	}

	private addPoint(pointStr: string, imageIndexes: any) {

		let xy = pointStr.split(':');

		let point = {
			x: parseFloat(xy[0]),
			y: parseFloat(xy[1]),
			i: {}
		};

		for (let i of imageIndexes) {
			point.i[parseInt(i, 10)] = true;
		}

		this.points.push(point);

	}

	private addTag(key: string, imageIndexes: any, metadata: any, initialLoad: boolean) {
		
		if (this.tagIndex[key] !== undefined) {
			return false;
		}

		let tagIndex = this.tags.length;

		let o = {t:key,i:{},p:{}};

		for (let i = 0; i < imageIndexes.length; i++) {
			o.i[imageIndexes[i]] = true;
			this.images[imageIndexes[i]].t[tagIndex] = true;

			if (initialLoad) {
				this.images[imageIndexes[i]].ot[tagIndex] = true;
			} else {
				this.dirty[imageIndexes[i]] = true;
			}
		}

		for (let p = 0; p < this.points.length; p++) {
			//If the point contains any of the images that this tag also contains,
			//add it to the tags list of points
			for (let i in this.points[p].i) {
				if (o.i[i]) {
					o.p[p] = true;
					break;
				}
			}
		}

		if (metadata) {
			o['m'] = metadata;

			if (metadata.label) {
				o['l'] = metadata.label;
			} else if (metadata.datetype) {
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
