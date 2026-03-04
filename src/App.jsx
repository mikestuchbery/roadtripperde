import { useState, useEffect, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";

/* ========= LEAFLET ICON FIX ========= */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/* ========= WIKI CACHE ========= */
const wikiCache = new Map();

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

/* ========= HELPERS ========= */
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
  const x = Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 *
    Math.cos(lat1) *
    Math.cos(lat2);

  return 2 * R * Math.asin(Math.sqrt(x));
}

function minDistanceToRoute(poi, coords) {
  let min = Infinity;
  let idx = 0;

  const step = coords.length > 1000 ? 3 : 1;

  for (let i = 0; i < coords.length; i += step) {
    const d = haversineKm(
      { lat: poi.lat, lon: poi.lon },
      { lat: coords[i][1], lon: coords[i][0] }
    );

    if (d < min) {
      min = d;
      idx = i;
    }
  }

  if (step > 1) {
    const lo = Math.max(0, idx - step);
    const hi = Math.min(coords.length - 1, idx + step);

    for (let i = lo; i <= hi; i++) {
      const d = haversineKm(
        { lat: poi.lat, lon: poi.lon },
        { lat: coords[i][1], lon: coords[i][0] }
      );

      if (d < min) {
        min = d;
        idx = i;
      }
    }
  }

  return { distance: min, index: idx };
}

/* ========= WIKIPEDIA ========= */
async function fetchWikiData(name) {
  if (wikiCache.has(name)) return wikiCache.get(name);

  try {
    const s = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json&origin=*`
    );

    const sj = await s.json();
    const page = sj.query.search[0];

    if (!page) {
      const result = { img: null, wikiTitle: null };
      wikiCache.set(name, result);
      return result;
    }

    const canonicalTitle = page.title;

    const p = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(canonicalTitle)}&prop=pageimages&pithumbsize=800&format=json&origin=*`
    );

    const pj = await p.json();
    const pg = Object.values(pj.query.pages)[0];

    const result = {
      img: pg.thumbnail?.source || null,
      wikiTitle: canonicalTitle
    };

    wikiCache.set(name, result);

    return result;
  } catch {
    const result = { img: null, wikiTitle: null };
    wikiCache.set(name, result);
    return result;
  }
}

/* ========= GEOCODE ========= */
async function geocode(place) {
  const query =
    /germany|deutschland|\bde\b/i.test(place)
      ? place.trim()
      : `${place.trim()}, Germany`;

  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=de`
    );

    const j = await r.json();

    if (!j.length) throw new Error("No results");

    return {
      lat: parseFloat(j[0].lat),
      lon: parseFloat(j[0].lon)
    };
  } catch {
    const r = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`
    );

    const j = await r.json();

    if (!j.features?.length)
      throw new Error(`Could not find "${place}".`);

    const [lon, lat] = j.features[0].geometry.coordinates;

    return { lat, lon };
  }
}

/* ========= CARD ========= */
function Card({ poi, index, animDelay }) {

  const name = poi.name ?? poi.title ?? "Site";

  const [img, setImg] = useState(null);
  const [wikiTitle, setWikiTitle] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    fetchWikiData(name).then(({ img, wikiTitle }) => {
      if (!active) return;

      setImg(img);
      setWikiTitle(wikiTitle);
    });

    return () => {
      active = false;
    };

  }, [name]);

  useEffect(() => {
    if (!img) return;
    const preload = new Image();
    preload.src = img;
  }, [img]);

  const googleMapsUrl =
    `https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lon}`;

  const appleMapsUrl =
    `https://maps.apple.com/?ll=${poi.lat},${poi.lon}&q=${encodeURIComponent(name)}`;

  return (
    <article className="card" style={{ animationDelay: `${(animDelay ?? index) * 0.06}s` }}>

      {img ? (
        <div className="card-hero">

          <img
            src={img}
            alt={name}
            className={`card-hero-img${loaded ? " card-hero-img--in" : ""}`}
            onLoad={() => setLoaded(true)}
          />

          <div className="card-hero-fade" />
          <div className="card-hero-num">{index + 1}</div>

        </div>
      ) : (
        <div className="card-noimg-num">{index + 1}</div>
      )}

      <div className="card-body">

        <h2 className="card-title">{name}</h2>

        <p className="card-summary">
          {poi.summary || poi.description}
        </p>

        <div className="card-map-links">

          <a href={googleMapsUrl} target="_blank" rel="noreferrer">
            Google Maps
          </a>

          <a href={appleMapsUrl} target="_blank" rel="noreferrer">
            Apple Maps
          </a>

        </div>

        {wikiTitle && (
          <a
            href={`https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`}
            target="_blank"
            rel="noreferrer"
          >
            More info →
          </a>
        )}

      </div>
    </article>
  );
}

/* ========= MAIN APP ========= */
export default function App() {

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [pois, setPois] = useState([]);
  const [coords, setCoords] = useState([]);

  const [visibleCount, setVisible] = useState(8);

  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");

  const shown = useMemo(
    () => pois.slice(0, visibleCount),
    [pois, visibleCount]
  );

  async function findStops() {

    if (!start.trim() || !end.trim() || loading) return;

    window.scrollTo({ top: 0, behavior: "smooth" });

    setLoading(true);

    try {

      setLoadingStage("Locating cities...");
      const A = await geocode(start);

      setLoadingStage("Charting your route...");
      const B = await geocode(end);

      const r = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${A.lon},${A.lat};${B.lon},${B.lat}?overview=full&geometries=geojson`
      );

      const data = await r.json();

      const routeCoords = data.routes[0].geometry.coordinates;

      setCoords(routeCoords);

      setLoadingStage("Scanning for history...");

      const seen = new Set();

      const candidates = ALL_POIS
        .reduce((acc, p) => {

          const lat = p.lat ?? p.latitude;
          const lon = p.lon ?? p.longitude;

          if (!lat || !lon) return acc;

          const key =
            `${lat.toFixed(5)},${lon.toFixed(5)}`;

          if (seen.has(key)) return acc;

          const { distance, index } =
            minDistanceToRoute({ lat, lon }, routeCoords);

          if (distance <= 25) {

            seen.add(key);

            acc.push({
              ...p,
              lat,
              lon,
              routeIndex: index
            });

          }

          return acc;

        }, [])
        .sort((a, b) => a.routeIndex - b.routeIndex);

      setPois(candidates);
      setVisible(8);

    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
      setLoadingStage("");
    }
  }

  return (
    <>
      <a href="#search-panel" className="skip-link">
        Skip to route search
      </a>

      {loading && (
        <div
          className="lo-overlay"
          role="status"
          aria-live="polite"
        >
          {loadingStage || "Loading route…"}
        </div>
      )}

      <div className="page">

        <div className="hero">
          <h1>Roadtripper</h1>
        </div>

        <div id="search-panel" className="search-panel">

          <label className="sr-only" htmlFor="start-input">
            Start city
          </label>

          <input
            id="start-input"
            placeholder="Start city"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />

          <label className="sr-only" htmlFor="end-input">
            Destination city
          </label>

          <input
            id="end-input"
            placeholder="Destination"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && start && end)
                findStops();
            }}
          />

          <button
            onClick={findStops}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? "Searching…" : "Explore Route"}
          </button>

        </div>

        <div className="content">

          {shown.map((p, i) => (
            <Card key={p.name ?? i} poi={p} index={i} />
          ))}

          {visibleCount < pois.length && (
            <button onClick={() => setVisible(v => v + 6)}>
              Load more stops
            </button>
          )}

          {shown.length > 0 && (
            <MapContainer
              center={[shown[0].lat, shown[0].lon]}
              zoom={6}
              style={{ height: "300px" }}
              aria-label={`Map of historic stops between ${start} and ${end}`}
            >

              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {shown.map((p, i) => (
                <Marker key={i} position={[p.lat, p.lon]}>
                  <Popup>{p.name}</Popup>
                </Marker>
              ))}

            </MapContainer>
          )}

        </div>
      </div>
    </>
  );
}
