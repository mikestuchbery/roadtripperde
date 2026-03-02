import { useState } from "react";

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

/* ========= SAFE MERGE ========= */
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

/* ========= DISTANCE ========= */
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

function routePosition(poi, coords) {
  let bestIndex = 0;
  let bestDist = Infinity;

  for (let i = 0; i < coords.length; i++) {
    const d = haversineKm(
      { lat: poi.lat, lon: poi.lon },
      { lat: coords[i][1], lon: coords[i][0] }
    );
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }

  return bestIndex / coords.length;
}

/* ========= WIKIPEDIA IMAGE ========= */
async function fetchWikiImage(title) {
  try {
    const s = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        title
      )}&format=json&origin=*`
    );
    const sj = await s.json();
    const page = sj.query.search[0];
    if (!page) return null;

    const p = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
        page.title
      )}&prop=pageimages&pithumbsize=800&format=json&origin=*`
    );
    const pj = await p.json();
    const pg = Object.values(pj.query.pages)[0];
    return pg.thumbnail?.source || null;
  } catch {
    return null;
  }
}

/* ========= KO-FI ========= */
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
      }}
    >
      ☕
    </a>
  );
}

/* ========= APP ========= */
export default function App() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pois, setPois] = useState([]);
  const [visibleCount, setVisibleCount] = useState(8);
  const [loading, setLoading] = useState(false);

  async function geocode(place) {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        place
      )}`
    );
    const j = await r.json();
    return { lat: +j[0].lat, lon: +j[0].lon };
  }

  async function route(a, b) {
    const r = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`
    );
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

      const near = ALL_POIS.map((p) => {
        const lat = p.lat ?? p.latitude;
        const lon = p.lon ?? p.longitude;
        if (!lat || !lon) return null;

        const dist = minDistanceToRoute({ lat, lon }, coords);
        if (dist > 25) return null;

        return {
          ...p,
          lat,
          lon,
          pos: routePosition({ lat, lon }, coords),
        };
      })
        .filter(Boolean)
        .sort((a, b) => a.pos - b.pos);

      const routeKm = haversineKm(A, B);
      const initial = routeKm < 100 ? 4 : 8;

      setPois(near);
      setVisibleCount(initial);
    } catch (e) {
      alert(e.message);
    }

    setLoading(false);
  }

  const shown = pois.slice(0, visibleCount);

  return (
    <div
      style={{
        background: "#efe8d2",
        minHeight: "100vh",
        fontFamily: "system-ui",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
          padding: 16,
        }}
      >
        <h1 style={{ marginBottom: 12 }}>Roadtripper</h1>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            placeholder="Start"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            style={{ flex: 1, padding: 10 }}
          />
          <input
            placeholder="End"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            style={{ flex: 1, padding: 10 }}
          />
          <button onClick={findStops}>Go</button>
        </div>

        {loading && <p>Finding places…</p>}

        {shown.map((p, i) => {
          const name = p.name ?? p.title ?? "Site";
          const era = p.era ?? p.century ?? "";
          const summary = p.summary ?? p.description ?? "";

          return (
            <Card key={i} name={name} era={era} summary={summary} />
          );
        })}

        {visibleCount < pois.length && (
          <button
            onClick={() => setVisibleCount((v) => v + 6)}
            style={{
              width: "100%",
              marginTop: 12,
              padding: 12,
              background: "#e7d9a8",
              border: "1px solid #c8b98a",
              borderRadius: 8,
            }}
          >
            Load more along route →
          </button>
        )}

        {pois.length > 0 && (
          <div
            style={{
              marginTop: 20,
              padding: 14,
              background: "#e7d9a8",
              borderRadius: 10,
            }}
          >
            <strong>Open journey in Maps</strong>
            <div style={{ marginTop: 6 }}>
              <a
                href={`https://www.google.com/maps/dir/${encodeURIComponent(
                  start
                )}/${encodeURIComponent(end)}`}
                target="_blank"
              >
                Open route →
              </a>
            </div>
          </div>
        )}
      </div>

      <KofiButton />
    </div>
  );
}

/* ========= CARD ========= */
function Card({ name, era, summary }) {
  const [img, setImg] = useState(null);

  useState(() => {
    fetchWikiImage(name).then(setImg);
  }, []);

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 14,
        boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
      }}
    >
      {img && (
        <img
          src={img}
          alt={name}
          style={{ width: "100%", height: 160, objectFit: "cover" }}
        />
      )}

      <div style={{ padding: 14 }}>
        <div style={{ fontWeight: 700 }}>{name}</div>
        {era && (
          <div style={{ fontSize: 12, color: "#7a6f4a", marginBottom: 6 }}>
            {era}
          </div>
        )}
        {summary && <div style={{ fontSize: 14 }}>{summary}</div>}
      </div>
    </div>
  );
}
