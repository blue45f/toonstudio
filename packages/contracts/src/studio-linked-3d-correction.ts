/** 페이지 소유 보정 획의 제한된 출처 형식이다. 관계 권한은 기존 페이지 검증이 소유한다. */
export interface StudioLinked3dCorrectionProvenance {
  readonly kind: "toonstudio.linked-3d-correction";
  readonly version: 1;
  readonly bundleId: string;
  readonly pass: "line";
  readonly sourcePassRevision: number;
  readonly sourceHash: `sha256:${string}`;
  readonly baseGeometryHash: `sha256:${string}`;
  readonly topologyHash: `sha256:${string}`;
  readonly objectIdentityHash: `sha256:${string}`;
  readonly basePassRootHash: `sha256:${string}`;
}
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:~-]{0,127}$/u;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function safeId(value: unknown): string | null {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value)
    && !["__proto__", "constructor", "prototype"].includes(value.toLowerCase()) ? value : null;
}
function safeHash(value: unknown): `sha256:${string}` | null {
  return typeof value === "string" && SHA256_PATTERN.test(value) ? value as `sha256:${string}` : null;
}
function safeRevision(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : null;
}
export function parseStudioLinked3dCorrectionProvenance(
  value: unknown,
): StudioLinked3dCorrectionProvenance | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "kind",
    "version",
    "bundleId",
    "pass",
    "sourcePassRevision",
    "sourceHash",
    "baseGeometryHash",
    "topologyHash",
    "objectIdentityHash",
    "basePassRootHash",
  ])) return null;
  const bundleId = safeId(value.bundleId);
  const sourcePassRevision = safeRevision(value.sourcePassRevision);
  const sourceHash = safeHash(value.sourceHash);
  const baseGeometryHash = safeHash(value.baseGeometryHash);
  const topologyHash = safeHash(value.topologyHash);
  const objectIdentityHash = safeHash(value.objectIdentityHash);
  const basePassRootHash = safeHash(value.basePassRootHash);
  if (
    value.kind !== "toonstudio.linked-3d-correction"
    || value.version !== 1
    || value.pass !== "line"
    || !bundleId
    || !sourcePassRevision
    || !sourceHash
    || !baseGeometryHash
    || !topologyHash
    || !objectIdentityHash
    || !basePassRootHash
  ) return null;
  return Object.freeze({
    kind: "toonstudio.linked-3d-correction",
    version: 1,
    bundleId,
    pass: "line",
    sourcePassRevision,
    sourceHash,
    baseGeometryHash,
    topologyHash,
    objectIdentityHash,
    basePassRootHash,
  });
}
