#!/usr/bin/perl -w
use strict;

use DBI;
use Image::ExifTool qw(:Public);
use Config::IniFiles;
use Cwd qw(abs_path);
use File::Basename;

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

#could use GROUP_CONCAT but that would make it MySQL/MariaDB specific
my $sth = $dbh->prepare('SELECT i.id,i.Location,t.Tag FROM image i LEFT JOIN image_tag _it ON _it.ImageID = i.id LEFT JOIN tag t ON t.id = _it.TagID WHERE i.IsDirty = 1 ORDER BY i.id,t.Tag');
$sth->execute();

my $prev_image_id;
my $prev_image_location;

my @current_tags;

while (my $row = $sth->fetchrow_hashref('NAME_uc')) {

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
		
		#tags have been removed
		write_image($row->{ID},$row->{LOCATION});

		$prev_image_id = $prev_image_location = undef;
	}

}

if ($prev_image_id) {
	write_image($prev_image_id,$prev_image_location,@current_tags);
}

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

	my $sth_upd = $dbh->prepare('UPDATE image SET IsDirty = 0 WHERE id = ?');
	return $sth_upd->execute($id);


}


sub get_db {

	my $type = $config{db}{type} || 'mysql';

	$dbh = DBI->connect('DBI:' . $type . ':' . $config{db}{name},,$config{db}{user},$config{db}{pass},{RaiseError=>1}) || die("Could not connect to imagegallery database $!");

	$dbh->{FetchHashKeyName} = 'NAME_uc';
}
