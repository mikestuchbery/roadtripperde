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

import baden      from "./data/baden-wuerttemberg-pois.json";
import bavaria    from "./data/bavaria-pois.json";
import berlin     from "./data/berlin-pois.json";
import brandenburg from "./data/brandenburg-pois.json";
import bremen     from "./data/bremen-pois.json";
import hamburg    from "./data/hamburg-pois.json";
import hesse      from "./data/hesse-pois.json";
import lowerSaxony from "./data/lower-saxony-pois.json";
import meckpom    from "./data/mecklenburg-vorpommern-pois.json";
import nrw        from "./data/north-rhine-westphalia-pois.json";
import rlp        from "./data/rhineland-palatinate-pois.json";
import saarland   from "./data/saarland-pois.json";
import saxony     from "./data/saxony-pois.json";
import saxonyAnhalt from "./data/saxony-anhalt-pois.json";
import sh         from "./data/schleswig-holstein-pois.json";
import thuringia  from "./data/thuringia-pois.json";

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
  ...asArray(baden),    ...asArray(bavaria),    ...asArray(berlin),
  ...asArray(brandenburg), ...asArray(bremen),  ...asArray(hamburg),
  ...asArray(hesse),    ...asArray(lowerSaxony), ...asArray(meckpom),
  ...asArray(nrw),      ...asArray(rlp),        ...asArray(saarland),
  ...asArray(saxony),   ...asArray(saxonyAnhalt), ...asArray(sh),
  ...asArray(thuringia)
];

/* =========================
   Distance helpers
========================= */

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function minDistanceToRoute(poi, coords) {
  let min = Infinity, idx = 0;
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
   HeroSteps
   Three animated instruction steps replacing the car.
   Each step: icon SVG + label + description, staggered in.
========================= */

const STEPS = [
  {
    icon: (
      <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="14" cy="11" r="6" stroke="#D4913A" strokeWidth="1.5" />
        <path d="M14 17 C14 17 7 22 7 26 L21 26 C21 22 14 17 14 17Z" stroke="#D4913A" strokeWidth="1.5" strokeLinejoin="round" fill="none"/>
        <circle cx="20" cy="20" r="4" fill="#0f0d0b" stroke="#D4913A" strokeWidth="1.2" />
        <path d="M18.5 20 L19.5 21 L21.5 19" stroke="#D4913A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    label: "Choose your route",
    desc:  "Enter any two cities in Germany"
  },
  {
    icon: (
      <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 22 Q8 10 14 8 Q20 6 24 22" stroke="#D4913A" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <circle cx="8"  cy="18" r="2.5" fill="#D4913A" opacity="0.7"/>
        <circle cx="14" cy="10" r="2.5" fill="#D4913A" opacity="0.7"/>
        <circle cx="20" cy="15" r="2.5" fill="#D4913A" opacity="0.7"/>
        <line x1="4" y1="23" x2="24" y2="23" stroke="#D4913A" strokeWidth="1" opacity="0.35" strokeDasharray="3 3"/>
      </svg>
    ),
    label: "We scan the route",
    desc:  "Historic sites within 25 km of your path"
  },
  {
    icon: (
      <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="7" width="20" height="15" rx="2" stroke="#D4913A" strokeWidth="1.5" fill="none"/>
        <line x1="4" y1="11" x2="24" y2="11" stroke="#D4913A" strokeWidth="1" opacity="0.4"/>
        <line x1="8"  y1="15" x2="16" y2="15" stroke="#D4913A" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="8"  y1="18" x2="13" y2="18" stroke="#D4913A" strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
        <circle cx="20" cy="16.5" r="3" stroke="#D4913A" strokeWidth="1.2" fill="none" opacity="0.7"/>
        <path d="M22.2 18.7 L24 20.5" stroke="#D4913A" strokeWidth="1.2" strokeLinecap="round" opacity="0.7"/>
      </svg>
    ),
    label: "Discover history",
    desc:  "Stories from every era, ordered along your way"
  }
];

function HeroSteps() {
  return (
    <div className="hero-steps">
      {STEPS.map((s, i) => (
        <div
          key={i}
          className="hero-step"
          style={{ animationDelay: `${0.32 + i * 0.14}s` }}
        >
          <div className="step-icon">{s.icon}</div>
          <p className="step-label">{s.label}</p>
          <p className="step-desc">{s.desc}</p>
        </div>
      ))}
    </div>
  );
}

/* =========================
   WindscreenHeader
   Shown instead of the plain result header once a search completes.
   SVG: windscreen frame → road vanishing to centre horizon →
        tree silhouettes either side → castle on the horizon.
   Journey cities float in above.
========================= */

function WindscreenHeader({ startCity, endCity, count }) {
  return (
    <div className="windscreen-wrap">

      {/* journey label above screen */}
      <div className="windscreen-journey">
        <span className="wj-city">{startCity}</span>
        <span className="wj-arrow">
          <svg viewBox="0 0 40 12" fill="none" xmlns="http://www.w3.org/2000/svg" width="40" height="12">
            <line x1="0" y1="6" x2="33" y2="6" stroke="#D4913A" strokeWidth="1.2"/>
            <path d="M30 2 L38 6 L30 10" stroke="#D4913A" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
          </svg>
        </span>
        <span className="wj-city">{endCity}</span>
      </div>

      {/* windscreen SVG illustration */}
      <svg
        className="windscreen-svg"
        viewBox="0 0 420 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* sky gradient — dusk tones */}
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#1a1006" />
            <stop offset="100%" stopColor="#3d2408" stopOpacity="0.6"/>
          </linearGradient>
          <linearGradient id="road" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#1a1208" />
            <stop offset="100%" stopColor="#0f0d0b" />
          </linearGradient>
          <radialGradient id="glow" cx="50%" cy="45%" r="35%">
            <stop offset="0%"   stopColor="#D4913A" stopOpacity="0.18"/>
            <stop offset="100%" stopColor="#D4913A" stopOpacity="0"/>
          </radialGradient>
          {/* clip to windscreen shape */}
          <clipPath id="screen">
            <path d="M20 10 Q20 4 30 4 L390 4 Q400 4 400 10 L410 180 Q410 196 395 196 L25 196 Q10 196 10 180 Z"/>
          </clipPath>
        </defs>

        {/* windscreen glass fill */}
        <path
          d="M20 10 Q20 4 30 4 L390 4 Q400 4 400 10 L410 180 Q410 196 395 196 L25 196 Q10 196 10 180 Z"
          fill="url(#sky)"
        />

        {/* horizon glow */}
        <rect x="0" y="0" width="420" height="200" fill="url(#glow)" clipPath="url(#screen)" />

        {/* ── landscape (clipped to screen) ── */}
        <g clipPath="url(#screen)">

          {/* horizon line */}
          <line x1="10" y1="128" x2="410" y2="128" stroke="#D4913A" strokeWidth="0.5" opacity="0.2"/>

          {/* road — two converging lines to VP at (210, 118) */}
          <path d="M10 196 L210 118 L410 196 Z" fill="url(#road)" opacity="0.9"/>

          {/* road centre dashes — animated scroll */}
          <g className="road-dashes">
            <line x1="210" y1="120" x2="200" y2="140" stroke="#D4913A" strokeWidth="1" opacity="0.35" strokeLinecap="round"/>
            <line x1="210" y1="120" x2="197" y2="152" stroke="#D4913A" strokeWidth="1.2" opacity="0.3" strokeLinecap="round"/>
            <line x1="210" y1="120" x2="193" y2="168" stroke="#D4913A" strokeWidth="1.5" opacity="0.25" strokeLinecap="round"/>
            <line x1="210" y1="120" x2="220" y2="140" stroke="#D4913A" strokeWidth="1" opacity="0.35" strokeLinecap="round"/>
            <line x1="210" y1="120" x2="223" y2="152" stroke="#D4913A" strokeWidth="1.2" opacity="0.3" strokeLinecap="round"/>
            <line x1="210" y1="120" x2="227" y2="168" stroke="#D4913A" strokeWidth="1.5" opacity="0.25" strokeLinecap="round"/>
          </g>

          {/* ── castle silhouette on horizon ── */}
          <g className="castle" opacity="0.55">
            {/* main tower */}
            <rect x="196" y="96" width="14" height="24" fill="#C87820" opacity="0.7"/>
            {/* battlements main */}
            <rect x="194" y="92" width="4" height="6" fill="#C87820" opacity="0.7"/>
            <rect x="200" y="92" width="4" height="6" fill="#C87820" opacity="0.7"/>
            <rect x="206" y="92" width="4" height="6" fill="#C87820" opacity="0.7"/>
            {/* left wing */}
            <rect x="178" y="104" width="20" height="16" fill="#C87820" opacity="0.5"/>
            <rect x="176" y="100" width="3" height="5" fill="#C87820" opacity="0.5"/>
            <rect x="181" y="100" width="3" height="5" fill="#C87820" opacity="0.5"/>
            <rect x="186" y="100" width="3" height="5" fill="#C87820" opacity="0.5"/>
            {/* right wing */}
            <rect x="222" y="104" width="20" height="16" fill="#C87820" opacity="0.5"/>
            <rect x="220" y="100" width="3" height="5" fill="#C87820" opacity="0.5"/>
            <rect x="225" y="100" width="3" height="5" fill="#C87820" opacity="0.5"/>
            <rect x="230" y="100" width="3" height="5" fill="#C87820" opacity="0.5"/>
            {/* left tower */}
            <rect x="168" y="96" width="12" height="24" fill="#C87820" opacity="0.55"/>
            <rect x="166" y="92" width="3" height="5" fill="#C87820" opacity="0.55"/>
            <rect x="171" y="92" width="3" height="5" fill="#C87820" opacity="0.55"/>
            <rect x="176" y="92" width="3" height="5" fill="#C87820" opacity="0.55"/>
            {/* right tower */}
            <rect x="240" y="96" width="12" height="24" fill="#C87820" opacity="0.55"/>
            <rect x="238" y="92" width="3" height="5" fill="#C87820" opacity="0.55"/>
            <rect x="243" y="92" width="3" height="5" fill="#C87820" opacity="0.55"/>
            <rect x="248" y="92" width="3" height="5" fill="#C87820" opacity="0.55"/>
            {/* arrow-slit windows */}
            <rect x="202" y="103" width="2" height="6" fill="#0f0d0b" opacity="0.6"/>
            <rect x="173"  y="101" width="2" height="5" fill="#0f0d0b" opacity="0.6"/>
            <rect x="244"  y="101" width="2" height="5" fill="#0f0d0b" opacity="0.6"/>
          </g>

          {/* ── tree silhouettes ── */}
          {/* far left trees */}
          <g opacity="0.5">
            <path d="M60 128 L60 145" stroke="#3a2a10" strokeWidth="2"/>
            <path d="M60 108 L45 128 L75 128 Z" fill="#1e1a0a"/>
            <path d="M60 116 L48 130 L72 130 Z" fill="#252010"/>
          </g>
          <g opacity="0.4">
            <path d="M88 128 L88 142" stroke="#3a2a10" strokeWidth="1.5"/>
            <path d="M88 112 L76 128 L100 128 Z" fill="#1e1a0a"/>
          </g>
          {/* near left */}
          <g opacity="0.75" className="tree-near-l">
            <path d="M30 196 L30 155" stroke="#3a2a10" strokeWidth="3"/>
            <path d="M30 128 L8  160 L52 160 Z"  fill="#1a1608"/>
            <path d="M30 140 L12 165 L48 165 Z"  fill="#201c0a"/>
            <path d="M30 150 L14 170 L46 170 Z"  fill="#252010"/>
          </g>
          <g opacity="0.65" className="tree-near-l2">
            <path d="M75 196 L75 162" stroke="#3a2a10" strokeWidth="2.5"/>
            <path d="M75 140 L58 168 L92 168 Z" fill="#1a1608"/>
            <path d="M75 152 L60 172 L90 172 Z" fill="#201c0a"/>
          </g>
          {/* far right trees */}
          <g opacity="0.5">
            <path d="M360 128 L360 145" stroke="#3a2a10" strokeWidth="2"/>
            <path d="M360 108 L345 128 L375 128 Z" fill="#1e1a0a"/>
            <path d="M360 116 L348 130 L372 130 Z" fill="#252010"/>
          </g>
          <g opacity="0.4">
            <path d="M332 128 L332 142" stroke="#3a2a10" strokeWidth="1.5"/>
            <path d="M332 112 L320 128 L344 128 Z" fill="#1e1a0a"/>
          </g>
          {/* near right */}
          <g opacity="0.75" className="tree-near-r">
            <path d="M390 196 L390 155" stroke="#3a2a10" strokeWidth="3"/>
            <path d="M390 128 L368 160 L412 160 Z" fill="#1a1608"/>
            <path d="M390 140 L372 165 L408 165 Z" fill="#201c0a"/>
            <path d="M390 150 L374 170 L406 170 Z" fill="#252010"/>
          </g>
          <g opacity="0.65" className="tree-near-r2">
            <path d="M345 196 L345 162" stroke="#3a2a10" strokeWidth="2.5"/>
            <path d="M345 140 L328 168 L362 168 Z" fill="#1a1608"/>
            <path d="M345 152 L330 172 L360 172 Z" fill="#201c0a"/>
          </g>

          {/* foreground road edge lines */}
          <line x1="10" y1="196" x2="210" y2="118" stroke="#D4913A" strokeWidth="0.8" opacity="0.18"/>
          <line x1="410" y1="196" x2="210" y2="118" stroke="#D4913A" strokeWidth="0.8" opacity="0.18"/>

        </g>

        {/* windscreen frame border */}
        <path
          d="M20 10 Q20 4 30 4 L390 4 Q400 4 400 10 L410 180 Q410 196 395 196 L25 196 Q10 196 10 180 Z"
          stroke="#D4913A"
          strokeWidth="1.5"
          fill="none"
          opacity="0.35"
        />

        {/* rear-view mirror stub */}
        <rect x="196" y="4" width="28" height="8" rx="2" fill="#1a1006" stroke="#D4913A" strokeWidth="1" opacity="0.5"/>

        {/* wiper — left */}
        <line
          x1="60" y1="190"
          x2="200" y2="135"
          stroke="rgba(212,145,58,0.25)"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="wiper-l"
        />
        {/* wiper — right */}
        <line
          x1="360" y1="190"
          x2="220" y2="135"
          stroke="rgba(212,145,58,0.25)"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="wiper-r"
        />

      </svg>

      {/* count badge */}
      <p className="windscreen-count">
        <span>{count}</span> historic sites along this route
      </p>

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
            pathOptions={{ color: "#D4913A", weight: 3, opacity: 0.9, dashArray: "8 6", lineCap: "round" }}
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
  const [end,   setEnd]   = useState("");
  const [pois,  setPois]  = useState([]);
  const [routeCoords, setCoords] = useState([]);
  const [visibleCount, setVisible] = useState(8);
  const [loading, setLoading] = useState(false);
  // store the cities that were actually searched
  const [searchedStart, setSearchedStart] = useState("");
  const [searchedEnd,   setSearchedEnd]   = useState("");

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
      setSearchedStart(start);
      setSearchedEnd(end);
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

        body { font-family: 'DM Sans', sans-serif; background: var(--parchment); margin: 0; color: var(--ink); }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ══════════════════════════
           HERO
        ══════════════════════════ */
        .hero {
          text-align: center;
          padding: 48px 24px 40px;
          background: var(--ink);
          color: var(--cream);
          position: relative;
          overflow: hidden;
        }

        .hero::before {
          content: '';
          position: absolute; inset: 0;
          background: radial-gradient(ellipse 70% 55% at 50% 110%, rgba(212,145,58,0.13) 0%, transparent 70%);
          pointer-events: none;
        }

        .hero-eyebrow {
          font-size: 10px; font-weight: 500; letter-spacing: 0.22em;
          text-transform: uppercase; color: var(--amber); margin: 0 0 14px;
          animation: fadeUp 0.4s var(--eq) both 0.05s;
        }

        .hero h1 {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(2.8rem, 8vw, 5rem); font-weight: 600;
          margin: 0 0 10px; letter-spacing: -0.01em; line-height: 1;
          animation: fadeUp 0.4s var(--eq) both 0.13s;
        }

        .hero-sub {
          font-size: 0.95rem; font-weight: 300;
          color: rgba(250,245,235,0.5); margin: 0; letter-spacing: 0.03em;
          animation: fadeUp 0.4s var(--eq) both 0.21s;
        }

        /* ══════════════════════════
           HERO STEPS
        ══════════════════════════ */
        .hero-steps {
          display: flex;
          justify-content: center;
          gap: 0;
          margin-top: 36px;
          padding: 0 16px;
          max-width: 560px;
          margin-left: auto;
          margin-right: auto;
        }

        .hero-step {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 0 12px;
          position: relative;
          opacity: 0;
          transform: translateY(10px);
          animation: fadeUp 0.4s var(--eq) forwards;
        }

        /* connector line between steps */
        .hero-step:not(:last-child)::after {
          content: '';
          position: absolute;
          top: 22px;
          right: -2px;
          width: 4px; height: 1px;
          background: rgba(212,145,58,0.3);
        }

        /* extend connector across the gap */
        .hero-step:not(:last-child)::before {
          content: '';
          position: absolute;
          top: 22.5px;
          right: -50%;
          width: 100%;
          height: 1px;
          background: rgba(212,145,58,0.2);
          z-index: 0;
        }

        .step-icon {
          width: 44px; height: 44px;
          border: 1px solid rgba(212,145,58,0.3);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: rgba(212,145,58,0.06);
          margin-bottom: 12px;
          flex-shrink: 0;
          position: relative; z-index: 1;
        }

        .step-icon svg { width: 22px; height: 22px; }

        .step-label {
          font-size: 11px; font-weight: 500; letter-spacing: 0.06em;
          color: var(--cream); margin: 0 0 5px; text-align: center;
        }

        .step-desc {
          font-size: 11px; font-weight: 300;
          color: rgba(250,245,235,0.38); margin: 0;
          line-height: 1.5; text-align: center;
        }

        /* ══════════════════════════
           SEARCH PANEL
        ══════════════════════════ */
        .search-panel {
          padding: 24px 20px;
          background: var(--ink);
          border-top: 1px solid rgba(255,255,255,0.05);
          animation: fadeUp 0.4s var(--eq) both 0.42s;
        }

        .search-panel-inner {
          max-width: 480px; margin: 0 auto;
          display: flex; flex-direction: column; gap: 10px;
        }

        .input-label {
          display: block; font-size: 10px; font-weight: 500;
          letter-spacing: 0.16em; text-transform: uppercase;
          color: var(--amber); margin-bottom: 5px;
        }

        .search-input {
          width: 100%; padding: 13px 16px; border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.06);
          color: var(--cream); font-family: 'DM Sans', sans-serif;
          font-size: 15px; outline: none;
          transition: border-color 0.18s var(--ei), background 0.18s var(--ei);
        }

        .search-input::placeholder { color: rgba(250,245,235,0.26); }
        .search-input:focus { border-color: var(--amber); background: rgba(212,145,58,0.07); }

        .search-btn {
          width: 100%; padding: 14px; border: none; border-radius: 8px;
          background: var(--amber); color: var(--ink);
          font-family: 'DM Sans', sans-serif; font-size: 13px;
          font-weight: 500; letter-spacing: 0.09em; text-transform: uppercase;
          cursor: pointer; margin-top: 4px;
          transition: background 0.18s var(--ei), transform 0.15s var(--eq), opacity 0.18s;
        }

        .search-btn:hover:not(:disabled) { background: #e0a040; transform: translateY(-1px); }
        .search-btn:active:not(:disabled) { transform: translateY(0); }
        .search-btn:disabled { opacity: 0.44; cursor: not-allowed; }

        /* ══════════════════════════
           CONTENT
        ══════════════════════════ */
        .content { padding: 32px 16px 16px; max-width: 960px; margin: 0 auto; }

        /* ══════════════════════════
           WELCOME
        ══════════════════════════ */
        .welcome {
          background: var(--cream); border: 1px solid var(--border);
          padding: 28px 24px; border-radius: 12px; margin-bottom: 28px;
          text-align: center; animation: fadeUp 0.4s var(--eq) both 0.5s;
        }

        .welcome h2 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.55rem; font-weight: 600; margin: 0 0 10px;
        }

        .welcome p { font-size: 0.88rem; color: var(--muted); margin: 0 0 8px; line-height: 1.65; }

        .welcome a {
          color: var(--rust); text-decoration: none;
          font-size: 0.875rem; display: inline-block; margin-top: 4px;
          transition: opacity 0.15s;
        }

        .welcome a:hover { opacity: 0.7; }

        /* ══════════════════════════
           WINDSCREEN HEADER
        ══════════════════════════ */
        .windscreen-wrap {
          margin-bottom: 28px;
          animation: fadeUp 0.45s var(--eq) both;
        }

        .windscreen-journey {
          display: flex; align-items: center; justify-content: center;
          gap: 12px; margin-bottom: 10px;
        }

        .wj-city {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.3rem; font-weight: 600; color: var(--ink);
          letter-spacing: 0.01em;
        }

        .wj-arrow { display: flex; align-items: center; opacity: 0.7; }

        .windscreen-svg {
          width: 100%;
          max-width: 560px;
          height: auto;
          display: block;
          margin: 0 auto;
          border-radius: 16px;
          filter: drop-shadow(0 4px 20px rgba(15,13,11,0.18));
        }

        /* wipers sweep once on mount */
        .wiper-l {
          transform-origin: 60px 190px;
          animation: wipeSweepL 1.2s var(--ei) both 0.3s;
        }

        .wiper-r {
          transform-origin: 360px 190px;
          animation: wipeSweepR 1.2s var(--ei) both 0.3s;
        }

        @keyframes wipeSweepL {
          0%   { transform: rotate(0deg);   opacity: 0; }
          15%  { opacity: 1; }
          50%  { transform: rotate(28deg);  }
          100% { transform: rotate(0deg);   opacity: 0.25; }
        }

        @keyframes wipeSweepR {
          0%   { transform: rotate(0deg);   opacity: 0; }
          15%  { opacity: 1; }
          50%  { transform: rotate(-28deg); }
          100% { transform: rotate(0deg);   opacity: 0.25; }
        }

        /* castle fades up from horizon */
        .castle {
          animation: fadeUp 0.6s var(--eq) both 0.5s;
        }

        .windscreen-count {
          text-align: center; font-size: 0.82rem; color: var(--muted);
          letter-spacing: 0.04em; margin: 10px 0 0;
        }

        .windscreen-count span {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.1rem; font-weight: 600; color: var(--amber);
        }

        /* ══════════════════════════
           CARDS
        ══════════════════════════ */
        .cards { display: grid; grid-template-columns: 1fr; gap: 14px; }

        @media (min-width: 600px) { .cards { grid-template-columns: 1fr 1fr; } }
        @media (min-width: 900px) { .cards { grid-template-columns: 1fr 1fr 1fr; } }

        .card {
          background: var(--cream); border: 1px solid var(--border);
          border-radius: 12px; padding: 18px 20px 18px 22px;
          position: relative; overflow: hidden;
          opacity: 0; transform: translateY(14px);
          animation: fadeUp 0.38s var(--eq) forwards;
          transition: transform 0.22s var(--eq), box-shadow 0.22s var(--eq), border-color 0.18s;
        }

        .card:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(15,13,11,0.09); border-color: rgba(212,145,58,0.35); }

        .card::before {
          content: ''; position: absolute; top: 16px; bottom: 16px; left: 0;
          width: 3px; background: var(--amber); border-radius: 0 2px 2px 0;
          transition: top 0.22s var(--eq), bottom 0.22s var(--eq), border-radius 0.22s var(--eq);
        }

        .card:hover::before { top: 0; bottom: 0; border-radius: 12px 0 0 12px; }

        .card-category {
          font-size: 10px; font-weight: 500; letter-spacing: 0.14em;
          text-transform: uppercase; color: var(--amber); margin: 0 0 7px;
        }

        .card h3 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.15rem; font-weight: 600; margin: 0 0 8px; line-height: 1.25;
        }

        .card p { font-size: 0.84rem; color: var(--muted); margin: 0; line-height: 1.65; }

        /* ══════════════════════════
           MAP
        ══════════════════════════ */
        .map-card {
          height: 340px; margin-top: 24px; border-radius: 12px;
          overflow: hidden; border: 1px solid var(--border);
          animation: fadeUp 0.4s var(--eq) both 0.1s;
        }

        .map-viewport { height: 100%; width: 100%; }

        /* ══════════════════════════
           LOAD MORE
        ══════════════════════════ */
        /* ── New route button ── */
        .new-route-wrap { margin: 0 0 24px; }

        .new-route-btn {
          padding: 9px 18px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: transparent;
          color: var(--muted);
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 400;
          letter-spacing: 0.06em;
          cursor: pointer;
          transition: border-color 0.18s var(--ei),
                      color       0.18s var(--ei),
                      transform   0.15s var(--eq);
        }

        .new-route-btn:hover {
          border-color: var(--amber);
          color: var(--amber);
          transform: translateX(-2px);
        }

        .new-route-btn:active { transform: translateX(0); }

        .load-more-wrap { text-align: center; margin-top: 24px; }

        .load-more-btn {
          padding: 11px 28px; border: 1px solid var(--amber); border-radius: 8px;
          background: transparent; color: var(--amber);
          font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 500;
          letter-spacing: 0.1em; text-transform: uppercase; cursor: pointer;
          transition: background 0.18s var(--ei), color 0.18s var(--ei), transform 0.15s var(--eq);
        }

        .load-more-btn:hover { background: var(--amber); color: var(--ink); transform: translateY(-1px); }
        .load-more-btn:active { transform: translateY(0); }

        /* ══════════════════════════
           LOADING SCREEN
        ══════════════════════════ */
        .lo {
          position: fixed; inset: 0; z-index: 999;
          background: #0f0d0b;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          animation: overlayIn 0.3s var(--eq) both;
          overflow: hidden;
        }

        @keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }

        /* sky */
        .lo-sky {
          position: absolute; inset: 0;
          background: linear-gradient(to bottom, #0c0a08 0%, #1c1005 55%, #3d2008 100%);
        }

        /* stars */
        .lo-stars {
          position: absolute; inset: 0; overflow: hidden;
        }
        .lo-star {
          position: absolute; width: 2px; height: 2px;
          background: #F2E9D6; border-radius: 50%;
          animation: lo-twinkle 2.5s ease-in-out infinite alternate;
        }
        @keyframes lo-twinkle {
          from { opacity: 0.15; }
          to   { opacity: 0.7; }
        }

        /* hills */
        .lo-hills {
          position: absolute; bottom: 38%; left: 0; right: 0; height: 80px;
        }
        .lo-hill {
          position: absolute; bottom: 0; border-radius: 50% 50% 0 0;
          background: #1a1208;
        }
        .lo-hill--a { width: 55%; height: 70px; left: -5%; }
        .lo-hill--b { width: 45%; height: 55px; left: 35%; background: #141008; }
        .lo-hill--c { width: 35%; height: 50px; right: -5%; background: #1e1510; }

        /* trees — two sets that loop */
        .lo-treeline {
          position: absolute; bottom: 38%; left: 0; right: 0; height: 60px;
          display: flex; overflow: hidden;
        }
        .lo-tree {
          flex-shrink: 0; display: flex; flex-direction: column;
          align-items: center; margin-right: 22px;
          animation: lo-trees 1.8s linear infinite;
        }
        @keyframes lo-trees { from { transform: translateX(0); } to { transform: translateX(-100%); } }
        .lo-trunk { width: 5px; height: 14px; background: #2a1e0a; border-radius: 2px; }
        .lo-canopy { width: 22px; height: 40px; background: #1a2208; clip-path: polygon(50% 0%, 0% 100%, 100% 100%); margin-bottom: -2px; }

        /* road */
        .lo-road {
          position: absolute; bottom: 0; left: 0; right: 0; height: 38%;
          background: #181410;
        }
        .lo-road-line {
          position: absolute; top: 50%; left: 0; right: 0; height: 3px;
          background: rgba(212,145,58,0.12);
        }
        .lo-dashes {
          position: absolute; top: 50%; left: 0; right: 0;
          display: flex; transform: translateY(-50%);
          overflow: hidden;
        }
        .lo-dash {
          flex-shrink: 0; width: 52px; height: 4px;
          background: #D4913A; opacity: 0.5; border-radius: 2px; margin-right: 40px;
          animation: lo-road 0.55s linear infinite;
        }
        @keyframes lo-road { from { transform: translateX(92px); } to { transform: translateX(-92px); } }

        /* car */
        .lo-car-wrap {
          position: absolute; bottom: 16%; left: 50%; transform: translateX(-50%);
          animation: lo-bob 0.28s ease-in-out infinite alternate;
        }
        @keyframes lo-bob {
          from { transform: translateX(-50%) translateY(0); }
          to   { transform: translateX(-50%) translateY(-3px); }
        }
        .lo-car-shadow {
          position: absolute; bottom: -5px; left: 50%; transform: translateX(-50%);
          width: 110px; height: 8px; background: rgba(0,0,0,0.5);
          border-radius: 50%; filter: blur(3px);
        }
        .lo-car-body {
          width: 110px; height: 34px; background: #C04830;
          border-radius: 5px; position: relative;
        }
        .lo-car-roof {
          position: absolute; top: -22px; left: 18px;
          width: 64px; height: 26px; background: #A03820;
          border-radius: 8px 8px 0 0;
        }
        .lo-win {
          position: absolute; top: -17px; height: 14px;
          background: rgba(160,210,240,0.8); border-radius: 3px 3px 0 0;
        }
        .lo-win--f { width: 24px; left: 58px; }
        .lo-win--r { width: 22px; left: 24px; }
        .lo-headlight {
          position: absolute; right: 3px; top: 10px;
          width: 7px; height: 8px; background: #FFE880;
          border-radius: 2px; box-shadow: 0 0 8px 3px rgba(255,230,100,0.45);
        }
        .lo-taillight {
          position: absolute; left: 3px; top: 10px;
          width: 6px; height: 8px; background: #FF3020;
          border-radius: 2px; box-shadow: 0 0 6px 2px rgba(255,50,20,0.35);
        }
        .lo-wheel {
          position: absolute; bottom: -10px;
          width: 22px; height: 22px; border-radius: 50%;
          background: #1a1a1a; border: 3px solid #555;
          animation: lo-spin 0.35s linear infinite;
        }
        .lo-wheel--f { right: 12px; }
        .lo-wheel--r { left: 12px; }
        @keyframes lo-spin { to { transform: rotate(360deg); } }

        /* text panel */
        .lo-panel {
          position: absolute; top: 8%; left: 50%; transform: translateX(-50%);
          text-align: center; white-space: nowrap;
        }
        .lo-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: clamp(32px, 8vw, 52px); font-weight: 600;
          color: #F2E9D6; line-height: 1; letter-spacing: -0.01em;
        }
        .lo-title em { font-style: italic; color: #D4913A; }
        .lo-stage {
          font-family: 'DM Sans', sans-serif;
          font-size: 11px; font-weight: 400; letter-spacing: 0.18em;
          text-transform: uppercase; color: rgba(212,145,58,0.7);
          margin-top: 10px;
          animation: lo-pulse 1.4s ease-in-out infinite alternate;
        }
        @keyframes lo-pulse { from { opacity: 0.5; } to { opacity: 1; } }

        /* ══════════════════════════
           FOOTER
        ══════════════════════════ */
        .footer { text-align: center; padding: 40px 20px 48px; margin-top: 24px; border-top: 1px solid var(--border); }
        .footer p { font-size: 0.875rem; color: var(--muted); margin: 0 0 6px; }
        .footer-email { color: var(--rust); text-decoration: none; font-size: 0.875rem; display: inline-block; margin-top: 4px; transition: opacity 0.15s; }
        .footer-email:hover { opacity: 0.7; }
        .footer-copy { font-size: 11px; color: rgba(140,122,94,0.5); margin-top: 12px !important; letter-spacing: 0.06em; }
      `}</style>

      {/* ── Hero ── */}
      <div className="hero">
        <p className="hero-eyebrow">Germany Road Trip Companion</p>
        <h1>Roadtripper</h1>
        <p className="hero-sub">History &amp; heritage along your route</p>
        <HeroSteps />
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
          <button className="search-btn" onClick={findStops} disabled={loading}>
            {loading ? "Searching…" : "Explore Route"}
          </button>
        </div>
      </div>

      {/* ── Loading screen ── */}
      {loading && (
        <div className="lo">
          <div className="lo-sky" />

          {/* stars */}
          <div className="lo-stars">
            {[
              [12,8],[28,15],[45,5],[62,20],[78,10],[90,18],[15,25],[35,30],
              [55,12],[70,28],[82,6],[95,22],[8,35],[25,40],[48,8],[65,35]
            ].map(([l,t],i) => (
              <div key={i} className="lo-star" style={{
                left:`${l}%`, top:`${t}%`,
                animationDelay:`${(i*0.31)%2.5}s`,
                animationDuration:`${2+((i*0.37)%1.5)}s`
              }}/>
            ))}
          </div>

          {/* hills */}
          <div className="lo-hills">
            <div className="lo-hill lo-hill--a"/>
            <div className="lo-hill lo-hill--b"/>
            <div className="lo-hill lo-hill--c"/>
          </div>

          {/* scrolling trees */}
          <div className="lo-treeline">
            {[...Array(16)].map((_,i) => (
              <div key={i} className="lo-tree" style={{
                animationDelay:`${-(i * (1.8/16))}s`,
                marginRight: i % 3 === 0 ? 36 : 18,
                opacity: 0.6 + (i%3)*0.15
              }}>
                <div className="lo-canopy" style={{ height: 28+((i*7)%20)+'px', width: 18+((i*5)%10)+'px' }}/>
                <div className="lo-trunk"/>
              </div>
            ))}
          </div>

          {/* road */}
          <div className="lo-road">
            <div className="lo-road-line"/>
            <div className="lo-dashes">
              {[...Array(10)].map((_,i) => (
                <div key={i} className="lo-dash" style={{ animationDelay:`${-(i*0.45)}s`}}/>
              ))}
            </div>
          </div>

          {/* car */}
          <div className="lo-car-wrap">
            <div className="lo-car-shadow"/>
            <div className="lo-car-body">
              <div className="lo-car-roof"/>
              <div className="lo-win lo-win--r"/>
              <div className="lo-win lo-win--f"/>
              <div className="lo-headlight"/>
              <div className="lo-taillight"/>
              <div className="lo-wheel lo-wheel--r"/>
              <div className="lo-wheel lo-wheel--f"/>
            </div>
          </div>

          {/* title + stage */}
          <div className="lo-panel">
            <div className="lo-title">Road<em>tripper</em></div>
            <div className="lo-stage">Finding history along your route…</div>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="content">

        {pois.length === 0 && !loading && (
          <div className="welcome">
            <h2>How it works</h2>
            <p>Enter a start and destination anywhere in Germany.<br />We'll surface historic sites within 25&nbsp;km of your route.</p>
            <p>A labour of love by <strong>Mike Stuchbery</strong></p>
            <a href="mailto:michael.stuchbery@gmail.com" className="footer-email">michael.stuchbery@gmail.com</a>
            <br />
            <a href="https://github.com/mikestuchbery" target="_blank" rel="noopener noreferrer" className="footer-email">More tools by Mike →</a>
          </div>
        )}

        {shown.length > 0 && (
          <>
            {/* Windscreen results header */}
            <WindscreenHeader
              startCity={searchedStart}
              endCity={searchedEnd}
              count={pois.length}
            />

            {/* Plan another trip */}
            <div className="new-route-wrap">
              <button
                className="new-route-btn"
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  setTimeout(() => {
                    document.querySelector(".search-input")?.focus();
                  }, 500);
                }}
              >
                ← Plan another route
              </button>
            </div>

            <div className="cards">
              {shown.map((p, i) => (
                <div key={i} className="card" style={{ animationDelay: `${i * 0.055}s` }}>
                  {p.category && <p className="card-category">{p.category}</p>}
                  <h3>{p.name}</h3>
                  <p>{p.summary}</p>
                </div>
              ))}
            </div>

            {visibleCount < pois.length && (
              <div className="load-more-wrap">
                <button className="load-more-btn" onClick={() => setVisible(v => v + 8)}>
                  Load more
                </button>
              </div>
            )}

            <JourneyMap routeCoords={routeCoords} stops={shown} />
          </>
        )}

        <footer className="footer">
          <p>A labour of love by <strong>Mike Stuchbery</strong></p>
          <a href="mailto:michael.stuchbery@gmail.com" className="footer-email">michael.stuchbery@gmail.com</a>
          <br />
          <a href="https://github.com/mikestuchbery" target="_blank" rel="noopener noreferrer" className="footer-email">More tools by Mike →</a>
          <p className="footer-copy">© 2026 Mike Stuchbery</p>
        </footer>

      </div>
    </>
  );
}
