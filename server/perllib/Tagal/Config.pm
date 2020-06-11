package Tagal::Config;
use strict;

use Config::IniFiles;
use Cwd qw(abs_path getcwd);
use File::Basename;

sub config {

	#Note, this is relative to the caller, NOT this file
	tie my %config, 'Config::IniFiles',(-file=>abs_path(dirname(abs_path($0)) . '/../config.ini'));
	return %config;
}

1;
