import { describe, expect, it, vi } from 'vitest';

import { buildServiceWorkerUrl, registerServiceWorker } from './pwa';

describe('pwa helpers', () => {
  it('builds a versioned service worker URL', () => {
    expect(buildServiceWorkerUrl('v0.1-beta.1')).toBe('/sw.js?v=v0.1-beta.1');
    expect(buildServiceWorkerUrl(' release candidate ')).toBe('/sw.js?v=release%20candidate');
    expect(buildServiceWorkerUrl('')).toBe('/sw.js?v=dev');
  });

  it('registers the service worker with cache-bypass update mode', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const update = vi.fn();
    const register = vi.fn().mockResolvedValue({ update });

    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { register }
    });

    registerServiceWorker('v0.1-beta.1');

    expect(addEventListenerSpy).toHaveBeenCalledWith('load', expect.any(Function));
    const loadHandler = addEventListenerSpy.mock.calls.find((call) => call[0] === 'load')?.[1];
    expect(typeof loadHandler).toBe('function');

    if (typeof loadHandler === 'function') {
      loadHandler(new Event('load'));
      await Promise.resolve();
      await Promise.resolve();
    }

    expect(register).toHaveBeenCalledWith('/sw.js?v=v0.1-beta.1', { updateViaCache: 'none' });
    expect(update).toHaveBeenCalledTimes(1);
  });
});

