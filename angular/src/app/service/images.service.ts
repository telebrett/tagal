import { Injectable } from '@angular/core';
import {Observable} from "rxjs";

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

  	constructor(private http: HttpClient) { 
  	}

	public loadImages() {
		return this.http.get('/assets/database.json').subscribe((data:any) => {

			for (var i in data.images) {

				let image = data.images[i];

				let path = image[0].match(/^(.*)\/(.*)$/);

				this.images[i] = {p:path[1],f:path[2],r:image[1],t:{},ot:{},o:image[2]};
			}

			for (var i in data.tags) {
				this.addTag(i, data.tags[i], data.tagmetadata[i], true);
			}
		});
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
