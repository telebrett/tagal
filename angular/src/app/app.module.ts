import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserComponent } from './browser/browser.component';
import { HeaderComponent } from './header/header.component';

import {HttpClientModule} from '@angular/common/http';
import { MapComponent } from './map/map.component';
import { CarouselComponent } from './carousel/carousel.component';
import { VcarouselComponent } from './vcarousel/vcarousel.component';

@NgModule({
  declarations: [
    AppComponent,
    BrowserComponent,
    HeaderComponent,
    MapComponent,
    CarouselComponent,
    VcarouselComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
	HttpClientModule,
	NgbModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
