import { useState, useEffect, useMemo } from "react";
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

/* ========= GEO & API HELPERS ========= */
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
  const step = coords.length > 1000 ? 3 : 1;
  for (let i = 0; i < coords.length; i += step) {
    const d = haversineKm({ lat: poi.lat, lon: poi.lon }, { lat: coords[i][1], lon: coords[i][0] });
    if (d < min) { min = d; idx = i; }
  }
  if (step > 1) {
    const lo = Math.max(0, idx - step);
    const hi = Math.min(coords.length - 1, idx + step);
    for (let i = lo; i <= hi; i++) {
      const d = haversineKm({ lat: poi.lat, lon: poi.lon }, { lat: coords[i][1], lon: coords[i][0] });
      if (d < min) { min = d; idx = i; }
    }
  }
  return { distance: min, index: idx };
}

// FIX: Now returns { img, wikiTitle } so Card can link to the exact canonical
// Wikipedia page title found by the search, rather than encoding the raw POI name
// which often doesn't match any article (wrong case, disambiguation, German vs English, etc.)
async function fetchWikiData(name) {
  try {
    const s = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json&origin=*`);
    const sj = await s.json();
    const page = sj.query.search[0];
    if (!page) return { img: null, wikiTitle: null };
    const canonicalTitle = page.title;
    const p = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(canonicalTitle)}&prop=pageimages&pithumbsize=800&format=json&origin=*`);
    const pj = await p.json();
    const pg = Object.values(pj.query.pages)[0];
    return { img: pg.thumbnail?.source || null, wikiTitle: canonicalTitle };
  } catch { return { img: null, wikiTitle: null }; }
}

/* ========= GEOCODE ========= */
// FIX: Nominatim requires a Referer or User-Agent header via fetch — some browsers
// block this on desktop due to stricter CORS pre-flight. We now always try Nominatim
// first with a proper Accept header, and fall back to Photon reliably on any failure,
// including non-JSON responses and network errors. The `place` is also trimmed and
// has Germany appended when no country is specified, improving match quality.
async function geocode(place) {
  const query = /germany|deutschland|\bde\b/i.test(place) ? place.trim() : `${place.trim()}, Germany`;

  // --- Attempt 1: Nominatim ---
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=de&addressdetails=0`;
    const r = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Accept-Language": "en",
      },
    });
    if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`);
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.includes("json")) throw new Error("Nominatim returned non-JSON");
    const j = await r.json();
    if (!Array.isArray(j) || !j.length) throw new Error("Nominatim: no results");
    return { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon) };
  } catch (nominatimErr) {
    console.warn("Nominatim failed, falling back to Photon:", nominatimErr.message);
  }

  // --- Attempt 2: Photon (Komoot) ---
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&lang=en`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Photon HTTP ${r.status}`);
    const j = await r.json();
    if (!j.features?.length) throw new Error(`No results for: ${place}`);
    const [lon, lat] = j.features[0].geometry.coordinates;
    return { lat, lon };
  } catch (photonErr) {
    throw new Error(`Could not find "${place}". Please check the city name and try again.`);
  }
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

// Full-screen loading overlay with immersive landscape animation
function LoadingOverlay({ stage }) {
  const stages = ["Locating cities...", "Charting your route...", "Scanning for history..."];
  const stageIndex = stages.indexOf(stage);
  return (
    <div className="lo-overlay" aria-live="polite" aria-label="Loading">
      <div className="lo-sky">
        <div className="lo-sun" />
        <div className="lo-cloud lo-cloud--1" />
        <div className="lo-cloud lo-cloud--2" />
        <div className="lo-cloud lo-cloud--3" />
        {[...Array(18)].map((_, i) => (
          <div key={i} className="lo-star" style={{
            left: `${(i * 37 + 11) % 100}%`,
            top: `${(i * 19 + 5) % 38}%`,
            animationDelay: `${(i * 0.3).toFixed(1)}s`,
            width: i % 3 === 0 ? "2px" : "1px",
            height: i % 3 === 0 ? "2px" : "1px",
          }} />
        ))}
      </div>
      <div className="lo-hills lo-hills--far" />
      <div className="lo-hills lo-hills--near" />
      <div className="lo-trees" aria-hidden="true">
        {[...Array(14)].map((_, i) => (
          <div key={i} className="lo-tree" style={{ animationDelay: `${(i * -0.7).toFixed(1)}s`, height: `${52 + (i % 4) * 10}px` }}>
            <div className="lo-tree-trunk" />
            <div className="lo-tree-canopy" style={{ width: `${22 + (i % 3) * 6}px`, height: `${30 + (i % 4) * 8}px` }} />
          </div>
        ))}
      </div>
      <div className="lo-road">
        <div className="lo-road-surface" />
        <div className="lo-markings">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="lo-dash" style={{ animationDelay: `${(i * -0.38).toFixed(2)}s` }} />
          ))}
        </div>
        <div className="lo-verge lo-verge--left" />
        <div className="lo-verge lo-verge--right" />
      </div>
      <div className="lo-car" aria-hidden="true">
        <div className="lo-car-shadow" />
        <div className="lo-car-body">
          <div className="lo-car-roof" />
          <div className="lo-car-win lo-car-win--rear" />
          <div className="lo-car-win lo-car-win--front" />
          <div className="lo-car-headlight" />
          <div className="lo-car-taillight" />
        </div>
        <div className="lo-car-wheel lo-car-wheel--rear" />
        <div className="lo-car-wheel lo-car-wheel--front" />
      </div>
      <div className="lo-panel">
        <p className="lo-title">Road<em>tripper</em></p>
        <p className="lo-stage">{stage}</p>
        <div className="lo-dots">
          {stages.map((s, i) => (
            <div key={s} className={`lo-dot${i <= stageIndex ? " lo-dot--active" : ""}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

// FIX: Added mapsUrl prop — each Card now receives its coordinates and renders
// a "View on map" link that opens Google Maps at the exact lat/lon of the site.
function Card({ poi, index }) {
  const name = poi.name ?? poi.title ?? "Site";
  const [img, setImg] = useState(null);
  const [wikiTitle, setWikiTitle] = useState(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    fetchWikiData(name).then(({ img, wikiTitle }) => {
      setImg(img);
      setWikiTitle(wikiTitle);
    });
  }, [name]);

  // Build per-site map URLs using the POI's own lat/lon
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lon}&query_place_id=${encodeURIComponent(name)}`;
  const appleMapsUrl  = `https://maps.apple.com/?ll=${poi.lat},${poi.lon}&q=${encodeURIComponent(name)}&t=m`;

  return (
    <div className="card" style={{ animationDelay: `${index * 0.06}s` }}>
      {img ? (
        <div className="card-hero">
          <img src={img} alt={name} className={`card-hero-img${loaded ? " card-hero-img--in" : ""}`} onLoad={() => setLoaded(true)} />
          <div className="card-hero-fade" />
          <div className="card-hero-num">{index + 1}</div>
        </div>
      ) : <div className="card-noimg-num">{index + 1}</div>}
      <div className="card-body">
        <div className="card-pills">
          {(poi.type || poi.category) && <span className="pill">{poi.type || poi.category}</span>}
          {(poi.era || poi.century) && <span className="pill pill--era">{poi.era || poi.century}</span>}
        </div>
        <h2 className="card-title">{name}</h2>
        <p className="card-summary">{poi.summary || poi.description}</p>

        {/* === MAP LINKS === */}
        <div className="card-map-links">
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="card-map-btn card-map-btn--google"
            title={`Open ${name} in Google Maps`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/>
            </svg>
            Google Maps
          </a>
          <a
            href={appleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="card-map-btn card-map-btn--apple"
            title={`Open ${name} in Apple Maps`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/>
            </svg>
            Apple Maps
          </a>
        </div>

        {/* FIX: Use canonical wikiTitle from search API; fall back to raw name only if lookup failed */}
        {wikiTitle ? (
          <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`} target="_blank" rel="noreferrer" className="card-link">More info →</a>
        ) : (
          <a href={`https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(name)}`} target="_blank" rel="noreferrer" className="card-link">More info →</a>
        )}
      </div>
    </div>
  );
}

function JourneyMap({ routeCoords, stops, startName, endName }) {
  if (!routeCoords?.length) return null;
  const mid = routeCoords[Math.floor(routeCoords.length / 2)];
  const waypointStr = stops.slice(0, 10).map(p => `${p.lat},${p.lon}`).join("|");
  const googleUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(startName)}&destination=${encodeURIComponent(endName)}&waypoints=${encodeURIComponent(waypointStr)}&travelmode=driving`;
  const appleUrl = `https://maps.apple.com/?saddr=${encodeURIComponent(startName)}` + stops.slice(0, 10).map(p => `&daddr=${p.lat},${p.lon}`).join("") + `&daddr=${encodeURIComponent(endName)}&dirflg=d`;

  return (
    <div className="map-card">
      <div className="map-card-header"><span className="map-card-icon">◎</span><span>Journey map</span></div>
      <div className="map-viewport">
        <MapContainer style={{ height: "100%", width: "100%" }} center={[mid[1], mid[0]]} zoom={6} scrollWheelZoom={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Polyline positions={routeCoords.map(c => [c[1], c[0]])} pathOptions={{ color: "#C04830", weight: 3, opacity: 0.85, dashArray: "8 5" }} />
          {stops.map((p, i) => (
            <Marker key={p.name ?? i} position={[p.lat, p.lon]}><Popup>{p.name || p.title}</Popup></Marker>
          ))}
        </MapContainer>
      </div>
      <div className="map-card-footer">
        <a href={googleUrl} target="_blank" rel="noreferrer" className="maps-btn maps-btn--google">Open in Google Maps →</a>
        <a href={appleUrl} target="_blank" rel="noreferrer" className="maps-btn maps-btn--apple">Open in Apple Maps →</a>
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
  const [loadingStage, setLoadingStage] = useState("");
  const [hasSearched, setSearched] = useState(false);

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
      const seen = new Set();
      const candidates = ALL_POIS.reduce((acc, p) => {
        const lat = p.lat ?? p.latitude;
        const lon = p.lon ?? p.longitude;
        if (!lat || !lon) return acc;
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
    } catch (e) { alert(e.message); } finally {
      setLoading(false);
      setLoadingStage("");
    }
  };

  const shown = useMemo(() => pois.slice(0, visibleCount), [pois, visibleCount]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lora:ital,wght@0,400;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: #E8DEC6; min-height: 100dvh; }
        .hero { background: #1C1208; padding: 52px 20px 0; position: relative; overflow: hidden; text-align: center; }
        .hero-title { font-family: 'Playfair Display', serif; font-size: clamp(48px, 13vw, 72px); color: #F5EDDA; line-height: .95; }
        .hero-title em { font-style: italic; color: #D4A050; }
        .hero-sub { font-family: 'Lora', serif; font-style: italic; color: #A89060; font-size: 15px; margin-top: 10px; }
        .scene { position: relative; height: 100px; overflow: hidden; margin-top: 20px; }
        .scene-sky { position: absolute; inset: 0; background: linear-gradient(180deg, #7AAECC 0%, #B8D8EC 50%, #D4A84A 100%); }
        .scene-sun { position: absolute; top: 10px; right: 48px; width: 20px; height: 20px; border-radius: 50%; background: radial-gradient(circle, #FFE860 20%, #FFB020 100%); }
        .scene-road { position: absolute; bottom: 0; left: 0; right: 0; height: 28px; background: #7A7A7A; border-top: 2px solid #929292; display: flex; align-items: center; overflow: hidden; }
        .scene-dash { width: 36px; height: 3px; background: #F0D840; margin-right: 28px; animation: dash .65s linear infinite; }
        @keyframes dash { from { transform: translateX(64px); } to { transform: translateX(-64px); } }
        .scene-car { position: absolute; bottom: 8px; left: 26%; animation: bob .32s ease-in-out infinite alternate; }
        @keyframes bob { from { transform: translateY(0); } to { transform: translateY(-2px); } }
        .scene-car-body { width: 64px; height: 20px; background: #C04830; border-radius: 3px; position: relative; }
        .scene-car-roof { position: absolute; top: -13px; left: 10px; width: 38px; height: 15px; background: #A03820; border-radius: 5px 5px 0 0; }
        .scene-win { position: absolute; top: -10px; height: 9px; background: rgba(160,210,240,.88); border-radius: 2px 2px 0 0; }
        .scene-win--front { width: 14px; left: 34px; } .scene-win--rear { width: 13px; left: 16px; }
        .scene-headlight { position: absolute; right: 2px; top: 6px; width: 4px; height: 5px; background: #FFE880; border-radius: 1px; }
        .scene-wheel { position: absolute; bottom: -6px; width: 13px; height: 13px; border-radius: 50%; background: #1A1A1A; border: 2px solid #444; animation: spin .38s linear infinite; }
        .scene-wheel--front { right: 7px; } .scene-wheel--rear { left: 7px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .search-panel { background: #1C1208; padding: 20px 20px 28px; }
        .search-inputs { display: flex; flex-direction: column; margin-bottom: 14px; border-radius: 10px; overflow: hidden; border: 1.5px solid #3A2A10; }
        .search-input { flex: 1; padding: 15px; background: #261C0C; border: none; border-bottom: 1px solid #3A2A10; font-size: 16px; color: #F0E4C8; outline: none; }
        .search-btn { width: 100%; padding: 16px; border: none; border-radius: 10px; background: #C04830; color: #FFF; font-weight: 500; cursor: pointer; }
        .search-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .overlay { position: fixed; inset: 0; background: rgba(28, 18, 8, 0.95); z-index: 10000; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #F5EDDA; }
        .overlay-text { font-family: 'Lora', serif; font-style: italic; margin-top: 20px; font-size: 18px; }

        /* === FULL-SCREEN LOADING OVERLAY === */
        .lo-overlay { position: fixed; inset: 0; z-index: 10000; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding-bottom: 0; }

        /* Sky */
        .lo-sky { position: absolute; inset: 0; background: linear-gradient(180deg, #0D1B2A 0%, #1A3A5C 30%, #7AAECC 60%, #D4A84A 85%, #C06030 100%); }
        .lo-sun { position: absolute; top: 18%; right: 22%; width: 56px; height: 56px; border-radius: 50%; background: radial-gradient(circle, #FFE860 20%, #FFB020 60%, rgba(255,140,0,0) 100%); box-shadow: 0 0 60px 20px rgba(255,180,30,0.35); animation: lo-sun-rise 3s ease-out forwards; }
        @keyframes lo-sun-rise { from { transform: translateY(30px); opacity: 0.4; } to { transform: translateY(0); opacity: 1; } }

        /* Stars */
        .lo-star { position: absolute; background: #FFF; border-radius: 50%; animation: lo-twinkle 2s ease-in-out infinite alternate; }
        @keyframes lo-twinkle { from { opacity: 0.7; } to { opacity: 0.1; } }

        /* Clouds */
        .lo-cloud { position: absolute; background: rgba(255,255,255,0.18); border-radius: 50px; animation: lo-drift linear infinite; }
        .lo-cloud--1 { width: 120px; height: 28px; top: 22%; left: -130px; animation-duration: 18s; animation-delay: 0s; }
        .lo-cloud--2 { width: 80px;  height: 20px; top: 30%; left: -90px;  animation-duration: 24s; animation-delay: -8s; }
        .lo-cloud--3 { width: 160px; height: 32px; top: 16%; left: -170px; animation-duration: 30s; animation-delay: -14s; }
        @keyframes lo-drift { from { transform: translateX(0); } to { transform: translateX(120vw); } }

        /* Hills */
        .lo-hills { position: absolute; left: -5%; right: -5%; }
        .lo-hills--far  { bottom: 34%; height: 18%; background: #2A5C3A; border-radius: 60% 70% 0 0 / 80% 80% 0 0; }
        .lo-hills--near { bottom: 26%; height: 16%; background: #1E4428; border-radius: 55% 65% 0 0 / 80% 80% 0 0; }

        /* Trees */
        .lo-trees { position: absolute; bottom: 26%; left: 0; right: 0; height: 90px; display: flex; align-items: flex-end; overflow: hidden; }
        .lo-tree { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; margin-right: 18px; animation: lo-tree-scroll 3.5s linear infinite; flex-shrink: 0; }
        @keyframes lo-tree-scroll { from { transform: translateX(110vw); } to { transform: translateX(-120px); } }
        .lo-tree-trunk { width: 6px; height: 14px; background: #5C3A1A; border-radius: 2px; }
        .lo-tree-canopy { background: #2D6A3A; border-radius: 50% 50% 40% 40%; margin-bottom: -4px; }

        /* Road */
        .lo-road { position: absolute; bottom: 0; left: 0; right: 0; height: 26%; }
        .lo-road-surface { position: absolute; inset: 0; background: #4A4A4A; }
        .lo-road::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: #6A6A6A; }
        .lo-verge { position: absolute; top: 0; width: 18px; height: 100%; }
        .lo-verge--left  { left: 0;  background: #2A5C1A; }
        .lo-verge--right { right: 0; background: #2A5C1A; }
        .lo-markings { position: absolute; top: 50%; left: 0; right: 0; transform: translateY(-50%); display: flex; align-items: center; overflow: hidden; }
        .lo-dash { width: 52px; height: 4px; background: #F0D840; margin-right: 40px; border-radius: 2px; flex-shrink: 0; animation: lo-road-scroll 0.55s linear infinite; }
        @keyframes lo-road-scroll { from { transform: translateX(92px); } to { transform: translateX(-92px); } }

        /* Car */
        .lo-car { position: absolute; bottom: 20%; left: 50%; transform: translateX(-50%); animation: lo-bob 0.28s ease-in-out infinite alternate; }
        @keyframes lo-bob { from { transform: translateX(-50%) translateY(0); } to { transform: translateX(-50%) translateY(-3px); } }
        .lo-car-shadow { position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); width: 110px; height: 8px; background: rgba(0,0,0,0.4); border-radius: 50%; filter: blur(3px); }
        .lo-car-body { width: 110px; height: 34px; background: #C04830; border-radius: 5px; position: relative; }
        .lo-car-roof { position: absolute; top: -22px; left: 18px; width: 64px; height: 26px; background: #A03820; border-radius: 8px 8px 0 0; }
        .lo-car-win { position: absolute; top: -17px; height: 14px; background: rgba(160,210,240,0.88); border-radius: 3px 3px 0 0; }
        .lo-car-win--front { width: 24px; left: 58px; }
        .lo-car-win--rear  { width: 22px; left: 24px; }
        .lo-car-headlight { position: absolute; right: 3px; top: 10px; width: 7px; height: 8px; background: #FFE880; border-radius: 2px; box-shadow: 0 0 8px 3px rgba(255,230,100,0.5); }
        .lo-car-taillight { position: absolute; left: 3px; top: 10px; width: 6px; height: 8px; background: #FF3020; border-radius: 2px; box-shadow: 0 0 6px 2px rgba(255,50,20,0.4); }
        .lo-car-wheel { position: absolute; bottom: -10px; width: 22px; height: 22px; border-radius: 50%; background: #1A1A1A; border: 3px solid #555; animation: lo-spin 0.35s linear infinite; }
        .lo-car-wheel--front { right: 12px; }
        .lo-car-wheel--rear  { left: 12px; }
        @keyframes lo-spin { to { transform: rotate(360deg); } }

        /* Text panel */
        .lo-panel { position: absolute; top: 6%; left: 50%; transform: translateX(-50%); text-align: center; }
        .lo-title { font-family: 'Playfair Display', serif; font-size: clamp(36px, 10vw, 56px); color: #F5EDDA; line-height: 1; text-shadow: 0 2px 20px rgba(0,0,0,0.5); }
        .lo-title em { font-style: italic; color: #D4A050; }
        .lo-stage { font-family: 'Lora', serif; font-style: italic; color: #C8B888; font-size: 16px; margin-top: 10px; animation: lo-fade-pulse 1.4s ease-in-out infinite alternate; }
        @keyframes lo-fade-pulse { from { opacity: 0.6; } to { opacity: 1; } }
        .lo-dots { display: flex; gap: 8px; justify-content: center; margin-top: 14px; }
        .lo-dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.2); transition: background 0.4s, transform 0.4s; }
        .lo-dot--active { background: #D4A050; transform: scale(1.25); }
        .content { padding: 24px 16px; }
        .welcome { background: #FAF4E4; border-radius: 14px; padding: 24px 20px; margin-bottom: 16px; box-shadow: 0 2px 12px rgba(30,16,4,.08); }
        .welcome-steps { list-style: none; }
        .welcome-steps li { display: flex; align-items: flex-start; gap: 12px; font-size: 14px; margin-bottom: 12px; color: #5A4228; }
        .card { background: #FAF4E4; border-radius: 14px; overflow: hidden; margin-bottom: 16px; box-shadow: 0 2px 12px rgba(30,16,4,.1); }
        .card-hero { height: 220px; position: relative; overflow: hidden; }
        .card-hero-img { width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .5s; }
        .card-hero-img--in { opacity: 1; }
        .card-hero-fade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(20,10,2,.5) 0%, transparent 50%); }
        .card-hero-num { position: absolute; top: 12px; left: 12px; width: 30px; height: 30px; border-radius: 50%; background: rgba(20,10,2,.7); color: #F0DCA8; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; }
        .card-noimg-num { width: 32px; height: 32px; border-radius: 50%; background: #1C1208; color: #F0DCA8; display: flex; align-items: center; justify-content: center; margin: 16px; font-size: 12px; }
        .card-body { padding: 16px; }
        .pill { background: #EEE0BA; padding: 3px 8px; font-size: 9px; border-radius: 4px; text-transform: uppercase; margin-right: 5px; }
        .pill--era { background: #D4C8A0; }
        .card-pills { margin-bottom: 4px; }
        .card-title { font-family: 'Playfair Display', serif; font-size: 22px; margin: 8px 0; }
        .card-summary { font-size: 13px; line-height: 1.55; color: #4A3820; margin-bottom: 12px; }

        /* === MAP LINKS ON CARD === */
        .card-map-links {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .card-map-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          text-decoration: none;
          letter-spacing: 0.2px;
          transition: opacity 0.15s;
        }
        .card-map-btn:hover { opacity: 0.82; }
        .card-map-btn--google { background: #E8F0FE; color: #1A55CC; }
        .card-map-btn--apple  { background: #1C1208; color: #D4B870; }

        .card-link { color: #C04830; text-decoration: none; font-weight: 500; font-size: 13px; }
        .map-card { background: #FAF4E4; border-radius: 14px; overflow: hidden; margin-top: 20px; box-shadow: 0 2px 12px rgba(30,16,4,.1); }
        .map-card-header { display: flex; align-items: center; gap: 8px; padding: 14px 16px; font-weight: 500; font-size: 14px; border-bottom: 1px solid #E8DEC6; }
        .map-card-icon { color: #C04830; font-size: 18px; }
        .map-viewport { height: 280px; }
        .map-card-footer { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
        .maps-btn { display: block; text-align: center; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: 500; }
        .maps-btn--google { background: #C04830; color: #FFF; }
        .maps-btn--apple { background: #2E2010; color: #D4B870; }
        .footer { padding: 32px 16px 80px; text-align: center; }
        .footer-love { font-family: 'Lora', serif; font-style: italic; font-size: 15px; color: #7A6035; margin-bottom: 8px; }
        .footer-email { font-size: 13px; color: #C04830; text-decoration: none; }
        .footer-copy { font-size: 11px; color: #A89060; margin-top: 8px; }
        .kofi { position: fixed; right: 16px; bottom: 24px; height: 44px; padding: 0 16px; border-radius: 22px; background: #FAF0C8; border: 1.5px solid #D4B860; display: flex; align-items: center; gap: 7px; text-decoration: none; box-shadow: 0 4px 20px rgba(0,0,0,0.2); z-index: 9999; }
        .kofi-label { font-size: 12px; font-weight: 500; color: #5A3C10; }
      `}</style>

      {loading && <LoadingOverlay stage={loadingStage} />}

      <div className="page">
        <div className="hero">
          <h1 className="hero-title">Road<em>tripper</em></h1>
          <p className="hero-sub">History &amp; heritage along your route</p>
          <DrivingScene />
        </div>

        <div className="search-panel">
          <div className="search-inputs">
            <input className="search-input" placeholder="Start city" value={start} onChange={e => setStart(e.target.value)} />
            <input className="search-input" placeholder="Destination" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
          <button className="search-btn" onClick={findStops} disabled={loading}>
            {loading ? "Searching..." : "Explore Route"}
          </button>
        </div>

        <div className="content">
          {!hasSearched && !loading && (
            <div className="welcome">
              <h2 style={{ fontFamily: 'Playfair Display', marginBottom: '16px' }}>How it works</h2>
              <ul className="welcome-steps">
                <li>Enter start and destination in Germany.</li>
                <li>Discover historic sites within 25km of your path.</li>
                <li>Read entries or navigate via Google/Apple Maps.</li>
              </ul>
              <div style={{ height: '1px', background: '#D4B860', margin: '16px 0' }} />
              <p className="footer-love">A labour of love by <strong>Mike Stuchbery</strong></p>
              <a href="mailto:michael.stuchbery@gmail.com" className="footer-email">michael.stuchbery@gmail.com</a>
              <p className="footer-copy">© 2026 Mike Stuchbery</p>
            </div>
          )}

          {!loading && shown.map((p, i) => <Card key={p.name ?? i} poi={p} index={i} />)}

          {visibleCount < pois.length && (
            <button className="search-btn" style={{ background: 'transparent', color: '#C04830', border: '1px solid #C04830' }} onClick={() => setVisible(v => v + 6)}>Load More Stops</button>
          )}

          {shown.length > 0 && (
            <>
              <JourneyMap routeCoords={routeCoords} stops={pois} startName={start} endName={end} />
              <footer className="footer">
                <p className="footer-love">A labour of love by <strong>Mike Stuchbery</strong></p>
                <a href="mailto:michael.stuchbery@gmail.com" className="footer-email">michael.stuchbery@gmail.com</a>
                <p className="footer-copy">© 2026 Mike Stuchbery</p>
              </footer>
            </>
          )}
        </div>
      </div>

      <a href="https://ko-fi.com/mikestuchbery" target="_blank" rel="noopener noreferrer" className="kofi">
        ☕ <span className="kofi-label">Buy a coffee</span>
      </a>
    </>
  );
}
