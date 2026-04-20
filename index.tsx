
import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';

// ── Sentry (monitoratge d'errors frontend) ───────────────────
// Activat si VITE_SENTRY_DSN és present al .env
// Configura a: https://sentry.io → Ernest-Dashboard → Settings → DSN
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn:         import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release:     `ernest-dashboard@1.0.0`,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText:   true,   // GDPR: no capturar text
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate:   import.meta.env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    // No enviar dades personals
    beforeSend(event) {
      if (event.user) delete event.user.email
      return event
    },
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
