import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { registerServiceWorker } from './pwa';
import './styles.css';

registerServiceWorker(import.meta.env.VITE_APP_VERSION || 'dev');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
