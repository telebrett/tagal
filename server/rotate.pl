#!/usr/bin/perl -w
use strict;

BEGIN {
	use Cwd;
	use File::Basename;
	my $realpath = dirname(Cwd::realpath($0));
	push @INC, $realpath . '/perllib';

	use IPC::Cmd qw/can_run/;
	die "exiftran is required" unless can_run('exiftran');
}

use Tagal::DB;
use Tagal::Config;
use Tagal::Image;
use Pod::Usage;
use Cwd;
use File::Basename;
use File::Temp qw/tempfile tempdir/;

use IPC::Cmd;

use Getopt::Long;

my $OPT_MAN    = 0;
my $OPT_USAGE  = 0;
my $OPT_COMMIT = 0;
my $OPT_LOCATION  = undef;
my $OPT_ID        = undef;
my $OPT_DIRECTION = undef;

Getopt::Long::GetOptions('man'=>\$OPT_MAN,'help'=>\$OPT_USAGE,'commit'=>\$OPT_COMMIT,'id=i'=>\$OPT_ID,'location=s'=>\$OPT_LOCATION,'direction=s'=>\$OPT_DIRECTION);

pod2usage(1) if $OPT_USAGE;
pod2usage(-exitval=>0,-verbose=>2) if ($OPT_MAN);

if (not defined $OPT_LOCATION and not defined $OPT_ID) {
	print STDERR "location or image id not specified\n";
	pod2usage(1);
}

if (not defined $OPT_DIRECTION or not ($OPT_DIRECTION eq 'cw' || $OPT_DIRECTION eq 'ccw')) {
	print STDERR "direction must be either cw or ccw";
	if (defined($OPT_DIRECTION)) {
		print STDERR " you specified '$OPT_DIRECTION'";
	}
	print STDERR "\n";

	pod2usage(1);
}

my %config = Tagal::Config::config();
my ($dbh, $database_type) = Tagal::DB::get_db(%config);

my $image;

if (defined $OPT_LOCATION) {
	$image = Tagal::Image::load_from_location($dbh, $OPT_LOCATION, \%config);
} else {
	$image = Tagal::Image::load_from_id($dbh, $OPT_ID, \%config);
}

if (! $image) {
	die("Could not find image");
}

$image->rotate($OPT_DIRECTION eq 'cw', $OPT_COMMIT);

1;

=head1 NAME

rotate.pl

=head1 SYNOPSIS

./rotate.pl -l <image location> -d <cw|ccw>

or

./rotate.pl -i <image id> -d <cw|ccw>

 Options
  -h[elp]       brief help message
  -man          Full help
  -l[ocation]   Path of the file to be rotated. Either an absolute path (the file must be in the configured base path), or relative to the config base dir
  -i[d]         Id of the image to be rotated
  -d[irection]  Direction to rotate, valid values 'cw' (clockwise), 'ccw' (counter clock wise)
  [-c[ommit]]   Commit the change, if not set, then this script will output the path to the converted file and the database won't be updated

=head1 DESCRIPTION

Rotates an individual image / video. Regenerates the thumbnails and updates the database

=cut
