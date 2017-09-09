'use strict';

angular.module('tagal.welcome', ['ngRoute'])

.config(['$routeProvider', function($routeProvider) {
  $routeProvider.when('/welcome', {
    templateUrl: 'views/welcome/view.html',
    controller: 'welcomeCtrl'
  });
}])
.controller('welcomeCtrl', ['$scope',function($scope) {

	$scope.S3Login = {};

	//TODO - redraw on success
	//     - bad credentials
	//     - store credentials in local storage?

	$scope.login = function() {
		$scope.setS3Creds($scope.S3Login.Username,$scope.S3Login.Secret);
	};

}]);
