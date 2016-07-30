'use strict';

angular.module('tagal.version', [
  'tagal.version.interpolate-filter',
  'tagal.version.version-directive'
])

.value('version', '0.1');
