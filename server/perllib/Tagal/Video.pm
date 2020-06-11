package Tagal::Video;
use strict;
use parent 'Tagal::Image';

BEGIN {
	use IPC::Cmd qw/can_run/;

#Commented out apngasm as it is a local build and apache can't see it
#	die "apngasm is required" unless can_run('apngasm');
	die "ffmpeg is required" unless can_run('ffmpeg');
}

use File::Temp qw/tempfile tempdir/;

=pod

=head1 METHOD : create_thumbnail

=head1 ARGS

=over 4

=item b<exifdata> ImageInfo

=item B<thumbnail> string

The path to where the thumbnail should be written 

=item B<preview>

The path to where the preview should be written

=item B<height> int

=item B<width> int

=back

=cut

sub rotate {
	if ( ! -t STDOUT) {
		print STDERR "Video rotation only supported via CLI, not WEB\n";
		exit 2;
	}

	die('Tagal::Video - rotate TODO');
}

sub generate_thumbnail {
	die('Tagal::Video generate_thumbnail needs to be redone');
}

sub create_thumbnail {

	my $exifdata = shift;
	my $thumbnail = shift;
	my $preview = shift;

	#There could be a JPG file with the same name except or the suffix
	#$thumbnail =~ s/\.\w+$/-movie\.png/;
	#$preview =~ s/\.\w+$/-movie\.png/;

	my $height = shift;
	my $width = shift;

	my $fullpath = $exifdata->{Directory} . '/' . $exifdata->{FileName};

	my $length = 0;

	if ($exifdata->{Duration} =~ m/^(\d+\.\d+) s$/) {
		$length = $1;
	} elsif ($exifdata->{Duration} =~ m/^(\d+):(\d+):(\d+)$/) {
		$length = $3 + $2 * 60 + $1 * 3600;
	}

	#Extract 20 frames, with a minimum of 5 seconds between, eg if only 20 seconds, then there will only be 4 frames
	my $frames = 20;
	my $gap = 5;

	#minimum of $gap seconds between frames
	if ($frames * $gap > $length) {
		$frames = floor($length / $gap) + 1;
	} else {
		$gap = floor($length / $frames);
	}

	my $frame_dir = tempdir(CLEANUP => 1);
	my @join_cmd = ('apngasm', '-o', shell_quote($preview));

	for (my $i = 0; $i < $frames; $i++) {

		my $frame_path = $frame_dir . "/frame${i}.png";

		my @cmd = (
			'ffmpeg',
			'-ss', $i * $gap,
			'-i', shell_quote($fullpath),
			'-vf', "scale=${width}:${height}",
			'-vframes', 1,
			'-q:v', 2,
			'-tune', 'stillimage',
			shell_quote($frame_path)
		);

		if (! call_system("Generating frame $i for video preview ", @cmd)) {
			warn "Failed to generate image from movie for $fullpath\n";
		}

		#TODO BUG whereby ffmpeg fails to encode as we have gone past the end of the video, but still exits with 0 (WTF!!), so check that the file, you know, actually exists
		if ( -e $frame_path) {
			push @join_cmd, $frame_path;
		}

		if ($i == 0) {
			copy($frame_path, $thumbnail);
		}
	}

	if ($frames == 1) {
		copy($thumbnail, $preview);
	} else {
		#Force overwrite
		push @join_cmd, '-F';

		#number of milliseconds between each frame
		push @join_cmd, '-d', 1000;

		if (! call_system("Generating animated png ", @join_cmd)) {
			warn "Failed to generate animated png for $fullpath\n";
			warn join(' ', @join_cmd) . "\n";
		}
	}

}

1;
