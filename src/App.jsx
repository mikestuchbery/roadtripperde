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

/* ========= GEO HELPERS ========= */
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
    const page = sj.query?.search?.[0];
    if (!page) return null;
    const p = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(page.title)}&prop=pageimages&pithumbsize=800&format=json&origin=*`);
    const pj = await p.json();
    const pg = Object.values(pj.query.pages)[0];
    return pg.thumbnail?.source || null;
  } catch { return null; }
}

/* ========= STOP CARD ========= */
function Card({ name, era, summary, type, index, lat, lon }) {
  const [img, setImg] = useState(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  useEffect(() => { fetchWikiImage(name).then(setImg); }, [name]);

  const wiki = `https://en.wikipedia.org/wiki/${encodeURIComponent(name)}`;
  const siteGoogle = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  const siteApple = `https://maps.apple.com/?q=${encodeURIComponent(name)}&ll=${lat},${lon}`;

  return (
    <div className="stop-card" style={{ animationDelay: `${index * 0.07}s` }}>
      <div className="stop-badge">{index + 1}</div>
      <div className="card-inner">
        {img && (
          <div className="card-img-wrap">
            <img src={img} alt={name} className={`card-img ${imgLoaded ? "loaded" : ""}`} onLoad={() => setImgLoaded(true)} />
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
          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
            <a href={wiki} target="_blank" rel="noreferrer" className="card-link">Wikipedia →</a>
            <a href={siteGoogle} target="_blank" rel="noreferrer" className="card-link" style={{color: '#B84228'}}>Google Maps</a>
            <a href={siteApple} target="_blank" rel="noreferrer" className="card-link" style={{color: '#B84228'}}>Apple Maps</a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========= JOURNEY MAP ========= */
function JourneyMap({ coords, pois, start, end }) {
  if (!coords?.length || !pois?.length) return null;
  const stopParts = pois.map(p => `${p.lat},${p.lon}`).join("/");
  const googleUrl = `https://www.google.com/maps/dir/${encodeURIComponent(start)}/${stopParts}/${encodeURIComponent(end)}/`;
  const appleUrl = `https://maps.apple.com/?saddr=${encodeURIComponent(start)}&daddr=${encodeURIComponent(end)}&dirflg=d`;
  const center = coords[Math.floor(coords.length / 2)];

  return (
    <div className="map-card">
      <div className="map-card-header">◎ Journey map</div>
      <div style={{ height: 300 }}>
        <MapContainer style={{ height: "100%" }} center={[center[1], center[0]]} zoom={6} scrollWheelZoom={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Polyline positions={coords.map(c => [c[1], c[0]])} pathOptions={{ color: "#B84228", weight: 3, opacity: 0.85, dashArray: "8 5" }} />
          {pois.map((p, i) => (
            <Marker key={i} position={[p.lat, p.lon]} />
          ))}
        </MapContainer>
      </div>
      <div className="map-card-footer">
        <a href={googleUrl} target="_blank" rel="noreferrer" className="map-btn map-btn-google">Google Journey →</a>
        <a href={appleUrl} target="_blank" rel="noreferrer" className="map-btn map-btn-apple">Apple Journey →</a>
      </div>
    </div>
  );
}

/* ========= DRIVING SCENE ========= */
function DrivingScene() {
  return (
    <div className="driving-scene" aria-hidden="true">
      <div className="sky"><div className="sun" /><div className="cloud cloud-1" /><div className="cloud cloud-2" /><div className="cloud cloud-3" /></div>
      <div className="hills"><div className="hill hill-far" /><div className="hill hill-near" /></div>
      <div className="trees">{[...Array(8)].map((_, i) => (<div key={i} className="tree" style={{ animationDelay: `${i * -1.1}s` }}><div className="tree-trunk" /><div className="tree-top" /></div>))}</div>
      <div className="road"><div className="road-lines">{[...Array(6)].map((_, i) => (<div key={i} className="road-dash" style={{ animationDelay: `${i * -0.5}s` }} />))}</div></div>
      <div className="car"><div className="car-body"><div className="car-roof" /><div className="car-window car-window-front" /><div className="car-window car-window-rear" /></div><div className="wheel wheel-front" /><div className="wheel wheel-rear" /><div className="puff puff-1" /><div className="puff puff-2" /></div>
    </div>
  );
}

/* ========= KO-FI ========= */
function KofiButton() {
  return <a href="https://buymeacoffee.com/mikestuchbery" target="_blank" rel="noopener noreferrer" className="kofi-btn">☕</a>;
}

/* ========= MAIN APP ========= */
export default function App() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pois, setPois] = useState([]);
  const [coords, setCoords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(8);

  async function safeFetch(url) {
    const res = await fetch(url);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error("Server is busy (Rate Limit). Please wait 2 seconds.");
    }
  }

  async function findStops() {
    if (!start || !end) return;
    setLoading(true); setPois([]); setCoords([]);
    try {
      const aData = await safeFetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(start)}`);
      if (!aData.length) throw new Error("Start not found");
      
      await new Promise(r => setTimeout(r, 1000)); // Rate limit pause

      const bData = await safeFetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(end)}`);
      if (!bData.length) throw new Error("End not found");

      const A = { lat: +aData[0].lat, lon: +aData[0].lon };
      const B = { lat: +bData[0].lat, lon: +bData[0].lon };

      const rData = await safeFetch(`https://router.project-osrm.org/route/v1/driving/${A.lon},${A.lat};${B.lon},${B.lat}?overview=full&geometries=geojson`);
      const routeCoords = rData.routes[0].geometry.coordinates;
      setCoords(routeCoords);

      const near = ALL_POIS.map(p => {
        const lat = p.lat ?? p.latitude, lon = p.lon ?? p.longitude;
        if (!lat || !lon) return null;
        const dist = minDistanceToRoute({ lat, lon }, routeCoords);
        return dist < 25 ? { ...p, lat, lon, pos: routePosition({ lat, lon }, routeCoords) } : null;
      }).filter(Boolean).sort((a, b) => a.pos - b.pos);

      setPois(near);
      setVisibleCount(haversineKm(A, B) < 100 ? 4 : 8);
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
        body { background-color: #EDE4CF; min-height: 100vh; font-family: 'DM Sans', sans-serif; }
        .page { max-width: 600px; margin: 0 auto; padding: 0 20px 80px; }
        .header { padding: 48px 0 0; text-align: center; }
        .headline { font-family: 'Playfair Display', serif; font-size: 56px; font-weight: 700; color: #241A0C; margin-bottom: 10px; }
        .subhead { font-family: 'Libre Baskerville', serif; font-style: italic; font-size: 14.5px; color: #7A6040; }
        .search-card { background: #FAF5E8; border: 1px solid #DCCAA4; border-radius: 14px; padding: 22px; margin: 18px 0 36px; }
        .input-field { width: 100%; padding: 13px; border-radius: 8px; border: 1.5px solid #DCCAA4; background: #FFFCF2; margin-bottom: 8px; }
        .explore-btn { width: 100%; padding: 13px; border-radius: 8px; border: none; background: #B84228; color: #FFF; cursor: pointer; font-weight: 600; }
        .stop-card { position: relative; padding-left: 42px; margin-bottom: 18px; animation: fadeUp 0.45s ease both; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .card-inner { background: #FAF5E8; border: 1px solid #DCCAA4; border-radius: 11px; overflow: hidden; }
        .card-img { width: 100%; height: 200px; object-fit: cover; opacity: 0; transition: opacity 0.5s; }
        .card-img.loaded { opacity: 1; }
        .card-body { padding: 14px 16px; }
        .card-title { font-family: 'Playfair Display', serif; font-size: 19px; font-weight: 700; margin-bottom: 8px; }
        .card-text { font-size: 13.5px; line-height: 1.6; color: #5A4228; }
        .pill { background: #EDE0BE; padding: 3px 8px; border-radius: 4px; font-size: 9.5px; font-weight: 600; text-transform: uppercase; margin-right: 5px; }
        .map-card { background: #FAF5E8; border: 1px solid #DCCAA4; border-radius: 11px; overflow: hidden; margin-top: 24px; }
        .map-card-footer { padding: 14px; border-top: 1px solid #DCCAA4; display: flex; gap: 10px; }
        .map-btn { flex: 1; padding: 10px; border-radius: 7px; text-decoration: none; text-align: center; font-size: 12.5px; font-weight: 600; }
        .map-btn-google { background: #241A0C; color: #F0DDB8; }
        .map-btn-apple { background: #EDE0BE; color: #241A0C; border: 1px solid #DCCAA4; }
        .kofi-btn { position: fixed; right: 16px; bottom: 16px; background: #FAF0CC; border: 1.5px solid #D4BE90; width: 46px; height: 46px; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 9999; text-decoration: none; }
        /* Driving Scene Styles */
        .driving-scene { position: relative; height: 110px; overflow: hidden; border-radius: 10px; margin-top: 20px; border: 1px solid #DCCAA4; }
        .sky { position: absolute; inset: 0; background: linear-gradient(to bottom, #B8D4E8 0%, #E8C890 100%); }
        .road { position: absolute; bottom: 0; left: 0; right: 0; height: 32px; background: #777; border-top: 2px solid #AAA; }
        .road-dash { width: 40px; height: 4px; background: #FFE060; position: absolute; animation: dashScroll 0.7s linear infinite; }
        @keyframes dashScroll { from { right: -50px; } to { right: 650px; } }
      `}</style>

      <div className="page">
        <header className="header">
          <h1 className="headline">Roadtripper</h1>
          <p className="subhead">Discover history & heritage along your route</p>
          <DrivingScene />
        </header>

        <div className="search-card">
          <input className="input-field" placeholder="Start city" value={start} onChange={e => setStart(e.target.value)} onKeyDown={handleKey} />
          <input className="input-field" placeholder="Destination" value={end} onChange={e => setEnd(e.target.value)} onKeyDown={handleKey} />
          <button className="explore-btn" onClick={findStops}>{loading ? "Searching..." : "Explore Route"}</button>
        </div>

        {shown.map((p, i) => (
          <Card key={i} index={i} {...p} lat={p.lat} lon={p.lon} />
        ))}

        <JourneyMap coords={coords} pois={shown} start={start} end={end} />
      </div>
      <KofiButton />
    </>
  );
}
