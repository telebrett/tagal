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

	$scope.viewSelected = false;

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

	$scope.toggleShowSelected = function() {
		$scope.viewSelected = ! $scope.viewSelected;

		//Going go have to reset the number of pages, change what clicking
		//on an image does etc

		alert('TODO');
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
.controller('applyTagsCtrl',function($scope,$uibModalInstance,tags) {

	$scope.selectedTags = tags.selectedTags;
	$scope.remainingTags = tags.remainingTags;
	$scope.newTag = undefined;

	$scope.alpha = [];
	for (var i = 0; i < 26; i++) {

		var letter = {
			label:String.fromCharCode(i+65),
			tags:[]
		};

		for (var x = 0; x < $scope.remainingTags.length; x++) {

			if ($scope.remainingTags[x].label[0].toUpperCase() == letter.label) {
				letter.tags.push($scope.remainingTags[x]);
			}
		}

		if (letter.tags.length > 0) {
			$scope.alpha.push(letter);
		}
	}

	//TODO - give message why year, month, day removed?

	$scope.close = function() {
		$uibModalInstance.close();
	}

	$scope.enterTag = function() {
		$scope.addTag($scope.newTag);
	}

	$scope.selectedTag = function($item) {
		$scope.addTag($item.label,$item.index);
	}

	/**
	 * @param string label
	 * @param int index The index of the tag. Will be undefined for typed in tags and also typeahead tags
	 */
	$scope.addTag = function(label,index) {
		console.log('Add new tag ' + label);
		if (index !== undefined) {
			console.log('With index ' + index);
		}

	}
})
.directive('applyTags',function($uibModal,tagalImages) {
	'use strict';

	return {
		restrict:'A',
		link: function(scope,element) {

			var clickHandler = function() {

				//TODO - add both ways of existing tags. Typeahead search, but also an A-Z listing
				
				//Display number of selected images
				//currentTags - this shows all tags that ANY of the selected images have - possibly with a count 
				//remainingTags - full tags minus currentTags - this is used for an auto complete on the search
				
				//TODO - Remove this once dev is complete, only manually clearing the cache works
				var d = new Date();
				var templateURL = 'views/admin/applytags.html?cachebust=' + d.getTime();

				var modal = $uibModal.open({
					animation:true,
					templateUrl:templateURL,
					controller:'applyTagsCtrl',
					resolve:{
						tags:function() {
							return tagalImages.getSelectedTags(true);
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
