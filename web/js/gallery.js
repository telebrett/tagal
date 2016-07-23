var gallery;

/***
 * ADMIN mode - Plan
 *
 * - commits - pending changes
 * - Add tags
 *  - Select existing tag
 *  - Add new tag / tags
 *  - Multi word tag support, ie don't have one textbox to add multiple tags
 *  - Tags to add / remove from selected set
 *
 * - Could possibly store in the selected storage
 * - delete mode - don't allow deletes, at least without a confirm, if there is not at least 2 hardlinks, ie at least one backup. We could also display
 *   the minimum number of hardlinks 
 * - "Show currently tagged" - this could show tags that all images have, and tags that some images have, could possibly use the tag selection to limit the current view
 * - generation of database.json, show "pending" tags separately
 *
 * SERVER
 *  - POST /api/addtags
 *    {"tags":["Camerons corner","William Gardner"],"images":[id1,id2,id3,...,idN]}
 *
 *  - POST /api/removetags
 *    {"tags":["Camerons corner"],"images":[id1,id2,id3,...,idN]}
 *
 *  - Both of these endpoints write to the database
 *
 *  - GET /api/tags
 *
 *    Returns the tags and their metadata eg "__PERSON__", "__PUBLIC__"
 *
 *  - POST /api/commit
 *    Will commit pending changes, this should have a lock to ensure that cannot be called twice, ie only one process on disk updating the actual images
 *
 *  - POST /api/revert
 *    Will revert pending changes
 *
 *  - PUT /api/tags/[tagid]/public - sets / clears the tag being "public"
 *  - PUT /api/tags/[tagid]/person - sets / clears the tag being a "person"
 *    
 *    Note, both of the PUT tags are immediate, ie you don't need COMMIT
 *
 */

/**
 * General ideas
 *
 * - "__PERSON__" tag - metadata against a tag itself, eg the tag "William gardner" is marked as a "person" tag
 * - "__PUBLIC__" tag - metadata against a tag itself, this could be useful for generating a "public" database so that images
 *                      can be shared with friends on amazon. This would require in my script to push to Amazon to scan all images
 *                      that are marked as public and make them publically accessible in S3
 *                      Note that "public" here might still require auth of some kind, see what S3 supports
 * - Auto rotate - lossless JPEG rotation - see exiftran, will be done server side
 * - Show exif data - JS file in each "day of year" directory with full exif data OR look at using exif-js to do so
 * - full image - detect server and if found, full screen source should be a script to resize
 * - full image - arrows to go left / right
 * - videos
 *
 *
 *
 */

$.MyGallery = function(){

	//No security required, server side scripts won't be shipped to amazon
	//TODO - make this configurable
	this.server_available = (window.location.host == 'htpc');

	this.dom_gallery = $('#gallery');
	this.admin_gallery = $('#adminimages');
	this.slides = $('#carousel .current').first();
	this.dom_current_tags = $('#currenttags');
	this.dom_remaining_tags = $('#remainingtags');

	this.slides.parent().parent().scroll($.proxy(this.userSliding,this));

	this.image = $('#image');

	//TODO - cookie to remember?
	//       If this is done, then probably need to store a hash of the database
	//       Most likely the database will have to expose the image ids, not just indexes
	this.admin_mode = false;
	this.admin_page = 0;


	$('#selectnone').click( $.proxy(this.selectNone,this));
	$('#selectall').click( $.proxy(this.selectAll,this));
	$('#selectpage').click($.proxy(this.selectPage,this));
	$('#apply').click(     $.proxy(this.applyTags,this));
	$('#delete').click(    $.proxy(this.delete,this));

	$('#firstpage').click($.proxy(this.adminPage,this,'first'));
	$('#prevpage').click( $.proxy(this.adminPage,this,'prev' ));
	$('#nextpage').click( $.proxy(this.adminPage,this,'next' ));
	$('#lastpage').click( $.proxy(this.adminPage,this,'last' ));

	this.tagged = {};
	
};

$.MyGallery.MonthNames = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ]; 

$.MyGallery.init = function(){

	gallery = new $.MyGallery();

	//TODO - attach window.resize to this
	gallery.size();

	$.getJSON('database.json').done(gallery.processdata).fail(gallery.loadfailed);
};

$.MyGallery.prototype = {

	dom_gallery: null,
	dom_current_tags: null,
	dom_remaining_tags: null,

	//State
	currenttags:{},

	thumbs:[],
	thumbwidth:0,

	//Data loaded by JSON
	//Indexed by year, month (numerical), day of month
	images: {},
	tags: {},

	processdata: function(data){

		gallery.images = data.images;

		//Cast to ints
		for (var i in data.tags){

			gallery.tags[i] = [];

			var l = data.tags[i].length;
			for (var x = 0; x < l; x++){
				gallery.tags[i].push(parseInt(data.tags[i][x],10));
			}
		}


		gallery.currenttags = [];

		gallery.allTags();


	}
	,size: function() {

		var main_height = document.body.clientHeight - this.dom_current_tags.outerHeight();

		//TODO - need to build an inner block to handle the admin tools
		$('#admingallery').css('height',main_height + 'px');

	}
	,loadfailed: function(obj,error){
		alert('Failed to load ../database.json : ' + error);
	}
	,addCurrentTag: function(event){
		this.currenttags.push(event.data);
		this.buildGallery();
	}
	,removeCurrentTag: function(event){
		var tags = [];

		for (var i = 0; i < this.currenttags.length; i++){
			if (this.currenttags[i] != event.data){
				tags.push(this.currenttags[i]);
			}
		}

		this.currenttags = tags;
		this.buildGallery();
	}
	,toggleAdmin: function() {

		this.admin_mode = ! this.admin_mode;

		this.admin_page = 0;

		//TODO - if this.tagged is not empty, then confirm as changes will be lost

		this.dom_gallery.css('display',this.admin_mode ? 'none' : 'block');
		$('#admingallery').css('display',this.admin_mode ? 'block' : 'none');

		this.buildGallery();

	}
	,allTags: function(){

		this.clearImages();

		this.dom_current_tags.empty();
		this.dom_remaining_tags.empty();

		this.addAdminButton();

		var taglist = [];

		for (var i in this.tags){

			var tag_and_label = this.tagAndLabel(i);

			//Don't show the month or days to start with
			if (tag_and_label[1] !== 'm' && tag_and_label[1] !== 'd'){
				taglist.push([i,tag_and_label]);
			}
		}

		this.addTagsToDom(this.dom_remaining_tags,taglist,this.addCurrentTag);

		if (this.admin_mode) {
			//TODO - show all images
		} else {
			//TODO - Show a single image for each tag, eg one image per tag
		}

	}
	,addTagsToDom: function(node,taglist,callback) {

		taglist.sort(function(a,b) {

			if (a[1][1] && ! b[1][1]) {
				//a is a "year", "month" or "day" marker
				return -1;
			} else if (b[1][1] && ! a[1][1]) {
				//b is a "year", "month" or "day" marker
				return 1;
			} else if (a[1][1] && b[1][1]) {
				//both is a "year", "month" or "day" marker
				return a[1][2] < b[1][2] ? -1 : 1;
			}

			return a[1][0].toLowerCase() < b[1][0].toLowerCase() ? -1 : 1;
		});

		for (var i = 0; i < taglist.length; i++) {

			var tag   = taglist[i][0];
			var label = taglist[i][1][0]; 

			if (label === undefined){
				label = tag;
			}

			var nt = $('<span />').append(label).attr('class','tag');
			nt.click(tag,$.proxy(callback,this));

			if (taglist[i][1][1]) {
				//Special tag, eg m for month

				nt.addClass(taglist[i][1][1]);
			}

			node.append(nt);
		}



	}
	,addAdminButton: function() {

		if (this.server_available) {

			var admin_button = $('<span />').append(this.admin_mode ? '[normal]' : '[admin]').attr('class','tag');
			admin_button.click($.proxy(this.toggleAdmin,this));

			admin_button.addClass(this.admin_mode ? 'normal' : 'admin');

			this.dom_remaining_tags.append(admin_button);
			
		}

	}
	,buildGallery: function(){

		//TODO - Show the tags that the final set also contain but have not been restricted to
		//     - If a tag contains a '|' character eg "A|B" it means "A or B", ??? Has this been done?
		//     - Tags are case insensitive

		var tags = this.currenttags;
		var l = tags.length;

		if (l == 0){
			this.allTags();
			return;
		}


		this.dom_current_tags.empty();
		this.dom_current_tags.append('<span>Current tags: </span>');

		this.dom_remaining_tags.empty();

		this.addAdminButton();

		var year_selected  = false;
		var month_selected = false;

		var images;

		var taglist = [];
		for (var i = 0; i < l; i++){

			var tag_and_label = this.tagAndLabel(tags[i]);

			taglist.push([tags[i],tag_and_label]);

			if (tag_and_label[1] == 'y'){
				year_selected = true;
			}else if(tag_and_label[1] == 'm'){
				month_selected = true;
			}

			if (i == 0){
				images = this.tags[tags[0]];
			}else{
				images = images.filter(function(val){

					if (this.indexOf(val) !== -1){
						return true;
					}

					return false;
					
				},this.tags[tags[i]]);
			}
		}

		this.addTagsToDom(this.dom_current_tags,taglist,this.removeCurrentTag);

		this.clearImages();

		var possible_tags = {};

		for (var x in this.tags){

			var found = false;

			for (var y = 0; y < tags.length; y++){
				if (x === tags[y]){
					found = true;
					break;
				}
			}

			if (! found){
				possible_tags[x] = 0;
			}
		}

		var remaining_tags = {};

		//TODO - Handle blank images
	
		var max = 10000;
		var displayed;

		for (var i = 0; i < images.length; i++){
			if (i < max) {
				this.addImage(images[i]);
				displayed = i;
			}

			for (var x in possible_tags){
				if (this.tags[x].indexOf(images[i]) !== -1){
					remaining_tags[x] = true;
				}
			}
		}

		this.slides.parent().css('width',this.thumbwidth + 'px');
		this.slides.css('left','0px');

		this.setCurrentSlide();

		var remain_added = false;

		taglist = [];

		for (var tag in remaining_tags){
			if (! remain_added){
				this.dom_remaining_tags.append($('<span>Remaining tags: </span>').attr('class','heading'));
				remain_added = true;
			}

			var tag_and_label = this.tagAndLabel(tag);

			var label = tag_and_label[0];
			var data_type = tag_and_label[1];
			var data = tag_and_label[2];

			if (data_type){
				//don't show months if a year not selected, don't show days if a month is not selected
				switch (data_type){
					case 'm':
						if (! year_selected){
							continue;
						}
						break;
					case 'd':
						if (! month_selected){
							continue;
						}
						break;
				}
			}

			taglist.push([tag,tag_and_label]);
		}

		this.addTagsToDom(this.dom_remaining_tags,taglist,this.addCurrentTag);

		var max_dots = 15;
		var dots_each = 1;

		if (displayed > max_dots) {
			dots_each = Math.floor(displayed / max_dots);
		}

	}
	,tagAndLabel: function(tag){
		var m = tag.match(/^(m|d|y)(.*)$/);

		//Three element array
		//
		// first is the label for the tag
		// Second is the "type" of tag eg y for year, m for month
		// Third is the numeric sort

		if (! m){
			return [tag,undefined,undefined];
		}

		var label = parseInt(m[2],10);
		var data = label;

		switch (m[1]){
			case 'm':
				label = $.MyGallery.MonthNames[data-1];
				break;
		}

		return [label,m[1],data];

	}
	,clearImages: function(){
		//this.dom_gallery.empty();
		this.slides.empty();
		this.image.empty();
		this.thumbs = [];
		this.thumbwidth = 0;
		this.slides.parent().parent().scrollLeft(0);

	}
	,addImage:function(image_index){

		//Images are stored by index as an array. First element is the src, second
		//element is the ratio of the height compared to the width;

		//Height is the definer
		var height = 150;

		var ratio = this.images[image_index][1];
		var width = ratio * height;

		var src = this.images[image_index][0];

		var parts = src.match(/\/(\d{4}\/\d{2}\/\d{2}\/)(.*)?/);

		//Images of the form foo.jpg, not yyy-mm-dd etc
		if (! parts) {
			return;
		}

		this.thumbs.push({
			dir:parts[1],
			image:parts[2],
			left:this.thumbwidth,
			width:width,
			height:height,
			index:image_index
		});

		this.thumbwidth += width;
		
	}
	,setCurrentSlide:function() {

		var startindex = 0;
		var num_to_show = 100;

		if (this.admin_mode) { 

			var num_pages = Math.ceil(this.thumbs.length / num_to_show);

			//The code that advances the pages doesn't know the number of pages so enforce here
			if (this.admin_page == 'last' || this.admin_page >= num_pages) {
				this.admin_page = num_pages-1;
			}

			startindex = this.admin_page * num_to_show;

		} else {
			var left = this.slides.parent().parent().scrollLeft();
			left = Math.floor(left);

			if (this.thumbs.length == 0) {
				this.slides.empty();
				return;
			}

			this.slides.empty();


			//TODO - admin_mode - not reliant on left position, but a specific index
			if (left > 0) {
				var search = Math.floor(left / 200);

				if (search > 0 ){
					if (search >= this.thumbs.length) {
						//Way too far to the right
						search = this.thumbs.length;
						while (--search > 0) {
							possible = this.thumbs[search];
							possible_right = possible.left + possible.width;

							if (possible.left <= left && possible_right > left) {
								startindex = search;
								break;
							}
						}
					} else {
						var possible = this.thumbs[search];

						var possible_right = possible.left + possible.width;

						if (possible.left <= left && possible_right > left) {
							startindex = search;
						} else {

							if (possible_right > left) {
								//we are to the right of where we want to be, go backwards
								while (--search > 0) {
									possible = this.thumbs[search];
									possible_right = possible.left + possible.width;

									if (possible.left <= left && possible_right > left) {
										startindex = search;
										break;
									}
								}
								
							} else {
								while (++search <= this.thumbs.length) {
									possible = this.thumbs[search];
									possible_right = possible.left + possible.width;

									if (possible.left <= left && possible_right > left) {
										startindex = search;
										break;
									}
								}
							}
						}
					}
				}
			}
		}

		if (this.admin_mode) {
			this.admin_gallery.empty();
		}

		for (var i = 0; i < num_to_show; i++) {

			var ix = i+startindex;

			if (ix >= this.thumbs.length) {
				break;
			}

			var image = this.thumbs[ix];

			if (this.admin_mode) {

				var img = $('<img />')
				.attr({
					'src':'pictures/' + image.dir + '.thumb/' + image.image,
					'width':image.width,
					'height':image.height,
					'thumbindex':ix
				})
				.click($.proxy(this.tagImage,this,ix,image.index))

				if (this.tagged[image.index]) {
					img.addClass('tagged');
				}

				this.admin_gallery.append(img);

			} else {

				this.slides.append(
				$('<img />')
				.attr({
					'src':'pictures/' + image.dir + '.thumb/' + image.image,
					'width':image.width,
					'height':image.height
				})
				.click(
					{index:image.index},
					$.proxy(this.fullImage,this)
				)
				);
			}

		}

		this.slides.css('left',this.thumbs[startindex].left + 'px');

	}
	,userSliding: function() {

		if (this._slideTimeout) {
			clearTimeout(this._slideTimeout);
			this._slideTimeout = null;
		}

		this._slideTimeout = setTimeout($.proxy(this.setCurrentSlide,this),50);
		
	}
	,fullImage: function(event){
		//TODO - screen resize, need to resize the image
		//     - if the ability to hide the "Remaining tags" is added
		//       then it also needs to resize the full image

		var index = event.data.index;

		var src   = this.images[index][0];
		var ratio = this.images[index][1];

		var boxheight = this.image.height() - this.slides.parent().parent().height() - 30;
		var boxwidth = this.image.width();

		var width,height;

		var height_from_maxwidth = (1/ratio) * boxwidth;
		var width_from_maxheight = (ratio * boxheight);

		if (width_from_maxheight <= boxwidth) {
			//max will be the height
			height = boxheight;
			width = ratio * height;
		}else{
			width = boxwidth;
			height = height_from_maxwidth;
		}

		var img = $('<img />').attr({
			'src':'pictures/' + src
		}).css({
			'width':width + 'px',
			'height':height + 'px',
		});
		
		this.image.empty();
		this.image.append(img);

		img.click(
			{img:img.get(0)},
			$.proxy(this.exifData,this)
		);
	}
	,exifData: function(event) {

		var img = event.data.img;

		//TODO - move the div creation into here and populate with the loading
		
		if (img.exifdata) {
			this.showExifData(img);
		} else {
			//TODO - show a loading message
			EXIF.getData(img,$.proxy(this.showExifData,this,img));
		}

	}
	,showExifData: function(img) {

		var div = $('<div />').attr('id','exifdata');

		var table = $('<table />');
		table.append(
			$('<thead />').append(
				$('<tr />').append(
					$('<th />').text('Name'),
					$('<th />').text('Value')
				)
			)
		);

		div.append(table);

		var tbody = $('<tbody />');
		table.append(tbody);

		for (var i in img.exifdata) {

			switch (i) {
				case 'MakerNote':
				case 'UserComment':
					continue;
			}

			var val = img.exifdata[i];

			if (val instanceof Number) {

				if (val.numerator && val.denominator != 1) {

					val = val.numerator + '/' + val.denominator;

				}

			}

			tbody.append(
				$('<tr />').append(
					$('<td />').text(i),
					$('<td />').text(val)
				)
			);

		}

		$('body').append(div);

		div.click(function(){this.remove()});
		
	}

	,tagImage:function(thumb_index,real_index) {

		var image = this.admin_gallery.find('[thumbindex="' + thumb_index + '"]');

		if (this.tagged[real_index]) {
			delete this.tagged[real_index];
			image.removeClass('tagged');
		} else {
			this.tagged[real_index] = true;
			image.addClass('tagged');
		}

		console.dir(this.tagged);

		
	}

	//Admin functions
	,adminPage: function(data) {
		switch(data) {
			case 'first':
				this.admin_page = 0;
				break;
			case 'prev':
				this.admin_page = Math.max(0,this.admin_page - 1);
				break;
			case 'next':
				this.admin_page++;
				break;
			case 'last':
				//This will be set to the last page in buildGallery
				this.admin_page = 'last';
				break;
		}

		this.setCurrentSlide();
	}

	,selectNone: function() {

		var num_sel = Object.keys(this.tagged).length;

		if (num_sel) {

			if (confirm('Are you sure you want to clear your selection? You have ' + num_sel + ' currently selected.')) {
				this.tagged = {};
				this.admin_gallery.find('img').removeClass('tagged');
			}

		}
	}

	,selectAll: function() {
		var set = this.admin_gallery.find('img');
		set.addClass('tagged');

		for (var i = 0; i < this.thumbs.length; i++) {
			this.tagged[this.thumbs[i].index] = true;
		}
	}

	,selectPage: function() {
		//TODO - if every item on the page is selected, unselect
		var set = this.admin_gallery.find('img');
		set.each($.proxy(function(index,element){
			this.tagged[this.thumbs[parseInt(element.getAttribute('thumbindex'),10)].index] = true;
		},this));

		set.addClass('tagged');
	}

	,applyTags: function() {
		console.log('apply');
	}

	,delete: function() {
		console.log('delete');
	}
	
};

