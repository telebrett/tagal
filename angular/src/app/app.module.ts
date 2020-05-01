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

@NgModule({
  declarations: [
    AppComponent,
    BrowserComponent,
    HeaderComponent,
    MapComponent,
    CarouselComponent,
    VarouselComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
		HttpClientModule,
		FileSaverModule,
		NgbModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
