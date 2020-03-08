#!/usr/bin/perl -w
use strict;

#TODO for movie files, need to also change the import_images.pl script to handle movie files 

use DateTime;
use File::stat qw(stat);
use File::Path qw(make_path);
use File::Basename;
use File::Compare qw(compare);
use Image::ExifTool qw(:Public);
use Image::Magick;
use Digest::MD5::File qw(file_md5);
use Data::Dumper;
use String::ShellQuote qw(shell_quote);

use IPC::Open3;
use POSIX ":sys_wait_h";

use Getopt::Long;
use Pod::Usage;
use Cwd qw(abs_path getcwd);

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
my $OPT_ACCEPTNODATE = 0;
my $OPT_VIDEOONLY = 0;
my $OPT_SOURCEDIR = undef;
my @OPT_TAGS;

Getopt::Long::GetOptions('remove'=>\$OPT_REMOVEIMAGE,'man'=>\$OPT_MAN,'help'=>\$OPT_USAGE,'d=s' => \$OPT_SOURCEDIR,'t=s@'=>\@OPT_TAGS, 'acceptnodate'=>\$OPT_ACCEPTNODATE, 'videoonly'=>\$OPT_VIDEOONLY);

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
my $had_errors = 0;

import_directory();

if ($had_errors) {
	print "\n\n\n";
	print "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n";
	print "Warning - some files could not be copied / converted\n";
}

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

			if ($file =~ m/\.jpe?g$/i || $file =~ m/\.(mp4|avi|mov|m4v|mkv)$/i){

				my $extension;

				if ($file =~ m/\.jpe?g$/i) {
					$extension = 'JPG';
					if ($OPT_VIDEOONLY) {
						next;
					}
				} else {
					$extension = uc $1;
				}

				my $converted_file = undef;
				my $original_file  = $fullpath;

				if ($extension eq 'AVI') {
					#Image::ExifTool can't write to AVI's, convert to mkv
					
					$converted_file = '/tmp/importbasedir-tmp.m4v';
					$extension = 'M4V';
					
					#TODO - check /tmp for available space
					if (-f $converted_file) {
						print "Could not convert $fullpath to $converted_file as this target file already exists\n";
						exit(1);
					}

					if (! call_system('Converting video ', 'ffmpeg -i ' . shell_quote($fullpath) . ' ' . $converted_file)) {
						print "Could not convert $fullpath to $converted_file as ffmpeg failed\n";
					}
					system('exiftool -tagsFromFile ' . shell_quote($fullpath) . ' ' . $converted_file);

					$fullpath = $converted_file;
				}

				my $options;

				$tool->ExtractInfo($fullpath);

				my $dt_string = undef;
				my @date_tags = qw/DateTimeOriginal TrackCreateDate CreateDate/;

				foreach my $attempt_tag (@date_tags) {
					my $attempt_tag = shift @date_tags;
					$dt_string = $tool->GetValue($attempt_tag);

					if (defined $dt_string) {
						last;
					}
				}

				if ((not defined $dt_string) && $OPT_ACCEPTNODATE) {
					$dt_string = "1970:10:01 01:00:00";
				}

				if ((not defined $dt_string)|| not $dt_string =~ m/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/) {
					if (defined $dt_string) {
						print "Invalid date time {$dt_string}\n";
					} else {
						print "No datetime tag found for $original_file\n";
					}

					if ($converted_file) {
						unlink($converted_file);
					}

					next;
				}

				my $new_file_name_part = "$destdir/$1/$2/$3/$1-$2-$3-$4:$5:$6";

				my $new_file_name = "$new_file_name_part.$extension";

				if (-f $new_file_name) {

					my $max_dupe_name = 0;

					my @possible_dupes = glob "$new_file_name_part*.$extension";

					my $is_dupe = 0;

					foreach my $possible_dupe (@possible_dupes) {
						#the glob above has already checked the extensions
						if ($possible_dupe =~ m/-(\d+).\w+$/) {
							$max_dupe_name = $1;
						}

						if ($extension eq 'JPG') {
							if (is_dupe_image($possible_dupe,$fullpath)) {
								$is_dupe = 1;
								last;
							}
						} else {

							#do an exact file match for the moment
							#once the video has user entered tags though, the files will differ
							#ideally, build an extractor that just compares the video part of the file,
							#ie ignores the EXIF data
							if (compare($possible_dupe, $fullpath) == 0) {
								$is_dupe = 1;
							} else {
								print "$original_file is a possible duplicate of $possible_dupe - not importing, this requires a manual intervention\n";

								if ($converted_file) {
									unlink($converted_file);
								}

								next;
							}
						}
					}

					if ($is_dupe) {

						print "File {$new_file_name} already exists - skipping\n";

						if ($OPT_REMOVEIMAGE) {
							unlink($original_file);
							print "Deleted $original_file\n";
						}

						if ($converted_file) {
							unlink($converted_file);
						}
						next;
					}

					$new_file_name = $new_file_name_part . '-' . ++$max_dupe_name . ".$extension";

					print "Rewriting as $new_file_name\n";

				}

				foreach my $tag(@OPT_TAGS) {
					$tool->SetNewValue('Keywords',$tag);
				}

				my $new_file_dir = dirname($new_file_name);

				if (! -d $new_file_dir) {
					make_path($new_file_dir);
				}

				my $success = $tool->WriteInfo($fullpath,$new_file_name);

				if ($extension eq 'JPG') {
					#TODO - find a native perl lossless rotation, ensure it rewrites the EXIF orientation tag but leaves all others alone
					system('exiftran','-ai',$new_file_name);
				}

				if ($success) {
					if ($OPT_REMOVEIMAGE) {
						unlink($original_file);
						print "Deleted $original_file\n";
					}
					print "Created $new_file_name\n";
				} else {
					print "Failed writing tags for $new_file_name\n";
					print "Source file $fullpath\n";
					print Dumper($tool->GetInfo('Error', 'Warning'));

					$had_errors = 1;

				}

				if ($converted_file) {
					unlink($converted_file);
				}

			}
		}


	}

	closedir($dh);

}

sub is_dupe_image {
	my $image_a = shift;
	my $image_b = shift;

	my $tmp_a = '/tmp/dedupe_image_a';
	my $tmp_b = '/tmp/dedupe_image_b';

	if (-f $tmp_a) {
			unlink($tmp_a);
	}

	if (-f $tmp_b) {
			unlink($tmp_b);
	}

	#Clear the keywords and write temporary files
	my $tool = new Image::ExifTool;
	$tool->ExtractInfo($image_a);
	$tool->SetNewValue('Keywords');
	$tool->WriteInfo($image_a,$tmp_a);

	$tool = new Image::ExifTool;
	$tool->ExtractInfo($image_b);
	$tool->SetNewValue('Keywords');
	$tool->WriteInfo($image_b,$tmp_b);

	#note, at first glance it appears that running exiftran gives the exact same results if done
	#more than once against the same source file eg
	# cp source.jpg a.jpg
	# cp source.jpb b.jpg
	#
	# exitran -ai a.jpg b.jpg
	#
	# md5sum a.jpg b.jpg
	#
	#outputs the same hash
	system('exiftran','-ai',$tmp_a,$tmp_b);

	if (compare($tmp_a,$tmp_b) == 0) {
		return 1;
	}

	return 0;

}

sub call_system {

	my $comment = shift;

	my $pid = open3(\*CHLD_OUT, \*CHLD_IN, \*CHLD_ERR, @_);

	#turn on flushing
	$| = 1;

	print $comment;

	while (! waitpid($pid, WNOHANG)) {
		sleep(1);
		print ".";
	}

	my $child_exit_status = $? >> 8;

	return $child_exit_status == 0;

}

sub is_dupe_movie {
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
  -h[elp]         brief help message
  -m[an]          full help
  -d[ir]          source directory, relative or absolute path
  -r[emove]       if specified it will delete the image from the source directory
  -t[ag]          tag name to tag the image in the EXIF data with, can be a quoted value eg "Lunar eclipse". This can be specified multiple times
  -a[cceptnodate] Import photos / images with no dates as the 10th Jan, 1970
  -v[ideoonly]    Only import video files

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

=item cancelling

At the moment the script does not respond to CTRL+c

=back

=cut


