'use strict';

angular.module('tagal').service('tagalImages',function($http,$route,$q){

	var _rootImageDir;
	var _useLocalStorage;

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
	var _images = [];

	/**
	 * Each element is a hash with keys
	 * string t  The tag name
	 * string l  The label name, optional
	 * object m  Metadata for the tag, note key only exists if there is metadata
	 * object i  keys are the image indexes, value is true
	 */
	var _tags   = [];

	/**
	 * keys are the tags, values is the index for the tag
	 */
	var _tagIndex = {};


	//If an image index is in either of these variables, then it is dirty
	var _dirty    = {};
	var _deleted  = {};

	//Selection mode
	var _currentImages = [];
	var _currentTags   = [];
	var _remainingTags = [];
	var _selected      = {};

	var _thumbnailAvgWidth;

	var _s3 = null;
	var _s3bucket = null;
	var _s3lru = null;
	var _s3fails = {};

	var monthNames = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ];

	function buildDateLabel(key,datetype) {

		key = parseInt(key,10);

		switch (datetype){
			case 'month':
				return monthNames[key-1];
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

	function addImage(index,img) {

		var path = img[0].match(/^(.*)\/(.*)$/);

		_images[index] = {p:path[1],f:path[2],r:img[1],t:{},ot:{},o:img[2]};
	};

	/**
	 * @param string keyva
	 * @param array imageIndexes
	 * @param object metadata
	 *
	 * @returns false|int the tag index
	 */
	function addTag(key,imageIndexes,metadata,initialLoad) {

		if (_tagIndex[key] !== undefined) {
			return false;
		}

		var tagIndex = _tags.length;

		var o = {t:key,i:{}};

		for (var i = 0; i < imageIndexes.length; i++) {
			o.i[imageIndexes[i]] = true;
			_images[imageIndexes[i]].t[tagIndex] = true;

			if (initialLoad) {
				_images[imageIndexes[i]].ot[tagIndex] = true;
			} else {
				_dirty[imageIndexes[i]] = true;
			}
		}

		if (metadata) {
			o.m = metadata;

			if (o.m.datetype) {
				o.l = buildDateLabel(o.m.dateval,o.m.datetype);
			}
		}

		_tags.push(o);
		_tagIndex[key] = tagIndex;

		return tagIndex;

	};

	function loadDB(res) {
		_rootImageDir = res.data.imagedir;

		var index = 0;
		var img;

		for (var i in res.data.images) {
			addImage(i,res.data.images[i]);
			delete res.data.images[i];
		}

		for (var i in res.data.tags) {
			addTag(i,res.data.tags[i],res.data.tagmetadata[i],true);
			delete res.data.tags[i];
		}



	}

	/**
	 * object a See tag definition above
	 * object b see tag definition above
	 */
	function sortTags(a,b) {
	}

	function niceTag(tag) {

	}

	//Sets the remainingTags from the tags from the _currentImages
	//but not already selected
	function setRemainingTags() {

		_remainingTags = new Array();

		if (_currentTags.length == 0) {
			_remainingTags = Object.keys(_tags);
		} else {

			var image_tags = {};

			for (var i = 0; i < _currentImages.length; i++) {
				for (var tag_index in _images[_currentImages[i]].t) {
					image_tags[tag_index] = true;
				}
			}


			for (var tag_index in image_tags) {
				if (_currentTags.indexOf(parseInt(tag_index,10)) == -1) {
					_remainingTags.push(tag_index);
				}
			}
		}
	}

	function calcStartIndex(left) {
		var startindex = 0;
			
		if (left > 0) {

			var search = Math.floor(left / _thumbnailAvgWidth);

			if (search > 0 ){
				if (search >= _currentImages.length) {
					//Way too far to the right
					search = _currentImages.length;
					while (--search > 0) {
						possible = _images[_currentImages[search]];
						possible_right = possible.tl + possible.tw;

						if (possible.tl <= left && possible_right > left) {
							startindex = search;
							break;
						}
					}
				} else {
					var possible = _images[_currentImages[search]];

					var possible_right = possible.tl + possible.tw;

					if (possible.tl <= left && possible_right > left) {
						startindex = search;
					} else {

						if (possible_right > left) {
							//we are to the right of where we want to be, go backwards
							while (--search > 0) {
								possible = _images[_currentImages[search]];
								possible_right = possible.tl + possible.tw;

								if (possible.tl <= left && possible_right > left) {
									startindex = search;
									break;
								}
							}
							
						} else {
							while (++search <= _currentImages.length) {
								possible = _images[_currentImages[search]];
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

	function getThumbnailWindow(start_index,count) {

		var win = [];

		var end_index   = Math.min(_currentImages.length,start_index + count);

		var promises = [];

		for (var i = start_index; i < end_index; i++) {
			var image = _images[_currentImages[i]];
			var thumb = {
				width    : Math.round(image.tw),
				height   : Math.round(image.th),
				index    : _currentImages[i],
				left     : image.tl,
				selected : _selected[_currentImages[i]]
			};

			if (_s3) {

				var s3path = _rootImageDir + image.p + '/.thumb/' + image.f;

				if (_s3fails[s3path]) {
					thumb.src = 'failed.png';
					continue;
				}

				var s3cached = _s3lru.get(s3path);

				//Still flickers, but only the thumbnails that were not already on the screen
				if (s3cached) {
					thumb.src = s3cached;
				} else {
					thumb.src   =  'spacer.png';
					thumb.s3src = s3path;
				}
			} else {
				thumb.src = _rootImageDir + '/' + image.p + '/.thumb/' + image.f;
			}

			win.push(thumb);
		}
		
		return win;
	}

	function _s3SRC(s3path, raw) {

		var deferred = $q.defer();

		//The responsecachecontrol means the file is cached for a very long time

		_s3.getObject({
			Bucket:_s3bucket,
			Key:s3path,
			ResponseCacheControl:'max-age=10368000, private'
		},function(err,file){
			if (err) {
				deferred.reject(err);
				_s3fails[s3path] = true;
			} else {

				if (raw) {
					deferred.resolve(new Blob([file.Body]));
				} else {

					var str = window.URL.createObjectURL(new Blob([file.Body], {type: file.ContentType}));
					_s3lru.set(s3path, str);
					deferred.resolve(str);

					//var str = file.Body.reduce(function(a,b){
					//	return a+String.fromCharCode(b);
					//},'');

					//str = 'data:image/jpeg;base64,' + btoa(str).replace(/.{76}(?=.)/g,'$&\n');
					//_s3lru.set(s3path, str);
					//deferred.resolve(str);
				}
			}
		});

		return deferred.promise;

	}

	function setLocalStorage() {

		if (! _useLocalStorage) {
			return;
		}

		//TODO - timestamp or hash of the JSON file

		localStorage.setItem('dirty'   ,JSON.stringify(_dirty));
		localStorage.setItem('deleted' ,JSON.stringify(_deleted));
		localStorage.setItem('tags'    ,JSON.stringify(_tags));
		localStorage.setItem('tagIndex',JSON.stringify(_tagIndex));

		var image_tags = {};
		for (var image_index in _dirty) {
			image_tags[image_index] = _images[image_index].t;
		}

		localStorage.setItem('imageTags',JSON.stringify(image_tags));
	}

	function mergeLocalStorage() {

		//TODO - appears to be a bug where _month_ appears as a tag
		//       nope, thats a bug where NaN is lost in the JSON
		return;

		try {
			//TODO - reenable
			if (localStorage.key('dirty') !== undefined) {

				_dirty    = JSON.parse(localStorage.getItem('dirty'));
				_deleted  = JSON.parse(localStorage.getItem('deleted'));
				_tags     = JSON.parse(localStorage.getItem('tags'));
				_tagIndex = JSON.parse(localStorage.getItem('tagIndex'));

				var image_tags = JSON.parse(localStorage.getItem('imageTags'));

				for (var image_index in image_tags) {
					_images[image_index].t = image_tags[image_index];
				}
			}
		} catch(err) {
			console.log('Failed to load from local storage ' + err.message);
		}



	}

	return {
		/**
		 * string dbfile Path to the JSON database
		 * bool mergeLocalStorage wether to load uncommitted changes from local storage or not
		 */
		init: function(dbfile,useLocalStorage, s3, s3bucket) {

			_s3 = s3;
			_s3bucket = s3bucket;

			if (_s3) {
				_s3lru = new LRU(100);
			}

			if (useLocalStorage) {
				if (typeof(localStorage) !== undefined) {
					_useLocalStorage = true;
				} else {
					alert('Local storage not available');
				}
			}

			var deferred = $q.defer();

			$http.get(dbfile)
			.then(
				loadDB,
				function(){
					//Possibly change this to a promise as well, user might
					//have to make decisions re losing changes
					deferred.reject('Failed to load database');
				}
			)
			.then(
				function(){
					mergeLocalStorage();
					setRemainingTags();
					deferred.resolve();
				}
			);
			
			return deferred.promise;
		},

		commit: function() {

			var data = {images:{},tags:{}};

			for (var image_index in _dirty) {

				data.images[image_index] = [];

				for (var tag_index in _images[image_index].t) {

					if (_tags[tag_index].m && _tags[tag_index].m.datetype) {
						continue;
					}

					data.images[image_index].push(tag_index);
				}

			}

			for (var tag_index in _tags) {

				if (_tags[tag_index].m && _tags[tag_index].m.datetype) {
					continue;
				}

				var o = {t:_tags[tag_index].t};
				if (_tags[tag_index].m) {
					o.m = _tags[tag_index].m;
				}

				data.tags[tag_index] = o;
			}

			//TODO - make the api url dynamic
			
			var post_config = {
				headers: {'Content-Type': 'application/x-www-form-urlencoded'}
			};

			$http.post('/tagalapi/images','data=' + JSON.stringify(data),post_config).then(
				function success(response) {
					alert('Success');
				},
				function error(response) {
					alert('Failed');
				}
			);

			//TODO - delete images

		}

		/**
		 * true|array indexes array of image indexes to select / deselect. If true then all current images are set
		 * bool If true will set selected, if false will deselect, if undefined will toggle
		 */
		,selectImages: function(indexes,select) {

			if (indexes === true) {
				indexes = _currentImages;
			}

			for (var i = 0; i < indexes.length; i++) {

				var is = select === undefined ? (! _images[indexes[i]].s) : select;

				if (is) {
					_images[indexes[i]].s = true;
					_selected[indexes[i]] = true;
				} else {
					delete _images[indexes[i]].s;
					delete _selected[indexes[i]];
				}
			}
		},
		addTag: function(tag) {

			var imageIndexes = [];

			for (var i in _selected) {
				imageIndexes.push(i);
			}

			if (addTag(tag,imageIndexes,{'new':true}) === false) {
				return false;
			}

			for (var i in _selected) {
				checkDirty(i);
			}

			return true;

		}
		/**
		 * Note that the tag index may be undefined, in which case, assign a negative id from the next one
		 *
		 * @param array taglist array of objects with keys index, and label
		 * @param array delete_tag_list array of tag indexes to ensure the image does not have
		 */
		,setSelectedTags: function(tag_list,delete_tag_list) {

			var all_dirty = false;

			var selectedKeys = [];

			for (var i = 0; i < _currentImages.length; i++) {
				if (! _selected[_currentImages[i]]) {
					continue;
				}

				selectedKeys.push(_currentImages[i]);
			}

			for (var i = 0; i < tag_list.length; i++) {
				if (tag_list[i].index === undefined) {
					//Build a new tag, this handles _images, _tags, _tagIndex
					var nt = addTag(tag_list[i].label,selectedKeys,{},false);
					all_dirty = true;
				} else {
					for (var x = 0; x < selectedKeys.length; x++) {
						if (! _images[selectedKeys[x]].t[tag_list[i].index]) {
							_images[selectedKeys[x]].t[tag_list[i].index] = true;
							_tags[tag_list[i].index].i[selectedKeys[x]] = true;
							_dirty[selectedKeys[x]] = true;
						}
					}
				}
			}

			for (var i = 0; i < delete_tag_list.length; i++) {
				for (var x = 0; x < selectedKeys.length; x++) {
					if (_images[selectedKeys[x]].t[delete_tag_list[i].index]) {
						delete _images[selectedKeys[x]].t[delete_tag_list[i].index];
						delete _tags[delete_tag_list[i].index].i[selectedKeys[x]];
						_dirty[selectedKeys[x]] = true;
					}
				}
			}

			setLocalStorage();

			setRemainingTags();

		}
		,deleteImages: function(indexes,cancel) {
			//TODO - update
			for (var i = 0; i < indexes.length; i++) {
				if (cancel) {
					delete _deleted[indexes[i]];
				} else {
					_deleted[indexes[i]] = true;
				}
			}
		}
		,reset: function() {
			//TODO - full reload?
		}
		,getRemainingTags: function(realTagsOnly) {

			var showMonth = false;
			var showDay   = false;

			for (var i = 0; i < _currentTags.length; i++) {
				var tag = _tags[_currentTags[i]];

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

			var unsorted = [];

			for (var i = 0; i < _remainingTags.length; i++) {
				var tag = _tags[_remainingTags[i]];

				if (tag.m && tag.m.datetype) {
					if (realTagsOnly) {
						continue;
					}
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

			var sorted = unsorted.sort(sortTags);

			var o = [];

			for (var i = 0; i < sorted.length; i++) {
				o.push(niceTag(sorted[i]));
			}
			return o;
		}
		,getCurrentTags: function(realTagsOnly) {
			var o = [];

			for (var i = 0; i < _currentTags.length; i++) {
				if (realTagsOnly && _tags[_currentTags[i]].m && _tags[_currentTags[i]].m.datetype) {
					continue;
				}

				o.push(niceTag(_tags[_currentTags[i]]));
			}

			return o;
		}
		,getSelectedTags: function(realTagsOnly) {

			//Returns two tag lists, one which are the tags which ANY of the selected images have
			//The other is the remaining tags

			var selectedTags = {};

			var num_selected = 0;

			for (var i = 0; i < _currentImages.length; i++) {
				if (! _selected[_currentImages[i]]) {
					continue;
				}

				num_selected++;

				for (var tag_index in _images[_currentImages[i]].t) {
					if (_images[_currentImages[i]].t[tag_index]) {
						if (selectedTags[tag_index]) {
							selectedTags[tag_index]++;
						} else {
							selectedTags[tag_index] = 1;
						}
					}
				}

			}

			var r = {
				selectedTags:[],
				remainingTags:[],
				numberSelected:num_selected,
			};

			for (var tag_index = 0; tag_index < _tags.length; tag_index++) {
				if (realTagsOnly && _tags[tag_index].m && _tags[tag_index].m.datetype) {
					continue;
				}

				if (selectedTags[tag_index]) {
					var nice = niceTag(_tags[tag_index]);
					nice.count = selectedTags[tag_index];
					r.selectedTags.push(nice);
				} else {
					r.remainingTags.push(niceTag(_tags[tag_index]));
				}
			}

			return r;

		}
		/**
		 * Adds a tag to the current selection of tags and restricts
		 * the current set of images to those that contain the tag
		 */
		,selectTag : function(index) {

		}
		,deselectTag: function(index) {

		}
		
		/**
		 * @param int height The height to set
		 *
		 * @returns int Total width of the thumbnails
		 */
		,setThumbnailHeights(height) {

		}

		/**
		 * Retrieves a "window" of thumbnails
		 * 
		 * @param int left The left position to start from, this is in pixels
		 * @param int count The maximum number of items to return
		 *
		 * @returns array Each element is a hash with keys src, height, width, index, left
		 *
		 */
		,getThumbnailsByLeft(left,count) {

			var start_index = calcStartIndex(left);

			return getThumbnailWindow(start_index,count);

		}
		,getNumPages(pageSize) {
			return Math.ceil(_currentImages.length / pageSize);
		}
		,getThumbnailsByPage(pageOffset,count) {

			var start_index = count * pageOffset;

			return getThumbnailWindow(start_index,count);

		}
		,getImage(index,maxWidth,maxHeight) {

			var image = _images[index];

			var fullImage = {
				index : index,
				src : _rootImageDir + '/' + image.p + '/' + image.f,
				name : image.f
			};

			var height_from_maxwidth = Math.ceil((1/image.r) * maxWidth);
			var width_from_maxheight = Math.ceil((image.r * maxHeight));

			if (width_from_maxheight <= maxWidth) {
				//max will be the height
				fullImage.height = maxHeight;
				fullImage.width  = Math.ceil(image.r * maxHeight);
			}else{
				fullImage.width  = maxWidth;
				fullImage.height = height_from_maxwidth;
			}

			if (_s3) {
				fullImage.src = 'spacer.png';
				fullImage.s3src = _rootImageDir + image.p + '/' + image.f;
			} else {
				fullImage.previewSrc = '/tagalapi/preview/' + index + '/' + fullImage.width + '/' + fullImage.height; 
			}

			return fullImage;

		},
		s3SRC(s3path, raw) {
			return _s3SRC(s3path, raw);
		}
	}
})
