'use strict';

// Declare app level module which depends on views, and components
angular.module('tagal', [
  'ngRoute',
  'tagal.welcome',
  'tagal.gallery',
  'tagal.version',
]).
config(['$locationProvider', '$routeProvider', function($locationProvider, $routeProvider) {
  $locationProvider.hashPrefix('!');

  $routeProvider.otherwise({redirectTo: '/welcome'});
}])
.controller('tagalCtrl',function($scope,$http,$location){

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
				var res = tagAndLabel($scope.usedTags[i]);
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
					if (x === $scope.usedTags[y]){
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

			$location.path('/gallery');

			//This seems like a horrible hack but I can't figure out to notify the child view
			if ($scope.reloadGallery) {
				$scope.reloadGallery();
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

		$scope.menuTags.sort(function(a,b) {

			if (a.type && ! b.type) {
				//a is a "year", "month" or "day" marker
				return -1;
			} else if (b.type && ! a.type) {
				//b is a "year", "month" or "day" marker
				return 1;
			} else if (a.type && b.type) {
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
			index:image_index
		});

		$scope.thumbWidth += width;
		
	}

	$http.get('database.json')
	.then(function(res){
		$scope.data = res.data;

		$scope.usedTags      = [];
		$scope.galleryImages = [];
		$scope.thumbWidth    = 0;

		$scope.addUsedTag('y2015'); //TODO - Remove this and uncomment the line below this one
		//buildGallery();

	});

	$scope.addUsedTag = function(tag) {
		$scope.usedTags.push(tag);
		buildGallery();
	};

})
;


