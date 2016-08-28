'use strict';

angular.module('tagal.admin', ['ngRoute','tagal.metadata','ui.bootstrap.modal'])
.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/admin', {
    templateUrl: 'views/admin/view.html',
	controller: 'adminCtrl'
  });
}])
.controller('adminCtrl',['$scope',function($scope){

	//TODO - metadata modal height
	//     - double click for metadata model?
	//     - double click to show full image?
	//     - increase numToShow - just low for dev purposes
	//     - adding a new tag reloads gallery

	$scope.numToShow = 50;
	$scope.selectedPage = {index:0};
	$scope.numPages = 0;

	//Enumerators for the selectImages function
	$scope.selectNone        = 0;
	$scope.selectAll         = 1;
	$scope.selectCurrentPage = 2;

	function setCurrentImages() {

		var offset = $scope.selectedPage.index;

		var start = $scope.numToShow * offset;
		var max = Math.min($scope.galleryImages.length, start+$scope.numToShow);

		$scope.currentImages = [];

		for (var i = start; i < max; i++) {
			$scope.currentImages.push($scope.galleryImages[i]);
		}

	}

	if ($scope.galleryImages) {
		$scope.numPages = Math.ceil($scope.galleryImages.length / $scope.numToShow);

		setCurrentImages();

		$scope.pages = [];
		for (var i = 0; i < $scope.numPages; i++) {
			$scope.pages.push({index:i});
		}
	} else {
		$scope.pages = [{index:0}];
	}

	$scope.selectPage = function() {
		setCurrentImages();
	}

	$scope.pager = function(inc) {

		var newindex = Math.min(Math.max($scope.selectedPage.index + inc,0),$scope.numPages-1);

		$scope.selectedPage = {index:newindex};
		setCurrentImages();
	}

	//TODO - investigate using a 'service' to share properties across controllers and hence keep the selected
	//       state between changing selected tags

	$scope.selectImages = function(type) {
		switch(type) {
			case $scope.selectNone:
			case $scope.selectAll:
				for (var i = 0; i < $scope.galleryImages.length; i++) {
					$scope.galleryImages[i].selected = (type == $scope.selectAll);
				}
				break;
			case $scope.selectCurrentPage:
				for (var i = 0; i < $scope.currentImages.length; i++) {
					$scope.galleryImages[i].selected = true;
				}
				break;
		}
	}
}])
.directive('adminSelect',function($route) {
	return {
		restrict:'A',
		link: function(scope,element,attrs) {

			//TODO - changing tags kills the selection

			var clickHandler = function() {
				scope.$parent.currentImages[attrs.adminSelect].selected = ! scope.$parent.currentImages[attrs.adminSelect].selected;
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
