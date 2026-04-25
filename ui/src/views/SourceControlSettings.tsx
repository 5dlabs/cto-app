import { useEffect, useMemo, useState } from "react";
import {
  deleteScmConnection,
  listScmConnections,
  prepareScmProvisioning,
  saveScmConnection,
  slugifyConnectionId,
  type ScmConnection,
  type ScmProvider,
  type ScmProvisioningPlan,
} from "../api/sourceControlProvisioning";
import { IconExternal, IconGit, IconKey, IconLock } from "./icons";

const PROVIDER_LABELS: Record<ScmProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
};

const PROVIDER_DEFAULTS: Record<ScmProvider, { baseUrl: string; ownerLabel: string }> = {
  github: { baseUrl: "https://github.com", ownerLabel: "GitHub user or org" },
  gitlab: { baseUrl: "https://gitlab.com", ownerLabel: "GitLab group/user" },
};

const STATUS_LABELS: Record<ScmConnection["status"], string> = {
  draft: "draft",
  "pending-install": "pending install",
  "manual-token-required": "manual token",
  ready: "ready",
};

export function SourceControlSettings() {
  const [connections, setConnections] = useState<ScmConnection[]>([]);
  const [provider, setProvider] = useState<ScmProvider>("github");
  const [owner, setOwner] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [baseUrl, setBaseUrl] = useState(PROVIDER_DEFAULTS.github.baseUrl);
  const [callbackBaseUrl, setCallbackBaseUrl] = useState("http://localhost:8080");
  const [plan, setPlan] = useState<ScmProvisioningPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const manifestJson = useMemo(
    () => (plan?.githubManifest ? JSON.stringify(plan.githubManifest, null, 2) : ""),
    [plan],
  );

  useEffect(() => {
    void refreshConnections();
  }, []);

  function refreshConnections() {
    return listScmConnections()
      .then((items) => {
        setConnections(items);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(formatError(err));
      });
  }

  function updateProvider(next: ScmProvider) {
    setProvider(next);
    setBaseUrl(PROVIDER_DEFAULTS[next].baseUrl);
    setPlan(null);
    setMessage(null);
  }

  async function handlePrepare() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const prepared = await prepareScmProvisioning({
        provider,
        owner: owner.trim(),
        displayName: displayName.trim() || undefined,
        connectionId: slugifyConnectionId(connectionId || owner),
        baseUrl: baseUrl.trim() || undefined,
        callbackBaseUrl: callbackBaseUrl.trim() || undefined,
        repositorySelection: "selected",
      });
      setConnectionId(prepared.connection.connectionId);
      setPlan(prepared);
      setMessage("Provisioning plan generated. No external app was created.");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDraft() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const items = await saveScmConnection(plan.connection);
      setConnections(items);
      setMessage("Local draft saved without storing provider secrets.");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(connection: ScmConnection) {
    setBusy(true);
    setError(null);
    try {
      const items = await deleteScmConnection(
        connection.provider,
        connection.connectionId,
      );
      setConnections(items);
      setMessage(`Forgot ${connection.displayName}. Provider secrets were not touched.`);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(`${label} copied.`);
    } catch {
      setError(`Could not copy ${label}; select the text manually.`);
    }
  }

  return (
    <>
      <div className="chart-card" style={{ flexDirection: "row", gap: 10 }}>
        <IconLock size={16} />
        <div>
          <div className="section__title" style={{ fontSize: 14 }}>
            Private source-control provisioning
          </div>
          <div className="section__sub">
            Generate tenant-owned GitHub App or GitLab token/OAuth plans. CTO
            stores local metadata only here; current PAT-based project flows keep
            working until a private connection is completed.
          </div>
        </div>
      </div>

      <div className="chart-card">
        <div className="section__eyebrow">Existing local drafts</div>
        {connections.length === 0 ? (
          <div className="tiny muted" style={{ marginTop: 8 }}>
            No source-control connections saved on this device.
          </div>
        ) : (
          <div className="keys-table" style={{ marginTop: 10 }}>
            {connections.map((connection) => (
              <div
                className="keys-row"
                key={`${connection.provider}:${connection.connectionId}`}
              >
                <div>
                  <div className="keys-row__provider">
                    {connection.displayName}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 2 }}>
                    {PROVIDER_LABELS[connection.provider]} · {connection.owner} ·{" "}
                    {connection.connectionId}
                  </div>
                </div>
                <div className="row row--wrap">
                  <span className="keys-row__mask">
                    <IconKey size={11} />
                    {connection.secretName}
                  </span>
                  <span className="chip chip--accent">
                    {STATUS_LABELS[connection.status]}
                  </span>
                </div>
                <div className="keys-row__actions">
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    aria-label={`Forget ${connection.displayName}`}
                    disabled={busy}
                    onClick={() => void handleDelete(connection)}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="chart-card">
        <div className="section__eyebrow">New private connection</div>
        <div className="field-row">
          <div className="field">
            <label className="field__label">Provider</label>
            <select
              className="field__input"
              value={provider}
              onChange={(event) => updateProvider(event.target.value as ScmProvider)}
            >
              <option value="github">GitHub App manifest</option>
              <option value="gitlab">GitLab OAuth / token</option>
            </select>
          </div>
          <div className="field">
            <label className="field__label">{PROVIDER_DEFAULTS[provider].ownerLabel}</label>
            <input
              className="field__input"
              placeholder={provider === "github" ? "acme-inc" : "platform/team"}
              value={owner}
              onChange={(event) => {
                setOwner(event.target.value);
                if (!connectionId) {
                  setConnectionId(slugifyConnectionId(event.target.value));
                }
              }}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label className="field__label">Display name</label>
            <input
              className="field__input"
              placeholder="Acme production"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">Connection ID</label>
            <input
              className="field__input"
              placeholder="acme-prod"
              value={connectionId}
              onChange={(event) =>
                setConnectionId(slugifyConnectionId(event.target.value))
              }
            />
            <span className="field__help">
              Used in the tenant-owned Secret name: cto-scm-{provider}-
              {connectionId || "connection-id"}.
            </span>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label className="field__label">Provider base URL</label>
            <input
              className="field__input"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">Callback base URL</label>
            <input
              className="field__input"
              value={callbackBaseUrl}
              onChange={(event) => setCallbackBaseUrl(event.target.value)}
            />
            <span className="field__help">
              Local desktop defaults to localhost path routing; use a tunnel or
              hosted URL only when enabling provider webhooks.
            </span>
          </div>
        </div>

        <div className="row row--end">
          <button
            type="button"
            className="ghost-btn"
            disabled={busy}
            onClick={() =>
              void copy(
                `cto-scm-${provider}-${connectionId || "connection-id"}`,
                "Secret name",
              )
            }
          >
            Copy secret name
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={busy}
            onClick={() => void handlePrepare()}
          >
            Generate plan
          </button>
        </div>
      </div>

      {plan ? (
        <ProvisioningPlanCard
          plan={plan}
          manifestJson={manifestJson}
          busy={busy}
          onSave={() => void handleSaveDraft()}
          onCopy={copy}
        />
      ) : null}

      {message ? <div className="tiny muted">{message}</div> : null}
      {error ? (
        <div className="local-bootstrap__error" style={{ marginTop: 8 }}>
          <pre>{error}</pre>
        </div>
      ) : null}
    </>
  );
}

function ProvisioningPlanCard({
  plan,
  manifestJson,
  busy,
  onSave,
  onCopy,
}: {
  plan: ScmProvisioningPlan;
  manifestJson: string;
  busy: boolean;
  onSave: () => void;
  onCopy: (value: string, label: string) => Promise<void>;
}) {
  return (
    <div className="chart-card">
      <div className="section__head">
        <div>
          <div className="section__eyebrow">Generated plan</div>
          <div className="section__title">{plan.connection.displayName}</div>
        </div>
        <span className="chip chip--accent">{plan.kubernetesSecretName}</span>
      </div>

      <div className="mem-list" style={{ marginTop: 8 }}>
        <div className="mem-list-item">
          <span>Callback URL</span>
          <span className="count">{plan.localCallbackUrl}</span>
        </div>
        <div className="mem-list-item">
          <span>Secret keys</span>
          <span className="count">{plan.kubernetesSecretKeys.join(", ")}</span>
        </div>
        {plan.gitlabApplicationApiEndpoint ? (
          <div className="mem-list-item">
            <span>GitLab admin API</span>
            <span className="count">{plan.gitlabApplicationApiEndpoint}</span>
          </div>
        ) : null}
      </div>

      <div className="field" style={{ marginTop: 12 }}>
        <label className="field__label">Next steps</label>
        <ol className="section__sub" style={{ marginTop: 6 }}>
          {plan.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="row row--wrap">
        {plan.setupUrls.map((setup) => (
          <a
            key={setup.url}
            className="ghost-btn"
            href={setup.url}
            target="_blank"
            rel="noreferrer"
          >
            <IconExternal size={12} /> {setup.label}
          </a>
        ))}
      </div>

      {manifestJson ? (
        <div className="field" style={{ marginTop: 12 }}>
          <label className="field__label">GitHub App manifest</label>
          <textarea
            className="field__input"
            readOnly
            value={manifestJson}
            style={{ minHeight: 220, fontFamily: "ui-monospace, monospace" }}
          />
          <div className="row row--end" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => void onCopy(manifestJson, "GitHub manifest")}
            >
              <IconGit size={12} /> Copy manifest
            </button>
          </div>
        </div>
      ) : null}

      <div className="chart-card" style={{ marginTop: 12 }}>
        <div className="section__eyebrow">Webhook behavior</div>
        <div className="section__sub">{plan.webhookBehavior}</div>
        {plan.warnings.map((warning) => (
          <div className="tiny muted" key={warning} style={{ marginTop: 6 }}>
            {warning}
          </div>
        ))}
      </div>

      <div className="row row--end" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="primary-btn"
          disabled={busy}
          onClick={onSave}
        >
          Save local draft
        </button>
      </div>
    </div>
  );
}

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
