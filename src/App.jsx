import { useState } from "react";

/* ===== IMPORT STATE POIS ===== */
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

/* ===== SAFE MERGE ALL POIS ===== */
function asArray(x) {
  if (!x) return [];

  // already an array
  if (Array.isArray(x)) return x;

  // common wrapper keys
  if (Array.isArray(x.pois)) return x.pois;
  if (Array.isArray(x.data)) return x.data;
  if (Array.isArray(x.features)) return x.features;

  // single POI object
  if (x.name && (x.lat || x.latitude)) return [x];

  return [];
}

const ALL_POIS = [
  ...asArray(baden),
  ...asArray(bavaria),
  ...asArray(berlin),
  ...asArray(brandenburg),
  ...asArray(bremen),
  ...asArray(hamburg),
  ...asArray(hesse),
  ...asArray(lowerSaxony),
  ...asArray(meckpom),
  ...asArray(nrw),
  ...asArray(rlp),
  ...asArray(saarland),
  ...asArray(saxony),
  ...asArray(saxonyAnhalt),
  ...asArray(sh),
  ...asArray(thuringia),
];

/* ===== DISTANCE HELPERS ===== */
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * R * Math.asin(Math.sqrt(x));
}

function minDistanceToRoute(poi, coords) {
  let min = Infinity;
  for (const c of coords) {
    const d = haversineKm(
      { lat: poi.lat, lon: poi.lon },
      { lat: c[1], lon: c[0] }
    );
    if (d < min) min = d;
  }
  return min;
}

/* ===== KO-FI FLOAT ===== */
function KofiButton() {
  return (
    <a
      href="https://buymeacoffee.com/mikestuchbery"
      target="_blank"
      rel="noopener noreferrer"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        background: "#FFDD00",
        color: "#000",
        padding: "10px 14px",
        borderRadius: 8,
        fontWeight: 700,
        textDecoration: "none",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        zIndex: 9999,
        fontFamily: "system-ui",
      }}
    >
      ☕ Buy me a coffee
    </a>
  );
}

/* ===== MAIN APP ===== */
export default function App() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pois, setPois] = useState([]);
  const [loading, setLoading] = useState(false);

  async function geocode(place) {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        place
      )}`
    );
    const j = await r.json();
    if (!j[0]) throw new Error("Location not found");
    return { lat: +j[0].lat, lon: +j[0].lon };
  }

  async function route(a, b) {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url);
    const j = await r.json();
    return j.routes[0].geometry.coordinates;
  }

  async function findStops() {
    if (!start || !end) return;
    setLoading(true);

    try {
      const A = await geocode(start);
      const B = await geocode(end);
      const coords = await route(A, B);

      const near = ALL_POIS.filter((p) => {
  const lat = p.lat ?? p.latitude;
  const lon = p.lon ?? p.longitude;
  if (!lat || !lon) return false;
  return minDistanceToRoute({ lat, lon }, coords) <= 25;
});
      
      setPois(near);
    } catch (e) {
      alert(e.message);
    }

    setLoading(false);
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Germany Roadside History</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Start"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <input
          placeholder="End"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={findStops}>Explore</button>
      </div>

      {loading && <p>Finding places along your route…</p>}

      {pois.map((p, i) => (
        <div
          key={i}
          style={{
            border: "1px solid #ddd",
            padding: 12,
            marginBottom: 8,
            borderRadius: 6,
          }}
        >
          <strong>{p.name}</strong>
          <div>{p.era}</div>
          <p>{p.summary}</p>
        </div>
      ))}

      <KofiButton />
    </div>
  );
}
