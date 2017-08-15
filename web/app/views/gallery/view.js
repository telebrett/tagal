'use strict';

angular.module('tagal.gallery', ['ngRoute','tagal.metadata'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/gallery', {
    templateUrl: 'views/gallery/view.html',
	controller: 'galleryCtrl'
  });
}])
.controller('galleryCtrl',['$scope','tagalImages',function($scope,tagalImages){

	//Note, the thumbnail height calcs / set to show are in the tagalImages service
	//this is to minimise copying large arrays

	//This is the total thumbnail width
	$scope.thumbWidth = tagalImages.setThumbnailHeights(150);

	$scope.currentImages = [];
	$scope.currentLeft = 0;
	$scope.leftPos = 0;

	//TODO - Make this configurable, smaller number means faster initial page load
	//       but fast scrolling means thumbnails may not be preloaded
	$scope.numToShow = 50;

	$scope.currentImages = tagalImages.getThumbnailsByLeft($scope.currentLeft,$scope.numToShow);

	$scope.scroll = function() {
		var left = Math.floor($scope.currentLeft);

		$scope.currentImages = tagalImages.getThumbnailsByLeft($scope.currentLeft,$scope.numToShow);

		$scope.leftPos = Math.round($scope.currentImages[0].left);
	}

	$scope.download = function() {
		//TODO - change to open in a new window
		window.location = $scope.mainImage.fullsrc;
	}

	$scope.viewImage = function(currentImages_index) {

		if (currentImages_index == 'prev') {
			$scope.mainImageIndex = Math.max(0,$scope.mainImageIndex-1);
		} else if(currentImages_index == 'next') {
			$scope.mainImageIndex = Math.min($scope.currentImages.length-1,$scope.mainImageIndex+1);
		} else {
			$scope.mainImageIndex = currentImages_index;
		}

		$scope.mainImage = tagalImages.getImage($scope.currentImages[$scope.mainImageIndex].index,this.mainImageWidth,this.mainImageHeight);

		$scope.mainImage.fullsrc = $scope.mainImage.src;

		if ($scope.APIAvailable) {
			$scope.mainImage.src = $scope.mainImage.previewSrc;
		}
	}

}])
.directive('imageReady',function($parse) {
	return {
		restrict:'A',
		link:function($scope,elem,attrs) {

			//TODO - it is not picking up the height of the scrollbar
			$scope.mainImageHeight = elem[0].clientHeight - 150;
			$scope.mainImageWidth  = elem[0].clientWidth;

			if ($scope.currentImages.length > 0) {
				$scope.viewImage(0);
			}

		}
	}
})
.directive('onScroll', function($timeout) {
    'use strict';

    return {
        scope: {
            onScroll: '&onScroll',
        },
        link: function(scope, element) {
            var scrollDelay = 100;

			var timeout;

			var scrollHandler = function() {
				if (timeout) {
					$timeout.cancel(timeout);
					timeout = null;
				}

				timeout = $timeout(function() {
					timeout = null;
					scope.$parent.currentLeft = element[0].scrollLeft; //seems horrible but I can't see how to pass it back up any other way
					scope.onScroll();
				},scrollDelay);
			};

            element.on("scroll", scrollHandler);

            scope.$on('$destroy', function() {
                element.off('scroll', scrollHandler);
            });
        }
    };
})
;
