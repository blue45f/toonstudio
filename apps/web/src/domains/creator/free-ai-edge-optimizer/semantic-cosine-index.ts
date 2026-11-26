/**
 * Tier 0A: 오프라인 256차원 코사인 시맨틱 카탈로그 검색기 (`catalog-semantic-index-256d.json` 호환).
 * 네트워크 호출 0회, 서버/클라우드 토큰 0개로 로컬 Float32Array 순수 내적(dot-product) 랭킹을 수행한다.
 */

export const SEMANTIC_VECTOR_DIM = 256;
export const DEFAULT_SEMANTIC_INDEX_FILENAME = "catalog-semantic-index-256d.json";

export interface CatalogSemanticIndexEntry {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly tags?: readonly string[];
  readonly vector: readonly number[] | Float32Array;
  readonly normalized?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CatalogSemanticIndex256d {
  readonly version?: string;
  readonly dimensions: number;
  readonly normalized?: boolean;
  readonly entries: readonly CatalogSemanticIndexEntry[];
}

export interface SemanticSearchOptions {
  readonly topK?: number;
  readonly minScore?: number;
  readonly category?: string;
}

export interface SemanticCatalogMatch {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly score: number;
  readonly tags: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

function assertVectorDim256(vector: readonly number[] | Float32Array, label: string): void {
  if (vector.length !== SEMANTIC_VECTOR_DIM) {
    throw new RangeError(`${label} 벡터 차원이 ${SEMANTIC_VECTOR_DIM}이 아닙니다 (실제: ${vector.length}).`);
  }
}

export function l2NormalizeVector256(vector: readonly number[] | Float32Array): Float32Array {
  assertVectorDim256(vector, "정규화 대상");
  const out = new Float32Array(SEMANTIC_VECTOR_DIM);
  let sumSq = 0;
  for (let i = 0; i < SEMANTIC_VECTOR_DIM; i += 1) {
    const val = vector[i];
    const safe = Number.isFinite(val) ? val : 0;
    out[i] = safe;
    sumSq += safe * safe;
  }
  if (sumSq <= 0) return out;
  const invNorm = 1 / Math.sqrt(sumSq);
  for (let i = 0; i < SEMANTIC_VECTOR_DIM; i += 1) {
    out[i] *= invNorm;
  }
  return out;
}

export function dotProduct256(
  a: readonly number[] | Float32Array,
  b: readonly number[] | Float32Array,
): number {
  assertVectorDim256(a, "좌측");
  assertVectorDim256(b, "우측");
  let sum = 0;
  for (let i = 0; i < SEMANTIC_VECTOR_DIM; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

export function cosineSimilarity256(
  a: readonly number[] | Float32Array,
  b: readonly number[] | Float32Array,
  alreadyNormalized = false,
): number {
  if (alreadyNormalized) {
    return Math.min(1, Math.max(-1, dotProduct256(a, b)));
  }
  assertVectorDim256(a, "좌측");
  assertVectorDim256(b, "우측");
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < SEMANTIC_VECTOR_DIM; i += 1) {
    const va = Number.isFinite(a[i]) ? a[i] : 0;
    const vb = Number.isFinite(b[i]) ? b[i] : 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA <= 0 || normB <= 0) return 0;
  return Math.min(1, Math.max(-1, dot / (Math.sqrt(normA) * Math.sqrt(normB))));
}

interface PackedEntryMeta {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * 사전 정규화된 연속 Float32Array 버퍼로 256차원 내적 검색을 수행하는 오프라인 카탈로그 인덱스.
 */
export class OfflineSemanticCatalogIndex {
  readonly version: string;
  readonly dimensions = SEMANTIC_VECTOR_DIM;
  private readonly flatVectors: Float32Array;
  private readonly items: readonly PackedEntryMeta[];

  constructor(index: CatalogSemanticIndex256d) {
    if (index.dimensions !== SEMANTIC_VECTOR_DIM) {
      throw new RangeError(
        `카탈로그 시맨틱 인덱스 차원이 ${SEMANTIC_VECTOR_DIM}이 아닙니다 (실제: ${index.dimensions}).`,
      );
    }
    this.version = index.version ?? "1";
    const count = index.entries.length;
    this.flatVectors = new Float32Array(count * SEMANTIC_VECTOR_DIM);
    const items: PackedEntryMeta[] = [];

    for (let idx = 0; idx < count; idx += 1) {
      const entry = index.entries[idx];
      const alreadyUnit = entry.normalized === true || index.normalized === true;
      const offset = idx * SEMANTIC_VECTOR_DIM;
      if (alreadyUnit) {
        assertVectorDim256(entry.vector, `인덱스 항목(${entry.id})`);
        for (let d = 0; d < SEMANTIC_VECTOR_DIM; d += 1) {
          const val = entry.vector[d];
          this.flatVectors[offset + d] = Number.isFinite(val) ? val : 0;
        }
      } else {
        this.flatVectors.set(l2NormalizeVector256(entry.vector), offset);
      }
      items.push({
        id: entry.id,
        title: entry.title,
        category: entry.category,
        tags: entry.tags ? [...entry.tags] : [],
        metadata: entry.metadata,
      });
    }
    this.items = items;
  }

  get size(): number {
    return this.items.length;
  }

  search(
    queryVector: readonly number[] | Float32Array,
    options: SemanticSearchOptions = {},
  ): readonly SemanticCatalogMatch[] {
    const queryUnit = l2NormalizeVector256(queryVector);
    const topK = Math.max(1, Math.trunc(options.topK ?? 5));
    const minScore = options.minScore ?? 0.35;
    const categoryFilter = options.category?.trim().toLowerCase() ?? "";
    const results: SemanticCatalogMatch[] = [];

    for (let idx = 0; idx < this.items.length; idx += 1) {
      const meta = this.items[idx];
      if (categoryFilter && meta.category.toLowerCase() !== categoryFilter) continue;
      const offset = idx * SEMANTIC_VECTOR_DIM;
      let dot = 0;
      for (let d = 0; d < SEMANTIC_VECTOR_DIM; d += 1) {
        dot += queryUnit[d] * this.flatVectors[offset + d];
      }
      const score = Math.min(1, Math.max(-1, dot));
      if (score >= minScore) {
        results.push({
          id: meta.id,
          title: meta.title,
          category: meta.category,
          score: Number(score.toFixed(6)),
          tags: meta.tags,
          metadata: meta.metadata,
        });
      }
    }

    results.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.id.localeCompare(b.id)));
    return results.slice(0, topK);
  }
}
