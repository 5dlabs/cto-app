import {
  IconShield,
  IconDatabase,
  IconCpu,
  IconRadio,
  IconKey,
  IconGit,
  IconCloud,
  IconHeart,
  IconPackage,
  IconActivity,
  IconLink,
  IconGlobe,
  IconBracket,
} from "./icons";
import { INFRASTRUCTURE, type ServiceCategory } from "./data";

const CATEGORY_ICON: Record<string, (p: { size?: number }) => JSX.Element> = {
  Security: IconShield,
  "Data & Storage": IconDatabase,
  "AI & Inference": IconCpu,
  "Messaging & Events": IconRadio,
  "Secrets & Identity": IconKey,
  "Source Control": IconGit,
  "Delivery & Observability": IconCloud,
  "Networking & Connectivity": IconLink,
  "Blockchain Infrastructure": IconPackage,
};

const SERVICE_ICON: Record<string, (p: { size?: number }) => JSX.Element> = {
  SENTINEL: IconShield,
  DATA: IconDatabase,
  CACHE: IconActivity,
  STORE: IconCloud,
  VOLUME: IconDatabase,
  INFERENCE: IconCpu,
  LLAMASTACK: IconCpu,
  STREAM: IconRadio,
  VAULT: IconKey,
  GIT: IconGit,
  DEPLOY: IconPackage,
  OBSERVE: IconActivity,
  PULSE: IconHeart,
  MESH: IconLink,
  EDGE: IconGlobe,
  NODE: IconPackage,
  INDEX: IconBracket,
};

export function InfrastructureView() {
  return (
    <div className="section pane--wide">
      <div className="infra-banner">
        <span className="infra-banner__label">scheduler · healthy</span>
        All 17 services reconciling. GPU pool has 28h headroom. No pending upgrades. 5D PULSE has
        auto-remediated 3 events in the last 24h.
      </div>

      <div className="chart-card" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <div>
          <div className="section__eyebrow">Platform · operator-provisioned</div>
          <div className="section__title">17 services · 9 categories</div>
          <div className="section__sub">
            Everything here is managed by 5D operators on your infrastructure — no separate accounts,
            no vendor lock-in, no manual wiring. Each service presents a first-class API like a cloud
            provider.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span className="chip chip--success">all green</span>
      </div>

      {INFRASTRUCTURE.map((cat) => (
        <Category key={cat.name} category={cat} />
      ))}
    </div>
  );
}

function Category({ category }: { category: ServiceCategory }) {
  const Icon = CATEGORY_ICON[category.name] ?? IconCloud;
  return (
    <div className="svc-category">
      <div className="svc-category__head">
        <div>
          <div className="section__eyebrow" style={{ marginBottom: 2 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon size={11} /> {category.name}
            </span>
          </div>
          <div className="svc-category__title">{category.services.length} service{category.services.length === 1 ? "" : "s"}</div>
          <p className="svc-category__sub">{category.blurb}</p>
        </div>
      </div>
      <div className="svc-grid">
        {category.services.map((s) => {
          const SIcon = SERVICE_ICON[s.tag] ?? IconCpu;
          return (
            <div className="svc-card" key={s.tag}>
              <div className="svc-card__head">
                <div className="svc-card__icon">
                  <SIcon size={14} />
                </div>
                <div>
                  <div className="svc-card__tag">{s.tag}</div>
                  <div className="svc-card__title">{s.tagline}</div>
                </div>
              </div>
              <p className="svc-card__body">{s.description}</p>
              <div className="svc-card__stack">stack · {s.stack}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
