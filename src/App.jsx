import { useState, useEffect, useMemo, memo } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { MapContainer, TileLayer, Polyline, Marker, Popup } from "react-leaflet";

// Leaflet Icon Fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/* ========= HELPERS ========= */
// (Keep your existing ALL_POIS, haversineKm, and fetchWikiImage here)

/* ========= REDESIGNED CARD COMPONENT ========= */
const Card = memo(({ poi, index }) => {
  const name = poi.name ?? poi.title ?? "Historical Site";
  const [img, setImg] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchWikiImage(name).then(setImg);
  }, [name]);

  // Deep links for individual site navigation
  const siteMapUrl = `https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lon}`;

  return (
    <div className="card" style={{ animationDelay: `${index * 0.08}s` }}>
      <div className="card-hero">
        {img ? (
          <img 
            src={img} 
            alt={name} 
            className={`card-hero-img ${loaded ? "in" : ""}`} 
            onLoad={() => setLoaded(true)} 
          />
        ) : (
          <div className="card-placeholder" />
        )}
        <div className="card-hero-overlay" />
        <div className="card-hero-badge">{index + 1}</div>
        
        <div className="card-pills-floating">
          {poi.type && <span className="pill">{poi.type}</span>}
          {poi.era && <span className="pill pill-era">{poi.era}</span>}
        </div>
      </div>

      <div className="card-content">
        <h2 className="card-title">{name}</h2>
        <p className="card-description">{poi.summary || poi.description}</p>
        
        <div className="card-actions">
          <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(name)}`} target="_blank" rel="noreferrer" className="btn-secondary">
            Read History
          </a>
          <a href={siteMapUrl} target="_blank" rel="noreferrer" className="btn-primary">
            Navigate to Site →
          </a>
        </div>
      </div>
    </div>
  );
});

/* ========= UPDATED JOURNEY MAP (CLEAN) ========= */
const JourneyMap = memo(({ routeCoords, startName, endName }) => {
  if (!routeCoords?.length) return null;
  const startPt = routeCoords[0];
  const endPt = routeCoords[routeCoords.length - 1];
  const mid = routeCoords[Math.floor(routeCoords.length / 2)];
  
  // Navigation for the main route only
  const googleUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(startName)}&destination=${encodeURIComponent(endName)}&travelmode=driving`;

  return (
    <div className="map-card">
      <div className="map-card-header">
        <span>The Road Ahead</span>
      </div>
      <div className="map-viewport">
        <MapContainer 
          style={{ height: "100%", width: "100%" }} 
          center={[mid[1], mid[0]]} 
          zoom={6} 
          scrollWheelZoom={false}
          preferCanvas={true} 
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Polyline positions={routeCoords.map(c => [c[1], c[0]])} pathOptions={{ color: "#C04830", weight: 4 }} />
          <Marker position={[startPt[1], startPt[0]]}><Popup>Start</Popup></Marker>
          <Marker position={[endPt[1], endPt[0]]}><Popup>Destination</Popup></Marker>
        </MapContainer>
      </div>
      <div className="map-card-footer">
        <a href={googleUrl} target="_blank" rel="noreferrer" className="nav-main-btn">
          Start Full GPS Navigation
        </a>
      </div>
    </div>
  );
});

/* ========= APP CSS ADDITIONS ========= */
const styles = `
  .card { 
    background: #FAF4E4; border-radius: 20px; overflow: hidden; margin-bottom: 24px; 
    box-shadow: 0 10px 30px rgba(28,18,8,0.1); border: 1px solid rgba(184,146,74,0.2);
  }
  .card-hero { position: relative; height: 200px; background: #261C0C; }
  .card-hero-img { width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.6s ease; }
  .card-hero-img.in { opacity: 1; }
  .card-hero-badge { 
    position: absolute; top: 15px; left: 15px; width: 32px; height: 32px; 
    background: #C04830; color: white; border-radius: 50%; 
    display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 14px;
  }
  .card-pills-floating { position: absolute; bottom: 15px; left: 15px; display: flex; gap: 8px; }
  .pill { background: rgba(255,255,255,0.9); padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #1C1208; }
  .pill-era { background: #B8924A; color: white; }
  .card-content { padding: 20px; }
  .card-title { font-family: 'Playfair Display', serif; font-size: 24px; color: #1C1208; margin-bottom: 10px; }
  .card-description { font-size: 14px; color: #5A4228; line-height: 1.6; margin-bottom: 20px; }
  .card-actions { display: flex; gap: 10px; }
  .btn-primary, .btn-secondary { 
    flex: 1; text-align: center; padding: 12px; border-radius: 10px; 
    text-decoration: none; font-size: 13px; font-weight: 600; transition: 0.2s;
  }
  .btn-primary { background: #C04830; color: white; }
  .btn-secondary { background: rgba(184,146,74,0.15); color: #7A6035; }
  .nav-main-btn { 
    display: block; background: #1C1208; color: #D4A050; 
    text-align: center; padding: 16px; text-decoration: none; 
    font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
  }
`;
