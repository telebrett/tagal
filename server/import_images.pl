#!/usr/bin/perl -w
use strict;

use DBI;
use DateTime;
use DateTime::Format::MySQL;
use File::stat qw(stat);
use File::Copy;
use Image::ExifTool qw(:Public);
use Image::Magick;
use Getopt::Long;
use Pod::Usage;
use Cwd qw(abs_path);
use File::Basename;
use File::Temp qw/tempfile tempdir/;

use IPC::Open3;
use POSIX qw/:sys_wait_h floor/;
use String::ShellQuote qw(shell_quote);

use Config::IniFiles;
tie my %config, 'Config::IniFiles',(-file=>abs_path(dirname(abs_path($0)) . '/../config.ini'));

if (! $config{db}) {
	print STDERR "Could not find db section in ini file\n";
	exit(1);
}

my $dbh;
my $database_type;
my $sth_find;

my $basedir = $config{images}{basedir};
#strip trailing slash if found
$basedir =~ s/\/$//;

my $OPT_MAN = 0;
my $OPT_USAGE = 0;
my $OPT_STARTDIR = undef;
my $OPT_IGNORELASTMOD = 0;
my $OPT_REGENERATETHUMB = 0;
my $OPT_VIDEOSONLY = 0;
my $OPT_MAXPROCESSES = 1;

#TODO - DEBUG option, print out the raw values being executed in call_system, call_system should also output the STDERR
#     - The thumbnail and animated PNG conversion use temporary files that get automatically cleaned up, add an option to leave these files alone (possibly
#       smarter than that, manually clean them up if the code that was using that specific set of files worked)

Getopt::Long::GetOptions('man'=>\$OPT_MAN,'help'=>\$OPT_USAGE,'dir:s'=>\$OPT_STARTDIR,'ignorelastmod'=>\$OPT_IGNORELASTMOD,'thumbnails'=>\$OPT_REGENERATETHUMB, 'videosonly'=>\$OPT_VIDEOSONLY, 'maxprocesses=i'=>\$OPT_MAXPROCESSES);

pod2usage(1) if $OPT_USAGE;
pod2usage(-exitval=>0,-verbose=>2) if ($OPT_MAN);

if ($OPT_STARTDIR) {
	if ($OPT_STARTDIR !~ /^\//) {
		$OPT_STARTDIR = '/' . $OPT_STARTDIR;
	}

	print "Starting at dir " . $basedir . $OPT_STARTDIR . "\n";
}

if ($OPT_REGENERATETHUMB) {
	print "Will regenerate thumbnails\n";
}


my $tz = DateTime::TimeZone->new(name=>'local');

get_db();

my $last_run = get_setting('LastRun');
if ($last_run){
	$last_run = DateTime::Format::MySQL->parse_datetime($last_run)->epoch;
}

if ($OPT_IGNORELASTMOD) {
	print "Ignoring last mod date\n";
	$last_run = undef;
}

my $now = DateTime->now(time_zone=>$tz);

my $build_tags = 1;


my $count = 0;

my $tags = {};
my $cameras = {};
my $geometry = {};

build_tag_cache();
build_camera_cache();
build_geometry_cache();

my $num_forks = 0;
my $fork_mode = $OPT_MAXPROCESSES > 1;

if ($fork_mode) {
	#If the children add a geometry or a camera, then they will
	#send SIGHUP to the parent process
	$SIG{HUP} = sub {
		build_camera_cache(1);
		build_geometry_cache(1);
		build_tags_cache(1);
	};
}

import_directory($OPT_STARTDIR);

if ($fork_mode) {
	print "Waiting for final children\n";
	while ($num_forks > 0) {
		my $child = wait();
		$num_forks--;
	}
	print "All done\n";
}

set_setting('LastRun',DateTime::Format::MySQL->format_datetime($now));

sub build_camera_cache {
	my $recent = shift;

	#there aren't that many cameras to worry about the $recent
	my $sth = $dbh->prepare('SELECT id, Name FROM camera');
	$sth->execute();

	$cameras = $sth->fetchall_hashref('NAME');

}

sub build_geometry_cache {
	my $recent = shift;

	my $SQL = 'SELECT id, ASTEXT(Geometry) AS WKT FROM geometry';
	if ($recent) {
		#this only looks for items that have been added in the last 5 seconds
		#this minimises the database lookups
		$SQL .= ' WHERE DateAdded > TIMESTAMPADD(SECOND, -5, UTC_TIMESTAMP()';
	}
	my $sth = $dbh->prepare($SQL);
	$sth->execute();

	if ($recent) {
		while (my $row = $sth->fetchrow_hashref('WKT')) {
			$geometry->{$row->{WKT}} = $row;
		}
	} else {
		$geometry = $sth->fetchall_hashref('WKT');
	}

}

sub build_tag_cache {
	my $recent = shift;

	my $SQL = 'SELECT * FROM tag';
	if ($recent) {
		#this only looks for items that have been added in the last 5 seconds
		#this minimises the database lookups
		$SQL .= ' WHERE DateAdded > TIMESTAMPADD(SECOND, -5, UTC_TIMESTAMP()';
	}
	my $sth = $dbh->prepare($SQL);
	$sth->execute();

	if ($recent) {
		while (my $row = $sth->fetchrow_hashref('TAG')) {
			$tags->{$row->{TAG}} = $row;
		}
	} else {
		$tags = $sth->fetchall_hashref('TAG');
	}

}

sub get_setting {

	my $setting = shift;
	
	my $sth = $dbh->prepare('SELECT Value FROM setting WHERE Name = ?');
	$sth->execute($setting);
	
	my $result = $sth->fetchrow_hashref;

	return $result->{VALUE};
}

sub set_setting {
	my $setting = shift;
	my $value = shift;

	if (defined get_setting($setting)){
		$dbh->do('UPDATE setting SET Value = ? WHERE Name = ?',{},($setting,$value));
	}else{
		$dbh->do('INSERT INTO setting (Name,Value) VALUES (?,?)',{},($setting,$value));
	}
}

sub get_db {

	$database_type = $config{db}{type} || 'mysql';

	$dbh = DBI->connect('DBI:' . $database_type . ':' . $config{db}{name},,$config{db}{user},$config{db}{pass},{RaiseError=>1}) || die("Could not connect to imagegallery database $!");

	#This is so the handle doesn't get closed by the forked child processes
	$dbh->{AutoInactiveDestroy} = 1;

	$dbh->{FetchHashKeyName} = 'NAME_uc';

	$database_type = lc $database_type;
}

sub get_sth {

	if ($sth_find){
		return $sth_find;
	}

	#$sth_find = $dbh->prepare('SELECT i.*,IF(it.ImageID IS NULL,0,1) AS HasTags FROM image i LEFT JOIN image_tag it ON i.id = it.ImageID WHERE i.Location = ? GROUP BY i.id');
	$sth_find = $dbh->prepare('SELECT i.*,CASE WHEN it.ImageID IS NULL THEN 0 ELSE 1 END AS HasTags FROM image i LEFT JOIN image_tag it ON i.id = it.ImageID WHERE i.Location = ? GROUP BY i.id');
	return $sth_find;
	
}


sub import_directory {
	my $dir = shift;

	my $fulldir = $basedir;
	if ($dir){
		$fulldir .= $dir;
	}

	opendir(my $dh,$fulldir) || die("Can't open dir $dir inside $basedir\n : $!");
			
	#TODO - Do a single query to retrieve all the existing images for this directory (watch out for sub dirs, ie - starts with the current dir but does NOT contain further directory separators

	while (my $file = readdir $dh){

		$count++;
		if ($count % 20 == 0){
			print "Count $count\n";
		}

		next if $file =~ m/^\./;

		my $dirpath;

		if ($dir){
			$dirpath = $dir . '/' . $file;
		}else{
			$dirpath = '/' . $file;
		}

		my $fullpath = $basedir . $dirpath;
		
		if (-d $fullpath){
			import_directory($dirpath);
		}else{

			if ($file =~ m/\.jpe?g$/i || $file =~ m/\.(mp4|avi|mov|m4v|mkv)$/i){


				my $is_movie = 1;

				if ($file =~ m/\.jpe?g$/i) {
					$is_movie = 0;
					next if $OPT_VIDEOSONLY;
				}

				my $file_stat = stat($fullpath);

				if (defined $last_run && $file_stat->[9] > $last_run){
					#nothing changed since last run
					next;
				}

				my $thumbnail = $fulldir . '/.thumb/' . $file;
				my $preview;

				if ($is_movie) {
					$preview = $fulldir . '/.preview/' . $file;

					#See create_video_preview
					$thumbnail .= '.png';
					$preview .= '.png';
				}

				if (not $build_tags and -e $thumbnail && (! $is_movie || -e $preview)){
					next;
				}

				if (! -d $fulldir . '/.thumb'){
					mkdir $fulldir . '/.thumb';
				}

				if ($is_movie && ! -d $fulldir . '/.preview'){
					mkdir $fulldir . '/.preview';
				}

				if ($fork_mode) {

					if ($num_forks >= $OPT_MAXPROCESSES) {
						my $childpid = wait();
						$num_forks--;
					}

					#Fork!
					$num_forks++;

					my $child = fork();

					if (not defined $child) {
						die "Could not fork child process $@";
					}

					if ($child != 0) {
						next;
					}

					#needs a new dbh handle
					#TODO - After changing to do the single query per directory for existing images
					#       only call get_db when required, 
					get_db();

				}

				my $info = ImageInfo($fullpath);

				#TODO - remove this commented code, debug for dev
				#foreach my $ekey(keys %$info) {
				#	if ($info->{$ekey} =~ m/canon/i) {
				#		print $ekey . ':' . $info->{$ekey} . "\n";
				#	}
				#}

				my $width = 0;
				my $height = 0;

				if (defined $info->{ImageWidth}){
					$width = $info->{ImageWidth};
				}elsif (defined $info->{ExitImageWidth}){
					$width = $info->{ExifImageWidth};
				}

				if (defined $info->{ImageHeight}){
					$height = $info->{ImageHeight};
				}elsif (defined $info->{ExitImageHeight}){
					$height = $info->{ExifImageHeight};
				}

				if ($is_movie && $info->{Rotation} && ( $info->{Rotation} eq '90' || $info->{Rotation} eq '270')) {
					#videos are weird. When they are played, they are the right way, but this means the reported width's and height's are swapped
					my $tmp_dim = $height;
					$height = $width;
					$width = $tmp_dim;
				}

				my $force_thumb = $OPT_REGENERATETHUMB;
				my $force_preview = $OPT_REGENERATETHUMB;

				if (! $force_thumb && -e $thumbnail) {
					my $thumb_stat = stat($thumbnail);

					if ($thumb_stat->[9] < $file_stat->[9]) {
						#thumbnail lastmoddate is earlier than the file last mod date, most likely due to tags, but regenerate the thumbnail anyway
						$force_thumb = 1;
					}
				}

				if ($is_movie && ! $force_preview && -e $preview) {
					my $preview_stat = stat($preview);

					if ($preview_stat->[9] < $file_stat->[9]) {
						#preview lastmoddate is earlier than the file last mod date, most likely due to tags, but regenerate the preview anyway
						$force_preview = 1;
					}
				}

				my $thumb_exists = -e $thumbnail;

				if ($is_movie) {
					my $preview_exists = -e $preview;
					if (($force_preview or ! $preview_exists) and $width and $height){

						if ($preview_exists) {
							unlink($preview);
						}

						#The anmiated png's can get quite large,
						#400k for 5 frames at 320 width goes to 180k at 200 width instead
						#my $conv_height = $height / ($width / 200);
						#create_video_preview($info, $thumbnail, $preview, $conv_height, 200);

						my $conv_width = $width / ($height / 200);
						create_video_preview($info, $thumbnail, $preview, 200, $conv_width);

					}
				} else {
					if (($force_thumb or ! $thumb_exists) and $width and $height){

						if ($thumb_exists) {
							unlink($thumbnail);
						}

						my $conv_height = $height / ($width / 320);

						my $new_size = '320x' . $conv_height;
						#has to be a new one each time or it writes multiple files
						my $converter = Image::Magick->new;
						$converter->Read($fullpath);
						$converter->Resize(geometry=>$new_size);
						$converter->Extent(geometry=>$new_size);
						$converter->Write($thumbnail);

					}
				}

				my $sth = $dbh->prepare('SELECT i.*,CASE WHEN it.ImageID IS NULL THEN 0 ELSE 1 END AS HasTags FROM image i LEFT JOIN image_tag it ON i.id = it.ImageID WHERE i.Location = ? GROUP BY i.id');
				$sth->execute($dirpath) or warn "EXecute failed " . $sth->errstr . "\n";
				my $row = $sth->fetchrow_hashref('NAME_uc');

				my $image_id;

				my $datetime;

				if (exists $info->{DateTimeOriginal}) {
					$datetime = $info->{DateTimeOriginal};
				} elsif(exists $info->{TrackCreateDate}) {
					$datetime = $info->{TrackCreateDate};
				} else {
					warn "Could not retrieve date from exif data for $file\n";
				}

				my $date_insert;
				if ($database_type eq 'mysql') {
					$date_insert = '?';
				} elsif($database_type eq 'sqlite') {
					$date_insert = "strftime('%s', ?)";
					$datetime =~ s/^(\d{4}):(\d{2}):(\d{2})/$1-$2-$3/;
				} else {
					die("Database type $database_type not handled");
				}

				my $camera_id = get_camera($fullpath, $info);

				#note that $date_insert still uses a placeholder
				if ($row){
					$image_id = $row->{ID};
					my $sth_upd = $dbh->prepare("UPDATE image SET Width=?,Height=?,DateTaken=$date_insert,IsVideo=?, CameraID=? WHERE id = ?");
					$sth_upd->execute($width,$height,$datetime,$is_movie,, $camera_id, $image_id);
				}else{
					my $sth_ins = $dbh->prepare("INSERT INTO image (Location,DateTaken,Width,Height,IsVideo, CameraID) VALUES (?,$date_insert,?,?,?,?)");
					$sth_ins->execute($dirpath,$datetime,$width,$height,$is_movie,$camera_id);
					$image_id = $dbh->last_insert_id(undef,undef,'image',undef);
				}


				my @keywords;
				
				if ($info->{Subject}){
					@keywords = split ',', $info->{Subject};
				}

				if ($info->{Keywords}){
					push @keywords, split ',', $info->{Keywords};
				}

				my %unique;

				foreach (@keywords){
					s/^\s+//;
					s/\s+$//;
					$unique{$_} = 1;
				}

				@keywords = keys %unique;

				#clear existing tags
				if ($row && $row->{HASTAGS}){
					#delete tags for the image
					$dbh->do('DELETE FROM image_tag WHERE ImageID = ?',{},$image_id);
				}
				if (scalar @keywords > 0){

					#ensure all tags have been inserted and insert / update the image_tag 

					my @tag_ids;
					foreach my $tag (@keywords){
						if (! defined($tags->{$tag})){
							my $sth_tag_ins = $dbh->prepare('INSERT INTO tag (Tag, DateAdded) VALUES (?, UTC_TIMESTAMP())');
							if ($sth_tag_ins->execute($tag)) {
								$tags->{$tag} = {ID=>$dbh->last_insert_id(undef,undef,'tag',undef)};
							} elsif ($fork_mode) {
								#Likely that one of the other child processes inserted it
								my $dbtag = $dbh->selectrow_hashref('SELECT * FROM tag WHERE Tag = ?', undef, $tag);
								if ($dbtag) {
									$tags->{$tag} = $dbtag;
								} else {
									warn "Error, insert failed but still could not find tag '" . $tag . "'\n";
								}
							} else {
								warn "Error, insert into tag failed in non fork mode\n";
							}

							#signal the parent process to add to the cache variables
							if ($fork_mode) {
								kill 'HUP', getppid();
							}

						}
						push @tag_ids,$tags->{$tag}->{ID};
					}

					my @ins_val;
					foreach my $tag_id(@tag_ids){
						push @ins_val,$image_id,$tag_id;
					}

					$dbh->do("INSERT INTO image_tag (ImageID,TagID) VALUES " . join(',',map{'(?,?)'} @tag_ids),{},@ins_val);

				}

				if ($fork_mode) {
					#to be here, we are in a forked child process
					exit(0);
				}
			}
		}
	}


	closedir($dh);

}

sub get_camera {

	my $file = shift;
	my $info = shift;

	my $camera_make = '';
	my $camera_model = '';
	if (exists $info->{Make}) {
		$camera_make = $info->{Make};
	}

	if (exists $info->{Model}) {
		$camera_model = $info->{Model};
	}

	if ($camera_make ne '' && $camera_model ne '') {
		if (index($camera_model, $camera_make) == 0) {
			$camera_make = '';
		} else {
			$camera_make .= ' ';
		}
	}

	if ($camera_make eq '' && $camera_model eq '') {
		warn "Could not retrieve camera make/model for $file\n";
	}

	if ($camera_make eq '' && $camera_model eq '') {
		return undef;
	}

	my $camera = $camera_make . $camera_model;

	if (! defined($cameras->{$camera})){
		my $sth_tag_ins = $dbh->prepare('INSERT INTO camera (Name) VALUES (?)');
		if ($sth_tag_ins->execute($camera)) {
			$cameras->{$camera} = {ID=>$dbh->last_insert_id(undef,undef,'camera',undef)};
		} elsif ($fork_mode) {
			#Likely that one of the other child processes inserted it
			my $row = $dbh->selectrow_hashref('SELECT * FROM camera WHERE Name = ?', undef, $camera);
			if ($row) {
				$cameras->{$camera} = $row;
			} else {
				warn "Error, insert failed but still could not find camera '" . $camera . "'\n";
				return undef;
			}

		} else {
			warn "Error, insert into camera failed in non fork mode\n";
			return undef;
		}

		#signal the parent process to add to the cache variables
		if ($fork_mode) {
			kill 'HUP', getppid();
		}

	}

	return $cameras->{$camera}->{ID};

}

#Note this also creates the thumbnail
sub create_video_preview {

	my $exifdata = shift;
	my $thumbnail = shift;
	my $preview = shift;

	#There could be a JPG file with the same name except or the suffix
	#$thumbnail =~ s/\.\w+$/-movie\.png/;
	#$preview =~ s/\.\w+$/-movie\.png/;

	my $height = shift;
	my $width = shift;

	my $fullpath = $exifdata->{Directory} . '/' . $exifdata->{FileName};

	my $length = 0;

	if ($exifdata->{Duration} =~ m/^(\d+\.\d+) s$/) {
		$length = $1;
	} elsif ($exifdata->{Duration} =~ m/^(\d+):(\d+):(\d+)$/) {
		$length = $3 + $2 * 60 + $1 * 3600;
	}

	#Extract 20 frames, with a minimum of 5 seconds between, eg if only 20 seconds, then there will only be 4 frames
	my $frames = 20;
	my $gap = 5;

	#minimum of $gap seconds between frames
	if ($frames * $gap > $length) {
		$frames = floor($length / $gap) + 1;
	} else {
		$gap = floor($length / $frames);
	}

	my $frame_dir = tempdir(CLEANUP => 1);
	my @join_cmd = ('apngasm', '-o', shell_quote($preview));

	for (my $i = 0; $i < $frames; $i++) {

		my $frame_path = $frame_dir . "/frame${i}.png";

		my @cmd = (
			'ffmpeg',
			'-ss', $i * $gap,
			'-i', shell_quote($fullpath),
			'-vf', "scale=${width}:${height}",
			'-vframes', 1,
			'-q:v', 2,
			'-tune', 'stillimage',
			shell_quote($frame_path)
		);

		if (! call_system("Generating frame $i for video preview ", @cmd)) {
			warn "Failed to generate image from movie for $fullpath\n";
		}

		#TODO BUG whereby ffmpeg fails to encode as we have gone past the end of the video, but still exits with 0 (WTF!!), so check that the file, you know, actually exists
		if ( -e $frame_path) {
			push @join_cmd, $frame_path;
		}

		if ($i == 0) {
			copy($frame_path, $thumbnail);
		}
	}

	if ($frames == 1) {
		copy($thumbnail, $preview);
	} else {
		#Force overwrite
		push @join_cmd, '-F';

		#number of milliseconds between each frame
		push @join_cmd, '-d', 1000;

		if (! call_system("Generating animated png ", @join_cmd)) {
			warn "Failed to generate animated png for $fullpath\n";
			warn join(' ', @join_cmd) . "\n";
		}
	}

}

sub call_system {

	my $comment = shift;

	#my $pid = open3(\*CHLD_OUT, \*CHLD_IN, \*CHLD_ERR, @_);
	my $pid = open3(undef, undef, undef, @_);

	#turn on flushing
	$| = 1;

	if ($comment) {
		print $comment;
	}

	while (! waitpid($pid, WNOHANG)) {
		sleep(1);
		if ($comment) {
			print ".";
		}
	}

	if ($comment) {
		print "\n";
	}

	my $child_exit_status = $? >> 8;

	return $child_exit_status == 0;

}

1;

=head1 NAME

import_images.pl

=head1 SYNOPSIS

./import_images.pl [options]

 Options
  -h[elp]              brief help message
  -man                 Full help
  -t[humbnails]        Rebuild the thumbnails
  -i[gnorelastmod]     Ignore the last mod date of the files and re import.
  -d[ir] [dir]         eg "-d 2016/01" would only scan that directory in the base directory
  -v[ideosonly]        Only scan for videos
  -max[processes]      If this is set to > 3, then it will process this many images simultaneously (I suggest keeping this < than the number of vcpus)

=head1 DESCRIPTION

Imports images from the base directory into the database to be able to generate the JSON file

=head1 TODO

=over 4

=item change to use 'find'

Change to use "find" for "last mod" after "last run" as perl DateTime is very slow

=item support geocoded images

Photos can have geocodes, these should be extracted and they could then be plotted on a map

=back

=cut
