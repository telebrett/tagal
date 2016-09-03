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
.service('tagalImages',function($http,$route){

	/**
	 * Each element is a hash with keys
	 * string src Image file and path, relative to /pictures
	 * float ratio The ratio of height to width TODO width to height?
	 * array tags array of tag names - the tags that have possibly been added / removed
	 * array otags array of tag names - this is the list of tags that the image has on disk
	 */
	var _images = [];

	//Note that _tags is just an index
	var _tags   = {};

	var _selected = {};

	//If an image index is in either of these variables, then it is dirty
	var _dirty    = {};
	var _deleted  = {};

	return {
		/**
		 * array initialTags keys are tag names, values are an array of image indexes
		 */
		init: function(initialTags) {
			_tags = initialTags;
		},
		getImages : function() {
			return _images;
		},
		addImage: function(index,src,ratio) {

			//Note, setTags must be called first

			_images[index] = {src:src,ratio:ratio,tags:[],otags:[]};

			for (var t in _tags) {
				if (_tags[t].indexOf(index) != -1) {
					_images[index].tags.push(t);
					_images[index].otags.push(t);
				}
			}
		},
		/**
		 * array indexes array of image indexes to select / deselect
		 * bool select
		 */
		selectImages: function(indexes,select) {
			for (var i = 0; i < indexes.length; i++) {
				if (select) {
					_selected[indexes[i]] = true;
				} else {
					delete _selected[indexes[i]];
				}
			}
		},
		addTag: function(tag) {

			//TODO defense in depth - ensure cannot add a year, month or day tag?

			for (var image_index in _selected) {

				if (_images[image_index].tags.indexOf(tag) == -1) {
					_images[image_index].tags.push(tag);

					checkDirty(image_index);

					if (_tags[tag].indexOf(i) == -1) {
						_tags[tag].push(i);
					}
				}
			}
		},
		removeTag: function(tag) {
			for (var image_index in selected) {

				var tag_index = _images[image_index].tags.indexOf(tag);

				if (tag_index != -1) {
					_images[image_index].tags.splice(tag_index,1);

					checkDirty(image_index);

					var tag_image_index = _tags[tag].indexOf(image_index);

					if (tag_image_index != -1) {
						_tags[tag].splice(tag_image_index,1);
					}
				}
			}

		}
		,checkDirty(image_index) {
			//TODO - compare tags and otags
			//       case insensitive?
			//       certainly order not important

		}
		,deleteImages: function(indexes,cancel) {
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
.controller('tagalCtrl',function($scope,$http,$route,$location,tagalImages){

	//TODO - change galleryImages to be more global so that "selected" and changed "tags" live on regardless of if
	//       the user selects different tags or removes all selected tags completely
	//     - optionally also write to local storage so that page reloads do not clear the state

	//TODO - build hostname from server side config, eg database.json
	if ($location.host() == 'htpc') {
		$scope.allowModes = true;
	}

	$scope.otherMode = 'Admin';
	$scope.currentMode = 'gallery';

	function tagAndLabel(tag){
		var m = tag.match(/^(m|d|y)(.*)$/);

		//Three element array
		//
		// first is the label for the tag
		// Second is the "type" of tag eg y for year, m for month
		// Third is the numeric sort

		if (! m){
			return {tag:tag,label:tag,type:undefined,sort:undefined};
		}

		var monthNames = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ];

		var label = parseInt(m[2],10);
		var data = label;

		switch (m[1]){
			case 'm':
				label = monthNames[data-1];
				break;
			case 'd':
				switch (data) {
					case 1:
					case 21:
					case 31:
						label = data + 'st';
						break;
					case 2:
					case 22:
						label = data + 'nd';
						break;
					case 3:
					case 23:
						label = data + 'rd';
						break;
					default:
						label = data + 'th';
						break;
				}
				break;
		}

		return {tag:tag,label:label,type:m[1],sort:data};

	};

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
				}

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

	$http.get('database.json')
	.then(function(res){

		$scope.data = res.data;

		$scope.usedTags      = [];
		$scope.galleryImages = [];
		$scope.thumbWidth    = 0;

		$scope.rootImageDir = res.data.imagedir;

		//$scope.addUsedTag('y2015'); //TODO - Remove this and uncomment the line below this one
		buildGallery();

	});

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


