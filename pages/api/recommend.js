// pages/api/recommend.js
// Serverless function — runs on Vercel, keeps API key secret

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { myLocation, theirLocation, bias } = req.body;
  const key = process.env.GOOGLE_API_KEY;

  if (!key) return res.status(500).json({ error: 'API key not configured' });
  if (!myLocation || !theirLocation) return res.status(400).json({ error: 'Missing locations' });

  try {
    // 1. Geocode both addresses
    const [myCoords, theirCoords] = await Promise.all([
      geocode(myLocation, key),
      geocode(theirLocation, key),
    ]);

    // 2. Calculate target point based on bias
    const target = calcTarget(myCoords, theirCoords, bias);

    // 3. Search for coffee shops near target
    const shops = await searchCoffeeShops(target, key);

    res.status(200).json({
      myCoords,
      theirCoords,
      target,
      shops,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}

async function geocode(address, key) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address + ', London, UK')}&key=${key}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.status !== 'OK') throw new Error(`Could not find location: "${address}"`);
  const { lat, lng } = d.results[0].geometry.location;
  const formatted = d.results[0].formatted_address;
  return { lat, lng, formatted };
}

function calcTarget(a, b, bias) {
  if (bias === 'me') {
    return { lat: a.lat * 0.7 + b.lat * 0.3, lng: a.lng * 0.7 + b.lng * 0.3 };
  } else if (bias === 'them') {
    return { lat: a.lat * 0.3 + b.lat * 0.7, lng: a.lng * 0.3 + b.lng * 0.7 };
  }
  // midpoint
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

async function searchCoffeeShops(target, key) {
  // Use Places API Nearby Search
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${target.lat},${target.lng}&radius=800&type=cafe&keyword=coffee&rankby=prominence&key=${key}`;
  const r = await fetch(url);
  const d = await r.json();

  if (d.status !== 'OK' && d.status !== 'ZERO_RESULTS') {
    throw new Error('Places API error: ' + d.status);
  }

  // Take top 5 results, fetch details for each
  const top = (d.results || []).slice(0, 5);
  const detailed = await Promise.all(top.map(p => getPlaceDetails(p.place_id, key)));
  return detailed.filter(Boolean);
}

async function getPlaceDetails(placeId, key) {
  const fields = 'name,formatted_address,geometry,rating,user_ratings_total,opening_hours,photos,website,url,types,editorial_summary';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${key}`;
  const r = await fetch(url);
  const d = await r.json();
  if (d.status !== 'OK') return null;
  const p = d.result;

  // Build photo URL if available
  const photoRef = p.photos?.[0]?.photo_reference;
  const photoUrl = photoRef
    ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoRef}&key=${key}`
    : null;

  return {
    placeId,
    name: p.name,
    address: p.formatted_address,
    lat: p.geometry?.location?.lat,
    lng: p.geometry?.location?.lng,
    rating: p.rating,
    ratingsTotal: p.user_ratings_total,
    openNow: p.opening_hours?.open_now,
    photoUrl,
    mapsUrl: p.url,
    website: p.website,
    summary: p.editorial_summary?.overview || null,
  };
}
