import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    // Target older mobile browsers (Android WebView 80+, iOS Safari 13+)
    target: ['es2018', 'chrome80', 'safari13'],
    rollupOptions: {
      // RevenueCat is a native-only plugin — external until installed
      external: ['@revenuecat/purchases-capacitor', '@capacitor/haptics'],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
    fs: {
      allow: ['..'],
    },
  },
});
