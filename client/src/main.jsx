import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/index.css';
import { SplashScreen } from '@capacitor/splash-screen';

// Force-hide native splash screen after 3s max (prevents black screen if bridge fails)
setTimeout(() => {
  SplashScreen.hide().catch(() => {});
}, 3000);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
