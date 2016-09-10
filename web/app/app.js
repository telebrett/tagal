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
	 * string t The tag name
	 * string l The label name, optional
	 * object m Metadata for the tag, note key only exists if there is metadata
	 * object i keys are the image indexes, value is true
	 */
	var _tags   = [];

	/**
	 * keys are the tags, values is the index for the tag
	 */
	var _tagindex = {};


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
	 * @param string key
	 * @param array imageIndexes
	 * @param object metadata
	 *
	 * @returns false|int the tag index
	 */
	function addTag(key,imageIndexes,metadata,initialLoad) {

		if (_tagindex[key] !== undefined) {
			return false;
		}

		var tagIndex = _tags.length + 1;

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
		_tagindex[key] = tagIndex;

		return tagIndex;

	};

	function loadDB(res) {
		rootImageDir = res.data.imagedir;

		var index = 0;
		var img;
		while (img = res.data.images.shift()) {
			addImage(index++,img);
		}

		for (var i in res.data.tags) {
			addTag(i,res.data.tags[i],res.data.tagmetadata[i],true);
		}

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
		//TODO - move app functions below into here, eg tagAndLabel, functions to restrict images to remaining tags, etc
		//     - move into a separate file
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

		$scope.menuTags = $scope.menuTags.sort(function(a,b) {

			if (a.type && ! b.type) {
				//a is a "year", "month" or "day" marker
				return -1;
			} else if (b.type && ! a.type) {
				//b is a "year", "month" or "day" marker
				return 1;
			} else if (a.type && b.type) {
				if (a.type != b.type) {
					//Years before months before days

					if (a.type == 'y' || b.type == 'y') {
						return a.type == 'y' ? -1 : 1;
					}

					if (a.type == 'm' || b.type == 'm') {
						return a.type == 'm' ? -1 : 1;
					}
				}
				
				if (a.type == 'y') {
					//year descending
					return a.sort > b.sort ? -1 : 1;
				} else {
					//both is a "month" or "day" marker
					return a.sort < b.sort ? -1 : 1;
				}
			}

			return a.label.toLowerCase() < b.label.toLowerCase() ? -1 : 1;
		});

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
		},
		function(reason) {
			alert('Failed to load');
		}
	);

	//TODO - update everything below to the service

	$scope.addUsedTag = function(tag) {
		$scope.usedTags.push(tagAndLabel(tag));
		buildGallery();
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
			$scope.otherMode = 'Admin';
		}

		$location.path('/' + $scope.currentMode);
		
	}

})
;


