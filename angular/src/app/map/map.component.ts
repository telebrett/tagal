import { Component, OnInit, ElementRef, ViewChild, Input, OnChanges } from '@angular/core';
import { loadModules } from 'esri-loader';

import { ImagesService } from '../service/images.service';

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

			const mapViewProperties = {
				container: this.mapElement.nativeElement,
				zoom: 3,
				map: this.map
			};

			this.mapView = new MapView(mapViewProperties);

			if (this.points && this.points.length) {
				this.showPoints();
			}

		});
	}

  ngOnInit(): void {
  }

	ngOnChanges(): void {

		if (! this.points) {
			return;
		}

		this.showPoints();

	}

	private showPoints() {
		
		this.map.layers.removeAll();

		loadModules(
			[
				'esri/Graphic',
				'esri/layers/FeatureLayer'
			]
		).then(([Graphic, FeatureLayer]) => {
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
							width: 2
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

		/*
		let symbol = {
			type: 'simple-marker',
			color: [226, 119, 40],
			outline: {
				color: [255, 255, 255],
				width: 1
			}
		}

		this.layer.removeAll();

		for (let point of this.points) {

			this.layer.add(
				new this.g({
					geometry: {
						type: 'point',
						longitude: point.x,
						latitude: point.y
					},
					symbol: symbol
				})
			);

		}
	 */

	}

}
