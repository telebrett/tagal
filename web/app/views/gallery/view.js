'use strict';

angular.module('tagal.gallery', ['ngRoute','tagal.metadata'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/gallery', {
    templateUrl: 'views/gallery/view.html',
	controller: 'galleryCtrl'
  });
}])
.controller('galleryCtrl',['$scope','$window','tagalImages',function($scope,$window,tagalImages){

	//Note, the thumbnail height calcs / set to show are in the tagalImages service
	//this is to minimise copying large arrays
	
	//TODO - mobile mode, padding-left of carousel is incorrect
	//       The problem here is that bootstrap allocates no margin to the left
	//       as it thinks that the left hand navbar should be hidden.
	//
	//       Maybe when on a mobile in vertical mode, change to a layout that is
	//       like the following with the ability to collapse the tag bar
	//
	//       Note sure about where the selected tags go, could be like the following
	//       or see the next
	//
	//       -----------------------------------
	//       | sel tag a | ------------------- |
	//       | sel tag b | |                 | |
	//       |-----------| |                 | |
	//       | tag a     | |   thumbnail     | |
	//       | tag b     | |                 | |
	//       | tag ...   | |                 | |
	//       | tag ...   | |                 | |
	//       | tag ...   | ------------------- |
	//       | tag ...   | ------------------- |
	//       | tag ...   | |                 | |
	//       | tag ...   | |                 | |
	//       | tag ...   | |                 | |
	//       | tag ...   | |   thumbnail     | |
	//       | tag ...   | |                 | |
	//       | tag ...   | |                 | |
	//       | tag ...   | |                 | |
	//       | tag ...   | ------------------- |
	//       |           | ------------------- |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | |   thumbnail     | |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | ------------------- |
	//       |           | ------------------- |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | |   thumbnail     | |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | ------------------- |
	//       |           | ...                 |
	//       -----------------------------------
	//
	//       or 
	//
	//       -----------------------------------
	//       | sel tag a, sel tag b, sel tag c |
	//       | sel tag d
	//       -----------------------------------
	//       | tag a     | ------------------- |
	//       | tag b     | |                 | |
	//       | tag c     | |                 | |
	//       | tag ...   | |   thumbnail     | |
	//       | tag ...   | |                 | |
	//       | tag ...   | |                 | |
	//       | tag ...   | |                 | |
	//       | tag ...   | ------------------- |
	//       | tag ...   | ------------------- |
	//       | tag ...   | |                 | |
	//       | tag ...   | |                 | |
	//       | tag ...   | |                 | |
	//       | tag ...   | |   thumbnail     | |
	//       | tag ...   | |                 | |
	//       | tag ...   | |                 | |
	//       | tag ...   | |                 | |
	//       | tag ...   | ------------------- |
	//       |           | ------------------- |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | |   thumbnail     | |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | ------------------- |
	//       |           | ------------------- |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | |   thumbnail     | |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | |                 | |
	//       |           | ------------------- |
	//       |           | ...                 |
	//       -----------------------------------
	//
	//

	$scope.currentImages = [];
	$scope.currentLeft = 0;
	$scope.leftPos = 0;

	$scope.resizeMainImage = function(height, width) {

		$scope.mainImageHeight = height - $scope.carouselWidth;
		$scope.mainImageWidth = width;

		//TODO - Not working, invoking the function, but then when viewing the next image
		//       everything is all out, the images are too large. Seen when going from a portrait
		//       to another potrait
		//       Also need to investigate when in S3 mode
		if ($scope.mainImageIndex !== undefined) {
			$scope.viewImage($scope.mainImageIndex);
		}
	}

	$scope.setGallerySize = function() {
		//Small screen and in landscape mode
		if ($window.innerHeight < 500 && $window.innerHeight < $window.innerWidth) {
			$scope.carouselHeight = 75;
		} else {
			$scope.carouselHeight = 150;
		}

		//This is the total thumbnail width
		$scope.thumbWidth = tagalImages.setThumbnailHeights($scope.carouselHeight);

		$scope.numToShow = 50;

		$scope.currentImages = tagalImages.getThumbnailsByLeft($scope.currentLeft,$scope.numToShow);
	}

	$scope.setGallerySize();

	//TODO - Make this configurable, smaller number means faster initial page load
	//       but fast scrolling means thumbnails may not be preloaded

	$scope.scroll = function() {
		var left = Math.floor($scope.currentLeft);

		$scope.currentImages = tagalImages.getThumbnailsByLeft($scope.currentLeft,$scope.numToShow);

		$scope.leftPos = Math.round($scope.currentImages[0].left);
	}

	$scope.download = function() {

		if ($scope.mainImage.s3src) {
			//TODO - show a "loading" window

			var mainImage = this.mainImage;

			tagalImages.s3SRC(this.mainImage.s3src, true).then(
				function(data) {
					var a = document.createElement('a');
					a.href = window.URL.createObjectURL(data);
					a.download = mainImage.name;
					a.click();
				},
				function (err) {
					alert('Could not download image');
				}
			);

		} else {
			var a = document.createElement('a');
			a.href = $scope.mainImage.fullsrc;
			a.download = $scope.mainImage.name;
			a.click();
		}

		
	}

	$scope.loadMain = function($event, s3path) {

		var $scoped_scope = $scope;
		
		if (s3path && $event.currentTarget.src.match(/spacer\.png$/)) {
			var elem = $event.currentTarget;
			tagalImages.s3SRC(s3path).then(
				function(data) {
					$scope.mainImage.src = data;
				},
				function(err) {
					//TODO - package error.png
					$scope.mainImage.src = 'error.png';
				}
			);
		}
	}

	$scope.loadThumb = function($event,localIndex) {
		if ($event.currentTarget.src.match(/spacer\.png$/)) {
			var elem = $event.currentTarget;
			tagalImages.s3SRC($scope.currentImages[localIndex].s3src)
			.then(
				function(data) {
					elem.src = data;
				},
				function(err) {
					//console.log('loadthumb err');
				}
			);
		}
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

		if ($scope.APIAvailable && $scope.mainImage.previewSrc) {
			$scope.mainImage.src = $scope.mainImage.previewSrc;
		}

	}

}])
.directive('imageReady',function($parse) {
	return {
		restrict:'A',
		link:function($scope,elem,attrs) {

			//TODO - it is not picking up the height of the scrollbar
			$scope.mainImageHeight = elem[0].clientHeight - $scope.carouselHeight;
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
.directive('onLoad', ['$parse', function($parse) {
	return {
		link: function(scope,elem,attrs) {
			var fn = $parse(attrs.onLoad);
			elem.on('load',function(event) {
				scope.$apply(function() {
					fn(scope, {$event: event});
				});
			});
		}
	};
}])
.directive('onWindowResize', ['$parse', function($parse) {
	return {
		link: function(scope,elem,attrs) {

			var w = angular.element(window);

			var fn = $parse(attrs.onWindowResize);

			var handler = function(event) {

				var h = elem[0].clientHeight;
				var w = elem[0].clientWidth;

				scope.$apply(function() {
					fn(scope, {$height: h, $width: w});
				});
			};

			w.on('resize',handler);

			scope.$on('$destroy', function() {
				w.off('resize', handler);
			});
		}
	};
}])
;
