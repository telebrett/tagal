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

	var rootImageDir;

	/**
	 * Each element is a hash with keys
	 * string s  Image file and path, relative to /pictures
	 * float  r  The ratio of height to width TODO width to height?
	 * array  t  array of tag indexes - the tags that have possibly been added / removed
	 * array  ot array of tag indexes - this is the list of tags that the image has on disk
	 * bool   s  True if the image is currently marked as selected
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
		_images[index] = {s:img[0],r:img[1],t:[],ot:[]};
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
			_images[imageIndexes[i]].t.push(tagIndex);

			if (initialLoad) {
				_images[imageIndexes[i]].ot.push(tagIndex);
			}
		}

		if (metadata) {
			o.m = metadata;

			if (o.m.datetype) {
				o.l = buildDateLabel(key,o.m.datetype);
			}
		}

		_tags.push(o);
		_tagIndex[key] = tagIndex;

		return tagIndex;

	};

	function loadDB(res) {
		rootImageDir = res.data.imagedir;

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

			var as = parseInt(a.t);
			var bs = parseInt(b.t);
			
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
					deferred.resolve(rootImageDir);
				}
			);
			
			return deferred.promise;
		},

		/**
		 * array indexes array of image indexes to select / deselect
		 * bool select
		 */
		selectImages: function(indexes,select) {
			for (var i = 0; i < indexes.length; i++) {
				if (select) {
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

			console.dir(_images);
			console.dir(_tags);

			if (_currentTags.length == 1) {
				var images = array();
			} else {
				//_currentImages is an array of imageIndex
				
			}

			//TODO - filter _remainingTags

		}
	}
})
.controller('tagalCtrl',function($scope,$route,$location,tagalImages){

	//TODO - change galleryImages to be more global so that "selected" and changed "tags" live on regardless of if
	//       the user selects different tags or removes all selected tags completely
	//     - optionally also write to local storage so that page reloads do not clear the state

	//TODO - build hostname from server side config, eg database.json
	if ($location.host() == 'htpc') {
		$scope.allowModes = true;
	}

	$scope.otherMode = 'Admin';
	$scope.currentMode = 'gallery';

	function buildGallery() {

		var show_month,show_day = false;

		$scope.menuTags = [];

		var images;

		$scope.galleryImages = [];
		$scope.thumbWidth = 0;

		if ($scope.usedTags.length > 0) {

			//TODO - Change to limit the tags to only those that are a subset of the current tags
			for (var i = 0; i < $scope.usedTags.length; i++) {
				var res = $scope.usedTags[i];
				if (res.type == 'y') {
					show_month = true;
				} else if(res.type == 'm') {
					show_day = true;
				};


				if (i == 0) {
					images = $scope.data.tags[res.tag];
				} else {
					images = images.filter(function(val){

						if (this.indexOf(val) !== -1){
							return true;
						}

						return false;
						
					},$scope.data.tags[res.tag]);
				}
			}

			var possible_tags = {};
			for (var x in $scope.data.tags) {

				var found = false;

							showDay = true;
							break;
				for (var y = 0; y < $scope.usedTags.length; y++){
					if (x === $scope.usedTags[y].tag){
						found = true;
						break;
					}
				}

				if (! found){
					possible_tags[x] = 0;
				}
			}

			var remaining_tags = {};

			var max = 10000;

			for (var i = 0; i < images.length; i++){
				if (i < max) {
					addImage(images[i]);
				}

				for (var x in possible_tags){
					if ($scope.data.tags[x].indexOf(images[i]) !== -1){
						remaining_tags[x] = true;
					}
				}
			}

			for (var x in remaining_tags) {
				var tag = tagAndLabel(x);
				if (
					tag.type == 'm' && ! show_month
					|| tag.type == 'd' && ! show_day
				) {
					continue;
				}
				$scope.menuTags.push(tagAndLabel(x));
			}

			if ($location.path() == '/welcome') {
				$location.path('/' + $scope.currentMode);
				$route.reload();
			} else {
				$route.reload();
			}

		} else {
			for (var i in $scope.data.tags) {
				var res = tagAndLabel(i);
				if (! res.type || res.type == 'y') {
					$scope.menuTags.push(res);
				}
			}

			$location.path('/welcome');
		}

	}
	
	//TODO - remove
	function addImage(image_index){

		//Images are stored by index as an array. First element is the src, second
		//element is the ratio of the height compared to the width;

		//Height is the definer
		var height = 150;

		var ratio = $scope.data.images[image_index][1];
		var width = ratio * height;

		var src = $scope.data.images[image_index][0];

		var parts = src.match(/\/(\d{4}\/\d{2}\/\d{2}\/)(.*)?/);

		//Images of the form foo.jpg, not yyy-mm-dd etc
		if (! parts) {
			return;
		}

		$scope.galleryImages.push({
			dir:parts[1],
			image:parts[2],
			left:$scope.thumbWidth,
			width:width,
			height:height,
			index:image_index,
			ratio:ratio
		});

		$scope.thumbWidth += width;
		
	}

	tagalImages.init('database.json')
	.then(
		function(rootDir){
			$scope.rootImageDir = rootDir;
			$scope.menuTags = tagalImages.getRemainingTags();
		},
		function(reason) {
			alert('Failed to load');
		}
	);

	//TODO - update everything below to the service

	$scope.addUsedTag = function(tagIndex) {
		tagalImages.selectTag(tagIndex);
		$scope.usedTags = tagalImages.getCurrentTags();
	};

	$scope.removeTag = function(tag) {
		for (var i = 0; i < $scope.usedTags.length; i++) {

			if ($scope.usedTags[i].tag == tag) {
				$scope.usedTags.splice(i,1);
				break;
			}
		}

		buildGallery();
	}

	$scope.swapMode = function() {
		if ($scope.currentMode == 'gallery') {
			$scope.currentMode = 'admin';
			$scope.otherMode = 'Gallery';
		} else {
			$scope.currentMode = 'gallery';
				if (a.metadata.datetype == 'm' || b.metadata.datetype == 'm') {
					return a.metadata.datetype == 'm' ? -1 : 1;
				}
			$scope.otherMode = 'Admin';
		}

		$location.path('/' + $scope.currentMode);
		
	}

})
;


