export type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
};

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 2000;
const DEFAULT_MAX_DELAY_MS = 15000;

export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: number }).status;
  if (status === 429 || status === 529) return true;
  if (typeof status === "number" && status >= 500) return true;
  const code = (error as { code?: string }).code;
  if (code === "ETIMEDOUT" || code === "ECONNRESET" || code === "ECONNABORTED") return true;
  const message = (error as { message?: string }).message ?? "";
  if (/rate.limit|too many requests|overloaded/i.test(message)) return true;
  return false;
}

export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: number }).status;
  if (status === 429 || status === 529) return true;
  const message = (error as { message?: string }).message ?? "";
  return /rate.limit|too many requests|overloaded/i.test(message);
}

function getRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const headers = (error as { headers?: Record<string, string> }).headers;
  const retryAfter = headers?.["retry-after"];
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return null;
}

function jitter(): number {
  return Math.random() * 1000;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelay = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelay = options?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries || !isRetryableError(error)) {
        throw error;
      }

      const retryAfter = getRetryAfterMs(error);
      const exponentialDelay = baseDelay * Math.pow(2, attempt) + jitter();
      const delayMs = Math.min(retryAfter ?? exponentialDelay, maxDelay);

      options?.onRetry?.(
        attempt + 1,
        error instanceof Error ? error : new Error(String(error)),
        delayMs,
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
