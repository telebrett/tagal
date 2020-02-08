import { Injectable } from '@angular/core';
import {Observable} from "rxjs";
import { map } from 'rxjs/operators';

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
