// Infrastructure view — regions, capacity, uptime
// Logseq-flavored: block-ish cards, soft surfaces, no heavy chrome.

const REGIONS = [
  { id: "us-east",  code: "USE", name: "US East",      city: "Ashburn, VA",    lat: 39,  lon: -77,  nodes: 6, cpu: 68, mem: 71, disk: 44, status: "ok",   provider: "talos/bare-metal" },
  { id: "us-west",  code: "USW", name: "US West",      city: "San Jose, CA",   lat: 37,  lon: -122, nodes: 4, cpu: 52, mem: 58, disk: 37, status: "ok",   provider: "talos/bare-metal" },
  { id: "eu-west",  code: "EUW", name: "EU West",      city: "Amsterdam, NL",  lat: 52,  lon: 5,    nodes: 4, cpu: 74, mem: 63, disk: 51, status: "warn", provider: "talos/bare-metal" },
  { id: "ap-south", code: "APS", name: "AP Southeast", city: "Singapore, SG",  lat: 1,   lon: 104,  nodes: 2, cpu: 41, mem: 48, disk: 29, status: "ok",   provider: "talos/bare-metal" },
  { id: "sa-east",  code: "SAE", name: "SA East",      city: "São Paulo, BR",  lat: -23, lon: -46,  nodes: 1, cpu: 28, mem: 34, disk: 18, status: "off",  provider: "talos/bare-metal" },
];

// Project lon/lat into a 960×440 equirectangular frame
const proj = (lon, lat, w = 960, h = 440) => [((lon + 180) / 360) * w, ((90 - lat) / 180) * h];

const Infrastructure = () => {
  const [sel, setSel] = React.useState("us-east");
  const region = REGIONS.find(r => r.id === sel);

  return (
    <div className="infra-view">
      {/* World map — top band */}
      <div className="infra-map-card">
        <div className="infra-card-head">
          <div>
            <div className="card-eyebrow">Global footprint</div>
            <div className="card-title">17 nodes · 5 regions · 4 providers</div>
          </div>
          <div style={{ display: "inline-flex", gap: 6 }}>
            <span className="infra-legend"><span className="dot ok" />healthy</span>
            <span className="infra-legend"><span className="dot warn" />degraded</span>
            <span className="infra-legend"><span className="dot err" />failing</span>
            <span className="infra-legend"><span className="dot off" />offline</span>
          </div>
        </div>
        <div className="infra-map-wrap">
          <svg viewBox="0 0 960 440" className="infra-map" preserveAspectRatio="xMidYMid meet">
            {/* dot-grid continents (abstract) */}
            <defs>
              <pattern id="dotgrid" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.7" fill="var(--rx-gray-05)" />
              </pattern>
              <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.55" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* simplified landmass blobs via paths */}
            <g fill="url(#dotgrid)" stroke="none">
              {/* N. America */}
              <path d="M80,80 L260,80 L310,160 L280,220 L200,260 L130,230 L90,170 Z" />
              {/* S. America */}
              <path d="M230,270 L290,260 L300,340 L260,400 L220,380 L210,320 Z" />
              {/* Europe */}
              <path d="M430,80 L540,85 L560,140 L510,180 L450,170 L425,120 Z" />
              {/* Africa */}
              <path d="M460,190 L560,180 L580,260 L540,340 L490,330 L455,260 Z" />
              {/* Asia */}
              <path d="M560,70 L820,70 L860,160 L790,220 L700,210 L620,180 L560,140 Z" />
              {/* Australia */}
              <path d="M780,290 L860,290 L870,340 L810,355 L780,330 Z" />
            </g>

            {/* Longitude/latitude grid hints */}
            <g stroke="var(--border-subtle)" strokeWidth="0.5" fill="none">
              <line x1="0" y1="220" x2="960" y2="220" />
              <line x1="480" y1="0" x2="480" y2="440" />
            </g>

            {/* Region nodes */}
            {REGIONS.map(r => {
              const [x, y] = proj(r.lon, r.lat);
              const color =
                r.status === "ok" ? "var(--state-success)" :
                r.status === "warn" ? "var(--state-warning)" :
                r.status === "err" ? "var(--state-danger)" :
                "var(--fg-faint)";
              const active = sel === r.id;
              return (
                <g key={r.id} style={{ cursor: "pointer" }} onClick={() => setSel(r.id)}>
                  {active && <circle cx={x} cy={y} r="26" fill="url(#glow)" />}
                  <circle cx={x} cy={y} r={8 + Math.min(r.nodes, 6)} fill="var(--bg-app)" stroke={color} strokeWidth="1.5" opacity={active ? 1 : 0.6} />
                  <circle cx={x} cy={y} r="3" fill={color} />
                  <text x={x + 14} y={y - 6} fill="var(--fg-secondary)" fontSize="11" fontFamily="var(--font-mono)">{r.code}</text>
                  <text x={x + 14} y={y + 6} fill="var(--fg-muted)" fontSize="10" fontFamily="var(--font-mono)">{r.nodes}n</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Region rail */}
      <div className="infra-region-rail">
        {REGIONS.map(r => {
          const color = r.status === "ok" ? "ok" : r.status === "warn" ? "warn" : r.status === "err" ? "err" : "off";
          return (
            <button key={r.id} className={`infra-region-card ${sel === r.id ? "active" : ""}`} onClick={() => setSel(r.id)}>
              <div className="infra-region-head">
                <span className={`infra-region-code ${color}`}>{r.code}</span>
                <span className="infra-region-name">{r.name}</span>
                <span className={`infra-region-status ${color}`}>
                  {r.status === "ok" ? "healthy" : r.status === "warn" ? "degraded" : r.status === "err" ? "failing" : "offline"}
                </span>
              </div>
              <div className="infra-region-city">{r.city} · {r.nodes}n · {r.provider}</div>
              <div className="infra-bars">
                <InfraBar label="cpu" value={r.cpu} />
                <InfraBar label="mem" value={r.mem} />
                <InfraBar label="disk" value={r.disk} />
              </div>
            </button>
          );
        })}
      </div>

      {/* Region detail */}
      <div className="infra-detail">
        <div className="infra-detail-head">
          <div>
            <div className="card-eyebrow">{region.code} · detail</div>
            <div className="card-title">{region.name} <span style={{ color: "var(--fg-muted)", fontWeight: 400 }}>— {region.city}</span></div>
          </div>
          <div style={{ display: "inline-flex", gap: 6 }}>
            <button className="btn btn-ghost"><IconRefresh size={12} /> Re-sync</button>
            <button className="btn"><IconExternal size={12} /> Open Grafana</button>
          </div>
        </div>

        <div className="infra-grid">
          {/* Node inventory */}
          <div className="infra-block">
            <div className="infra-block-head">
              <span className="infra-block-title">Nodes</span>
              <span className="infra-block-hint">talos v1.8.2</span>
            </div>
            <div className="infra-node-list">
              {Array.from({ length: region.nodes }).map((_, i) => {
                const role = i === 0 ? "control-plane" : "worker";
                const cpu = 40 + ((i * 13) % 50);
                const mem = 35 + ((i * 17) % 55);
                const hot = cpu > 80 || mem > 85;
                return (
                  <div key={i} className="infra-node">
                    <span className={`infra-node-dot ${hot ? "warn" : "ok"}`} />
                    <span className="infra-node-name">{region.id}-{role === "control-plane" ? "cp" : "w"}-{String(i + 1).padStart(2, "0")}</span>
                    <span className="infra-node-role">{role}</span>
                    <div className="infra-node-micro">
                      <span>cpu <strong>{cpu}%</strong></span>
                      <span>mem <strong>{mem}%</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Capacity */}
          <div className="infra-block">
            <div className="infra-block-head">
              <span className="infra-block-title">Capacity</span>
              <span className="infra-block-hint">last 1h avg</span>
            </div>
            <div className="infra-capacity">
              <CapacityRing label="vCPU"  used={region.cpu}  total={100} unit="%" />
              <CapacityRing label="Memory" used={region.mem}  total={100} unit="%" />
              <CapacityRing label="Disk"   used={region.disk} total={100} unit="%" />
            </div>
            <div className="infra-capacity-footer">
              <div><span className="k">Headroom</span><span className="v">{100 - Math.max(region.cpu, region.mem)}%</span></div>
              <div><span className="k">Cost / h</span><span className="v">${(region.nodes * 0.42).toFixed(2)}</span></div>
              <div><span className="k">Spot</span><span className="v">0</span></div>
            </div>
          </div>

          {/* Availability */}
          <div className="infra-block wide">
            <div className="infra-block-head">
              <span className="infra-block-title">Uptime · 90 days</span>
              <span className="infra-block-hint">
                {region.status === "warn" ? "3 incidents · 99.86%" :
                 region.status === "off"  ? "planned maintenance · 98.21%" :
                 "1 incident · 99.982%"}
              </span>
            </div>
            <UptimeStrip status={region.status} />
            <div className="infra-incidents">
              {region.status === "warn" ? (
                <>
                  <Incident time="2h ago"  sev="warn" title="p99 latency spike · api-gateway" who="Atlas acknowledged" />
                  <Incident time="9d ago"  sev="warn" title="brief packet loss · Amsterdam POP" who="auto-recovered in 4m" />
                  <Incident time="41d ago" sev="info" title="planned Talos rollout v1.8.1 → v1.8.2" who="Atlas · zero-downtime" />
                </>
              ) : region.status === "off" ? (
                <>
                  <Incident time="now"    sev="err"  title="region offline for maintenance" who="expected: 4h remaining" />
                  <Incident time="12d ago" sev="info" title="region provisioned · São Paulo" who="Atlas bootstrapped talosctl" />
                </>
              ) : (
                <>
                  <Incident time="6d ago"  sev="info" title="scaled worker pool 4 → 6" who="autoscaler · inferred demand" />
                  <Incident time="34d ago" sev="warn" title="control-plane restart · stale lease" who="recovered in 22s" />
                </>
              )}
            </div>
          </div>

          {/* Traffic */}
          <div className="infra-block wide">
            <div className="infra-block-head">
              <span className="infra-block-title">Traffic · req/s</span>
              <span className="infra-block-hint">24h</span>
            </div>
            <TrafficChart status={region.status} seed={region.lat} />
            <div className="infra-traffic-stats">
              <div><span className="k">Peak</span><span className="v">12.4k rps</span></div>
              <div><span className="k">Now</span><span className="v">8.1k rps</span></div>
              <div><span className="k">p50</span><span className="v">18 ms</span></div>
              <div><span className="k">p99</span><span className="v">{region.status === "warn" ? "240 ms" : "92 ms"}</span></div>
              <div><span className="k">Error rate</span><span className="v">{region.status === "warn" ? "0.42%" : "0.01%"}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helpers -----------------------------------------------------

const InfraBar = ({ label, value }) => {
  const hot = value > 80;
  return (
    <div className="infra-bar">
      <div className="infra-bar-label">
        <span>{label}</span>
        <span className="v">{value}%</span>
      </div>
      <div className="infra-bar-track">
        <div className={`infra-bar-fill ${hot ? "hot" : ""}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
};

const CapacityRing = ({ label, used, total, unit }) => {
  const pct = Math.min(100, (used / total) * 100);
  const R = 28, C = 2 * Math.PI * R;
  const off = C * (1 - pct / 100);
  const color = pct > 80 ? "var(--state-warning)" : "var(--accent)";
  return (
    <div className="cap-ring">
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={R} fill="none" stroke="var(--border-subtle)" strokeWidth="5" />
        <circle
          cx="38" cy="38" r={R} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 38 38)"
        />
        <text x="38" y="36" textAnchor="middle" fill="var(--fg-primary)" fontSize="16" fontFamily="var(--font-display)" fontWeight="500">{Math.round(pct)}</text>
        <text x="38" y="50" textAnchor="middle" fill="var(--fg-muted)" fontSize="9" fontFamily="var(--font-mono)">{unit}</text>
      </svg>
      <div className="cap-ring-label">{label}</div>
    </div>
  );
};

const UptimeStrip = ({ status }) => {
  // 90 bars: mostly green, one warn cluster, occasional yellow
  const bars = Array.from({ length: 90 }).map((_, i) => {
    if (status === "warn") {
      if (i >= 85 && i <= 87) return "warn";
      if (i === 81) return "warn";
    }
    if (status === "err" || status === "off") {
      if (i >= 88) return "err";
    }
    if ((i * 7) % 31 === 3 && status === "ok") return "warn";
    return "ok";
  });
  return (
    <div className="uptime-strip">
      {bars.map((s, i) => <span key={i} className={`uptime-tick ${s}`} />)}
    </div>
  );
};

const Incident = ({ time, sev, title, who }) => (
  <div className="incident">
    <span className={`incident-dot ${sev}`} />
    <span className="incident-time">{time}</span>
    <span className="incident-title">{title}</span>
    <span className="incident-who">{who}</span>
  </div>
);

const TrafficChart = ({ status, seed = 0 }) => {
  // deterministic pseudo-random line
  const rand = (i) => (Math.sin(i * 1.3 + seed) * 10000) % 1;
  const pts = Array.from({ length: 48 }).map((_, i) => {
    const base = 40 + Math.sin(i / 4) * 18 + Math.cos(i / 2) * 8;
    const jitter = Math.abs(rand(i)) * 12;
    const spike = status === "warn" && i > 38 && i < 42 ? 35 : 0;
    const y = Math.max(5, Math.min(90, base + jitter - 20 + spike));
    return [ (i / 47) * 100, 100 - y ];
  });
  const path = "M " + pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L ");
  const area = path + ` L 100,100 L 0,100 Z`;
  return (
    <svg viewBox="0 0 100 100" className="traffic-chart" preserveAspectRatio="none">
      <defs>
        <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[25, 50, 75].map(y => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="var(--border-subtle)" strokeWidth="0.3" strokeDasharray="1 2" />)}
      <path d={area} fill="url(#tg)" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="0.8" />
    </svg>
  );
};

Object.assign(window, { Infrastructure });
