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


