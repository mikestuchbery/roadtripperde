import { useState, useEffect } from "react";

/* ===============================
   LEAFLET FIX (VITE)
=============================== */
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

import { MapContainer, TileLayer, Polyline, Marker } from "react-leaflet";

/* ===============================
   POI IMPORT
=============================== */
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

/* ===============================
   SAFE MERGE
=============================== */
function asArray(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (Array.isArray(x.pois)) return x.pois;
  if (x.name && (x.lat || x.latitude)) return [x];
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

/* ===============================
   GEO
=============================== */
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
  coords.forEach((c, i) => {
    const d = haversineKm({ lat: poi.lat, lon: poi.lon }, { lat: c[1], lon: c[0] });
    if (d < min) { min = d; idx = i; }
  });
  return { distance: min, index: idx };
}

/* ===============================
   WIKI IMAGE
=============================== */
async function fetchWikiImage(title) {
  if (!title) return null;
  async function tryLang(lang) {
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const j = await r.json();
      return j.thumbnail?.source || null;
    } catch { return null; }
  }
  return (await tryLang("en")) || (await tryLang("de"));
}

/* ===============================
   LIGHTBOX
=============================== */
function Lightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div style={styles.lightboxBg} onClick={onClose}>
      <img src={src} alt="" style={styles.lightboxImg} />
      <button style={styles.lightboxClose} onClick={onClose}>✕</button>
    </div>
  );
}

/* ===============================
   CONNECTOR LINE
=============================== */
function ConnectorLine({ dist, time }) {
  return (
    <div style={styles.connector}>
      <div style={styles.connectorLine} />
      <div style={styles.connectorBadge}>
        <span style={styles.connectorKm}>{Math.round(dist)} km</span>
        <span style={styles.connectorDot}>·</span>
        <span style={styles.connectorMin}>{time} min</span>
      </div>
      <div style={styles.connectorLine} />
    </div>
  );
}

/* ===============================
   STOP NUMBER
=============================== */
function StopNumber({ n }) {
  return (
    <div style={styles.stopNumber}>
      <span style={styles.stopNumberText}>{n}</span>
    </div>
  );
}

/* ===============================
   STOP CARD
=============================== */
function StopCard({ poi, img, dist, time, onOpen, index }) {
  const name = poi.name ?? poi.title ?? poi.site ?? "";
  const era = poi.era ?? poi.period ?? poi.century ?? "";
  const type = poi.type ?? poi.category ?? "";
  const summary = poi.summary ?? poi.description ?? "";
  const wiki = `https://en.wikipedia.org/wiki/${encodeURIComponent(name)}`;

  return (
    <div style={styles.stopWrapper}>
      {dist != null && <ConnectorLine dist={dist} time={time} />}

      <div style={styles.stopRow}>
        <StopNumber n={index + 1} />
        <div style={styles.card}>
          {img && (
            <div style={styles.cardImgWrapper}>
              <img
                src={img}
                alt={name}
                style={styles.cardImg}
                onClick={() => onOpen(img)}
              />
              <div style={styles.cardImgOverlay} />
            </div>
          )}
          <div style={styles.cardBody}>
            <div style={styles.pillRow}>
              {type && <span style={styles.pill}>{type}</span>}
              {era && <span style={{ ...styles.pill, ...styles.pillEra }}>{era}</span>}
            </div>
            <div style={styles.cardTitle}>{name}</div>
            {summary && <p style={styles.cardText}>{summary}</p>}
            <a href={wiki} target="_blank" rel="noreferrer" style={styles.cardLink}>
              Read more on Wikipedia →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===============================
   MAP CARD
=============================== */
function MapCard({ coords, pois }) {
  if (!coords?.length || !pois?.length) return null;
  const path = pois.map(p => `${p.lat ?? p.latitude},${p.lon ?? p.longitude}`).join("/");
  const mapsUrl = `https://www.google.com/maps/dir/${path}`;

  return (
    <div style={styles.mapCard}>
      <div style={styles.mapCardHeader}>
        <span style={styles.mapCardIcon}>◎</span>
        <span>Route overview</span>
      </div>
      <div style={{ height: 280, position: "relative" }}>
        <MapContainer
          style={{ height: "100%", borderRadius: 0 }}
          center={[coords[0][1], coords[0][0]]}
          zoom={6}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution=""
          />
          <Polyline
            positions={coords.map(c => [c[1], c[0]])}
            pathOptions={{ color: "#B84A2A", weight: 3, opacity: 0.85, dashArray: "8 4" }}
          />
          {pois.map((p, i) => (
            <Marker key={i} position={[p.lat ?? p.latitude, p.lon ?? p.longitude]} />
          ))}
        </MapContainer>
      </div>
      <div style={styles.mapCardFooter}>
        <a href={mapsUrl} target="_blank" rel="noreferrer" style={styles.mapButton}>
          Open in Google Maps →
        </a>
      </div>
    </div>
  );
}

/* ===============================
   LOADING STATE
=============================== */
function LoadingDots() {
  return (
    <div style={styles.loadingWrapper}>
      <div style={styles.loadingText}>Charting your route</div>
      <div style={styles.loadingDots}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ ...styles.dot, animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  );
}

/* ===============================
   MAIN
=============================== */
export default function App() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pois, setPois] = useState([]);
  const [imgs, setImgs] = useState({});
  const [coords, setCoords] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [loading, setLoading] = useState(false);
  const [startFocused, setStartFocused] = useState(false);
  const [endFocused, setEndFocused] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const f = p.get("from"), t = p.get("to");
    if (f && t) { setStart(f); setEnd(t); findStops(f, t); }
  }, []);

  async function geocode(place) {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}`);
    const j = await r.json();
    return { lat: +j[0].lat, lon: +j[0].lon };
  }

  async function route(a, b) {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`);
    const j = await r.json();
    return { coords: j.routes[0].geometry.coordinates, km: j.routes[0].distance / 1000 };
  }

  async function findStops(s = start, e = end) {
    if (!s || !e) return;
    setLoading(true);
    setPois([]); setCoords([]); setImgs({});

    try {
      const A = await geocode(s), B = await geocode(e);
      const r = await route(A, B);
      setCoords(r.coords);

      const candidates = [];
      ALL_POIS.forEach(p => {
        const lat = p.lat ?? p.latitude, lon = p.lon ?? p.longitude;
        if (!lat || !lon) return;
        const { distance, index } = minDistanceToRoute({ lat, lon }, r.coords);
        if (distance <= 25) candidates.push({ poi: p, routeIndex: index });
      });

      candidates.sort((a, b) => a.routeIndex - b.routeIndex);
      const limit = r.km < 100 ? 4 : 8;
      const selected = candidates.slice(0, limit).map(c => c.poi);
      setPois(selected);

      const map = {};
      for (const p of selected) {
        const name = p.name ?? p.title ?? p.site;
        map[name] = await fetchWikiImage(name);
      }
      setImgs(map);

      const params = new URLSearchParams({ from: s, to: e });
      window.history.replaceState(null, "", `?${params}`);
    } finally {
      setLoading(false);
    }
  }

  const handleKey = (e) => { if (e.key === "Enter") findStops(); };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Libre+Baskerville:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #F0E8D8;
          background-image:
            radial-gradient(ellipse at 20% 10%, rgba(180,140,80,0.08) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 90%, rgba(120,80,40,0.06) 0%, transparent 60%),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='400' height='400' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }

        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .stop-card-enter {
          animation: fadeSlideIn 0.5s ease forwards;
        }

        input::placeholder { color: #B8A888; font-style: italic; }
        input:focus { outline: none; }

        .explore-btn:hover {
          background: #8B3A1E !important;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(184,74,42,0.35) !important;
        }
        .explore-btn:active { transform: translateY(0); }

        .card-link:hover { color: #8B3A1E !important; letter-spacing: 0.02em; }

        .map-btn:hover { background: #8B3A1E !important; }

        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #E8DFC8; }
        ::-webkit-scrollbar-thumb { background: #C4A878; border-radius: 3px; }
      `}</style>

      <div style={styles.page}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.headerRule} />
          <div style={styles.headerInner}>
            <div style={styles.headerEyebrow}>Deutschland · Auf Entdeckungsreise</div>
            <h1 style={styles.headline}>Roadtripper</h1>
            <p style={styles.subhead}>Discover history, culture & heritage along your route</p>
          </div>
          <div style={styles.headerRule} />
        </header>

        {/* Search */}
        <div style={styles.searchSection}>
          <div style={styles.searchCard}>
            <div style={styles.searchLabel}>Plan your journey</div>
            <div style={styles.inputGroup}>
              <div style={styles.inputWrapper}>
                <span style={styles.inputIcon}>◉</span>
                <input
                  placeholder="Start city"
                  value={start}
                  onChange={e => setStart(e.target.value)}
                  onKeyDown={handleKey}
                  onFocus={() => setStartFocused(true)}
                  onBlur={() => setStartFocused(false)}
                  style={{
                    ...styles.input,
                    ...(startFocused ? styles.inputFocused : {})
                  }}
                />
              </div>
              <div style={styles.inputDivider}>↓</div>
              <div style={styles.inputWrapper}>
                <span style={styles.inputIcon}>◎</span>
                <input
                  placeholder="Destination"
                  value={end}
                  onChange={e => setEnd(e.target.value)}
                  onKeyDown={handleKey}
                  onFocus={() => setEndFocused(true)}
                  onBlur={() => setEndFocused(false)}
                  style={{
                    ...styles.input,
                    ...(endFocused ? styles.inputFocused : {})
                  }}
                />
              </div>
            </div>
            <button
              className="explore-btn"
              onClick={() => findStops()}
              style={styles.exploreBtn}
            >
              {loading ? "Exploring…" : "Explore Route"}
            </button>
          </div>
        </div>

        {/* Results */}
        <div style={styles.results}>
          {loading && <LoadingDots />}

          {!loading && pois.length > 0 && (
            <>
              <div style={styles.resultsHeader}>
                <div style={styles.resultsRule} />
                <div style={styles.resultsLabel}>
                  {pois.length} stops along your route
                </div>
                <div style={styles.resultsRule} />
              </div>

              <div style={styles.stopList}>
                {pois.map((p, i) => {
                  const name = p.name ?? p.title ?? p.site;
                  let dist = null, time = null;
                  if (i > 0) {
                    const a = pois[i - 1];
                    dist = haversineKm(
                      { lat: a.lat ?? a.latitude, lon: a.lon ?? a.longitude },
                      { lat: p.lat ?? p.latitude, lon: p.lon ?? p.longitude }
                    );
                    time = Math.round((dist / 80) * 60);
                  }
                  return (
                    <div key={i} className="stop-card-enter" style={{ animationDelay: `${i * 0.08}s` }}>
                      <StopCard
                        poi={p}
                        img={imgs[name]}
                        dist={dist}
                        time={time}
                        onOpen={setLightbox}
                        index={i}
                      />
                    </div>
                  );
                })}
              </div>

              <MapCard coords={coords} pois={pois} />
            </>
          )}
        </div>

        {/* Footer */}
        <footer style={styles.footer}>
          <div style={styles.footerRule} />
          <div style={styles.footerText}>
            Routes via OSRM · Places via OpenStreetMap · Images via Wikipedia
          </div>
        </footer>
      </div>

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </>
  );
}

/* ===============================
   STYLES
=============================== */
const styles = {
  page: {
    minHeight: "100vh",
    maxWidth: 640,
    margin: "0 auto",
    padding: "0 20px 60px",
    fontFamily: "'DM Sans', sans-serif",
  },

  /* Header */
  header: {
    paddingTop: 48,
    paddingBottom: 32,
    textAlign: "center",
  },
  headerRule: {
    height: 1,
    background: "linear-gradient(to right, transparent, #C4A878, transparent)",
    marginBottom: 20,
  },
  headerInner: {
    padding: "0 0 20px",
  },
  headerEyebrow: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    color: "#9A7D50",
    marginBottom: 10,
  },
  headline: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 52,
    fontWeight: 700,
    color: "#2A1E0E",
    letterSpacing: "-0.01em",
    lineHeight: 1.1,
    marginBottom: 10,
  },
  subhead: {
    fontFamily: "'Libre Baskerville', serif",
    fontStyle: "italic",
    fontSize: 15,
    color: "#7A6245",
    letterSpacing: "0.01em",
  },

  /* Search */
  searchSection: {
    marginBottom: 36,
  },
  searchCard: {
    background: "#FBF6EA",
    border: "1px solid #DECCAA",
    borderRadius: 12,
    padding: 24,
    boxShadow: "0 4px 24px rgba(80,50,20,0.08), 0 1px 3px rgba(80,50,20,0.06)",
  },
  searchLabel: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "#9A7D50",
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },
  inputIcon: {
    position: "absolute",
    left: 14,
    color: "#B8935A",
    fontSize: 13,
    zIndex: 1,
    userSelect: "none",
  },
  input: {
    width: "100%",
    padding: "13px 14px 13px 36px",
    borderRadius: 8,
    border: "1.5px solid #DECCAA",
    background: "#FFFCF4",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 15,
    color: "#2A1E0E",
    transition: "border-color 0.2s, box-shadow 0.2s",
  },
  inputFocused: {
    borderColor: "#B8935A",
    boxShadow: "0 0 0 3px rgba(184,147,90,0.15)",
  },
  inputDivider: {
    textAlign: "center",
    color: "#C4A878",
    fontSize: 16,
    padding: "6px 0",
    lineHeight: 1,
  },
  exploreBtn: {
    width: "100%",
    padding: "14px 24px",
    borderRadius: 8,
    border: "none",
    background: "#B84A2A",
    color: "#FFF8EE",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: "0.06em",
    cursor: "pointer",
    transition: "background 0.2s, transform 0.15s, box-shadow 0.2s",
    boxShadow: "0 4px 14px rgba(184,74,42,0.25)",
  },

  /* Results header */
  results: {
    minHeight: 100,
  },
  resultsHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  resultsRule: {
    flex: 1,
    height: 1,
    background: "#DECCAA",
  },
  resultsLabel: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "#9A7D50",
    whiteSpace: "nowrap",
  },
  stopList: {
    marginBottom: 24,
  },

  /* Stop layout */
  stopWrapper: {
    marginBottom: 0,
  },
  stopRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
  },
  stopNumber: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "#2A1E0E",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 16,
    boxShadow: "0 2px 8px rgba(42,30,14,0.3)",
  },
  stopNumberText: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 11,
    fontWeight: 500,
    color: "#F0DFB8",
    letterSpacing: "0.05em",
  },

  /* Card */
  card: {
    flex: 1,
    background: "#FBF6EA",
    border: "1px solid #DECCAA",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 0,
    boxShadow: "0 2px 12px rgba(80,50,20,0.07)",
    transition: "box-shadow 0.2s, transform 0.2s",
  },
  cardImgWrapper: {
    position: "relative",
    overflow: "hidden",
  },
  cardImg: {
    width: "100%",
    height: 200,
    objectFit: "cover",
    cursor: "zoom-in",
    display: "block",
    transition: "transform 0.4s ease",
  },
  cardImgOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    background: "linear-gradient(to bottom, transparent, rgba(42,30,14,0.3))",
    pointerEvents: "none",
  },
  cardBody: {
    padding: "14px 16px 16px",
  },
  pillRow: {
    display: "flex",
    gap: 6,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  pill: {
    background: "#EDE0C4",
    color: "#6B4F2A",
    border: "1px solid #D4C09A",
    padding: "3px 8px",
    fontSize: 10,
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 500,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    borderRadius: 4,
  },
  pillEra: {
    background: "#F5EDD8",
    color: "#8B6030",
    border: "1px solid #D4C09A",
  },
  cardTitle: {
    fontFamily: "'Playfair Display', serif",
    fontWeight: 700,
    fontSize: 19,
    color: "#2A1E0E",
    lineHeight: 1.2,
    marginBottom: 8,
    letterSpacing: "-0.01em",
  },
  cardText: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13.5,
    color: "#5A4530",
    lineHeight: 1.6,
    marginBottom: 12,
  },
  cardLink: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: "0.04em",
    color: "#B84A2A",
    textDecoration: "none",
    borderBottom: "1px solid transparent",
    transition: "color 0.15s, letter-spacing 0.15s",
  },

  /* Connector */
  connector: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 0 10px 40px",
  },
  connectorLine: {
    flex: 1,
    height: 1,
    borderTop: "1px dashed #C4A878",
  },
  connectorBadge: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "#F0E5CC",
    border: "1px solid #D4C09A",
    borderRadius: 20,
    padding: "3px 10px",
  },
  connectorKm: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 11,
    fontWeight: 500,
    color: "#7A6040",
  },
  connectorDot: {
    color: "#B8A070",
    fontSize: 10,
  },
  connectorMin: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 11,
    color: "#9A7850",
  },

  /* Map card */
  mapCard: {
    background: "#FBF6EA",
    border: "1px solid #DECCAA",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 0,
    boxShadow: "0 2px 12px rgba(80,50,20,0.07)",
  },
  mapCardHeader: {
    padding: "12px 16px",
    borderBottom: "1px solid #DECCAA",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#9A7D50",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  mapCardIcon: {
    color: "#B8935A",
    fontSize: 14,
  },
  mapCardFooter: {
    padding: 14,
    borderTop: "1px solid #DECCAA",
  },
  mapButton: {
    display: "block",
    textAlign: "center",
    padding: "11px 20px",
    background: "#2A1E0E",
    color: "#F0DFB8",
    borderRadius: 7,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
    fontWeight: 500,
    letterSpacing: "0.04em",
    textDecoration: "none",
    transition: "background 0.2s",
  },

  /* Loading */
  loadingWrapper: {
    textAlign: "center",
    padding: "48px 0",
  },
  loadingText: {
    fontFamily: "'Libre Baskerville', serif",
    fontStyle: "italic",
    fontSize: 16,
    color: "#9A7D50",
    marginBottom: 16,
    letterSpacing: "0.02em",
  },
  loadingDots: {
    display: "flex",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#B8935A",
    animation: "pulse 1.2s ease-in-out infinite",
  },

  /* Footer */
  footer: {
    marginTop: 48,
    textAlign: "center",
  },
  footerRule: {
    height: 1,
    background: "linear-gradient(to right, transparent, #C4A878, transparent)",
    marginBottom: 16,
  },
  footerText: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 11,
    color: "#A89060",
    letterSpacing: "0.08em",
  },

  /* Lightbox */
  lightboxBg: {
    position: "fixed",
    inset: 0,
    background: "rgba(20,12,4,0.92)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
    backdropFilter: "blur(4px)",
  },
  lightboxImg: {
    maxWidth: "88%",
    maxHeight: "88%",
    borderRadius: 6,
    boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
  },
  lightboxClose: {
    position: "absolute",
    top: 24,
    right: 28,
    background: "none",
    border: "none",
    color: "#F0DFB8",
    fontSize: 22,
    cursor: "pointer",
    opacity: 0.7,
    fontFamily: "'DM Sans', sans-serif",
  },
};
