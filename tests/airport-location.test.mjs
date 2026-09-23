import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { handler } from '../netlify/functions/quote.mjs';
const place = { place_id: 'cafe', name: '咖啡店', address: '臺北市松山區八德路四段389巷36號', lat: 25, lng: 121 };
const address = '33758桃園市大園區三石里航站南路9號';
function mock(t, data = { routes: [{ distanceMeters: 42123, duration: '2700s' }] }, status = 200) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'test';
  t.after(() => key === undefined ? delete process.env.GOOGLE_MAPS_API_KEY : process.env.GOOGLE_MAPS_API_KEY = key);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify(data), { status });
  });
  return requests;
}
const quote = payload => handler({ httpMethod: 'POST', body: JSON.stringify(payload) });
test('pickup routes FROM confirmed airport landmark and prices destination district', async t => {
  const requests = mock(t);
  const result = await quote({ serviceType: 'airport-pickup', sourceAirportCode: 'TPE', destination: place,
    vehicleType: 'business_7', addons: { sign: true, childSeat: true } });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(requests[0].origin, { placeId: 'ChIJ1RXSYsCfQjQRCbG1qZC2o3A' });
  assert.deepEqual(requests[0].destination, { placeId: 'cafe' });
  const data = JSON.parse(result.body);
  assert.equal(data.totalPrice, 1900);
  const url = new URL(data.mapsUrl);
  assert.equal(url.searchParams.get('origin'), address);
  assert.equal(url.searchParams.get('origin_place_id'), 'ChIJ1RXSYsCfQjQRCbG1qZC2o3A');
  assert.equal(url.searchParams.get('destination_place_id'), 'cafe');
  assert.equal(url.searchParams.get('travelmode'), 'driving');
});
for (const serviceType of ['general-travel', 'emergency']) test(`${serviceType} uses both selected IDs and distance fare`, async t => {
  const requests = mock(t);
  const result = await quote({ serviceType, origin: { ...place, routingAddress: 'wrong' },
    destination: { ...place, place_id: 'office' }, vehicleType: 'business_7', addons: { sign: true } });
  const data = JSON.parse(result.body);
  assert.deepEqual(requests[0].origin, { placeId: 'cafe' });
  assert.deepEqual(requests[0].destination, { placeId: 'office' });
  assert.equal(requests[0].travelMode, 'DRIVE');
  assert.equal(data.distanceMeters, 42123);
  assert.equal(data.totalPrice, 1142);
  assert.equal(data.addonPrice, 0);
});
test('route failure never returns an estimated fare', async t => {
  mock(t, { error: { status: 'RESOURCE_EXHAUSTED' } }, 429);
  const result = await quote({ origin: place });
  assert.equal(result.statusCode, 502);
  assert.equal(JSON.parse(result.body).totalPrice, undefined);
});
test('homepage sends selected endpoints in correct direction for every mode', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const context = vm.createContext({ document: { addEventListener() {}, getElementById(id) {
    return { value: id.startsWith('airport') ? 'TPE' : 'comfort_4', checked: false };
  } } });
  vm.runInContext(script, context);
  vm.runInContext(`selectedPlaces.source = ${JSON.stringify(place)}; selectedPlaces.dest = ${JSON.stringify({...place, place_id:'office'})}`, context);
  for (const mode of ['airport-send', 'airport-pickup', 'general-travel', 'emergency']) {
    const payload = vm.runInContext(`activeTab = '${mode}'; buildQuotePayload()`, context);
    assert.equal(payload.serviceType, mode);
    if (mode === 'airport-pickup') assert.equal(payload.sourceAirportCode, 'TPE');
    else assert.equal(payload.origin.place_id, 'cafe');
    if (mode === 'airport-send') assert.equal(payload.destinationAirportCode, 'TPE');
    else assert.equal(payload.destination.place_id, 'office');
  }
  assert.throws(() => vm.runInContext('selectedPlaces.source = null; buildQuotePayload()', context), /請先搜尋/);
});
