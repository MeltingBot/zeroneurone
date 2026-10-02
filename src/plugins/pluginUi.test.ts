import { describe, it, expect } from 'vitest';
import { getGeoPickRequest, openGeoPicker, settleGeoPick } from './pluginUi';

describe('openGeoPicker', () => {
  it('resolves with the point chosen in the picker', async () => {
    const pending = openGeoPicker({ lat: 48.85, lng: 2.35 });
    settleGeoPick({ lat: 45.76, lng: 4.83 });
    expect(await pending).toEqual({ lat: 45.76, lng: 4.83 });
  });

  it('resolves with null when cancelled', async () => {
    const pending = openGeoPicker();
    settleGeoPick(null);
    expect(await pending).toBeNull();
  });

  it('passes the search text to the picker', () => {
    const pending = openGeoPicker(undefined, { query: '23 impasse des Glycines' });
    expect(getGeoPickRequest()?.query).toBe('23 impasse des Glycines');
    settleGeoPick(null);
    return pending;
  });

  it('cancels a request still open when a new one starts', async () => {
    const first = openGeoPicker();
    const second = openGeoPicker();
    expect(await first).toBeNull();
    settleGeoPick({ lat: 1, lng: 2 });
    expect(await second).toEqual({ lat: 1, lng: 2 });
  });

  it('gives each request its own id', () => {
    const first = openGeoPicker();
    const firstId = getGeoPickRequest()?.id;
    const second = openGeoPicker();
    expect(getGeoPickRequest()?.id).not.toBe(firstId);
    settleGeoPick(null);
    return Promise.all([first, second]);
  });
});
