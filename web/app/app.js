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
		$scope.APIAvailable = true;
	} else if ($location.host.endsWith('amazonaws.com')) {
		$scope.S3 = true;
	}

	console.log('forcing s3 mode for testing purposes');
	$scope.S3 = true;

	$scope.otherMode = 'Admin';
	$scope.currentMode = 'gallery';

	//TODO - If in S3, load from a small username db which looks like the following
	$scope.s3db = {
		'users': {
			'mpt': {
				'accesskey':'AKIAIPWWX52EWEJJRTXQ',
				'db'       : 'database.json'
			}
		},
		'region':'ap-southeast-2',
		'bucket':'bgmc-htpcbackup-syd'
	};

	if (! $scope.S3) {
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


