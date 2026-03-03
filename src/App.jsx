import { useState, useEffect } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/* ========= IMPORT POIS ========= */
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

function asArray(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (Array.isArray(x.pois)) return x.pois;
  if (Array.isArray(x.data)) return x.data;
  if (x.name) return [x];
  return [];
}

const ALL_POIS = [
  ...asArray(baden), ...asArray(bavaria), ...asArray(berlin),
  ...asArray(brandenburg), ...asArray(bremen), ...asArray(hamburg),
  ...asArray(hesse), ...asArray(lowerSaxony), ...asArray(meckpom),
  ...asArray(nrw), ...asArray(rlp), ...asArray(saarland),
  ...asArray(saxony), ...asArray(saxonyAnhalt), ...asArray(sh),
  ...asArray(thuringia),
];

/* ========= GEO ========= */
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function minDistanceToRoute(poi, coords) {
  // poi must have numeric lat/lon — guard defensively
  if (poi.lat == null || poi.lon == null || isNaN(poi.lat) || isNaN(poi.lon)) {
    return { distance: Infinity, index: 0 };
  }
  let min = Infinity, idx = 0;
  coords.forEach((c, i) => {
    if (!c || c[0] == null || c[1] == null) return;
    const d = haversineKm({ lat: poi.lat, lon: poi.lon }, { lat: c[1], lon: c[0] });
    if (d < min) { min = d; idx = i; }
  });
  return { distance: min, index: idx };
}

/* ========= WIKI IMAGE ========= */
async function fetchWikiImage(title) {
  try {
    const s = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title)}&format=json&origin=*`);
    const sj = await s.json();
    const page = sj.query.search[0];
    if (!page) return null;
    const p = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(page.title)}&prop=pageimages&pithumbsize=900&format=json&origin=*`);
    const pj = await p.json();
    const pg = Object.values(pj.query.pages)[0];
    return pg.thumbnail?.source || null;
  } catch { return null; }
}

/* ========= DRIVING SCENE ========= */
function DrivingScene() {
  return (
    <div className="scene" aria-hidden="true">
      <div className="scene-sky">
        <div className="scene-sun" />
        <div className="scene-cloud scene-cloud--a" />
        <div className="scene-cloud scene-cloud--b" />
        <div className="scene-cloud scene-cloud--c" />
      </div>
      <div className="scene-hill scene-hill--far" />
      <div className="scene-hill scene-hill--near" />
      <div className="scene-treeline">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="scene-tree" style={{ animationDelay: `${(i * -0.9).toFixed(1)}s` }}>
            <div className="scene-trunk" />
            <div className="scene-canopy" />
          </div>
        ))}
      </div>
      <div className="scene-road">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="scene-dash" style={{ animationDelay: `${(i * -0.45).toFixed(2)}s` }} />
        ))}
      </div>
      <div className="scene-car">
        <div className="scene-car-body">
          <div className="scene-car-roof" />
          <div className="scene-win scene-win--rear" />
          <div className="scene-win scene-win--front" />
          <div className="scene-headlight" />
        </div>
        <div className="scene-wheel scene-wheel--rear" />
        <div className="scene-wheel scene-wheel--front" />
        <div className="scene-puff scene-puff--a" />
        <div className="scene-puff scene-puff--b" />
      </div>
    </div>
  );
}

/* ========= CARD ========= */
function Card({ poi, index }) {
  const name    = poi.name ?? poi.title ?? "Site";
  const era     = poi.era ?? poi.century ?? "";
  const type    = poi.type ?? poi.category ?? "";
  const summary = poi.summary ?? poi.description ?? "";
  const [img, setImg]       = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { fetchWikiImage(name).then(setImg); }, [name]);

  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(name)}`;

  return (
    <div className="card" style={{ animationDelay: `${index * 0.06}s` }}>
      {img ? (
        <div className="card-hero">
          <img
            src={img} alt={name}
            className={`card-hero-img${loaded ? " card-hero-img--in" : ""}`}
            onLoad={() => setLoaded(true)}
          />
          <div className="card-hero-fade" />
          <div className="card-hero-num">{index + 1}</div>
        </div>
      ) : (
        <div className="card-noimg-num">{index + 1}</div>
      )}
      <div className="card-body">
        <div className="card-pills">
          {type && <span className="pill">{type}</span>}
          {era  && <span className="pill pill--era">{era}</span>}
        </div>
        <h2 className="card-title">{name}</h2>
        {summary && <p className="card-summary">{summary}</p>}
        <a href={wikiUrl} target="_blank" rel="noreferrer" className="card-link">
          More info →
        </a>
      </div>
    </div>
  );
}

/* ========= JOURNEY MAP ========= */
function JourneyMap({ routeCoords, stops, startName, endName }) {
  if (!routeCoords?.length || !stops?.length) return null;

  // Centre on the midpoint of the route
  const mid = routeCoords[Math.floor(routeCoords.length / 2)];

  // Google Maps: start / waypoints / end
  // Waypoints are the stops in between (all except start/end cities which are separate)
  const waypointStr = stops
    .map(p => `${p.lat},${p.lon}`)
    .join("|");
  const googleUrl =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${encodeURIComponent(startName)}` +
    `&destination=${encodeURIComponent(endName)}` +
    `&waypoints=${encodeURIComponent(waypointStr)}` +
    `&travelmode=driving`;

  // Apple Maps: chain daddr with `+to:` for multi-stop
  // Format: saddr -> first stop -> ... -> endName
  const allPoints = [startName, ...stops.map(p => `${p.lat},${p.lon}`), endName];
  const appleUrl =
    `https://maps.apple.com/?saddr=${encodeURIComponent(allPoints[0])}` +
    allPoints.slice(1).map(pt => `&daddr=${encodeURIComponent(pt)}`).join("") +
    `&dirflg=d`;

  return (
    <div className="map-card">
      <div className="map-card-header">
        <span className="map-card-icon">◎</span>
        <span>Journey map</span>
      </div>

      {/* Leaflet map — full bleed */}
      <div className="map-viewport">
        <MapContainer
          style={{ height: "100%", width: "100%" }}
          center={[mid[1], mid[0]]}
          zoom={6}
          scrollWheelZoom={false}
          zoomControl={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution=""
          />
          {/* Route polyline */}
          <Polyline
            positions={routeCoords.map(c => [c[1], c[0]])}
            pathOptions={{ color: "#C04830", weight: 3, opacity: 0.85, dashArray: "8 5" }}
          />
          {/* Stop markers with popup name */}
          {stops.map((p, i) => (
            <Marker key={i} position={[p.lat, p.lon]}>
              <Popup>{p.name ?? p.title ?? "Stop"}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Map action buttons */}
      <div className="map-card-footer">
        <a href={googleUrl} target="_blank" rel="noreferrer" className="maps-btn maps-btn--google">
          Open in Google Maps →
        </a>
        <a href={appleUrl} target="_blank" rel="noreferrer" className="maps-btn maps-btn--apple">
          Open in Apple Maps →
        </a>
      </div>
    </div>
  );
}

/* ========= APP ========= */
export default function App() {
  const [start, setStart]          = useState("");
  const [end, setEnd]              = useState("");
  const [pois, setPois]            = useState([]);
  const [routeCoords, setCoords]   = useState([]);
  const [visibleCount, setVisible] = useState(8);
  const [loading, setLoading]      = useState(false);
  const [hasSearched, setSearched] = useState(false);

  async function geocode(place) {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}`);
    const j = await r.json();
    return { lat: +j[0].lat, lon: +j[0].lon };
  }

  async function fetchRoute(a, b) {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`);
    const j = await r.json();
    return j.routes[0].geometry.coordinates; // [lon, lat] pairs
  }

  async function findStops() {
    if (!start || !end) return;
    setLoading(true); setPois([]); setCoords([]); setSearched(true);
    try {
      const A = await geocode(start);
      const B = await geocode(end);
      const coords = await fetchRoute(A, B);
      setCoords(coords);

      const candidates = [];
      ALL_POIS.forEach(p => {
        const lat = parseFloat(p.lat ?? p.latitude);
        const lon = parseFloat(p.lon ?? p.longitude);
        if (!isFinite(lat) || !isFinite(lon)) return;
        const { distance, index } = minDistanceToRoute({ lat, lon }, coords);
        if (distance <= 25) candidates.push({ ...p, lat, lon, routeIndex: index });
      });

      candidates.sort((a, b) => a.routeIndex - b.routeIndex);
      const routeKm = haversineKm(A, B);
      setPois(candidates);
      setVisible(routeKm < 100 ? 4 : 8);
    } catch (e) { alert(e.message); }
    setLoading(false);
  }

  const onKey = e => { if (e.key === "Enter") findStops(); };
  const shown = pois.slice(0, visibleCount);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lora:ital,wght@0,400;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { font-size: 16px; -webkit-tap-highlight-color: transparent; }
        body {
          font-family: 'DM Sans', sans-serif;
          background: #E8DEC6;
          min-height: 100dvh;
          overscroll-behavior: none;
        }
        .page {
          min-height: 100dvh;
          padding-bottom: env(safe-area-inset-bottom, 24px);
        }

        /* ── HERO ── */
        .hero {
          background: #1C1208;
          padding: 52px 20px 0;
          position: relative;
          overflow: hidden;
        }
        .hero::before {
          content: '';
          position: absolute; inset: 0;
          background:
            radial-gradient(ellipse at 30% 0%, rgba(184,130,50,.22) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 80%, rgba(120,60,20,.18) 0%, transparent 50%);
          pointer-events: none;
        }
        .hero-eyebrow {
          font-size: 10px; font-weight: 500; letter-spacing: .26em;
          text-transform: uppercase; color: #B8924A;
          text-align: center; margin-bottom: 10px; position: relative;
        }
        .hero-title {
          font-family: 'Playfair Display', serif;
          font-size: clamp(48px, 13vw, 72px);
          font-weight: 700; color: #F5EDDA;
          text-align: center; letter-spacing: -.02em; line-height: .95;
          position: relative;
        }
        .hero-title em { font-style: italic; color: #D4A050; }
        .hero-sub {
          font-family: 'Lora', serif; font-style: italic;
          font-size: 14px; color: #9A8060;
          text-align: center; margin-top: 10px; position: relative;
        }

        /* ── DRIVING SCENE ── */
        .scene {
          position: relative; height: 100px;
          overflow: hidden; margin-top: 20px;
        }
        .scene-sky {
          position: absolute; inset: 0;
          background: linear-gradient(180deg, #7AAECC 0%, #B8D8EC 50%, #D4A84A 100%);
        }
        .scene-sun {
          position: absolute; top: 10px; right: 48px;
          width: 20px; height: 20px; border-radius: 50%;
          background: radial-gradient(circle, #FFE860 20%, #FFB020 100%);
          box-shadow: 0 0 18px 6px rgba(255,190,40,.5);
        }
        .scene-cloud {
          position: absolute; background: rgba(255,255,255,.82);
          border-radius: 40px; animation: cloud linear infinite;
        }
        .scene-cloud::before, .scene-cloud::after {
          content: ''; position: absolute;
          background: rgba(255,255,255,.82); border-radius: 50%;
        }
        .scene-cloud--a { width: 58px; height: 14px; top: 12px; animation-duration: 15s; animation-delay: -3s; }
        .scene-cloud--a::before { width: 26px; height: 20px; top: -11px; left: 9px; }
        .scene-cloud--a::after  { width: 18px; height: 16px; top: -7px;  left: 26px; }
        .scene-cloud--b { width: 44px; height: 12px; top: 20px; animation-duration: 21s; animation-delay: -9s; }
        .scene-cloud--b::before { width: 20px; height: 17px; top: -9px; left: 7px; }
        .scene-cloud--b::after  { width: 15px; height: 13px; top: -6px; left: 20px; }
        .scene-cloud--c { width: 50px; height: 13px; top: 8px; animation-duration: 18s; animation-delay: -13s; }
        .scene-cloud--c::before { width: 22px; height: 18px; top: -10px; left: 11px; }
        .scene-cloud--c::after  { width: 16px; height: 14px; top: -6px;  left: 26px; }
        @keyframes cloud { from { transform: translateX(120vw); } to { transform: translateX(-200px); } }
        .scene-hill { position: absolute; border-radius: 50%; bottom: 28px; }
        .scene-hill--far  { width: 55vw; height: 70px; background: #6A9A58; animation: hill-far 11s linear infinite; }
        .scene-hill--near { width: 42vw; height: 52px; background: #507A40; animation: hill-near 7.5s linear infinite; bottom: 27px; }
        @keyframes hill-far  { from { left: 110%; } to { left: -60%; } }
        @keyframes hill-near { from { left: 110%; } to { left: -50%; } }
        .scene-treeline { position: absolute; bottom: 26px; left: 0; right: 0; height: 44px; }
        .scene-tree { position: absolute; bottom: 0; animation: tree 3.2s linear infinite; }
        @keyframes tree { from { left: 110%; } to { left: -30px; } }
        .scene-trunk  { width: 5px; height: 12px; background: #5A3C18; margin: 0 auto; border-radius: 2px; }
        .scene-canopy { width: 0; height: 0; border-left: 11px solid transparent; border-right: 11px solid transparent; border-bottom: 24px solid #2A6020; position: absolute; top: -17px; left: -8px; }
        .scene-canopy::after { content: ''; position: absolute; width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent; border-bottom: 18px solid #347028; top: -7px; left: -8px; }
        .scene-road { position: absolute; bottom: 0; left: 0; right: 0; height: 28px; background: linear-gradient(180deg, #7A7A7A 0%, #686868 100%); border-top: 2px solid #929292; display: flex; align-items: center; overflow: hidden; }
        .scene-dash { flex-shrink: 0; width: 36px; height: 3px; background: #F0D840; border-radius: 2px; margin-right: 28px; animation: dash .65s linear infinite; }
        @keyframes dash { from { transform: translateX(64px); } to { transform: translateX(-64px); } }
        .scene-car { position: absolute; bottom: 8px; left: 26%; animation: bob .32s ease-in-out infinite alternate; }
        @keyframes bob { from { transform: translateY(0); } to { transform: translateY(-2px); } }
        .scene-car-body { position: relative; width: 64px; height: 20px; background: #C04830; border-radius: 3px 4px 2px 2px; }
        .scene-car-roof { position: absolute; top: -13px; left: 10px; width: 38px; height: 15px; background: #A03820; border-radius: 5px 5px 0 0; }
        .scene-win { position: absolute; top: -10px; height: 9px; background: rgba(160,210,240,.88); border-radius: 2px 2px 0 0; }
        .scene-win--front { width: 14px; left: 34px; }
        .scene-win--rear  { width: 13px; left: 16px; }
        .scene-headlight { position: absolute; right: 2px; top: 6px; width: 4px; height: 5px; background: #FFE880; border-radius: 1px; box-shadow: 0 0 6px 2px rgba(255,230,80,.6); }
        .scene-wheel { position: absolute; bottom: -6px; width: 13px; height: 13px; border-radius: 50%; background: #1A1A1A; border: 2px solid #444; animation: spin .38s linear infinite; }
        .scene-wheel--front { right: 7px; } .scene-wheel--rear { left: 7px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .scene-puff { position: absolute; border-radius: 50%; background: rgba(210,210,210,.5); animation: puff .65s ease-out infinite; }
        .scene-puff--a { width: 9px; height: 9px; bottom: 4px; left: -9px; }
        .scene-puff--b { width: 6px; height: 6px; bottom: 6px; left: -16px; animation-delay: .32s; }
        @keyframes puff { 0% { opacity: .7; transform: scale(.5) translateX(0); } 100% { opacity: 0; transform: scale(1.8) translateX(-12px); } }

        /* ── SEARCH ── */
        .search-panel {
          background: #1C1208;
          padding: 20px 20px 28px;
        }
        .search-label { font-size: 9.5px; font-weight: 500; letter-spacing: .22em; text-transform: uppercase; color: #7A6035; margin-bottom: 12px; }
        .search-inputs { display: flex; flex-direction: column; margin-bottom: 14px; border-radius: 10px; overflow: hidden; border: 1.5px solid #3A2A10; }
        .search-input-wrap { position: relative; display: flex; align-items: center; background: #261C0C; }
        .search-input-wrap + .search-input-wrap { border-top: 1px solid #3A2A10; }
        .search-input-icon { padding: 0 4px 0 16px; color: #B8924A; font-size: 12px; flex-shrink: 0; }
        .search-input { flex: 1; padding: 15px 14px 15px 6px; background: transparent; border: none; font-family: 'DM Sans', sans-serif; font-size: 16px; color: #F0E4C8; outline: none; }
        .search-input::placeholder { color: #5A4828; font-style: italic; }
        .search-btn { width: 100%; padding: 16px; border: none; border-radius: 10px; background: #C04830; color: #FFF4E0; font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 500; letter-spacing: .06em; cursor: pointer; transition: background .18s, transform .12s; -webkit-appearance: none; touch-action: manipulation; }
        .search-btn:active { background: #A03820; transform: scale(.98); }

        /* ── CONTENT ── */
        .content { padding: 24px 16px 0; }

        /* ── LOADING ── */
        .loading { display: flex; flex-direction: column; align-items: center; padding: 56px 0; gap: 16px; }
        .loading-text { font-family: 'Lora', serif; font-style: italic; font-size: 16px; color: #8A7040; }
        .loading-dots { display: flex; gap: 7px; }
        .loading-dot { width: 9px; height: 9px; border-radius: 50%; background: #B8924A; animation: dotpulse 1.2s ease-in-out infinite; }
        @keyframes dotpulse { 0%, 100% { opacity: .2; transform: scale(.7); } 50% { opacity: 1; transform: scale(1.2); } }

        /* ── RESULTS HEADER ── */
        .results-header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
        .results-rule { flex: 1; height: 1px; background: #C8B888; }
        .results-count { font-size: 9.5px; font-weight: 500; letter-spacing: .2em; text-transform: uppercase; color: #8A7040; white-space: nowrap; }

        /* ── CARD ── */
        @keyframes cardIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .card { background: #FAF4E4; border-radius: 14px; overflow: hidden; margin-bottom: 16px; box-shadow: 0 2px 12px rgba(30,16,4,.1), 0 1px 3px rgba(30,16,4,.07); animation: cardIn .42s ease both; outline: 1px solid rgba(180,150,80,.18); }
        .card-hero { position: relative; height: 220px; overflow: hidden; }
        .card-hero-img { width: 100%; height: 100%; object-fit: cover; display: block; opacity: 0; transition: opacity .5s ease, transform .4s ease; transform: scale(1.04); }
        .card-hero-img--in { opacity: 1; transform: scale(1); }
        .card-hero-fade { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 40%, rgba(20,10,2,.55) 100%); }
        .card-hero-num { position: absolute; top: 12px; left: 12px; width: 30px; height: 30px; border-radius: 50%; background: rgba(20,10,2,.72); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); border: 1.5px solid rgba(255,255,255,.15); color: #F0DCA8; font-size: 12px; font-weight: 500; display: flex; align-items: center; justify-content: center; }
        .card-noimg-num { width: 32px; height: 32px; border-radius: 50%; background: #1C1208; color: #F0DCA8; font-size: 12px; font-weight: 500; display: flex; align-items: center; justify-content: center; margin: 16px 16px 0; }
        .card-body { padding: 14px 16px 18px; }
        .card-pills { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
        .pill { background: #EEE0BA; color: #6A4E1A; border: 1px solid #D8C890; padding: 3px 8px; font-size: 9px; font-weight: 500; letter-spacing: .1em; text-transform: uppercase; border-radius: 4px; }
        .pill--era { background: #F4ECD4; color: #8A6428; }
        .card-title { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 700; color: #1C1208; line-height: 1.15; letter-spacing: -.01em; margin-bottom: 8px; }
        .card-summary { font-size: 14px; line-height: 1.65; color: #5A4228; margin-bottom: 14px; }
        .card-link { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 500; color: #C04830; text-decoration: none; letter-spacing: .02em; padding: 9px 16px; background: rgba(192,72,48,.08); border-radius: 8px; transition: background .15s; touch-action: manipulation; }
        .card-link:active { background: rgba(192,72,48,.18); }

        /* ── LOAD MORE ── */
        .load-more { width: 100%; padding: 16px; background: transparent; border: 1.5px dashed #C8B070; border-radius: 12px; color: #8A7040; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500; cursor: pointer; margin-bottom: 16px; transition: background .18s; touch-action: manipulation; -webkit-appearance: none; }
        .load-more:active { background: rgba(200,176,112,.12); }

        /* ── MAP CARD ── */
        .map-card {
          background: #FAF4E4;
          border-radius: 14px;
          overflow: hidden;
          margin-bottom: 16px;
          box-shadow: 0 2px 12px rgba(30,16,4,.1);
          outline: 1px solid rgba(180,150,80,.18);
        }
        .map-card-header {
          padding: 13px 16px;
          border-bottom: 1px solid #E8D8A8;
          font-size: 9.5px; font-weight: 500;
          letter-spacing: .2em; text-transform: uppercase;
          color: #8A7040;
          display: flex; align-items: center; gap: 8px;
        }
        .map-card-icon { color: #B8924A; font-size: 14px; }
        .map-viewport {
          height: 280px;
          width: 100%;
        }
        /* Override Leaflet's default z-index so it doesn't escape the card */
        .map-viewport .leaflet-container { height: 100%; width: 100%; }
        .map-card-footer {
          padding: 14px 16px;
          border-top: 1px solid #E8D8A8;
          display: flex; flex-direction: column; gap: 8px;
        }
        .maps-btn {
          display: block; text-align: center;
          padding: 13px 16px; border-radius: 9px;
          font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500;
          text-decoration: none; letter-spacing: .03em;
          transition: opacity .15s; touch-action: manipulation;
        }
        .maps-btn:active { opacity: .8; }
        .maps-btn--google { background: #C04830; color: #FFF4E0; }
        .maps-btn--apple  { background: #2E2010; color: #D4B870; border: 1px solid #3A2A10; }

        /* ── FOOTER ── */
        .footer { padding: 32px 16px calc(32px + env(safe-area-inset-bottom, 0px)); text-align: center; }
        .footer-rule { height: 1px; background: linear-gradient(90deg, transparent, #C4A860, transparent); margin-bottom: 20px; }
        .footer-road { font-size: 11px; font-weight: 400; letter-spacing: .12em; text-transform: uppercase; color: #9A8050; margin-bottom: 14px; }
        .footer-love { font-family: 'Lora', serif; font-style: italic; font-size: 15px; color: #7A6035; margin-bottom: 8px; line-height: 1.5; }
        .footer-love strong { font-style: normal; font-weight: 700; color: #2A1C08; }
        .footer-email { font-size: 13px; color: #C04830; text-decoration: none; border-bottom: 1px solid rgba(192,72,48,.3); padding-bottom: 1px; }
        .footer-copy { margin-top: 10px; font-size: 11px; color: #A89060; letter-spacing: .05em; }
        .footer-data { margin-top: 12px; font-size: 10px; letter-spacing: .08em; color: #A89060; }

        /* ── WELCOME PANEL ── */
        .welcome {
          background: #FAF4E4;
          border-radius: 14px;
          padding: 24px 20px 22px;
          margin-bottom: 16px;
          outline: 1px solid rgba(180,150,80,.18);
          box-shadow: 0 2px 12px rgba(30,16,4,.08);
        }
        .welcome-icon { font-size: 32px; text-align: center; margin-bottom: 12px; }
        .welcome-heading {
          font-family: 'Playfair Display', serif;
          font-size: 20px; font-weight: 700;
          color: #1C1208; text-align: center;
          margin-bottom: 16px;
        }
        .welcome-steps {
          list-style: none;
          counter-reset: steps;
          display: flex; flex-direction: column; gap: 12px;
          margin-bottom: 24px;
        }
        .welcome-steps li {
          counter-increment: steps;
          display: flex; align-items: flex-start; gap: 12px;
          font-size: 14px; line-height: 1.55; color: #5A4228;
        }
        .welcome-steps li::before {
          content: counter(steps);
          flex-shrink: 0;
          width: 24px; height: 24px;
          border-radius: 50%;
          background: #1C1208;
          color: #F0DCA8;
          font-size: 11px; font-weight: 500;
          display: flex; align-items: center; justify-content: center;
          margin-top: 1px;
        }
        .welcome-steps li strong { color: #1C1208; font-weight: 600; }
        .welcome-rule { height: 1px; background: linear-gradient(90deg, transparent, #C4A860, transparent); margin-bottom: 18px; }
        .welcome-love { font-family: 'Lora', serif; font-style: italic; font-size: 14px; color: #7A6035; text-align: center; margin-bottom: 6px; }
        .welcome-love strong { font-style: normal; font-weight: 700; color: #1C1208; }
        .welcome-email { display: block; text-align: center; font-size: 13px; color: #C04830; text-decoration: none; border-bottom: 1px solid rgba(192,72,48,.3); padding-bottom: 1px; width: fit-content; margin: 0 auto 10px; }
        .welcome-copy { text-align: center; font-size: 11px; color: #A89060; letter-spacing: .05em; }

        /* ── KO-FI ── */
        .kofi {
          position: fixed; right: 16px;
          bottom: calc(16px + env(safe-area-inset-bottom, 0px));
          height: 44px;
          padding: 0 16px 0 12px;
          border-radius: 22px;
          background: #FAF0C8; border: 1.5px solid #D4B860;
          display: flex; align-items: center; gap: 7px;
          font-size: 20px; text-decoration: none;
          box-shadow: 0 4px 20px rgba(20,10,2,.25);
          z-index: 9999; transition: transform .2s;
        }
        .kofi-label {
          font-family: 'DM Sans', sans-serif;
          font-size: 12px; font-weight: 500;
          color: #5A3C10; letter-spacing: .02em;
          white-space: nowrap;
        }
        .kofi:active { transform: scale(.94); }

        /* ── TABLET+ ── */
        @media (min-width: 600px) {
          .hero { padding: 56px 32px 0; }
          .search-panel { padding: 24px 32px 32px; }
          .content { padding: 28px 24px 0; }
          .map-card-footer { flex-direction: row; }
          .maps-btn { flex: 1; }
          .card-hero { height: 260px; }
          .map-viewport { height: 320px; }
        }
      `}</style>

      <div className="page">
        {/* ── DARK HERO ── */}
        <div className="hero">
          <p className="hero-eyebrow">Deutschland · Auf Entdeckungsreise</p>
          <h1 className="hero-title">Road<em>tripper</em></h1>
          <p className="hero-sub">History & heritage along your route</p>
          <DrivingScene />
        </div>

        {/* ── SEARCH ── */}
        <div className="search-panel">
          <p className="search-label">Plan your journey</p>
          <div className="search-inputs">
            <div className="search-input-wrap">
              <span className="search-input-icon">◉</span>
              <input className="search-input" placeholder="Start city"
                value={start} onChange={e => setStart(e.target.value)}
                onKeyDown={onKey} autoCorrect="off" autoCapitalize="words" />
            </div>
            <div className="search-input-wrap">
              <span className="search-input-icon">◎</span>
              <input className="search-input" placeholder="Destination"
                value={end} onChange={e => setEnd(e.target.value)}
                onKeyDown={onKey} autoCorrect="off" autoCapitalize="words" />
            </div>
          </div>
          <button className="search-btn" onClick={findStops}>
            {loading ? "Finding stops…" : "Explore Route"}
          </button>
        </div>

        {/* ── RESULTS ── */}
        <div className="content">

          {/* Welcome panel — only shown before first search */}
          {!hasSearched && !loading && (
            <div className="welcome">
              <div className="welcome-icon">🗺️</div>
              <h2 className="welcome-heading">How it works</h2>
              <ol className="welcome-steps">
                <li>Enter a <strong>start city</strong> and a <strong>destination</strong> anywhere in Germany</li>
                <li>Tap <strong>Explore Route</strong> to discover historic sites, monuments and places of interest within 25 km of your route</li>
                <li>Tap <strong>More info</strong> on any stop to read its Wikipedia entry</li>
                <li>Open the full journey in <strong>Google Maps</strong> or <strong>Apple Maps</strong> to navigate with all stops as waypoints</li>
              </ol>
              <div className="welcome-rule" />
              <p className="welcome-love">A labour of love by <strong>Mike Stuchbery</strong></p>
              <a href="mailto:michael.stuchbery@gmail.com" className="welcome-email">michael.stuchbery@gmail.com</a>
              <p className="welcome-copy">© 2006 Mike Stuchbery</p>
            </div>
          )}

          {loading && (
            <div className="loading">
              <p className="loading-text">Charting your route…</p>
              <div className="loading-dots">
                {[0,1,2].map(i => (
                  <div key={i} className="loading-dot" style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          )}

          {!loading && shown.length > 0 && (
            <>
              <div className="results-header">
                <div className="results-rule" />
                <span className="results-count">{pois.length} stops found</span>
                <div className="results-rule" />
              </div>

              {shown.map((p, i) => (
                <Card key={i} poi={p} index={i} />
              ))}

              {visibleCount < pois.length && (
                <button className="load-more" onClick={() => setVisible(v => v + 6)}>
                  More stops along the way →
                </button>
              )}

              {/* Visible map + native app links */}
              <JourneyMap
                routeCoords={routeCoords}
                stops={shown}
                startName={start}
                endName={end}
              />
            </>
          )}

          {hasSearched && !loading && (
            <footer className="footer">
              <div className="footer-rule" />
              <p className="footer-road">You've reached the end of this road</p>
              <p className="footer-love">A labour of love by <strong>Mike Stuchbery</strong></p>
              <a href="mailto:michael.stuchbery@gmail.com" className="footer-email">
                michael.stuchbery@gmail.com
              </a>
              <p className="footer-copy">© 2006 Mike Stuchbery</p>
              <p className="footer-data">
                Routes · OSRM &nbsp;·&nbsp; Places · OpenStreetMap &nbsp;·&nbsp; Images · Wikipedia
              </p>
            </footer>
          )}
        </div>
      </div>

      <a href="https://ko-fi.com/mikestuchbery" target="_blank" rel="noopener noreferrer" className="kofi">
        ☕ <span className="kofi-label">Buy a coffee</span>
      </a>
    </>
  );
}
