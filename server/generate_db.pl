#!/usr/bin/perl -w
use strict;

use DBI;
use Data::Dumper;
use DateTime;
use DateTime::Format::MySQL;
use Cwd qw(abs_path realpath);
use Config::IniFiles;
use File::Basename;
use File::Spec;
use Getopt::Long;
use Pod::Usage;

use JSON::XS;

my $dbh;

tie my %config, 'Config::IniFiles',(-file=>abs_path(dirname(abs_path($0)) . '/../config.ini'));

my $PUBLIC = 0;
my $RESTRICTED = 0;
my $OUTPUT = undef;
my $IMAGEDIR = 'pictures';

#TODO - For s3, the root dir is different

Getopt::Long::GetOptions('public'=>\$PUBLIC,'restricted'=>\$RESTRICTED,'output=s'=>\$OUTPUT,'imagedir=s'=>\$IMAGEDIR);

if ($PUBLIC && $RESTRICTED) {
	warn "Cannot specify public and restricted\n";
	pod2usage(1);
}

if ($OUTPUT) {
	if (-e $OUTPUT) {
		print "File $OUTPUT exists. Do you want to overwrite? ";
		while (<STDIN>) {
			if (/^yes$/i) {
				last;
			} elsif (/^no$/i) {
				exit 0;
			}

			print "\nYes|No\n";
		}
	}
} else {
	$OUTPUT = realpath(dirname(File::Spec->rel2abs(__FILE__)) . '/../web/app/database.json');
}

get_db();
build_db();

sub build_db {
	my $data = {imagedir=>$IMAGEDIR,images=>{},tags=>{},tagmetadata=>{}};

	my $where = '';
	my $join = '';
	if ($PUBLIC || $RESTRICTED) {

		#todo, ugly, change to SQLFactory

		$join = ' JOIN image_tag it ON it.ImageID = i.id JOIN tag t ON t.id = it.TagID';

		if ($PUBLIC) {
			$where = 't.IsPublic = 1';
		} elsif ($RESTRICTED) {
			$where = 't.IsRestricted = 1';
		}

		$join .= ' AND ' . $where;
		$where = 'WHERE ' . $where;
	}

	#Note, these two statements MUST be ordered the same
	my $sth_tags = $dbh->prepare("SELECT t.Tag,it.ImageID,t.IsPublic FROM tag t JOIN image_tag it ON it.TagID = t.id JOIN image i ON i.id = it.ImageID $where ORDER BY i.DateTaken,i.id");
	$sth_tags->execute();

	my $sth_image = $dbh->prepare("SELECT i.*,YEAR(i.DateTaken) AS YearTaken,MONTH(i.DateTaken) AS MonthTaken,DAYOFMONTH(i.DateTaken) AS DayOfMonthTaken,UNIX_TIMESTAMP(i.DateTaken) AS SortOrder FROM image i $join GROUP BY i.id ORDER BY i.DateTaken,i.id");
	$sth_image->execute();

	my $cur_tag = $sth_tags->fetchrow_hashref;

	while (my $image = $sth_image->fetchrow_hashref){

		my $size_ratio = 0;
		if ($image->{WIDTH} && $image->{HEIGHT}){
			$size_ratio = $image->{WIDTH} / $image->{HEIGHT};
		}

		#TODO - there is an EXIF tag which contains the image index, eg IMG1345, this could be used to sort images which are taken in the 
		#       same second, eg high speed continous mode, could possible sort by camera as well as it is possible for two images from
		#       different cameras

		$data->{images}->{$image->{ID}} = [$image->{LOCATION},$size_ratio,$image->{SORTORDER}];

		#TODO - Check for valid date

		my $ytag = '__year__ ' . $image->{YEARTAKEN};
		my $mtag = '__month__' . $image->{MONTHTAKEN};
		my $dtag = '__day__'   . $image->{DAYOFMONTHTAKEN};

		if (! defined $data->{tags}->{$ytag}){
			$data->{tags}->{$ytag} = [];
			$data->{tagmetadata}->{$ytag} = {datetype=>'year','dateval'=>$image->{YEARTAKEN}};
		}
		if (! defined $data->{tags}->{$mtag}){
			$data->{tags}->{$mtag} = [];
			$data->{tagmetadata}->{$mtag} = {datetype=>'month','dateval'=>$image->{MONTHTAKEN}};
		}
		if (! defined $data->{tags}->{$dtag}){
			$data->{tags}->{$dtag} = [];
			$data->{tagmetadata}->{$dtag} = {datetype=>'day','dateval'=>$image->{DAYOFMONTHTAKEN}};
		}

		#write out the psuedo tag for the date the image was taken
		push @{$data->{tags}->{$ytag}},$image->{ID};
		push @{$data->{tags}->{$mtag}},$image->{ID};
		push @{$data->{tags}->{$dtag}},$image->{ID};

		while($cur_tag && $cur_tag->{IMAGEID} == $image->{ID}){

			if (! defined $data->{tags}->{$cur_tag->{TAG}}){
				$data->{tags}->{$cur_tag->{TAG}} = [];
			}

			push @{$data->{tags}->{$cur_tag->{TAG}}},$image->{ID};

			#TODO - this should be outside of the image/tag loop
			if ($cur_tag->{ISPUBLIC}) {
				$data->{tagmetadata}->{$cur_tag->{TAG}} = {public=>1};
			}

			$cur_tag = $sth_tags->fetchrow_hashref;
		}

	}

	open (FILE,'>' . $OUTPUT);
	print FILE encode_json($data);
	close FILE;

}

sub get_db {

	my $type = $config{db}{type} || 'mysql';

	$dbh = DBI->connect('DBI:' . $type . ':' . $config{db}{name},,$config{db}{user},$config{db}{pass},{RaiseError=>1}) || die("Could not connect to imagegallery database $!");

	$dbh->{FetchHashKeyName} = 'NAME_uc';
}


1;

=head1 NAME

generate_db.pl

=head1 SYNOPSIS

./generate_db.pl [-public|-restricted] [--output /path/to/output]

 Options

 -p[ublic] build public db
 -r[estricted] build restricted db
 -o[output] The path to to write out to
 -i[magedir] The path that the images are in. Defaults to 'pictures'

 Note that public / restricted are exclusive options

=head1 DESCRIPTION

Builds the JSON database file.

=cut
