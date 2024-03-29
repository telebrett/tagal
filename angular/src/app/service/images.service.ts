import { Inject, Injectable } from '@angular/core';
import {Observable} from "rxjs";
import { map, switchMap, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

import {HttpClient, HttpHeaders} from '@angular/common/http';

import {LOCAL_STORAGE, StorageService } from 'ngx-webstorage-service';

/*
TODO ADMIN MODE
- Then add tools for
  - Add a warning that admin mode should NOT be used in chrome because it's FITH
    Basically, chrome ignores cache headers for sub resources (eg thumbnails)
	  it does a sample and if it gets back 304, then it doesn't check the rest of them

	  SO, we could store a "last modified" diff, or "IsDiffFromPrimaryJSONDB" could be a timestamp
	  and we return that in the diffs and add it to the querystring of the thumbnail / preview

	- BUG in rotation mode, rotate an image twice (ie make it upside down) The thumbnail is upside down (correct)
	  but the preview is right way up (incorrect)

  - Rotate 90 CW / CCW (this would operate on the images files directly)
	  This would have to mark the image in the database to return it's width/height in the "diffs" API call
	  as well as regenerate the thumbnails / previews

 - Right click on a tag to edit it's metadata
  - Correct date
    
    This should be a "date shift" operation, possibly CLI only

	  dateshift.pl --camera "go pro" --start-date <A> --finish-date <B> --corrected-start-date <C>

	  A = The search start date to correct images for - this is the "bad date"
	  B = The search end date to correct images for - this is the "bad date"
	  C = The corrected start date - this is the real date

	  eg

	  dateshift.pl --camera "go pro" --start-date "2019-05-01 10:30:00" --finish-date "2019-06-08 10:50:00" --corrected-start-date "2019-05-23 15:23:00"

	  This script should have a confirmation step and list how many images will be affected

	  The script would calculate the difference in time between A and C, and apply to all images that it finds
	  between A and B

	  The files would have to be moved (this should be an option in the config.ini, as import_to_basedir.pl is optional
	  ie, the files might not be in a YYYY/MM/DD folder structure - maybe we could auto detect this from the path?

  - Warn if the "diffs" is getting large, Maybe we can show a "X images modified" on the "Commit changes to files" button
	- Geocode a "manual" tag / "manual" a geocode tag - BUT, it's possible that you want to have the same "manual" tag for multiple geocode points to preserve accuracy
	- IsPerson
	- SubTag - if this is true, then don't show it until a parent tag has been selected, eg I have three tags "Moore park tigers", "Under 7's", "Under 5's" - If "Under 5's and "Under 7's" were marked as sub tags
	  then they would only appear when the "Moore park tigers" is set - or some other tag
	- Add a "view diffs" mode so you can see the changes prior to issuing the "commit" change
		 
	 Another one could be "Campsites"
- Add an "untagged" button. This would return all images that don't have a manually added tag. Eg untagged means an image that has a tag that isn't a camera, date part or 'is video' or geocode
- Add an "ungeocoded" button
- Some videos are not playing, eg 2002 videos, convert tool?

TODO S3
 - When on S3, the urls should have the database hash appended to them, that way, if a images have been rotated etc,
   then the changes will appear and we can cache aggressively

*/

const STORAGE_HASH     = 'dbhash';
const STORAGE_SELECTED = 'selected';

@Injectable({
  providedIn: 'root'
})
export class ImagesService {

	private dbhash;

	/**
	 * Each element is a hash with keys
	 * int     id the database id of the image
	 * string  p  Image path, relative to /pictures
	 * int     o  sort order of the image
	 * string  f  Image filename eg 'foo.jpg'
	 * float   r  The ratio of height to width TODO width to height?
	 * object  t  hash of tag indexes - the tags that have possibly been added / removed
	 * bool    s  True if the image is currently marked as selected (key may not exist)
	 * bool    v  True if the image is actually a video.
	 * int     cb Cachebuster. Because Chrome has decided that devs can't be trusted, it will
	 *            not honour cache headers for large sets of sub resources. It will only perform
	 *            a small sample of retrievals and if it gets 304's, will retrieve the rest from cache
	 *
	 *            Fuck you chrome, fuck you very much
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

	/**
	 * Keys are the image ids, values are the index in this.images
	 * Note, this is only populated if the API is available
	 */
	private imageIDIndex = {};

	private monthNames = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ];

	private dirty;

	private hideTagged = false;

	private currentTags = [];
	private remainingTags = [];

	private currentImages = [];
	private thumbnailAvgWidth;

	private vblocks = [];

	private numSelected = 0;

	constructor(private http: HttpClient, @Inject(LOCAL_STORAGE) private storage: StorageService) { 
	}

	public loadImages() : Observable<boolean> {

		let database_source = environment.databaseSource;
		if (this.hasAPI()) {
			let diffs_source = environment.api + 'diffs';

			return this.http.get(database_source).pipe(
				switchMap(data => {
					this.loadDatabase(data);
					return this.http.get(diffs_source).pipe(map(diffs => this.loadDiffs(diffs)));
				})
			);

		} else {
			return this.http.get(database_source).pipe(map((data:any) => this.loadDatabase(data)));
		}

	}

	private loadDatabase(data) : boolean {

		this.dbhash = data.hash;

		let si = 0;
		let image_indexes = {};
		for (let image_id in data.images) {

			let image = data.images[image_id];

			let path = image[0].match(/^(.*)\/(.*)$/);

			let imagehash = {id:image_id, p:path[1],f:path[2],r:image[1],t:{},o:image[2],v:image.length>3};

			image_indexes[image_id] = si;

			//The json file is keyed by the image database id
			//But we use arrays instead of hashes as array lookups are significantly faster than hash lookups
			this.images[si++] = imagehash;
		}

		if (this.hasAPI()) {
			this.imageIDIndex = image_indexes;
		}

		for (let tag_index in data.tags) {

			//Map the json indexes to our array indexes
			let local_image_indexes = [];
			for (let image_id of data.tags[tag_index]) {
				local_image_indexes.push(image_indexes[image_id]);
			}

			this.addTag(tag_index, local_image_indexes, data.tagmetadata[tag_index]);
		}

		if (this.hasAPI()) {
			let mismatched_hash = false;

			if (this.storage.has(STORAGE_HASH)) {
				this.storage.set(STORAGE_HASH, data.hash);
			} else {
				let hash = this.storage.get(STORAGE_HASH);
				if (hash != data.hash) {
					mismatched_hash = true;
				}
			}

			//TODO - What to do on mismatched hash
			if (this.storage.has(STORAGE_SELECTED)) {
				let selected = this.storage.get(STORAGE_SELECTED);

				for (let index in selected) {
					this.images[index].s = true;
					this.numSelected++;
				}
			}

		} else {
				this.setRemainingTags();
		}

		return true;
	}

	private loadDiffs(data) : boolean {

		for (let image_id in data.diffs) {
			let image_diff = data.diffs[image_id];

			let image_index = this.imageIDIndex[image_id];

			let image = this.images[image_index];

			//Image has been rotated
			if (image_diff.r) {
				image.r = image_diff.r;
			}

			if (image_diff.cb) {
				image.cb = image_diff.cb;
			}

			if (image_diff.add) {
				for (let tag of image_diff.add) {
					let tag_index = this.tagIndex[tag];

					if (tag_index === undefined) {
						this.addTag(tag, [image_index], null);
					} else {
						image.t[tag_index] = true;
						this.tags[tag_index].i[image_index] = true;
					}
				}
			}

			if (image_diff.del) {
				for (let tag of image_diff.del) {
					let tag_index = this.tagIndex[tag];

					if (tag_index === undefined) {
						continue;
					}

					delete image.t[tag_index];
					delete this.tags[tag_index].i[image_index];

					//TODO - If the tag.i is empty, maybe it should be removed?
					//       but only if it has been removed from the database,
					//       which would have to be returned in the diffs
					//
					//       possibly, but ONLY do this after all images have been processed
				}
			}

		}

		this.setRemainingTags();

		return true;

	}
	

	public storageSet(key: string, value: any) {
		this.storage.set(key, value);
	}

	public storageGet(key: string) {
		return this.storage.get(key);
	}

	public hasAPI() : boolean {
		if (environment.api) {
			return true;
		}

		return false;
	}

	public exifdata(ciindex: any) : Observable<any> {

		let image = this.images[this.currentImages[ciindex]];

		let exif_url = environment.imageSource + image.p + '/.exif/' + image.f + '.json';

		return this.http.get(exif_url);

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
						type: group.charAt(0).toUpperCase() + group.slice(1)
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

		if (! this.hideTagged) {
			tags.unshift(this.getUntaggedTag());
		}

		return tags;
		
	}

	private getUntaggedTag() {
		return {
			untagged: true,
			label:'No tags',
			primary: true
		};
	}

	public getCurrentTags() {

		let tags = [];

		for (let i = 0; i < this.currentTags.length; i++) {
			tags.push(this.niceTag(this.tags[this.currentTags[i]]));
		}

		if (this.hideTagged) {
			tags.unshift(this.getUntaggedTag());
		}

		return tags;

	}

	public getCurrentPoints() {

		return [];
		/*

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
	 */


	}

	public getThumbnailWindowByLeft(left: number, count: number) {

		let start_index = this.calcStartIndex(left);

		return this.getThumbnailWindow(start_index, count);

	}

	//TODO - This can probably be removed
	public getThumbnailsByPage(pageOffset: number,count: number) {

		let start_index = count * pageOffset;

		return this.getThumbnailWindow(start_index, count);

	}

	public getThumbnailLeft(index: number) {
		if (this.currentImages[index] && this.images[this.currentImages[index]]) {
			return this.images[this.currentImages[index]].tl;
		}

	}

	public getThumbnailWidth(index: number) {
		if (this.currentImages[index] && this.images[this.currentImages[index]]) {
			return this.images[this.currentImages[index]].tw;
		}

	}

	public searchTag(term: string, exclude: any) {

		term = term.toLowerCase();

		let matches = [];

		if (! term.length) {
			return matches;
		}

		let exclude_lower = exclude.map((tag) => tag.label.toLowerCase());

		for (let [index, tag] of this.tags.entries()) {

			if (tag.m && (tag.m.datetype || tag.m.type == 'camera' || tag.m.type == 'point' || tag.m.type == 'video')) {
				continue;
			}


			let label = tag.t;

			label = label.toLowerCase();

			let found = false;
			for (let ex of exclude_lower) {
				if (ex == label) {
					found = true;
					break;
				}
			}

			if (found) {
				continue;
			}	

			if (label.indexOf(term) != -1) {
				matches.push({label: tag.t, index: index});
			}
		}

		return matches;

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
				ciindex  : i,
				s        : image.s
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

			if (image.cb) {
				thumb.src += "?cb=" + image.cb;
			} else {
				thumb.src += "?cb=" + this.dbhash;
			}

			win.push(thumb);
		}
		
		return win;
	}

	public getCurrentImageIndex(imageIndex: any) {
		let result = this.currentImages.indexOf(parseInt(imageIndex, 10));

		if (result === -1) {
			return false;
		}

		return result;
	}

	public getImageIndex(ciindex: number) {

		if (ciindex === undefined || ciindex < 0 || ciindex >= this.currentImages.length) {
			return false;
		}

		return this.currentImages[ciindex];

	}

	public getNumSelected() {
		return this.numSelected;
	}

	public getCurrentImagesAllSelected() {

		//TODO - If we change "numSelected" to ONLY report on the number of images selected in the current set
		//       then this could simple change to return if numSelected = currentImages.length

		if (this.currentImages.length == 0) {
			return false;
		}

		for (let index of this.currentImages) {
			if (! this.images[index].s) {
				return false;
			}
		}

		return true;

	}

	public setCurrentImagesSelect(select: boolean) {

		let hash = {};

		if (this.storage.has(STORAGE_SELECTED)) {
			hash = this.storage.get(STORAGE_SELECTED);
		}

		for (let index of this.currentImages) {
			this.images[index].s = select;
			if (select) {
				hash[index] = true;
			} else {
				delete hash[index];
			}
		}

		if (select) {
			this.numSelected += this.currentImages.length;
			this.numSelected = Math.min(this.currentImages.length, this.numSelected);
		} else {
			this.numSelected -= this.currentImages.length;
			this.numSelected = Math.max(0, this.numSelected);
		}

		this.storage.set(STORAGE_SELECTED, hash);

	}

	/**
	 * Bulk select from the currentImages for those
	 * that also have all the passed tag indexes
	 *
	 * Returns an array of image indexes affected
	 */
	public selectImages(tagIndexes, select) {

		let hash = {};

		if (this.storage.has(STORAGE_SELECTED)) {
			hash = this.storage.get(STORAGE_SELECTED);
		}

		let affected = [];

		for (let image_index of this.currentImages) {
			let image = this.images[image_index];

			let all_found = true;

			for (let tag_index of tagIndexes) {
				if (! image.t[tag_index]) {
					all_found = false;
					break;
				}
			}

			if (all_found) {

				affected.push(image_index);

				let prev = image.s;
				image.s = select;

				if (prev != image.s) {
					this.numSelected += image.s ? 1 : -1;
				}

				if (select) {
					delete hash[image_index];
				} else {
					hash[image_index] = true;
				}
			}
		}

		this.storage.set(STORAGE_SELECTED, hash);

		return affected;

	}

	public toggleSelectImageFromIndex(thumb) {

		let index = this.getImageIndex(thumb.ciindex);

		if (! index) {
			return;
		}

		let image = this.images[index];

		let hash = {};

		if (this.storage.has(STORAGE_SELECTED)) {
			hash = this.storage.get(STORAGE_SELECTED);
		}

		if (image.s) {
			delete hash[index];
			image.s = false;
		} else {
			hash[index] = image.s = true;
			image.s = true;
		}

		thumb.s = image.s;

		if (thumb.s) {
			this.numSelected++;
		} else {
			this.numSelected--;
		}

		this.storage.set(STORAGE_SELECTED, hash);
	}

	private buildVBlock(vblock_index) {
		//the vblock extra_tags array includes the current selected tag set
		//we want to strip this to the remaining tags
		//BUT we only need to do this when the vblock heading is displayed
		//so we do it at runtime
	
		let vblock = this.vblocks[vblock_index];

		if (! vblock.extraDisplayTags.length) {
			for (let key in vblock.extraTags) {

				let tag_index = parseInt(key, 10);

				if (this.currentTags.includes(tag_index)) {
					continue;
				}

				let tag = this.tags[tag_index];
				if (tag.m && (tag.m.type == 'camera' || tag.m.type == 'point' || tag.m.type == 'video')) {
					continue;
				}

				vblock.extraDisplayTags.push(this.niceTag(tag));

			}

		}

		return vblock;

	}

	public getThumbnailWindowByTop(top: number, maxHeight: number) {

		let start_index = this.calcTopIndex(top);

		let stop = top + maxHeight;

		let thumbs = [];

		if (this.vblocks.length == 0) {
			return thumbs;
		}

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
			thumbs.push(this.buildVBlock(vblock_index++));
		} else {
			if (this.images[this.currentImages[start_index -1]].tl < this.vblocks[vblock_index].tl) {
				thumbs.push(this.buildVBlock(vblock_index++));
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

			if (image.cb) {
				src += "?cb=" + image.cb;
			} else {
				src += "?cb=" + this.dbhash;
			}

			let thumb = {
				width    : Math.round(image.tw),
				height   : Math.round(image.th),
				index    : this.currentImages[start_index],
				tl       : image.tl,
				src      : src,
				v        : image.v,
				ciindex  : start_index,
				s        : image.s
			}

			if (
				vblock_index < this.vblocks.length
				&& this.vblocks[vblock_index].tl < image.tl
			) {
				thumbs.push(this.buildVBlock(vblock_index++));
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

	/**
	 * After making changes to the tags, this is called to set
	 * the current selection of tags from the current image set
	 */
	public setCurrentTagsFromCurrentImages() {

		let tags = [];

		for (let image_index of this.currentImages) {

			let image = this.images[image_index];

			if (tags.length == 0) {
				tags = Object.keys(image.t).map((i) => parseInt(i, 10));
			} else {
				tags = tags.filter((i) => image.t[i] !== undefined);
			}

		}

		//TODO - I think this is a bug, if more than one entry is removed
		//       all except the first index are incorrect
		for (let [index, tag_index] of this.currentTags.entries()) {
			if (tags.indexOf(tag_index) == -1) {
				this.currentTags.splice(index, 1);
			}
		}

		if (this.currentTags.length == 0) {
			this.setRemainingTags();
		}

	}

	/**
	 * Add a new tag to the current selected set and restrict the current
	 * images
	 */
	public selectTags(indexes: [number|any]) {

		let index;
		while (index = indexes.shift()) {

			if (typeof index == 'object') {

				if (index.untagged) {
					this.hideTagged = true;
				}

				this.hideTaggedImages();

			} else {
				if (this.currentTags.indexOf(index) !== -1) {
					continue;
				}

				this.currentTags.push(index);

				this.selectTagSetCurrentImages(this.currentTags.length - 1);
			}
		}

		this.sortCurrentImages();
		this.setRemainingTags();
	}

	/**
	 * Resets the current images based on the current selected tags
	 */
	public setCurrentImagesToTags() {

		if (this.currentTags.length == 0) {
			this.currentImages = [];
			return;
		}

		for (let i = 0; i < this.currentTags.length; i++) {
			this.selectTagSetCurrentImages(i);
		}

		if (this.hideTagged) {
			this.hideTaggedImages();
		}

		this.sortCurrentImages();
		this.setRemainingTags();
		
	}

	//Of the current images, remove those that have further, non primary tags, then the current set
	private hideTaggedImages() {

		this.currentImages = this.currentImages.filter((image_index: number) => {

			let image_tags = this.images[image_index].t;
			
			let extra = Object.keys(image_tags).filter(index => ! this.currentTags.includes(index));

			for (let index of extra) {
				if (! this.tags[index].m) {
					return false;
				}
			}

			return true;

		});

	}

	private selectTagSetCurrentImages(currentTagsIndex) {

		let tag_index = this.currentTags[currentTagsIndex];

		if (currentTagsIndex == 0) {
			this.currentImages = Object.keys(this.tags[tag_index].i);

			//Object.keys converts the int's to strings
			for (let i = 0; i < this.currentImages.length; i++) {
				this.currentImages[i] = parseInt(this.currentImages[i], 10);
			}

		} else {
			let ts = this.tags[tag_index].i;
			this.currentImages = this.currentImages.filter(function(v){return ts[v] !== undefined});
		}

	}

	public setCurrentImagesToSelected() {

		this.currentImages = [];

		for (let [index, image] of this.images.entries()) {
			if (image.s) {
				this.currentImages.push(index);
			}
		}

		this.sortCurrentImages();

	}

	public getCurrentImagesLength() {
		return this.currentImages.length;
	}

	public getCurrentImagesTags() {

		let currentTags = {};

		for (let imageIndex of this.currentImages) {
			for (let tagIndex of Object.keys(this.images[imageIndex].t)) {

				let tag = this.tags[tagIndex];

				if (tag.m && (tag.m.datetype || tag.m.type == 'camera' || tag.m.type == 'point' || tag.m.type == 'video')) {
					continue;
				}

				if (currentTags[tagIndex]) {
					currentTags[tagIndex]++;
				} else {
					currentTags[tagIndex] = 1;
				}
			}
		}

		let tags = [];

		for (let tagIndex of Object.keys(currentTags)) {

			let tag = this.niceTag(this.tags[tagIndex], currentTags[tagIndex]);
			tags.push(tag);

		}

		return tags;

	}

	public deselectTag(index: number|any) {

		if (typeof index == 'object') {
			if (index.untagged) {
				this.hideTagged = false;
			}
		} else {

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

		if (this.hideTagged) {
			this.hideTaggedImages();
		}

		this.sortCurrentImages();
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
			let image_datetags = [];

			let extra_tags = [];

			for (let tagIndex in image.t) {
				let tag = this.tags[tagIndex];

				if (! tag.m || ! tag.m.datetype) {
					extra_tags.push(tagIndex);
					continue;
				}

				switch (tag.m.datetype) {
					case 'year' : image_datetags[0] = tagIndex; image_key[0] = tag.m.dateval; break;
					case 'month': image_datetags[1] = tagIndex; image_key[1] = tag.m.dateval; break;
					case 'day'  : image_datetags[2] = tagIndex; image_key[2] = tag.m.dateval; break;
				}
			}

			let image_rawkey = image_key.join('-');

			if (! current_block || current_block.k != image_rawkey) {

				top_left += row_max_height;

				if (current_block) {
					top_left += borderandpadding;
					//Clean up the extra tags
				}

				current_block = {
					ii: i,            //image index
					k: image_rawkey, 
					tl: top_left, 
					height: headingHeight,
					width: maxWidth,
					heading: this.buildDateLabel(image_key[2], 'day') + ' ' + this.buildDateLabel(image_key[1], 'month') + ', ' + image_key[0],
					tagIndexes: image_datetags.map((index) => parseInt(index, 10)),
					extraTags:{},
					extraDisplayTags:[],
					allSelected: true
				};

				//This initial height is the height of the heading, yes it sucks for the service to be tied to the UI in this way, but this needs to know the heights for performance
				top_left += headingHeight + borderandpadding;
				left = 0;
				row_max_height = 0;
				multi_image = false;

				this.vblocks.push(current_block);

			}

			for (let extraTagIndex of extra_tags) {
				current_block.extraTags[extraTagIndex] = true;
			}

			//This must be checked after the current_block is reset
			if (! image.s) {
				current_block.allSelected = false;
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
			fullImage.previewSrc = environment.api + 'preview/' + image.id + '/' + fullImage.width + '/' + fullImage.height; 
		}

		return fullImage;

	}

	public getPoints() {

		let points = [];

	 	if (this.currentTags.length) {

			let checked_tags = {};

			for (let imageIndex of this.currentImages) {
				for (let tagIndex of Object.keys(this.images[imageIndex].t)) {
					if (! checked_tags[tagIndex]) {
						checked_tags[tagIndex] = true;

						let tag = this.tags[tagIndex];

						if (tag.m && tag.m.type == 'point') {
							points.push(tag);
						}

					}
				}

			}

		} else {
			for (let tag of this.tags) {
				if (tag.m && tag.m.type == 'point') {
					points.push(tag);
				}
			}
		}

		return points;

	}

	private sortCurrentImages() {
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

	}

	public getTagIndex(tag) {
		return this.tagIndex[tag.t];
	}

	public rotate(image, clockwise: boolean) : Observable<boolean> {

		if (! environment.api) {
			//TODO - not sure if this works
			return new Observable();
		}

		let url = environment.api + 'rotateimage/' + this.images[image.index].id + '/' + (clockwise ? 'cw' : 'ccw');

		let headers = new HttpHeaders({
			'Content-Type': 'application/json'
		});

		//TODO - Need to handle errors, eg videos,
		//       see browser.component.ts, the error can be handled
		//       there. Surely we can trap the error here (see the
		//       code in my other projects for suggestions)
		return this.http.put(url, {}, {headers: headers}).pipe(
			map(
				response => {
					this.images[image.index].r = 1 / this.images[image.index].r;
					this.images[image.index].cb = Date.now();
					return true;
				}
			)
		);

	}

	public applyTagChanges(add_tags, del_tags) : Observable<boolean> {

		if (! environment.api) {
			//TODO - not sure if this works
			return new Observable();
		}

		let url = environment.api + 'applytags';

		let data = {
			images: this.currentImages.map((index) => this.images[index].id),
			add: add_tags,
			del: del_tags
		}

		let headers = new HttpHeaders({
			'Content-Type': 'application/json'
		});

		return this.http.post(url, data, {headers: headers}).pipe(
			map(
				response => {
					//Generate a diff from what we sent
					let diffs = {}

					for (let image_id of data.images) {
						let image_object = {};

						if (add_tags.length) {
							image_object['add'] = add_tags;
						}

						if (del_tags.length) {
							image_object['del'] = del_tags;
						}

						diffs[image_id] = image_object;
					}

					this.loadDiffs({diffs:diffs});
					
					return true;
				}
			)
		);

	}

	private niceTag(tag, countInCurrent?: number) {

		let label = tag.l;

		if (label === undefined) {
		 	if (tag.m && tag.m.type) {
				label = tag.m.type.charAt(0).toUpperCase() + tag.m.type.slice(1);
			} else {
				label = tag.t;
			}
		}

		let o = {
			index:this.tagIndex[tag.t],
			label:label,
			primary: tag.m !== undefined,
			countInCurrent: countInCurrent
		};

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
		} else if(a.m && a.m.type == 'video') {
			return -1;
		} else if(b.m && b.m.type == 'video') {
			return 1;
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
			if (a.type == 'Year') {
				return -1;
			} else if(b.type == 'Year') {
				return 1;
			}

			if (a.type == 'Month') {
				return -1;
			} else if(b.type == 'Month') {
				return 1;
			}

			if (a.type == 'Day') {
				return -1;
			} else if(b.type == 'Day') {
				return 1;
			}

			return a.type < b.type ? -1 : 1;
		});

	}

	private addTag(key: string, imageIndexes: any, metadata: any) {
		
		if (this.tagIndex[key] !== undefined) {
			return false;
		}

		let tagIndex = this.tags.length;

		let o = {t:key,i:{},p:{}};

		for (let i = 0; i < imageIndexes.length; i++) {
			o.i[imageIndexes[i]] = true;
			this.images[imageIndexes[i]].t[tagIndex] = true;
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
