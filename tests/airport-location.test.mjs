import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const address = '33758桃園市大園區三石里航站南路9號';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
function page(candidates, requests) {
  const context = vm.createContext({
    document: { addEventListener() {}, getElementById() { return { value: 'TPE' }; } },
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ candidates }) };
    }
  });
  vm.runInContext(script, context);
  return context;
}

test('send and pickup resolve the configured address and reuse its coordinates', async () => {
  const requests = [];
  const context = page([{ address, lat: 25.01, lng: 121.01 }], requests);
  const send = await vm.runInContext("getPointFromForm('dest')", context);
  const pickup = await vm.runInContext("activeTab = 'airport-pickup'; getPointFromForm('source')", context);
  assert.equal(send.lat, 25.01);
  assert.equal(send.lon, 121.01);
  assert.equal(pickup, send);
  assert.ok(send.label.includes(address));
  assert.deepEqual(requests, [{ url: '/api/places/search', body: { query: address } }]);
});

test('unmatched or ambiguous addresses never reuse the old airport center', async () => {
  for (const candidates of [[], [{ address: '桃園市大園區航站南路9號之1', lat: 25, lng: 121 }],
    [{ address, lat: 25, lng: 121 }, { address, lat: 25.1, lng: 121.1 }]]) {
    const context = page(candidates, []);
    await assert.rejects(vm.runInContext("getAirportPoint('TPE')", context), /無法確認桃園機場/);
  }
});

test('other airports keep their existing coordinates without address lookup', async () => {
  const requests = [];
  const context = page([], requests);
  const point = await vm.runInContext("getAirportPoint('TSA')", context);
  assert.equal(point.lat, 25.0697);
  assert.equal(requests.length, 0);
});
