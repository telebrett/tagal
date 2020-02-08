import { Component, OnInit } from '@angular/core';

import { ImagesService } from '../service/images.service';

@Component({
	selector: 'app-browser',
	templateUrl: './browser.component.html',
	styleUrls: ['./browser.component.scss']
})
export class BrowserComponent implements OnInit {

	public menuTags = [];

	constructor(private images: ImagesService) { }

	ngOnInit() {
		this.images.loadImages().subscribe(() => {
		 	this.menuTags = this.images.getRemainingTags();
			console.dir(this.menuTags);
		});
		
	}

}
