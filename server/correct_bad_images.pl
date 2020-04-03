#!/usr/bin/perl -w
use strict;

use File::stat qw(stat);
use File::MimeInfo::Magic qw/magic/;
use File::Path qw(make_path);
use Getopt::Long;
use Pod::Usage;
use Config::IniFiles;
use Cwd qw(abs_path getcwd);
use File::Basename;

tie my %config, 'Config::IniFiles',(-file=>abs_path(dirname(abs_path($0)) . '/../config.ini'));

#should NOT have a trailing slash
my $base_directory =  $config{images}{basedir};
$base_directory =~ s/\/$//;

if ( ! -d $base_directory) {
	print STDERR "Directory $base_directory to read images from does not exist. See config.ini\n";
	exit(1);
}

my $OPT_MAN = 0;
my $OPT_USAGE = 0;
my $OPT_COMMIT = 0;
my $OPT_MOVEDIR = ''; 

Getopt::Long::GetOptions('commit'=>\$OPT_COMMIT,'man'=>\$OPT_MAN,'help'=>\$OPT_USAGE,'dir=s' => \$OPT_MOVEDIR);

pod2usage(-exitval=>0,-verbose=>2) if ($OPT_MAN);
pod2usage(1) if $OPT_USAGE || ! $OPT_MOVEDIR;

if ( ! -d $OPT_MOVEDIR) {
	print STDERR "Directory $OPT_MOVEDIR does not exist\n";
	exit(1);
}

$OPT_MOVEDIR =~ s/\/$//;

my $num_checked = 0;
my $num_moved = 0;
my $size_moved = 0;

check_directory();

sub check_directory {

	my $rel_dir = shift;

	my $full_sourcedir = $base_directory;
	my $full_targetdir = $OPT_MOVEDIR;

	if ($rel_dir) {
		$full_sourcedir .= '/' . $rel_dir;
		$full_targetdir .= '/' . $rel_dir;
	}

	opendir(my $dh, $full_sourcedir) || die("Can't open dir $rel_dir inside $base_directory\n : $!");

	my @subdirs;

	while (my $file = readdir($dh)) {

		$num_checked++;

		if (($num_checked % 50) == 0) {
			printf("Checked %d files. %d bad image files found totalling %d bytes\n", $num_checked, $num_moved, $size_moved);
		}

		next if $file =~ m/^\./;

		my $rel_file = '/' . $file;
		if ($rel_dir) {
			$rel_file = '/' . $rel_dir . $rel_file;
		}

		my $full_sourcepath = $base_directory . $rel_file;
		my $full_targetpath = $OPT_MOVEDIR . $rel_file;
		
		if ($file =~ m/\.jpe?g$/i) {

			my $mimetype = magic($full_sourcepath);

			if ($mimetype ne 'image/jpeg') {

				my $file_stat = stat($full_sourcepath);
				$num_moved++;

				$size_moved += $file_stat->[7];

				print STDERR "$rel_file is NOT a JPEG : is $mimetype\n";

				if (-e $full_targetpath) {
					print STDERR "$rel_file already exists in the target directory\n";
				} else {
					if (! -e $full_targetdir) {
						make_path($full_targetdir);
					}
					rename($full_sourcepath, $full_targetpath) || die ("Could not move $rel_file to target dir\n : $!\n");
				}
			}

		} elsif (-d $full_sourcepath) {
			if ($rel_dir) {
				$file = $rel_dir . '/' . $file;
			}
			push @subdirs, $file;
		}

	}

	closedir($dh);

	foreach my $subdir(@subdirs) {
		check_directory($subdir);
	}

}



1;

=head1 NAME

correct_bad_images.pl

=head1 SYNOPSIS

./correct_bad_images.pl -d "sourcedir"

 Options
  -h[elp]         brief help message
  -m[an]          full help
  -d[ir]          directory to move bad files to, relative or absolute path
  -c[ommit]       if specified, then the files will be moved, otherwise only the report will be generated

=head1 DESCRIPTION

Due to previous bugs, MP4 files are masquerading as JPG files. These came from motion pictures, ie those pictures that also contain 1-2 seconds
of video. This script finds them and moves them out of the basedir to a separate directory for review
 
=cut
