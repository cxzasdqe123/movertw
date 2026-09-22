const airports = [
  {
    code: 'TPE',
    text: '台灣桃園國際機場 (TPE)',
    routingAddress: '33758桃園市大園區三石里航站南路9號',
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

const googleStatusMessage = {
  REQUEST_DENIED: 'Google 拒絕路線試算，請確認後端 key、Routes API、billing 與 API 限制。',
  RESOURCE_EXHAUSTED: 'Google 路線試算超過配額，請稍後再試或調整配額。',
  INVALID_ARGUMENT: 'Google 路線試算請求格式不完整。',
  PERMISSION_DENIED: 'Google 路線試算權限不足，請確認 Routes API 已啟用。',
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
    const status = data.error?.status;
    throw new Error(googleStatusMessage[status] || data.error?.message || `Google 路線試算失敗：${response.status}`);
  }

  const route = data.routes?.[0];
  if (!route?.distanceMeters) {
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
  let pricingMethod = '距離計價：max(round(distance_km x 20), 799)';

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
    return json(500, { error: 'Server Google Maps key is not configured.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const origin = payload.origin;
  const destinationAirportCode = String(payload.destinationAirportCode || 'TPE');
  const destinationAirport = airports.find((airport) => airport.code === destinationAirportCode);

  if (!validatePlace(origin)) {
    return json(400, { error: '請先選擇確認後的出發地候選結果。' });
  }
  if (!destinationAirport) {
    return json(400, { error: '不支援的機場。' });
  }

  try {
    const route = await computeDrivingRoute(apiKey, origin, destinationAirport);
    const distanceKm = route.distanceMeters / 1000;
    const originLabel = origin.address || origin.name || origin.label;
    const price = calculatePrice(originLabel, destinationAirport.code, distanceKm, payload.vehicleType, payload.addons);

    return json(200, {
      quoteId: quoteId(),
      origin: {
        place_id: origin.place_id || null,
        name: origin.name || originLabel,
        address: originLabel,
      },
      destination: destinationAirport,
      distanceKm: Number(distanceKm.toFixed(1)),
      distanceMeters: route.distanceMeters,
      duration: route.duration,
      ...price,
      routeMethod: 'Google Routes API driving route',
    });
  } catch (error) {
    return json(502, { error: error.message || 'Google 路線試算失敗。' });
  }
}
