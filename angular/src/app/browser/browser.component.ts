import { Component, OnInit } from '@angular/core';

import { ImagesService } from '../service/images.service';

@Component({
  selector: 'app-browser',
  templateUrl: './browser.component.html',
  styleUrls: ['./browser.component.scss']
})
export class BrowserComponent implements OnInit {

  constructor(private images: ImagesService) { }

  ngOnInit() {
	  console.dir(this.images.loadImages());
  }

}
