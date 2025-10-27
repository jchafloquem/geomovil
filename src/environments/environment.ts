// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  apiUrl: '/v1', // Usar el proxy en desarrollo
  firebase : {
    apiKey: "AIzaSyBMeRTDub_1w_4D7WD7ga9DmZweX6HkDW8",
    authDomain: "geomovil-e37e9.firebaseapp.com",
    projectId: "geomovil-e37e9",
    storageBucket: "geomovil-e37e9.firebasestorage.app",
    messagingSenderId: "401717180967",
    appId: "1:401717180967:web:765c7ec5e9708583c16c02"
  }
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
