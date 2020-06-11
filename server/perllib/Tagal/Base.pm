package Tagal::Base;

use String::ShellQuote;
use IPC::Open3;

sub new {
	my $class = shift;
	my $self = {};
	bless $self, $class;
	$self->init(@_);
	return $self;
}

sub init {
	my $self = shift;
	my %args = @_;

	$self->{dbh} = $args{dbh} or die("dbh not specified");
	$self->{config} = $args{config} or die("config not specified");
}

sub run_command {
	my $cmd = shift;
	my $timeout = shift || 20;

	my $pid = open3(undef, \*CHLD_OUT, \*CHLD_ERR, @$cmd);

	waitpid($pid, 0);
	my $exit_code = $? >> 8;

	$stdout = '';
	while (<CHLD_OUT>) {
		$last_stdout .= "$_";
	}

	$stderr = '';
	while (<CHLD_ERR>) {
		$last_stderr .= "$_";
	}

	return ($exit_code, $stdout, $stderr);

}

sub DESTROY {}

sub AUTOLOAD {
    my $self = shift;

    my $property = $AUTOLOAD;
    $property =~ s/.*://; #strip class name

    die("$property property does not exist") unless exists $self->{$property};

    if (ref($self->{$property}) eq 'HASH'){
        return $self->{$property} unless scalar(@_);
        my $key = shift;
        return $self->{$property}->{$key} unless scalar(@_);
        my $value = shift;

        return $self->{$property}->{$key} = $value; 
    }

    my $value = shift;
    $self->{$property} = $value if defined($value);
    return $self->{$property};
}

1;

