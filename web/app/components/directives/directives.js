'use strict';

angular.module('tagal').directive(
'ngEnter',function(){
	return function (scope,element,attrs) {

		//TODO - does this work on the tablet?
		var handler = function(event) {
			if (event.which === 13) {
				scope.$apply(function(){
					scope.$eval(attrs.ngEnter);
				});
			}
		};

		element.on('keypress',handler);

		scope.$on('$destroy',function(){
			element.off('keypress',handler);
		});
	}
});
