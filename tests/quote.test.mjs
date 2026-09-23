import test from 'node:test';
import assert from 'node:assert/strict';

import { handler } from '../netlify/functions/quote.mjs';

test('quote routes to the confirmed Taoyuan airport landmark with traffic-aware routing', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;
  let googleRequest;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
    }
  });

  process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  globalThis.fetch = async (url, options) => {
    googleRequest = { url, options };
    return new Response(JSON.stringify({
      routes: [{ distanceMeters: 60_500, duration: '2940s' }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const result = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({
      origin: {
        place_id: 'test-origin-place-id',
        name: '測試起點',
        address: '新竹市測試起點',
        lat: 24.81,
        lng: 120.96,
      },
      destinationAirportCode: 'TPE',
      vehicleType: 'comfort_4',
      addons: {},
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.equal(googleRequest.url, 'https://routes.googleapis.com/directions/v2:computeRoutes');

  const routeRequest = JSON.parse(googleRequest.options.body);
  assert.deepEqual(routeRequest.origin, { placeId: 'test-origin-place-id' });
  assert.deepEqual(routeRequest.destination, { placeId: 'ChIJ1RXSYsCfQjQRCbG1qZC2o3A' });
  assert.equal(routeRequest.routingPreference, 'TRAFFIC_AWARE_OPTIMAL');

  const quote = JSON.parse(result.body);
  assert.equal(quote.distanceKm, 60.5);
  assert.equal(quote.duration, '2940s');
  assert.equal(quote.totalPrice, 1800);
});

test('quote keeps coordinate waypoints as a fallback when place_id is unavailable', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;
  let routeRequest;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
    }
  });

  process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  globalThis.fetch = async (_url, options) => {
    routeRequest = JSON.parse(options.body);
    return new Response(JSON.stringify({
      routes: [{ distanceMeters: 10_000, duration: '900s' }],
    }), { status: 200 });
  };

  const result = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({
      origin: {
        name: '測試地點',
        address: '台灣測試地址',
        lat: 25.03,
        lng: 121.56,
      },
      destinationAirportCode: 'TSA',
      vehicleType: 'comfort_4',
      addons: {},
    }),
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(routeRequest.origin, {
    location: {
      latLng: {
        latitude: 25.03,
        longitude: 121.56,
      },
    },
  });
  assert.deepEqual(routeRequest.destination, { placeId: 'ChIJWSYUpPGrQjQROop1ttwNGJM' });
});

