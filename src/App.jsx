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
async function geocode(place) {
  const query = /germany|deutschland|\bde\b/i.test(place) ? place.trim() : `${place.trim()}, Germany`;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=de&addressdetails=0`;
    const r = await fetch(url, {
      headers: { "Accept": "application/json", "Accept-Language": "en" },
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
function HeroSteps() {
  const steps = [
    { num: "1", label: "Enter cities", detail: "Start & destination in Germany" },
    { num: "2", label: "Chart your route", detail: "We map the driving path" },
    { num: "3", label: "Discover history", detail: "Sites within 25 km of your route" },
  ];
  return (
    <div className="hero-steps" aria-label="How it works">
      {steps.map((s, i) => (
        <div key={i} className="hero-step" style={{ animationDelay: `${0.30 + i * 0.13}s` }}>
          <span className="hero-step-num" aria-hidden="true">{s.num}</span>
          <span className="hero-step-label">{s.label}</span>
          <span className="hero-step-detail">{s.detail}</span>
        </div>
      ))}
    </div>
  );
}

function LoadingOverlay({ stage }) {
  const stages = ["Locating cities...", "Charting your route...", "Scanning for history..."];
  const stageIndex = stages.indexOf(stage);
  // Deterministic dot positions so no hydration jitter
  const dots = [
    { cx: 18, cy: 40 }, { cx: 50, cy: 26 }, { cx: 82, cy: 38 },
    { cx: 62, cy: 56 }, { cx: 34, cy: 60 }, { cx: 72, cy: 68 },
  ];
  return (
    <div className="lo-overlay" aria-live="polite" aria-label="Loading">
      <div className="lo-backdrop" />
      <div className="lo-box">
        <svg className="lo-map" viewBox="0 0 100 90" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          {/* road segments between dots */}
          {dots.slice(0, -1).map((d, i) => (
            <line key={i}
              x1={d.cx} y1={d.cy} x2={dots[i+1].cx} y2={dots[i+1].cy}
              stroke="rgba(212,160,80,0.18)" strokeWidth="1.5" strokeDasharray="3 3"
            />
          ))}
          {/* animated travelling line */}
          <polyline
            points={dots.map(d => `${d.cx},${d.cy}`).join(' ')}
            fill="none" stroke="#D4A050" strokeWidth="1.5"
            strokeDasharray="200" strokeDashoffset="200"
            className="lo-route-line"
          />
          {/* waypoint circles */}
          {dots.map((d, i) => (
            <circle key={i} cx={d.cx} cy={d.cy} r="4.5"
              fill="#1C1208" stroke="#D4A050" strokeWidth="1.5"
              className="lo-dot-circle"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
          {/* start pin */}
          <circle cx={dots[0].cx} cy={dots[0].cy} r="6" fill="#D4A050" opacity="0.9" />
          {/* end pin */}
          <circle cx={dots[dots.length-1].cx} cy={dots[dots.length-1].cy} r="6" fill="#C04830" opacity="0.9" />
        </svg>
        <p className="lo-stage">{stage || "Finding your route…"}</p>
        <div className="lo-progress">
          {stages.map((s, i) => (
            <div key={s} className={`lo-pip${i <= stageIndex ? " lo-pip--on" : ""}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function WindscreenHeader({ startName, endName, siteCount, distanceKm }) {
  return (
    <div className="ws-wrap" aria-label={`Route from ${startName} to ${endName}`}>
      <p className="ws-eyebrow">Your route</p>
      <h2 className="ws-heading">
        <span className="ws-city">{startName}</span>
        <span className="ws-arrow" aria-hidden="true"> → </span>
        <span className="ws-city">{endName}</span>
      </h2>
      <div className="ws-rule" aria-hidden="true" />
      {(siteCount > 0 || distanceKm) && (
        <p className="ws-meta">
          {siteCount > 0 && <span>{siteCount} {siteCount === 1 ? "site" : "sites"}</span>}
          {siteCount > 0 && distanceKm && <span className="ws-meta-dot" aria-hidden="true"> · </span>}
          {distanceKm && <span>{distanceKm.toLocaleString()} km</span>}
        </p>
      )}
    </div>
  );
}

function Card({ poi, index, animDelay, inJourney, onToggleJourney }) {
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

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lon}&query_place_id=${encodeURIComponent(name)}`;
  const appleMapsUrl  = `https://maps.apple.com/?ll=${poi.lat},${poi.lon}&q=${encodeURIComponent(name)}&t=m`;

  return (
    <div className="card" style={{ animationDelay: `${(animDelay ?? index) * 0.06}s` }}>
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
        <div className="card-map-links">
          <a href={googleMapsUrl} target="_blank" rel="noreferrer" className="card-map-btn card-map-btn--google" title={`Open ${name} in Google Maps`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/>
            </svg>
            Google Maps
          </a>
          <a href={appleMapsUrl} target="_blank" rel="noreferrer" className="card-map-btn card-map-btn--apple" title={`Open ${name} in Apple Maps`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/>
            </svg>
            Apple Maps
          </a>
        </div>
        {wikiTitle ? (
          <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`} target="_blank" rel="noreferrer" className="card-link">More info →</a>
        ) : (
          <a href={`https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(name)}`} target="_blank" rel="noreferrer" className="card-link">More info →</a>
        )}
        <button className={`jrn-btn${inJourney ? " jrn-btn--in" : ""}`} onClick={onToggleJourney}>
          {inJourney ? "✓ In journey" : "+ Add to journey"}
        </button>
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

/* ========= JOURNEY DRAWER ========= */
function JourneyDrawer({ journey, onRemove, start, end }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!journey.length) return null;

  const waypointStr = journey.slice(0, 9).map(p => `${p.lat},${p.lon}`).join("|");
  const origin = start || (journey[0].lat + "," + journey[0].lon);
  const dest   = end   || (journey[journey.length - 1].lat + "," + journey[journey.length - 1].lon);
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(dest)}&waypoints=${encodeURIComponent(waypointStr)}&travelmode=driving`;

  const copyList = () => {
    const header = start && end ? `RoadTripperDE Journey: ${start} → ${end}\n${"─".repeat(40)}\n` : "RoadTripperDE Journey\n─────────────────────\n";
    const lines = journey.map((p, i) => {
      const name = p.name ?? p.title ?? "Site";
      return `${i + 1}. ${name}\n   📍 ${p.lat}, ${p.lon}${p.type ? `  [${p.type}]` : ""}`;
    }).join("\n\n");
    navigator.clipboard.writeText(header + lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="jrn-drawer">
      <button className="jrn-handle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="jrn-handle-left">
          <span>My Journey</span>
          <span className="jrn-badge">{journey.length} {journey.length === 1 ? "stop" : "stops"}</span>
        </span>
        <span className={`jrn-chevron${open ? " jrn-chevron--open" : ""}`}>▲</span>
      </button>
      {open && (
        <div className="jrn-content">
          <ul className="jrn-list">
            {journey.map((p, i) => (
              <li key={p.name ?? i} className="jrn-item">
                <span className="jrn-item-num">{i + 1}</span>
                <span className="jrn-item-name">{p.name ?? p.title}</span>
                <button className="jrn-remove" onClick={() => onRemove(p)} aria-label={`Remove ${p.name ?? p.title}`}>✕</button>
              </li>
            ))}
          </ul>
          <div className="jrn-actions">
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="jrn-action-btn jrn-action-btn--maps">Open in Google Maps →</a>
            <button className={`jrn-action-btn jrn-action-btn--copy${copied ? " copied" : ""}`} onClick={copyList}>
              {copied ? "✓ Copied!" : "Copy list"}
            </button>
          </div>
        </div>
      )}
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
  const [routeDistanceKm, setRouteDistanceKm] = useState(null);
  const [journey, setJourney] = useState([]);

  const toggleJourney = (poi) => {
    const key = poi.name ?? poi.title;
    setJourney(prev =>
      prev.some(p => (p.name ?? p.title) === key)
        ? prev.filter(p => (p.name ?? p.title) !== key)
        : [...prev, poi]
    );
  };

  const findStops = async () => {
    if (!start || !end || loading) return;
    setLoading(true); setSearched(true); setPois([]); setCoords([]); setRouteDistanceKm(null);
    try {
      setLoadingStage("Locating cities...");
      const A = await geocode(start);
      const B = await geocode(end);
      setLoadingStage("Charting your route...");
      const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${A.lon},${A.lat};${B.lon},${B.lat}?overview=full&geometries=geojson`);
      const data = await r.json();
      if (!data.routes?.length) throw new Error("No route found.");
      const coords = data.routes[0].geometry.coordinates;
      const distKm = Math.round((data.routes[0].distance ?? 0) / 1000);
      setCoords(coords);
      setRouteDistanceKm(distKm);
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
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: #E8DEC6; min-height: 100dvh; }

        :root { --eq: cubic-bezier(0.25, 1, 0.5, 1); --ei: cubic-bezier(0.4, 0, 0.2, 1); }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .hero { background: #1C1208; padding: 52px 20px 0; position: relative; overflow: hidden; text-align: center; }
        .hero::after { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 80% 60% at 50% 120%, rgba(212,160,80,0.10) 0%, transparent 70%); pointer-events: none; }
        .hero-title { font-family: 'Overpass', sans-serif; font-size: clamp(42px, 12vw, 68px); font-weight: 900; letter-spacing: -0.01em; color: #F5EDDA; line-height: .95; text-transform: uppercase; animation: fadeUp 0.5s var(--eq) both 0.05s; }
        .hero-title .title-de { color: #D4A050; }
        .hero-title .beta-tag {
          font-family: 'DM Sans', sans-serif;
          font-style: normal;
          font-size: clamp(10px, 2.5vw, 13px);
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #C04830;
          background: rgba(192,72,48,0.12);
          border: 1px solid rgba(192,72,48,0.35);
          border-radius: 4px;
          padding: 3px 7px;
          vertical-align: super;
          margin-left: 6px;
          line-height: 1;
          display: inline-block;
          position: relative;
          top: -0.1em;
        }
        .hero-sub { font-family: 'Lora', serif; font-style: italic; color: #A89060; font-size: 15px; margin-top: 10px; animation: fadeUp 0.5s var(--eq) both 0.18s; }
        /* ── HeroSteps ── */
        .hero-steps {
          display: flex; flex-direction: row; justify-content: center;
          gap: 0; margin-top: 36px; padding: 0 12px 2px;
        }
        .hero-step {
          display: flex; flex-direction: column; align-items: center;
          flex: 1; max-width: 160px; padding: 0 10px;
          opacity: 0; animation: fadeUp 0.45s var(--eq) both;
        }
        .hero-step + .hero-step {
          border-left: 1px solid rgba(212,160,80,0.15);
        }
        .hero-step-num {
          font-family: 'Playfair Display', serif;
          font-style: italic; font-size: 48px; line-height: 1;
          color: #D4A050; display: block; margin-bottom: 8px;
        }
        .hero-step-label {
          font-family: 'Playfair Display', serif;
          font-size: 13px; color: #F0E4C8; text-align: center;
          line-height: 1.3; margin-bottom: 5px;
        }
        .hero-step-detail {
          font-family: 'DM Sans', sans-serif;
          font-size: 11px; color: rgba(212,160,80,0.55);
          text-align: center; line-height: 1.4;
        }
        .search-panel { background: #1C1208; padding: 20px 20px 28px; animation: fadeIn 0.35s ease both 0.08s; }
        .search-inputs { display: flex; flex-direction: column; margin-bottom: 14px; border-radius: 10px; overflow: hidden; border: 1.5px solid #3A2A10; transition: border-color 0.2s; }
        .search-inputs:focus-within { border-color: #D4A050; }
        .search-input { flex: 1; padding: 15px; background: #261C0C; border: none; border-bottom: 1px solid #3A2A10; font-size: 16px; color: #F0E4C8; outline: none; font-family: 'DM Sans', sans-serif; transition: background 0.18s; }
        .search-input:focus { background: #2e200e; }
        .search-input::placeholder { color: rgba(240,228,200,0.3); }
        .search-btn { width: 100%; padding: 16px; border: none; border-radius: 10px; background: #C04830; color: #FFF; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 15px; transition: background 0.18s var(--ei), transform 0.15s var(--eq); }
        .search-btn:hover:not(:disabled) { background: #d45038; transform: translateY(-1px); }
        .search-btn:active:not(:disabled) { transform: translateY(0); }
        .search-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        /* ── Loading overlay ── */
        .lo-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; }
        .lo-backdrop { position: absolute; inset: 0; background: rgba(20,12,4,0.78); backdrop-filter: blur(3px); }
        .lo-box {
          position: relative; z-index: 1;
          background: #1C1208; border: 1px solid rgba(212,160,80,0.2); border-radius: 16px;
          padding: 28px 32px; width: min(320px, 88vw); text-align: center;
          box-shadow: 0 20px 60px rgba(0,0,0,0.6);
          animation: fadeUp 0.3s var(--eq) both;
        }
        .lo-map { width: 100%; height: auto; margin-bottom: 16px; display: block; }
        /* travelling route line */
        .lo-route-line { animation: lo-draw 2.4s ease-in-out infinite; }
        @keyframes lo-draw {
          0%   { stroke-dashoffset: 200; opacity: 0.4; }
          50%  { stroke-dashoffset: 0;   opacity: 1; }
          100% { stroke-dashoffset: -200; opacity: 0.4; }
        }
        /* waypoint circle pulse */
        .lo-dot-circle { animation: lo-dot-pulse 1.4s ease-in-out infinite alternate; }
        @keyframes lo-dot-pulse {
          from { r: 3.5; opacity: 0.5; }
          to   { r: 5;   opacity: 1; }
        }
        .lo-stage { font-family: 'Lora', serif; font-style: italic; color: #C8B888; font-size: 14px; margin-bottom: 14px; animation: lo-fade-pulse 1.4s ease-in-out infinite alternate; }
        @keyframes lo-fade-pulse { from { opacity: 0.6; } to { opacity: 1; } }
        .lo-progress { display: flex; gap: 6px; justify-content: center; }
        .lo-pip { width: 28px; height: 3px; border-radius: 2px; background: rgba(212,160,80,0.18); transition: background 0.4s; }
        .lo-pip--on { background: #D4A050; }

        /* ── WindscreenHeader ── */
        .ws-wrap {
          margin-bottom: 24px; text-align: center;
          animation: fadeUp 0.4s var(--eq) both;
          padding: 4px 0 20px;
        }
        .ws-eyebrow {
          font-family: 'DM Sans', sans-serif;
          font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase;
          color: #7A6035; margin-bottom: 8px;
        }
        .ws-heading {
          font-family: 'Playfair Display', serif;
          font-size: clamp(22px, 6vw, 32px);
          font-weight: 400; color: #2A1A08; line-height: 1.15;
        }
        .ws-city { font-style: italic; }
        .ws-arrow { color: #7A6035; font-style: normal; opacity: 1; font-size: 0.8em; }
        .ws-rule {
          width: 40px; height: 1px; background: rgba(90,60,16,0.3);
          margin: 14px auto 10px;
        }
        .ws-meta {
          font-family: 'DM Sans', sans-serif;
          font-size: 12px; color: #7A6035;
          letter-spacing: 0.06em;
        }
        .ws-meta-dot { opacity: 0.5; }

        /* ── Empty state ── */
        .empty-state {
          text-align: center; padding: 48px 24px;
          animation: fadeUp 0.4s var(--eq) both;
        }
        .empty-icon { font-size: 36px; margin-bottom: 16px; }
        .empty-title {
          font-family: 'Playfair Display', serif;
          font-size: 20px; color: #3A2A10; margin-bottom: 10px;
        }
        .empty-body {
          font-size: 13px; color: #7A6035; line-height: 1.6; max-width: 280px; margin: 0 auto;
        }

        /* ── Welcome / discover prompt ── */
        .discover-prompt {
          background: #FAF4E4; border-radius: 14px; padding: 32px 24px;
          margin-bottom: 16px; box-shadow: 0 2px 12px rgba(30,16,4,.08);
          text-align: center;
          animation: fadeUp 0.4s var(--eq) both 0.1s;
          opacity: 0;
        }
        .discover-icon {
          font-size: 40px; display: block; margin-bottom: 14px;
          animation: fadeUp 0.4s var(--eq) both 0.2s;
          opacity: 0;
        }
        .discover-heading {
          font-family: 'Playfair Display', serif;
          font-size: clamp(18px, 5vw, 22px);
          font-weight: 400; color: #2A1A08;
          margin-bottom: 8px;
          line-height: 1.25;
        }
        .discover-heading em { font-style: italic; color: #C04830; }
        .discover-sub {
          font-family: 'Lora', serif;
          font-style: italic;
          font-size: 13px;
          color: #7A6035;
          line-height: 1.6;
        }
        .discover-divider {
          width: 36px; height: 1px;
          background: rgba(212,160,80,0.4);
          margin: 18px auto 16px;
        }
        .discover-credit {
          font-size: 12px; color: #9A7845; line-height: 1.8;
        }
        .discover-credit a {
          color: #C04830; text-decoration: none;
          border-bottom: 1px solid rgba(192,72,48,0.3);
          transition: border-color 0.15s;
        }
        .discover-credit a:hover { border-bottom-color: #C04830; }

        .content { padding: 24px 16px; }
        .card {
          background: #FAF4E4; border-radius: 14px; overflow: hidden; margin-bottom: 16px;
          box-shadow: 0 2px 12px rgba(30,16,4,.1);
          opacity: 0; transform: translateY(14px);
          animation: fadeUp 0.38s var(--eq) forwards;
          transition: transform 0.22s var(--eq), box-shadow 0.22s var(--eq);
          position: relative;
        }
        .card:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(30,16,4,0.14); }
        .card::before { content: ''; position: absolute; top: 14px; bottom: 14px; left: 0; width: 3px; background: #D4A050; border-radius: 0 2px 2px 0; transition: top 0.22s var(--eq), bottom 0.22s var(--eq); }
        .card:hover::before { top: 0; bottom: 0; border-radius: 0; }
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
        .card-map-links { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
        .card-map-btn { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 500; text-decoration: none; letter-spacing: 0.2px; transition: opacity 0.15s, transform 0.15s var(--eq); }
        .card-map-btn:hover { opacity: 0.82; transform: translateY(-1px); }
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
        .kofi { position: fixed; right: 16px; bottom: 24px; height: 44px; padding: 0 16px; border-radius: 22px; background: #FAF0C8; border: 1.5px solid #D4B860; display: flex; align-items: center; gap: 7px; text-decoration: none; box-shadow: 0 4px 20px rgba(0,0,0,0.2); z-index: 9999; transition: transform 0.18s var(--eq), box-shadow 0.18s, bottom 0.3s var(--eq); }
        .kofi:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,0,0,0.25); }
        .kofi-label { font-size: 12px; font-weight: 500; color: #5A3C10; }

        /* ── Journey drawer ── */
        .jrn-drawer { position: fixed; bottom: 0; left: 0; right: 0; z-index: 9998; background: #1C1208; border-top: 1px solid rgba(212,160,80,0.25); box-shadow: 0 -4px 24px rgba(0,0,0,0.4); }
        .jrn-handle { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; background: none; border: none; cursor: pointer; color: #F0E4C8; font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500; }
        .jrn-handle-left { display: flex; align-items: center; gap: 10px; }
        .jrn-badge { background: #D4A050; color: #1C1208; border-radius: 10px; padding: 2px 8px; font-size: 11px; font-weight: 700; }
        .jrn-chevron { color: #D4A050; font-size: 12px; transition: transform 0.25s var(--eq); }
        .jrn-chevron--open { transform: rotate(180deg); }
        .jrn-content { padding: 0 16px 20px; max-height: 260px; overflow-y: auto; }
        .jrn-list { list-style: none; margin-bottom: 12px; }
        .jrn-item { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid rgba(212,160,80,0.1); }
        .jrn-item-num { width: 22px; height: 22px; border-radius: 50%; background: rgba(212,160,80,0.12); color: #D4A050; font-size: 10px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .jrn-item-name { flex: 1; font-size: 13px; color: #F0E4C8; line-height: 1.3; }
        .jrn-remove { background: none; border: none; color: rgba(240,228,200,0.35); cursor: pointer; font-size: 15px; padding: 2px 6px; transition: color 0.15s; line-height: 1; }
        .jrn-remove:hover { color: #C04830; }
        .jrn-actions { display: flex; gap: 8px; }
        .jrn-action-btn { flex: 1; padding: 11px; border-radius: 8px; font-size: 12px; font-weight: 500; text-align: center; cursor: pointer; transition: opacity 0.15s; font-family: 'DM Sans', sans-serif; text-decoration: none; display: block; }
        .jrn-action-btn:hover { opacity: 0.82; }
        .jrn-action-btn--maps { background: #C04830; color: #FFF; border: none; }
        .jrn-action-btn--copy { background: rgba(212,160,80,0.12); border: 1px solid rgba(212,160,80,0.3); color: #D4A050; }
        .jrn-action-btn--copy.copied { color: #6DBF8A; border-color: rgba(109,191,138,0.4); }

        /* ── Card journey button ── */
        .jrn-btn { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; padding: 7px 13px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.15s; border: 1px solid rgba(212,160,80,0.35); background: transparent; color: #9A7845; }
        .jrn-btn:hover { border-color: #D4A050; color: #D4A050; background: rgba(212,160,80,0.06); }
        .jrn-btn--in { background: rgba(212,160,80,0.12); border-color: #D4A050; color: #D4A050; }
      `}</style>

      {loading && <LoadingOverlay stage={loadingStage} />}

      <div className="page">
        <div className="hero">
          <h1 className="hero-title">RoadTripper<span className="title-de">DE</span><span className="beta-tag">Beta</span></h1>
          <p className="hero-sub">History &amp; heritage along your route</p>
          <HeroSteps />
        </div>

        <div className="search-panel">
          <div className="search-inputs">
            <input className="search-input" placeholder="Start city" value={start} onChange={e => setStart(e.target.value)} onKeyDown={e => e.key === "Enter" && findStops()} />
            <input className="search-input" placeholder="Destination" value={end} onChange={e => setEnd(e.target.value)} onKeyDown={e => e.key === "Enter" && findStops()} />
          </div>
          <button className="search-btn" onClick={findStops} disabled={loading}>
            {loading ? "Searching..." : "Explore Route"}
          </button>
        </div>

        <div className="content">
          {!hasSearched && !loading && (
            <div className="discover-prompt">
              <span className="discover-icon" role="img" aria-label="Compass">🧭</span>
              <h2 className="discover-heading">What would you like to<br /><em>discover today?</em></h2>
              <p className="discover-sub">Enter two cities and uncover the history<br />waiting just off your route.</p>
              <div className="discover-divider" />
              <p className="discover-credit">
                A labour of love by <strong>Mike Stuchbery</strong><br />
                <a href="mailto:michael.stuchbery@gmail.com">Comments? Questions? Report a bug?</a>
              </p>
              <p style={{ fontSize: '11px', color: '#A89060', marginTop: '8px' }}>© 2026 Mike Stuchbery</p>
            </div>
          )}

          {hasSearched && !loading && shown.length > 0 && (
            <WindscreenHeader startName={start} endName={end} siteCount={pois.length} distanceKm={routeDistanceKm} />
          )}
          {hasSearched && !loading && pois.length === 0 && (
            <div className="empty-state">
              <p className="empty-icon" aria-hidden="true">🗺️</p>
              <h3 className="empty-title">No sites found along this route</h3>
              <p className="empty-body">Try a longer route, or two cities further apart — our dataset covers all 16 German states.</p>
            </div>
          )}
          {!loading && shown.map((p, i) => (
            <Card
              key={p.name ?? i}
              poi={p}
              index={i}
              animDelay={i}
              inJourney={journey.some(j => (j.name ?? j.title) === (p.name ?? p.title))}
              onToggleJourney={() => toggleJourney(p)}
            />
          ))}

          {visibleCount < pois.length && (
            <button className="search-btn" style={{ background: 'transparent', color: '#C04830', border: '1px solid #C04830' }} onClick={() => setVisible(v => v + 6)}>Load More Stops</button>
          )}

          {shown.length > 0 && (
            <>
              <div style={{ margin: '8px 0 20px' }}>
                <button
                  style={{ background: 'none', border: '1px solid rgba(192,72,48,0.4)', borderRadius: 8, padding: '9px 16px', color: '#C04830', fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: 'pointer', letterSpacing: '0.04em', transition: 'border-color 0.18s, transform 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='#C04830'; e.currentTarget.style.transform='translateX(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='rgba(192,72,48,0.4)'; e.currentTarget.style.transform=''; }}
                  onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => document.querySelector('.search-input')?.focus(), 500); }}
                >
                  ← Plan another route
                </button>
              </div>
              <JourneyMap routeCoords={routeCoords} stops={pois} startName={start} endName={end} />
              <footer className="footer">
                <p className="footer-love">A labour of love by <strong>Mike Stuchbery</strong></p>
                <a href="mailto:michael.stuchbery@gmail.com" className="footer-email">Comments? Questions? Report a bug?</a>
                <p className="footer-copy">© 2026 Mike Stuchbery</p>
              </footer>
            </>
          )}
        </div>
      </div>

      <a href="https://ko-fi.com/mikestuchbery" target="_blank" rel="noopener noreferrer" className="kofi" style={journey.length ? { bottom: 72 } : {}}>
        ☕ <span className="kofi-label">Buy a coffee</span>
      </a>

      <JourneyDrawer journey={journey} onRemove={toggleJourney} start={start} end={end} />
    </>
  );
}
