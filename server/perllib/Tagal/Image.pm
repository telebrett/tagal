package Tagal::Image;
use strict;
use parent 'Tagal::Base';

BEGIN {
	use IPC::Cmd qw/can_run/;
	die "exiftool is required" unless can_run('exiftool');
}

use File::Temp qw/tempfile tempdir/;
use File::Copy;
use IPC::Open3;
use File::Basename;
use Image::Magick;
use Tagal::Video;

sub init {
	my $self = shift;
	$self->SUPER::init(@_);

	my %args = @_;

	#This is the database row for the image
	$self->{image} = $args{image} or die("image not specified");

}

sub fullpath {
	my $self = shift;

	return $self->{config}{images}{basedir} . $self->image->{LOCATION};
}

sub rotate {

	my $self      = shift;
	my $clockwise = shift;
	my $commit    = shift;

	my $cmd = ['exiftran'];

	my $tmp_fh;
	my $tmp_file;
	
	#Always use a temporary file
	($tmp_fh, $tmp_file) = tempfile(UNLINK=>$commit);
	close $tmp_fh;

	push @$cmd, '-o', $tmp_file;
	push @$cmd, $clockwise ? '-9' : '-2';
	push @$cmd, $self->fullpath;
	
	my ($exit_code, $stdout, $stderr) = Tagal::Base::run_command($cmd);

	if ($exit_code != 0) {
		print STDERR $stderr;
		exit $exit_code;
	}

	if (! $commit) {
		print "Rotated image to $tmp_file\n";
		exit;
	}

	move($tmp_file, $self->fullpath) or die("Could not overwrite " . $self->fullpath . "\n");

	$self->commit_rotated();

}

sub generate_thumbnail { 
	my $self = shift;
	my $overwrite = shift;

	my $fulldir = dirname($self->fullpath);
	my $file    = basename($self->fullpath);

	my $thumbnail = $fulldir . '/.thumb/' . $file;

	if (! -d $fulldir . '/.thumb'){
		mkdir $fulldir . '/.thumb';
	}

	my $conv_height = $self->image->{HEIGHT} / ($self->image->{WIDTH} / 320);

	my $new_size = '320x' . $conv_height;

	#has to be a new one each time or it writes multiple files
	my $converter = Image::Magick->new;
	$converter->Read($self->fullpath);
	$converter->Resize(geometry=>$new_size);
	$converter->Extent(geometry=>$new_size);
	$converter->Write($thumbnail);

}

sub write_exif {
	my $self = shift;
	my $overwrite = shift;

	my $fulldir = dirname($self->fullpath);
	my $file    = basename($self->fullpath);

	if (! -d $fulldir . '/.exif'){
		mkdir $fulldir . '/.exif';
	}

	my $exifdata  = $fulldir . '/.exif/' . $file . '.json';

	if ($overwrite || ! -e $exifdata) {
		#We could read into perl using Image::ExifTool but it doesn't produce a real hash, and exiftool doesn't support writing to json files
		open EXIF, '>', $exifdata;
		my $exif_pid = open3(undef, '>&EXIF', undef, 'exiftool', '--ThumbnailImage', '-json', $self->fullpath);
		waitpid($exif_pid, 0);
		close EXIF;
	}

}

sub commit_rotated {
	my $self = shift;

	#TODO - preview files, we either have to delete them (we shouldn't compare
	#       lastmoddates as the image 
	#       BUT we can't, as they go into a private tmp that only the httpd user
	#       has access to
	#
	#       so we either need to store these previews in the actual autocopy dir
	#       OR we need to compare last mod dates

	my $height = $self->image->{HEIGHT};
	$self->image->{HEIGHT} = $self->image->{WIDTH};
	$self->image->{WIDTH} = $height;

	$self->generate_thumbnail(1);
	$self->write_exif(1);

	my $SQL = 'UPDATE image SET Width = ?, Height = ?, IsDiffFromPrimaryJSONDB = 1 WHERE id = ?';

	$self->dbh->do($SQL, {}, $self->image->{WIDTH}, $self->image->{HEIGHT}, $self->image->{ID});
}

sub load_from_location {
	my $dbh      = shift;
	my $location = shift;

	my $config   = shift;

	my $basedir = $config->{images}{basedir};

	my $fullpath;

	if (-e $location) {

		#Note, this won't like symlinks, but the user can use relative locations in this case
		$fullpath = Cwd::realpath($location);

		if (index($fullpath, $basedir) != 0) {
			print STDERR "${fullpath} is not inside the configured basedir at ${basedir}\n";
			exit 1;
		}

	} else {
		$fullpath = $location;
		if (index($fullpath, '/') != 0) {
			$fullpath = '/' . $fullpath;
		}
		$fullpath = $basedir . $fullpath;

		if (! -e $fullpath) {
			print STDERR "Cannot find ${location} inside ${basedir}\n";
			exit 1;
		}
	}

	my $image_location = substr($fullpath, length $basedir);

	my $row = $dbh->selectrow_hashref('SELECT * FROM image WHERE Location = ?',{},$image_location);

	if (defined $row) {

		my %args = (
			image => $row,
			dbh   => $dbh,
			config => $config
		);

		return Tagal::Image::load_from_row(%args);

	}

	return;

}

sub load_from_id {
	my $dbh    = shift;
	my $id     = shift;
	my $config = shift;

	my $row = $dbh->selectrow_hashref('SELECT * FROM image WHERE id = ?', {}, $id);

	if (defined $row) {

		my %args = (
			image => $row,
			dbh   => $dbh,
			config => $config
		);

		return Tagal::Image::load_from_row(%args);

	}

	return;
}


sub load_from_row {
	my %args = @_;

	if ($args{image}->{ISVIDEO}) {
		return new Tagal::Video(%args);
	} else {
		return new Tagal::Image(%args);
	}

}

1;
