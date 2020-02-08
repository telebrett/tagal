import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserComponent } from './browser/browser.component';
import { HeaderComponent } from './header/header.component';

import {HttpClientModule} from '@angular/common/http';

@NgModule({
  declarations: [
    AppComponent,
    BrowserComponent,
    HeaderComponent
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
