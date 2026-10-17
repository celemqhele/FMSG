/**
 * Server-side log helpers.
 *
 * Created 2026-10-17 after the production search logs showed `[DITTO] EXCEPTION:
 * [object Object]` and `[BRIGHTDATA] EXCEPTION: [object Object]`: those call sites used
 * `err instanceof Error ? err.message : String(err)`, and `String()` on a thrown plain
 * object (SDK/HTTP errors, Puppeteer launch failures) yields the useless literal
 * `[object Object]`. Anything swallowed here is invisible in Vercel runtime logs, and
 * background work (fire-and-forget promises, late source results) is exactly the part
 * that cannot be re-derived later — so it must be serialized, never stringified blindly.
 *
 * Usage:
 *   console.error(`[DITTO] EXCEPTION: ${serializeError(err)}`);
 */

/** JSON.stringify that survives circular references and never throws. */
export function safeJson(value: unknown, maxLen = 400): string {
  const seen = new WeakSet<object>();
  try {
    const out = JSON.stringify(value, (_key, val) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[circular]";
        seen.add(val);
      }
      if (typeof val === "function") return "[fn]";
      if (typeof val === "bigint") return `${val}n`;
      return val;
    });
    if (out === undefined) return "";
    return out.length > maxLen ? `${out.slice(0, maxLen)}…` : out;
  } catch {
    return "";
  }
}

function firstUsefulFrame(err: Error): string {
  const stack = err.stack ?? "";
  const frame = stack
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("at ") && !l.includes("node:internal") && !l.includes("node_modules"));
  return frame ?? "";
}

function describe(err: unknown, depth: number): string {
  if (err === null) return "null";
  if (err === undefined) return "undefined";
  if (typeof err === "string") return err;
  if (typeof err !== "object") return String(err);

  const anyErr = err as Record<string, unknown>;

  // Real Error (including subclasses that carry extra fields)
  if (err instanceof Error) {
    const parts = [`${err.name}: ${err.message}`];
    if (anyErr.code !== undefined) parts.push(`code=${String(anyErr.code)}`);
    const frame = firstUsefulFrame(err);
    if (frame) parts.push(frame);
    if (anyErr.cause !== undefined && depth < 2) {
      parts.push(`cause=${describe(anyErr.cause, depth + 1)}`);
    }
    return parts.join(" | ");
  }

  // SDK / HTTP-ish plain objects (Supabase PostgrestError, fetch wrappers, Puppeteer errors)
  const bits: string[] = [];
  if (typeof anyErr.name === "string") bits.push(`name=${anyErr.name}`);
  if (typeof anyErr.message === "string") bits.push(`message=${anyErr.message}`);
  const status = anyErr.status ?? anyErr.statusCode;
  if (status !== undefined) bits.push(`status=${String(status)}`);
  if (typeof anyErr.statusText === "string") bits.push(`statusText=${anyErr.statusText}`);
  if (anyErr.code !== undefined) bits.push(`code=${String(anyErr.code)}`);
  if (anyErr.details !== undefined) bits.push(`details=${safeJson(anyErr.details, 200)}`);
  if (anyErr.hint !== undefined) bits.push(`hint=${safeJson(anyErr.hint, 120)}`);

  if (bits.length > 0) {
    const raw = safeJson(err, 300);
    return raw ? `{${bits.join(", ")}} raw=${raw}` : `{${bits.join(", ")}}`;
  }

  const json = safeJson(err, 400);
  if (json) return json;
  return Object.prototype.toString.call(err);
}

/**
 * Turn anything thrown into a single useful log line.
 * Errors → `Name: message | code | at frame | cause=…`
 * Plain objects → `{message=…, status=…} raw={…}`
 * Never returns `[object Object]`.
 */
export function serializeError(err: unknown, maxLen = 300): string {
  const text = describe(err, 0);
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

/**
 * Fire-and-forget promise logger. Vercel may finish the invocation (and freeze the
 * function) before un-awaited work settles, so a rejection here would otherwise be an
 * invisible unhandled rejection. Returns the promise so callers can still await it.
 */
export function trackBackground<T>(label: string, promise: PromiseLike<T>): Promise<T | undefined> {
  return Promise.resolve(promise).then(
    (value) => value as T,
    (err) => {
      console.warn(`[BACKGROUND] ${label} failed: ${serializeError(err)}`);
      return undefined;
    },
  );
}
