import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../netlify/functions/places-search.mjs';
test('New Places preserves IDs and coordinates; quota errors do not become empty search results', async t => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'test';
  t.after(() => key === undefined ? delete process.env.GOOGLE_MAPS_API_KEY : process.env.GOOGLE_MAPS_API_KEY = key);
  let fail = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://places.googleapis.com/v1/places:searchText');
    assert.equal(JSON.parse(options.body).textQuery, '第一口就懷孕');
    assert.equal(options.headers['x-goog-fieldmask'], 'places.id,places.displayName,places.formattedAddress,places.location');
    return new Response(JSON.stringify(fail ? { error: { status: 'RESOURCE_EXHAUSTED' } } : {
      places: [{ id: 'cafe', displayName: { text: '第一口就懷孕' }, formattedAddress: '臺北市八德路', location: { latitude: 25, longitude: 121 } }]
    }), { status: fail ? 429 : 200 });
  });
  const event = { httpMethod: 'POST', body: JSON.stringify({ query: '第一口就懷孕' }) };
  const result = await handler(event);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(JSON.parse(result.body).candidates[0], { place_id: 'cafe', name: '第一口就懷孕', address: '臺北市八德路', lat: 25, lng: 121 });
  fail = true;
  assert.equal((await handler(event)).statusCode, 429);
});
