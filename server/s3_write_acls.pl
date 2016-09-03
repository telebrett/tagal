#!/usr/bin/perl -w
use strict;

#todo - need to be able to revoke
#aws s3api put-object-acl --bucket MyBucket --key file.txt --grant-full-control emailaddress=user1@example.com,emailaddress=user2@example.com --grant-read uri=http://acs.amazonaws.com/groups/global/AllUsers

use DBI;
use Data::Dumper;
use Cwd qw(abs_path realpath);
use Config::IniFiles;
use File::Basename;
use Pod::Usage;

use JSON::XS;

my $dbh;

tie my %config, 'Config::IniFiles',(-file=>abs_path(dirname(abs_path($0)) . '/../config.ini'));

get_db();
write_policies();


sub write_policies {

	my $sth_image = $dbh->prepare('SELECT i.id,i.Location FROM image i JOIN image_tag it ON it.ImageID = i.id JOIN tag t ON t.id = it.TagID AND t.IsPublic = 1 WHERE i.IsPublic = 0');
	$sth_image->execute();

	#todo - write to the database
	#     - support 'restricted'
	#     - support sync

	while (my $image = $sth_image->fetchrow_hashref){

		print "Syncing $image->{LOCATION}\n";

		my @s3_path = (
			$config{s3}{basedir} . $image->{LOCATION},
			$config{s3}{basedir} . dirname($image->{LOCATION}) . '/.thumb/' . basename($image->{LOCATION}),
		);

		foreach my $s3_object(@s3_path) {
			my @cmd_args = (
				'aws',
				's3api',
				'put-object-acl',
				'--bucket',
				$config{s3}{bucket},
				'--key',
				$s3_object,
				'--grant-read',
				'uri=http://acs.amazonaws.com/groups/global/AllUsers'
			);

			my $result = system(@cmd_args);

			if ($result != 0) {
				warn "Error code $result for " . $image->{LOCATION} . "\n";
				exit(1);
			}
		}

		#S3 is so slow that we won't thrash the DB by doing this
		update_image($image->{ID});

	}

}

sub update_image {
	my $id = shift;

	my $uth = $dbh->prepare("UPDATE image SET IsPublic = 1 WHERE id = ?");
	$uth->execute($id);
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
