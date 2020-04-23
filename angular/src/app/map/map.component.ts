import { Component, OnInit, ElementRef, ViewChild, Input, OnChanges } from '@angular/core';
import { loadModules } from 'esri-loader';

import { ImagesService } from '../service/images.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss']
})
export class MapComponent implements OnInit, OnChanges {

	@ViewChild('map', { static:true}) private readonly mapElement: ElementRef;

	@Input() points: any[];

	private map;
	private mapView;

  constructor(private images: ImagesService) {
	}

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

	ngOnChanges(): void {
		this.showPoints();
	}

	private showPoints() {

		if (! this.points) {
			return;
		}
		
		loadModules(
			[
				'esri/Graphic',
				'esri/layers/FeatureLayer'
			]
		).then(([Graphic, FeatureLayer]) => {

			this.map.layers.removeAll();

			let graphics = this.points.map((point, index) => {
				return new Graphic({
					attributes: {
						ObjectId: index,
					},
					geometry: {
						type: 'point',
						longitude: point.x,
						latitude: point.y
					}
				});
			});

			let popupTemplate = (feature) => {
				console.log(feature.graphic.attributes.ObjectId);

				let point = this.points[feature.graphic.attributes.ObjectId];

				let thumbs = this.images.getThumbnails(100, 100, Object.keys(point.i).slice(0, 6));

				let div = document.createElement('div');

				//TODO - Click to view
				for (let thumb of thumbs) {
					let img = document.createElement('img');
					img.src    = thumb.src;
					img.width  = thumb.width;
					img.height = thumb.height;

					img.style.border = '1px solid black';
					img.style.margin = '1px';

					div.appendChild(img);
				}

				//TODO - Add an indicator with the number of images at this point
				//     - Add a link to view the images, this will add a "tag" which is the Lat/Lng into the "selected tags"
				//       If the user clicks on a link, then show vertical thumbnails, if they click on an image, then
				//       show the image in fullscreen with the horizontal thumbnails
				//       

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
