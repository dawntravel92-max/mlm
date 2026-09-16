export type ProviderName = "ESPN" | "TheSportsDB";

export type CircuitState = {
  provider: ProviderName;
  state: "closed" | "open" | "half-open";
  consecutiveFailures: number;
  openedAt: string | null;
  nextRetryAt: string | null;
};

export type ResilientRequestOptions = {
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  circuitFailureThreshold?: number;
  circuitCooldownMs?: number;
};

const pending = new Map<string, Promise<unknown>>();
const circuits = new Map<
  ProviderName,
  {
    failures: number;
    openedAt: number | null;
    halfOpenProbe: boolean;
  }
>();

function circuitFor(provider: ProviderName) {
  const current = circuits.get(provider);
  if (current) return current;
  const created = {
    failures: 0,
    openedAt: null as number | null,
    halfOpenProbe: false,
  };
  circuits.set(provider, created);
  return created;
}

export function resetReliabilityState() {
  pending.clear();
  circuits.clear();
}

export function getCircuitState(
  provider: ProviderName,
  now = Date.now(),
  cooldownMs = 60_000
): CircuitState {
  const current = circuitFor(provider);
  const isOpen =
    current.openedAt !== null && now - current.openedAt < cooldownMs;
  const state = isOpen
    ? "open"
    : current.openedAt !== null
      ? "half-open"
      : "closed";
  return {
    provider,
    state,
    consecutiveFailures: current.failures,
    openedAt: current.openedAt
      ? new Date(current.openedAt).toISOString()
      : null,
    nextRetryAt: isOpen
      ? new Date(current.openedAt! + cooldownMs).toISOString()
      : null,
  };
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  parentSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`request timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  let rejectAbort: ((reason?: unknown) => void) | undefined;
  const callerAbort = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    controller.abort();
    rejectAbort?.(new DOMException("The operation was aborted", "AbortError"));
  };
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener("abort", abort, { once: true });
  try {
    return await Promise.race([work(controller.signal), timeout, callerAbort]);
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abort);
  }
}

/**
 * Run one provider request with bounded retries and a provider-scoped circuit.
 * Requests with the same dedupe key share one in-flight promise.
 */
export async function resilientRequest<T>(
  provider: ProviderName,
  dedupeKey: string,
  work: (signal: AbortSignal) => Promise<T>,
  options: ResilientRequestOptions = {},
  parentSignal?: AbortSignal
): Promise<T> {
  const existing = pending.get(dedupeKey);
  if (existing) {
    // A caller may cancel its own wait; never pass its signal into the shared request.
    if (!parentSignal) return existing as Promise<T>;
    return await Promise.race([
      existing as Promise<T>,
      new Promise<never>((_, reject) => {
        if (parentSignal.aborted)
          reject(new DOMException("The operation was aborted", "AbortError"));
        else
          parentSignal.addEventListener(
            "abort",
            () =>
              reject(
                new DOMException("The operation was aborted", "AbortError")
              ),
            { once: true }
          );
      }),
    ]);
  }

  const timeoutMs = options.timeoutMs ?? 12_000;
  const retries = options.retries ?? (provider === "ESPN" ? 2 : 1);
  const backoffMs = options.backoffMs ?? (provider === "ESPN" ? 250 : 400);
  const failureThreshold = options.circuitFailureThreshold ?? 3;
  const cooldownMs = options.circuitCooldownMs ?? 60_000;
  const circuit = circuitFor(provider);
  const currentState = getCircuitState(provider, Date.now(), cooldownMs);
  if (currentState.state === "open") {
    throw new Error(
      `${provider} circuit open until ${currentState.nextRetryAt}`
    );
  }
  if (currentState.state === "half-open") {
    if (circuit.halfOpenProbe)
      throw new Error(`${provider} circuit half-open probe in progress`);
    circuit.halfOpenProbe = true;
  }

  const request = (async () => {
    let lastError: unknown;
    try {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          const value = await withTimeout(work, timeoutMs);
          circuit.failures = 0;
          circuit.openedAt = null;
          return value;
        } catch (error) {
          lastError = error;
          if (attempt < retries) await sleep(backoffMs * 2 ** attempt);
        }
      }
      circuit.failures += 1;
      if (circuit.failures >= failureThreshold) circuit.openedAt = Date.now();
      throw lastError instanceof Error
        ? lastError
        : new Error(`${provider} request failed`);
    } finally {
      circuit.halfOpenProbe = false;
    }
  })();
  pending.set(dedupeKey, request as Promise<unknown>);
  try {
    return await request;
  } finally {
    pending.delete(dedupeKey);
  }
}

export function providerOperationalStatus(
  provider: ProviderName,
  lastRun: {
    status?: string | null;
    latencyMs?: number | null;
    completedAt?: Date | string | null;
    error?: string | null;
  } | null,
  now = Date.now()
) {
  const circuit = getCircuitState(provider, now);
  const lastCheckedAt = lastRun?.completedAt
    ? new Date(lastRun.completedAt).toISOString()
    : null;
  return {
    provider,
    status:
      circuit.state === "open"
        ? "outage"
        : lastRun?.status === "success"
          ? "operational"
          : lastRun
            ? "degraded"
            : "standby",
    circuit: circuit.state,
    latencyMs: lastRun?.latencyMs ?? null,
    lastCheckedAt,
    error:
      lastRun?.error ??
      (circuit.state === "open" ? "Circuit breaker open" : null),
  } as const;
}
