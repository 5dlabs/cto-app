#![allow(
    clippy::missing_errors_doc,
    clippy::missing_panics_doc,
    clippy::must_use_candidate
)]

use serde_json::Value;
use std::env;
use std::io::{self, Read, Write as _};
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::process::ExitCode;
use std::time::Duration;

const HELP: &str = r"Usage:
  cto-ci-assert morgan-mem0-config < rendered-agent.yaml
  cto-ci-assert morgan-diagnostics-config < rendered-agent.yaml
  cto-ci-assert qdrant-render-config < rendered-qdrant.yaml
  cto-ci-assert hermes-coderun-preflight < rendered-cto.yaml
  cto-ci-assert qdrant-http-health [http://localhost:6333]
  cto-ci-assert gateway-health [http://localhost:18789]
  cto-ci-assert openclaw-doctor-output < doctor-output.txt
  cto-ci-assert raw-stream-jsonl < raw-stream.jsonl

Reads rendered Helm YAML from stdin, extracts the Morgan ConfigMap openclaw.json,
and asserts the local mem0/Qdrant wiring expected by cto-app chart CI.

morgan-diagnostics-config asserts Morgan's local diagnostics/logging wiring,
including OpenClaw doctor boot checks and raw stream JSONL output.

qdrant-render-config asserts the shipped local Qdrant chart wiring, including
ClusterIP service ports, localhost ingress, probes, and disabled telemetry.

hermes-coderun-preflight asserts the CTO chart renders the CodeRun CRD,
controller RBAC/deployment support, and a minimal harnessAgent=hermes CodeRun.

qdrant-http-health checks a reachable local/kind Qdrant HTTP endpoint without
API keys by calling /healthz, /readyz, and /telemetry.

gateway-health checks a reachable local/kind OpenClaw gateway /healthz endpoint
without model provider keys. openclaw-doctor-output and raw-stream-jsonl parse
diagnostic artifacts collected from the Morgan pod.
";

const MEM0_CONFIG_PATH: &str = "plugins.entries.openclaw-mem0.config";
const QDRANT_CONFIG_PATH: &str = "plugins.entries.openclaw-mem0.config.oss.vectorStore.config";
const DEFAULT_QDRANT_HTTP_URL: &str = "http://localhost:6333";
const EXPECTED_CTO_NAMESPACE: &str = "cto-system";
const EXPECTED_QDRANT_SERVICE: &str = "qdrant";
const EXPECTED_QDRANT_NAMESPACE: &str = EXPECTED_CTO_NAMESPACE;
const EXPECTED_QDRANT_HOST: &str = "qdrant.cto-system.svc.cluster.local";
const EXPECTED_QDRANT_PORT: u64 = 6333;
const EXPECTED_QDRANT_GRPC_PORT: u64 = 6334;
const EXPECTED_COLLECTION: &str = "cto_memory";
const EXPECTED_LOAD_PATH_FRAGMENT: &str = "@mem0/openclaw-mem0";
const EXPECTED_CONTROLLER_NAME: &str = "cto-controller";
const EXPECTED_HERMES_CODERUN_NAME: &str = "hermes-coderun-smoke";
const EXPECTED_HERMES_CODERUN_SERVICE: &str = "hermes-smoke";
const EXPECTED_HERMES_CODERUN_REPOSITORY: &str = "https://github.com/5dlabs/cto-app";
const EXPECTED_HERMES_CODERUN_GITHUB_APP: &str = "hermes-smoke";
const QDRANT_HTTP_TIMEOUT: Duration = Duration::from_secs(5);
const DEFAULT_GATEWAY_HTTP_URL: &str = "http://localhost:18789";
const EXPECTED_MORGAN_LOG_FILE: &str = "/workspace/.openclaw/logs/openclaw.log";
const EXPECTED_MORGAN_RAW_STREAM_PATH: &str = "/workspace/.openclaw/logs/raw-stream.jsonl";
const EXPECTED_MORGAN_DIAGNOSTIC_FLAGS: [&str; 3] = ["acp.*", "gateway.session", "session.*"];

type AppResult<T> = Result<T, String>;

#[derive(Debug, PartialEq, Eq)]
enum Command {
    MorganMem0Config,
    MorganDiagnosticsConfig,
    QdrantRenderConfig,
    HermesCodeRunPreflight,
    QdrantHttpHealth { url: String },
    GatewayHealth { url: String },
    OpenClawDoctorOutput,
    RawStreamJsonl,
    Help,
}

#[derive(Debug, PartialEq, Eq)]
struct Mem0Report {
    qdrant_host: String,
    qdrant_port: u64,
    collection: String,
    load_paths: usize,
}

#[derive(Debug, PartialEq, Eq)]
struct QdrantRenderReport {
    namespace: String,
    http_port: u64,
    grpc_port: u64,
    telemetry_disabled: bool,
    ingress_host: String,
}

#[derive(Debug, PartialEq, Eq)]
struct HermesCodeRunPreflightReport {
    namespace: String,
    coderun_name: String,
    harness_agent: String,
}

#[derive(Debug, PartialEq, Eq)]
struct QdrantHttpReport {
    endpoint: String,
    health_status: u16,
    ready_status: u16,
    telemetry_status: u16,
    telemetry_disabled: TelemetryDisabledObservation,
}

#[derive(Debug, PartialEq, Eq)]
struct MorganDiagnosticsReport {
    log_file: String,
    raw_stream_path: String,
    diagnostic_flags: usize,
}

#[derive(Debug, PartialEq, Eq)]
struct GatewayHealthReport {
    endpoint: String,
    status: u16,
    observation: GatewayHealthObservation,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum GatewayHealthObservation {
    OkTrue,
    StatusOk,
    HealthyTrue,
}

impl GatewayHealthObservation {
    const fn as_str(self) -> &'static str {
        match self {
            Self::OkTrue => "ok-true",
            Self::StatusOk => "status-ok",
            Self::HealthyTrue => "healthy-true",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DoctorOutputFormat {
    Json,
    Text,
}

impl DoctorOutputFormat {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Json => "json",
            Self::Text => "text",
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
struct DoctorOutputReport {
    format: DoctorOutputFormat,
    lines: usize,
}

#[derive(Debug, PartialEq, Eq)]
struct RawStreamReport {
    events: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TelemetryDisabledObservation {
    ExposedTrue,
    ExposedFalse,
    NotExposed,
}

impl TelemetryDisabledObservation {
    const fn as_str(self) -> &'static str {
        match self {
            Self::ExposedTrue => "exposed-true",
            Self::ExposedFalse => "exposed-false",
            Self::NotExposed => "not-exposed-by-qdrant",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct HttpEndpoint {
    original: String,
    host: String,
    port: u16,
    base_path: String,
}

#[derive(Debug, PartialEq, Eq)]
struct HttpResponse {
    status: u16,
    headers: Vec<(String, String)>,
    body: String,
}

fn main() -> ExitCode {
    let args = env::args().skip(1).collect::<Vec<_>>();
    match run(&args) {
        Ok(output) => {
            print!("{output}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("cto-ci-assert: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run(args: &[String]) -> AppResult<String> {
    match parse_command(args)? {
        Command::Help => Ok(HELP.to_string()),
        Command::MorganMem0Config => {
            let input = read_stdin()?;
            let config = extract_openclaw_config(&input)?;
            let report = assert_morgan_mem0_config(&config)?;
            let qdrant_host = report.qdrant_host;
            let qdrant_port = report.qdrant_port;
            let collection = report.collection;
            let load_paths = report.load_paths;
            Ok(format!(
                "ok morgan-mem0-config plugin=openclaw-mem0 qdrant={qdrant_host}:{qdrant_port} collection={collection} load_paths={load_paths}\n"
            ))
        }
        Command::MorganDiagnosticsConfig => {
            let input = read_stdin()?;
            let config = extract_openclaw_config(&input)?;
            let report = assert_morgan_diagnostics_config(&input, &config)?;
            let log_file = report.log_file;
            let raw_stream_path = report.raw_stream_path;
            let diagnostic_flags = report.diagnostic_flags;
            Ok(format!(
                "ok morgan-diagnostics-config log_file={log_file} raw_stream={raw_stream_path} diagnostic_flags={diagnostic_flags}\n"
            ))
        }
        Command::QdrantRenderConfig => {
            let input = read_stdin()?;
            let report = assert_qdrant_render_config(&input)?;
            let namespace = report.namespace;
            let http_port = report.http_port;
            let grpc_port = report.grpc_port;
            let telemetry_disabled = report.telemetry_disabled;
            let ingress_host = report.ingress_host;
            Ok(format!(
                "ok qdrant-render-config service=qdrant namespace={namespace} http={http_port} grpc={grpc_port} telemetry_disabled={telemetry_disabled} ingress_host={ingress_host}\n"
            ))
        }
        Command::HermesCodeRunPreflight => {
            let input = read_stdin()?;
            let report = assert_hermes_coderun_preflight(&input)?;
            let namespace = report.namespace;
            let coderun_name = report.coderun_name;
            let harness_agent = report.harness_agent;
            Ok(format!(
                "ok hermes-coderun-preflight coderun={namespace}/{coderun_name} harnessAgent={harness_agent}\n"
            ))
        }
        Command::QdrantHttpHealth { url } => {
            let report = check_qdrant_http_health(&url)?;
            let endpoint = report.endpoint;
            let health_status = report.health_status;
            let ready_status = report.ready_status;
            let telemetry_status = report.telemetry_status;
            let telemetry_disabled = report.telemetry_disabled.as_str();
            Ok(format!(
                "ok qdrant-http-health endpoint={endpoint} health={health_status} ready={ready_status} telemetry={telemetry_status} telemetry_disabled={telemetry_disabled}\n"
            ))
        }
        Command::GatewayHealth { url } => {
            let report = check_gateway_health(&url)?;
            let endpoint = report.endpoint;
            let status = report.status;
            let observation = report.observation.as_str();
            Ok(format!(
                "ok gateway-health endpoint={endpoint} status={status} observation={observation}\n"
            ))
        }
        Command::OpenClawDoctorOutput => {
            let input = read_stdin()?;
            let report = assert_openclaw_doctor_output(&input)?;
            let format = report.format.as_str();
            let lines = report.lines;
            Ok(format!(
                "ok openclaw-doctor-output format={format} lines={lines}\n"
            ))
        }
        Command::RawStreamJsonl => {
            let input = read_stdin()?;
            let report = assert_raw_stream_jsonl(&input)?;
            let events = report.events;
            Ok(format!("ok raw-stream-jsonl events={events}\n"))
        }
    }
}

fn parse_command(args: &[String]) -> AppResult<Command> {
    let Some((command, rest)) = args.split_first() else {
        return Err(format!("missing subcommand\n\n{HELP}"));
    };

    match command.as_str() {
        "-h" | "--help" | "help" if rest.is_empty() => Ok(Command::Help),
        "morgan-mem0-config" | "mem0-config" => {
            ensure_no_args(command, rest)?;
            Ok(Command::MorganMem0Config)
        }
        "morgan-diagnostics-config" | "morgan-diagnostics" => {
            ensure_no_args(command, rest)?;
            Ok(Command::MorganDiagnosticsConfig)
        }
        "qdrant-render-config" | "qdrant-config" => {
            ensure_no_args(command, rest)?;
            Ok(Command::QdrantRenderConfig)
        }
        "hermes-coderun-preflight" | "hermes-coderun-smoke" => {
            ensure_no_args(command, rest)?;
            Ok(Command::HermesCodeRunPreflight)
        }
        "qdrant-http-health" | "qdrant-health" => parse_qdrant_http_health_args(rest),
        "gateway-health" | "morgan-gateway-health" => parse_gateway_health_args(rest),
        "openclaw-doctor-output" | "doctor-output" => {
            ensure_no_args(command, rest)?;
            Ok(Command::OpenClawDoctorOutput)
        }
        "raw-stream-jsonl" | "raw-stream" => {
            ensure_no_args(command, rest)?;
            Ok(Command::RawStreamJsonl)
        }
        "-h" | "--help" | "help" => Err(format!(
            "help does not accept arguments: {}\n\n{HELP}",
            rest.join(" ")
        )),
        unknown => Err(format!("unknown subcommand: {unknown}\n\n{HELP}")),
    }
}

fn ensure_no_args(command: &str, rest: &[String]) -> AppResult<()> {
    if rest.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "subcommand {command:?} does not accept arguments: {}",
            rest.join(" ")
        ))
    }
}

fn parse_qdrant_http_health_args(args: &[String]) -> AppResult<Command> {
    match args {
        [] => Ok(Command::QdrantHttpHealth {
            url: DEFAULT_QDRANT_HTTP_URL.to_string(),
        }),
        [help] if help == "-h" || help == "--help" => Ok(Command::Help),
        [url] if !url.starts_with('-') => Ok(Command::QdrantHttpHealth { url: url.clone() }),
        [flag, url] if flag == "--url" => Ok(Command::QdrantHttpHealth { url: url.clone() }),
        [flag] if flag.starts_with("--url=") => Ok(Command::QdrantHttpHealth {
            url: flag
                .strip_prefix("--url=")
                .expect("flag prefix checked")
                .to_string(),
        }),
        _ => Err(format!(
            "qdrant-http-health accepts at most one URL or --url <URL>\n\n{HELP}"
        )),
    }
}

fn parse_gateway_health_args(args: &[String]) -> AppResult<Command> {
    match args {
        [] => Ok(Command::GatewayHealth {
            url: DEFAULT_GATEWAY_HTTP_URL.to_string(),
        }),
        [help] if help == "-h" || help == "--help" => Ok(Command::Help),
        [url] if !url.starts_with('-') => Ok(Command::GatewayHealth { url: url.clone() }),
        [flag, url] if flag == "--url" => Ok(Command::GatewayHealth { url: url.clone() }),
        [flag] if flag.starts_with("--url=") => Ok(Command::GatewayHealth {
            url: flag
                .strip_prefix("--url=")
                .expect("flag prefix checked")
                .to_string(),
        }),
        _ => Err(format!(
            "gateway-health accepts at most one URL or --url <URL>\n\n{HELP}"
        )),
    }
}

fn read_stdin() -> AppResult<String> {
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|error| format!("read stdin: {error}"))?;
    if input.trim().is_empty() {
        Err("expected input on stdin".to_string())
    } else {
        Ok(input)
    }
}

fn extract_openclaw_config(rendered_yaml: &str) -> AppResult<Value> {
    for document in rendered_yaml.split("\n---") {
        if !looks_like_config_map(document) || !document.contains("openclaw.json") {
            continue;
        }
        let block = extract_literal_block(document, "openclaw.json")?;
        return serde_json::from_str(&block)
            .map_err(|error| format!("parse openclaw.json from Morgan ConfigMap: {error}"));
    }

    Err("Morgan ConfigMap data.openclaw.json block not found in rendered YAML".to_string())
}

fn looks_like_config_map(document: &str) -> bool {
    document
        .lines()
        .any(|line| line.trim() == "kind: ConfigMap")
}

fn extract_literal_block(document: &str, key: &str) -> AppResult<String> {
    let mut lines = document.lines().enumerate().peekable();

    while let Some((line_index, line)) = lines.next() {
        if !is_literal_block_marker(line, key) {
            continue;
        }

        let key_indent = leading_spaces(line);
        let mut block_lines = Vec::new();
        while let Some((_, candidate)) = lines.peek().copied() {
            if !candidate.trim().is_empty() && leading_spaces(candidate) <= key_indent {
                break;
            }
            block_lines.push(candidate);
            lines.next();
        }

        let block_indent = block_lines
            .iter()
            .filter(|candidate| !candidate.trim().is_empty())
            .map(|candidate| leading_spaces(candidate))
            .min()
            .unwrap_or(0);
        let block = deindent_lines(&block_lines, block_indent);
        if block.trim().is_empty() {
            return Err(format!(
                "{key} literal block at line {} is empty",
                line_index + 1
            ));
        }
        return Ok(block);
    }

    Err(format!("{key} literal block not found"))
}

fn is_literal_block_marker(line: &str, key: &str) -> bool {
    let trimmed = line.trim_start();
    let Some(after_key) = trimmed.strip_prefix(key) else {
        return false;
    };
    let Some(after_colon) = after_key.strip_prefix(':') else {
        return false;
    };
    after_colon.trim_start().starts_with('|')
}

fn leading_spaces(line: &str) -> usize {
    line.bytes().take_while(|byte| *byte == b' ').count()
}

fn deindent_lines(lines: &[&str], indent: usize) -> String {
    let mut output = String::new();
    for (index, line) in lines.iter().enumerate() {
        if index > 0 {
            output.push('\n');
        }
        if let Some(deindented) = line.get(indent..) {
            output.push_str(deindented);
        }
    }
    output
}

fn assert_morgan_mem0_config(config: &Value) -> AppResult<Mem0Report> {
    let mut failures = Vec::new();

    require_bool(
        config,
        &mut failures,
        "plugins.entries.openclaw-mem0.enabled",
        true,
    );
    require_bool(
        config,
        &mut failures,
        "plugins.entries.memory-core.enabled",
        false,
    );
    require_string(
        config,
        &mut failures,
        "plugins.slots.memory",
        "openclaw-mem0",
    );
    require_array_string_contains(
        config,
        &mut failures,
        "plugins.load.paths",
        EXPECTED_LOAD_PATH_FRAGMENT,
    );
    require_string(
        config,
        &mut failures,
        &format!("{QDRANT_CONFIG_PATH}.host"),
        EXPECTED_QDRANT_HOST,
    );
    require_u64(
        config,
        &mut failures,
        &format!("{QDRANT_CONFIG_PATH}.port"),
        EXPECTED_QDRANT_PORT,
    );
    require_string(
        config,
        &mut failures,
        &format!("{QDRANT_CONFIG_PATH}.collectionName"),
        EXPECTED_COLLECTION,
    );
    require_present(
        config,
        &mut failures,
        &format!("{MEM0_CONFIG_PATH}.customCategories"),
    );
    require_present(
        config,
        &mut failures,
        &format!("{MEM0_CONFIG_PATH}.customInstructions"),
    );
    require_present(
        config,
        &mut failures,
        &format!("{MEM0_CONFIG_PATH}.metadataSource"),
    );

    if failures.is_empty() {
        Ok(Mem0Report {
            qdrant_host: EXPECTED_QDRANT_HOST.to_string(),
            qdrant_port: EXPECTED_QDRANT_PORT,
            collection: EXPECTED_COLLECTION.to_string(),
            load_paths: array_len(config, "plugins.load.paths").unwrap_or(0),
        })
    } else {
        Err(format!(
            "Morgan mem0 config assertions failed:\n- {}",
            failures.join("\n- ")
        ))
    }
}

fn assert_morgan_diagnostics_config(
    rendered_yaml: &str,
    config: &Value,
) -> AppResult<MorganDiagnosticsReport> {
    let mut failures = Vec::new();

    require_string(config, &mut failures, "logging.level", "debug");
    require_string(
        config,
        &mut failures,
        "logging.file",
        EXPECTED_MORGAN_LOG_FILE,
    );
    require_string(config, &mut failures, "logging.consoleLevel", "debug");
    require_bool(config, &mut failures, "diagnostics.enabled", true);
    for expected_flag in EXPECTED_MORGAN_DIAGNOSTIC_FLAGS {
        require_array_string_contains(config, &mut failures, "diagnostics.flags", expected_flag);
    }
    require_string(config, &mut failures, "wizard.lastRunCommand", "doctor");
    require_string(config, &mut failures, "wizard.lastRunMode", "local");

    require_rendered_env_value(&mut failures, rendered_yaml, "OPENCLAW_RAW_STREAM", "1");
    require_rendered_env_value(
        &mut failures,
        rendered_yaml,
        "OPENCLAW_RAW_STREAM_PATH",
        EXPECTED_MORGAN_RAW_STREAM_PATH,
    );
    for expected_flag in EXPECTED_MORGAN_DIAGNOSTIC_FLAGS {
        require_rendered_env_csv_contains(
            &mut failures,
            rendered_yaml,
            "OPENCLAW_DIAGNOSTICS",
            expected_flag,
        );
    }
    require_doc_contains(
        &mut failures,
        "Morgan rendered workload",
        rendered_yaml,
        "openclaw doctor --non-interactive",
    );

    if failures.is_empty() {
        Ok(MorganDiagnosticsReport {
            log_file: EXPECTED_MORGAN_LOG_FILE.to_string(),
            raw_stream_path: EXPECTED_MORGAN_RAW_STREAM_PATH.to_string(),
            diagnostic_flags: array_len(config, "diagnostics.flags").unwrap_or(0),
        })
    } else {
        Err(format!(
            "Morgan diagnostics assertions failed:\n- {}",
            failures.join("\n- ")
        ))
    }
}

fn assert_qdrant_render_config(rendered_yaml: &str) -> AppResult<QdrantRenderReport> {
    let mut failures = Vec::new();

    assert_qdrant_service_render(rendered_yaml, &mut failures);
    assert_qdrant_stateful_set_render(rendered_yaml, &mut failures);
    assert_qdrant_ingress_render(rendered_yaml, &mut failures);
    require_not_contains_ci(&mut failures, rendered_yaml, "datadog");
    require_not_contains_ci(&mut failures, rendered_yaml, "gp3");
    require_not_contains_ci(&mut failures, rendered_yaml, "kind: LoadBalancer");

    if failures.is_empty() {
        Ok(QdrantRenderReport {
            namespace: EXPECTED_QDRANT_NAMESPACE.to_string(),
            http_port: EXPECTED_QDRANT_PORT,
            grpc_port: EXPECTED_QDRANT_GRPC_PORT,
            telemetry_disabled: true,
            ingress_host: "localhost".to_string(),
        })
    } else {
        Err(format!(
            "Qdrant render assertions failed:\n- {}",
            failures.join("\n- ")
        ))
    }
}

fn assert_hermes_coderun_preflight(rendered_yaml: &str) -> AppResult<HermesCodeRunPreflightReport> {
    let mut failures = Vec::new();

    assert_coderun_crd_render(rendered_yaml, &mut failures);
    assert_controller_coderun_rbac(rendered_yaml, &mut failures);
    assert_controller_deployment_render(rendered_yaml, &mut failures);
    assert_hermes_coderun_render(rendered_yaml, &mut failures);

    if failures.is_empty() {
        Ok(HermesCodeRunPreflightReport {
            namespace: EXPECTED_CTO_NAMESPACE.to_string(),
            coderun_name: EXPECTED_HERMES_CODERUN_NAME.to_string(),
            harness_agent: "hermes".to_string(),
        })
    } else {
        Err(format!(
            "Hermes CodeRun preflight assertions failed:\n- {}",
            failures.join("\n- ")
        ))
    }
}

fn assert_coderun_crd_render(rendered_yaml: &str, failures: &mut Vec<String>) {
    match find_rendered_resource(
        rendered_yaml,
        "CustomResourceDefinition",
        "coderuns.agents.platform",
    ) {
        Some(crd) => {
            require_doc_line(failures, "CodeRun CRD", crd, "group: agents.platform");
            require_doc_line(failures, "CodeRun CRD", crd, "plural: coderuns");
            require_doc_line(failures, "CodeRun CRD", crd, "kind: CodeRun");
            require_doc_line(failures, "CodeRun CRD", crd, "- name: v1");
            require_doc_line(failures, "CodeRun CRD", crd, "status: {}");
            require_doc_line(failures, "CodeRun CRD", crd, "harnessAgent:");
            require_doc_line(failures, "CodeRun CRD", crd, "- openclaw");
            require_doc_line(failures, "CodeRun CRD", crd, "- hermes");
            require_doc_line(failures, "CodeRun CRD", crd, "default: openclaw");
        }
        None => failures.push("CodeRun CRD coderuns.agents.platform not found".to_string()),
    }
}

fn assert_controller_coderun_rbac(rendered_yaml: &str, failures: &mut Vec<String>) {
    match find_rendered_resource(rendered_yaml, "ClusterRole", EXPECTED_CONTROLLER_NAME) {
        Some(cluster_role) => {
            require_doc_line(
                failures,
                "controller ClusterRole",
                cluster_role,
                r#"- apiGroups: ["agents.platform"]"#,
            );
            require_doc_line(
                failures,
                "controller ClusterRole",
                cluster_role,
                r#"resources: ["coderuns", "coderuns/status"]"#,
            );
            require_doc_line(
                failures,
                "controller ClusterRole",
                cluster_role,
                r#"verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]"#,
            );
        }
        None => failures.push("controller ClusterRole not found".to_string()),
    }
}

fn assert_controller_deployment_render(rendered_yaml: &str, failures: &mut Vec<String>) {
    match find_rendered_resource(rendered_yaml, "Deployment", EXPECTED_CONTROLLER_NAME) {
        Some(deployment) => {
            require_doc_line(
                failures,
                "controller Deployment",
                deployment,
                "serviceAccountName: cto-controller",
            );
            require_doc_line(
                failures,
                "controller Deployment",
                deployment,
                "- name: AGENT_TEMPLATES_PATH",
            );
            require_doc_line(
                failures,
                "controller Deployment",
                deployment,
                r#"value: "/app/templates""#,
            );
            require_doc_line(
                failures,
                "controller Deployment",
                deployment,
                "name: cto-agent-keys",
            );
        }
        None => failures.push("controller Deployment not found".to_string()),
    }
}

fn assert_hermes_coderun_render(rendered_yaml: &str, failures: &mut Vec<String>) {
    match find_rendered_resource(rendered_yaml, "CodeRun", EXPECTED_HERMES_CODERUN_NAME) {
        Some(coderun) => {
            require_doc_line(
                failures,
                "Hermes CodeRun smoke",
                coderun,
                "apiVersion: agents.platform/v1",
            );
            require_doc_line(
                failures,
                "Hermes CodeRun smoke",
                coderun,
                &format!("namespace: {EXPECTED_CTO_NAMESPACE}"),
            );
            require_doc_line(
                failures,
                "Hermes CodeRun smoke",
                coderun,
                "helm.sh/hook: test",
            );
            require_doc_line(
                failures,
                "Hermes CodeRun smoke",
                coderun,
                "runType: documentation",
            );
            require_doc_line(
                failures,
                "Hermes CodeRun smoke",
                coderun,
                &format!("service: {EXPECTED_HERMES_CODERUN_SERVICE}"),
            );
            require_doc_line(
                failures,
                "Hermes CodeRun smoke",
                coderun,
                &format!("repositoryUrl: {EXPECTED_HERMES_CODERUN_REPOSITORY}"),
            );
            require_doc_line(
                failures,
                "Hermes CodeRun smoke",
                coderun,
                &format!("docsRepositoryUrl: {EXPECTED_HERMES_CODERUN_REPOSITORY}"),
            );
            require_doc_line(
                failures,
                "Hermes CodeRun smoke",
                coderun,
                r#"workingDirectory: ".""#,
            );
            require_doc_line(
                failures,
                "Hermes CodeRun smoke",
                coderun,
                &format!("githubApp: {EXPECTED_HERMES_CODERUN_GITHUB_APP}"),
            );
            require_doc_line(
                failures,
                "Hermes CodeRun smoke",
                coderun,
                "harnessAgent: hermes",
            );
            require_doc_line(
                failures,
                "Hermes CodeRun smoke",
                coderun,
                "enableDocker: false",
            );
            require_doc_line(
                failures,
                "Hermes CodeRun smoke",
                coderun,
                "enableCodeServer: false",
            );
            require_doc_line(failures, "Hermes CodeRun smoke", coderun, "quality: false");
            require_doc_line(failures, "Hermes CodeRun smoke", coderun, "security: false");
            require_doc_line(failures, "Hermes CodeRun smoke", coderun, "testing: false");
            require_doc_line(
                failures,
                "Hermes CodeRun smoke",
                coderun,
                "deployment: false",
            );
        }
        None => failures.push("Hermes CodeRun smoke resource not found".to_string()),
    }
}

fn assert_qdrant_service_render(rendered_yaml: &str, failures: &mut Vec<String>) {
    match find_rendered_resource(rendered_yaml, "Service", EXPECTED_QDRANT_SERVICE) {
        Some(service) => {
            require_doc_line(
                failures,
                "Qdrant Service",
                service,
                &format!("namespace: {EXPECTED_QDRANT_NAMESPACE}"),
            );
            require_doc_line(failures, "Qdrant Service", service, "type: ClusterIP");
            require_doc_line(failures, "Qdrant Service", service, "- name: http");
            require_doc_line(
                failures,
                "Qdrant Service",
                service,
                &format!("port: {EXPECTED_QDRANT_PORT}"),
            );
            require_doc_line(failures, "Qdrant Service", service, "targetPort: http");
            require_doc_line(failures, "Qdrant Service", service, "- name: grpc");
            require_doc_line(
                failures,
                "Qdrant Service",
                service,
                &format!("port: {EXPECTED_QDRANT_GRPC_PORT}"),
            );
            require_doc_line(failures, "Qdrant Service", service, "targetPort: grpc");
        }
        None => failures.push("Qdrant Service resource not found".to_string()),
    }
}

fn assert_qdrant_stateful_set_render(rendered_yaml: &str, failures: &mut Vec<String>) {
    match find_rendered_resource(rendered_yaml, "StatefulSet", EXPECTED_QDRANT_SERVICE) {
        Some(stateful_set) => {
            require_doc_line(
                failures,
                "Qdrant StatefulSet",
                stateful_set,
                &format!("namespace: {EXPECTED_QDRANT_NAMESPACE}"),
            );
            require_doc_line(
                failures,
                "Qdrant StatefulSet",
                stateful_set,
                &format!("serviceName: {EXPECTED_QDRANT_SERVICE}"),
            );
            require_doc_contains(
                failures,
                "Qdrant StatefulSet",
                stateful_set,
                "image: \"qdrant/qdrant:",
            );
            require_doc_line(
                failures,
                "Qdrant StatefulSet",
                stateful_set,
                &format!("containerPort: {EXPECTED_QDRANT_PORT}"),
            );
            require_doc_line(
                failures,
                "Qdrant StatefulSet",
                stateful_set,
                &format!("containerPort: {EXPECTED_QDRANT_GRPC_PORT}"),
            );
            require_env_value(
                failures,
                "Qdrant StatefulSet",
                stateful_set,
                "QDRANT__TELEMETRY_DISABLED",
                "true",
            );
            require_env_value(
                failures,
                "Qdrant StatefulSet",
                stateful_set,
                "QDRANT__SERVICE__HTTP_PORT",
                "6333",
            );
            require_env_value(
                failures,
                "Qdrant StatefulSet",
                stateful_set,
                "QDRANT__SERVICE__GRPC_PORT",
                "6334",
            );
            require_doc_line(
                failures,
                "Qdrant StatefulSet",
                stateful_set,
                "path: \"/healthz\"",
            );
            require_doc_line(
                failures,
                "Qdrant StatefulSet",
                stateful_set,
                "path: \"/readyz\"",
            );
            require_doc_line(
                failures,
                "Qdrant StatefulSet",
                stateful_set,
                "storage: \"5Gi\"",
            );
        }
        None => failures.push("Qdrant StatefulSet resource not found".to_string()),
    }
}

fn assert_qdrant_ingress_render(rendered_yaml: &str, failures: &mut Vec<String>) {
    match find_rendered_resource(rendered_yaml, "Ingress", EXPECTED_QDRANT_SERVICE) {
        Some(ingress) => {
            require_doc_line(
                failures,
                "Qdrant Ingress",
                ingress,
                &format!("namespace: {EXPECTED_QDRANT_NAMESPACE}"),
            );
            require_doc_line(failures, "Qdrant Ingress", ingress, "- host: \"localhost\"");
            require_doc_line(
                failures,
                "Qdrant Ingress",
                ingress,
                "- path: \"/qdrant(/|$)(.*)\"",
            );
            require_doc_line(
                failures,
                "Qdrant Ingress",
                ingress,
                "nginx.ingress.kubernetes.io/rewrite-target: /$2",
            );
            require_doc_line(
                failures,
                "Qdrant Ingress",
                ingress,
                &format!("number: {EXPECTED_QDRANT_PORT}"),
            );
        }
        None => failures.push("Qdrant Ingress resource not found".to_string()),
    }
}

fn check_qdrant_http_health(url: &str) -> AppResult<QdrantHttpReport> {
    let endpoint = parse_http_endpoint(url)?;
    let health = http_get(&endpoint, "/healthz")?;
    let ready = http_get(&endpoint, "/readyz")?;
    let telemetry = http_get(&endpoint, "/telemetry?details_level=1&anonymize=true")?;
    assert_qdrant_http_responses(&endpoint, &health, &ready, &telemetry)
}

fn assert_qdrant_http_responses(
    endpoint: &HttpEndpoint,
    health: &HttpResponse,
    ready: &HttpResponse,
    telemetry: &HttpResponse,
) -> AppResult<QdrantHttpReport> {
    let mut failures = Vec::new();

    if !is_local_qdrant_host(&endpoint.host) {
        failures.push(format!(
            "endpoint host {:?} is not an allowed local/kind Qdrant host",
            endpoint.host
        ));
    }

    require_http_success(&mut failures, "Qdrant /healthz", health);
    if !health.body.to_ascii_lowercase().contains("healthz") {
        failures.push("Qdrant /healthz response did not contain expected healthz text".to_string());
    }

    require_http_success(&mut failures, "Qdrant /readyz", ready);
    if !ready.body.to_ascii_lowercase().contains("ready") {
        failures
            .push("Qdrant /readyz response did not contain expected readiness text".to_string());
    }

    require_http_success(&mut failures, "Qdrant /telemetry", telemetry);
    let telemetry_disabled = match serde_json::from_str::<Value>(&telemetry.body) {
        Ok(document) => {
            match value_at_path(&document, "status") {
                Some(Value::String(status)) if status == "ok" => {}
                Some(actual) => failures.push(format!(
                    "Qdrant /telemetry status expected \"ok\" but found {actual}"
                )),
                None => failures.push("Qdrant /telemetry status missing".to_string()),
            }

            if let Some(Value::String(app_name)) = value_at_path(&document, "result.app.name") {
                if !app_name.to_ascii_lowercase().contains("qdrant") {
                    failures.push(format!(
                        "Qdrant /telemetry result.app.name expected qdrant but found {app_name:?}"
                    ));
                }
            }

            let observation = telemetry_disabled_observation(&document);
            if observation == TelemetryDisabledObservation::ExposedFalse {
                failures.push(
                    "Qdrant /telemetry exposed telemetry_disabled=false; expected true".to_string(),
                );
            }
            observation
        }
        Err(error) => {
            failures.push(format!("parse Qdrant /telemetry JSON: {error}"));
            TelemetryDisabledObservation::NotExposed
        }
    };

    if failures.is_empty() {
        Ok(QdrantHttpReport {
            endpoint: endpoint.original.clone(),
            health_status: health.status,
            ready_status: ready.status,
            telemetry_status: telemetry.status,
            telemetry_disabled,
        })
    } else {
        Err(format!(
            "Qdrant HTTP health assertions failed:\n- {}",
            failures.join("\n- ")
        ))
    }
}

fn check_gateway_health(url: &str) -> AppResult<GatewayHealthReport> {
    let endpoint = parse_http_endpoint(url)?;
    let health = http_get(&endpoint, "/healthz")?;
    assert_gateway_health_response(&endpoint, &health)
}

fn assert_gateway_health_response(
    endpoint: &HttpEndpoint,
    health: &HttpResponse,
) -> AppResult<GatewayHealthReport> {
    let mut failures = Vec::new();

    if !is_local_gateway_host(&endpoint.host) {
        failures.push(format!(
            "endpoint host {:?} is not an allowed local/kind Morgan gateway host",
            endpoint.host
        ));
    }
    require_http_success(&mut failures, "Morgan gateway /healthz", health);

    let observation = match serde_json::from_str::<Value>(&health.body) {
        Ok(document) => gateway_health_observation(&document).unwrap_or_else(|| {
            failures.push(
                "Morgan gateway /healthz JSON did not expose ok=true, healthy=true, or status=ok"
                    .to_string(),
            );
            GatewayHealthObservation::OkTrue
        }),
        Err(error) => {
            failures.push(format!("parse Morgan gateway /healthz JSON: {error}"));
            GatewayHealthObservation::OkTrue
        }
    };

    if failures.is_empty() {
        Ok(GatewayHealthReport {
            endpoint: endpoint.original.clone(),
            status: health.status,
            observation,
        })
    } else {
        Err(format!(
            "Morgan gateway health assertions failed:\n- {}",
            failures.join("\n- ")
        ))
    }
}

fn gateway_health_observation(document: &Value) -> Option<GatewayHealthObservation> {
    if value_at_path(document, "ok").and_then(Value::as_bool) == Some(true) {
        return Some(GatewayHealthObservation::OkTrue);
    }
    if value_at_path(document, "healthy").and_then(Value::as_bool) == Some(true) {
        return Some(GatewayHealthObservation::HealthyTrue);
    }
    if value_at_path(document, "status")
        .and_then(Value::as_str)
        .is_some_and(is_ok_status)
    {
        return Some(GatewayHealthObservation::StatusOk);
    }
    None
}

fn is_ok_status(status: &str) -> bool {
    matches!(
        status.to_ascii_lowercase().as_str(),
        "ok" | "healthy" | "ready" | "pass" | "passed"
    )
}

fn assert_openclaw_doctor_output(input: &str) -> AppResult<DoctorOutputReport> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("OpenClaw doctor output is empty".to_string());
    }

    if let Ok(document) = serde_json::from_str::<Value>(trimmed) {
        assert_openclaw_doctor_json(&document, input.lines().count())
    } else {
        assert_openclaw_doctor_text(input)
    }
}

fn assert_openclaw_doctor_json(document: &Value, lines: usize) -> AppResult<DoctorOutputReport> {
    let mut failures = Vec::new();
    collect_doctor_json_failures(document, "$", &mut failures);
    if !doctor_json_has_success_marker(document) {
        failures.push(
            "OpenClaw doctor JSON did not expose ok/success/healthy=true or status=ok".to_string(),
        );
    }

    if failures.is_empty() {
        Ok(DoctorOutputReport {
            format: DoctorOutputFormat::Json,
            lines,
        })
    } else {
        Err(format!(
            "OpenClaw doctor JSON assertions failed:\n- {}",
            failures.join("\n- ")
        ))
    }
}

fn assert_openclaw_doctor_text(input: &str) -> AppResult<DoctorOutputReport> {
    let failures = input
        .lines()
        .enumerate()
        .filter_map(|(index, line)| {
            if is_doctor_failure_line(line) {
                Some(format!("line {}: {}", index + 1, line.trim()))
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    if failures.is_empty() {
        Ok(DoctorOutputReport {
            format: DoctorOutputFormat::Text,
            lines: input.lines().count(),
        })
    } else {
        Err(format!(
            "OpenClaw doctor text assertions failed:\n- {}",
            failures.join("\n- ")
        ))
    }
}

fn doctor_json_has_success_marker(document: &Value) -> bool {
    match document {
        Value::Object(map) => map.iter().any(|(key, value)| {
            let normalized = normalize_key(key);
            let direct_success =
                matches!(normalized.as_str(), "ok" | "success" | "healthy" | "passed")
                    && value.as_bool() == Some(true);
            let status_success = normalized == "status" && value.as_str().is_some_and(is_ok_status);
            direct_success || status_success || doctor_json_has_success_marker(value)
        }),
        Value::Array(items) => items.iter().any(doctor_json_has_success_marker),
        _ => false,
    }
}

fn collect_doctor_json_failures(value: &Value, path: &str, failures: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            for (key, child) in map {
                let child_path = format!("{path}.{key}");
                let normalized = normalize_key(key);
                if matches!(normalized.as_str(), "ok" | "success" | "healthy" | "passed")
                    && child.as_bool() == Some(false)
                {
                    failures.push(format!("{child_path} was false"));
                }
                if is_error_key(&normalized) && !is_empty_json_value(child) {
                    failures.push(format!("{child_path} was non-empty: {child}"));
                }
                if normalized == "status" {
                    if let Some(status) = child.as_str() {
                        if is_failure_status(status) {
                            failures
                                .push(format!("{child_path} reported failure status {status:?}"));
                        }
                    }
                }
                collect_doctor_json_failures(child, &child_path, failures);
            }
        }
        Value::Array(items) => {
            for (index, child) in items.iter().enumerate() {
                collect_doctor_json_failures(child, &format!("{path}[{index}]"), failures);
            }
        }
        _ => {}
    }
}

fn normalize_key(key: &str) -> String {
    key.replace(['-', ' '], "_").to_ascii_lowercase()
}

fn is_error_key(normalized_key: &str) -> bool {
    matches!(
        normalized_key,
        "error" | "errors" | "fatal" | "failure" | "failures"
    )
}

fn is_empty_json_value(value: &Value) -> bool {
    match value {
        Value::Null | Value::Bool(false) => true,
        Value::Number(number) => number.as_u64() == Some(0),
        Value::String(text) => text.trim().is_empty(),
        Value::Array(items) => items.is_empty(),
        Value::Object(map) => map.is_empty(),
        Value::Bool(true) => false,
    }
}

fn is_failure_status(status: &str) -> bool {
    let normalized = status.to_ascii_lowercase();
    normalized.contains("fail") || normalized.contains("error") || normalized.contains("fatal")
}

fn is_doctor_failure_line(line: &str) -> bool {
    let normalized = line.trim().to_ascii_lowercase();
    if normalized.is_empty() || is_benign_doctor_line(&normalized) {
        return false;
    }
    ["error", "fatal", "failed", "failure", "exception"]
        .iter()
        .any(|needle| normalized.contains(needle))
}

fn is_benign_doctor_line(normalized_line: &str) -> bool {
    [
        "0 failed",
        "0 failures",
        "no errors",
        "no failures",
        "without error",
        "not a failure",
        "missing api key",
        "api key not set",
        "provider key not set",
        "provider credential",
    ]
    .iter()
    .any(|needle| normalized_line.contains(needle))
}

fn assert_raw_stream_jsonl(input: &str) -> AppResult<RawStreamReport> {
    let mut events = 0usize;
    let mut failures = Vec::new();

    for (index, line) in input.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<Value>(trimmed) {
            Ok(Value::Object(_)) => events += 1,
            Ok(_) => failures.push(format!(
                "line {} was valid JSON but not an object",
                index + 1
            )),
            Err(error) => failures.push(format!("line {} was not valid JSON: {error}", index + 1)),
        }
    }

    if events == 0 {
        failures.push("raw stream JSONL contained no JSON object events".to_string());
    }

    if failures.is_empty() {
        Ok(RawStreamReport { events })
    } else {
        Err(format!(
            "raw stream JSONL assertions failed:\n- {}",
            failures.join("\n- ")
        ))
    }
}

fn require_bool(config: &Value, failures: &mut Vec<String>, path: &str, expected: bool) {
    match value_at_path(config, path) {
        Some(Value::Bool(actual)) if *actual == expected => {}
        Some(actual) => failures.push(format!("{path} expected {expected} but found {actual}")),
        None => failures.push(format!("{path} missing; expected {expected}")),
    }
}

fn require_string(config: &Value, failures: &mut Vec<String>, path: &str, expected: &str) {
    match value_at_path(config, path) {
        Some(Value::String(actual)) if actual == expected => {}
        Some(actual) => failures.push(format!("{path} expected {expected:?} but found {actual}")),
        None => failures.push(format!("{path} missing; expected {expected:?}")),
    }
}

fn require_u64(config: &Value, failures: &mut Vec<String>, path: &str, expected: u64) {
    match value_at_path(config, path) {
        Some(Value::Number(actual)) if actual.as_u64() == Some(expected) => {}
        Some(actual) => failures.push(format!("{path} expected {expected} but found {actual}")),
        None => failures.push(format!("{path} missing; expected {expected}")),
    }
}

fn require_present(config: &Value, failures: &mut Vec<String>, path: &str) {
    match value_at_path(config, path) {
        Some(Value::Null) => failures.push(format!("{path} must not be null")),
        Some(_) => {}
        None => failures.push(format!("{path} missing")),
    }
}

fn require_array_string_contains(
    config: &Value,
    failures: &mut Vec<String>,
    path: &str,
    expected_fragment: &str,
) {
    match value_at_path(config, path) {
        Some(Value::Array(items))
            if items
                .iter()
                .filter_map(Value::as_str)
                .any(|item| item.contains(expected_fragment)) => {}
        Some(Value::Array(_)) => failures.push(format!(
            "{path} did not contain a string with {expected_fragment:?}"
        )),
        Some(actual) => failures.push(format!("{path} expected an array but found {actual}")),
        None => failures.push(format!("{path} missing; expected an array")),
    }
}

fn array_len(config: &Value, path: &str) -> Option<usize> {
    value_at_path(config, path).and_then(|value| value.as_array().map(Vec::len))
}

fn value_at_path<'a>(document: &'a Value, path: &str) -> Option<&'a Value> {
    path.split('.')
        .try_fold(document, |current, segment| match current {
            Value::Object(map) => map.get(segment),
            Value::Array(items) => segment
                .parse::<usize>()
                .ok()
                .and_then(|index| items.get(index)),
            _ => None,
        })
}

fn find_rendered_resource<'a>(rendered_yaml: &'a str, kind: &str, name: &str) -> Option<&'a str> {
    let kind_line = format!("kind: {kind}");
    let name_line = format!("name: {name}");
    rendered_documents(rendered_yaml)
        .find(|document| doc_has_line(document, &kind_line) && doc_has_line(document, &name_line))
}

fn rendered_documents(rendered_yaml: &str) -> impl Iterator<Item = &str> {
    rendered_yaml
        .split("\n---")
        .map(|document| document.trim().trim_start_matches("---").trim())
        .filter(|document| !document.is_empty())
}

fn doc_has_line(document: &str, expected_line: &str) -> bool {
    document.lines().any(|line| line.trim() == expected_line)
}

fn require_doc_line(
    failures: &mut Vec<String>,
    resource: &str,
    document: &str,
    expected_line: &str,
) {
    if !doc_has_line(document, expected_line) {
        failures.push(format!("{resource} missing line {expected_line:?}"));
    }
}

fn require_doc_contains(
    failures: &mut Vec<String>,
    resource: &str,
    document: &str,
    expected_fragment: &str,
) {
    if !document.contains(expected_fragment) {
        failures.push(format!("{resource} missing fragment {expected_fragment:?}"));
    }
}

fn require_not_contains_ci(failures: &mut Vec<String>, document: &str, forbidden: &str) {
    if document
        .to_ascii_lowercase()
        .contains(&forbidden.to_ascii_lowercase())
    {
        failures.push(format!("rendered Qdrant manifest contained {forbidden:?}"));
    }
}

fn require_env_value(
    failures: &mut Vec<String>,
    resource: &str,
    document: &str,
    name: &str,
    expected: &str,
) {
    match yaml_env_value(document, name) {
        Some(actual) if actual == expected => {}
        Some(actual) => failures.push(format!(
            "{resource} env {name} expected {expected:?} but found {actual:?}"
        )),
        None => failures.push(format!("{resource} env {name} missing")),
    }
}

fn require_rendered_env_value(
    failures: &mut Vec<String>,
    rendered_yaml: &str,
    name: &str,
    expected: &str,
) {
    require_env_value(
        failures,
        "rendered manifests",
        rendered_yaml,
        name,
        expected,
    );
}

fn require_rendered_env_csv_contains(
    failures: &mut Vec<String>,
    rendered_yaml: &str,
    name: &str,
    expected: &str,
) {
    match yaml_env_value(rendered_yaml, name) {
        Some(actual) if csv_contains(actual, expected) => {}
        Some(actual) => failures.push(format!(
            "rendered manifests env {name} expected comma-separated value {expected:?} but found \
             {actual:?}"
        )),
        None => failures.push(format!("rendered manifests env {name} missing")),
    }
}

fn csv_contains(actual: &str, expected: &str) -> bool {
    actual.split(',').any(|item| item.trim() == expected)
}

fn yaml_env_value<'a>(document: &'a str, name: &str) -> Option<&'a str> {
    let mut lines = document.lines().peekable();
    while let Some(line) = lines.next() {
        if line.trim().strip_prefix("- name: ") != Some(name) {
            continue;
        }

        while let Some(candidate) = lines.peek().copied() {
            let trimmed = candidate.trim();
            if trimmed.starts_with("- name: ") {
                break;
            }
            lines.next();
            if let Some(value) = trimmed.strip_prefix("value: ") {
                return Some(trim_yaml_scalar(value));
            }
        }
    }
    None
}

fn trim_yaml_scalar(value: &str) -> &str {
    value.trim().trim_matches('"')
}

fn parse_http_endpoint(url: &str) -> AppResult<HttpEndpoint> {
    let original = url.trim();
    if original.is_empty() {
        return Err("HTTP URL must not be empty".to_string());
    }
    if original.starts_with("https://") {
        return Err("local health check expects http://, not https://".to_string());
    }
    let Some(without_scheme) = original.strip_prefix("http://") else {
        return Err(format!("HTTP URL must start with http://: {original}"));
    };
    let authority_end = without_scheme
        .find(['/', '?', '#'])
        .unwrap_or(without_scheme.len());
    let (authority, suffix) = without_scheme.split_at(authority_end);
    if suffix.starts_with('?') || suffix.starts_with('#') {
        return Err("HTTP URL must not include a query or fragment".to_string());
    }

    let (host, port) = parse_http_authority(authority)?;
    let base_path = suffix.trim_end_matches('/').to_string();

    Ok(HttpEndpoint {
        original: original.to_string(),
        host,
        port,
        base_path,
    })
}

fn parse_http_authority(authority: &str) -> AppResult<(String, u16)> {
    if authority.is_empty() {
        return Err("HTTP URL is missing a host".to_string());
    }
    if authority.contains('@') {
        return Err("HTTP URL must not include user info".to_string());
    }

    if let Some(after_open_bracket) = authority.strip_prefix('[') {
        let Some(close_bracket) = after_open_bracket.find(']') else {
            return Err(format!("invalid bracketed IPv6 host in {authority:?}"));
        };
        let host = &after_open_bracket[..close_bracket];
        let rest = &after_open_bracket[close_bracket + 1..];
        let port = if rest.is_empty() {
            80
        } else {
            let Some(port_text) = rest.strip_prefix(':') else {
                return Err(format!("invalid bracketed IPv6 authority {authority:?}"));
            };
            parse_http_port(port_text)?
        };
        if host.is_empty() {
            return Err("HTTP URL is missing an IPv6 host".to_string());
        }
        return Ok((host.to_string(), port));
    }

    if authority.matches(':').count() > 1 {
        return Err("IPv6 HTTP URLs must use bracket syntax like http://[::1]:6333".to_string());
    }

    match authority.rsplit_once(':') {
        Some((host, port_text)) => {
            if host.is_empty() {
                return Err("HTTP URL is missing a host".to_string());
            }
            Ok((host.to_string(), parse_http_port(port_text)?))
        }
        None => Ok((authority.to_string(), 80)),
    }
}

fn parse_http_port(port_text: &str) -> AppResult<u16> {
    let port = port_text
        .parse::<u16>()
        .map_err(|error| format!("invalid HTTP port {port_text:?}: {error}"))?;
    if port == 0 {
        Err("HTTP port must be greater than zero".to_string())
    } else {
        Ok(port)
    }
}

fn is_local_qdrant_host(host: &str) -> bool {
    let normalized = host.trim_end_matches('.').to_ascii_lowercase();
    matches!(
        normalized.as_str(),
        "localhost"
            | "127.0.0.1"
            | "::1"
            | "host.docker.internal"
            | "kubernetes.docker.internal"
            | "qdrant"
            | "qdrant.cto-system"
            | "qdrant.cto-system.svc"
            | "qdrant.cto-system.svc.cluster.local"
    )
}

fn is_local_gateway_host(host: &str) -> bool {
    let normalized = host.trim_end_matches('.').to_ascii_lowercase();
    matches!(
        normalized.as_str(),
        "localhost"
            | "127.0.0.1"
            | "::1"
            | "host.docker.internal"
            | "kubernetes.docker.internal"
            | "morgan"
            | "morgan.cto-system"
            | "morgan.cto-system.svc"
            | "morgan.cto-system.svc.cluster.local"
    )
}

fn http_get(endpoint: &HttpEndpoint, path: &str) -> AppResult<HttpResponse> {
    let address = resolve_socket_addr(&endpoint.host, endpoint.port)?;
    let mut stream =
        TcpStream::connect_timeout(&address, QDRANT_HTTP_TIMEOUT).map_err(|error| {
            format!(
                "connect to HTTP endpoint {} ({address}): {error}",
                endpoint.original
            )
        })?;
    stream
        .set_read_timeout(Some(QDRANT_HTTP_TIMEOUT))
        .map_err(|error| format!("set HTTP read timeout: {error}"))?;
    stream
        .set_write_timeout(Some(QDRANT_HTTP_TIMEOUT))
        .map_err(|error| format!("set HTTP write timeout: {error}"))?;

    let request_path = endpoint_request_path(endpoint, path);
    let host_header = http_host_header(&endpoint.host, endpoint.port);
    let request = format!(
        "GET {request_path} HTTP/1.1\r\nHost: {host_header}\r\nUser-Agent: cto-ci-assert/0.1\r\nAccept: application/json,text/plain,*/*\r\nConnection: close\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("write HTTP request: {error}"))?;

    let mut raw_response = String::new();
    stream
        .read_to_string(&mut raw_response)
        .map_err(|error| format!("read HTTP response: {error}"))?;
    parse_http_response(&raw_response)
}

fn resolve_socket_addr(host: &str, port: u16) -> AppResult<SocketAddr> {
    (host, port)
        .to_socket_addrs()
        .map_err(|error| format!("resolve {host}:{port}: {error}"))?
        .next()
        .ok_or_else(|| format!("resolve {host}:{port}: no socket addresses returned"))
}

fn endpoint_request_path(endpoint: &HttpEndpoint, path: &str) -> String {
    let base_path = endpoint.base_path.trim_end_matches('/');
    if base_path.is_empty() {
        path.to_string()
    } else {
        format!("{base_path}{path}")
    }
}

fn http_host_header(host: &str, port: u16) -> String {
    let formatted_host = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    if port == 80 {
        formatted_host
    } else {
        format!("{formatted_host}:{port}")
    }
}

fn parse_http_response(raw_response: &str) -> AppResult<HttpResponse> {
    let (head, body) = split_http_head_body(raw_response)
        .ok_or_else(|| "Qdrant HTTP response did not contain headers and body".to_string())?;
    let mut head_lines = head.lines();
    let status_line = head_lines
        .next()
        .ok_or_else(|| "Qdrant HTTP response missing status line".to_string())?;
    let mut status_parts = status_line.split_whitespace();
    let protocol = status_parts
        .next()
        .ok_or_else(|| "Qdrant HTTP status line missing protocol".to_string())?;
    if !protocol.starts_with("HTTP/") {
        return Err(format!("invalid Qdrant HTTP status line: {status_line:?}"));
    }
    let status = status_parts
        .next()
        .ok_or_else(|| "Qdrant HTTP status line missing status code".to_string())?
        .parse::<u16>()
        .map_err(|error| format!("parse Qdrant HTTP status code: {error}"))?;

    let headers = head_lines
        .filter_map(|line| {
            line.split_once(':')
                .map(|(name, value)| (name.trim().to_ascii_lowercase(), value.trim().to_string()))
        })
        .collect::<Vec<_>>();

    let body = if header_value(&headers, "transfer-encoding")
        .is_some_and(|value| value.to_ascii_lowercase().contains("chunked"))
    {
        decode_chunked_body(body)?
    } else {
        body.to_string()
    };

    Ok(HttpResponse {
        status,
        headers,
        body,
    })
}

fn split_http_head_body(raw_response: &str) -> Option<(&str, &str)> {
    raw_response
        .split_once("\r\n\r\n")
        .or_else(|| raw_response.split_once("\n\n"))
}

fn header_value<'a>(headers: &'a [(String, String)], name: &str) -> Option<&'a str> {
    headers
        .iter()
        .find(|(header_name, _)| header_name == name)
        .map(|(_, value)| value.as_str())
}

fn decode_chunked_body(body: &str) -> AppResult<String> {
    let mut rest = body;
    let mut decoded = String::new();

    loop {
        let Some((size_line, after_size)) = split_http_line(rest) else {
            return Err("chunked Qdrant HTTP body missing chunk size".to_string());
        };
        let size_text = size_line.split(';').next().unwrap_or(size_line).trim();
        let size = usize::from_str_radix(size_text, 16)
            .map_err(|error| format!("parse chunked Qdrant HTTP body size: {error}"))?;
        if size == 0 {
            return Ok(decoded);
        }
        if after_size.len() < size {
            return Err("chunked Qdrant HTTP body ended before chunk payload".to_string());
        }
        let (chunk, after_chunk) = after_size.split_at(size);
        decoded.push_str(chunk);
        rest = after_chunk
            .strip_prefix("\r\n")
            .or_else(|| after_chunk.strip_prefix('\n'))
            .ok_or_else(|| "chunked Qdrant HTTP body missing chunk terminator".to_string())?;
    }
}

fn split_http_line(input: &str) -> Option<(&str, &str)> {
    if let Some(position) = input.find("\r\n") {
        Some((&input[..position], &input[position + 2..]))
    } else {
        input
            .find('\n')
            .map(|position| (&input[..position], &input[position + 1..]))
    }
}

fn require_http_success(failures: &mut Vec<String>, label: &str, response: &HttpResponse) {
    if !(200..300).contains(&response.status) {
        failures.push(format!(
            "{label} expected 2xx status but found {} with body {:?}",
            response.status,
            response.body.trim()
        ));
    }
}

fn telemetry_disabled_observation(document: &Value) -> TelemetryDisabledObservation {
    match document {
        Value::Object(map) => {
            for (key, value) in map {
                let normalized = key.replace('-', "_").to_ascii_lowercase();
                if normalized == "telemetry_disabled" || normalized == "telemetrydisabled" {
                    return match value.as_bool() {
                        Some(true) => TelemetryDisabledObservation::ExposedTrue,
                        Some(false) => TelemetryDisabledObservation::ExposedFalse,
                        None => TelemetryDisabledObservation::NotExposed,
                    };
                }
            }
            map.values()
                .map(telemetry_disabled_observation)
                .find(|observation| *observation != TelemetryDisabledObservation::NotExposed)
                .unwrap_or(TelemetryDisabledObservation::NotExposed)
        }
        Value::Array(items) => items
            .iter()
            .map(telemetry_disabled_observation)
            .find(|observation| *observation != TelemetryDisabledObservation::NotExposed)
            .unwrap_or(TelemetryDisabledObservation::NotExposed),
        _ => TelemetryDisabledObservation::NotExposed,
    }
}

#[cfg(test)]
mod tests {
    #[allow(clippy::wildcard_imports)]
    use super::*;
    use serde_json::json;

    #[test]
    fn extracts_openclaw_json_from_rendered_config_map() {
        let config = extract_openclaw_config(sample_rendered_yaml()).expect("extract config");

        assert_eq!(
            value_at_path(&config, &format!("{QDRANT_CONFIG_PATH}.host")),
            Some(&json!(EXPECTED_QDRANT_HOST))
        );
    }

    #[test]
    fn accepts_expected_morgan_mem0_config() {
        let config = sample_openclaw_config();

        let report = assert_morgan_mem0_config(&config).expect("valid mem0 config");

        assert_eq!(
            report,
            Mem0Report {
                qdrant_host: EXPECTED_QDRANT_HOST.to_string(),
                qdrant_port: EXPECTED_QDRANT_PORT,
                collection: EXPECTED_COLLECTION.to_string(),
                load_paths: 1,
            }
        );
    }

    #[test]
    fn rejects_wrong_qdrant_collection() {
        let mut config = sample_openclaw_config();
        let qdrant = value_at_path_mut(&mut config, QDRANT_CONFIG_PATH).expect("qdrant config");
        qdrant["collectionName"] = json!("cto_desktop_memory");

        let error = assert_morgan_mem0_config(&config).expect_err("collection mismatch");

        assert!(error.contains(
            r#"plugins.entries.openclaw-mem0.config.oss.vectorStore.config.collectionName expected "cto_memory""#
        ));
    }

    #[test]
    fn rejects_missing_custom_instructions() {
        let mut config = sample_openclaw_config();
        let mem0_config = value_at_path_mut(&mut config, MEM0_CONFIG_PATH).expect("mem0 config");
        mem0_config
            .as_object_mut()
            .expect("mem0 object")
            .remove("customInstructions");

        let error = assert_morgan_mem0_config(&config).expect_err("custom instructions missing");

        assert!(error.contains("plugins.entries.openclaw-mem0.config.customInstructions missing"));
    }

    #[test]
    fn rejects_missing_openclaw_config_map() {
        let error = extract_openclaw_config("kind: Service\nmetadata:\n  name: morgan\n")
            .expect_err("missing configmap");

        assert!(error.contains("openclaw.json block not found"));
    }

    #[test]
    fn parses_qdrant_http_health_default_command() {
        let command = parse_command(&["qdrant-http-health".to_string()]).expect("parse command");

        assert_eq!(
            command,
            Command::QdrantHttpHealth {
                url: DEFAULT_QDRANT_HTTP_URL.to_string()
            }
        );
    }

    #[test]
    fn parses_hermes_coderun_preflight_command() {
        let command =
            parse_command(&["hermes-coderun-preflight".to_string()]).expect("parse command");

        assert_eq!(command, Command::HermesCodeRunPreflight);
    }

    #[test]
    fn parses_gateway_health_default_command() {
        let command = parse_command(&["gateway-health".to_string()]).expect("parse command");

        assert_eq!(
            command,
            Command::GatewayHealth {
                url: DEFAULT_GATEWAY_HTTP_URL.to_string()
            }
        );
    }

    #[test]
    fn accepts_expected_morgan_diagnostics_config() {
        let config = sample_morgan_diagnostics_config();
        let report =
            assert_morgan_diagnostics_config(sample_morgan_diagnostics_rendered_yaml(), &config)
                .expect("valid diagnostics config");

        assert_eq!(
            report,
            MorganDiagnosticsReport {
                log_file: EXPECTED_MORGAN_LOG_FILE.to_string(),
                raw_stream_path: EXPECTED_MORGAN_RAW_STREAM_PATH.to_string(),
                diagnostic_flags: EXPECTED_MORGAN_DIAGNOSTIC_FLAGS.len(),
            }
        );
    }

    #[test]
    fn rejects_morgan_diagnostics_without_raw_stream_env() {
        let rendered = sample_morgan_diagnostics_rendered_yaml()
            .replace("OPENCLAW_RAW_STREAM_PATH", "OPENCLAW_RAW_STREAM_DISABLED");

        let error =
            assert_morgan_diagnostics_config(&rendered, &sample_morgan_diagnostics_config())
                .expect_err("missing raw stream path rejected");

        assert!(error.contains("OPENCLAW_RAW_STREAM_PATH"));
    }

    #[test]
    fn accepts_expected_gateway_health_response() {
        let endpoint = parse_http_endpoint(DEFAULT_GATEWAY_HTTP_URL).expect("parse endpoint");
        let report =
            assert_gateway_health_response(&endpoint, &http_response(200, r#"{"ok":true}"#))
                .expect("healthy gateway");

        assert_eq!(
            report,
            GatewayHealthReport {
                endpoint: DEFAULT_GATEWAY_HTTP_URL.to_string(),
                status: 200,
                observation: GatewayHealthObservation::OkTrue,
            }
        );
    }

    #[test]
    fn rejects_non_local_gateway_health_endpoint() {
        let endpoint = parse_http_endpoint("http://morgan.example.com:8080").expect("parse");

        let error =
            assert_gateway_health_response(&endpoint, &http_response(200, r#"{"ok":true}"#))
                .expect_err("non-local endpoint rejected");

        assert!(error.contains("not an allowed local/kind Morgan gateway host"));
    }

    #[test]
    fn accepts_openclaw_doctor_json_output() {
        let report = assert_openclaw_doctor_output(
            r#"{"ok":true,"checks":[{"name":"config","success":true}],"errors":[]}"#,
        )
        .expect("doctor json accepted");

        assert_eq!(
            report,
            DoctorOutputReport {
                format: DoctorOutputFormat::Json,
                lines: 1,
            }
        );
    }

    #[test]
    fn rejects_openclaw_doctor_text_failure() {
        let error = assert_openclaw_doctor_output("config ok\nmodels failed: missing key\n")
            .expect_err("doctor text failure rejected");

        assert!(error.contains("models failed"));
    }

    #[test]
    fn allows_doctor_text_missing_external_api_keys() {
        let report = assert_openclaw_doctor_output(
            "config ok\nprovider warning: missing api key for optional model provider\n",
        )
        .expect("missing external provider key warning is allowed");

        assert_eq!(report.format, DoctorOutputFormat::Text);
    }

    #[test]
    fn accepts_raw_stream_jsonl() {
        let report = assert_raw_stream_jsonl(
            r#"{"type":"gateway","message":"started"}
{"type":"health","ok":true}
"#,
        )
        .expect("jsonl accepted");

        assert_eq!(report, RawStreamReport { events: 2 });
    }

    #[test]
    fn rejects_invalid_raw_stream_jsonl() {
        let error =
            assert_raw_stream_jsonl("{\"type\":\"gateway\"}\nnot json\n").expect_err("invalid");

        assert!(error.contains("line 2"));
    }

    #[test]
    fn parses_qdrant_http_endpoint_with_base_path() {
        let endpoint =
            parse_http_endpoint("http://localhost:8080/qdrant/").expect("parse endpoint");

        assert_eq!(
            endpoint,
            HttpEndpoint {
                original: "http://localhost:8080/qdrant/".to_string(),
                host: "localhost".to_string(),
                port: 8080,
                base_path: "/qdrant".to_string(),
            }
        );
        assert_eq!(
            endpoint_request_path(&endpoint, "/healthz"),
            "/qdrant/healthz"
        );
    }

    #[test]
    fn parses_bracketed_ipv6_qdrant_endpoint() {
        let endpoint = parse_http_endpoint("http://[::1]:6333").expect("parse endpoint");

        assert_eq!(endpoint.host, "::1");
        assert_eq!(endpoint.port, 6333);
        assert_eq!(
            http_host_header(&endpoint.host, endpoint.port),
            "[::1]:6333"
        );
    }

    #[test]
    fn rejects_non_http_qdrant_endpoint() {
        let error = parse_http_endpoint("https://localhost:6333").expect_err("https rejected");

        assert!(error.contains("expects http://"));
    }

    #[test]
    fn accepts_expected_qdrant_render_config() {
        let report =
            assert_qdrant_render_config(sample_qdrant_rendered_yaml()).expect("valid qdrant");

        assert_eq!(
            report,
            QdrantRenderReport {
                namespace: EXPECTED_QDRANT_NAMESPACE.to_string(),
                http_port: EXPECTED_QDRANT_PORT,
                grpc_port: EXPECTED_QDRANT_GRPC_PORT,
                telemetry_disabled: true,
                ingress_host: "localhost".to_string(),
            }
        );
    }

    #[test]
    fn accepts_expected_hermes_coderun_preflight() {
        let report = assert_hermes_coderun_preflight(sample_hermes_coderun_preflight_yaml())
            .expect("valid Hermes CodeRun preflight");

        assert_eq!(
            report,
            HermesCodeRunPreflightReport {
                namespace: EXPECTED_CTO_NAMESPACE.to_string(),
                coderun_name: EXPECTED_HERMES_CODERUN_NAME.to_string(),
                harness_agent: "hermes".to_string(),
            }
        );
    }

    #[test]
    fn rejects_hermes_coderun_preflight_without_hermes_crd_enum() {
        let rendered = sample_hermes_coderun_preflight_yaml().replace("- hermes", "- rex");

        let error = assert_hermes_coderun_preflight(&rendered).expect_err("missing enum rejected");

        assert!(error.contains(r#"CodeRun CRD missing line "- hermes""#));
    }

    #[test]
    fn rejects_qdrant_render_without_disabled_telemetry() {
        let rendered = sample_qdrant_rendered_yaml().replace(
            "QDRANT__TELEMETRY_DISABLED\n              value: \"true\"",
            "QDRANT__TELEMETRY_DISABLED\n              value: \"false\"",
        );

        let error = assert_qdrant_render_config(&rendered).expect_err("telemetry mismatch");

        assert!(error.contains("QDRANT__TELEMETRY_DISABLED"));
        assert!(error.contains("expected \"true\" but found \"false\""));
    }

    #[test]
    fn accepts_expected_qdrant_http_responses() {
        let endpoint = parse_http_endpoint(DEFAULT_QDRANT_HTTP_URL).expect("parse endpoint");
        let report = assert_qdrant_http_responses(
            &endpoint,
            &http_response(200, "healthz check passed"),
            &http_response(200, "all shards are ready"),
            &http_response(
                200,
                r#"{"status":"ok","result":{"app":{"name":"qdrant","version":"v1.17.1"},"config":{"telemetry_disabled":true}}}"#,
            ),
        )
        .expect("healthy qdrant");

        assert_eq!(
            report,
            QdrantHttpReport {
                endpoint: DEFAULT_QDRANT_HTTP_URL.to_string(),
                health_status: 200,
                ready_status: 200,
                telemetry_status: 200,
                telemetry_disabled: TelemetryDisabledObservation::ExposedTrue,
            }
        );
    }

    #[test]
    fn accepts_qdrant_telemetry_when_disabled_field_is_not_exposed() {
        let endpoint = parse_http_endpoint(DEFAULT_QDRANT_HTTP_URL).expect("parse endpoint");
        let report = assert_qdrant_http_responses(
            &endpoint,
            &http_response(200, "healthz check passed"),
            &http_response(200, "all shards are ready"),
            &http_response(200, r#"{"status":"ok","result":{"app":{"name":"qdrant"}}}"#),
        )
        .expect("healthy qdrant");

        assert_eq!(
            report.telemetry_disabled,
            TelemetryDisabledObservation::NotExposed
        );
    }

    #[test]
    fn rejects_non_local_qdrant_http_endpoint() {
        let endpoint = parse_http_endpoint("http://qdrant.example.com:6333").expect("parse");

        let error = assert_qdrant_http_responses(
            &endpoint,
            &http_response(200, "healthz check passed"),
            &http_response(200, "all shards are ready"),
            &http_response(200, r#"{"status":"ok","result":{"app":{"name":"qdrant"}}}"#),
        )
        .expect_err("non-local endpoint rejected");

        assert!(error.contains("not an allowed local/kind Qdrant host"));
    }

    #[test]
    fn rejects_unready_qdrant_http_response() {
        let endpoint = parse_http_endpoint(DEFAULT_QDRANT_HTTP_URL).expect("parse endpoint");

        let error = assert_qdrant_http_responses(
            &endpoint,
            &http_response(200, "healthz check passed"),
            &http_response(503, "some shards are not ready"),
            &http_response(200, r#"{"status":"ok","result":{"app":{"name":"qdrant"}}}"#),
        )
        .expect_err("unready response rejected");

        assert!(error.contains("Qdrant /readyz expected 2xx status"));
    }

    #[test]
    fn parses_chunked_http_response() {
        let response = parse_http_response(
            "HTTP/1.1 200 OK\r\ntransfer-encoding: chunked\r\n\r\n7\r\nhealthz\r\n0\r\n\r\n",
        )
        .expect("parse chunked response");

        assert_eq!(response.status, 200);
        assert_eq!(response.body, "healthz");
    }

    fn sample_rendered_yaml() -> &'static str {
        r#"
---
apiVersion: v1
kind: Service
metadata:
  name: morgan
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: check-agent-config
data:
  openclaw.json: |
    {
      "plugins": {
        "entries": {
          "memory-core": { "enabled": false },
          "openclaw-mem0": {
            "enabled": true,
            "config": {
              "customCategories": ["project"],
              "customInstructions": "Keep cto-app memories concise.",
              "metadataSource": "desktop",
              "oss": {
                "vectorStore": {
                  "config": {
                    "host": "qdrant.cto-system.svc.cluster.local",
                    "port": 6333,
                    "collectionName": "cto_memory"
                  }
                }
              }
            }
          }
        },
        "slots": { "memory": "openclaw-mem0" },
        "load": {
          "paths": [
            "/workspace/.openclaw/extensions/openclaw-mem0/node_modules/@mem0/openclaw-mem0"
          ]
        }
      }
    }
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: later-config
"#
    }

    fn sample_qdrant_rendered_yaml() -> &'static str {
        r#"
---
apiVersion: v1
kind: Service
metadata:
  name: qdrant
  namespace: cto-system
spec:
  type: ClusterIP
  ports:
    - name: http
      port: 6333
      targetPort: http
      protocol: TCP
    - name: grpc
      port: 6334
      targetPort: grpc
      protocol: TCP
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: qdrant
  namespace: cto-system
spec:
  serviceName: qdrant
  template:
    spec:
      containers:
        - name: qdrant
          image: "qdrant/qdrant:v1.17.1"
          ports:
            - name: http
              containerPort: 6333
            - name: grpc
              containerPort: 6334
          env:
            - name: QDRANT__SERVICE__GRPC_PORT
              value: "6334"
            - name: QDRANT__SERVICE__HTTP_PORT
              value: "6333"
            - name: QDRANT__TELEMETRY_DISABLED
              value: "true"
          startupProbe:
            httpGet:
              path: "/healthz"
          readinessProbe:
            httpGet:
              path: "/readyz"
  volumeClaimTemplates:
    - spec:
        resources:
          requests:
            storage: "5Gi"
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: qdrant
  namespace: cto-system
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
    - host: "localhost"
      http:
        paths:
          - path: "/qdrant(/|$)(.*)"
            backend:
              service:
                name: qdrant
                port:
                  number: 6333
"#
    }

    fn sample_hermes_coderun_preflight_yaml() -> &'static str {
        r#"
---
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: coderuns.agents.platform
spec:
  group: agents.platform
  names:
    plural: coderuns
    kind: CodeRun
  versions:
    - name: v1
      subresources:
        status: {}
      schema:
        openAPIV3Schema:
          properties:
            spec:
              properties:
                harnessAgent:
                  type: string
                  enum:
                    - openclaw
                    - hermes
                  default: openclaw
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cto-controller
rules:
  - apiGroups: ["agents.platform"]
    resources: ["coderuns", "coderuns/status"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cto-controller
spec:
  template:
    spec:
      serviceAccountName: cto-controller
      containers:
        - name: controller
          envFrom:
            - secretRef:
                name: cto-agent-keys
          env:
            - name: AGENT_TEMPLATES_PATH
              value: "/app/templates"
---
apiVersion: agents.platform/v1
kind: CodeRun
metadata:
  name: hermes-coderun-smoke
  namespace: cto-system
  annotations:
    helm.sh/hook: test
spec:
  runType: documentation
  service: hermes-smoke
  repositoryUrl: https://github.com/5dlabs/cto-app
  docsRepositoryUrl: https://github.com/5dlabs/cto-app
  workingDirectory: "."
  githubApp: hermes-smoke
  harnessAgent: hermes
  enableDocker: false
  enableCodeServer: false
  quality: false
  security: false
  testing: false
  deployment: false
"#
    }

    fn sample_morgan_diagnostics_rendered_yaml() -> &'static str {
        r#"
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: morgan
  namespace: cto-system
spec:
  template:
    spec:
      initContainers:
        - name: init-workspace
          command:
            - /bin/sh
            - -c
            - |
              openclaw doctor --non-interactive >/dev/null 2>&1 || true
      containers:
        - name: agent
          env:
            - name: OPENCLAW_RAW_STREAM
              value: "1"
            - name: OPENCLAW_RAW_STREAM_PATH
              value: "/workspace/.openclaw/logs/raw-stream.jsonl"
            - name: OPENCLAW_DIAGNOSTICS
              value: "acp.*,gateway.session,session.*"
"#
    }

    fn sample_morgan_diagnostics_config() -> Value {
        json!({
            "logging": {
                "level": "debug",
                "file": EXPECTED_MORGAN_LOG_FILE,
                "consoleLevel": "debug"
            },
            "diagnostics": {
                "enabled": true,
                "flags": EXPECTED_MORGAN_DIAGNOSTIC_FLAGS
            },
            "wizard": {
                "lastRunCommand": "doctor",
                "lastRunMode": "local"
            }
        })
    }

    fn sample_openclaw_config() -> Value {
        json!({
            "plugins": {
                "entries": {
                    "memory-core": {
                        "enabled": false
                    },
                    "openclaw-mem0": {
                        "enabled": true,
                        "config": {
                            "customCategories": ["project", "decision"],
                            "customInstructions": "Capture durable CTO desktop context.",
                            "metadataSource": "desktop",
                            "oss": {
                                "vectorStore": {
                                    "config": {
                                        "host": EXPECTED_QDRANT_HOST,
                                        "port": EXPECTED_QDRANT_PORT,
                                        "collectionName": EXPECTED_COLLECTION
                                    }
                                }
                            }
                        }
                    }
                },
                "slots": {
                    "memory": "openclaw-mem0"
                },
                "load": {
                    "paths": [
                        "/workspace/.openclaw/extensions/openclaw-mem0/node_modules/@mem0/openclaw-mem0"
                    ]
                }
            }
        })
    }

    fn http_response(status: u16, body: &str) -> HttpResponse {
        HttpResponse {
            status,
            headers: Vec::new(),
            body: body.to_string(),
        }
    }

    fn value_at_path_mut<'a>(document: &'a mut Value, path: &str) -> Option<&'a mut Value> {
        let mut current = document;
        for segment in path.split('.') {
            current = match current {
                Value::Object(map) => map.get_mut(segment)?,
                Value::Array(items) => items.get_mut(segment.parse::<usize>().ok()?)?,
                _ => return None,
            };
        }
        Some(current)
    }
}
