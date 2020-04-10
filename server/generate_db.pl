#!/usr/bin/perl -w
use strict;


# SELECT t.Tag, it.ImageID
# FROM image i
#  JOIN s3user s3 ON s3.Username = 'mpt'
#  JOIN s3user_tag s3t ON s3t.S3UserID = s3.id
#  JOIN image_tag s3it ON s3it.ImageID = i.id AND s3it.TagID = s3t.TagID
# 
#  JOIN image_tag it ON it.ImageID = i.id
#  JOIN tag t ON t.id = it.TagID
# 
# 
# ORDER BY i.DateTaken, i.id
# ;

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
my $OUTPUT = undef;
my $IMAGEDIR = 'pictures';
my $S3USER = undef;
my $HELP = undef;
my $FORCE = 0;

my $RESTRICTPATH = undef;

my $database_type;

#TODO - For s3, the root dir is different

Getopt::Long::GetOptions('public'=>\$PUBLIC,'s3user=s'=>\$S3USER,'output=s'=>\$OUTPUT,'imagedir=s'=>\$IMAGEDIR,'help'=>\$HELP, 'dir=s' => \$RESTRICTPATH, 'force' => \$FORCE);

if ($HELP) {
	pod2usage(0);
}

if ($PUBLIC && $S3USER) {
	warn "Cannot specify public and restricted\n";
	pod2usage(1);
}

if ($S3USER && ! $OUTPUT) {
	warn "S3user must specify a custom database\n";
	pod2usage(1);
}

if ($OUTPUT) {
	if (-e $OUTPUT && ! $FORCE) {
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
	$OUTPUT = $config{app}{jsondatabase};
   	if (! $OUTPUT) {
		warn "Output file not specified as argument or in config (app.jsondatabase)\n";
		pod2usage(1);
	}

}

get_db();
build_db();

sub get_date_functions {

	my $column = shift;
	my %funcs;

	if ($database_type eq 'mysql') {
		$funcs{year}  = 'YEAR(' . $column . ')';
		$funcs{month} = 'MONTH(' . $column . ')';
		$funcs{day}   = 'DAYOFMONTH(' . $column . ')';
		$funcs{epoch} = 'UNIX_TIMESTAMP(' . $column . ')';
	} elsif ($database_type eq 'sqlite') {
		$funcs{epoch} = $column;

		$column       = "datetime($column, 'unixepoch')";
		$funcs{year}  = "strftime('%Y', $column)";
		$funcs{month} = "strftime('%m', $column)";
		$funcs{day}   = "strftime('%d', $column)";
	}

	return %funcs;
}

sub build_db {
	my $data = {imagedir=>$IMAGEDIR,images=>{},tags=>{},tagmetadata=>{}};

	my @SQL_TAGS_BIND;
	my @SQL_IMAGES_BIND;

	my $SQL_TAGS = "SELECT t.Tag, it.ImageID\n"
	             . "FROM image i\n"
	             . " JOIN image_tag it ON it.ImageID = i.id\n"
	             . " JOIN tag t ON t.id = it.TagID\n";

	my %date_functions = get_date_functions('i.DateTaken');

	my $SQL_IMAGES = "SELECT i.*,$date_functions{year} AS YearTaken,$date_functions{month} AS MonthTaken,$date_functions{day} AS DayOfMonthTaken,$date_functions{epoch} AS SortOrder\n"
	               . "FROM image i\n";


	my @WHERE;;

	if ($RESTRICTPATH) {

		if ($RESTRICTPATH !~ m/^\//) {
			$RESTRICTPATH = '/' . $RESTRICTPATH;
		}

		$RESTRICTPATH = $RESTRICTPATH . '%';

		push @WHERE, 'i.Location LIKE ?';
		push @SQL_TAGS_BIND, $RESTRICTPATH;
		push @SQL_IMAGES_BIND, $RESTRICTPATH;
	}

	if ($PUBLIC) {
		push @WHERE, 'i.IsPublic = 1';

	} elsif ($S3USER) {

		push @SQL_TAGS_BIND, $S3USER;
		push @SQL_IMAGES_BIND, $S3USER;

		$SQL_TAGS .= " JOIN s3user s ON s.Username = ?\n"
		           . " JOIN s3user_tag s3tag ON s3tag.S3UserID = s.id AND s3tag.TagID = it.TagID\n";

		$SQL_IMAGES .= " JOIN s3user s ON s.Username = ?\n"
		             . " JOIN s3user_tag s3tag ON s3tag.S3UserID = s.id\n"
		             . " JOIN image_tag it ON it.TagID = s3tag.TagID AND it.ImageID = i.id\n";

	}

	if (@WHERE) {
		$SQL_TAGS   .= 'WHERE ' . join(' AND ', @WHERE) . "\n";
		$SQL_IMAGES .= 'WHERE ' . join(' AND ', @WHERE) . "\n";
	}

	#Note, these two statements MUST be ordered the same
	$SQL_TAGS .= "ORDER BY i.DateTaken, i.id";
	$SQL_IMAGES .= "ORDER BY i.DateTaken, i.id";

	#Note, these two statements MUST be ordered the same
	my $sth_tags = $dbh->prepare($SQL_TAGS);
	$sth_tags->execute(@SQL_TAGS_BIND);

	my $sth_image = $dbh->prepare($SQL_IMAGES);
	$sth_image->execute(@SQL_IMAGES_BIND);

	my $cur_tag = $sth_tags->fetchrow_hashref;

	while (my $image = $sth_image->fetchrow_hashref){

		my $size_ratio = 0;
		if ($image->{WIDTH} && $image->{HEIGHT}){
			$size_ratio = $image->{WIDTH} / $image->{HEIGHT};
		}

		#TODO - there is an EXIF tag which contains the image index, eg IMG1345, this could be used to sort images which are taken in the 
		#       same second, eg high speed continous mode, could possible sort by camera as well as it is possible for two images from
		#       different cameras

		my $output_image = [$image->{LOCATION},$size_ratio,$image->{SORTORDER}];

		if ($image->{ISVIDEO}) {
			push @$output_image, 1;
		}

		$data->{images}->{$image->{ID}} = $output_image;

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

			$cur_tag = $sth_tags->fetchrow_hashref;
		}

	}

	open (FILE,'>' . $OUTPUT);
	print FILE encode_json($data);
	close FILE;

}

sub get_db {

	$database_type = $config{db}{type} || 'mysql';

	$dbh = DBI->connect('DBI:' . $database_type . ':' . $config{db}{name},,$config{db}{user},$config{db}{pass},{RaiseError=>1}) || die("Could not connect to imagegallery database $!");

	$dbh->{FetchHashKeyName} = 'NAME_uc';

	$database_type = lc $database_type;
}


1;

=head1 NAME

generate_db.pl

=head1 SYNOPSIS

./generate_db.pl [-public] [--s3user name] [--output /path/to/output]

 Options

 -p[ublic]    Build public db
 -s[3user]    The s3user to write out a restricted user for
 -o[output]   The path to to write out to
 -i[magedir]  The path that the images are in. Defaults to 'pictures'
 -d[ir] [dir] eg "-d 2016/01" would generate a database for files starting with that path
 -f[orce]     If set then it will overwrite the existinf file without asking

 Note that public / restricted are exclusive options

=head1 DESCRIPTION

Builds the JSON database file.

=cut
