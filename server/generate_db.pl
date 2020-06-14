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
use File::Temp qw/tempfile/;
use IPC::Open3;
use IPC::Cmd qw/can_run/;

die "jq is required" unless can_run('jq');
die "sha256sum is required" unless can_run('sha256sum');

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
my $CLEAR_IMAGE_DIFFS = 0;

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

	#This is presumed to be the primary database for local admin, tagging, rotation etc
	$CLEAR_IMAGE_DIFFS = 1;

	print "Writing to $OUTPUT\n";

}

get_db();
build_db();

if ($CLEAR_IMAGE_DIFFS) {
	clear_image_diffs();
}

sub clear_image_diffs {
	
	#If images have their primary data modified since the last time we
	#generated the db, they are output in the diffs API call until this
	#flag is cleared
	$dbh->do('UPDATE image SET IsDiffFromPrimaryJSONDB = 0 WHERE IsDiffFromPrimaryJSONDB = 1');

}

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
	             . " JOIN image_tag it ON it.ImageID = i.id AND it.IsWritten = 1\n"
	             . " JOIN tag t ON t.id = it.TagID\n";

	my %date_functions = get_date_functions('i.DateTaken');

	my $SQL_IMAGES = "SELECT i.*,$date_functions{year} AS YearTaken,$date_functions{month} AS MonthTaken,$date_functions{day} AS DayOfMonthTaken,$date_functions{epoch} AS SortOrder, c.Name as Camera, X(g.Geometry) AS Lng, Y(g.Geometry) AS Lat\n"
	               . "FROM image i\n"
	               . " LEFT JOIN camera c ON c.id = i.CameraID\n"
	               . " LEFT JOIN geometry g ON g.id = i.GeometryID\n"
	;


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
		             . " JOIN image_tag it ON it.TagID = s3tag.TagID AND it.ImageID = i.id AND it.IsWritten = 1\n";

	}

	if (@WHERE) {
		$SQL_TAGS   .= 'WHERE ' . join(' AND ', @WHERE) . "\n";
		$SQL_IMAGES .= 'WHERE ' . join(' AND ', @WHERE) . "\n";
	}

	#Note, these two statements MUST be ordered the same
	#We also want to minimise the risk of new images changing
	#the index of an image in a previously generated database.json file
	#Obviously if the SQL database has been purged then a mismatch is required
	$SQL_TAGS .= "ORDER BY i.id, i.DateTaken";
	$SQL_IMAGES .= "ORDER BY i.id, i.DateTaken";

	#Note, these two statements MUST be ordered the same
	my $sth_tags = $dbh->prepare($SQL_TAGS);
	$sth_tags->execute(@SQL_TAGS_BIND);

	my $sth_image = $dbh->prepare($SQL_IMAGES);
	$sth_image->execute(@SQL_IMAGES_BIND);

	my $cur_tag = $sth_tags->fetchrow_hashref;

	my $vids_tag = '';

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

		if ($image->{CAMERA}) {
			my $camera_tag = '__camera__' . $image->{CAMERA};
			if (defined $data->{tags}->{$camera_tag}) {
				push @{$data->{tags}->{$camera_tag}}, $image->{ID};
			} else {
				$data->{tags}->{$camera_tag} = [$image->{ID}];
				$data->{tagmetadata}->{$camera_tag} = {type=>'camera', label=>$image->{CAMERA}};
			}
		}

		if ($image->{ISVIDEO}) {
			if ($vids_tag eq '') {
				$vids_tag = '__videos__';
				$data->{tags}->{$vids_tag} = [];
				$data->{tagmetadata}->{$vids_tag} = {type=>'video', single=>1};
			}

			push @{$data->{tags}->{$vids_tag}}, $image->{ID};
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

		if ($image->{LAT} && $image->{LNG}) {

			my $point_tag = '__' . $image->{LNG} . ':' . $image->{LAT} . '__';

			if (! defined $data->{tags}->{$point_tag}) {
				$data->{tags}->{$point_tag} = [];
				$data->{tagmetadata}->{$point_tag} = {type => 'point', y => $image->{LAT}, x => $image->{LNG}};

			}

			push @{$data->{tags}->{$point_tag}}, $image->{ID};
		}

	}
	
	my ($tmp_fh, $tmp_file) = tempfile();
	print $tmp_fh encode_json($data);
	close $tmp_fh;

	my $hash_pid = open3(undef, \*HASH_OUT, undef, 'sha256sum', $tmp_file);
	waitpid($hash_pid, 0);

	my $hash_output = <HASH_OUT>;
	#strip the filename off the end
	$hash_output =~ s/\s+.*$//g;

	open FILE, '>', $OUTPUT;
	my $jq_pid = open3(undef, '>&FILE', undef, 'jq','. += {hash: "' . $hash_output . '"}', $tmp_file);
	waitpid($jq_pid, 0);
	close FILE;

	unlink $tmp_file;

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
 -f[orce]     If set then it will overwrite the existing file without asking

 Note that public / restricted are exclusive options

=head1 DESCRIPTION

Builds the JSON database file.

=cut
