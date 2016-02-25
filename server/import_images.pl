#!/usr/bin/perl -w
use strict;

use DBI;
use DateTime;
use DateTime::Format::MySQL;
use File::stat qw(stat);
use Image::ExifTool qw(:Public);
use Image::Magick;
use Getopt::Long;
use Pod::Usage;
use Cwd qw(abs_path);
use File::Basename;

use Config::IniFiles;
tie my %config, 'Config::IniFiles',(-file=>abs_path(dirname(abs_path($0)) . '/../config.ini'));

if (! $config{db}) {
	print STDERR "Could not find db section in ini file\n";
	exit(1);
}

my $dbh;
my $sth_find;

my $basedir = $config{images}{basedir};
#strip trailing slash if found
$basedir =~ s/\/$//;

my $OPT_MAN = 0;
my $OPT_USAGE = 0;
my $OPT_STARTDIR = undef;
my $OPT_IGNORELASTMOD = 0;
my $OPT_REGENERATETHUMB = 0;

Getopt::Long::GetOptions('man'=>\$OPT_MAN,'help'=>\$OPT_USAGE,'dir:s'=>\$OPT_STARTDIR,'ignorelastmod'=>\$OPT_IGNORELASTMOD,'thumbnails'=>\$OPT_REGENERATETHUMB);

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
	$last_run = DateTime::Format::MySQL->parse_datetime($last_run);
}

if ($OPT_IGNORELASTMOD) {
	print "Ignoring last mod date\n";
	$last_run = undef;
}

my $now = DateTime->now(time_zone=>$tz);

my $build_tags = 1;

my $tags = get_tags();

my $count = 0;

import_directory($OPT_STARTDIR);

set_setting('LastRun',DateTime::Format::MySQL->format_datetime($now));

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

	my $type = $config{db}{type} || 'mysql';

	$dbh = DBI->connect('DBI:' . $type . ':' . $config{db}{name},,$config{db}{user},$config{db}{pass},{RaiseError=>1}) || die("Could not connect to imagegallery database $!");

	$dbh->{FetchHashKeyName} = 'NAME_uc';
}

sub get_sth {

	if ($sth_find){
		return $sth_find;
	}

	$sth_find = $dbh->prepare('SELECT i.*,IF(it.ImageID IS NULL,0,1) AS HasTags FROM image i LEFT JOIN image_tag it ON i.id = it.ImageID AND it.Written WHERE i.Location = ? GROUP BY i.id');
	return $sth_find;
	
}

sub get_tags {
	return $dbh->selectall_hashref('SELECT * FROM tag','TAG');
}

sub import_directory {
	my $dir = shift;

	my $fulldir = $basedir;
	if ($dir){
		$fulldir .= $dir;
	}

	opendir(my $dh,$fulldir) || die("Can't open dir $dir inside $basedir\n : $!");

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

			if ($file =~ m/\.jpe?g$/i){

				my $file_stat = stat($fullpath);

				my $file_dt = DateTime->from_epoch(epoch=>$file_stat->[9]);

				if (defined $last_run && DateTime->compare($file_dt,$last_run) == -1){
					#nothing changed since last run
					next;
				}

				my $thumbnail = $fulldir . '/.thumb/' . $file;

				#remove this entire ifblock - just a shortcut when building thumbs
				if (not $build_tags and -e $thumbnail){
					next;
				}

				if (! -d $fulldir . '/.thumb'){
					mkdir $fulldir . '/.thumb';
				}

				my $info = ImageInfo($fullpath);

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

				my $force_thumb = $OPT_REGENERATETHUMB;

				if (! $force_thumb) {
					my $thumb_stat = stat($thumbnail);

					my $thumb_dt = DateTime->from_epoch(epoch=>$thumb_stat->[9]);
					if (DateTime->compare($thumb_dt,$file_dt) == -1) {
						#thumbnail lastmoddate is earlier than the file last mod date, most likely due to tags, but regenerate the thumbnail anyway
						$force_thumb = 1;
					}
				}

				my $thumb_exists = -e $thumbnail;

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

				my $sth = get_sth();
				my $result = $sth->execute($dirpath);
				my $row = $sth->fetchrow_hashref('NAME_uc');

				my $image_id;

				if ($row){
					$image_id = $row->{ID};
					my $sth_upd = $dbh->prepare('UPDATE image SET Width=?,Height=>? WHERE id = ?');
					$sth_upd->execute($width,$height,$image_id);
				}else{
					my $sth_ins = $dbh->prepare('INSERT INTO image (Location,DateTaken,Width,Height) VALUES (?,?,?,?)');
					$sth_ins->execute($dirpath,$info->{DateTimeOriginal},$width,$height);
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
					$dbh->do('DELETE FROM image_tag WHERE ImageID = ? AND Written = 1',{},$image_id);
				}
				if (scalar @keywords > 0){

					#ensure all tags have been inserted and insert / update the image_tag 

					my @tag_ids;
					foreach my $tag (@keywords){
						if (! defined($tags->{$tag})){
							my $sth_tag_ins = $dbh->prepare('INSERT INTO tag (Tag) VALUES (?)');
							$sth_tag_ins->execute($tag);
							$tags->{$tag} = {ID=>$dbh->last_insert_id(undef,undef,'tag',undef)};
						}
						push @tag_ids,$tags->{$tag}->{ID};
					}

					my @ins_val;
					foreach my $tag_id(@tag_ids){
						push @ins_val,$image_id,$tag_id;
					}

					$dbh->do("INSERT INTO image_tag (ImageID,TagID,Written) VALUES " . join(',',map{'(?,?,1)'} @tag_ids),{},@ins_val);

				}

			}
		}
	}

	closedir($dh);

}

1;

=head1 NAME

import_images.pl

=head1 SYNOPSIS

./import_images.pl [options]

 Options
  -h[elp]              brief help message
  -m[an]               Full help
  -t[humbnails]        Rebuild the thumbnails
  -i[gnorelastmod]     Ignore the last mod date of the files and re import.
  -d[ir] [dir]         eg "-d 2016/01" would only scan that directory in the base directory

=head1 DESCRIPTION

Imports images from the base directory into the database to be able to generate the JSON file

=head1 TODO

=over 4

=item change to use 'find'

Change to use "find" for "last mod" after "last run" as perl DateTime is very slow

=back

=cut
