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
					//TODO - when loading from s3, this causes flashing, might be best
					//       to be smarter about which images get added / dropped
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
;
