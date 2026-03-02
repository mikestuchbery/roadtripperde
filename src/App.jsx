import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

/* ===== IMPORT POIS ===== */
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

function minDistanceToRoute(poi, coords) {
  let min = Infinity;
  let idx = 0;

  coords.forEach((c, i) => {
    const d = haversineKm(
      { lat: poi.lat, lon: poi.lon },
      { lat: c[1], lon: c[0] }
    );
    if (d < min) {
      min = d;
      idx = i;
    }
  });

  return { distance: min, index: idx };
}

/* ===== WIKI IMAGE ===== */
async function fetchWikiImage(title) {
  if (!title) return null;

  async function tryLang(lang) {
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title
    )}`;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const j = await r.json();
      return j.thumbnail?.source || null;
    } catch {
      return null;
    }
  }

  return (await tryLang("en")) || (await tryLang("de"));
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
      ☕ Buy me a coffee
    </a>
  );
}

/* ===== LIGHTBOX ===== */
function Lightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
    >
      <img
        src={src}
        alt=""
        style={{ maxWidth: "90%", maxHeight: "90%", borderRadius: 8 }}
      />
    </div>
  );
}

/* ===== CARD ===== */
function Card({ poi, img, onOpen, distanceFromPrev, timeFromPrev }) {
  const name = poi.name ?? poi.title ?? poi.site ?? "";
  const era = poi.era ?? poi.period ?? poi.century ?? "";
  const summary = poi.summary ?? poi.description ?? "";
  const type = poi.type ?? poi.category ?? "";

  const wiki = `https://en.wikipedia.org/wiki/${encodeURIComponent(name)}`;

  return (
    <>
      {distanceFromPrev != null && (
        <div style={{ textAlign: "center", color: "#777", fontSize: 12 }}>
          — {Math.round(distanceFromPrev)} km · {timeFromPrev} min —
        </div>
      )}

      <div
        style={{
          background: "#F7F4E8",
          border: "1px solid #d8d2b8",
          borderRadius: 10,
          overflow: "hidden",
          marginBottom: 14,
        }}
      >
        {img && (
          <img
            src={img}
            alt={name}
            onClick={() => onOpen(img)}
            style={{
              width: "100%",
              height: 180,
              objectFit: "cover",
              cursor: "zoom-in",
            }}
          />
        )}

        <div style={{ padding: 14 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            {type && <span className="pill blue">{type}</span>}
            {era && <span className="pill red">{era}</span>}
          </div>

          <div style={{ fontWeight: 700, fontSize: 16 }}>{name}</div>

          {summary && (
            <div style={{ fontSize: 14, margin: "6px 0 8px" }}>
              {summary}
            </div>
          )}

          <a href={wiki} target="_blank" rel="noopener noreferrer">
            More info →
          </a>
        </div>
      </div>
    </>
  );
}

/* ===== MAIN ===== */
export default function App() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pois, setPois] = useState([]);
  const [imgs, setImgs] = useState({});
  const [coords, setCoords] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [showMap, setShowMap] = useState(false);

  /* ===== SHAREABLE URL ===== */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const f = params.get("from");
    const t = params.get("to");
    if (f && t) {
      setStart(f);
      setEnd(t);
      findStops(f, t);
    }
  }, []);

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
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url);
    const j = await r.json();
    return {
      coords: j.routes[0].geometry.coordinates,
      km: j.routes[0].distance / 1000,
    };
  }

  async function findStops(s = start, e = end) {
    if (!s || !e) return;

    const A = await geocode(s);
    const B = await geocode(e);
    const r = await route(A, B);

    setCoords(r.coords);

    const candidates = [];

    ALL_POIS.forEach((p) => {
      const lat = p.lat ?? p.latitude;
      const lon = p.lon ?? p.longitude;
      if (!lat || !lon) return;

      const { distance, index } = minDistanceToRoute(
        { lat, lon },
        r.coords
      );

      if (distance <= 25) {
        candidates.push({ poi: p, routeIndex: index });
      }
    });

    candidates.sort((a, b) => a.routeIndex - b.routeIndex);

    const limit = r.km < 100 ? 4 : 8;
    const selected = candidates.slice(0, limit).map((c) => c.poi);

    setPois(selected);

    /* fetch images */
    const map = {};
    for (const p of selected) {
      const name = p.name ?? p.title ?? p.site;
      map[name] = await fetchWikiImage(name);
    }
    setImgs(map);

    /* update URL */
    const params = new URLSearchParams({ from: s, to: e });
    window.history.replaceState(null, "", `?${params}`);
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: 20 }}>
      <h1>Roadtripper</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Start"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <input
          placeholder="End"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
        <button onClick={() => findStops()}>Go</button>
      </div>

      <button onClick={() => setShowMap(!showMap)}>
        {showMap ? "Hide Map" : "Show Map"}
      </button>

      {showMap && coords.length > 0 && (
        <MapContainer
          style={{ height: 300, margin: "12px 0" }}
          center={[coords[0][1], coords[0][0]]}
          zoom={6}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Polyline positions={coords.map((c) => [c[1], c[0]])} />

          {pois.map((p, i) => (
            <Marker key={i} position={[p.lat ?? p.latitude, p.lon ?? p.longitude]}>
              <Popup>{p.name}</Popup>
            </Marker>
          ))}
        </MapContainer>
      )}

      {pois.map((p, i) => {
        const name = p.name ?? p.title ?? p.site;
        let dist = null;
        let time = null;

        if (i > 0) {
          const a = pois[i - 1];
          dist = haversineKm(
            { lat: a.lat ?? a.latitude, lon: a.lon ?? a.longitude },
            { lat: p.lat ?? p.latitude, lon: p.lon ?? p.longitude }
          );
          time = Math.round((dist / 80) * 60); // avg speed
        }

        return (
          <Card
            key={i}
            poi={p}
            img={imgs[name]}
            onOpen={setLightbox}
            distanceFromPrev={dist}
            timeFromPrev={time}
          />
        );
      })}

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
      <KofiButton />
    </div>
  );
}
