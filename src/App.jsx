import { useState, useEffect } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";

// Fix Leaflet Icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/* ========= IMPORT POIS (Assuming your local structure) ========= */
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
  let min = Infinity, idx = 0;
  // Performance optimization: check every 2nd point for long routes
  const step = coords.length > 1000 ? 2 : 1;
  for (let i = 0; i < coords.length; i += step) {
    const d = haversineKm({ lat: poi.lat, lon: poi.lon }, { lat: coords[i][1], lon: coords[i][0] });
    if (d < min) { min = d; idx = i; }
  }
  return { distance: min, index: idx };
}

/* ========= WIKI IMAGE ========= */
async function fetchWikiImage(title) {
  try {
    const s = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title)}&format=json&origin=*`);
    const sj = await s.json();
    const page = sj.query.search[0];
    if (!page) return null;
    const p = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(page.title)}&prop=pageimages&pithumbsize=600&format=json&origin=*`);
    const pj = await p.json();
    const pg = Object.values(pj.query.pages)[0];
    return pg.thumbnail?.source || null;
  } catch { return null; }
}

/* ========= COMPONENTS ========= */
function DrivingScene() {
  return (
    <div className="scene" aria-hidden="true">
      <div className="scene-sky"><div className="scene-sun" /></div>
      <div className="scene-hill scene-hill--far" /><div className="scene-hill scene-hill--near" />
      <div className="scene-treeline">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="scene-tree" style={{ animationDelay: `${(i * -0.9).toFixed(1)}s` }}>
            <div className="scene-trunk" /><div className="scene-canopy" />
          </div>
        ))}
      </div>
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
  );
}

function Card({ poi, index }) {
  const name = poi.name ?? poi.title ?? "Site";
  const [img, setImg] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { fetchWikiImage(name).then(setImg); }, [name]);

  return (
    <div className="card" style={{ animationDelay: `${index * 0.06}s` }}>
      {img ? (
        <div className="card-hero">
          <img src={img} alt={name} className={`card-hero-img${loaded ? " card-hero-img--in" : ""}`} onLoad={() => setLoaded(true)} />
          <div className="card-hero-fade" /><div className="card-hero-num">{index + 1}</div>
        </div>
      ) : <div className="card-noimg-num">{index + 1}</div>}
      <div className="card-body">
        <div className="card-pills">
          {(poi.type || poi.category) && <span className="pill">{poi.type || poi.category}</span>}
          {(poi.era || poi.century) && <span className="pill pill--era">{poi.era || poi.century}</span>}
        </div>
        <h2 className="card-title">{name}</h2>
        <p className="card-summary">{poi.summary || poi.description}</p>
        <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(name)}`} target="_blank" rel="noreferrer" className="card-link">More info →</a>
      </div>
    </div>
  );
}

function JourneyMap({ routeCoords, stops, startName, endName }) {
  const mid = routeCoords[Math.floor(routeCoords.length / 2)];
  
  // Clean Google/Apple URL formats
  const waypointStr = stops.map(p => `${p.lat},${p.lon}`).join("|");
  const googleUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(startName)}&destination=${encodeURIComponent(endName)}&waypoints=${encodeURIComponent(waypointStr)}&travelmode=driving`;
  const appleUrl = `https://maps.apple.com/?saddr=${encodeURIComponent(startName)}` + stops.map(p => `&daddr=${p.lat},${p.lon}`).join("") + `&daddr=${encodeURIComponent(endName)}&dirflg=d`;

  return (
    <div className="map-card">
      <div className="map-card-header"><span className="map-card-icon">◎</span><span>Journey map</span></div>
      <div className="map-viewport">
        <MapContainer style={{ height: "100%", width: "100%" }} center={[mid[1], mid[0]]} zoom={6} scrollWheelZoom={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Polyline positions={routeCoords.map(c => [c[1], c[0]])} pathOptions={{ color: "#C04830", weight: 3, opacity: 0.85, dashArray: "8 5" }} />
          {stops.map((p, i) => (
            <Marker key={i} position={[p.lat, p.lon]}><Popup>{p.name || p.title}</Popup></Marker>
          ))}
        </MapContainer>
      </div>
      <div className="map-card-footer">
        <a href={googleUrl} target="_blank" rel="noreferrer" className="maps-btn maps-btn--google">Google Maps →</a>
        <a href={appleUrl} target="_blank" rel="noreferrer" className="maps-btn maps-btn--apple">Apple Maps →</a>
      </div>
    </div>
  );
}

/* ========= MAIN APP ========= */
export default function App() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pois, setPois] = useState([]);
  const [routeCoords, setCoords] = useState([]);
  const [visibleCount, setVisible] = useState(8);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setSearched] = useState(false);

  const geocode = async (place) => {
    // Identity in URL to avoid header-based CORS issues
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}&limit=1`;
    const r = await fetch(url);
    const j = await r.json();
    if (!j.length) throw new Error(`Could not find: ${place}`);
    return { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon) };
  };

  const findStops = async () => {
    if (!start || !end) return;
    setLoading(true); setSearched(true); setPois([]);
    try {
      const A = await geocode(start);
      const B = await geocode(end);
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${A.lon},${A.lat};${B.lon},${B.lat}?overview=full&geometries=geojson`);
      const data = await r.json();
      if (!data.routes?.length) throw new Error("No route found.");
      
      const coords = data.routes[0].geometry.coordinates;
      setCoords(coords);

      const candidates = [];
      ALL_POIS.forEach(p => {
        const lat = p.lat ?? p.latitude;
        const lon = p.lon ?? p.longitude;
        if (!lat || !lon) return;
        const { distance, index } = minDistanceToRoute({ lat, lon }, coords);
        if (distance <= 25) candidates.push({ ...p, lat, lon, routeIndex: index });
      });

      setPois(candidates.sort((a, b) => a.routeIndex - b.routeIndex));
      setVisible(8);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const onKey = e => { if (e.key === "Enter") findStops(); };
  const shown = pois.slice(0, visibleCount);

  return (
    <>
      {/* (Insert your exact <style> block here) */}
      <div className="page">
        <div className="hero">
          <p className="hero-eyebrow">Deutschland · Auf Entdeckungsreise</p>
          <h1 className="hero-title">Road<em>tripper</em></h1>
          <p className="hero-sub">History & heritage along your route</p>
          <DrivingScene />
        </div>

        <div className="search-panel">
          <p className="search-label">Plan your journey</p>
          <div className="search-inputs">
            <div className="search-input-wrap">
              <span className="search-input-icon">◉</span>
              <input className="search-input" placeholder="Start city" value={start} onChange={e => setStart(e.target.value)} onKeyDown={onKey} />
            </div>
            <div className="search-input-wrap">
              <span className="search-input-icon">◎</span>
              <input className="search-input" placeholder="Destination" value={end} onChange={e => setEnd(e.target.value)} onKeyDown={onKey} />
            </div>
          </div>
          <button className="search-btn" onClick={findStops} disabled={loading}>
            {loading ? "Finding stops..." : "Explore Route"}
          </button>
        </div>

        <div className="content">
          {!hasSearched && !loading && <div className="welcome">... (Your Welcome Content) ...</div>}
          {loading && <div className="loading"><p className="loading-text">Charting route...</p></div>}
          
          {!loading && shown.length > 0 && (
            <>
              <div className="results-header"><div className="results-rule" /><span className="results-count">{pois.length} stops found</span><div className="results-rule" /></div>
              {shown.map((p, i) => <Card key={i} poi={p} index={i} />)}
              {visibleCount < pois.length && <button className="load-more" onClick={() => setVisible(v => v + 6)}>More stops →</button>}
              <JourneyMap routeCoords={routeCoords} stops={shown} startName={start} endName={end} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
