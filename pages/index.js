import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import Script from 'next/script';

const BIAS_OPTIONS = [
  { value: 'me', label: 'Near me' },
  { value: 'midpoint', label: 'Midpoint' },
  { value: 'them', label: 'Near them' },
];

function starsDisplay(rating) {
  const full = Math.round(rating || 0);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function buildMapsLink(target, shops) {
  // Deep link to Google Maps search for coffee near the target point
  const { lat, lng } = target;
  return `https://www.google.com/maps/search/coffee+shops/@${lat},${lng},15z`;
}

export default function Home() {
  const [myLocation, setMyLocation] = useState('');
  const [theirLocation, setTheirLocation] = useState('');
  const [bias, setBias] = useState('midpoint');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [selectedShop, setSelectedShop] = useState(null);
  const mapRef = useRef(null);
  const googleMapRef = useRef(null);
  const markersRef = useRef([]);
  const [googleLoaded, setGoogleLoaded] = useState(false);
  const theirInputRef = useRef(null);
  const myAutocompleteRef = useRef(null);
  const theirAutocompleteRef = useRef(null);

  const handleSearch = async () => {
    if (!myLocation.trim() || !theirLocation.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setSelectedShop(null);

    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ myLocation, theirLocation, bias }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      setResults(data);
      setSelectedShop(data.shops?.[0] || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Init Google Map once results arrive
  useEffect(() => {
    if (!results || !mapRef.current) return;
    if (!googleLoaded || !window.google) return;

    const { myCoords, theirCoords, target, shops } = results;

    // Clear old markers
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const map = new window.google.maps.Map(mapRef.current, {
      center: target,
      zoom: 14,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      mapId: '75948a7351552c87fff584af',
    });
    googleMapRef.current = map;

    // Your pin
    addMarker(map, myCoords, '🔵', 'You', '#4A90D9');
    // Their pin
    addMarker(map, theirCoords, '🟤', 'Them', '#8B5E3C');
    // Target area pin
    addMarker(map, target, '🟢', 'Meet here', '#5A9E58');

    // Coffee shop markers with photo thumbnails
    shops.forEach((shop, i) => {
      if (!shop.lat || !shop.lng) return;

      const shortName = shop.name.length > 14 ? shop.name.slice(0, 13) + '…' : shop.name;
      const rating = shop.rating ? shop.rating.toFixed(1) : '';

      const markerHtml = `
        <div style="
          display:flex;flex-direction:column;align-items:center;
          cursor:pointer;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25));
        ">
          <div style="
            background:white;border-radius:8px;overflow:hidden;
            border:2px solid white;width:52px;height:52px;
          ">
            ${shop.photoUrl
              ? `<img src="${shop.photoUrl}" style="width:52px;height:52px;object-fit:cover;" />`
              : `<div style="width:52px;height:52px;background:#C8873A;display:flex;align-items:center;justify-content:center;font-size:20px;">☕</div>`
            }
          </div>
          <div style="
            background:white;border-radius:6px;padding:3px 6px;margin-top:3px;
            font-family:'DM Sans',sans-serif;font-size:11px;color:#2C1A0E;
            white-space:nowrap;text-align:center;line-height:1.3;
          ">
            <div style="font-weight:500;">${shortName}</div>
            ${rating ? `<div style="color:#C8873A;font-size:10px;">★ ${rating}</div>` : ''}
          </div>
          <div style="width:2px;height:6px;background:white;"></div>
        </div>
      `;

      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        position: { lat: shop.lat, lng: shop.lng },
        map,
        title: shop.name,
        content: (() => {
          const div = document.createElement('div');
          div.innerHTML = markerHtml;
          return div;
        })(),
      });

      markersRef.current.push(marker);
      marker.addListener('click', () => setSelectedShop(shop));
    });

    // Fit bounds to include all points
    const bounds = new window.google.maps.LatLngBounds();
    [myCoords, theirCoords, ...shops.filter(s => s.lat)].forEach(p =>
      bounds.extend({ lat: p.lat, lng: p.lng })
    );
    map.fitBounds(bounds, { top: 60, right: 40, bottom: 40, left: 40 });
  }, [results, googleLoaded]);

  function addMarker(map, coords, emoji, label, color) {
    const marker = new window.google.maps.Marker({
      position: coords,
      map,
      title: label,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: '#FAF7F2',
        strokeWeight: 2,
      },
    });
    markersRef.current.push(marker);
    return marker;
  }

  const handleReset = () => {
    setResults(null);
    setError(null);
    setSelectedShop(null);
  };

  return (
    <>
      <Head>
        <title>half & half — find the perfect coffee spot</title>
        <meta name="description" content="Find the perfect coffee shop to meet someone in London" />
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY}&libraries=places,marker&map_ids=halfandhalf`}
          strategy="afterInteractive"
          onLoad={() => {
            setGoogleLoaded(true);
            const options = { componentRestrictions: { country: 'gb' }, fields: ['formatted_address', 'name'] };
            if (myInputRef.current) {
              myAutocompleteRef.current = new window.google.maps.places.Autocomplete(myInputRef.current, options);
              myAutocompleteRef.current.addListener('place_changed', () => {
                const place = myAutocompleteRef.current.getPlace();
                setMyLocation(place.formatted_address || place.name || '');
              });
            }
            if (theirInputRef.current) {
              theirAutocompleteRef.current = new window.google.maps.places.Autocomplete(theirInputRef.current, options);
              theirAutocompleteRef.current.addListener('place_changed', () => {
                const place = theirAutocompleteRef.current.getPlace();
                setTheirLocation(place.formatted_address || place.name || '');
              });
            }
          }}
        />
      </Head>

      <div style={styles.app}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.logoWrap}>
            <span style={styles.logo}>half<span style={styles.logoAccent}>&</span>half</span>
            <span style={styles.tagline}>find the perfect coffee spot, together</span>
          </div>
        </header>

        {!results ? (
          /* ── SEARCH FORM ── */
          <main style={styles.formMain}>
            <div style={styles.card}>
              <h1 style={styles.cardTitle}>Where are you both coming from?</h1>
              <p style={styles.cardSub}>Enter any London address, postcode, or neighbourhood</p>

              <div style={styles.formGrid}>
                <div style={styles.field}>
                  <label style={styles.label}>Your location</label>
                  <input
                    ref={myInputRef}
                    style={styles.input}
                    value={myLocation}
                    onChange={e => setMyLocation(e.target.value)}
                    placeholder="e.g. Bethnal Green, E2"
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    onFocus={e => e.target.style.borderColor = '#C8873A'}
                    onBlur={e => e.target.style.borderColor = 'rgba(44,26,14,0.15)'}
                  />
                </div>
                <div style={styles.field}>
                  <label style={styles.label}>Their location</label>
                  <input
                    ref={theirInputRef}
                    style={styles.input}
                    value={theirLocation}
                    onChange={e => setTheirLocation(e.target.value)}
                    placeholder="e.g. Clapham, SW4"
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    onFocus={e => e.target.style.borderColor = '#C8873A'}
                    onBlur={e => e.target.style.borderColor = 'rgba(44,26,14,0.15)'}
                  />
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Meet closer to</label>
                <div style={styles.biasGroup}>
                  {BIAS_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      style={{
                        ...styles.biasBtn,
                        ...(bias === o.value ? styles.biasBtnActive : {}),
                      }}
                      onClick={() => setBias(o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && <div style={styles.errorBox}>⚠️ {error}</div>}

              <button
                style={{
                  ...styles.submitBtn,
                  opacity: (loading || !myLocation.trim() || !theirLocation.trim()) ? 0.55 : 1,
                }}
                onClick={handleSearch}
                disabled={loading || !myLocation.trim() || !theirLocation.trim()}
              >
                {loading ? 'Finding spots…' : 'Find coffee shops →'}
              </button>
            </div>
          </main>
        ) : (
          /* ── RESULTS VIEW ── */
          <div style={styles.resultsLayout}>
            {/* Left panel */}
            <aside style={styles.sidebar}>
              <div style={styles.sidebarHeader}>
                <button style={styles.backBtn} onClick={handleReset}>← New search</button>
                <div style={styles.routeInfo}>
                  <div style={styles.routePin}>
                    <span style={{ ...styles.dot, background: '#4A90D9' }} />
                    <span style={styles.routeText}>{results.myCoords.formatted.split(',')[0]}</span>
                  </div>
                  <div style={styles.routeLine} />
                  <div style={styles.routePin}>
                    <span style={{ ...styles.dot, background: '#8B5E3C' }} />
                    <span style={styles.routeText}>{results.theirCoords.formatted.split(',')[0]}</span>
                  </div>
                </div>
              </div>

              <div style={styles.shopList}>
                {results.shops.map((shop, i) => (
                  <div
                    key={shop.placeId}
                    style={{
                      ...styles.shopCard,
                      ...(selectedShop?.placeId === shop.placeId ? styles.shopCardActive : {}),
                    }}
                    onClick={() => {
                      setSelectedShop(shop);
                      if (googleMapRef.current && shop.lat) {
                        googleMapRef.current.panTo({ lat: shop.lat, lng: shop.lng });
                        googleMapRef.current.setZoom(16);
                      }
                    }}
                  >
                    <div style={styles.shopRank}>{i + 1}</div>
                    <div style={styles.shopInfo}>
                      <div style={styles.shopName}>{shop.name}</div>
                      <div style={styles.shopAddress}>{shop.address.replace(', UK', '').replace(', England', '')}</div>
                      {shop.summary && <div style={styles.shopSummary}>{shop.summary}</div>}
                      <div style={styles.shopFooter}>
                        {shop.rating && (
                          <span style={styles.rating}>
                            <span style={styles.stars}>{starsDisplay(shop.rating)}</span>
                            {' '}{shop.rating} {shop.ratingsTotal ? `(${shop.ratingsTotal.toLocaleString()})` : ''}
                          </span>
                        )}
                        {shop.openNow !== undefined && (
                          <span style={{ ...styles.openBadge, color: shop.openNow ? '#5A9E58' : '#C0392B' }}>
                            {shop.openNow ? '● Open now' : '● Closed'}
                          </span>
                        )}
                      </div>
                      <div style={styles.shopLinks}>
                        {shop.mapsUrl && (
                          <a href={shop.mapsUrl} target="_blank" rel="noreferrer" style={styles.link}>
                            View on Maps →
                          </a>
                        )}
                        {shop.website && (
                          <a href={shop.website} target="_blank" rel="noreferrer" style={styles.link}>
                            Website →
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Google Maps link */}
              <a
                href={buildMapsLink(results.target, results.shops)}
                target="_blank"
                rel="noreferrer"
                style={styles.mapsLinkBtn}
              >
                Open area in Google Maps →
              </a>
            </aside>

            {/* Map */}
            <div style={styles.mapWrap}>
              <div ref={mapRef} style={styles.map} />
              {/* Legend */}
              <div style={styles.legend}>
                {[
                  { color: '#4A90D9', label: 'You' },
                  { color: '#8B5E3C', label: 'Them' },
                  { color: '#5A9E58', label: 'Meet area' },
                  { color: '#C8873A', label: 'Coffee shops' },
                ].map(l => (
                  <div key={l.label} style={styles.legendItem}>
                    <span style={{ ...styles.legendDot, background: l.color }} />
                    <span style={styles.legendLabel}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  app: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#F5F0E8',
  },
  header: {
    padding: '24px 36px',
    borderBottom: '1px solid rgba(44,26,14,0.08)',
    background: '#FAF7F2',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexShrink: 0,
  },
  logoWrap: { display: 'flex', alignItems: 'baseline', gap: 12 },
  logo: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 26,
    color: '#2C1A0E',
    letterSpacing: '-0.3px',
  },
  logoAccent: { color: '#C8873A' },
  tagline: {
    fontSize: 13,
    color: '#B8A090',
    fontWeight: 300,
    letterSpacing: '0.3px',
  },
  formMain: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
  },
  card: {
    background: '#FAF7F2',
    border: '1px solid rgba(200,135,58,0.18)',
    borderRadius: 16,
    padding: '40px 44px',
    width: '100%',
    maxWidth: 560,
    boxShadow: '0 8px 40px rgba(44,26,14,0.08)',
  },
  cardTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 24,
    marginBottom: 6,
  },
  cardSub: {
    fontSize: 13,
    color: '#B8A090',
    marginBottom: 32,
    fontWeight: 300,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    marginBottom: 20,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 },
  label: {
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '1.2px',
    textTransform: 'uppercase',
    color: '#C8873A',
  },
  input: {
    background: 'white',
    border: '1px solid rgba(44,26,14,0.15)',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 15,
    color: '#2C1A0E',
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  biasGroup: { display: 'flex', gap: 8 },
  biasBtn: {
    flex: 1,
    padding: '11px 12px',
    border: '1.5px solid rgba(44,26,14,0.15)',
    borderRadius: 8,
    background: 'white',
    fontSize: 14,
    color: '#2C1A0E',
    transition: 'all 0.15s',
    textAlign: 'center',
  },
  biasBtnActive: {
    background: '#2C1A0E',
    borderColor: '#2C1A0E',
    color: '#FAF7F2',
  },
  submitBtn: {
    width: '100%',
    padding: '16px',
    background: '#C8873A',
    color: 'white',
    border: 'none',
    borderRadius: 10,
    fontFamily: "'Playfair Display', serif",
    fontSize: 18,
    transition: 'all 0.2s',
    marginTop: 8,
    letterSpacing: '0.3px',
  },
  errorBox: {
    padding: '14px 16px',
    background: '#fff5f5',
    border: '1px solid #ffcccc',
    borderRadius: 8,
    color: '#c0392b',
    fontSize: 14,
    marginBottom: 12,
  },
  // Results layout
  resultsLayout: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    height: 'calc(100vh - 73px)',
  },
  sidebar: {
    width: 380,
    flexShrink: 0,
    background: '#FAF7F2',
    borderRight: '1px solid rgba(44,26,14,0.08)',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
  },
  sidebarHeader: {
    padding: '20px 24px 16px',
    borderBottom: '1px solid rgba(44,26,14,0.08)',
    position: 'sticky',
    top: 0,
    background: '#FAF7F2',
    zIndex: 10,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    fontSize: 13,
    color: '#B8A090',
    padding: 0,
    marginBottom: 14,
    cursor: 'pointer',
    letterSpacing: '0.2px',
  },
  routeInfo: { display: 'flex', flexDirection: 'column', gap: 4 },
  routePin: { display: 'flex', alignItems: 'center', gap: 8 },
  routeLine: {
    width: 2,
    height: 10,
    background: 'rgba(44,26,14,0.1)',
    marginLeft: 5,
  },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  routeText: { fontSize: 13, color: '#2C1A0E', fontWeight: 500 },
  shopList: { flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 },
  shopCard: {
    display: 'flex',
    gap: 12,
    padding: '14px 16px',
    background: 'white',
    borderRadius: 10,
    border: '1.5px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  shopCardActive: {
    borderColor: '#C8873A',
    boxShadow: '0 2px 12px rgba(200,135,58,0.15)',
  },
  shopRank: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 20,
    color: '#D4B896',
    minWidth: 22,
    paddingTop: 2,
    lineHeight: 1,
  },
  shopInfo: { flex: 1, minWidth: 0 },
  shopName: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 15,
    marginBottom: 3,
    color: '#2C1A0E',
  },
  shopAddress: {
    fontSize: 12,
    color: '#B8A090',
    marginBottom: 6,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  shopSummary: {
    fontSize: 12,
    color: '#6B5040',
    lineHeight: 1.5,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  shopFooter: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
  rating: { fontSize: 12, color: '#2C1A0E' },
  stars: { color: '#C8873A', fontSize: 11 },
  openBadge: { fontSize: 11, fontWeight: 500 },
  shopLinks: { display: 'flex', gap: 12 },
  link: {
    fontSize: 12,
    color: '#C8873A',
    textDecoration: 'none',
    letterSpacing: '0.2px',
  },
  mapsLinkBtn: {
    display: 'block',
    margin: '8px 16px 20px',
    padding: '12px 16px',
    background: '#2C1A0E',
    color: '#FAF7F2',
    borderRadius: 8,
    textAlign: 'center',
    textDecoration: 'none',
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
    letterSpacing: '0.2px',
    transition: 'opacity 0.15s',
  },
  mapWrap: {
    flex: 1,
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  legend: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    background: 'rgba(250,247,242,0.95)',
    border: '1px solid rgba(44,26,14,0.1)',
    borderRadius: 8,
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    boxShadow: '0 2px 12px rgba(44,26,14,0.1)',
  },
  legendItem: { display: 'flex', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  legendLabel: { fontSize: 12, color: '#2C1A0E' },
};

// Greyscale map style
const mapStyles = [
  { elementType: 'geometry', stylers: [{ saturation: -100 }, { lightness: 5 }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#666666' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c8d8e0' }, { saturation: -60 }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];
