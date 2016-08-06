'use strict';

angular.module('tagal.metadata',['ui.bootstrap.modal'])
.directive(
 "tagalMetadata",
 function($uibModal) {
	 'use strict';

	 return {
		restrict: 'A',
		link: function(scope,element) {

			var loadHandler = function() {
				element[0].exifdata = null;
				EXIF.getData(element[0]);
			};

			var clickHandler = function() {

				//TODO - change this so the clickhandler is not registered, or handled better, eg set
				//       a flag that the loadHandler will auto open once loaded
				//     - calculate height

				if (! element[0].exifdata) {
					alert('image not loaded');
				}

				var modal = $uibModal.open({
					animation:true,
					templateUrl:'components/metadata/template.html',
					controller:'tagalMetadataModalCtrl',
					resolve: {
						height:element[0].clientHeight, 
						data: function () {
							return transform(element[0].exifdata);
						}
					}
				});
			}

			element.on('load',loadHandler);
			element.on('click',clickHandler);

			scope.$on('$destroy',function() {
				element.off('load',loadHandler);
				element.off('click',clickHandler);
			});

		}
	 }

	 function textVal(val) {

		if (val instanceof Number) {
			if (val.numerator && val.denominator != 1) {
				val = val.numerator + '/' + val.denominator;
			}
		}

		return val;
	 }

	 function transform(data) {

		 var vals = [];

		 if (data.Make && data.Model) {
			 vals.push({key:'Make/Model',value:data.Make + ' / ' + data.Model});
			 delete data.Make;
			 delete data.Model;
		 }

		 if (data.XResolution && data.YResolution) {
			 vals.push({key:'Resolution (X/Y)',value:data.XResolution + '/' + data.YResolution});
			 delete data.XResolution;
			 delete data.YResolution;
		 }

		 var important = ['ExposureTime','FNumber','ISOSpeedRatings'];
		 for (var i = 0; i < important.length; i++) {
			 if (data[important[i]]) {
				 vals.push({key:important[i],value:textVal(data[important[i]])});
				 delete data[important[i]];
			 }
		 }

		 for (var i in data) {
			switch (i) {
				case 'MakerNote':
				case 'UserComment':
					continue;
			}

			var val = data[i];

			if (val) {
				vals.push({key:i,value:textVal(val)});
			}

		 }

		 return vals;

	 }

 }
)
.controller('tagalMetadataModalCtrl',function($scope,$uibModalInstance,height,data) {
	$scope.height = height;
	$scope.data = data;

	$scope.close = function() {
		$uibModalInstance.close();
	}

})
;
