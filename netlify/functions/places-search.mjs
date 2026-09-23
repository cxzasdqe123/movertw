const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
});

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

  const query = String(payload.query || '').trim();
  if (query.length < 2) {
    return json(400, { error: '請輸入至少 2 個字的地點或地址。' });
  }

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
        'x-goog-fieldmask': 'places.id,places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify({ textQuery: query, languageCode: 'zh-TW', regionCode: 'TW', pageSize: 6 }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) {
      return json(response.status === 429 ? 429 : 502, {
        error: '暫時無法搜尋地點，請稍後再試或洽客服協助。',
        googleStatus: data.error?.status || null,
      });
    }

    const candidates = (data.places || []).slice(0, 6).map((place) => ({
      place_id: place.id,
      name: place.displayName?.text || place.formattedAddress,
      address: place.formattedAddress,
      lat: place.location?.latitude,
      lng: place.location?.longitude,
    })).filter((candidate) => (
      candidate.place_id &&
      Number.isFinite(candidate.lat) &&
      Number.isFinite(candidate.lng)
    ));

    return json(200, { candidates });
  } catch (error) {
    return json(502, { error: '暫時無法搜尋地點，請稍後再試。' });
  }
}

