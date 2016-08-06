'use strict';

angular.module('tagal.gallery', ['ngRoute','tagal.metadata'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/gallery', {
    templateUrl: 'views/gallery/view.html',
	controller: 'galleryCtrl'
  });
}])
.controller('galleryCtrl',['$scope',function($scope){

	$scope.numToShow = 200;

	$scope.currentImages = [];
	$scope.currentLeft = 0;

	$scope.leftPos = 0;

	if ($scope.galleryImages) {
		var max = Math.min($scope.galleryImages.length,$scope.numToShow);

		for (var i = 0; i < max; i++) {
			$scope.currentImages.push($scope.galleryImages[i]);
		}
	}

	function calcStartIndex() {
		var startindex = 0;

		var left = Math.floor($scope.currentLeft);
			
		//TODO - admin_mode - not reliant on left position, but a specific index
		if (left > 0) {
			var search = Math.floor(left / 200);

			if (search > 0 ){
				if (search >= $scope.galleryImages.length) {
					//Way too far to the right
					search = $scope.galleryImages.length;
					while (--search > 0) {
						possible = $scope.galleryImages[search];
						possible_right = possible.left + possible.width;

						if (possible.left <= left && possible_right > left) {
							startindex = search;
							break;
						}
					}
				} else {
					var possible = $scope.galleryImages[search];

					var possible_right = possible.left + possible.width;

					if (possible.left <= left && possible_right > left) {
						startindex = search;
					} else {

						if (possible_right > left) {
							//we are to the right of where we want to be, go backwards
							while (--search > 0) {
								possible = $scope.galleryImages[search];
								possible_right = possible.left + possible.width;

								if (possible.left <= left && possible_right > left) {
									startindex = search;
									break;
								}
							}
							
						} else {
							while (++search <= $scope.galleryImages.length) {
								possible = $scope.galleryImages[search];
								possible_right = possible.left + possible.width;

								if (possible.left <= left && possible_right > left) {
									startindex = search;
									break;
								}
							}
						}
					}
				}
			}
		}

		return startindex;

	}


	$scope.scroll = function() {

		var startindex = calcStartIndex();

		$scope.currentImages = [];

		for (var i = 0; i < $scope.numToShow; i++) {
			var ix = i+startindex;
			if (ix >= $scope.galleryImages.length) {
				break;
			}

			$scope.currentImages.push($scope.galleryImages[ix]);
		}

		$scope.leftPos = Math.round($scope.galleryImages[startindex].left);
	}

	$scope.viewImage = function(image) {

		$scope.mainImage = image;

		var ratio = image.ratio;

		var height_from_maxwidth = (1/ratio) * this.mainImageWidth;
		var width_from_maxheight = (ratio * this.mainImageHeight);

		if (width_from_maxheight <= this.mainImageWidth) {
			//max will be the height
			image.fullHeight = this.mainImageHeight;
			image.fullWidth = ratio * image.fullHeight;
		}else{
			image.fullWidth = this.mainImageWidth;
			image.fullHeight = height_from_maxwidth;
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
