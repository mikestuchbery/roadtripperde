import { useState, useEffect } from "react";

// Theme (unchanged from preview)
const T = {
  bg: "#f5f2eb",
  surface: "#ffffff",
  card: "#fafaf7",
  border: "#d8d3c8",
  borderDark: "#b8b0a0",
  ink: "#1a1a18",
  inkMid: "#4a4740",
  inkFaint: "#8a8680",
  red: "#b83232",
  green: "#2d6e3e",
  blue: "#1a4a7a",
  mono: "'IBM Plex Mono', 'Courier New', monospace",
  serif: "'Lora', Georgia, serif",
  sans: "'IBM Plex Sans', system-ui, sans-serif",
};

// Load all state POIs from JSON files
async function loadAllPOIs() {
  const files = [
    "baden-wuerttemberg-pois.json",
    "bavaria-pois.json",
    "berlin-pois.json",
    "brandenburg-pois.json",
    "bremen-pois.json",
    "hamburg-pois.json",
    "hesse-pois.json",
    "lower-saxony-pois.json",
    "mecklenburg-vorpommern-pois.json",
    "north-rhine-westphalia-pois.json",
    "rhineland-palatinate-pois.json",
    "saarland-pois.json",
    "saxony-pois.json",
    "saxony-anhalt-pois.json",
    "schleswig-holstein-pois.json",
    "thuringia-pois.json",
  ];

  const all = [];
  for (const f of files) {
    const mod = await import(`./data/${f}`);
    all.push(...mod.default);
  }
  return all;
}

export default function App() {
  const [pois, setPois] = useState([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllPOIs().then((data) => {
      setPois(data);
      setLoading(false);
    });
  }, []);

  const filtered = pois.filter((p) =>
    p.name?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.bg,
        fontFamily: T.sans,
        color: T.ink,
        padding: 24,
      }}
    >
      <h1 style={{ fontFamily: T.serif, marginBottom: 8 }}>
        Germany Roadside Stops
      </h1>
      <p style={{ color: T.inkMid, marginBottom: 16 }}>
        Historic, cultural, and scenic places along your route.
      </p>

      <input
        placeholder="Search places…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          padding: 10,
          border: `1px solid ${T.border}`,
          borderRadius: 6,
          marginBottom: 20,
          width: "100%",
          maxWidth: 420,
          fontFamily: T.sans,
        }}
      />

      {loading ? (
        <div>Loading POIs…</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))",
            gap: 16,
          }}
        >
          {filtered.map((p, i) => (
            <div
              key={i}
              style={{
                background: T.card,
                border: `1px solid ${T.border}`,
                borderRadius: 8,
                padding: 14,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 13, color: T.inkMid, marginBottom: 6 }}>
                {p.type} • {p.state}
              </div>
              <div style={{ fontSize: 13 }}>{p.summary || p.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
