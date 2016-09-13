'use strict';

// Declare app level module which depends on views, and components
angular.module('tagal', [
  'ngRoute',
  'tagal.welcome',
  'tagal.gallery',
  'tagal.admin',
  'tagal.version',
  'tagal.metadata',
  'ui.bootstrap',
]).
config(['$locationProvider', '$routeProvider', function($locationProvider, $routeProvider) {
  $locationProvider.hashPrefix('!');

  $routeProvider.otherwise({redirectTo: '/welcome'});
}])
.service('tagalImages',function($http,$route,$q){

	var _rootImageDir;

	/**
	 * Each element is a hash with keys
	 * string  p  Image path, relative to /pictures
	 * string  f  Image filename eg 'foo.jpg'
	 * float   r  The ratio of height to width TODO width to height?
	 * object  t  array of tag indexes - the tags that have possibly been added / removed
	 * object  ot array of tag indexes - this is the list of tags that the image has on disk
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
	 * string ty The tag type
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

		_images[index] = {p:path[1],f:path[2],r:img[1],t:{},ot:{}};
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

		_remainingTags = [];

		var index = 0;
		var img;
		while (img = res.data.images.shift()) {
			addImage(index++,img);
		}

		for (var i in res.data.tags) {
			_remainingTags.push(addTag(i,res.data.tags[i],res.data.tagmetadata[i],true));
		}

	}

	/**
	 * object a See tag definition above
	 * object b see tag definition above
	 */
	function sortTags(a,b) {
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

			var as = parseInt(a.m.dateval);
			var bs = parseInt(b.m.dateval);
			
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

	function niceTag(tag) {

		var o = {
			index:_tagIndex[tag.t],
			label:tag.l === undefined ? tag.t : tag.l,
		};

		if (tag.m && tag.m.datetype) {
			switch (tag.m.datetype) {
				case 'year':
					o.type = 'y';
					break;
				case 'month':
					o.type = 'm';
					break;
				case 'day':
					o.type = 'd';
					break;
			}
		}

		return o;
	}

	//Sets the remainingTags from the tags from the _currentImages
	//but not already selected
	function setRemainingTags() {
		var image_tags = {};

		for (var i = 0; i < _currentImages.length; i++) {
			for (var tag_index in _images[_currentImages[i]].t) {
				image_tags[tag_index] = true;
			}
		}

		_remainingTags = new Array();

		for (var tag_index in image_tags) {
			if (_currentTags.indexOf(parseInt(tag_index,10)) == -1) {
				_remainingTags.push(tag_index);
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

		for (var i = start_index; i < end_index; i++) {
			var image = _images[_currentImages[i]];
			win.push({
				src      :_rootImageDir + '/' + image.p + '/.thumb/' + image.f,
				width    : image.tw,
				height   : image.th,
				index    : _currentImages[i],
				left     : image.tl,
				selected : _selected[_currentImages[i]]
			});
		}

		return win;

	}


	return {
		/**
		 * array initialTags keys are tag names, values are an array of image indexes
		 */
		init: function(dbfile) {

			var deferred = $q.defer();

			$http.get(dbfile)
			.then(
				loadDB,
				function(){
					deferred.reject('Failed to load database');
				}
			)
			.then(
				function(){
					deferred.resolve(_rootImageDir);
				}
			);
			
			return deferred.promise;
		},

		/**
		 * true|array indexes array of image indexes to select / deselect. If true then all current images are set
		 * bool If true will set selected, if false will deselect, if undefined will toggle
		 */
		selectImages: function(indexes,select) {

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

		},
		removeTag: function(tag) {
			//TODO - update

		}
		,checkDirty(image_index) {
			//TODO - compare tags and otags
			//       case insensitive?
			//       certainly order not important

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
		,commit: function() {
			//TODO - http post, _dirty images and _delete images

		}
		,reset: function() {
			//TODO - full reload?
		}
		,getRemainingTags: function() {

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
		,getCurrentTags: function() {
			var o = [];

			for (var i = 0; i < _currentTags.length; i++) {
				o.push(niceTag(_tags[_currentTags[i]]));
			}

			return o;
		}
		,selectTag : function(index) {

			if (_currentTags.indexOf(index) !== -1) {
				return;
			}

			_currentTags.push(index);

			if (_currentTags.length == 1) {
				_currentImages = Object.keys(_tags[index].i);
			} else {
				var ts = _tags[index].i;
				_currentImages = _currentImages.filter(function(v){return ts[v] !== undefined});
			}

			setRemainingTags();

		}
		,deselectTag: function(index) {

			var ct_index = _currentTags.indexOf(parseInt(index,10));

			if (ct_index != -1) {
				_currentTags.splice(ct_index,1);
			}

			_currentImages = [];

			if (_currentTags.length == 0) {
				_remainingTags = [];
				//values need to be ints so can't use Object.keys
				for (var i = 0; i < _tags.length; i++) {
					_remainingTags.push(i);
				}
				return;
			}

			var images;

			for (var i = 0; i < _currentTags.length; i++) {
				var newimages = {};
				for (var x in _tags[_currentTags[i]].i) {
					if (i > 0 && ! images[x]) {
						continue;
					}
					newimages[x] = true;
				}

				images = newimages;
			}

			for (var i in images) {
				_currentImages.push(parseInt(i));
			}

			setRemainingTags();
		}
		
		/**
		 * @param int height The height to set
		 *
		 * @returns int Total width of the thumbnails
		 */
		,setThumbnailHeights(height) {

			var totalWidth = 0;

			_thumbnailAvgWidth = height * 1.25;

			//TODO - could possible do some performance improvements here, cache the height
			//       and if the same as the last time, just reset the tl property

			for (var i = 0; i < _currentImages.length; i++) {
				var image = _images[_currentImages[i]];

				image.th = height;
				image.tw = image.r * height;
				image.tl = totalWidth;

				totalWidth += image.tw;
			}

			return totalWidth;
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
				src : _rootImageDir + '/' + image.p + '/' + image.f
			};

			var height_from_maxwidth = (1/image.r) * maxWidth;
			var width_from_maxheight = (image.r * maxHeight);

			if (width_from_maxheight <= maxWidth) {
				//max will be the height
				fullImage.height = maxHeight;
				fullImage.width  = image.r * image.height;
			}else{
				fullImage.width  = maxWidth;
				fullImage.height = height_from_maxwidth;
			}
			
			return fullImage;

		}
	}
})
.controller('tagalCtrl',function($scope,$route,$location,tagalImages){

	//     - optionally also write to local storage so that page reloads do not clear the state

	//TODO - build hostname from server side config, eg database.json
	if ($location.host() == 'htpc') {
		$scope.allowModes = true;
	}

	$scope.otherMode = 'Admin';
	$scope.currentMode = 'gallery';
	
	tagalImages.init('database.json')
	.then(
		function(rootDir){
			//TODO - can we get rid of this variable?
			$scope.rootImageDir = rootDir;
			$scope.menuTags = tagalImages.getRemainingTags();
		},
		function(reason) {
			alert('Failed to load');
		}
	);

	function showGallery() {
		$scope.usedTags = tagalImages.getCurrentTags();
		$scope.menuTags = tagalImages.getRemainingTags();

		if ($scope.usedTags.length > 0) {
			if ($location.path() == '/welcome') {
				$location.path('/' + $scope.currentMode);
			}
		} else {
			$location.path('/welcome');
		}

		$route.reload();
	}

	$scope.addUsedTag = function(tagIndex) {
		tagalImages.selectTag(tagIndex);
		showGallery();
	};

	$scope.removeTag = function(tagIndex) {
		tagalImages.deselectTag(tagIndex);
		showGallery();
	}

	$scope.swapMode = function() {

		//TODO - bug, label shows 'Admin' but actually in gallery mode in some cases

		if ($scope.currentMode == 'gallery') {
			$scope.currentMode = 'admin';
			$scope.otherMode = 'Gallery';
		} else {
			$scope.currentMode = 'gallery';
			$scope.otherMode = 'Admin';
		}

		$location.path('/' + $scope.currentMode);
		
	}

})
;


