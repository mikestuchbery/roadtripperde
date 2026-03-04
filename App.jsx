import { useState, useEffect, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/* ========= API KEYS ========= */

const LOCATIONIQ_KEY = "YOUR_LOCATIONIQ_KEY";
const ORS_KEY = "YOUR_OPENROUTESERVICE_KEY";

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

/* ========= GEO HELPERS ========= */

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

  for (let i = 0; i < coords.length; i++) {
    const d = haversineKm(
      { lat: poi.lat, lon: poi.lon },
      { lat: coords[i][1], lon: coords[i][0] }
    );
    if (d < min) {
      min = d;
      idx = i;
    }
  }

  return { distance: min, index: idx };
}

/* ========= GEOCODING ========= */

async function geocode(place) {
  const url = `https://us1.locationiq.com/v1/search?key=${LOCATIONIQ_KEY}&q=${encodeURIComponent(
    place + ", Germany"
  )}&format=json`;

  const r = await fetch(url);
  if (!r.ok) throw new Error("Geocoding failed");

  const j = await r.json();
  if (!j.length) throw new Error("City not found");

  return {
    lat: parseFloat(j[0].lat),
    lon: parseFloat(j[0].lon),
  };
}

/* ========= ROUTING ========= */

async function getRoute(A, B) {
  const r = await fetch(
    "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
    {
      method: "POST",
      headers: {
        Authorization: ORS_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coordinates: [
          [A.lon, A.lat],
          [B.lon, B.lat],
        ],
      }),
    }
  );

  if (!r.ok) throw new Error("Route request failed");

  const data = await r.json();

  return data.features[0].geometry.coordinates;
}

/* ========= MAIN APP ========= */

export default function App() {

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pois, setPois] = useState([]);
  const [routeCoords, setCoords] = useState([]);
  const [visibleCount, setVisible] = useState(8);
  const [loading, setLoading] = useState(false);

  const findStops = async () => {

    if (!start || !end || loading) return;

    setLoading(true);
    setPois([]);

    try {

      const A = await geocode(start);
      const B = await geocode(end);

      const coords = await getRoute(A, B);

      setCoords(coords);

      const seen = new Set();

      const candidates = ALL_POIS.reduce((acc, p) => {

        const lat = p.lat ?? p.latitude;
        const lon = p.lon ?? p.longitude;

        if (lat == null || lon == null) return acc;

        const key = `${lat},${lon}`;
        if (seen.has(key)) return acc;

        const { distance, index } = minDistanceToRoute(
          { lat, lon },
          coords
        );

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

    }
  };

  const shown = useMemo(() => pois.slice(0, visibleCount), [pois, visibleCount]);

  return <div>App UI unchanged</div>;
}
