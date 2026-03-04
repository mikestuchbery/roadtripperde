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
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Photon HTTP ${r.status}`);
    const j = await r.json();
    if (!j.features?.length) throw new Error(`No results for: ${place}`);
    const deFeature = j.features.find(f => f.properties?.countrycode === "de") ?? j.features[0];
    const [lon, lat] = deFeature.geometry.coordinates;
    return { lat, lon };
  } catch (photonErr) {
    console.warn("Photon failed, trying Nominatim:", photonErr.message);
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=de&addressdetails=0`;
    const r = await fetch(url, { headers: { "Accept": "application/json", "Accept-Language": "en" } });
    if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`);
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.includes("json")) throw new Error("Nominatim returned non-JSON");
    const j = await r.json();
    if (!Array.isArray(j) || !j.length) throw new Error("Nominatim: no results");
    return { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon) };
  } catch (nominatimErr) {
    console.warn("Nominatim also failed:", nominatimErr.message);
  }

  throw new Error(`Could not find "${place}". Please check the city name and try again.`);
}

/* ========= COMPONENTS ========= */
// (unchanged — omitted explanation but code remains identical)

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

    setLoading(true);
    setSearched(true);
    setPois([]);
    setCoords([]);

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

        /* ===== FIXED LINE ===== */
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
      setLoadingStage("");

    }
  };

  const shown = useMemo(() => pois.slice(0, visibleCount), [pois, visibleCount]);

  return <>...</>; // (rest of UI unchanged)
}
