import React, { useState, useEffect } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { MapContainer, TileLayer, Polyline, Marker } from "react-leaflet";

/* ========= LEAFLET ICON FIX ========= */
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
  if (Array.isArray(x.features)) return x.features;
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
  let min = Infinity;
  for (const c of coords) {
    const d = haversineKm({ lat: poi.lat, lon: poi.lon }, { lat: c[1], lon: c[0] });
    if (d < min) min = d;
  }
  return min;
}

function routePosition(poi, coords) {
  let bestIndex = 0, bestDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineKm({ lat: poi.lat, lon: poi.lon }, { lat: coords[i][1], lon: coords[i][0] });
    if (d < bestDist) { bestDist = d; bestIndex = i; }
  }
  return bestIndex / coords.length;
}

/* ========= WIKI IMAGE ========= */
async function fetchWikiImage(title) {
  try {
    const s = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title)}&format=json&origin=*`);
    const sj = await s.json();
    const page = sj.query.search[0];
    if (!page) return null;
    const p = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(page.title)}&prop=pageimages&pithumbsize=800&format=json&origin=*`);
    const pj = await p.json();
    const pg = Object.values(pj.query.pages)[0];
    return pg.thumbnail?.source || null;
  } catch { return null; }
}

/* ========= DRIVING SCENE ========= */
function DrivingScene() {
  return (
    <div className="driving-scene" aria-hidden="true">
      <div className="sky">
        <div className="sun" />
        <div className="cloud cloud-1" />
        <div className="cloud cloud-2" />
        <div className="cloud cloud-3" />
      </div>
      <div className="hills">
        <div className="hill hill-far" />
        <div className="hill hill-near" />
      </div>
      <div className="trees">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="tree" style={{ animationDelay: `${i * -1.1}s` }}>
            <div className="tree-trunk" />
            <div className="tree-top" />
          </div>
        ))}
      </div>
      <div className="road">
        <div className="road-lines">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="road-dash" style={{ animationDelay: `${i * -0.5}s` }} />
          ))}
        </div>
      </div>
      <div className="car">
        <div className="car-body">
          <div className="car-roof" />
          <div className="car-window car-window-front" />
          <div className="car-window car-window-rear" />
        </div>
        <div className="wheel wheel-front" />
        <div className="wheel wheel-rear" />
        <div className="puff puff-1" />
        <div className="puff puff-2" />
      </div>
    </div>
  );
}

/* ========= STOP CARD ========= */
function Card({ name, era, summary, type, index }) {
  const [img, setImg] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  
  useEffect(() => { 
    fetchWikiImage(name).then(setImg); 
  }, [name]);

  const wiki = `https://en.wikipedia.org/wiki/${encodeURIComponent(name)}`;
  const lat = 0; // Coordinates should be passed as props ideally
  const lon = 0;
  const siteGoogle = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  const siteApple = `https://maps.apple.com/?q=${encodeURIComponent(name)}&ll=${lat},${lon}`;

  return (
    <div className="stop-card" style={{ animationDelay: `${index * 0.07}s` }}>
      <div className="stop-badge">{index + 1}</div>
      <div className="card-inner">
        {img && (
          <div className="card-img-wrap">
            <img 
              src={img} 
              alt={name}
              className={`card-img ${imgLoaded ? "loaded" : ""}`}
              onLoad={() => setImgLoaded(true)} 
            />
            <div className="card-img-fade" />
          </div>
        )}
        <div className="card-body">
          <div className="pill-row">
            {type && <span className="pill">{type}</span>}
            {era && <span className="pill pill-era">{era}</span>}
          </div>
          <div className="card-title">{name}</div>
          {summary && <p className="card-text">{summary}</p>}
          <div style={{ display: 'flex', gap: '12px' }}>
            <a href={wiki} target="_blank" rel="noreferrer" className="card-link">Wikipedia →</a>
            <a href={siteGoogle} target="_blank" rel="noreferrer" className="card-link">Google Maps</a>
            <a href={siteApple} target="_blank" rel="noreferrer" className="card-link">Apple Maps</a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========= MAP CARD ========= */
function JourneyMap({ coords, pois, start, end }) {
  if (!coords?.length || !pois?.length) return null;
  
  const stopParts = pois.map(p => `${p.lat ?? p.latitude},${p.lon ?? p.longitude}`).join("/");
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
        <MapContainer style={{ height: "100%" }} center={[center[1], center[0]]} zoom={6} scrollWheelZoom={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="" />
          <Polyline
            positions={coords.map(c => [c[1], c[0]])}
            pathOptions={{ color: "#B84228", weight: 3, opacity: 0.85, dashArray: "8 5" }}
          />
          {pois.map((p, i) => (
            <Marker key={i} position={[p.lat ?? p.latitude, p.lon ?? p.longitude]} />
          ))}
        </MapContainer>
      </div>
      <div className="map-card-footer">
        <a href={googleUrl} target="_blank" rel="noreferrer" className="map-btn map-btn-google">Open in Google Maps →</a>
        <a href={appleUrl} target="_blank" rel="noreferrer" className="map-btn map-btn-apple">Open in Apple Maps →</a>
      </div>
    </div>
  );
}

/* ========= KO-FI ========= */
function KofiButton() {
  return (
    <a href="https://buymeacoffee.com/mikestuchbery" target="_blank" rel="noopener noreferrer" className="kofi-btn">☕</a>
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
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}`);
    const j = await r.json();
    return { lat: +j[0].lat, lon: +j[0].lon };
  }

  async function route(a, b) {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`);
    const j = await r.json();
    return j.routes[0].geometry.coordinates;
  }

  async function findStops() {
    if (!start || !end) return;
    setLoading(true); setPois([]); setCoords([]);
    try {
      const A = await geocode(start);
      const B = await geocode(end);
      const routeCoords = await route(A, B);
      setCoords(routeCoords);
      const near = ALL_POIS.map((p) => {
        const lat = p.lat ?? p.latitude, lon = p.lon ?? p.longitude;
        if (!lat || !lon) return null;
        const dist = minDistanceToRoute({ lat, lon }, routeCoords);
        if (dist > 25) return null;
        return { ...p, lat, lon, pos: routePosition({ lat, lon }, routeCoords) };
      }).filter(Boolean).sort((a, b) => a.pos - b.pos);
      setPois(near);
      const routeKm = haversineKm(A, B);
      setVisibleCount(routeKm < 100 ? 4 : 8);
    } catch (e) { alert(e.message); }
    setLoading(false);
  }

  const handleKey = (e) => { if (e.key === "Enter") findStops(); };
  const shown = pois.slice(0, visibleCount);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Libre+Baskerville:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
        
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
          background-color: #EDE4CF;
          background-image: radial-gradient(ellipse at 15% 0%, rgba(184,147,90,0.12) 0%, transparent 55%), radial-gradient(ellipse at 85% 100%, rgba(120,75,35,0.08) 0%, transparent 55%);
          min-height: 100vh;
        }

        .page { max-width: 600px; margin: 0 auto; padding: 0 20px 80px; font-family: 'DM Sans', sans-serif; }

        .header { padding: 48px 0 0; text-align: center; }
        .header-rule { height: 1px; background: linear-gradient(to right, transparent, #C4A870, transparent); }
        .eyebrow { font-size: 10.5px; font-weight: 500; letter-spacing: 0.22em; text-transform: uppercase; color: #9A7A48; margin-bottom: 10px; }
        .headline { font-family: 'Playfair Display', serif; font-size: 56px; font-weight: 700; color: #241A0C; letter-spacing: -0.015em; line-height: 1.05; margin-bottom: 10px; }
        .subhead { font-family: 'Libre Baskerville', serif; font-style: italic; font-size: 14.5px; color: #7A6040; }
        .header-top { padding-bottom: 20px; }

        .driving-scene { position: relative; height: 110px; overflow: hidden; border-radius: 10px; margin: 18px 0 0; border: 1px solid #DCCAA4; }
        .sky { position: absolute; inset: 0; background: linear-gradient(to bottom, #B8D4E8 0%, #D8EAF4 55%, #E8C890 100%); }
        .sun { position: absolute; top: 12px; right: 60px; width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle, #FFE870 0%, #FFB830 100%); box-shadow: 0 0 16px 4px rgba(255,200,60,0.45); }
        .cloud { position: absolute; background: rgba(255,255,255,0.88); border-radius: 50px; animation: cloudScroll linear infinite; }
        .cloud::before, .cloud::after { content: ''; position: absolute; background: rgba(255,255,255,0.88); border-radius: 50%; }
        .cloud-1 { width: 64px; height: 16px; top: 14px; animation-duration: 16s; }
        .cloud-1::before { width: 28px; height: 22px; top: -12px; left: 10px; }
        .cloud-1::after  { width: 20px; height: 18px; top: -8px; left: 30px; }
        .cloud-2 { width: 48px; height: 13px; top: 22px; animation-duration: 22s; animation-delay: -7s; }
        .cloud-3 { width: 54px; height: 14px; top: 10px; animation-duration: 19s; animation-delay: -12s; }
        
        @keyframes cloudScroll { from { transform: translateX(660px); } to { transform: translateX(-120px); } }
        
        .hills { position: absolute; bottom: 30px; left: 0; right: 0; height: 60px; }
        .hill { position: absolute; border-radius: 50%; }
        .hill-far { width: 260px; height: 80px; background: #7AAA6A; bottom: 0; left: 40%; animation: hillFar 12s linear infinite; }
        .hill-near { width: 200px; height: 60px; background: #5A8A4A; bottom: 0; left: 60%; animation: hillNear 8s linear infinite; }
        
        @keyframes hillFar  { from { transform: translateX(400px); } to { transform: translateX(-300px); } }
        @keyframes hillNear { from { transform: translateX(400px); } to { transform: translateX(-250px); } }
        
        .trees { position: absolute; bottom: 28px; left: 0; right: 0; height: 50px; }
        .tree { position: absolute; bottom: 0; animation: treeScroll 3.5s linear infinite; }
        
        @keyframes treeScroll { from { transform: translateX(640px); } to { transform: translateX(-40px); } }
        
        .tree-trunk { width: 6px; height: 14px; background: #6B4A2A; margin: 0 auto; border-radius: 2px; }
        .tree-top { width: 0; height: 0; border-left: 13px solid transparent; border-right: 13px solid transparent; border-bottom: 28px solid #2E6E28; position: absolute; top: -20px; left: -10px; }
        .road { position: absolute; bottom: 0; left: 0; right: 0; height: 32px; background: linear-gradient(to bottom, #888 0%, #777 100%); border-top: 2px solid #AAA; }
        .road-lines { position: absolute; top: 50%; transform: translateY(-50%); left: 0; right: 0; display: flex; overflow: hidden; }
        .road-dash { flex-shrink: 0; width: 40px; height: 4px; background: #FFE060; margin-right: 30px; border-radius: 2px; animation: dashScroll 0.7s linear infinite; }
        
        @keyframes dashScroll { from { transform: translateX(70px); } to { transform: translateX(-70px); } }
        
        .car { position: absolute; bottom: 10px; left: 28%; animation: carBob 0.35s ease-in-out infinite alternate; }
        @keyframes carBob { from { transform: translateY(0); } to { transform: translateY(-1.5px); } }
        
        .car-body { position: relative; width: 72px; height: 22px; background: #B84228; border-radius: 4px 4px 2px 2px; }
        .car-roof { position: absolute; top: -14px; left: 12px; width: 42px; height: 16px; background: #962E18; border-radius: 6px 6px 0 0; }
        .car-window { position: absolute; top: -11px; height: 10px; background: rgba(180,220,255,0.85); border-radius: 3px 3px 0 0; }
        .car-window-front { width: 16px; left: 38px; }
        .car-window-rear  { width: 14px; left: 18px; }
        .wheel { position: absolute; bottom: -7px; width: 14px; height: 14px; border-radius: 50%; background: #222; border: 2px solid #555; animation: wheelSpin 0.4s linear infinite; }
        .wheel-front { right: 8px; } .wheel-rear { left: 8px; }
        
        @keyframes wheelSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        .puff { position: absolute; border-radius: 50%; background: rgba(200,200,200,0.55); animation: puffOut 0.7s ease-out infinite; }
        @keyframes puffOut { 0% { opacity: 0.7; transform: scale(0.6) translateX(0); } 100% { opacity: 0; transform: scale(1.6) translateX(-10px); } }

        .search-card { background: #FAF5E8; border: 1px solid #DCCAA4; border-radius: 14px; padding: 22px; margin: 18px 0 36px; box-shadow: 0 4px 28px rgba(60,35,10,0.09); }
        .input-field { width: 100%; padding: 13px 34px; border-radius: 8px; border: 1.5px solid #DCCAA4; background: #FFFCF2; font-family: 'DM Sans', sans-serif; font-size: 14.5px; margin-bottom: 8px; }
        .explore-btn { width: 100%; padding: 13px; border-radius: 8px; border: none; background: #B84228; color: #FFF; cursor: pointer; font-weight: 500; }

        .stop-card { position: relative; padding-left: 42px; margin-bottom: 18px; animation: fadeUp 0.45s ease both; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        
        .card-inner { background: #FAF5E8; border: 1px solid #DCCAA4; border-radius: 11px; overflow: hidden; }
        .card-img { width: 100%; height: 200px; object-fit: cover; opacity: 0; transition: opacity 0.5s; }
        .card-img.loaded { opacity: 1; }
        
        .map-card { background: #FAF5E8; border: 1px solid #DCCAA4; border-radius: 11px; overflow: hidden; margin-bottom: 24px; }
        .map-card-footer { padding: 14px; border-top: 1px solid #DCCAA4; display: flex; gap: 10px; }
        .map-btn { flex: 1; padding: 10px; border-radius: 7px; text-decoration: none; text-align: center; font-size: 12px; font-weight: 500; }
        .map-btn-google { background: #241A0C; color: #F0DDB8; }
        .map-btn-apple { background: #EDE0BE; color: #241A0C; border: 1px solid #DCCAA4; }

        .kofi-btn { position: fixed; right: 16px; bottom: 16px; background: #FAF0CC; border: 1.5px solid #D4BE90; width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 9999; text-decoration: none; }
      `}</style>

      <div className="page">
        <header className="header">
          <div className="header-rule" style={{ marginBottom: 22 }} />
          <div className="header-top">
            <div className="eyebrow">Deutschland · Auf Entdeckungsreise</div>
            <h1 className="headline">Roadtripper</h1>
            <p className="subhead">Discover history & heritage along your route</p>
          </div>
          <DrivingScene />
          <div className="header-rule" style={{ marginTop: 0 }} />
        </header>

        <div className="search-card">
          <div className="input-stack">
            <input className="input-field" placeholder="Start city" value={start} onChange={e => setStart(e.target.value)} onKeyDown={handleKey} />
            <input className="input-field" placeholder="Destination" value={end} onChange={e => setEnd(e.target.value)} onKeyDown={handleKey} />
          </div>
          <button className="explore-btn" onClick={findStops}>
            {loading ? "Exploring…" : "Explore Route"}
          </button>
        </div>

        {loading && <div className="loading-wrap">Loading...</div>}

        {!loading && shown.length > 0 && (
          <>
            {shown.map((p, i) => (
              <Card key={i} index={i}
                name={p.name ?? p.title ?? "Site"}
                era={p.era ?? p.century ?? ""}
                type={p.type ?? p.category ?? ""}
                summary={p.summary ?? p.description ?? ""}
              />
            ))}
            {visibleCount < pois.length && (
              <button className="load-more" onClick={() => setVisibleCount(v => v + 6)}>Load more →</button>
            )}
            <JourneyMap coords={coords} pois={shown} start={start} end={end} />
          </>
        )}
      </div>
      <KofiButton />
    </>
  );
}
