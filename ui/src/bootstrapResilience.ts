const TRANSIENT_BOOTSTRAP_NEEDLES = [
  "timed out waiting for the condition",
  "timed out",
  "timeout",
  "context deadline exceeded",
  "i/o timeout",
  "tls handshake timeout",
  "temporary failure in name resolution",
  "connection reset by peer",
  "connection refused",
  "was refused",
  "service unavailable",
  "server unavailable",
  "no route to host",
  "eof",
  "broken pipe",
  "network is unreachable",
  "dns error",
  "operation timed out",
  "error sending request",
  "connection closed before message completed",
  "502 bad gateway",
  "503 service unavailable",
  "504 gateway timeout",
  "429 too many requests",
  "couldn't connect to server",
  "transient failure",
  "still working",
] as const;

export function isTransientBootstrapError(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;
  return TRANSIENT_BOOTSTRAP_NEEDLES.some((needle) => normalized.includes(needle));
}

export function bootstrapStillWorkingMessage(stage?: string): string {
  if (stage?.trim()) {
    return `Still working on ${stage.trim()}...`;
  }
  return "Still working...";
}

export function formatBootstrapFailureMessage(error: unknown, stage?: string): string {
  const message = String(error);
  if (isTransientBootstrapError(message)) {
    return bootstrapStillWorkingMessage(stage);
  }
  return message;
}

export function shouldSuppressBootstrapError(
  error: unknown,
  active: boolean,
): boolean {
  return active && isTransientBootstrapError(String(error));
}
