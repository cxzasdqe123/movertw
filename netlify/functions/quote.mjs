const airports = [
  {
    code: 'TPE',
    text: '台灣桃園國際機場 (TPE)',
    // Confirmed Google airport landmark at this address; never geocode to parking lot 3.
    placeId: 'ChIJ1RXSYsCfQjQRCbG1qZC2o3A',
    address: '33758桃園市大園區三石里航站南路9號',
  },
  {
    code: 'TSA',
    text: '台北松山機場 (TSA)',
    placeId: 'ChIJWSYUpPGrQjQROop1ttwNGJM',
    lat: 25.0675657,
    lng: 121.5526993,
  },
  {
    code: 'RMQ',
    text: '台中清泉崗機場 (RMQ)',
    placeId: 'ChIJcQOEX1MRaTQRJFCKXjMQZFg',
    lat: 24.2620608,
    lng: 120.6244181,
  },
  {
    code: 'KHH',
    text: '高雄小港國際機場 (KHH)',
    placeId: 'ChIJmbv2P84cbjQRKdFFacSu6hw',
    lat: 22.5749333,
    lng: 120.3471544,
  },
];

const airportPricing = {
  '台北市': { TPE: 1100, TSA: 850 },
  '臺北市': { TPE: 1100, TSA: 850 },
  '文山區': { TPE: 1300, TSA: 900 },
  '汐止區': { TPE: 1400, TSA: 1000 },
  '新北市': { TPE: 1300, TSA: 1000 },
  '桃園市': { TPE: 799 },
  '新竹市': { TPE: 1800 },
  '新竹縣': { TPE: 1900 },
};

const vehicleSurcharges = {
  comfort_4: 0,
  luxury_import: 500,
  business_7: 300,
  premium_7: 2000,
};

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
});

const detectZone = (text) => {
  if (text.includes('文山')) return '文山區';
  if (text.includes('汐止')) return '汐止區';
  if (text.includes('台北')) return '台北市';
  if (text.includes('臺北')) return '臺北市';
  if (text.includes('新北')) return '新北市';
  if (text.includes('桃園')) return '桃園市';
  if (text.includes('新竹市')) return '新竹市';
  if (text.includes('新竹縣')) return '新竹縣';
  return null;
};

const quoteId = () => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const nonce = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `Q${date}${nonce}`;
};

const validatePlace = (place) => (
  place &&
  Number.isFinite(Number(place.lat)) &&
  Number.isFinite(Number(place.lng)) &&
  String(place.address || place.name || place.label || '').trim()
);

const toRouteWaypoint = (place) => {
  if (place.routingAddress) return { address: place.routingAddress };
  const placeId = String(place.place_id || place.placeId || '').trim();
  if (placeId) {
    return { placeId };
  }

  return {
    location: {
      latLng: {
        latitude: Number(place.lat),
        longitude: Number(place.lng),
      },
    },
  };
};

async function computeDrivingRoute(apiKey, origin, destination) {
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': apiKey,
      'x-goog-fieldmask': 'routes.distanceMeters,routes.duration',
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      origin: toRouteWaypoint(origin),
      destination: toRouteWaypoint(destination),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      languageCode: 'zh-TW',
      units: 'METRIC',
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error('暫時無法取得行車路線，請稍後再試或洽客服確認車資。');
  }

  const route = data.routes?.[0];
  if (!Number.isFinite(route?.distanceMeters) || route.distanceMeters < 0) {
    throw new Error('Google 無法取得可靠開車距離，需人工確認。');
  }

  return {
    distanceMeters: route.distanceMeters,
    duration: route.duration || null,
  };
}

function calculatePrice(originLabel, airportCode, distanceKm, vehicleType, addons = {}) {
  const zone = detectZone(originLabel);
  let basePrice = Math.max(Math.round(distanceKm * 20), 799);
  let pricingMethod = '依行程距離計費，基本車資 NT$ 799 起';

  if (zone && airportPricing[zone]?.[airportCode]) {
    basePrice = airportPricing[zone][airportCode];
    pricingMethod = `機場固定價目表：${zone} ⇄ ${airportCode}`;
  }

  const vehicleSurcharge = vehicleSurcharges[vehicleType] ?? 0;
  const addonPrice = (addons.sign ? 200 : 0) + (addons.childSeat ? 300 : 0);

  return {
    basePrice,
    vehicleSurcharge,
    addonPrice,
    totalPrice: basePrice + vehicleSurcharge + addonPrice,
    pricingMethod,
  };
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return json(500, { error: '暫時無法提供查詢，請洽客服協助。' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}') || {};
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const serviceType = payload.serviceType || 'airport-send';
  if (!['airport-send', 'airport-pickup', 'general-travel', 'emergency'].includes(serviceType)) {
    return json(400, { error: '請選擇接送類型。' });
  }
  const isAirport = serviceType.startsWith('airport-');
  const pickup = serviceType === 'airport-pickup';
  const airportCode = pickup ? payload.sourceAirportCode : (payload.destinationAirportCode || 'TPE');
  const airport = isAirport ? airports.find(item => item.code === airportCode) : null;
  if (isAirport && !airport) return json(400, { error: '請選擇接送機場。' });
  // Only server-owned airports may override routing with a configured street address.
  const selected = place => validatePlace(place) ? {
    place_id: String(place.place_id || '').trim(),
    name: String(place.name || ''),
    address: String(place.address || place.label || place.name),
    lat: Number(place.lat), lng: Number(place.lng),
  } : null;
  const origin = pickup ? airport : selected(payload.origin);
  const destination = serviceType === 'airport-send' ? airport : selected(payload.destination);
  if (!origin || !destination) {
    return json(400, { error: '請先從搜尋結果選擇正確的上下車地點。' });
  }

  try {
    const route = await computeDrivingRoute(apiKey, origin, destination);
    const distanceKm = route.distanceMeters / 1000;
    const nonAirport = pickup ? destination : origin;
    const price = calculatePrice(nonAirport.address || nonAirport.name, airport?.code,
      distanceKm, payload.vehicleType, isAirport ? (payload.addons || {}) : {});
    const maps = new URL('https://www.google.com/maps/dir/');
    maps.searchParams.set('api', '1');
    maps.searchParams.set('travelmode', 'driving');
    for (const [key, place] of [['origin', origin], ['destination', destination]]) {
      const id = place.place_id || place.placeId;
      maps.searchParams.set(key, place.routingAddress || (id ? (place.address || place.text || place.name) : `${place.lat},${place.lng}`));
      if (id && !place.routingAddress) maps.searchParams.set(`${key}_place_id`, id);
    }
    return json(200, {
      quoteId: quoteId(), serviceType, origin, destination,
      distanceKm: Number(distanceKm.toFixed(1)),
      distanceMeters: route.distanceMeters,
      duration: route.duration,
      ...price,
      mapsUrl: maps.toString(),
      routeMethod: '依目前路況規劃汽車路線',
    });
  } catch (error) {
    return json(502, { error: '暫時無法取得行車路線，請稍後再試或洽客服確認車資。' });
  }
}
