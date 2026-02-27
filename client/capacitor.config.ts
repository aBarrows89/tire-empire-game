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
    androidScheme: 'https',
  },
  plugins: {
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#1a1a2e',
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1a1a2e',
      showSpinner: false,
    },
  },
};

export default config;
