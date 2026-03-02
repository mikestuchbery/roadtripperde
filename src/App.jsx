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

/* ===== SAFE MERGE ===== */
function asArray(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (Array.isArray(x.pois)) return x.pois;
  if (Array.isArray(x.data)) return x.data;
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

/* ===== DISTANCE ===== */
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

function minDistanceToRoute(point, coords) {
  let min = Infinity;
  for (const c of coords) {
    const d = haversineKm(
      { lat: point.lat, lon: point.lon },
      { lat: c[1], lon: c[0] }
    );
    if (d < min) min = d;
  }
  return min;
}

/* ===== WIKIPEDIA IMAGE ===== */
async function wikiImage(slug) {
  try {
    const r = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`
    );
    const j = await r.json();
    return j.thumbnail?.source;
  } catch {
    return null;
  }
}

/* ===== KO-FI ===== */
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
        background: "#f4d03f",
        color: "#000",
        padding: "10px 14px",
        borderRadius: 8,
        fontWeight: 700,
        textDecoration: "none",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        zIndex: 9999
      }}
    >
      ☕ Buy me a coffee
    </a>
  );
}

/* ===== APP ===== */
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

    const A = await geocode(start);
    const B = await geocode(end);
    const coords = await route(A, B);

    const near = ALL_POIS
      .map(p => {
        const lat = p.lat ?? p.latitude;
        const lon = p.lon ?? p.longitude;
        if (!lat || !lon) return null;
        return {
          ...p,
          lat,
          lon,
          dist: minDistanceToRoute({ lat, lon }, coords)
        };
      })
      .filter(Boolean)
      .filter(p => p.dist <= 25)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 10);

    // attach wikipedia images
    const enriched = await Promise.all(
      near.map(async p => ({
        ...p,
        image: p.wikipedia ? await wikiImage(p.wikipedia) : null
      }))
    );

    setPois(enriched);
    setLoading(false);
  }

  return (
    <div style={{ background: "#f3efe6", minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontFamily: "Georgia, serif", color: "#14213d" }}>
          Roadtripper
        </h1>

        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          <input
            placeholder="Start"
            value={start}
            onChange={e => setStart(e.target.value)}
            style={input}
          />
          <input
            placeholder="Destination"
            value={end}
            onChange={e => setEnd(e.target.value)}
            style={input}
          />
          <button onClick={findStops} style={button}>
            Explore
          </button>
        </div>

        {loading && <p>Finding remarkable places…</p>}

        <div style={timeline}>
          {pois.map((p, i) => {
            const name = p.name ?? p.title ?? p.site;
            const era = p.century ?? p.era ?? "";
            const type = p.type ?? "";
            const summary = p.summary ?? p.description ?? "";
            const maps = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;

            return (
              <div key={i} style={cardWrap}>
                <div style={dot} />

                <div style={card}>
                  {p.image && (
                    <div
                      style={{
                        height: 140,
                        backgroundImage: `url(${p.image})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        borderTopLeftRadius: 10,
                        borderTopRightRadius: 10
                      }}
                    />
                  )}

                  <div style={{ padding: 14 }}>
                    <div style={title}>{name}</div>

                    <div style={pillRow}>
                      {type && <span style={pill}>{type}</span>}
                      {era && <span style={pill}>{era}</span>}
                    </div>

                    <div style={summaryStyle}>{summary}</div>

                    <a href={maps} target="_blank" rel="noreferrer" style={link}>
                      Open in Maps →
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <KofiButton />
    </div>
  );
}

/* ===== STYLES ===== */
const input = {
  flex: 1,
  padding: "10px 12px",
  border: "1px solid #c9c3b5",
  borderRadius: 6,
  background: "#fffdf7"
};

const button = {
  padding: "10px 16px",
  borderRadius: 6,
  border: "1px solid #9e2a2b",
  background: "#9e2a2b",
  color: "#fff",
  fontWeight: 600
};

const timeline = {
  position: "relative",
  paddingLeft: 30
};

const cardWrap = {
  position: "relative",
  marginBottom: 22
};

const dot = {
  position: "absolute",
  left: -22,
  top: 10,
  width: 10,
  height: 10,
  borderRadius: "50%",
  background: "#14213d"
};

const card = {
  background: "#fffdf7",
  border: "1px solid #c9c3b5",
  borderRadius: 10,
  overflow: "hidden",
  boxShadow: "0 2px 4px rgba(0,0,0,0.06)"
};

const title = {
  fontFamily: "Georgia, serif",
  fontWeight: 700,
  fontSize: 16,
  color: "#14213d",
  marginBottom: 6
};

const pillRow = {
  display: "flex",
  gap: 6,
  marginBottom: 8
};

const pill = {
  background: "#14213d",
  color: "#fff",
  padding: "2px 6px",
  fontSize: 11,
  borderRadius: 4
};

const summaryStyle = {
  fontSize: 14,
  lineHeight: 1.45,
  marginBottom: 8
};

const link = {
  fontSize: 13,
  color: "#9e2a2b",
  textDecoration: "none",
  fontWeight: 600
};
