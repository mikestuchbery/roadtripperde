import React, { useState, useEffect, useMemo, memo } from "react";
import "leaflet/dist/leaflet.css";

// --- Sanity Check: Leaflet SSR Fix ---
let MapContainer, TileLayer, Polyline, Marker, Popup, L;
if (typeof window !== "undefined") {
  L = require("leaflet");
  const RL = require("react-leaflet");
  MapContainer = RL.MapContainer;
  TileLayer = RL.TileLayer;
  Polyline = RL.Polyline;
  Marker = RL.Marker;
  Popup = RL.Popup;

  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
    iconUrl: require("leaflet/dist/images/marker-icon.png"),
    shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
  });
}

/* ========= DATA IMPORTS ========= */
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
  return x.name ? [x] : [];
}

const ALL_POIS = [
  ...asArray(baden), ...asArray(bavaria), ...asArray(berlin),
  ...asArray(brandenburg), ...asArray(bremen), ...asArray(hamburg),
  ...asArray(hesse), ...asArray(lowerSaxony), ...asArray(meckpom),
  ...asArray(nrw), ...asArray(rlp), ...asArray(saarland),
  ...asArray(saxony), ...asArray(saxonyAnhalt), ...asArray(sh),
  ...asArray(thuringia),
];

/* ========= HELPERS ========= */
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
  let min = Infinity, idx = 0;
  const step = coords.length > 1000 ? 5 : 1; 
  for (let i = 0; i < coords.length; i += step) {
    const d = haversineKm({ lat: poi.lat, lon: poi.lon }, { lat: coords[i][1], lon: coords[i][0] });
    if (d < min) { min = d; idx = i; }
  }
  return { distance: min, index: idx };
}

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

/* ========= COMPONENTS ========= */
const DrivingScene = memo(() => (
  <div className="scene" aria-hidden="true">
    <div className="scene-sky"><div className="scene-sun" /></div>
    <div className="scene-road">
      {[...Array(7)].map((_, i) => <div key={i} className="scene-dash" style={{ animationDelay: `${(i * -0.45).toFixed(2)}s` }} />)}
    </div>
    <div className="scene-car">
      <div className="scene-car-body">
        <div className="scene-car-roof" /><div className="scene-win scene-win--rear" /><div className="scene-win scene-win--front" /><div className="scene-headlight" />
      </div>
      <div className="scene-wheel scene-wheel--rear" /><div className="scene-wheel scene-wheel--front" />
    </div>
  </div>
));

const Card = memo(({ poi, index }) => {
  const name = poi.name ?? poi.title ?? "Historical Site";
  const [img, setImg] = useState(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { fetchWikiImage(name).then(setImg); }, [name]);

  return (
    <div className="card" style={{ animationDelay: `${index * 0.08}s` }}>
      <div className="card-hero">
        {img ? (
          <img src={img} alt={name} className={`card-hero-img ${loaded ? "in" : ""}`} onLoad={() => setLoaded(true)} />
        ) : <div className="card-placeholder" />}
        <div className="card-hero-badge">{index + 1}</div>
        <div className="card-pills-floating">
          {(poi.type || poi.category) && <span className="pill">{poi.type || poi.category}</span>}
          {(poi.era || poi.century) && <span className="pill pill-era">{poi.era || poi.century}</span>}
        </div>
      </div>
      <div className="card-content">
        <h2 className="card-title">{name}</h2>
        <p className="card-description">{poi.summary || poi.description}</p>
        <div className="card-actions">
          <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(name)}`} target="_blank" rel="noreferrer" className="btn-secondary">History</a>
          <a href={`https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lon}`} target="_blank" rel="noreferrer" className="btn-primary">Navigate →</a>
        </div>
      </div>
    </div>
  );
});

const JourneyMap = memo(({ routeCoords, startName, endName }) => {
  if (typeof window === "undefined" || !MapContainer || !routeCoords?.length) return null;
  const startPt = routeCoords[0];
  const endPt = routeCoords[routeCoords.length - 1];
  const mid = routeCoords[Math.floor(routeCoords.length / 2)];
  
  return (
    <div className="map-card">
      <div className="map-viewport" style={{ height: "300px" }}>
        <MapContainer style={{ height: "100%", width: "100%" }} center={[mid[1], mid[0]]} zoom={6} scrollWheelZoom={false} preferCanvas={true}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Polyline positions={routeCoords.map(c => [c[1], c[0]])} pathOptions={{ color: "#C04830", weight: 4 }} />
          <Marker position={[startPt[1], startPt[0]]}><Popup>Start</Popup></Marker>
          <Marker position={[endPt[1], endPt[0]]}><Popup>End</Popup></Marker>
        </MapContainer>
      </div>
      <a href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(startName)}&destination=${encodeURIComponent(endName)}&travelmode=driving`} target="_blank" rel="noreferrer" className="nav-main-btn">
        Start GPS Navigation
      </a>
    </div>
  );
});

/* ========= MAIN APP ========= */
export default function App() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pois, setPois] = useState([]);
  const [routeCoords, setCoords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");
  const [hasSearched, setSearched] = useState(false);

  const geocode = async (place) => {
    const email = "michael.stuchbery@gmail.com";
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}&limit=1&email=${encodeURIComponent(email)}`;
    const r = await fetch(url);
    const ct = r.headers.get("content-type");
    if (!r.ok || !ct?.includes("json")) {
        // Fallback to Photon
        const pr = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(place)}&limit=1`);
        const pj = await pr.json();
        if (!pj.features?.length) throw new Error(`Could not find: ${place}`);
        const [lon, lat] = pj.features[0].geometry.coordinates;
        return { lat, lon };
    }
    const j = await r.json();
    if (!j.length) throw new Error(`Could not find: ${place}`);
    return { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon) };
  };

  const findStops = async () => {
    if (!start || !end || loading) return;
    setLoading(true); setSearched(true); setPois([]); setCoords([]);
    try {
      setLoadingStage("Locating cities...");
      const A = await geocode(start);
      const B = await geocode(end);
      setLoadingStage("Charting your route...");
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${A.lon},${A.lat};${B.lon},${B.lat}?overview=full&geometries=geojson`);
      const data = await r.json();
      if (!data.routes?.length) throw new Error("No route found.");
      const coords = data.routes[0].geometry.coordinates;
      setCoords(coords);
      setLoadingStage("Scanning for history...");
      const candidates = ALL_POIS.reduce((acc, p) => {
        const lat = p.lat ?? p.latitude; const lon = p.lon ?? p.longitude;
        if (!lat || !lon) return acc;
        const { distance, index } = minDistanceToRoute({ lat, lon }, coords);
        if (distance <= 25) acc.push({ ...p, lat, lon, routeIndex: index });
        return acc;
      }, []).sort((a, b) => a.routeIndex - b.routeIndex);
      setPois(candidates);
    } catch (e) { alert(e.message); } finally { setLoading(false); setLoadingStage(""); }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700&family=Lora:ital@0;1&family=DM+Sans:wght@400;500;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: #E8DEC6; color: #1C1208; }
        .hero { background: #1C1208; padding: 40px 20px 0; position: relative; overflow: hidden; text-align: center; }
        .hero-title { font-family: 'Playfair Display', serif; font-size: 52px; color: #F5EDDA; line-height: 1; }
        .hero-title em { font-style: italic; color: #D4A050; }
        .scene { position: relative; height: 80px; overflow: hidden; margin-top: 15px; }
        .scene-sky { position: absolute; inset: 0; background: linear-gradient(180deg, #7AAECC, #D4A84A); }
        .scene-road { position: absolute; bottom: 0; left: 0; right: 0; height: 24px; background: #7A7A7A; display: flex; align-items: center; overflow: hidden; }
        .scene-dash { width: 30px; height: 2px; background: #F0D840; margin-right: 20px; animation: dash .6s linear infinite; }
        @keyframes dash { from { transform: translateX(50px); } to { transform: translateX(-50px); } }
        .scene-car { position: absolute; bottom: 6px; left: 20%; animation: bob .3s infinite alternate; }
        @keyframes bob { to { transform: translateY(-2px); } }
        .scene-car-body { width: 50px; height: 16px; background: #C04830; border-radius: 2px; }
        .search-panel { background: #1C1208; padding: 20px; }
        .search-input { width: 100%; padding: 14px; background: #261C0C; border: 1px solid #3A2A10; border-radius: 8px; color: #F0E4C8; margin-bottom: 10px; font-size: 16px; outline: none; }
        .search-btn { width: 100%; padding: 16px; background: #C04830; border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer; }
        .overlay { position: fixed; inset: 0; background: rgba(28, 18, 8, 0.9); z-index: 10000; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; }
        .content { padding: 20px; }
        .card { background: #FAF4E4; border-radius: 16px; overflow: hidden; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        .card-hero { position: relative; height: 180px; background: #261C0C; }
        .card-hero-img { width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: .5s; }
        .card-hero-img.in { opacity: 1; }
        .card-hero-badge { position: absolute; top: 12px; left: 12px; background: #C04830; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; }
        .card-pills-floating { position: absolute; bottom: 12px; left: 12px; display: flex; gap: 6px; }
        .pill { background: rgba(255,255,255,0.9); padding: 4px 10px; border-radius: 10px; font-size: 9px; font-weight: 700; color: #1C1208; text-transform: uppercase; }
        .card-content { padding: 15px; }
        .card-title { font-family: 'Playfair Display', serif; font-size: 20px; margin-bottom: 8px; }
        .card-description { font-size: 14px; color: #5A4228; line-height: 1.5; margin-bottom: 15px; }
        .card-actions { display: flex; gap: 8px; }
        .btn-primary, .btn-secondary { flex: 1; text-align: center; padding: 12px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; }
        .btn-primary { background: #C04830; color: white; }
        .btn-secondary { background: #E8DEC6; color: #7A6035; }
        .nav-main-btn { display: block; background: #1C1208; color: #D4A050; text-align: center; padding: 16px; text-decoration: none; font-weight: bold; }
        .footer { padding: 20px; text-align: center; font-size: 14px; color: #7A6035; }
        .kofi { position: fixed; right: 15px; bottom: 15px; background: #FAF0C8; border: 1px solid #D4B860; padding: 10px 15px; border-radius: 20px; text-decoration: none; display: flex; align-items: center; gap: 8px; z-index: 9999; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
      `}</style>

      {loading && <div className="overlay"><p>{loadingStage}</p></div>}

      <div className="page">
        <div className="hero"><h1 className="hero-title">Road<em>tripper</em></h1><DrivingScene /></div>
        <div className="search-panel">
          <input className="search-input" placeholder="Start city" value={start} onChange={e => setStart(e.target.value)} />
          <input className="search-input" placeholder="Destination" value={end} onChange={e => setEnd(e.target.value)} />
          <button className="search-btn" onClick={findStops}>Explore Route</button>
        </div>

        <div className="content">
          {!hasSearched && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontStyle: 'italic' }}>A labour of love by <strong>Mike Stuchbery</strong></p>
              <p style={{ fontSize: '11px', color: '#A89060' }}>© 2006 Mike Stuchbery</p>
            </div>
          )}
          {pois.map((p, i) => <Card key={i} poi={p} index={i} />)}
          {hasSearched && (
            <>
              <JourneyMap routeCoords={routeCoords} startName={start} endName={end} />
              <div className="footer">
                <p>A labour of love by <strong>Mike Stuchbery</strong></p>
                <p style={{ fontSize: '11px' }}>michael.stuchbery@gmail.com</p>
              </div>
            </>
          )}
        </div>
      </div>
      <a href="https://ko-fi.com/mikestuchbery" target="_blank" rel="noreferrer" className="kofi">☕ <span>Buy a coffee</span></a>
    </>
  );
}
