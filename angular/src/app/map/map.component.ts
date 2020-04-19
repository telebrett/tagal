import { Component, OnInit, ElementRef, ViewChild, Input } from '@angular/core';
import { loadModules } from 'esri-loader';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss']
})
export class MapComponent implements OnInit, onChanges {

	@ViewChild('map', { static:true}) private readonly mapElement: ElementRef;

	@Input points;

	private map;
	private layer;

	private g;

  constructor() {
		loadModules(
			[
			'esri/Map',
			'esri/views/MapView',
			'esri/Graphic',
			'esri/layers/GraphicsLayer'
		]
		).then(([Map, MapView, Graphic, GraphicsLayer] : [__esri.MapConstructor, __esri.MapViewConstructor]) => {

			const mapProperties = {
				basemap: 'topo'
			};

			const map = new Map(mapProperties);

			const mapViewProperties = {
				container: this.mapElement.nativeElement,
				zoom: 3,
				map
			};

			this.map = new MapView(mapViewProperties);

			this.layer = new GraphicsLayer();

			map.add(this.layer);

			//TODO - This doesn't seem like the best way to pass the constructor around
			this.g = Graphic;

		});
 
	}

  ngOnInit(): void {
  }

	ngOnChanges(): void {

		if (! this.points) {
			return;
		}

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

	}

}
