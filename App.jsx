import { useState, useEffect, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap
} from "react-leaflet";

/* =========================
   Fix Leaflet default icons
========================= */

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

/* =========================
   POI IMPORTS
========================= */

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

/* =========================
   POI Normaliser
========================= */

function asArray(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (Array.isArray(x.pois)) return x.pois;
  if (Array.isArray(x.data)) return x.data;
  return x.name ? [x] : [];
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
  ...asArray(thuringia)
];

/* =========================
   Distance calculations
========================= */

function haversineKm(a, b) {

  const R = 6371;

  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;

  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 *
      Math.cos(lat1) *
      Math.cos(lat2);

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

/* =========================
   Geocoder
========================= */

async function geocode(place) {

  const url =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(place + ", Germany")}&limit=5`;

  const r = await fetch(url);

  if (!r.ok) throw new Error("Location lookup failed");

  const j = await r.json();

  if (!j.features?.length)
    throw new Error("City not found");

  const [lon, lat] =
    j.features[0].geometry.coordinates;

  return { lat, lon };
}

/* =========================
   Route API
========================= */

async function getRoute(A, B) {

  const r = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${A.lon},${A.lat};${B.lon},${B.lat}?overview=full&geometries=geojson`
  );

  if (!r.ok)
    throw new Error("Route failed");

  const data = await r.json();

  return data.routes[0].geometry.coordinates;
}

/* =========================
   Auto-fit map bounds
========================= */

function FitRouteBounds({ coords }) {

  const map = useMap();

  useEffect(() => {

    if (!coords?.length) return;

    const bounds = coords.map(
      c => [c[1], c[0]]
    );

    map.fitBounds(bounds, {
      padding: [40, 40]
    });

  }, [coords, map]);

  return null;
}

/* =========================
   Journey Map
========================= */

function JourneyMap({ routeCoords, stops }) {

  if (!routeCoords?.length) return null;

  return (
    <div className="map-card">

      <div className="map-viewport">

        <MapContainer
          style={{
            height: "100%",
            width: "100%"
          }}
          scrollWheelZoom={false}
        >

          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Polyline
            positions={routeCoords.map(c => [c[1], c[0]])}
            pathOptions={{
              color: "#C04830",
              weight: 3,
              opacity: 0.85,
              dashArray: "8 6",
              lineCap: "round"
            }}
          />

          {stops.map((p, i) => (
            <Marker
              key={i}
              position={[p.lat, p.lon]}
            >
              <Popup>{p.name}</Popup>
            </Marker>
          ))}

          <FitRouteBounds coords={routeCoords} />

        </MapContainer>

      </div>

    </div>
  );
}

/* =========================
   Main App
========================= */

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

      const candidates =
        ALL_POIS.reduce((acc, p) => {

          const lat = p.lat ?? p.latitude;
          const lon = p.lon ?? p.longitude;

          if (lat == null || lon == null)
            return acc;

          const key = `${lat},${lon}`;
          if (seen.has(key)) return acc;

          const { distance, index } =
            minDistanceToRoute(
              { lat, lon },
              coords
            );

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
        .sort((a, b) =>
          a.routeIndex - b.routeIndex
        );

      setPois(candidates);
      setVisible(8);

    } catch (e) {

      alert(e.message);

    } finally {

      setLoading(false);

    }
  };

  const shown =
    useMemo(
      () => pois.slice(0, visibleCount),
      [pois, visibleCount]
    );

  return (
    <>
<style>{`

body{
font-family:system-ui;
background:#E8DEC6;
margin:0;
}

.hero{
text-align:center;
padding:60px 20px;
background:#1C1208;
color:#F5EDDA;
}

.search-panel{
padding:20px;
background:#1C1208;
}

.search-input{
width:100%;
padding:14px;
margin-bottom:10px;
border-radius:8px;
border:none;
}

.search-btn{
width:100%;
padding:14px;
border:none;
border-radius:10px;
background:#C04830;
color:white;
font-weight:600;
cursor:pointer;
}

.content{
padding:24px 16px;
}

.welcome{
background:#FAF4E4;
padding:24px;
border-radius:14px;
margin-bottom:16px;
text-align:center;
}

.cards{
display:block;
}

.card{
background:#FAF4E4;
border-radius:14px;
padding:16px;
margin-bottom:16px;

opacity:0;
transform:translateY(20px);
animation:cardIn .6s ease forwards;

transition:transform .25s,box-shadow .25s;
}

.card:hover{
transform:translateY(-4px);
box-shadow:0 8px 18px rgba(0,0,0,.15);
}

@keyframes cardIn{
to{
opacity:1;
transform:translateY(0);
}
}

.map-card{
height:320px;
margin-top:20px;
border-radius:14px;
overflow:hidden;
}

.footer{
text-align:center;
padding:40px 20px;
}

.footer-email{
color:#C04830;
text-decoration:none;
display:inline-block;
margin-top:6px;
}

.footer-copy{
font-size:12px;
color:#7a6035;
margin-top:6px;
}

@media(min-width:768px){

.content{
max-width:900px;
margin:auto;
}

.cards{
display:grid;
grid-template-columns:1fr 1fr;
gap:18px;
}

}

`}</style>

<div className="hero">
<h1>Roadtripper</h1>
<p>History & heritage along your route</p>
</div>

<div className="search-panel">

<input
className="search-input"
placeholder="Start city"
value={start}
onChange={e=>setStart(e.target.value)}
/>

<input
className="search-input"
placeholder="Destination"
value={end}
onChange={e=>setEnd(e.target.value)}
/>

<button
className="search-btn"
onClick={findStops}
disabled={loading}
>
{loading ? "Searching…" : "Explore Route"}
</button>

</div>

<div className="content">

<div className="welcome">

<h2>How it works</h2>

<p>
Enter a start and destination in Germany.  
We'll surface historic sites within 25km of your journey.
</p>

<p>
A labour of love by <strong>Mike Stuchbery</strong>
</p>

<a
href="mailto:michael.stuchbery@gmail.com"
className="footer-email"
>
michael.stuchbery@gmail.com
</a>

<br/>

<a
href="https://github.com/mikestuchbery"
target="_blank"
rel="noopener noreferrer"
className="footer-email"
>
More tools by Mike →
</a>

</div>

<div className="cards">

{shown.map((p,i)=>(
<div
key={i}
className="card"
style={{
animationDelay:`${i*0.08}s`
}}
>
<h3>{p.name}</h3>
<p>{p.summary}</p>
</div>
))}

</div>

{shown.length>0&&(
<JourneyMap
routeCoords={routeCoords}
stops={shown}
/>
)}

<footer className="footer">

<p>
A labour of love by <strong>Mike Stuchbery</strong>
</p>

<a
href="mailto:michael.stuchbery@gmail.com"
className="footer-email"
>
michael.stuchbery@gmail.com
</a>

<br/>

<a
href="https://github.com/mikestuchbery"
target="_blank"
rel="noopener noreferrer"
className="footer-email"
>
More tools by Mike →
</a>

<p className="footer-copy">
© 2026 Mike Stuchbery
</p>

</footer>

</div>
</>
);
}
