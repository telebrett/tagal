'use strict';

angular.module('tagal.admin', ['ngRoute','tagal.metadata','ui.bootstrap.modal'])
.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/admin', {
    templateUrl: 'views/admin/view.html',
	controller: 'adminCtrl'
  });
}])
.controller('adminCtrl',['$scope','tagalImages',function($scope,tagalImages){

	//TODO - metadata modal height
	//     - double click for metadata model?
	//     - double click to show full image?
	//     - increase numToShow - just low for dev purposes
	//     - adding a new tag reloads gallery

	function setCurrentImages(updateExisting) {
		var images = tagalImages.getThumbnailsByPage($scope.selectedPage.index,$scope.numToShow);

		if (! updateExisting) {
			$scope.currentImages = images;
			return;
		}

		//Replacing $scope.currentImages causes the images to "blink"
		for (var i = 0; i < images.length; i++) {
			$scope.currentImages[i].selected = images[i].selected;
		}
	}

	$scope.numToShow = 50;
	$scope.selectedPage = {index:0};

	//Enumerators for the selectImages function
	$scope.selectNone        = 0;
	$scope.selectAll         = 1;
	$scope.selectCurrentPage = 2;

	//Minimise passing around large sets of data
	tagalImages.setThumbnailHeights(150);
	$scope.numPages      = tagalImages.getNumPages($scope.numToShow);
	
	setCurrentImages();

	$scope.pages = [{index:0}];
	for (var i = 1; i < $scope.numPages; i++) {
		$scope.pages.push({index:i});
	}

	$scope.selectPage = function() {
		setCurrentImages();
	}

	$scope.pager = function(inc) {

		var newindex = Math.min(Math.max($scope.selectedPage.index + inc,0),$scope.numPages-1);

		$scope.selectedPage = {index:newindex};
		setCurrentImages();
	}

	$scope.selectImages = function(type) {
		switch(type) {
			case $scope.selectNone:
			case $scope.selectAll:
				tagalImages.selectImages(true,(type == $scope.selectAll));
				break;
			case $scope.selectCurrentPage:
				var indexes = [];
				for (var i = 0; i < $scope.currentImages.length; i++) {
					indexes.push($scope.currentImages[i].index);
				}
				tagalImages.selectImages(indexes,true);
				break;
		}
		setCurrentImages(true);
	}

	$scope.resetImages = function(updateExisting) {
		setCurrentImages(updateExisting);
	}

}])
.directive('adminSelect',function($route,tagalImages) {
	return {
		restrict:'A',
		link: function(scope,element,attrs) {

			var clickHandler = function() {
				tagalImages.selectImages([attrs.adminSelect]);
				scope.resetImages(true);
				scope.$apply();
			};

			element.on('click',clickHandler);

			scope.$on('$destroy',function() {
				element.off('click',clickHandler);
			});

		}
	}
})
.controller('applyTagsCtrl',function($scope,$uibModalInstance,currentTags) {

	$scope.currentTags = currentTags;

	//TODO - give message why year, month, day removed?

	$scope.close = function() {
		$uibModalInstance.close();
	}
})
.directive('applyTags',function($uibModal) {
	'use strict';

	return {
		restrict:'A',
		link: function(scope,element) {

			var clickHandler = function() {

				var modal = $uibModal.open({
					animation:true,
					templateUrl:'views/admin/applytags.html',
					controller:'applyTagsCtrl',
					resolve:{
						currentTags:function() {
							return [{tag:'foo'},{tag:'bar'}];
						}
					}
				});
			}

			element.on('click',clickHandler);
			element.on('$destroy',function() {
				element.off('click',clickHandler);
			});

		}
	};
})
;
