import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { FileSaverModule } from 'ngx-filesaver';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserComponent } from './browser/browser.component';
import { HeaderComponent } from './header/header.component';

import {HttpClientModule} from '@angular/common/http';
import { MapComponent } from './map/map.component';
import { CarouselComponent } from './carousel/carousel.component';
import { VarouselComponent } from './varousel/varousel.component';

import { DeCamelCase } from './tools/decamelcase-pipe';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FontAwesomeModule, FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faSquare, faCheckSquare as farCheckSquare } from '@fortawesome/free-regular-svg-icons';
import { faTags,faCheckSquare, faUndo, faInfo, faDownload, faLongArrowAltLeft, faLongArrowAltRight } from '@fortawesome/free-solid-svg-icons';

@NgModule({
  declarations: [
    AppComponent,
    BrowserComponent,
    HeaderComponent,
    MapComponent,
    CarouselComponent,
    VarouselComponent,
    DeCamelCase
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    FileSaverModule,
    NgbModule,
		ReactiveFormsModule,
		FormsModule,
		FontAwesomeModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { 

	constructor(private library: FaIconLibrary) {
		library.addIcons(faTags);
		library.addIcons(faSquare);
		library.addIcons(faCheckSquare);
		library.addIcons(farCheckSquare);
		library.addIcons(faUndo);
		library.addIcons(faInfo);
		library.addIcons(faDownload);
		library.addIcons(faLongArrowAltLeft);
		library.addIcons(faLongArrowAltRight);
	}

}
