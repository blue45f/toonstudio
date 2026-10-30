import buildRelease from "./studio-bg3d-bundle-release.generated.json";

export interface StudioBg3dBundleReleaseObject {
  readonly url: string;
  readonly sha256: string;
  readonly bytes: number;
}
export interface StudioBg3dBundleReleaseDescriptor {
  readonly schema: "toonstudio.bg3d-bundle-release.v1";
  readonly version: 1;
  readonly catalog: StudioBg3dBundleReleaseObject;
  readonly index: StudioBg3dBundleReleaseObject;
}
/** JSON만 제공하는 기존 custom URL 포트는 유지하고 release 로드에는 원문 body를 요구한다. */
export type StudioBg3dBundleResponse = Pick<Response, "ok" | "status" | "json">
  & Partial<Pick<Response, "body" | "headers" | "redirected" | "url">>;

const ROOT = "/assets/3d/environments/bundle-v1/";
const LIMITS = { catalog: 32 * 1024 * 1024, index: 1024 * 1024 } as const;
const SHA = /^[a-f0-9]{64}$/u;
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function objectBinding(value: unknown, kind: "catalog" | "index"): StudioBg3dBundleReleaseObject {
  const input = record(value), prefix = kind === "catalog" ? "theme-packs" : "deploy-index";
  if (!input || !exactKeys(input, ["url", "sha256", "bytes"])
    || typeof input.sha256 !== "string" || !SHA.test(input.sha256)
    || typeof input.bytes !== "number" || !Number.isSafeInteger(input.bytes) || input.bytes <= 0 || input.bytes > LIMITS[kind]
    || typeof input.url !== "string" || input.url !== `${ROOT}${prefix}.${input.sha256}.json`) {
    throw new TypeError("번들 release의 경로·SHA·바이트 계약이 올바르지 않습니다. 검증된 원문으로 release 파일을 다시 생성하세요.");
  }
  return Object.freeze({ url: input.url, sha256: input.sha256, bytes: input.bytes });
}
export function requireStudioBg3dBundleRelease(value: unknown): StudioBg3dBundleReleaseDescriptor {
  const input = record(value);
  if (!input || !exactKeys(input, ["schema", "version", "catalog", "index"])
    || input.schema !== "toonstudio.bg3d-bundle-release.v1" || input.version !== 1) {
    throw new TypeError("번들 release 스키마가 올바르지 않습니다. 같은 빌드의 release 파일을 사용하세요.");
  }
  return Object.freeze({ schema: "toonstudio.bg3d-bundle-release.v1", version: 1,
    catalog: objectBinding(input.catalog, "catalog"), index: objectBinding(input.index, "index") });
}
/** 웹 빌드에 고정된 값이다. 실제 후보 원문으로 생성한 JSON을 빌드 전에 넣는다. */
export function getBuildFixedStudioBg3dBundleRelease(): StudioBg3dBundleReleaseDescriptor {
  return requireStudioBg3dBundleRelease(buildRelease);
}

async function boundedReleaseBytes(response: StudioBg3dBundleResponse, binding: StudioBg3dBundleReleaseObject, signal?: AbortSignal) {
  if (!response.ok || response.redirected || !response.body) {
    throw new TypeError("번들 release 원문 응답을 읽을 수 없습니다. 같은 출처의 검증된 JSON 배포를 확인하세요.");
  }
  const length = response.headers?.get("content-length");
  const encoding = response.headers?.get("content-encoding");
  // 브라우저 body는 압축 해제된 원문이다. 전송 압축 길이를 원문 길이와 비교하지 않는다.
  if ((!encoding || encoding.toLowerCase() === "identity") && length !== null && length !== undefined
    && (!/^\d+$/u.test(length) || Number(length) !== binding.bytes)) {
    throw new TypeError("번들 release 응답의 바이트 길이가 다릅니다.");
  }
  const contentType = response.headers?.get("content-type");
  if (contentType && !/^application\/json(?:\s*;|$)/iu.test(contentType)) throw new TypeError("번들 release가 JSON 응답이 아닙니다.");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let count = 0, complete = false;
  try {
    while (true) {
      signal?.throwIfAborted();
      const next = await reader.read();
      if (next.done) { complete = true; break; }
      count += next.value.byteLength;
      if (count > binding.bytes) throw new TypeError("번들 release 원문이 고정 바이트 길이를 넘었습니다.");
      chunks.push(next.value);
    }
  } finally {
    try { if (!complete) await reader.cancel(); } finally { reader.releaseLock(); }
  }
  if (count !== binding.bytes) throw new TypeError("번들 release 원문 바이트 길이가 일치하지 않습니다.");
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

/** json() 재직렬화 대신 수신 원문 바이트를 확인한 뒤 parse한다. */
export async function readVerifiedStudioBg3dBundleReleaseJson(
  response: StudioBg3dBundleResponse, binding: StudioBg3dBundleReleaseObject, signal?: AbortSignal,
): Promise<unknown> {
  const bytes = await boundedReleaseBytes(response, binding, signal);
  const checksum = await crypto.subtle.digest("SHA-256", bytes);
  const actual = [...new Uint8Array(checksum)].map(value => value.toString(16).padStart(2, "0")).join("");
  signal?.throwIfAborted();
  if (actual !== binding.sha256) throw new TypeError("번들 release 원문 SHA가 다릅니다. 배포한 JSON과 같은 빌드의 release를 확인하세요.");
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new TypeError("번들 release 원문이 올바른 UTF-8 JSON이 아닙니다. 원문 산출물을 다시 생성하세요."); }
}
