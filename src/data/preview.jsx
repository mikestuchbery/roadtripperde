import { useState, useEffect } from "react";

const T = {
  bg:        "#f5f2eb",
  surface:   "#ffffff",
  card:      "#fafaf7",
  border:    "#d8d3c8",
  borderDark:"#b8b0a0",
  ink:       "#1a1a18",
  inkMid:    "#4a4740",
  inkFaint:  "#8a8680",
  red:       "#b83232",
  green:     "#2d6e3e",
  blue:      "#1a4a7a",
  mono:      "'IBM Plex Mono', 'Courier New', monospace",
  serif:     "'Lora', Georgia, serif",
  sans:      "'IBM Plex Sans', system-ui, sans-serif",
};

const TYPE_COLOR = {
  Castle: "#7a4a1a", Ruin: "#8a3030", "Old Town": "#1a4a7a",
  Church: "#4a2a6a", Monastery: "#3a2060", Museum: "#1a3a6a",
  Memorial: "#8a2828", "Natural Monument": "#2a5a30",
  "Historic Bridge": "#7a4a18", Viewpoint: "#186050",
};
const typeColor = t => TYPE_COLOR[t] || "#7a4a1a";

const SAMPLE_POIS = [
  { id: 1, name: "Schloss Neuschwanstein", type: "Castle", significance: 5, century: 19, state: "Bavaria", latitude: 47.5576, longitude: 10.7498, _distKm: 2.1, description: "Commissioned by Ludwig II in the 19th century, this Romanesque Revival palace is one of the most famous landmarks in Germany and inspired the Disney castle." },
  { id: 2, name: "Würzburger Residenz", type: "Castle", significance: 5, century: 18, state: "Bavaria", latitude: 49.7928, longitude: 9.939, _distKm: 0.8, description: "A masterpiece of German Baroque architecture and former residence of the Würzburg Prince-Bishops, featuring a massive staircase with a ceiling fresco by Tiepolo." },
  { id: 3, name: "Loreley", type: "Viewpoint", significance: 4, century: 13, state: "Rhineland-Palatinate", latitude: 50.1333, longitude: 7.7333, _distKm: 3.4, description: "A steep slate rock rising 132 metres above the Rhine, associated with a legendary siren whose singing lured fishermen to their deaths on the rocks below." },
  { id: 4, name: "Köln Cathedral", type: "Church", significance: 5, century: 13, state: "North Rhine-Westphalia", latitude: 50.9413, longitude: 6.9583, _distKm: 0.3, description: "A Gothic masterpiece that took over 600 years to complete. The cathedral is Germany's most visited landmark and a UNESCO World Heritage Site." },
  { id: 5, name: "Hambach Castle", type: "Ruin", significance: 4, century: 11, state: "Rhineland-Palatinate", latitude: 49.3167, longitude: 8.1167, _distKm: 5.6, description: "The cradle of German democracy — site of the 1832 Hambach Festival where 30,000 people gathered to demand freedom and national unity." },
];

const ROUTE = { from: "München", to: "Hamburg", distanceKm: 780, durationH: "7.2", stateCount: 5 };

const wikiCache = {};

const Stars = ({ n }) => (
  <span style={{ color: "#c8a000", fontSize: 11 }}>{"★".repeat(n)}{"☆".repeat(5 - n)}</span>
);

function POICard({ poi, index, expanded, onToggle }) {
  const color = typeColor(poi.type);
  const [wikiImg, setWikiImg] = useState(null);
  const [imgLoading, setImgLoading] = useState(false);

  useEffect(() => {
    if (!expanded || wikiImg !== null) return;
    const key = poi.name;
    if (wikiCache[key] !== undefined) { setWikiImg(wikiCache[key]); return; }
    setImgLoading(true);
    const encoded = encodeURIComponent(poi.name.replace(/ /g, "_"));
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const result = data.thumbnail ? { src: data.thumbnail.source, caption: data.title } : false;
        wikiCache[key] = result;
        setWikiImg(result);
      })
      .catch(() => { wikiCache[key] = false; setWikiImg(false); })
      .finally(() => setImgLoading(false));
  }, [expanded]);

  const geoHref = `geo:${poi.latitude},${poi.longitude}?q=${poi.latitude},${poi.longitude}(${encodeURIComponent(poi.name)})`;
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${poi.latitude},${poi.longitude}`;

  return (
    <div style={{ display: "flex" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 28, flexShrink: 0 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: T.surface, border: `2px solid ${color}`, zIndex: 1, flexShrink: 0, marginTop: 16 }} />
        <div style={{ flex: 1, width: 1, background: T.border, minHeight: 28 }} />
      </div>
      <div
        onClick={() => onToggle(index)}
        style={{
          flex: 1, marginLeft: 10, marginBottom: 8,
          background: expanded ? T.card : T.surface,
          border: `1px solid ${expanded ? T.borderDark : T.border}`,
          borderLeft: `3px solid ${color}`,
          padding: "11px 14px", cursor: "pointer",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 3, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 9, fontFamily: T.mono, color, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 700 }}>{poi.type}</span>
              {poi.century && <span style={{ fontSize: 9, fontFamily: T.mono, color: T.inkFaint }}>{poi.century}th century</span>}
            </div>
            <div style={{ fontFamily: T.serif, fontSize: 15, color: T.ink, fontWeight: 600, lineHeight: 1.3 }}>{poi.name}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
            <Stars n={poi.significance} />
            <span style={{ fontSize: 9, fontFamily: T.mono, color: T.inkFaint }}>{poi._distKm.toFixed(1)} km off route</span>
          </div>
        </div>

        {expanded && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
            {imgLoading && (
              <div style={{ height: 100, background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.inkFaint }}>loading image…</span>
              </div>
            )}
            {wikiImg && (
              <div style={{ marginBottom: 12 }}>
                <img src={wikiImg.src} alt={wikiImg.caption} onClick={e => e.stopPropagation()}
                  style={{ width: "100%", maxHeight: 180, objectFit: "cover", display: "block", borderBottom: `1px solid ${T.border}` }} />
                <div style={{ fontSize: 9, fontFamily: T.mono, color: T.inkFaint, marginTop: 4 }}>via Wikipedia</div>
              </div>
            )}
            <p style={{ fontFamily: T.serif, fontSize: 13, color: T.inkMid, lineHeight: 1.75, margin: 0 }}>{poi.description}</p>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}`, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 10, fontFamily: T.mono, color: T.inkFaint }}>{poi.state}</span>
              <a href={geoHref} onClick={e => e.stopPropagation()}
                style={{ fontSize: 10, fontFamily: T.mono, color: T.blue, textDecoration: "underline" }}>
                Open in map app →
              </a>
              <a href={mapsHref} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ fontSize: 10, fontFamily: T.mono, color: T.inkFaint, textDecoration: "underline" }}>
                Google Maps
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [expanded, setExpanded] = useState(null);
  const toggle = i => setExpanded(v => v === i ? null : i);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;1,500&family=IBM+Plex+Mono:wght@400;700&family=IBM+Plex+Sans:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .poi-enter { animation: fadeUp 0.25s ease forwards; opacity: 0; }
      `}</style>
      <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.sans }}>

        {/* Header */}
        <div style={{ borderBottom: `2px solid ${T.ink}`, background: T.surface, padding: "20px 24px 18px" }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 4 }}>
              <h1 style={{ fontFamily: T.serif, fontSize: "clamp(28px, 6vw, 42px)", fontWeight: 600, color: T.ink, lineHeight: 1 }}>
                RoadTripperDE
              </h1>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: T.inkFaint, letterSpacing: 2 }}>v1.0</span>
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkFaint, letterSpacing: 1.5 }}>
              REMARKABLE STOPS ALONG YOUR ROUTE · GERMANY
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 20px 80px" }}>

          {/* Input section (static preview) */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, padding: "20px", marginBottom: 24 }}>
            <p style={{ fontFamily: T.serif, fontSize: 14, color: T.inkMid, lineHeight: 1.7, marginBottom: 20, fontStyle: "italic", borderLeft: `3px solid ${T.border}`, paddingLeft: 12 }}>
              Enter a start and end point anywhere in Germany. We'll plot the driving route and surface the most remarkable historical, cultural, and natural stops within a short detour — castles, ruins, old towns, monasteries, and more.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              {[["From", "e.g. München"], ["To", "e.g. Hamburg"]].map(([label, ph]) => (
                <div key={label}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkFaint, letterSpacing: 1.5, marginBottom: 5, textTransform: "uppercase" }}>{label}</div>
                  <input placeholder={ph} defaultValue={label === "From" ? "München" : "Hamburg"}
                    style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, padding: "9px 12px", fontFamily: T.mono, fontSize: 13, color: T.ink }} />
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[["Max detour", "7 km"], ["Max stops", "10 stops"]].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkFaint, letterSpacing: 1.5, marginBottom: 5, textTransform: "uppercase" }}>{label}</div>
                  <input defaultValue={val} style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, padding: "9px 12px", fontFamily: T.mono, fontSize: 13, color: T.ink }} />
                </div>
              ))}
            </div>
            <button style={{ width: "100%", padding: "11px", background: T.ink, border: "none", fontFamily: T.mono, fontSize: 11, fontWeight: 700, color: T.bg, letterSpacing: 2, cursor: "pointer" }}>
              FIND STOPS →
            </button>
          </div>

          {/* Route summary */}
          <div style={{ borderTop: `2px solid ${T.ink}`, borderBottom: `1px solid ${T.border}`, padding: "12px 0", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: T.serif, fontSize: 15, color: T.ink, fontStyle: "italic" }}>
                {ROUTE.from} → {ROUTE.to}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkFaint, marginTop: 3 }}>
                {SAMPLE_POIS.length} stops · {ROUTE.stateCount} states
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: T.mono, fontSize: 14, color: T.ink, fontWeight: 700 }}>{ROUTE.distanceKm} km</div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.inkFaint }}>~{ROUTE.durationH} h drive</div>
            </div>
          </div>

          {/* Timeline */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, paddingLeft: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: T.green, flexShrink: 0 }} />
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.inkMid }}>{ROUTE.from}</span>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: T.inkFaint, letterSpacing: 1 }}>DEPARTURE</span>
            </div>
            <div style={{ marginLeft: 8, width: 1, height: 14, background: T.border }} />

            {SAMPLE_POIS.map((poi, i) => (
              <div key={poi.id} className="poi-enter" style={{ animationDelay: `${i * 0.04}s` }}>
                <POICard poi={poi} index={i} expanded={expanded === i} onToggle={toggle} />
              </div>
            ))}

            <div style={{ marginLeft: 8, width: 1, height: 14, background: T.border }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: T.red, flexShrink: 0 }} />
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.inkMid }}>{ROUTE.to}</span>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: T.inkFaint, letterSpacing: 1 }}>DESTINATION</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "16px 20px", background: T.surface }}>
          <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.inkFaint, letterSpacing: 1.5 }}>ROADTRIPPER DE · GERMANY · 960 POIs</div>
            <div style={{ fontFamily: T.serif, fontSize: 13, color: T.inkFaint, fontStyle: "italic" }}>
              A labour of love by <a href="mailto:mike@stuchbery.me" style={{ color: T.inkMid, textDecoration: "underline" }}>Mike Stuchbery</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
