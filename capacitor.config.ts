import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'GeoMovil',
  webDir: 'www',
  plugins:{
    CapacitorHttp:{
      enabled:true
    }
  },
  server: {
    androidScheme: 'https',
    allowNavigation: [
      "api.decolecta.com",
      "gateway.midagri.gob.pe"
    ]
    // -------------------------
  }
};

export default config;
