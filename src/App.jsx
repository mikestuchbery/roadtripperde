import { useState, useEffect, useMemo, useCallback, memo } from "react";
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

/* ========= HELPERS & DATA ========= */
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

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Optimization: Downsample route for distance checks
function getMinDistance(poi, coords) {
  let min = Infinity, idx = 0;
  // If route is huge, check every 3rd point to speed up filtering
  const step = coords.length > 500 ? 3 : 1; 
  for (let i = 0; i < coords.length; i += step) {
    const d = haversineKm({ lat: poi.lat, lon: poi.lon }, { lat: coords[i][1], lon: coords[i][0] });
    if (d < min) { min = d; idx = i; }
  }
  return { distance: min, index: idx };
}

/* ========= COMPONENTS ========= */

const Card = memo(({ poi, index }) => {
  const name = poi.name ?? poi.title ?? "Site";
  const [img, setImg] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetchWikiImage(name).then(url => { if (active) setImg(url); });
    return () => { active = false; };
  }, [name]);

  return (
    <div className="card" style={{ animationDelay: `${index * 0.05}s` }}>
      {img ? (
        <div className="card-hero">
          <img src={img} alt={name} className={`card-hero-img${loaded ? " card-hero-img--in" : ""}`} onLoad={() => setLoaded(true)} />
          <div className="card-hero-fade" />
          <div className="card-hero-num">{index + 1}</div>
        </div>
      ) : <div className="card-noimg-num">{index + 1}</div>}
      <div className="card-body">
        <div className="card-pills">
          {poi.type && <span className="pill">{poi.type}</span>}
          {poi.era && <span className="pill pill--era">{poi.era}</span>}
        </div>
        <h2 className="card-title">{name}</h2>
        <p className="card-summary">{poi.summary || poi.description}</p>
        <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(name)}`} target="_blank" rel="noreferrer" className="card-link">More info →</a>
      </div>
    </div>
  );
});

/* ========= APP LOGIC ========= */

export default function App() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pois, setPois] = useState([]);
  const [routeCoords, setCoords] = useState([]);
  const [visibleCount, setVisible] = useState(8);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setSearched] = useState(false);

  async function geocode(place) {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}`, {
      headers: { "User-Agent": "Roadtripper-App-v2" }
    });
    const j = await r.json();
    if (!j.length) throw new Error(`Location not found: ${place}`);
    return { lat: +j[0].lat, lon: +j[0].lon };
  }

  async function findStops() {
    if (!start || !end || loading) return;
    setLoading(true); setSearched(true);
    try {
      const A = await geocode(start);
      const B = await geocode(end);
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${A.lon},${A.lat};${B.lon},${B.lat}?overview=full&geometries=geojson`);
      const routeData = await r.json();
      if (!routeData.routes?.[0]) throw new Error("No route found");
      
      const coords = routeData.routes[0].geometry.coordinates;
      setCoords(coords);

      const candidates = ALL_POIS.reduce((acc, p) => {
        const lat = p.lat ?? p.latitude;
        const lon = p.lon ?? p.longitude;
        if (!lat || !lon) return acc;
        const { distance, index } = getMinDistance({ lat, lon }, coords);
        if (distance <= 25) acc.push({ ...p, lat, lon, routeIndex: index });
        return acc;
      }, []).sort((a, b) => a.routeIndex - b.routeIndex);

      setPois(candidates);
      setVisible(8);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  const shown = useMemo(() => pois.slice(0, visibleCount), [pois, visibleCount]);

  return (
    <>
      {/* (Keep all your existing CSS here) */}
      <div className="page">
        {/* ... Hero, Search Inputs ... */}
        <button className="search-btn" onClick={findStops} disabled={loading}>
          {loading ? "Calculating..." : "Explore Route"}
        </button>
        
        <div className="content">
          {/* ... Welcome logic ... */}
          {loading && <div className="loading"><p className="loading-text">Finding history...</p></div>}
          
          {!loading && shown.map((p, i) => <Card key={`${p.name}-${i}`} poi={p} index={i} />)}
          
          {pois.length > visibleCount && (
            <button className="load-more" onClick={() => setVisible(v => v + 6)}>Load More Stops</button>
          )}

          {shown.length > 0 && (
             <JourneyMap routeCoords={routeCoords} stops={shown} startName={start} endName={end} />
          )}
        </div>
      </div>
    </>
  );
}

/* API Fetchers move outside component to avoid re-creation */
async function fetchWikiImage(title) {
  try {
    const s = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(title)}&format=json&origin=*`);
    const sj = await s.json();
    const page = sj.query.search?.[0];
    if (!page) return null;
    const p = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(page.title)}&prop=pageimages&pithumbsize=600&format=json&origin=*`);
    const pj = await p.json();
    const pg = Object.values(pj.query.pages)[0];
    return pg.thumbnail?.source || null;
  } catch { return null; }
}
