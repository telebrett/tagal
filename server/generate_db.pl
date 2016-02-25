#!/usr/bin/perl -w
use strict;

use DBI;
use Data::Dumper;
use DateTime;
use DateTime::Format::MySQL;
use Cwd qw(abs_path);
use Config::IniFiles;
use File::Basename;

use JSON::XS;

my $dbh;

tie my %config, 'Config::IniFiles',(-file=>abs_path(dirname(abs_path($0)) . '/../config.ini'));

get_db();
build_db();

sub build_db {
	my $data = {images=>[],tags=>{}};

	#Note, these two statements MUST be ordered the same
	my $sth_tags = $dbh->prepare("SELECT t.Tag,it.ImageID FROM tag t JOIN image_tag it ON it.TagID = t.id JOIN image i ON i.id = it.ImageID ORDER BY i.DateTaken,i.id");
	$sth_tags->execute();

	my $sth_image = $dbh->prepare("SELECT *,YEAR(DateTaken) AS YearTaken,MONTH(DateTaken) AS MonthTaken,DAYOFMONTH(DateTaken) AS DayOfMonthTaken FROM image ORDER BY DateTaken,id");
	$sth_image->execute();

	my $cur_tag = $sth_tags->fetchrow_hashref;

	my $image_index = 0;
	while (my $image = $sth_image->fetchrow_hashref){

		my $size_ratio = 0;
		if ($image->{WIDTH} && $image->{HEIGHT}){
			$size_ratio = $image->{WIDTH} / $image->{HEIGHT};
		}

		push @{$data->{images}},[$image->{LOCATION},$size_ratio];

		my $ytag = 'y' . $image->{YEARTAKEN};
		my $mtag = 'm' . $image->{MONTHTAKEN};
		my $dtag = 'd' . $image->{DAYOFMONTHTAKEN};

		if (! defined $data->{tags}->{$ytag}){
			$data->{tags}->{$ytag} = [];
		}
		if (! defined $data->{tags}->{$dtag}){
			$data->{tags}->{$dtag} = [];
		}
		if (! defined $data->{tags}->{$dtag}){
			$data->{tags}->{$dtag} = [];
		}

		#write out the psuedo tag for the date the image was taken
		push @{$data->{tags}->{$ytag}},$image_index;
		push @{$data->{tags}->{$mtag}},$image_index;
		push @{$data->{tags}->{$dtag}},$image_index;

		while($cur_tag && $cur_tag->{IMAGEID} == $image->{ID}){

			if (! defined $data->{tags}->{$cur_tag->{TAG}}){
				$data->{tags}->{$cur_tag->{TAG}} = [];
			}

			push @{$data->{tags}->{$cur_tag->{TAG}}},$image_index;

			$cur_tag = $sth_tags->fetchrow_hashref;
		}

		$image_index++;
	}

	open (FILE,'>../web/database.json');
	print FILE encode_json($data);
	close FILE;

}

sub get_db {

	my $type = $config{db}{type} || 'mysql';

	$dbh = DBI->connect('DBI:' . $type . ':' . $config{db}{name},,$config{db}{user},$config{db}{pass},{RaiseError=>1}) || die("Could not connect to imagegallery database $!");

	$dbh->{FetchHashKeyName} = 'NAME_uc';
}


1;
