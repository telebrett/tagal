#!/usr/bin/perl -w
use strict;

#todo - need to be able to revoke
#aws s3api put-object-acl --bucket MyBucket --key file.txt --grant-full-control emailaddress=user1@example.com,emailaddress=user2@example.com --grant-read uri=http://acs.amazonaws.com/groups/global/AllUsers
#     - Look at using "tags". see https://docs.aws.amazon.com/AmazonS3/latest/dev/object-tagging.html

use DBI;
use Carp;
use Data::Dumper;
use Cwd qw(abs_path realpath);
use Config::IniFiles;
use File::Basename;
use Pod::Usage;
use Getopt::Long;

use JSON::XS;

my $S3USER = undef;
my $HELP = undef;

#TODO - an object can only have 10 tags
#       what happens if an object already has tag A, when we write tag B, does it clear tag A

Getopt::Long::GetOptions('s3user=s'=>\$S3USER,'help'=>\$HELP);

if ($HELP) {
	pod2usage(0);
} elsif(! $S3USER) {
	warn "s3user is required\n";
	pod2usage(1);
}

my $dbh;

tie my %config, 'Config::IniFiles',(-file=>abs_path(dirname(abs_path($0)) . '/../config.ini'));

get_db();
write_s3user_tag();

#note, these are AWS S3 tags, not EXIF tags in the files themselves
sub write_s3user_tag {

	#TODO - this count is incorrect
	my $SQL = "SELECT COUNT(*) AS Count\n"
	        . "FROM image i\n"
			. " JOIN image_tag trestrict ON trestrict.ImageID = i.id\n"
	        . " JOIN s3user_tag s3trestrict ON s3trestrict.TagID = trestrict.TagID\n"
	        . " JOIN s3user s3restrict ON s3restrict.id = s3trestrict.S3UserID AND s3restrict.Username = ?"
	;
	my $count = $dbh->selectrow_hashref($SQL, undef, $S3USER)->{COUNT};

	#Remember, this is tagging the image with the "s3username" - NOT the actual tag, so a DISTINCT of image, S3Username is fine

	$SQL = "SELECT i.id, i.Location, u.Username\n"
	        . "FROM image i\n"
			. " JOIN image_tag trestrict ON trestrict.ImageID = i.id\n"
	        . " JOIN s3user_tag s3trestrict ON s3trestrict.TagID = trestrict.TagID\n"
	        . " JOIN s3user s3restrict ON s3restrict.id = s3trestrict.S3UserID AND s3restrict.Username = ?\n"
			. " JOIN image_tag t ON t.ImageID = i.id\n"
	        . " JOIN s3user_tag s3t ON s3t.TagID = t.TagID\n"
	        . " JOIN s3user u ON u.id = s3t.S3UserID\n"
	        . "GROUP BY i.id, i.Location, u.Username\n"
	        . "ORDER BY i.id, u.Username\n";

	my $sth = $dbh->prepare($SQL);
	$sth->execute($S3USER);

	my $cur_user_tags = [];
	my $cur_image_location;

	my $processed = 0;

	while (my $image = $sth->fetchrow_hashref){

		if (defined($cur_image_location) && $cur_image_location ne $image->{LOCATION}) {
			if (@{$cur_user_tags}) {
				push_tags($cur_image_location, $cur_user_tags);
				
				print "\rProcessed " . ++$processed . " out of $count";
			}

			$cur_user_tags = [];
			$cur_image_location = $image->{LOCATION};

		} else {
			$cur_image_location = $image->{LOCATION};
		}

		push @$cur_user_tags, {Key => $image->{USERNAME} . '-restricted', Value => '1'};

	}

	if (@{$cur_user_tags}) {
		push_tags($cur_image_location, $cur_user_tags);
	}

	print " Finished\n";

}

sub push_tags {
	my $image_location = shift;
	my $tags = shift;

	my @s3_path = (
		$config{s3}{basedir} . $image_location,
		$config{s3}{basedir} . dirname($image_location) . '/.thumb/' . basename($image_location),
	);

	#TODO - warn / error if more than 10 tags (AWS limit)

	foreach my $s3_object(@s3_path) {
		my @cmd_args = (
			'aws',
			's3api',
			'put-object-tagging',
			'--bucket',
			$config{s3}{bucket},
			'--key',
			$s3_object,
			'--tagging',
			encode_json({TagSet=>$tags})
		);

		my $result = system(@cmd_args);

		if ($result != 0) {
			warn "Error code $result for " . $image_location . "\n";
			exit(1);
		}
	}


}

sub get_db {

	my $type = $config{db}{type} || 'mysql';

	$dbh = DBI->connect('DBI:' . $type . ':' . $config{db}{name},,$config{db}{user},$config{db}{pass},{RaiseError=>1}) || die("Could not connect to imagegallery database $!");

	$dbh->{FetchHashKeyName} = 'NAME_uc';
}


1;

=head1 NAME

s3_write_acls.pl

=head1 SYNOPSIS

./s3_write_acls.pl [--sync]

 Options

 -s[ync] ACL's will be reset, otherwise, it will treat the local database cache as a source of truth

=head1 DESCRIPTION

Sets the ACL's against the image files and their thumbnails

=cut
