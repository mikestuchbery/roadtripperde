import { useState, useEffect, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap
} from "react-leaflet";

/* =========================
   Fix Leaflet default icons
========================= */

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

/* =========================
   POI IMPORTS
========================= */

import baden from "./data/baden-wuerttemberg-pois.json";
import bavaria from "./data/bavaria-pois.json";
import berlin from "./data/berlin-pois.json";
import brandenburg from "./data/brandenburg-pois.json";
import bremen from "./data/bremen-pois.json";
import hamburg from "./data/hamburg-pois.json";
import hesse from "./data/hesse-pois.json";
import lowerSaxony from "./data/lower-saxony-pois.json";
import meckpom from "./data/mecklenburg-vorpommern-pois.json";
import nrw from "./data/north-rhine-westphalia-pois.json";
import rlp from "./data/rhineland-palatinate-pois.json";
import saarland from "./data/saarland-pois.json";
import saxony from "./data/saxony-pois.json";
import saxonyAnhalt from "./data/saxony-anhalt-pois.json";
import sh from "./data/schleswig-holstein-pois.json";
import thuringia from "./data/thuringia-pois.json";

/* =========================
   POI Normaliser
========================= */

function asArray(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (Array.isArray(x.pois)) return x.pois;
  if (Array.isArray(x.data)) return x.data;
  return x.name ? [x] : [];
}

const ALL_POIS = [
  ...asArray(baden),   ...asArray(bavaria),  ...asArray(berlin),
  ...asArray(brandenburg), ...asArray(bremen), ...asArray(hamburg),
  ...asArray(hesse),   ...asArray(lowerSaxony), ...asArray(meckpom),
  ...asArray(nrw),     ...asArray(rlp),       ...asArray(saarland),
  ...asArray(saxony),  ...asArray(saxonyAnhalt), ...asArray(sh),
  ...asArray(thuringia)
];

/* =========================
   Distance calculations
========================= */

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function minDistanceToRoute(poi, coords) {
  let min = Infinity;
  let idx = 0;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineKm(
      { lat: poi.lat, lon: poi.lon },
      { lat: coords[i][1], lon: coords[i][0] }
    );
    if (d < min) { min = d; idx = i; }
  }
  return { distance: min, index: idx };
}

/* =========================
   Geocoder
========================= */

async function geocode(place) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(place + ", Germany")}&limit=5`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Location lookup failed");
  const j = await r.json();
  if (!j.features?.length) throw new Error("City not found");
  const [lon, lat] = j.features[0].geometry.coordinates;
  return { lat, lon };
}

/* =========================
   Route API
========================= */

async function getRoute(A, B) {
  const r = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${A.lon},${A.lat};${B.lon},${B.lat}?overview=full&geometries=geojson`
  );
  if (!r.ok) throw new Error("Route failed");
  const data = await r.json();
  return data.routes[0].geometry.coordinates;
}

/* =========================
   Auto-fit map bounds
========================= */

function FitRouteBounds({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (!coords?.length) return;
    map.fitBounds(coords.map(c => [c[1], c[0]]), { padding: [40, 40] });
  }, [coords, map]);
  return null;
}

/* =========================
   Hero Car SVG
   Clean side-profile saloon silhouette, amber on dark.
   Floats gently after page load.
========================= */

function HeroCar() {
  return (
    <div className="hero-car" aria-hidden="true">
      <svg
        viewBox="0 0 260 90"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="hero-car-svg"
      >
        {/* body fill */}
        <path
          d="M22 56 L22 42 Q24 33 44 28 L84 21 Q106 15 128 15 Q153 15 170 21 L204 30 Q222 35 226 43 L228 56 Z"
          fill="#D4913A"
          opacity="0.12"
        />
        {/* body outline */}
        <path
          d="M22 56 L22 42 Q24 33 44 28 L84 21 Q106 15 128 15 Q153 15 170 21 L204 30 Q222 35 226 43 L228 56"
          stroke="#D4913A"
          strokeWidth="1.8"
          strokeLinejoin="round"
          fill="none"
        />
        {/* roofline */}
        <path
          d="M60 28 Q78 12 112 10 Q142 9 164 17 L196 28"
          stroke="#D4913A"
          strokeWidth="1.4"
          fill="none"
          opacity="0.75"
        />
        {/* rear window */}
        <path
          d="M66 28 Q76 13 106 11 L134 11 L136 28 Z"
          fill="#D4913A"
          opacity="0.1"
          stroke="#D4913A"
          strokeWidth="1"
        />
        {/* front window */}
        <path
          d="M138 11 L166 17 L190 28 L138 28 Z"
          fill="#D4913A"
          opacity="0.1"
          stroke="#D4913A"
          strokeWidth="1"
        />
        {/* window pillar */}
        <line x1="136" y1="11" x2="136" y2="28" stroke="#D4913A" strokeWidth="1.3" opacity="0.55" />
        {/* sill line */}
        <line x1="24" y1="56" x2="226" y2="56" stroke="#D4913A" strokeWidth="1.4" opacity="0.55" />
        {/* front end */}
        <path d="M226 43 Q233 47 234 56" stroke="#D4913A" strokeWidth="1.4" fill="none" />
        {/* rear end */}
        <path d="M22 42 Q17 47 16 56" stroke="#D4913A" strokeWidth="1.4" fill="none" />
        {/* front wheel */}
        <circle cx="184" cy="60" r="12" fill="#0f0d0b" stroke="#D4913A" strokeWidth="1.8" />
        <circle cx="184" cy="60" r="5.5" fill="none" stroke="#D4913A" strokeWidth="1" opacity="0.55" />
        <circle cx="184" cy="60" r="1.8" fill="#D4913A" opacity="0.6" />
        {/* rear wheel */}
        <circle cx="66" cy="60" r="12" fill="#0f0d0b" stroke="#D4913A" strokeWidth="1.8" />
        <circle cx="66" cy="60" r="5.5" fill="none" stroke="#D4913A" strokeWidth="1" opacity="0.55" />
        <circle cx="66" cy="60" r="1.8" fill="#D4913A" opacity="0.6" />
        {/* headlight */}
        <ellipse cx="228" cy="47" rx="3.5" ry="2.5" fill="#D4913A" opacity="0.45" />
        {/* tail light */}
        <ellipse cx="19" cy="47" rx="3" ry="2.2" fill="#B84030" opacity="0.55" />
        {/* door line suggestion */}
        <line x1="138" y1="56" x2="144" y2="28" stroke="#D4913A" strokeWidth="0.8" opacity="0.3" />
        {/* dashed road line */}
        <line x1="0" y1="72" x2="260" y2="72" stroke="#D4913A" strokeWidth="0.7" opacity="0.18" strokeDasharray="14 9" />
      </svg>
    </div>
  );
}

/* =========================
   Journey Map
========================= */

function JourneyMap({ routeCoords, stops }) {
  if (!routeCoords?.length) return null;
  return (
    <div className="map-card">
      <div className="map-viewport">
        <MapContainer style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
          <Polyline
            positions={routeCoords.map(c => [c[1], c[0]])}
            pathOptions={{
              color: "#D4913A",
              weight: 3,
              opacity: 0.9,
              dashArray: "8 6",
              lineCap: "round"
            }}
          />
          {stops.map((p, i) => (
            <Marker key={i} position={[p.lat, p.lon]}>
              <Popup>{p.name}</Popup>
            </Marker>
          ))}
          <FitRouteBounds coords={routeCoords} />
        </MapContainer>
      </div>
    </div>
  );
}

/* =========================
   Main App
========================= */

export default function App() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pois, setPois] = useState([]);
  const [routeCoords, setCoords] = useState([]);
  const [visibleCount, setVisible] = useState(8);
  const [loading, setLoading] = useState(false);

  const findStops = async () => {
    if (!start || !end || loading) return;
    setLoading(true);
    setPois([]);
    try {
      const A = await geocode(start);
      const B = await geocode(end);
      const coords = await getRoute(A, B);
      setCoords(coords);
      const seen = new Set();
      const candidates = ALL_POIS.reduce((acc, p) => {
        const lat = p.lat ?? p.latitude;
        const lon = p.lon ?? p.longitude;
        if (lat == null || lon == null) return acc;
        const key = `${lat},${lon}`;
        if (seen.has(key)) return acc;
        const { distance, index } = minDistanceToRoute({ lat, lon }, coords);
        if (distance <= 25) {
          seen.add(key);
          acc.push({ ...p, lat, lon, routeIndex: index });
        }
        return acc;
      }, []).sort((a, b) => a.routeIndex - b.routeIndex);
      setPois(candidates);
      setVisible(8);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const shown = useMemo(() => pois.slice(0, visibleCount), [pois, visibleCount]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; }

        :root {
          --ink:       #0f0d0b;
          --parchment: #F2E9D6;
          --cream:     #FAF5EB;
          --amber:     #D4913A;
          --rust:      #B84030;
          --muted:     #8C7A5E;
          --border:    rgba(140,122,94,0.25);
          --eq: cubic-bezier(0.25, 1, 0.5, 1);
          --ei: cubic-bezier(0.4, 0, 0.2, 1);
        }

        body {
          font-family: 'DM Sans', sans-serif;
          background: var(--parchment);
          margin: 0;
          color: var(--ink);
        }

        /* ── shared entry keyframe ── */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Hero ── */
        .hero {
          text-align: center;
          padding: 48px 24px 0;
          background: var(--ink);
          color: var(--cream);
          position: relative;
          overflow: hidden;
        }

        .hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 70% 55% at 50% 110%, rgba(212,145,58,0.14) 0%, transparent 70%);
          pointer-events: none;
        }

        .hero-eyebrow {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--amber);
          margin: 0 0 14px;
          animation: fadeUp 0.4s var(--eq) both 0.05s;
        }

        .hero h1 {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(2.8rem, 8vw, 5rem);
          font-weight: 600;
          margin: 0 0 10px;
          letter-spacing: -0.01em;
          line-height: 1;
          animation: fadeUp 0.4s var(--eq) both 0.13s;
        }

        .hero-sub {
          font-size: 0.95rem;
          font-weight: 300;
          color: rgba(250,245,235,0.52);
          margin: 0;
          letter-spacing: 0.03em;
          animation: fadeUp 0.4s var(--eq) both 0.21s;
        }

        /* ── Hero car ── */
        .hero-car {
          margin-top: 28px;
          animation: fadeUp 0.5s var(--eq) both 0.32s;
        }

        .hero-car-svg {
          width: 100%;
          max-width: 320px;
          height: auto;
          display: block;
          margin: 0 auto;
          /* gentle idle float, starts after entry */
          animation: carFloat 5s ease-in-out infinite 1.2s;
        }

        @keyframes carFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-5px); }
        }

        /* ── Search panel ── */
        .search-panel {
          padding: 24px 20px;
          background: var(--ink);
          border-top: 1px solid rgba(255,255,255,0.05);
          animation: fadeUp 0.4s var(--eq) both 0.4s;
        }

        .search-panel-inner {
          max-width: 480px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .input-label {
          display: block;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--amber);
          margin-bottom: 5px;
        }

        .search-input {
          width: 100%;
          padding: 13px 16px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.06);
          color: var(--cream);
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          outline: none;
          transition: border-color 0.18s var(--ei), background 0.18s var(--ei);
        }

        .search-input::placeholder { color: rgba(250,245,235,0.26); }

        .search-input:focus {
          border-color: var(--amber);
          background: rgba(212,145,58,0.07);
        }

        .search-btn {
          width: 100%;
          padding: 14px;
          border: none;
          border-radius: 8px;
          background: var(--amber);
          color: var(--ink);
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          cursor: pointer;
          margin-top: 4px;
          transition: background 0.18s var(--ei),
                      transform  0.15s var(--eq),
                      opacity    0.18s;
        }

        .search-btn:hover:not(:disabled) {
          background: #e0a040;
          transform: translateY(-1px);
        }

        .search-btn:active:not(:disabled) { transform: translateY(0); }
        .search-btn:disabled { opacity: 0.44; cursor: not-allowed; }

        /* ── Content ── */
        .content {
          padding: 32px 16px 16px;
          max-width: 960px;
          margin: 0 auto;
        }

        /* ── Welcome ── */
        .welcome {
          background: var(--cream);
          border: 1px solid var(--border);
          padding: 28px 24px;
          border-radius: 12px;
          margin-bottom: 28px;
          text-align: center;
          animation: fadeUp 0.4s var(--eq) both 0.5s;
        }

        .welcome h2 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.55rem;
          font-weight: 600;
          margin: 0 0 10px;
        }

        .welcome p {
          font-size: 0.88rem;
          color: var(--muted);
          margin: 0 0 8px;
          line-height: 1.65;
        }

        .welcome a {
          color: var(--rust);
          text-decoration: none;
          font-size: 0.875rem;
          display: inline-block;
          margin-top: 4px;
          transition: opacity 0.15s;
        }

        .welcome a:hover { opacity: 0.7; }

        /* ── Result header ── */
        .result-header {
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 20px;
          animation: fadeUp 0.35s var(--eq) both;
        }

        .result-header h2 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.5rem;
          font-weight: 600;
          margin: 0;
        }

        .result-count {
          font-size: 0.78rem;
          color: var(--muted);
          letter-spacing: 0.06em;
        }

        /* ── Cards ── */
        .cards {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }

        @media (min-width: 600px) { .cards { grid-template-columns: 1fr 1fr; } }
        @media (min-width: 900px) { .cards { grid-template-columns: 1fr 1fr 1fr; } }

        .card {
          background: var(--cream);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 18px 20px 18px 22px;
          position: relative;
          overflow: hidden;

          opacity: 0;
          transform: translateY(14px);
          animation: fadeUp 0.38s var(--eq) forwards;

          transition: transform    0.22s var(--eq),
                      box-shadow   0.22s var(--eq),
                      border-color 0.18s;
        }

        .card:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 28px rgba(15,13,11,0.09);
          border-color: rgba(212,145,58,0.35);
        }

        /* amber left rule — grows to full height on hover */
        .card::before {
          content: '';
          position: absolute;
          top: 16px; bottom: 16px; left: 0;
          width: 3px;
          background: var(--amber);
          border-radius: 0 2px 2px 0;
          transition: top    0.22s var(--eq),
                      bottom 0.22s var(--eq),
                      border-radius 0.22s var(--eq);
        }

        .card:hover::before {
          top: 0; bottom: 0;
          border-radius: 12px 0 0 12px;
        }

        .card-category {
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--amber);
          margin: 0 0 7px;
        }

        .card h3 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.15rem;
          font-weight: 600;
          margin: 0 0 8px;
          line-height: 1.25;
        }

        .card p {
          font-size: 0.84rem;
          color: var(--muted);
          margin: 0;
          line-height: 1.65;
        }

        /* ── Map ── */
        .map-card {
          height: 340px;
          margin-top: 24px;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid var(--border);
          animation: fadeUp 0.4s var(--eq) both 0.1s;
        }

        .map-viewport { height: 100%; width: 100%; }

        /* ── Load more ── */
        .load-more-wrap { text-align: center; margin-top: 24px; }

        .load-more-btn {
          padding: 11px 28px;
          border: 1px solid var(--amber);
          border-radius: 8px;
          background: transparent;
          color: var(--amber);
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.18s var(--ei),
                      color     0.18s var(--ei),
                      transform 0.15s var(--eq);
        }

        .load-more-btn:hover {
          background: var(--amber);
          color: var(--ink);
          transform: translateY(-1px);
        }

        .load-more-btn:active { transform: translateY(0); }

        /* ── Loading overlay ── */
        .loading-overlay {
          position: fixed;
          inset: 0;
          z-index: 999;
          background: rgba(15, 13, 11, 0.82);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 28px;
          animation: overlayIn 0.3s var(--eq) both;
        }

        @keyframes overlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .loading-label {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(250,245,235,0.4);
          animation: fadeUp 0.4s var(--eq) both 0.2s;
        }

        /* ── Roadmap SVG animation ── */
        .roadmap-svg {
          width: 220px;
          height: 220px;
          animation: fadeUp 0.4s var(--eq) both 0.1s;
        }

        /* route path draw-on */
        .route-path {
          stroke-dasharray: 320;
          stroke-dashoffset: 320;
          animation: drawRoute 2s var(--eq) forwards 0.4s;
        }

        @keyframes drawRoute {
          to { stroke-dashoffset: 0; }
        }

        /* node circles — reveal in sequence after route draws */
        .map-node {
          opacity: 0;
          transform-origin: center;
          transform: scale(0);
          animation: nodeIn 0.3s var(--eq) forwards;
        }

        .map-node-ring {
          opacity: 0;
          animation: ringPulse 2s ease-in-out infinite;
        }

        /* node timings — staggered along the route */
        .node-a        { animation-delay: 0.5s; }
        .node-b        { animation-delay: 1.2s; }
        .node-c        { animation-delay: 1.6s; }
        .node-d        { animation-delay: 2.0s; }
        .node-e        { animation-delay: 2.3s; }

        .ring-a        { animation-delay: 0.9s;  }
        .ring-b        { animation-delay: 1.6s;  }
        .ring-c        { animation-delay: 2.0s;  }
        .ring-d        { animation-delay: 2.4s;  }
        .ring-e        { animation-delay: 2.7s;  }

        @keyframes nodeIn {
          to { opacity: 1; transform: scale(1); }
        }

        @keyframes ringPulse {
          0%   { opacity: 0;    transform: scale(0.6); }
          30%  { opacity: 0.35; transform: scale(1); }
          100% { opacity: 0;    transform: scale(1.6); }
        }

        /* ── Footer ── */
        .footer {
          text-align: center;
          padding: 40px 20px 48px;
          margin-top: 24px;
          border-top: 1px solid var(--border);
        }

        .footer p {
          font-size: 0.875rem;
          color: var(--muted);
          margin: 0 0 6px;
        }

        .footer-email {
          color: var(--rust);
          text-decoration: none;
          font-size: 0.875rem;
          display: inline-block;
          margin-top: 4px;
          transition: opacity 0.15s;
        }

        .footer-email:hover { opacity: 0.7; }

        .footer-copy {
          font-size: 11px;
          color: rgba(140,122,94,0.5);
          margin-top: 12px !important;
          letter-spacing: 0.06em;
        }
      `}</style>

      {/* ── Hero ── */}
      <div className="hero">
        <p className="hero-eyebrow">Germany Road Trip Companion</p>
        <h1>Roadtripper</h1>
        <p className="hero-sub">History &amp; heritage along your route</p>
        <HeroCar />
      </div>

      {/* ── Search ── */}
      <div className="search-panel">
        <div className="search-panel-inner">
          <div>
            <label className="input-label">Start</label>
            <input
              className="search-input"
              placeholder="e.g. München"
              value={start}
              onChange={e => setStart(e.target.value)}
              onKeyDown={e => e.key === "Enter" && findStops()}
            />
          </div>
          <div>
            <label className="input-label">Destination</label>
            <input
              className="search-input"
              placeholder="e.g. Berlin"
              value={end}
              onChange={e => setEnd(e.target.value)}
              onKeyDown={e => e.key === "Enter" && findStops()}
            />
          </div>
          <button
            className="search-btn"
            onClick={findStops}
            disabled={loading}
          >
            {loading ? "Searching…" : "Explore Route"}
          </button>
        </div>
      </div>

      {/* ── Loading overlay (fixed, full-screen) ── */}
      {loading && (
        <div className="loading-overlay">
          <svg
            className="roadmap-svg"
            viewBox="0 0 220 220"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              className="route-path"
              d="M 40 180 C 40 140, 80 160, 110 120 C 140 80, 100 60, 130 40 C 155 25, 175 50, 180 40"
              stroke="#D4913A"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
              opacity="0.6"
            />
            <circle className="map-node-ring ring-e" cx="40" cy="180" r="14" stroke="#D4913A" strokeWidth="1" fill="none" style={{transformOrigin:"40px 180px"}} />
            <circle className="map-node node-e" cx="40" cy="180" r="5" fill="#D4913A" opacity="0.9" style={{transformOrigin:"40px 180px"}} />
            <circle className="map-node node-e" cx="40" cy="180" r="2" fill="#FAF5EB" style={{transformOrigin:"40px 180px", animationDelay:"0.6s"}} />
            <circle className="map-node-ring ring-d" cx="110" cy="120" r="11" stroke="#D4913A" strokeWidth="1" fill="none" style={{transformOrigin:"110px 120px"}} />
            <circle className="map-node node-d" cx="110" cy="120" r="4" fill="#D4913A" opacity="0.75" style={{transformOrigin:"110px 120px"}} />
            <circle className="map-node-ring ring-c" cx="80" cy="155" r="9" stroke="#D4913A" strokeWidth="1" fill="none" style={{transformOrigin:"80px 155px"}} />
            <circle className="map-node node-c" cx="80" cy="155" r="3.5" fill="#D4913A" opacity="0.55" style={{transformOrigin:"80px 155px"}} />
            <circle className="map-node-ring ring-b" cx="130" cy="80" r="9" stroke="#D4913A" strokeWidth="1" fill="none" style={{transformOrigin:"130px 80px"}} />
            <circle className="map-node node-b" cx="130" cy="80" r="3.5" fill="#D4913A" opacity="0.55" style={{transformOrigin:"130px 80px"}} />
            <circle className="map-node-ring ring-a" cx="180" cy="40" r="14" stroke="#D4913A" strokeWidth="1" fill="none" style={{transformOrigin:"180px 40px"}} />
            <circle className="map-node node-a" cx="180" cy="40" r="5" fill="#D4913A" opacity="0.9" style={{transformOrigin:"180px 40px"}} />
            <circle className="map-node node-a" cx="180" cy="40" r="2" fill="#FAF5EB" style={{transformOrigin:"180px 40px", animationDelay:"0.5s"}} />
          </svg>
          <p className="loading-label">Finding history along your route</p>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="content">

        {pois.length === 0 && !loading && (
          <div className="welcome">
            <h2>How it works</h2>
            <p>
              Enter a start and destination anywhere in Germany.<br />
              We'll surface historic sites within 25&nbsp;km of your route.
            </p>
            <p>A labour of love by <strong>Mike Stuchbery</strong></p>
            <a href="mailto:michael.stuchbery@gmail.com" className="footer-email">
              michael.stuchbery@gmail.com
            </a>
            <br />
            <a
              href="https://github.com/mikestuchbery"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-email"
            >
              More tools by Mike →
            </a>
          </div>
        )}

        {shown.length > 0 && (
          <>
            <div className="result-header">
              <h2>Along your route</h2>
              <span className="result-count">{pois.length} sites found</span>
            </div>

            <div className="cards">
              {shown.map((p, i) => (
                <div
                  key={i}
                  className="card"
                  style={{ animationDelay: `${i * 0.055}s` }}
                >
                  {p.category && (
                    <p className="card-category">{p.category}</p>
                  )}
                  <h3>{p.name}</h3>
                  <p>{p.summary}</p>
                </div>
              ))}
            </div>

            {visibleCount < pois.length && (
              <div className="load-more-wrap">
                <button
                  className="load-more-btn"
                  onClick={() => setVisible(v => v + 8)}
                >
                  Load more
                </button>
              </div>
            )}

            <JourneyMap routeCoords={routeCoords} stops={shown} />
          </>
        )}

        <footer className="footer">
          <p>A labour of love by <strong>Mike Stuchbery</strong></p>
          <a href="mailto:michael.stuchbery@gmail.com" className="footer-email">
            michael.stuchbery@gmail.com
          </a>
          <br />
          <a
            href="https://github.com/mikestuchbery"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-email"
          >
            More tools by Mike →
          </a>
          <p className="footer-copy">© 2026 Mike Stuchbery</p>
        </footer>

      </div>
    </>
  );
}
