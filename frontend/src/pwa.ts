const DEFAULT_APP_VERSION = 'dev';

export function buildServiceWorkerUrl(version: string): string {
  const normalizedVersion = version.trim() || DEFAULT_APP_VERSION;
  return `/sw.js?v=${encodeURIComponent(normalizedVersion)}`;
}

export function registerServiceWorker(version: string): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(buildServiceWorkerUrl(version), { updateViaCache: 'none' })
      .then((registration) => {
        void registration.update();
      })
      .catch(() => {
        // Ignore registration errors in the client UI.
      });
  });
}

