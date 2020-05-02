import { Component, OnInit, ElementRef, ViewChild, Output, EventEmitter } from '@angular/core';
import { loadModules } from 'esri-loader';

import { ImagesService } from '../service/images.service';
import { environment } from '../../environments/environment';

//TODO - Need to remember zoom and center point
@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss']
})
export class MapComponent implements OnInit {

	@ViewChild('map', { static:true}) private readonly mapElement: ElementRef;

	@Output() selectedThumb: EventEmitter<any> = new EventEmitter();
	@Output() selectedPoint: EventEmitter<any> = new EventEmitter();

	private map;
	private mapView;
	private points = [];

  constructor(private images: ImagesService) { }

  ngOnInit(): void {
		loadModules(
			[
			'esri/Map',
			'esri/views/MapView',
		]
		).then(([Map, MapView] : [__esri.MapConstructor, __esri.MapViewConstructor]) => {

			const mapProperties = {
				basemap: 'topo'
			};

			this.map = new Map(mapProperties);

			let mapViewProperties:any = {
				container: this.mapElement.nativeElement,
				zoom: environment.map && environment.map.zoom ? environment.map.zoom : 3,
				map: this.map
			};

			if (environment.map && environment.map.lat && environment.map.lng) {
				mapViewProperties.center = [
					environment.map.lng,
					environment.map.lat
				];
			}

			this.mapView = new MapView(mapViewProperties);

			this.showPoints();

		});
  }

	public reset() {
		this.showPoints();
	}

	private showPoints() {

		loadModules(
			[
				'esri/Graphic',
				'esri/layers/FeatureLayer'
			]
		).then(([Graphic, FeatureLayer]) => {

			this.map.layers.removeAll();

			this.points = this.images.getPoints();

			if (this.points.length == 0) {
				return;
			}

			//TODO - if the number of points is greater than X show a message re more tags required

			let graphics = this.points.map((point, index) => {

				return new Graphic({
					attributes: {
						ObjectId: index,
					},
					geometry: {
						type: 'point',
						longitude: point.m.x,
						latitude: point.m.y
					}
				});
			});

			let popupTemplate = (feature) => {

				let point = this.points[feature.graphic.attributes.ObjectId];

				let thumbs = this.images.getThumbnails(100, 100, Object.keys(point.i).slice(0, 6));

				let div = document.createElement('div');

				for (let thumb of thumbs) {
					let img = document.createElement('img');
					img.src    = thumb.src;
					img.width  = thumb.width;
					img.height = thumb.height;

					img.style.border = '1px solid black';
					img.style.margin = '1px';

					//TODO - I think this causes a memory leak, but I'm unsure how to get an "ondestroy" method for the popuptemplate
					//img.addEventListener('click', this.selectedThumb.emit(thumb));
					img.addEventListener('click', (event) => {
						this.selectedThumb.emit({tag: this.images.getTagIndex(point), imageIndex:thumb.index})
					});

					div.appendChild(img);

				}

				let p = document.createElement('p');
				p.style.marginTop = '5px';
				p.style.cursor = 'pointer';
				p.appendChild(document.createElement('a'));
				p.firstChild.appendChild(document.createTextNode('View all images (' + Object.keys(point.i).length + ')'));
				
				//TODO - Same as above re potential memory leak
				p.firstChild.addEventListener('click', (event) => {
					this.selectedPoint.emit({tag: this.images.getTagIndex(point)});
				});
				div.appendChild(p);

				return div;
			};

			let featureLayer = new FeatureLayer({
				source: graphics,
				renderer: {
					type: "simple",
					symbol: {
						type: "simple-marker",
						color: "#102A44",
						outline: {
							color: "#598DD8",
							width: 1 
						}
					}
				},
				popupTemplate: {
					title: "Photos",
					content: popupTemplate,
				},
				geometryType: 'point',
				objectIdField: "ObjectId",
				fields: [
					{
						name: "ObjectId",
						alias: "ObjectId",
						type: 'oid'
					}
				]
			});

			this.map.layers.add(featureLayer);

		});

	}

}
