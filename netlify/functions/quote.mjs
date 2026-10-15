import { tpeAreaFares } from './tpe-area-fares.mjs';
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

const vehicleSurcharges = {
  comfort_4: 0,
  luxury_import: 500,
  business_7: 300,
  premium_7: 2000,
};


const normalizeAddress = value => String(value || '').replaceAll('臺', '台').replaceAll('丰', '豐');
const taiwanCities = ['基隆市','台北市','新北市','桃園市','新竹市','新竹縣','苗栗縣','台中市','彰化縣','南投縣','雲林縣','嘉義市','嘉義縣','台南市','高雄市','屏東縣','宜蘭縣','花蓮縣','台東縣'];
function findTpeAreaFare(address) {
  const normalized = normalizeAddress(address);
  const city = taiwanCities.find(name => normalized.includes(name));
  const cityStart = normalized.indexOf(city);
  const district = normalized.slice(cityStart + city.length).match(/[\u4e00-\u9fff]{1,4}(?:區|鎮|鄉|市)/)?.[0] || null;
  if (!city || !district) return null;
  const candidates = tpeAreaFares.filter(row => row.city === city && row.districts.includes(district));
  if (candidates.length === 1) return candidates[0];
  if (!candidates.length) return null;
  const mountainHints = /山區|陽明山|司馬庫斯|安坑|華城|屈尺|直潭|九份|谷關|梨山|清境|日月潭|阿里山|菁山|擎天崗|平等里/;
  if (mountainHints.test(normalized)) {
    const mountain = candidates.find(row => /山區/.test(row.area));
    if (mountain) return mountain;
  }
  const standard = candidates.find(row => /平地|市區/.test(row.area));
  return standard || null;
}

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
});

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

function calculatePrice(distanceKm, vehicleType, addons = {}, fareContext = {}) {
  const isTpeAirport = fareContext.isAirport && fareContext.airportCode === 'TPE';
  const areaFare = isTpeAirport ? findTpeAreaFare(fareContext.areaAddress) : null;
  if (isTpeAirport && !areaFare) {
    const error = new Error('目前價目表沒有對應的行政區，請洽客服確認車資。');
    error.code = 'AREA_FARE_NOT_FOUND';
    throw error;
  }
  const isNineSeat = ['business_7', 'premium_7'].includes(vehicleType);
  const direction = fareContext.pickup ? 'pickup' : 'send';
  const fareKey = `${direction}${isNineSeat ? '9' : '5'}`;
  const basePrice = areaFare ? areaFare[fareKey] : Math.max(Math.round(distanceKm * 20), 800);
  const pricingMethod = areaFare
    ? `桃園機場固定區域價｜${areaFare.city}・${areaFare.area}｜${isNineSeat ? '9 人座' : '5 人座'}${fareContext.pickup ? '接機' : '送機'}；車型升級與加購另計`
    : '依行車距離每公里 NT$ 20，基本車資最低 NT$ 800；車型與加購費用另計';

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
    const areaAddress = pickup ? destination.address : origin.address;
    if (isAirport && airport.code === 'TPE' && !findTpeAreaFare(areaAddress)) {
      return json(422, { error: '目前價目表沒有對應的行政區，請洽客服確認車資。' });
    }
    const route = await computeDrivingRoute(apiKey, origin, destination);
    const distanceKm = route.distanceMeters / 1000;
    const price = calculatePrice(distanceKm, payload.vehicleType, isAirport ? (payload.addons || {}) : {}, { isAirport, airportCode: airport?.code, areaAddress, pickup });
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

