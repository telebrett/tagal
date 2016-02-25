#!/usr/bin/perl -w
use strict;

use DateTime;
use File::stat qw(stat);
use File::Path qw(make_path);
use File::Basename;
use Image::ExifTool qw(:Public);
use Image::Magick;

use Getopt::Long;
use Pod::Usage;
use Cwd qw(abs_path);

use Config::IniFiles;
tie my %config, 'Config::IniFiles',(-file=>abs_path(dirname(abs_path($0)) . '/../config.ini'));

#should NOT have a trailing slash
my $destdir =  $config{images}{basedir};
$destdir =~ s/\/$//;

if ( ! -d $destdir) {
	print STDERR "Directory $destdir to move images to does not exist. See config.ini\n";
	exit(1);
}

my $OPT_MAN = 0;
my $OPT_USAGE = 0;
my $OPT_REMOVEIMAGE = 0;
my $OPT_SOURCEDIR = undef;
my @OPT_TAGS;

Getopt::Long::GetOptions('remove'=>\$OPT_REMOVEIMAGE,'man'=>\$OPT_MAN,'help'=>\$OPT_USAGE,'d=s' => \$OPT_SOURCEDIR,'t=s@'=>\@OPT_TAGS);

pod2usage(-exitval=>0,-verbose=>2) if ($OPT_MAN);
pod2usage(1) if $OPT_USAGE;

if (! $OPT_SOURCEDIR) {
	print STDERR "source directory not specified\n";
	pod2usage(1);
}

if (not $OPT_SOURCEDIR =~ m/^\//) {
	$OPT_SOURCEDIR = getcwd() . '/' . $OPT_SOURCEDIR;
}

#strip trailing slash if found
$OPT_SOURCEDIR =~ s/\/$//;

if (! -d $OPT_SOURCEDIR) {
	print STDERR "Source dir $OPT_SOURCEDIR not found\n";
	pod2usage(1);
}

my $count;

import_directory();

sub import_directory {
	my $dir = shift;

	my $fulldir = $OPT_SOURCEDIR;
	if ($dir){
		$fulldir .= $dir;
	}

	print "Processing $fulldir\n";

	opendir(my $dh,$fulldir) || die("Can't open dir $dir inside $OPT_SOURCEDIR\n : $!");

	my $tool = new Image::ExifTool;

	while (my $file = readdir $dh){

		$count++;
		if ($count % 10 == 0){
			print "Count $count\n";
		}

		next if $file =~ m/^\./;
		
		my $dirpath;

		if ($dir){
			$dirpath = $dir . '/' . $file;
		}else{
			$dirpath = '/' . $file;
		}

		my $fullpath = $OPT_SOURCEDIR . $dirpath;

		if (-d $fullpath){
			import_directory($dirpath);
		}else{

			if ($file =~ m/\.jpe?g$/i){

				my $options;

				$tool->ExtractInfo($fullpath);

				my $dt_string = $tool->GetValue('DateTimeOriginal');

				if (not $dt_string =~ m/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/) {
					print "Invalid date time {$dt_string}\n";
					next;
				}

				my $new_file_name = "$destdir/$1/$2/$3/$1-$2-$3-$4:$5:$6.JPG";

				if (-f $new_file_name) {
					print "File {$new_file_name} already exists - skipping\n";
					next;
				}

				foreach my $tag(@OPT_TAGS) {
					$tool->SetNewValue('Keywords',$tag);
				}

				my $new_file_dir = dirname($new_file_name);

				if (! -d $new_file_dir) {
					make_path($new_file_dir);
				}

				my $success = $tool->WriteInfo($fullpath,$new_file_name);

				if ($success) {
					if ($OPT_REMOVEIMAGE) {
						unlink($fullpath);
					}
					print "Deleted $fullpath\n";
					print "Created $new_file_name\n";
				} else {
					print "Failed writing tags for $new_file_name\n";
					exit(1);
				}

			}
		}


	}

	closedir($dh);

}

sub usage {

	my $program = shift;
	my $die = shift;

	print "\n\n";
	print "Usage\n";
	print "\t" . $program . " -d relative-or-absolute-path [-t tag1 -t tag2 ... -t tagn]\n";
	print "\n\n";

	die $die if $die;

	exit;


	
}


1;

=head1 NAME

import_to_basedir.pl

=head1 SYNOPSIS

./import_to_basedir.pl -d "sourcedir" [-t tag1 -t tag2 ... -t tagN]

 Options
  -h[elp]   brief help message
  -m[an]    full help
  -d[ir]    source directory, relative or absolute path
  -r[emove] if specified it will delete the image from the source directory
  -t[ag]    tag name to tag the image in the EXIF data with, can be a quoted value eg "Lunar eclipse". This can be specified multiple times

=head1 DESCRIPTION

Moves JPEG images from the source directory, and sub directories, and tags them with the specified tags. This will move them into the basedir from the config in a YYYY/MM/DD directory structure.

Note that this removes the files from the specified source directory. It is up to the user to ensure backups

=head1 TODO

=over 4

=item option to tag based on image name

Eg --tag-name - this would always add a tag to the image after stripping the file suffix, --tag-name-auto, this would add do the same as --tag-name but only if
the name of the image did not fit a known auto name pattern eg "IMG1234"

=item sub directories

Tag based on sub directory names

=item handle collisions for filenames

=back

=cut


