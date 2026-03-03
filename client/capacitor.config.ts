import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tireempire.app',
  appName: 'Tire Empire',
  webDir: 'dist',
  server: {
    // For dev testing: uncomment and use your computer's LAN IP
    // url: 'http://192.168.x.x:5173',
    // For production: remove url (uses bundled web assets)
    // Production: use https. For dev with HTTP API, change to 'http'
    // Use 'https' for production, 'http' for dev with local HTTP API
    androidScheme: 'https',
  },
  plugins: {
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#1a1a2e',
    },
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1a1a2e',
      showSpinner: false,
    },
    AdMob: {
      appIdIos: 'ca-app-pub-3940256099942544~1458002511',       // Google test app ID
      appIdAndroid: 'ca-app-pub-3940256099942544~3347511713',   // Google test app ID
      requestTrackingAuthorization: true,
    },
  },
};

export default config;
