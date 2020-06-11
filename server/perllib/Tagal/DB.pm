package Tagal::DB;
use strict;

use DBI;

sub get_db {
	
	my %config = @_;

	my $database_type = $config{db}{type} || 'mysql';

	my $dbh = DBI->connect('DBI:' . $database_type . ':' . $config{db}{name},,$config{db}{user},$config{db}{pass},{RaiseError=>1}) || die("Could not connect to imagegallery database $!");

	#This is so the handle doesn't get closed by the forked child processes
	$dbh->{AutoInactiveDestroy} = 1;

	$dbh->{FetchHashKeyName} = 'NAME_uc';

	return ($dbh, lc $database_type);
}

1;
