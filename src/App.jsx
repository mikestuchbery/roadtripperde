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
  const x = Math.sin(dLat
