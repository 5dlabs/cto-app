import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  IconPuzzle,
  IconCurrency,
  IconBolt,
  IconMic,
  IconCheck,
  IconSparkles,
  IconActivity,
  IconCpu,
  IconDatabase,
  IconRefresh,
} from "./icons";
import { APPLICATIONS, type ExtensionModule } from "./data";

type Tab = "runtime" | "extensions";

type ResourceAmount = {
  cpuMilliCores?: number | null;
  memoryBytes?: number | null;
};

type LiveResourceUsage = {
  cpuNanoCores?: number | null;
  memoryBytes?: number | null;
};

type RuntimeAllocation = {
  cpuCores?: number | null;
  memoryBytes?: number | null;
  diskBytes?: number | null;
  source: string;
  details: Record<string, string>;
};

type MetricsClusterReport = {
  name: string;
  context: string;
  kindClusterExists: boolean;
  apiReachable: boolean;
  reason?: string;
};

type MetricsRuntimeReport = {
  label: string;
  available: boolean;
  allocation?: RuntimeAllocation | null;
};

type RuntimeContainerMetrics = {
  name: string;
  runtime: string;
  statsAvailable: boolean;
  unavailableReason?: string;
  cpuPercent?: number | null;
  memoryUsageBytes?: number | null;
  memoryLimitBytes?: number | null;
  memoryPercent?: number | null;
  pids?: number | null;
  raw: Record<string, string>;
};

type KubernetesNodeMetrics = {
  name: string;
  ready: boolean;
  roles: string[];
  createdAt?: string;
  ageSeconds?: number | null;
  capacity: ResourceAmount;
  allocatable: ResourceAmount;
};

type KubernetesContainerMetrics = {
  name: string;
  requests: ResourceAmount;
  limits: ResourceAmount;
  liveUsage: LiveResourceUsage;
};

type KubernetesPodMetrics = {
  namespace: string;
  name: string;
  phase: string;
  nodeName?: string;
  createdAt?: string;
  ageSeconds?: number | null;
  readyContainers: number;
  totalContainers: number;
  restarts: number;
  containerNames: string[];
  requests: ResourceAmount;
  limits: ResourceAmount;
  liveUsage: LiveResourceUsage;
  containers: KubernetesContainerMetrics[];
};

type NamespaceResourceTotals = {
  namespace: string;
  pods: number;
  containers: number;
  restarts: number;
  requests: ResourceAmount;
  limits: ResourceAmount;
  liveUsage: LiveResourceUsage;
};

type ResourceMetricTotals = {
  nodes: number;
  pods: number;
  containers: number;
  restarts: number;
  nodeCapacity: ResourceAmount;
  nodeAllocatable: ResourceAmount;
  requests: ResourceAmount;
  limits: ResourceAmount;
  liveUsage: LiveResourceUsage;
  byNamespace: NamespaceResourceTotals[];
};

type MetricsSourceStatus = {
  name: string;
  available: boolean;
  partial: boolean;
  message?: string;
};

type LocalStackResourceMetricsReport = {
  generatedAtEpochSeconds: number;
  cluster: MetricsClusterReport;
  runtime: MetricsRuntimeReport;
  nodeContainers: RuntimeContainerMetrics[];
  nodes: KubernetesNodeMetrics[];
  pods: KubernetesPodMetrics[];
  totals: ResourceMetricTotals;
  sources: MetricsSourceStatus[];
  warnings: string[];
  errors: string[];
};

type PodHealth = "running" | "pending" | "error";
type RuntimeNotice = { tone: "warn" | "danger"; text: string };
type MetricParts = { value: string; unit: string };
type MetricNumber = number | null | undefined;

const EMPTY_PODS: KubernetesPodMetrics[] = [];

const ARGO_APPS = [
  { name: "cto-controller", sync: "Synced", health: "Healthy" },
  { name: "openclaw-agent", sync: "Synced", health: "Healthy" },
  { name: "narrator-sidecar", sync: "Synced", health: "Healthy" },
  { name: "musetalk-worker", sync: "Synced", health: "Healthy" },
  { name: "hunyuan-avatar-worker", sync: "Synced", health: "Progressing" },
];

const LOG_LINES = [
  `{"ts":"17:42:03.812","lvl":"info","mod":"acp","session":"a8f2","msg":"session/prompt received (user)"}`,
  `{"ts":"17:42:03.891","lvl":"info","mod":"agent","session":"a8f2","tool":"view","path":"crates/acp-runtime/src/server.rs"}`,
  `{"ts":"17:42:04.104","lvl":"info","mod":"agent","session":"a8f2","tool":"edit","path":"crates/acp-runtime/src/server.rs","lines":18}`,
  `{"ts":"17:42:04.510","lvl":"info","mod":"narrator","backend":"musetalk","phrase":"I'm opening the ACP server to wire the interrupt channel."}`,
  `{"ts":"17:42:05.223","lvl":"info","mod":"agent","session":"a8f2","tool":"bash","cmd":"cargo check -p acp-runtime"}`,
  `{"ts":"17:42:11.447","lvl":"info","mod":"agent","session":"a8f2","tool":"bash","rc":0,"dur_ms":6104}`,
  `{"ts":"17:42:11.502","lvl":"info","mod":"narrator","backend":"musetalk","phrase":"Check passes — moving on to the CRD mirror."}`,
];

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function podKey(pod: KubernetesPodMetrics) {
  return `${pod.namespace}/${pod.name}`;
}

function getPodContainerNames(pod: KubernetesPodMetrics) {
  if (pod.containerNames.length > 0) {
    return pod.containerNames;
  }
  return pod.containers.map((container) => container.name);
}

function getPodHealth(pod: KubernetesPodMetrics): PodHealth {
  const phase = pod.phase.toLowerCase();
  const ready = pod.totalContainers === 0 || pod.readyContainers >= pod.totalContainers;

  if (phase === "running" && ready) {
    return "running";
  }
  if (phase === "pending" || phase === "containercreating" || (phase === "running" && !ready)) {
    return "pending";
  }
  return "error";
}

function getContainerHealth(pod: KubernetesPodMetrics, index: number): PodHealth {
  const podHealth = getPodHealth(pod);

  if (podHealth === "error") {
    return "error";
  }
  if (pod.phase.toLowerCase() === "running" && index < pod.readyContainers) {
    return "running";
  }
  return podHealth;
}

function formatPodStatus(pod: KubernetesPodMetrics) {
  const phase = pod.phase || "Unknown";
  if (pod.totalContainers > 0) {
    return `${phase} ${pod.readyContainers}/${pod.totalContainers}`;
  }
  return phase;
}

function isFiniteMetricNumber(value: MetricNumber): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function divideMetricNumber(value: MetricNumber, divisor: number) {
  return isFiniteMetricNumber(value) ? value / divisor : undefined;
}

function firstFiniteMetricNumber(...values: MetricNumber[]) {
  return values.find(isFiniteMetricNumber);
}

function formatAge(seconds?: number | null) {
  if (!isFiniteMetricNumber(seconds)) {
    return "—";
  }

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) {
    return `${days}d${hours > 0 ? ` ${hours}h` : ""}`;
  }
  if (hours > 0) {
    return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${Math.max(0, seconds)}s`;
}

function formatDecimal(value: number, maximumFractionDigits = 1) {
  return value.toLocaleString(undefined, { maximumFractionDigits });
}

function formatCpuParts(cores?: number | null): MetricParts {
  if (!isFiniteMetricNumber(cores)) {
    return { value: "—", unit: "" };
  }
  if (cores > 0 && cores < 1) {
    return { value: Math.max(1, Math.round(cores * 1_000)).toLocaleString(), unit: "m" };
  }
  return { value: formatDecimal(cores, cores >= 10 ? 1 : 2), unit: "cores" };
}

function formatCpuCores(cores?: number | null) {
  const parts = formatCpuParts(cores);
  return parts.unit ? `${parts.value} ${parts.unit}` : parts.value;
}

function formatBytesParts(bytes?: number | null): MetricParts {
  if (!isFiniteMetricNumber(bytes)) {
    return { value: "—", unit: "" };
  }

  const units: Array<[string, number]> = [
    ["TiB", 1_099_511_627_776],
    ["GiB", 1_073_741_824],
    ["MiB", 1_048_576],
    ["KiB", 1_024],
  ];
  const absolute = Math.abs(bytes);
  for (const [unit, divisor] of units) {
    if (absolute >= divisor) {
      const value = bytes / divisor;
      return { value: formatDecimal(value, Math.abs(value) >= 10 ? 1 : 2), unit };
    }
  }
  return { value: Math.round(bytes).toLocaleString(), unit: "B" };
}

function formatBytes(bytes?: number | null) {
  const parts = formatBytesParts(bytes);
  return parts.unit ? `${parts.value} ${parts.unit}` : parts.value;
}

function formatPercent(used?: number | null, total?: number | null) {
  if (!isFiniteMetricNumber(used) || !isFiniteMetricNumber(total) || total <= 0) {
    return null;
  }
  return `${formatDecimal((used / total) * 100, 0)}% used`;
}

function formatGeneratedAt(epochSeconds?: number) {
  if (epochSeconds === undefined) {
    return "not loaded";
  }
  return new Date(epochSeconds * 1_000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRuntimeBudget(allocation?: RuntimeAllocation | null) {
  if (!allocation) {
    return "No runtime allocation reported";
  }

  const budget = [
    isFiniteMetricNumber(allocation.cpuCores) ? formatCpuCores(allocation.cpuCores) : null,
    isFiniteMetricNumber(allocation.memoryBytes) ? `${formatBytes(allocation.memoryBytes)} memory` : null,
    isFiniteMetricNumber(allocation.diskBytes) ? `${formatBytes(allocation.diskBytes)} disk` : null,
  ].filter((item): item is string => item !== null);

  const source = allocation.source ? `via ${allocation.source}` : "runtime allocation";
  return budget.length > 0 ? `${budget.join(" · ")} · ${source}` : source;
}

export function ApplicationsView() {
  const [tab, setTab] = useState<Tab>("runtime");
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(APPLICATIONS.map((m) => [m.key, !!m.active])),
  );
  const [metricsReport, setMetricsReport] = useState<LocalStackResourceMetricsReport | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [selectedPodKey, setSelectedPodKey] = useState<string>("");
  const [selectedContainer, setSelectedContainer] = useState<string>("");
  const [nsFilter, setNsFilter] = useState<string>("all");
  const metricsRequestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
      metricsRequestId.current += 1;
    };
  }, []);

  const refreshMetrics = useCallback(async () => {
    const requestId = metricsRequestId.current + 1;
    metricsRequestId.current = requestId;
    setMetricsLoading(true);
    setMetricsError(null);

    try {
      const report = await invoke<LocalStackResourceMetricsReport>("local_stack_resource_metrics");
      if (!mounted.current || metricsRequestId.current !== requestId) {
        return;
      }
      setMetricsReport(report);
    } catch (error) {
      if (!mounted.current || metricsRequestId.current !== requestId) {
        return;
      }
      setMetricsError(toErrorMessage(error));
    } finally {
      if (mounted.current && metricsRequestId.current === requestId) {
        setMetricsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (tab === "runtime") {
      void refreshMetrics();
    }
  }, [refreshMetrics, tab]);

  const allPods = metricsReport?.pods ?? EMPTY_PODS;
  const namespaces = useMemo(
    () => Array.from(new Set(allPods.map((pod) => pod.namespace))).sort((a, b) => a.localeCompare(b)),
    [allPods],
  );
  const pods = useMemo(
    () => (nsFilter === "all" ? allPods : allPods.filter((pod) => pod.namespace === nsFilter)),
    [allPods, nsFilter],
  );
  const activePod = useMemo(
    () => allPods.find((pod) => podKey(pod) === selectedPodKey) ?? null,
    [allPods, selectedPodKey],
  );
  const activePodContainers = useMemo(
    () => (activePod ? getPodContainerNames(activePod) : []),
    [activePod],
  );
  const podCounts = useMemo(
    () =>
      allPods.reduce(
        (counts, pod) => {
          const health = getPodHealth(pod);
          counts[health] += 1;
          return counts;
        },
        { running: 0, pending: 0, error: 0 } satisfies Record<PodHealth, number>,
      ),
    [allPods],
  );
  const sourceIssues = useMemo(
    () => metricsReport?.sources.filter((source) => !source.available || source.partial) ?? [],
    [metricsReport],
  );
  const healthySourceCount = metricsReport
    ? metricsReport.sources.filter((source) => source.available && !source.partial).length
    : 0;
  const reportNotices = useMemo<RuntimeNotice[]>(() => {
    const notices: RuntimeNotice[] = [];

    if (metricsError) {
      notices.push({ tone: "danger", text: `Metrics unavailable: ${metricsError}` });
    }
    if (!metricsReport) {
      return notices;
    }
    if (metricsReport.cluster.reason) {
      notices.push({
        tone: metricsReport.cluster.apiReachable ? "warn" : "danger",
        text: metricsReport.cluster.reason,
      });
    }
    metricsReport.errors.forEach((error) => {
      notices.push({ tone: "danger", text: error });
    });
    metricsReport.warnings.forEach((warning) => {
      notices.push({ tone: "warn", text: warning });
    });
    sourceIssues.forEach((source) => {
      notices.push({
        tone: source.available ? "warn" : "danger",
        text: `${source.name} ${source.partial ? "partial" : "unavailable"}${
          source.message ? `: ${source.message}` : ""
        }`,
      });
    });

    return notices;
  }, [metricsError, metricsReport, sourceIssues]);
  const visibleNotices = reportNotices.slice(0, 4);
  const hiddenNoticeCount = reportNotices.length - visibleNotices.length;

  const cpuLiveCores = divideMetricNumber(metricsReport?.totals.liveUsage.cpuNanoCores, 1_000_000_000);
  const cpuRequestCores = divideMetricNumber(metricsReport?.totals.requests.cpuMilliCores, 1_000);
  const cpuCapacityCores = divideMetricNumber(
    firstFiniteMetricNumber(
      metricsReport?.totals.nodeAllocatable.cpuMilliCores,
      metricsReport?.totals.nodeCapacity.cpuMilliCores,
    ),
    1_000,
  );
  const memoryLiveBytes = metricsReport?.totals.liveUsage.memoryBytes;
  const memoryRequestBytes = metricsReport?.totals.requests.memoryBytes;
  const memoryCapacityBytes = firstFiniteMetricNumber(
    metricsReport?.totals.nodeAllocatable.memoryBytes,
    metricsReport?.totals.nodeCapacity.memoryBytes,
  );
  const cpuLiveParts = formatCpuParts(cpuLiveCores);
  const memoryLiveParts = formatBytesParts(memoryLiveBytes);
  const cpuUsedPercent = formatPercent(cpuLiveCores, cpuCapacityCores);
  const memoryUsedPercent = formatPercent(memoryLiveBytes, memoryCapacityBytes);
  const clusterTone = !metricsReport
    ? metricsError
      ? "danger"
      : "warn"
    : metricsReport.cluster.apiReachable
      ? "success"
      : "danger";
  const runtimeTone = !metricsReport
    ? metricsError
      ? "danger"
      : "warn"
    : metricsReport.runtime.available
      ? "success"
      : "danger";
  const sourceTone = !metricsReport
    ? metricsError
      ? "danger"
      : "warn"
    : metricsReport.errors.length > 0 || sourceIssues.some((source) => !source.available)
      ? "danger"
      : metricsReport.warnings.length > 0 || sourceIssues.length > 0
        ? "warn"
        : "success";

  useEffect(() => {
    if (nsFilter !== "all" && !namespaces.includes(nsFilter)) {
      setNsFilter("all");
    }
  }, [namespaces, nsFilter]);

  useEffect(() => {
    if (allPods.length === 0) {
      setSelectedPodKey("");
      return;
    }

    setSelectedPodKey((current) => {
      if (current && allPods.some((pod) => podKey(pod) === current)) {
        return current;
      }
      return podKey(allPods[0]!);
    });
  }, [allPods]);

  useEffect(() => {
    if (activePodContainers.length === 0) {
      setSelectedContainer("");
      return;
    }

    setSelectedContainer((current) =>
      current && activePodContainers.includes(current) ? current : activePodContainers[0]!,
    );
  }, [activePodContainers]);

  return (
    <div className="section">
      <div className="tabs">
        <button
          type="button"
          className={`tab${tab === "runtime" ? " tab--active" : ""}`}
          onClick={() => setTab("runtime")}
        >
          <IconActivity size={12} /> Runtime
          <span className="tab__count">{metricsLoading && !metricsReport ? "…" : allPods.length}</span>
        </button>
        <button
          type="button"
          className={`tab${tab === "extensions" ? " tab--active" : ""}`}
          onClick={() => setTab("extensions")}
        >
          <IconPuzzle size={12} /> Extensions
          <span className="tab__count">{APPLICATIONS.length}</span>
        </button>
      </div>

      {tab === "extensions" ? (
        <>
          <div className="chart-card">
            <div className="section__head">
              <div>
                <div className="section__eyebrow">Applications store</div>
                <div className="section__title">Extensions you can deploy</div>
                <div className="section__sub">
                  Optional vertical packs — each ships with its own agents, prompts, and dashboards.
                  Enable to install into this workspace; disable to archive without losing state.
                </div>
              </div>
            </div>
            <div className="ext-grid">
              {APPLICATIONS.map((m) => (
                <ExtCard
                  key={m.key}
                  module={m}
                  on={enabled[m.key]}
                  onToggle={(v) =>
                    setEnabled((prev) => ({ ...prev, [m.key]: v }))
                  }
                />
              ))}
            </div>
          </div>

          <div className="chart-card">
            <div className="section__head">
              <div>
                <div className="section__eyebrow">Build your own</div>
                <div className="section__title">Publish an extension</div>
                <div className="section__sub">
                  Bundle agents, skills, and dashboards as a signed 5D extension package. Optionally
                  publish on-chain for verified distribution.
                </div>
              </div>
              <div className="row">
                <button type="button" className="ghost-btn">
                  <IconSparkles size={12} /> Docs
                </button>
                <button type="button" className="primary-btn">
                  New extension
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="runtime-stats">
            <div className="runtime-stat">
              <div className="runtime-stat__eyebrow">Pods</div>
              <div className="runtime-stat__value">{metricsLoading && !metricsReport ? "…" : allPods.length}</div>
              <div className="runtime-stat__sub">
                {metricsLoading && !metricsReport ? (
                  "Loading metrics…"
                ) : (
                  <>
                    <span className="dot dot--ok" /> {podCounts.running} running
                    <span className="dot dot--warn" /> {podCounts.pending} pending
                    <span className="dot dot--err" /> {podCounts.error} error
                  </>
                )}
              </div>
            </div>
            <div className="runtime-stat">
              <div className="runtime-stat__eyebrow">CPU · live</div>
              <div className="runtime-stat__value">
                {cpuLiveParts.value}
                {cpuLiveParts.unit ? <span className="runtime-stat__unit"> {cpuLiveParts.unit}</span> : null}
              </div>
              <div className="runtime-stat__sub">
                <span>request {formatCpuCores(cpuRequestCores)}</span>
                <span>capacity {formatCpuCores(cpuCapacityCores)}</span>
                {cpuUsedPercent ? <span>{cpuUsedPercent}</span> : null}
              </div>
            </div>
            <div className="runtime-stat">
              <div className="runtime-stat__eyebrow">Memory · live</div>
              <div className="runtime-stat__value">
                {memoryLiveParts.value}
                {memoryLiveParts.unit ? <span className="runtime-stat__unit"> {memoryLiveParts.unit}</span> : null}
              </div>
              <div className="runtime-stat__sub">
                <span>request {formatBytes(memoryRequestBytes)}</span>
                <span>capacity {formatBytes(memoryCapacityBytes)}</span>
                {memoryUsedPercent ? <span>{memoryUsedPercent}</span> : null}
              </div>
            </div>
            <div className="runtime-stat">
              <div className="runtime-stat__eyebrow">Runtime budget</div>
              <div className="runtime-stat__value runtime-stat__value--label">
                {metricsReport?.runtime.label ?? "—"}
              </div>
              <div className="runtime-stat__sub">
                <span className={`dot dot--${metricsReport?.runtime.available ? "ok" : "err"}`} />
                {metricsReport
                  ? metricsReport.runtime.available
                    ? "available"
                    : "unavailable"
                  : metricsLoading
                    ? "loading"
                    : "unavailable"}
              </div>
              <div className="runtime-stat__sub">
                {metricsReport ? formatRuntimeBudget(metricsReport.runtime.allocation) : "No metrics loaded"}
              </div>
            </div>
          </div>

          <div className="runtime-health" role="status" aria-live="polite">
            <div className="runtime-health__summary">
              <span className={`chip chip--${clusterTone}`}>
                Cluster{" "}
                {metricsReport
                  ? `${metricsReport.cluster.name || "local"} · ${
                      metricsReport.cluster.apiReachable ? "API reachable" : "API unavailable"
                    }`
                  : metricsLoading
                    ? "loading"
                    : "not loaded"}
              </span>
              <span className={`chip chip--${runtimeTone}`}>
                Runtime{" "}
                {metricsReport
                  ? `${metricsReport.runtime.label} · ${
                      metricsReport.runtime.available ? "available" : "unavailable"
                    }`
                  : metricsLoading
                    ? "loading"
                    : "not loaded"}
              </span>
              <span className={`chip chip--${sourceTone}`}>
                Sources{" "}
                {metricsReport
                  ? metricsReport.sources.length > 0
                    ? `${healthySourceCount}/${metricsReport.sources.length} OK`
                    : "not reported"
                  : metricsLoading
                    ? "loading"
                    : "not loaded"}
              </span>
              {metricsLoading ? <span className="chip chip--info">Refreshing…</span> : null}
              <span className="tiny muted">Updated {formatGeneratedAt(metricsReport?.generatedAtEpochSeconds)}</span>
            </div>
            {visibleNotices.length > 0 ? (
              <div className="runtime-health__notes">
                {visibleNotices.map((notice, index) => (
                  <span
                    key={`${notice.tone}-${index}-${notice.text}`}
                    className={`runtime-health__note runtime-health__note--${notice.tone}`}
                  >
                    {notice.text}
                  </span>
                ))}
                {hiddenNoticeCount > 0 ? (
                  <span className="runtime-health__note">+{hiddenNoticeCount} more</span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="chart-card">
            <div className="section__head">
              <div>
                <div className="section__eyebrow">
                  Cluster · {nsFilter === "all" ? "all namespaces" : nsFilter}
                </div>
                <div className="section__title">Pods</div>
              </div>
              <div className="row">
                <select
                  className="ghost-btn"
                  value={nsFilter}
                  onChange={(e) => setNsFilter(e.target.value)}
                >
                  <option value="all">All namespaces</option>
                  {namespaces.map((namespace) => (
                    <option key={namespace} value={namespace}>
                      {namespace}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="ghost-btn runtime-refresh"
                  disabled={metricsLoading}
                  onClick={() => void refreshMetrics()}
                >
                  <IconRefresh size={12} /> {metricsLoading ? "Refreshing" : "Refresh"}
                </button>
              </div>
            </div>
            <div className="pod-table">
              <div className="pod-table__head">
                <span>Name</span>
                <span>Namespace</span>
                <span>Containers</span>
                <span>Status</span>
                <span className="pod-table__num">Restarts</span>
                <span className="pod-table__num">Age</span>
              </div>
              {pods.length > 0 ? (
                pods.map((p) => {
                  const containerNames = getPodContainerNames(p);
                  const health = getPodHealth(p);
                  return (
                    <button
                      type="button"
                      key={podKey(p)}
                      className={`pod-table__row${
                        podKey(p) === selectedPodKey ? " pod-table__row--active" : ""
                      }`}
                      onClick={() => {
                        setSelectedPodKey(podKey(p));
                        setSelectedContainer((current) =>
                          current && containerNames.includes(current) ? current : (containerNames[0] ?? ""),
                        );
                      }}
                    >
                      <span className="pod-table__name">{p.name}</span>
                      <span className="muted tiny">{p.namespace}</span>
                      <span className="pod-table__dots">
                        {containerNames.length > 0 ? (
                          containerNames.map((containerName, index) => {
                            const containerHealth = getContainerHealth(p, index);
                            return (
                              <span
                                key={`${containerName}-${index}`}
                                className={`dot dot--${
                                  containerHealth === "running"
                                    ? "ok"
                                    : containerHealth === "pending"
                                      ? "warn"
                                      : "err"
                                }`}
                                title={`${containerName} · ${containerHealth}`}
                              />
                            );
                          })
                        ) : (
                          <span className="tiny muted">—</span>
                        )}
                      </span>
                      <span
                        className={`chip chip--${
                          health === "running" ? "success" : health === "pending" ? "warn" : "danger"
                        }`}
                      >
                        {formatPodStatus(p)}
                      </span>
                      <span className="pod-table__num tiny muted">{p.restarts}</span>
                      <span className="pod-table__num tiny muted">{formatAge(p.ageSeconds)}</span>
                    </button>
                  );
                })
              ) : (
                <div className="pod-table__empty">
                  {metricsLoading && !metricsReport
                    ? "Loading pods…"
                    : metricsError && !metricsReport
                      ? "Metrics unavailable. Refresh after opening the app in Tauri."
                      : "No pods reported for this namespace."}
                </div>
              )}
            </div>
          </div>

          <div className="chart-card">
            <div className="section__head">
              <div>
                <div className="section__eyebrow">
                  <IconCpu size={10} /> Logs · {activePod?.name ?? "No pod selected"}
                </div>
                <div className="section__title">Container output</div>
              </div>
              <div className="row">
                <select
                  className="ghost-btn"
                  value={selectedContainer}
                  disabled={activePodContainers.length === 0}
                  onChange={(e) => setSelectedContainer(e.target.value)}
                >
                  {activePodContainers.length > 0 ? (
                    activePodContainers.map((container) => (
                      <option key={container} value={container}>
                        {container}
                      </option>
                    ))
                  ) : (
                    <option value="">No containers</option>
                  )}
                </select>
                <button type="button" className="ghost-btn">
                  <IconRefresh size={12} /> Tail
                </button>
              </div>
            </div>
            <pre className="log-panel">
              {activePod ? (
                LOG_LINES.map((l, i) => (
                  <div key={i} className="log-line">{l}</div>
                ))
              ) : (
                <div className="log-line">No pod selected.</div>
              )}
            </pre>
          </div>

          <div className="chart-card">
            <div className="section__head">
              <div>
                <div className="section__eyebrow">
                  <IconDatabase size={10} /> ArgoCD · applications
                </div>
                <div className="section__title">Sync &amp; health</div>
              </div>
            </div>
            <div className="argo-grid">
              {ARGO_APPS.map((a) => (
                <div className="argo-card" key={a.name}>
                  <div className="argo-card__name">{a.name}</div>
                  <div className="argo-card__row">
                    <span className={`chip chip--${a.sync === "Synced" ? "success" : "warn"}`}>
                      <IconCheck size={10} /> {a.sync}
                    </span>
                    <span className={`chip chip--${a.health === "Healthy" ? "success" : "warn"}`}>
                      {a.health}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ExtCard({
  module,
  on,
  onToggle,
}: {
  module: ExtensionModule;
  on: boolean;
  onToggle: (v: boolean) => void;
}) {
  const Icon =
    module.key === "accounting"
      ? IconCurrency
      : module.key === "marketing"
        ? IconSparkles
        : module.key === "rms"
          ? IconBolt
          : IconMic;
  return (
    <div className="ext-card">
      <div className="ext-card__head">
        <div className="ext-card__icon">
          <Icon size={18} />
        </div>
        <div>
          <div className="ext-card__name">{module.name}</div>
          <div className="tiny muted">{module.short}</div>
        </div>
      </div>
      <p className="ext-card__desc">{module.description}</p>
      <div className="ext-card__foot">
        <span className={`chip chip--${on ? "success" : "warn"}`}>
          {on ? (
            <>
              <IconCheck size={10} /> Enabled
            </>
          ) : (
            "Disabled"
          )}
        </span>
        <button
          type="button"
          className={on ? "ghost-btn" : "primary-btn"}
          onClick={() => onToggle(!on)}
        >
          {on ? "Disable" : "Enable"}
        </button>
      </div>
    </div>
  );
}
