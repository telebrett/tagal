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
	//     - "Show dirty" mode, list the on disk tags vs the live tags

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
.controller('applyTagsCtrl',function($scope,$route,$uibModalInstance,tagalImages,tags,originalScope) {

	//TODO BUG - Click on a letter, then click inside the textbox, JS error re $apply being NULL

	function buildAlpha() {
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
	}

	$scope.selectedTags   = tags.selectedTags;
	$scope.remainingTags  = tags.remainingTags;

	//Array of tag objects specifically added
	//If we just sent the remainingTags then you open where
	//one image has a tag and "Apply tags" would then set the tag against all selected
	var _addedTags   = [];

	//Array of tab objects deleted
	var _deletedTags = [];

	//This is tied to the textbox for search
	$scope.newTag = undefined;

	buildAlpha();

	//TODO - give message why year, month, day removed?
	
	$scope.applyChanges = function() {
		console.log('Adding');
		console.dir(_addedTags);
		console.log('Deleting');
		console.dir(_deletedTags);

		tagalImages.setSelectedTags(_addedTags,_deletedTags);
		$uibModalInstance.close();
		originalScope.showGallery();
	}

	$scope.close = function() {
		$uibModalInstance.close();
	}

	$scope.enterTag = function() {
		$scope.addTag($scope.newTag);
		$scope.newTag = '';
	}

	$scope.selectedTag = function($item) {
		$scope.addTag($item.label,$item.index);
	}

	/**
	 * @param string label
	 * @param int index The index of the tag. Will be undefined for typed in tags and also typeahead tags
	 */
	$scope.addTag = function(label,index) {

		_addedTags.push({label:label,index:index});

		$scope.selectedTags.push({label:label,index:index,count:tags.numberSelected});

		for (var i = 0; i < _deletedTags.length; i++) {
			if (index === undefined) {
				if (_deletedTags[i].index === undefined && _deletedTags[i].label.toLowerCase() == label.toLowerCase()) {
					_deletedTags.splice(i,1);
					break;
				}
			} else {
				if (_deletedTags[i].index == index) {
					_deletedTags.splice(i,1);
					break;
				}
			}
		}

		for (var i = 0; i < $scope.remainingTags.length; i++) {
			if (index === undefined) {
				if ($scope.remainingTags[i].index === undefined && $scope.remainingTags[i].label.toLowerCase() == label.toLowerCase()) {
					$scope.remainingTags.splice(i,1);
					break;
				}
			} else {
				if ($scope.remainingTags[i].index == index) {
					$scope.remainingTags.splice(i,1);
					buildAlpha();
					break;
				}
			}
		}
	}

	//TODO - disable the Apply tags button if no images selected

	$scope.removeTag = function(x) {

		for (var i = 0; i < _addedTags.length; i++) {
			if (x.index === undefined) {
				if (_addedTags[i].index === undefined && _addedTags[i].label.toLowerCase() == x.label.toLowerCase()) {
					_addedTags.splice(i,1);
					break;
				}
			} else {
				if (_addedTags[i].index == x.index) {
					_addedTags.splice(i,1);
					break;
				}
			}
		}

		if (x.index !== undefined) {
			var found = false;
			for (var i = 0; i < _deletedTags.length; i++) {
				if (_deletedTags[i].index == x.index) {
					found = true;
					break;
				}
			}

			if (! found) {
				_deletedTags.push(x);
			}
		}

		for (var i = 0; i < $scope.selectedTags.length; i++) {
			if (x.index === undefined) {
				if ($scope.selectedTags[i].index === undefined && $scope.selectedTags[i].label.toLowerCase() == x.label.toLowerCase()) {
					$scope.selectedTags.splice(i,1);
					break;
				}
			} else {

				if ($scope.selectedTags[i].index == x.index) {
					var removed = $scope.selectedTags.splice(i,1);
					$scope.remainingTags.push(removed.pop());
					buildAlpha();
					break;
				}
			}
		}

		
	}
})
.directive('applyTags',function($uibModal,tagalImages) {
	'use strict';

	return {
		restrict:'A',
		link: function(scope,element) {

			var clickHandler = function() {

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
						},
						originalScope:scope
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
