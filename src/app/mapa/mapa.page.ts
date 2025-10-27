import { Component, NgZone, OnDestroy } from '@angular/core';
import { AlertController, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, IonButtons, IonFab, IonFabButton, IonLoading, IonSpinner, NavController, ToastController, IonMenu, IonMenuButton, IonList, IonItem, IonLabel, IonButton } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { App } from '@capacitor/app';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  addOutline,
  downloadOutline,
  globeOutline,
  imageOutline,
  layersOutline,
  locate,
  locationOutline,
  mapOutline,
  removeOutline,
  stopCircleOutline,
  trashOutline,
  walkOutline,
  checkmarkCircleOutline,
  createOutline,
  shapesOutline,
  add,
  analyticsOutline,
  listOutline,
  wifiOutline,
  ellipseOutline,
  cellularOutline,
  personAddOutline
} from 'ionicons/icons';
import { exitOutline } from 'ionicons/icons';
import { Geolocation } from '@capacitor/geolocation';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { RouterLink } from '@angular/router';
import { GeoSearchControl, OpenStreetMapProvider } from 'leaflet-geosearch';
import { Network } from '@capacitor/network';
import { RegisterDataService } from 'src/app/services/register-data.service';


// Declara L como una variable global para que TypeScript no se queje.
// Leaflet y Leaflet-draw se cargan globalmente a través de angular.json
declare var L: any;

const iconRetinaUrl = 'assets/images/marker-icon-2x.png';
const iconUrl = 'assets/images/marker-icon.png';
const shadowUrl = 'assets/images/marker-shadow.png';
const iconDefault = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

const iconYellow = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

@Component({
  selector: 'app-mapa',
  templateUrl: './mapa.page.html',
  styleUrls: ['./mapa.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonIcon,
    IonButtons,
    IonFab,
    IonFabButton,
    IonLoading,
    IonSpinner,
    HttpClientModule,
    IonMenu,
    IonMenuButton,
    IonList,
    IonItem,
    IonLabel,
    RouterLink,
    IonButton
  ]
})

export class MapaPage implements OnDestroy {

  private map: any | null = null;
  private userCircle: any | null = null;
  private pulseCircle: any | null = null;
  private pulseInterval: any = null;
  private peruLayer: any | null = null;
  private drawnItems: any | null = null; // FeatureGroup para elementos dibujados
  private locationWatchId: string | null = null;
  private satelliteLayer: any | null = null;
  private lightLayer: any | null = null;
  private vertexMarkers: any | null = null;
  private walkingPolyline: any | null = null;
  private crosshairMarker: any | null = null;
  private watchId: string | null = null;
  private fixedPathDistance = 0;
  private polygonVertices: any[] = [];

  public isLoading = false;
  public gpsData: any = {
    lat: null,
    lng: null,
    alt: null,
    vel: null,
    accH: null,
    accV: null,
  };

  public activeLayer: 'satellite' | 'streets' = 'satellite';
  public isDrawingPolygon = false;
  public isEditingMode = false;
  public showInitialSpinner = true;
  public isDrawingLine = false;
  public isOnline = true;
  public networkStatusChanged = false;

  constructor(
    private http: HttpClient,
    private alertController: AlertController,
    private navCtrl: NavController,
    private toastController: ToastController,
    private zone: NgZone,
    private registerDataService: RegisterDataService
  ) {
    addIcons({personAddOutline,listOutline,downloadOutline,createOutline,globeOutline,trashOutline,mapOutline,cellularOutline,imageOutline,layersOutline,addOutline,removeOutline,locate,addCircleOutline,locationOutline,ellipseOutline,walkOutline,stopCircleOutline,checkmarkCircleOutline,shapesOutline,add,analyticsOutline,wifiOutline,exitOutline});
  }

  ionViewDidEnter() {
    this.initializeNetworkListener();
    // Muestra un spinner inicial durante 5 segundos por estética
    setTimeout(() => {
      this.showInitialSpinner = false;
    }, 5000);

    if (!this.map) {
      // Usamos un timeout para asegurarnos de que el DOM de Ionic esté 100% listo.
      // Aumentamos ligeramente el tiempo para dar margen al renderizado del FAB
      setTimeout(() => this.initMap(), 400);
    } else {
      setTimeout(() => {
        this.map?.invalidateSize();
        // Al volver a la página, limpiamos los polígonos existentes y recargamos los guardados
        // para reflejar cualquier cambio (ej. un nuevo polígono guardado).
        if (this.drawnItems) {
          this.drawnItems.clearLayers();
        }
        this.loadSavedGeometries();
      }, 200);
    }
  }

  ngOnDestroy() {
    Network.removeAllListeners();
    if (this.locationWatchId) {
      Geolocation.clearWatch({ id: this.locationWatchId });
    }
    if (this.watchId) {
      Geolocation.clearWatch({ id: this.watchId });
    }
    if (this.map) {
      // Limpiamos el intervalo para evitar fugas de memoria
      if (this.pulseInterval) {
        clearInterval(this.pulseInterval);
      }
      this.map.off();
      this.map.remove();
      this.map = null;
    }
  }

  private async initializeNetworkListener() {
    const initialStatus = await Network.getStatus();
    this.zone.run(() => {
      this.isOnline = initialStatus.connected;
    });

    Network.addListener('networkStatusChange', status => {
      this.zone.run(() => {
        // Solo animar si el estado realmente cambia
        if (this.isOnline !== status.connected) {
          this.isOnline = status.connected;
          this.networkStatusChanged = true;
          // La duración debe ser un poco mayor que la animación en el SCSS (700ms)
          setTimeout(() => this.networkStatusChanged = false, 1000);
        }
      });
    });
  }

  clearLocation() {
    if (this.pulseInterval) {
      clearInterval(this.pulseInterval);
      this.pulseInterval = null;
    }
    if (this.userCircle) {
      this.userCircle.remove();
      this.userCircle = null;
    }
    if (this.pulseCircle) {
      this.pulseCircle.remove();
      this.pulseCircle = null;
    }
  }

  zoomIn() {
    // Limita el zoom-in para que no supere el nivel 10.
    if (this.map && this.map.getZoom() < 10) {
      this.map.zoomIn();
    }
  }

  zoomOut() {
    if (this.map) {
      this.map.zoomOut();
    }
  }

  switchLayer(layerName: 'satellite' | 'streets') {
    if (!this.map || !this.satelliteLayer || !this.lightLayer) return;

    if (layerName === 'satellite') {
      if (this.map.hasLayer(this.lightLayer)) {
        this.map.removeLayer(this.lightLayer);
      }
      if (!this.map.hasLayer(this.satelliteLayer)) {
        this.map.addLayer(this.satelliteLayer);
      }
    } else { // streets
      if (this.map.hasLayer(this.satelliteLayer)) {
        this.map.removeLayer(this.satelliteLayer);
      }
      if (!this.map.hasLayer(this.lightLayer)) {
        this.map.addLayer(this.lightLayer);
      }
    }
    this.activeLayer = layerName;
  }

  /**
   * Ajusta el zoom del mapa para mostrar la extensión completa de Perú.
   */
  zoomToPeru() {
    if (this.map && this.peruLayer) {
      this.map.fitBounds(this.peruLayer.getBounds());
    }
  }

  async startDownloadProcess() {
    const alert = await this.alertController.create({
      header: 'Advertencia Importante',
      message: 'La descarga de mapas de proveedores como Google viola sus Términos de Servicio. Esta función es solo una demostración técnica y no debe usarse con fuentes de mapas protegidas. ¿Deseas continuar con una fuente de ejemplo (OpenStreetMap)?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Continuar',
          handler: () => {
            this.downloadTiles();
          }
        }
      ]
    });
    await alert.present();
  }

  async downloadTiles() {
    if (!this.map) return;

    const bounds = this.map.getBounds();
    const minZoom = this.map.getZoom();
    const maxZoom = minZoom + 2; // Descargar 2 niveles de zoom

    const confirmation = await this.alertController.create({
        header: 'Confirmar Descarga',
        message: `Se iniciará la descarga del área visible para los niveles de zoom ${minZoom} a ${maxZoom}. Esto puede tardar y consumir datos.`,
        buttons: [
            { text: 'Cancelar', role: 'cancel' },
            { text: 'Aceptar', handler: async () => {
                this.isLoading = true;
                for (let z = minZoom; z <= maxZoom; z++) {
                  const tiles = this.getTilesInBounds(bounds, z);
                  console.log(`Zoom ${z}: ${tiles.length} teselas a descargar.`);

                  for (const tile of tiles) {
                    // URL de la tesela (¡NO USAR CON GOOGLE!)
                    const tileUrl = `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;

                    // Ruta local para guardar
                    const localPath = `offline-tiles/${tile.z}/${tile.x}/${tile.y}.png`;

                    try {
                      // Aquí iría la lógica real de descarga y guardado con Capacitor Filesystem
                      // Por ahora, solo simulamos para no violar términos de servicio.
                      console.log(`Simulando descarga y guardado: ${localPath}`);
                      await new Promise(resolve => setTimeout(resolve, 10)); // Pequeña pausa

                    } catch (error) {
                      console.error(`Error descargando ${tileUrl}`, error);
                    }
                  }
                }
                this.isLoading = false;
                const finalAlert = await this.alertController.create({ header: 'Éxito', message: 'Descarga (simulada) completada.', buttons: ['OK'] });
                await finalAlert.present();
            }}
        ]
    });
    await confirmation.present();
  }

  // Función para calcular las teselas dentro de un área
  getTilesInBounds(bounds: any, zoom: number) {
    const tiles = [];
    const northEast = bounds.getNorthEast();
    const southWest = bounds.getSouthWest();

    const lat2tile = (lat: number, zoom: number) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    const lon2tile = (lon: number, zoom: number) => Math.floor((lon + 180) / 360 * Math.pow(2, zoom));

    const startX = lon2tile(southWest.lng, zoom);
    const startY = lat2tile(northEast.lat, zoom);
    const endX = lon2tile(northEast.lng, zoom);
    const endY = lat2tile(southWest.lat, zoom);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        tiles.push({ z: zoom, x: x, y: y });
      }
    }
    return tiles;
  }

  toggleDrawingMode() {
    if (this.isDrawingLine) {
      this.presentToast('Finalice el dibujo de la línea primero.', 'warning');
      return;
    }
    this.isDrawingPolygon = !this.isDrawingPolygon;

    if (this.isDrawingPolygon) {
      this.startDrawingByWalking();
    } else {
      this.stopDrawingByWalking();
    }
  }

  toggleLineDrawing() {
    if (this.isDrawingPolygon) {
      this.presentToast('Finalice el dibujo del polígono primero.', 'warning');
      return;
    }
    this.isDrawingLine = !this.isDrawingLine;
    if (this.isDrawingLine) {
      this.startDrawingByWalking(); // Reutilizamos la misma lógica de inicio
    } else {
      this.stopDrawingLine();
    }
  }

  addPolygonPoint() {
    if (!this.crosshairMarker) {
      console.warn('No se puede añadir punto, la ubicación aún no está disponible.');
      return;
    }

    const pointToAdd = this.crosshairMarker.getLatLng();
    let segmentDistance = 0;

    // Calcular y acumular la distancia del nuevo segmento
    if (this.polygonVertices.length > 0) {
      const lastVertex = this.polygonVertices[this.polygonVertices.length - 1];
      segmentDistance = lastVertex.distanceTo(pointToAdd);
      this.fixedPathDistance += segmentDistance;
    }

    // 1. Añadir el vértice a la lista
    this.polygonVertices.push(pointToAdd);

    // 2. Actualizar la polilínea que une los vértices
    this.walkingPolyline?.setLatLngs(this.polygonVertices);

    // 3. Añadir un marcador visual en el vértice con una etiqueta
    const pointNumber = this.polygonVertices.length;
    const tooltipContent = `Punto: ${pointNumber}<br>Dist: ${segmentDistance.toFixed(1)} m`;

    L.circleMarker(pointToAdd, {
        color: '#ff0000',
        radius: 5,
        weight: 2,
        fillOpacity: 0.8
    }).bindTooltip(tooltipContent, {
      permanent: true,
      direction: 'right',
      offset: [10, 0],
      className: 'vertex-tooltip'
    }).addTo(this.vertexMarkers);
  }

  private async startDrawingByWalking() {
    // Si no tenemos una ubicación GPS inicial, no podemos empezar a dibujar.
    if (!this.gpsData.lat) {
      console.error('No se pudo iniciar el modo de dibujo: ubicación GPS no disponible.');
      // Revertimos el estado del botón para que el usuario pueda intentarlo de nuevo.
      this.isDrawingPolygon = false;
      return;
    }

    // 1. Limpiar estado de dibujo anterior
    this.polygonVertices = [];
    this.vertexMarkers.clearLayers();
    this.fixedPathDistance = 0;
    if (this.walkingPolyline) {
      this.map.removeLayer(this.walkingPolyline);
    }

    // 2. Inicializar nueva polilínea para los bordes
    this.walkingPolyline = L.polyline([], { color: '#ff0000', weight: 3 }).addTo(this.map);

    // 3. Opciones para el seguimiento GPS
    const watchOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    };

    this.isLoading = true;
    try {
      // 4. Usar la última posición conocida del GPS como punto de partida.
      // Esto evita la espera y el posible timeout de getCurrentPosition.
      const initialPoint = L.latLng(this.gpsData.lat, this.gpsData.lng);

      // 5. Crear o mover la "mira" (crosshair) a esa posición inicial
      if (!this.crosshairMarker) {
        const crosshairIcon = L.divIcon({
          className: 'crosshair-icon',
          html: '+',
          iconSize: [30, 30]
        });
        this.crosshairMarker = L.marker(initialPoint, { icon: crosshairIcon, interactive: false }).addTo(this.map);
        this.crosshairMarker.bindTooltip('0.0 m', {
          permanent: true,
          direction: 'top',
          offset: L.point(0, -15),
          className: 'distance-tooltip'
        }).openTooltip();
      } else {
        this.crosshairMarker.setLatLng(initialPoint);
      }
      this.map.panTo(initialPoint);

      // 6. Ahora, iniciar el seguimiento continuo para actualizar la posición de la mira
      this.watchId = await Geolocation.watchPosition(watchOptions, (position, err) => {
        if (err || !position) {
          console.error('Error en watchPosition', err);
          this.toggleDrawingMode(); // Detener si hay un error de GPS
          return;
        }

        const newPoint = L.latLng(position.coords.latitude, position.coords.longitude);

        if (this.crosshairMarker) {
          this.crosshairMarker.setLatLng(newPoint);

          // Calcular distancia en tiempo real y actualizar tooltip
          let liveDistance = 0;
          if (this.polygonVertices.length > 0) {
            const lastVertex = this.polygonVertices[this.polygonVertices.length - 1];
            liveDistance = lastVertex.distanceTo(newPoint);
          }
          const totalDistance = this.fixedPathDistance + liveDistance;
          this.crosshairMarker.setTooltipContent(`${totalDistance.toFixed(1)} m`);
        }
        this.map.panTo(newPoint);
      });
    } catch (e) {
      console.error('No se pudo iniciar el modo de dibujo. Verifique los permisos de ubicación.', e);
      // Si falla (ej. permisos denegados), revertir el estado y limpiar
      if (this.isDrawingPolygon) {
        this.toggleDrawingMode();
      }
    } finally {
      this.isLoading = false;
    }
  }

  private stopDrawingByWalking() {
    // 1. Detener seguimiento de ubicación
    if (this.watchId) {
      Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
    }

    // 2. Convertir a polígono si es válido
    if (this.polygonVertices.length > 2) {
      const polygon = L.polygon(this.polygonVertices, { color: '#ff0000', fillColor: '#ff0000', fillOpacity: 0.2, weight: 3 });
      this.drawnItems.addLayer(polygon);

      // Actualizar las coordenadas GPS con la última posición conocida antes de abrir el modal
      if (this.crosshairMarker) {
        const lastKnownPosition = this.crosshairMarker.getLatLng();
        this.gpsData.lat = lastKnownPosition.lat;
        this.gpsData.lng = lastKnownPosition.lng;
      }
      this.navigateToRegisterData(polygon.toGeoJSON());
    } else {
      this.presentToast('Dibujo cancelado: se necesitan al menos 3 puntos.', 'warning');
    }

    // 3. Limpiar elementos temporales del mapa
    if (this.walkingPolyline) {
      this.map.removeLayer(this.walkingPolyline);
      this.walkingPolyline = null;
    }
    if (this.crosshairMarker) {
      this.map.removeLayer(this.crosshairMarker);
      this.crosshairMarker = null;
    }
    this.vertexMarkers.clearLayers();
    this.polygonVertices = []; // Resetear para la próxima vez
  }

  private stopDrawingLine() {
    // 1. Detener seguimiento de ubicación
    if (this.watchId) {
      Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
    }

    // 2. Convertir a línea si es válido (al menos 2 puntos)
    if (this.polygonVertices.length > 1) {
      const line = L.polyline(this.polygonVertices, { color: '#ff0000', weight: 3 });
      this.drawnItems.addLayer(line);

      // Actualizar las coordenadas GPS con la última posición conocida antes de abrir el modal
      if (this.crosshairMarker) {
        const lastKnownPosition = this.crosshairMarker.getLatLng();
        this.gpsData.lat = lastKnownPosition.lat;
        this.gpsData.lng = lastKnownPosition.lng;
      }
      this.navigateToRegisterData(line.toGeoJSON());
    } else {
      this.presentToast('Dibujo cancelado: se necesitan al menos 2 puntos para una línea.', 'warning');
    }

    // 3. Limpiar elementos temporales del mapa
    if (this.walkingPolyline) { this.map.removeLayer(this.walkingPolyline); this.walkingPolyline = null; }
    if (this.crosshairMarker) { this.map.removeLayer(this.crosshairMarker); this.crosshairMarker = null; }
    this.vertexMarkers.clearLayers();
    this.polygonVertices = [];
  }

  async addPointAtCurrentLocation() {
    if (this.isDrawingPolygon || this.isDrawingLine) {
      this.presentToast('Termine de dibujar el polígono antes de añadir un punto.', 'warning');
      return;
    }

    if (!this.gpsData.lat) {
      this.presentToast('Ubicación GPS no disponible. Intente centrar el mapa primero.', 'warning');
      return;
    }

    // Create a GeoJSON Point feature
    const pointGeoJSON = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Point',
        coordinates: [this.gpsData.lng, this.gpsData.lat, this.gpsData.alt] // lon, lat, alt
      }
    };

    console.log('Punto creado, navegando a la página de registro con:', pointGeoJSON);
    this.navigateToRegisterData(pointGeoJSON);
  }

  toggleEditMode() {
    this.isEditingMode = !this.isEditingMode;

    // Recargar los polígonos para aplicar los nuevos listeners de eventos y estilos
    if (this.drawnItems) {
      this.drawnItems.clearLayers();
      this.loadSavedGeometries();
    }

    this.presentToast(
      this.isEditingMode ? 'Modo Edición Activado. Toca un polígono para editarlo.' : 'Modo Edición Desactivado.',
      this.isEditingMode ? 'primary' : 'medium',
      'middle'
    );
  }

  async confirmAndExitApp() {
    // 1. Verificar si hay un dibujo en curso
    if (this.isDrawingPolygon || this.isDrawingLine) {
      const alert = await this.alertController.create({
        header: 'Dibujo en Curso',
        message: 'Tiene un dibujo en curso. Si sale, el progreso se perderá. ¿Está seguro de que desea salir?',
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Salir', handler: () => App.exitApp() }
        ]
      });
      await alert.present();
      return;
    }

    // 2. Verificar si hay registros pendientes de sincronización
    const hasPending = await this.registerDataService.hasPendingSyncRecords();
    if (hasPending) {
      const alert = await this.alertController.create({
        header: 'Registros Pendientes',
        message: 'Tiene registros guardados que aún no se han sincronizado. Se intentará sincronizar la próxima vez que inicie la app con internet. ¿Desea salir ahora?',
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Salir', handler: () => App.exitApp() }
        ]
      });
      await alert.present();
      return;
    }

    // 3. Si no hay nada pendiente, solo una confirmación simple
    const alert = await this.alertController.create({
      header: 'Confirmar Salida',
      message: '¿Está seguro de que desea cerrar la aplicación?',
      buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Salir', handler: () => App.exitApp() }]
    });
    await alert.present();
  }

  navigateToRegisterData(geoJSON: any) {
    console.log('Polígono creado, navegando a la página de registro con:', geoJSON);
    this.navCtrl.navigateForward('/mapa/registerdata', {
      state: {
        geojson: geoJSON
      }
    });
  }

  async exportAllGeometries() {
    this.isLoading = true;
    try {
      // Cargar los datos del profesional para incluirlos en la exportación
      const { value: profileValue } = await Preferences.get({ key: 'userProfile' });
      let professionalProfile = null;
      if (profileValue) {
        professionalProfile = JSON.parse(profileValue);
      }

      const { keys } = await Preferences.keys();
      const geometryKeys = keys.filter(key =>
        key.startsWith('polygon_') ||
        key.startsWith('point_') ||
        key.startsWith('linestring_')
      );

      if (geometryKeys.length === 0) {
        this.presentToast('No hay geometrías para exportar.', 'warning', 'middle');
        return;
      }

      const exportFolderName = 'GeoMOVIL_Export';
      let filesWritten = 0;

      for (const key of geometryKeys) {
        const { value } = await Preferences.get({ key });
        if (value) {
          // Parsear el GeoJSON para modificarlo
          const geojson = JSON.parse(value);

          // Añadir los datos del profesional si existen
          if (professionalProfile && geojson.properties) {
            geojson.properties.profesional_dni = professionalProfile.dni;
            geojson.properties.profesional_nombres = professionalProfile.nombres;
            geojson.properties.profesional_apellido_paterno = professionalProfile.apellidoPaterno;
            geojson.properties.profesional_apellido_materno = professionalProfile.apellidoMaterno;
            geojson.properties.profesional_celular = professionalProfile.celular;
            geojson.properties.profesional_email = professionalProfile.email;
          }

          // Añadir área y perímetro/longitud calculados
          if (geojson.geometry && geojson.properties) {
            const geometryType = geojson.geometry.type;
            const coords = geojson.geometry.coordinates;

            if (geometryType === 'Polygon' && coords && coords.length > 0 && coords[0].length > 2) {
              const latlngs: any[] = coords[0].map((c: any) => L.latLng(c[1], c[0]));
              const areaM2 = L.GeometryUtil.geodesicArea(latlngs);
              geojson.properties.area_ha = (areaM2 / 10000).toFixed(4);

              let perimeter = 0;
              for (let i = 0; i < latlngs.length - 1; i++) {
                perimeter += latlngs[i].distanceTo(latlngs[i + 1]);
              }
              if (latlngs.length > 0 && latlngs[0].distanceTo(latlngs[latlngs.length - 1]) > 1) {
                perimeter += latlngs[latlngs.length - 1].distanceTo(latlngs[0]);
              }
              geojson.properties.perimetro_m = perimeter.toFixed(2);
            } else if (geometryType === 'LineString' && coords && coords.length > 1) {
              const latlngs: any[] = coords.map((c: any) => L.latLng(c[1], c[0]));
              let length = 0;
              for (let i = 0; i < latlngs.length - 1; i++) {
                length += latlngs[i].distanceTo(latlngs[i + 1]);
              }
              geojson.properties.longitud_m = length.toFixed(2);
            }
          }

          // Convertir el objeto GeoJSON modificado de nuevo a un string
          const dataToSave = JSON.stringify(geojson, null, 2); // pretty-print

          const fileName = `${key}.geojson`;
          const filePath = `${exportFolderName}/${fileName}`;

          await Filesystem.writeFile({
            path: filePath,
            data: dataToSave,
            directory: Directory.Documents,
            encoding: Encoding.UTF8,
            recursive: true // Crea la carpeta si no existe
          });
          filesWritten++;
        }
      }

      this.presentToast(
        `${filesWritten} archivos exportados con éxito.\nBusque la carpeta '${exportFolderName}' en la carpeta 'Documentos' de su dispositivo.`,
        'success',
        'middle'
      );

    } catch (error: any) {
      console.error('Error al exportar archivos:', error);
      const alert = await this.alertController.create({
        header: 'Error de Exportación',
        message: `No se pudieron guardar los archivos. Asegúrese de que la aplicación tenga permisos para acceder al almacenamiento.\n\nError: ${error.message}`,
        buttons: ['OK']
      });
      await alert.present();
    } finally {
      this.isLoading = false;
    }
  }

  private editGeometryInfo(key: string) {
    if (!key) return;
    // Navegamos a la ruta de edición, pasando la clave como parámetro en la URL.
    // La página de registro se encargará de cargar los datos usando esta clave.
    this.zone.run(() => {
      this.navCtrl.navigateForward(`/mapa/registerdata/${key}`);
    });
  }

  private async loadSavedGeometries() {
    if (!this.drawnItems) return;

    // 1. Obtener todas las claves de Preferences
    const { keys } = await Preferences.keys();
    const geometryKeys = keys.filter(key => key.startsWith('polygon_') || key.startsWith('point_') || key.startsWith('linestring_'));

    // 2. Iterar sobre cada clave, obtener el GeoJSON y añadirlo al mapa
    for (const key of geometryKeys) {
      const { value } = await Preferences.get({ key });
      if (value) {
        try {
          const geojson = JSON.parse(value);

          const geometryLayer = L.geoJSON(geojson, {
            style: (feature: any) => {
              const isPolygon = feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon';
              const isLine = feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString';

              if (isPolygon) {
                return {
                  color: this.isEditingMode ? '#ffc409' : '#0D9BD7', // Amarillo para editar, azul normal
                  weight: 3,
                  opacity: 0.7,
                  fillColor: this.isEditingMode ? '#ffc409' : '#0D9BD7',
                  fillOpacity: this.isEditingMode ? 0.4 : 0.2
                };
              }
              if (isLine) {
                return {
                  color: this.isEditingMode ? '#ffc409' : '#0D9BD7',
                  weight: 3,
                  opacity: 0.7
                };
              }
              return {}; // Estilo por defecto para otros tipos (como puntos)
            },
            pointToLayer: (_feature: any, latlng: any) => {
              const iconToUse = this.isEditingMode ? iconYellow : iconDefault;
              return L.marker(latlng, { icon: iconToUse });
            },
            onEachFeature: (feature: any, layer: any) => {
              const name = feature.properties?.name || (feature.geometry.type === 'Point' ? 'Punto sin nombre' : 'Polígono sin nombre');

              if (this.isEditingMode) {
                // MODO EDICIÓN: El clic en el polígono navega directamente a la edición.
                layer.bindTooltip(`Tocar para editar: <strong>${name}</strong>`, { permanent: false, sticky: true });

                layer.on('click', (e: any) => {
                  L.DomEvent.stop(e);
                  this.editGeometryInfo(key);
                });
              } else {
                // MODO NORMAL: Muestra un popup con información, sin botón de editar.
                if (feature.properties) {
                  const popupContent = `
                    <strong>${name}</strong>
                    <p style="margin: 5px 0;">DNI: ${feature.properties.dni || 'No registrado'}</p>
                    <small>Creado: ${feature.properties.createdAt ? new Date(feature.properties.createdAt).toLocaleString() : 'N/A'}</small>
                  `;
                  layer.bindPopup(popupContent);
                }
              }
            }
          });
          this.drawnItems.addLayer(geometryLayer);
        } catch (e) {
          console.error(`Error al procesar la geometría guardada (key: ${key})`, e);
        }
      }
    }
  }

  async presentToast(
    message: string,
    color: 'success' | 'warning' | 'danger' | 'primary' | 'medium',
    position: 'top' | 'bottom' | 'middle' = 'top'
  ) {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      color,
      position,
      cssClass: 'multiline-toast' // Clase para permitir múltiples líneas
    });
    toast.present();
  }

  /**
   * Acción del botón: Muestra el indicador de carga y centra el mapa en el usuario.
   */
  async findAndCenterUser() {
    if (!this.map || this.gpsData.lat === null) {
      console.warn('Datos de ubicación aún no disponibles.');
      return;
    }

    this.isLoading = true;
    // Forzamos la actualización de la UI para mostrar el spinner antes de las operaciones del mapa.
    await new Promise(resolve => setTimeout(resolve, 20));

    try {
      const { lat, lng } = this.gpsData;

      // Si los marcadores no existen, los creamos.
      if (!this.userCircle) {
        this.userCircle = L.circle([lat, lng], {
          color: '#ffff',
          fillColor: '#0D9BD7',
          fillOpacity: 1, // Hacemos el punto sólido para mejor visibilidad
          radius: 5,
          weight: 2,
        }).addTo(this.map);

        this.pulseCircle = L.circle([lat, lng], {
          color: 'transparent',
          fillColor: '#3880ff',
          fillOpacity: 0.5,
          radius: 10, // Radio inicial consistente con la animación
          weight: 0,
        }).addTo(this.map);

        const maxRadius = 40;
        let radius = 10;
        this.pulseInterval = setInterval(() => {
          if (!this.pulseCircle) return;
          radius += 1.5;
          if (radius >= maxRadius) radius = 10;
          this.pulseCircle.setRadius(radius);
          this.pulseCircle.setStyle({ fillOpacity: 0.5 * (1 - (radius / maxRadius)) });
        }, 50);
      }

      this.map.setView([lat, lng], 18);
    } catch (error) {
      console.error('Error en la localización manual', error);
      // Aquí podrías mostrar una alerta al usuario
    } finally {
      this.isLoading = false;
    }
  }

  private async startLocationWatch() {
    try {
      this.locationWatchId = await Geolocation.watchPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      }, (position, err) => {
        if (err) {
          console.error('Error en el seguimiento de la ubicación:', err);
          return;
        }
        if (position) {
          const { latitude, longitude, altitude, accuracy, altitudeAccuracy, speed } = position.coords;

          this.gpsData = {
            lat: latitude ? parseFloat(latitude.toFixed(4)) : 0,
            lng: longitude ? parseFloat(longitude.toFixed(4)) : 0,
            alt: altitude ? parseFloat(altitude.toFixed(4)) : 0,
            vel: speed ? parseFloat(speed.toFixed(2)) : 0,
            accH: accuracy ? parseFloat(accuracy.toFixed(4)) : 0,
            accV: altitudeAccuracy ? parseFloat(altitudeAccuracy.toFixed(2)) : 0,
          };

          // Si los marcadores existen, actualizamos su posición
          if (this.userCircle && this.pulseCircle) {
            const newLatLng = L.latLng(latitude, longitude);
            this.userCircle.setLatLng(newLatLng);
            this.pulseCircle.setLatLng(newLatLng);
          }
        }
      });
    } catch (error) {
      console.error('No se pudo iniciar el seguimiento de la ubicación', error);
    }
  }

  private initMap(): void {
    const map = L.map('map', {
      center: [-9.19, -75.0152],
      zoomControl: false,
      zoom: 10
    });

    // --- INICIO: Añadir control de búsqueda de direcciones (leaflet-geosearch) ---
    const provider = new OpenStreetMapProvider({
      params: {
        countrycodes: 'pe', // Limitar la búsqueda a Perú
        viewbox: '-81.3,0,-68.6,-18.4', // Bounding box de Perú para sesgar resultados
        bounded: true, // Restringir resultados estrictamente al viewbox
      },
    });
    const searchControl = GeoSearchControl({
      provider: provider,
      style: 'button', // Muestra una barra de búsqueda en lugar de un botón
      showMarker: true, // Muestra un marcador en el resultado
      showPopup: false, // No muestra un popup
      marker: {
        icon: iconDefault, // Usa el ícono azul por defecto
        draggable: false,
      },
      autoClose: true, // Cierra los resultados al seleccionar uno
      keepResult: true, // Mantiene el texto del resultado en la barra
      searchLabel: 'Buscar dirección o lugar...' // Texto de placeholder
    });
    map.addControl(searchControl);
    // --- FIN: Añadir control de búsqueda de direcciones ---

    this.lightLayer = L.tileLayer(
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }
    );
    this.satelliteLayer = L.tileLayer(
      'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      { attribution: '&copy; Google', maxZoom: 20 }
    );

    // Añadimos la capa de mapa por defecto
    this.satelliteLayer.addTo(map);
    L.control.scale({position: 'bottomleft', metric: true, imperial: false, maxWidth: 100}).addTo(map);


    // Inicializamos el FeatureGroup para los elementos dibujados
    this.drawnItems = new L.FeatureGroup();
    this.drawnItems.addTo(map);

    // Inicializamos el FeatureGroup para los marcadores de vértices
    this.vertexMarkers = new L.FeatureGroup();
    this.vertexMarkers.addTo(map);

    // Creamos un control para editar y borrar, pero no para dibujar nuevas formas.
    const editControl = new L.Control.Draw({
      position: 'topright',
      edit: {
        featureGroup: this.drawnItems,
        remove: false,
      },
      draw: false // Desactivamos las herramientas de dibujo manual
    });


    // Eventos para los elementos dibujados (útil si se editan/borran con leaflet-draw)
    map.on(L.Draw.Event.CREATED, (event: any) => {
      const layer = event.layer;
      this.drawnItems?.addLayer(layer);
      console.log('Feature created:', layer.toGeoJSON());
    });

    map.on(L.Draw.Event.DELETED, (event: any) => {
      console.log('Features deleted:', event.layers.toGeoJSON());
    });

    // Cargamos y añadimos el límite de Departamentos desde el archivo GeoJSON
    this.http.get('assets/data/departamentos.geojson').subscribe((data: any) => {
      this.peruLayer = L.geoJSON(data, {
        style: {
          color: '#ff7800', // Color de la línea
          weight: 2,       // Grosor de la línea
          opacity: 0.9,    // Opacidad
          fillColor: '#ff7800',
          fillOpacity: 0 // No rellenar el polígono
        }
      }).addTo(map);
      map.fitBounds(this.peruLayer.getBounds());
      // Establecemos el zoom mínimo al que se ajusta el mapa para ver todo el país.
      map.setMinZoom(map.getZoom());
    });

    this.map = map;

    // Iniciamos el seguimiento continuo de la ubicación del usuario.
    this.startLocationWatch();

    // Cargamos los polígonos guardados en el dispositivo
    this.loadSavedGeometries();
  }
}
