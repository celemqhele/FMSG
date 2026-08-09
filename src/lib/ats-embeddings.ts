// ============================================================
// ATS semantic embeddings (Phase 2)
// Dense bi-encoder embeddings fused with the deterministic
// Phase 1 lexical scorer via Reciprocal Rank Fusion (RRF).
// Runs fully local (transformers.js WASM/onnx) — zero API cost.
// Gracefully degrades to pure lexical scoring if the model
// fails to load or the request is near the Vercel deadline.
// ============================================================

// Dynamic import keeps the transformers.js runtime (onnx wasm/native) out of the
// main API bundle; it's resolved at runtime via serverExternalPackages.
export const EMBEDDING_MODEL = "Xenova/bge-base-en-v1.5";
export const EMBEDDING_DIM = 768;

let embedderPromise: Promise<any> | null = null;
let embedderFailed = false;

export function embeddingEnabled(): boolean {
  return process.env.ATS_EMBEDDINGS !== "false";
}

async function getEmbedder(): Promise<any> {
  if (embedderPromise) return embedderPromise;
  embedderPromise = (async () => {
    const { pipeline, env } = await import("@xenova/transformers");
    // Download model from HuggingFace Hub at runtime; never search local paths
    env.allowLocalModels = false;
    return pipeline("feature-extraction", EMBEDDING_MODEL, { quantized: true });
  })().catch((err) => {
    embedderFailed = true;
    embedderPromise = null;
    throw err;
  });
  return embedderPromise;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[EMBEDDING] ${label} exceeded ${ms}ms`)), ms)
    ),
  ]);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Embed a list of texts into normalized dense vectors.
 * Returns null on failure/timeout/disabled so callers fall back to lexical-only.
 */
export async function embedTexts(
  texts: string[],
  opts?: { timeoutMs?: number; maxLength?: number; maxBatch?: number }
): Promise<number[][] | null> {
  if (!embeddingEnabled()) return null;
  const maxBatch = opts?.maxBatch ?? 64;
  const maxLength = opts?.maxLength ?? 1500;
  const timeoutMs = opts?.timeoutMs ?? 30_000;
  const clean = (texts ?? []).slice(0, 256).map((t) => (t ?? "").slice(0, maxLength));
  if (clean.length === 0) return null;

  try {
    const extractor = await withTimeout(getEmbedder(), timeoutMs, "model load");
    const vectors: number[][] = [];
    for (let start = 0; start < clean.length; start += maxBatch) {
      const chunk = clean.slice(start, start + maxBatch);
      const output: any = await withTimeout(
        extractor(chunk, { pooling: "mean", normalize: true }),
        timeoutMs,
        "batch inference"
      );
      // output.dims = [batch, 768], output.data = Float32Array(batch*768)
      const batch = output.dims?.[0] ?? chunk.length;
      const dim = output.dims?.[1] ?? EMBEDDING_DIM;
      for (let i = 0; i < batch; i++) {
        vectors.push(Array.from(output.data.subarray(i * dim, (i + 1) * dim)));
      }
    }
    return vectors;
  } catch (err) {
    if (!embedderFailed) {
      console.warn(`[EMBEDDING] Unavailable, falling back to lexical-only: ${(err as Error).message?.slice(0, 200)}`);
    }
    return null;
  }
}

/**
 * Reciprocal Rank Fusion over two rank lists (per-job rank positions).
 * rrf = sum( 1 / (k + rank) ). Higher = better. k=60 per industry standard.
 */
export function reciprocalRankFusion(
  lexRanks: number[],
  denseRanks: number[],
  k = 60
): number[] {
  const n = Math.min(lexRanks.length, denseRanks.length);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(1 / (k + (lexRanks[i] ?? n)) + 1 / (k + (denseRanks[i] ?? n)));
  }
  return out;
}

/**
 * Build the candidate profile embedding text (titles + industry + CV text).
 */
export function buildCandidateText(opts: {
  titles: string[];
  industry: string;
  cvText: string;
}): string {
  const parts: string[] = [];
  if (opts.titles?.length) parts.push(`Target roles: ${opts.titles.join(", ")}`);
  if (opts.industry) parts.push(`Industry: ${opts.industry}`);
  if (opts.cvText?.trim()) parts.push(opts.cvText.trim());
  return parts.join("\n").slice(0, 4000);
}

/**
 * Build the per-job embedding text (title + company + location + spec).
 */
export function buildJobText(job: {
  title?: string;
  company?: string;
  location?: string;
  spec?: string;
}): string {
  const parts: string[] = [];
  if (job.title) parts.push(`Job title: ${job.title}`);
  if (job.company) parts.push(`Company: ${job.company}`);
  if (job.location) parts.push(`Location: ${job.location}`);
  if (job.spec?.trim()) parts.push(job.spec.trim());
  return parts.join("\n").slice(0, 1500);
}
