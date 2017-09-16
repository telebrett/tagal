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
.controller('tagalCtrl',function($scope,$route,$location,$http,tagalImages){

	$scope.S3 = false;
	$scope.S3Creds = null;

	//     - optionally also write to local storage so that page reloads do not clear the state

	//TODO - build hostname from server side config, eg database.json
	if ($location.host() == 'htpc') {
		$scope.APIAvailable = true;
	} else if ($location.host.endsWith('amazonaws.com')) {
		$scope.S3 = true;
	}

	if ($location.url().match('_s3_')) {
		console.log('testing s3');
		$scope.S3 = true;
	}

	$scope.otherMode = 'Admin';
	$scope.currentMode = 'gallery';

	if ($scope.S3) {
		$http.get('s3db.json').then(
			function(res) {
				$scope.s3db = res.data;
			},
			function() {
			}
		);
	}

	if ($scope.S3) {
		//Check we are not in the gallery
		if (! $scope.S3Creds && $location.path() == '/gallery') {
			$location.path('/welcome');
		}
	} else {
		tagalImages.init('database.json', $scope.APIAvailable)
		.then(
			function(){
				$scope.menuTags = tagalImages.getRemainingTags();
			},
			function(reason) {
				alert('Failed to load');
			}
		);
	}

	$scope.setS3Creds = function(username,secret) {

		if (!(username in $scope.s3db.users)) {
			return false;
		}

		var creds = new AWS.Credentials({
			'accessKeyId':$scope.s3db.users[username].accesskey,
			'secretAccessKey':secret
		});

		var s3 = new AWS.S3({
			'credentials':creds,
			'region':$scope.s3db.region
		});

		$scope.S3Creds = true;

		tagalImages.init($scope.s3db.users[username].db, $scope.APIAvailable, s3, $scope.s3db.bucket)
		.then(
			function(){
				$scope.menuTags = tagalImages.getRemainingTags();
			},
			function(reason) {
				alert('Failed to load');
			}
		);

	};

	$scope.showGallery = function() {
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
		this.showGallery();
	};

	$scope.removeTag = function(tagIndex) {
		tagalImages.deselectTag(tagIndex);
		this.showGallery();
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


