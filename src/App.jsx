import React, { useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

/* ========= MAP CARD ========= */
function JourneyMap({ coords, pois, start, end }) {
  if (!coords?.length || !pois?.length) return null;

  const stopParts = pois
    .map(p => `${p.lat ?? p.latitude},${p.lon ?? p.longitude}`)
    .join("/");

  // Fixed the syntax for the full journey URL
  const googleUrl = `https://www.google.com/maps/dir/${encodeURIComponent(start)}/${stopParts}/${encodeURIComponent(end)}`;

  const appleUrl = `https://maps.apple.com/?saddr=${encodeURIComponent(start)}&daddr=${encodeURIComponent(end)}&dirflg=d`;

  const center = coords[Math.floor(coords.length / 2)];

  return (
    <div className="map-card">
      <div className="map-card-header">
        <span className="map-card-icon">◎</span>
        <span>Journey map</span>
      </div>

      <div style={{ height: 300 }}>
        <MapContainer
          style={{ height: "100%" }}
          center={[center[1], center[0]]}
          zoom={6}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution=""
          />

          <Polyline
            positions={coords.map(c => [c[1], c[0]])}
            pathOptions={{
              color: "#B84228",
              weight: 3,
              opacity: 0.85,
              dashArray: "8 5"
            }}
          />

          {pois.map((p, i) => (
            <Marker
              key={i}
              position={[p.lat ?? p.latitude, p.lon ?? p.longitude]}
            />
          ))}
        </MapContainer>
      </div>

      <div className="map-card-footer">
        <a href={googleUrl} target="_blank" rel="noreferrer" className="map-btn map-btn-google">
          Open in Google Maps →
        </a>
        <a href={appleUrl} target="_blank" rel="noreferrer" className="map-btn map-btn-apple">
          Open in Apple Maps →
        </a>
      </div>
    </div>
  );
}

/* ========= KO-FI ========= */
function KofiButton() {
  return (
    <a
      href="https://buymeacoffee.com/mikestuchbery"
      target="_blank"
      rel="noopener noreferrer"
      className="kofi-btn"
    >
      ☕
    </a>
  );
}

/* ========= APP ========= */
export default function App() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pois, setPois] = useState([]);
  const [coords, setCoords] = useState([]);
  const [visibleCount, setVisibleCount] = useState(8);
  const [loading, setLoading] = useState(false);

  async function geocode(place) {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}`
    );
    const j = await r.json();
    return { lat: +j[0].lat, lon: +j[0].lon };
  }

  async function route(a, b) {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`
    );
    const j = await r.json();
    return j.routes[0].geometry.coordinates;
  }

  async function findStops() {
    if (!start || !end) return;
    setLoading(true);
    setPois([]);
    setCoords([]);

    try {
      const A = await geocode(start);
      const B = await geocode(end);
      const routeCoords = await route(A, B);
      setCoords(routeCoords);

      // Note: ALL_POIS, minDistanceToRoute, routePosition, and haversineKm 
      // are assumed to be defined in your global scope or a separate file.
      const near = ALL_POIS
        .map((p) => {
          const lat = p.lat ?? p.latitude;
          const lon = p.lon ?? p.longitude;
          if (!lat || !lon) return null;

          const dist = minDistanceToRoute({ lat, lon }, routeCoords);
          if (dist > 25) return null;

          return {
            ...p,
            lat,
            lon,
            pos: routePosition({ lat, lon }, routeCoords)
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.pos - b.pos);

      const routeKm = haversineKm(A, B);
      setPois(near);
      setVisibleCount(routeKm < 100 ? 4 : 8);
    } catch (e) {
      alert(e.message);
    }
    setLoading(false);
  }

  const handleKey = (e) => {
    if (e.key === "Enter") findStops();
  };

  const shown = pois.slice(0, visibleCount);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Libre+Baskerville:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background-color: #EDE4CF;
          background-image:
            radial-gradient(ellipse at 15% 0%, rgba(184,147,90,0.12) 0%, transparent 55%),
            radial-gradient(ellipse at 85% 100%, rgba(120,75,35,0.08) 0%, transparent 55%);
          min-height: 100vh;
        }

        .page {
          max-width: 600px;
          margin: 0 auto;
          padding: 0 20px 80px;
          font-family: 'DM Sans', sans-serif;
        }

        .header { padding: 48px 0 32px; text-align: center; }
        .eyebrow { font-size: 10.5px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; color: #9A7A48; margin-bottom: 10px; }
        .headline { font-family: 'Playfair Display', serif; font-size: 56px; font-weight: 700; color: #241A0C; letter-spacing: -0.015em; line-height: 1.05; }
        .header-rule { height: 1px; background: linear-gradient(to right, transparent, #C4A870, transparent); margin-top: 20px; }

        .search-area { margin-bottom: 40px; display: flex; flex-direction: column; gap: 12px; }
        .input-group { display: flex; gap: 8px; }
        input { flex: 1; padding: 12px; border: 1px solid #C4A870; background: #FFF9ED; border-radius: 4px; font-family: 'DM Sans', sans-serif; }
        .plan-btn { padding: 12px 24px; background: #B84228; color: #FFF; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; }

        .map-card { background: #FFF9ED; border-radius: 8px; border: 1px solid #C4A870; overflow: hidden; margin-bottom: 32px; }
        .map-card-header { padding: 12px 16px; border-bottom: 1px solid #E6DCC3; display: flex; align-items: center; gap: 8px; font-size: 12px; text-transform: uppercase; color: #7A6040; letter-spacing: 0.1em; }
        .map-card-footer { padding: 16px; display: flex; gap: 12px; border-top: 1px solid #E6DCC3; }
        .map-btn { font-size: 12px; text-decoration: none; color: #B84228; font-weight: 600; }

        .site-list { display: flex; flex-direction: column; gap: 24px; }
        .site-card { background: #FFF9ED; padding: 24px; border-radius: 8px; border-left: 4px solid #B84228; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .site-name { font-family: 'Playfair Display', serif; font-size: 24px; margin-bottom: 8px; color: #241A0C; }
        .site-desc { color: #5C4B37; line-height: 1.6; font-size: 15px; }

        /* Site-specific map links */
        .site-links { margin-top: 16px; padding-top: 12px; border-top: 1px solid #E6DCC3; display: flex; gap: 12px; }
        .site-map-link { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #B84228; text-decoration: none; font-weight: 600; }
        .site-map-link:hover { text-decoration: underline; }

        .kofi-btn { position: fixed; bottom: 20px; right: 20px; background: #29abe0; color: white; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; text-decoration: none; font-size: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); z-index: 1000; }
      `}</style>

      <div className="page">
        <header className="header">
          <div className="eyebrow">Wayfinder</div>
          <h1 className="headline">Historical Journey</h1>
          <div className="header-rule"></div>
        </header>

        <div className="search-area">
          <div className="input-group">
            <input 
              placeholder="Starting city..." 
              value={start} 
              onChange={e => setStart(e.target.value)}
              onKeyDown={handleKey}
            />
            <input 
              placeholder="Destination..." 
              value={end} 
              onChange={e => setEnd(e.target.value)}
              onKeyDown={handleKey}
            />
          </div>
          <button className="plan-btn" onClick={findStops}>
            {loading ? "Calculating..." : "Map Journey"}
          </button>
        </div>

        <JourneyMap coords={coords} pois={pois} start={start} end={end} />

        <div className="site-list">
          {shown.map((p, i) => {
            const lat = p.lat ?? p.latitude;
            const lon = p.lon ?? p.longitude;
            const siteGoogle = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
            const siteApple = `https://maps.apple.com/?q=${encodeURIComponent(p.name)}&ll=${lat},${lon}`;

            return (
              <div key={i} className="site-card">
                <h2 className="site-name">{p.name}</h2>
                <p className="site-desc">{p.description}</p>
                <div className="site-links">
                  <a href={siteGoogle} target="_blank" rel="noreferrer" className="site-map-link">Google Maps</a>
                  <a href={siteApple} target="_blank" rel="noreferrer" className="site-map-link">Apple Maps</a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <KofiButton />
    </>
  );
}
