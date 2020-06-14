#!/usr/bin/perl -w
use strict;

use DBI;
use Image::ExifTool qw(:Public);
use Config::IniFiles;
use Cwd qw(abs_path);
use File::Basename;
use POSIX;

#This was invoked from the web REST api, we need to "daemonize" this
#process so when the invoker gets killed, this is left behind
#Maybe this should always occur, so that it can check it's only being run once
my $daemon_mode;

if ( ! -t STDOUT) {
	fork and exit;
	POSIX::setsid();
	fork and exit;
	umask 0;
	close STDIN;
	close STDOUT;
	close STDERR;

	$daemon_mode = 1;
}

# TODO
# - Handle geocoding
# - handle camera changes
#
# So initial state
# image.isDiffFromPrimaryJSONDB - doesn't mean an image file to update
# 
# image_tag.IsWritten = 0, this means a new tag
# image_tag.IsDeleted = 1, this means a tag that is in the file, but has been deleted
#
# For each image, reset the keywords, but don't reset the database IsWritten, IsDeleted as this is
# used for the diff from database.json and the UI would go all over the place
#
# Should we block generate_database from running if there are changes?
#
# Once all done, then rewrite the json db, Need to look at the cache-control headers
# for the database, hopefully chrome plays nice

tie my %config, 'Config::IniFiles',(-file=>abs_path(dirname(abs_path($0)) . '/../config.ini'));

if (! $config{db}) {
	print STDERR "Could not find db section in ini file\n";
	exit(1);
}

my $dbh;

my $basedir = $config{images}{basedir};
#strip trailing slash if found
$basedir =~ s/\/$//;

get_db();

my $SQL = <<EOF;
SELECT i.id AS ImageID, i.Location, t.Tag
FROM image i
 LEFT JOIN image_tag it ON it.ImageID = i.id AND it.IsWritten = 0
  LEFT JOIN tag t ON t.id = it.TagID
  WHERE it.ImageID IS NOT NULL OR EXISTS (SELECT ImageID FROM image_tag WHERE ImageID = i.id AND IsDeleted = 1)
EOF

#could use GROUP_CONCAT but that would make it MySQL/MariaDB specific
my $sth = $dbh->prepare($SQL);
$sth->execute();

my $prev_image_id;
my $prev_image_location;

my @current_tags;

my $count = 0;

while (my $row = $sth->fetchrow_hashref('NAME_uc')) {

	if ($count > 0 && $count++ % 50 == 0) {
		print "Processed ${count}\n";
	}

	if ($row->{TAG}) {

		if ($prev_image_id && $prev_image_id != $row->{ID}) {
			write_image($prev_image_id,$prev_image_location,@current_tags);
			$prev_image_id = $prev_image_location = undef;
			@current_tags = ();
		}

		$prev_image_id = $row->{ID};
		$prev_image_location = $row->{LOCATION};

		push @current_tags,$row->{TAG};

	} else {
		
		#all tags have been removed
		write_image($row->{ID},$row->{LOCATION});

		$prev_image_id = $prev_image_location = undef;
	}

}

if ($prev_image_id) {
	write_image($prev_image_id,$prev_image_location,@current_tags);
}

$dbh->do('UPDATE image_tag SET IsWritten = 1');
$dbh->do('DELETE FROM image_tag WHERE IsDeleted = 1');

sub write_image {
	my $id = shift;
	my $location = shift;
	my @tags = @_;

	my $fullpath = $basedir . $location;

	my $tool = new Image::ExifTool;

	#clear the current value
	$tool->SetNewValue('Keywords');

	foreach my $tag(@tags) {
		$tool->SetNewValue('Keywords',$tag);
	}

	if (! $tool->WriteInfo($fullpath)) {
		print STDERR "Failed to write $fullpath\n";
		exit(1);
	}

}


sub get_db {

	my $type = $config{db}{type} || 'mysql';

	$dbh = DBI->connect('DBI:' . $type . ':' . $config{db}{name},,$config{db}{user},$config{db}{pass},{RaiseError=>1}) || die("Could not connect to imagegallery database $!");

	$dbh->{FetchHashKeyName} = 'NAME_uc';
}
