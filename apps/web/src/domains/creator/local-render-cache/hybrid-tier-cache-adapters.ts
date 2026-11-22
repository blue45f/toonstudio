/**
 * 3계층 하이브리드 캐시용 해시·저장소·원격 조회 어댑터 모음.
 * - 순수 FIPS 180-4 SHA-256 + Web Crypto 다이제스트
 * - L2 OPFS(Origin Private File System), IndexedDB, 인메모리 폴백 어댑터
 * - L3 R2 불변 콘텐츠 주소 URL 빌더 및 Fetch 어댑터
 */

export interface CachedAssetRecord {
  readonly sha256: string;
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly createdAtMs: number;
  readonly lastAccessedAtMs: number;
}

export interface PersistentCacheEntryMetadata {
  readonly sha256: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly createdAtMs: number;
  readonly lastAccessedAtMs: number;
}

export interface PersistentCacheTierAdapter {
  readonly kind: "opfs" | "indexeddb" | "memory";
  readonly get: (sha256: string) => Promise<CachedAssetRecord | null>;
  readonly put: (record: CachedAssetRecord) => Promise<void>;
  readonly touch: (sha256: string, accessedAtMs: number) => Promise<void>;
  readonly delete: (sha256: string) => Promise<boolean>;
  readonly listMetadata: () => Promise<readonly PersistentCacheEntryMetadata[]>;
  readonly clear: () => Promise<void>;
}

export interface RemoteHashFetchRequest {
  readonly sha256: string;
  readonly url: string;
  readonly signal?: AbortSignal;
}

export interface RemoteHashFetchResponse {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

export interface RemoteHashAssetFetcher {
  readonly fetchByHash: (request: RemoteHashFetchRequest) => Promise<RemoteHashFetchResponse>;
}

export class HybridCacheValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HybridCacheValidationError";
  }
}

export class HybridCacheFetchError extends Error {
  readonly sha256: string;
  readonly url: string;

  constructor(sha256: string, url: string, detail: string) {
    super(`L3 R2 에셋 조회 실패(${sha256.slice(0, 12)}): ${detail}`);
    this.name = "HybridCacheFetchError";
    this.sha256 = sha256;
    this.url = url;
  }
}

const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) {
    out += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return out;
}

/** Web Crypto 미지원 환경에서도 동일 다이제스트를 생성하는 FIPS 180-4 순수 SHA-256 구현. */
export function sha256PureHex(bytes: Uint8Array): string {
  const bitLenHi = Math.floor((bytes.length * 8) / 0x100000000);
  const bitLenLo = (bytes.length * 8) >>> 0;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, bitLenHi, false);
  view.setUint32(paddedLength - 4, bitLenLo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}

/** 바이너리 에셋의 소문자 64자리 SHA-256 해시를 계산한다. */
export async function computeAssetSha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.subtle?.digest === "function") {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer);
    return bytesToHex(new Uint8Array(digest));
  }
  return sha256PureHex(bytes);
}

export function normalizeSha256Hex(rawHash: string): string {
  const normalized = rawHash.trim().toLowerCase();
  if (!SHA256_HEX_REGEX.test(normalized)) {
    throw new HybridCacheValidationError(`유효한 64자리 소문자 SHA-256 해시가 아닙니다: "${rawHash}"`);
  }
  return normalized;
}

/** SHA-256 해시 기반 R2 불변 콘텐츠 주소 URL을 생성한다. */
export function buildR2ImmutableAssetUrl(
  r2BaseUrl: string,
  sha256Hex: string,
  extension?: string,
): string {
  const hash = normalizeSha256Hex(sha256Hex);
  const trimmedBase = r2BaseUrl.trim().replace(/\/+$/u, "");
  if (!trimmedBase) {
    throw new HybridCacheValidationError("r2BaseUrl은 비어 있을 수 없습니다.");
  }
  const cleanExt = extension
    ? `.${extension.trim().replace(/^\.+/u, "").replace(/[^a-zA-Z0-9_-]/gu, "")}`
    : "";
  const suffix = cleanExt === "." ? "" : cleanExt;
  return `${trimmedBase}/sha256/${hash.slice(0, 2)}/${hash}${suffix}`;
}

/** 테스트·프라이빗 브라우징 폴백용 인메모리 L2 지속 계층 어댑터. */
export function createMemoryPersistentCacheAdapter(): PersistentCacheTierAdapter {
  const store = new Map<string, CachedAssetRecord>();
  return {
    kind: "memory",
    async get(sha256) {
      const entry = store.get(sha256);
      return entry ? { ...entry, bytes: new Uint8Array(entry.bytes) } : null;
    },
    async put(record) {
      store.set(record.sha256, { ...record, bytes: new Uint8Array(record.bytes) });
    },
    async touch(sha256, accessedAtMs) {
      const existing = store.get(sha256);
      if (existing) store.set(sha256, { ...existing, lastAccessedAtMs: accessedAtMs });
    },
    async delete(sha256) {
      return store.delete(sha256);
    },
    async listMetadata() {
      return [...store.values()].map(({ sha256, mimeType, byteLength, createdAtMs, lastAccessedAtMs }) => ({
        sha256,
        mimeType,
        byteLength,
        createdAtMs,
        lastAccessedAtMs,
      }));
    },
    async clear() {
      store.clear();
    },
  };
}

interface OpfsFileHandleLike {
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> }>;
  createWritable(): Promise<{ write(data: Uint8Array<ArrayBuffer> | string): Promise<void>; close(): Promise<void> }>;
}

interface OpfsDirectoryHandleLike {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandleLike>;
  removeEntry(name: string): Promise<void>;
}

/** 브라우저 OPFS(Origin Private File System) 기반 L2 지속 캐시 어댑터. */
export function createOpfsCacheAdapter(
  directoryName = "toonstudio-hybrid-asset-cache-v1",
): PersistentCacheTierAdapter {
  const manifestFile = "__manifest__.json";

  const openDir = async (): Promise<OpfsDirectoryHandleLike> => {
    const storage = typeof navigator !== "undefined"
      ? (navigator.storage as StorageManager & { getDirectory?: () => Promise<OpfsDirectoryHandleLike> })
      : undefined;
    if (!storage || typeof storage.getDirectory !== "function") {
      throw new Error("이 브라우저 환경에서는 OPFS(navigator.storage.getDirectory)를 사용할 수 없습니다.");
    }
    const root = await storage.getDirectory();
    return root.getDirectoryHandle(directoryName, { create: true });
  };

  const readManifest = async (dir: OpfsDirectoryHandleLike): Promise<Record<string, PersistentCacheEntryMetadata>> => {
    try {
      const text = await (await (await dir.getFileHandle(manifestFile)).getFile()).text();
      const parsed: unknown = JSON.parse(text);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, PersistentCacheEntryMetadata>)
        : {};
    } catch {
      return {};
    }
  };

  const writeManifest = async (
    dir: OpfsDirectoryHandleLike,
    manifest: Record<string, PersistentCacheEntryMetadata>,
  ): Promise<void> => {
    const writable = await (await dir.getFileHandle(manifestFile, { create: true })).createWritable();
    await writable.write(JSON.stringify(manifest));
    await writable.close();
  };

  return {
    kind: "opfs",
    async get(sha256) {
      const dir = await openDir();
      const meta = (await readManifest(dir))[sha256];
      if (!meta) return null;
      try {
        const buffer = await (await (await dir.getFileHandle(`${sha256}.bin`)).getFile()).arrayBuffer();
        const bytes = new Uint8Array(buffer);
        return { ...meta, bytes, byteLength: bytes.byteLength };
      } catch {
        return null;
      }
    },
    async put(record) {
      const dir = await openDir();
      const writable = await (await dir.getFileHandle(`${record.sha256}.bin`, { create: true })).createWritable();
      const payload = new Uint8Array(record.bytes.byteLength);
      payload.set(record.bytes);
      await writable.write(payload);
      await writable.close();
      const manifest = await readManifest(dir);
      manifest[record.sha256] = {
        sha256: record.sha256,
        mimeType: record.mimeType,
        byteLength: record.byteLength,
        createdAtMs: record.createdAtMs,
        lastAccessedAtMs: record.lastAccessedAtMs,
      };
      await writeManifest(dir, manifest);
    },
    async touch(sha256, accessedAtMs) {
      const dir = await openDir();
      const manifest = await readManifest(dir);
      const existing = manifest[sha256];
      if (!existing) return;
      manifest[sha256] = { ...existing, lastAccessedAtMs: accessedAtMs };
      await writeManifest(dir, manifest);
    },
    async delete(sha256) {
      const dir = await openDir();
      const manifest = await readManifest(dir);
      const existed = Object.prototype.hasOwnProperty.call(manifest, sha256);
      delete manifest[sha256];
      await writeManifest(dir, manifest);
      try {
        await dir.removeEntry(`${sha256}.bin`);
      } catch {
        // 이미 삭제된 바이너리는 무시하고 메타데이터 정리만 반영한다.
      }
      return existed;
    },
    async listMetadata() {
      const dir = await openDir();
      return Object.values(await readManifest(dir));
    },
    async clear() {
      const dir = await openDir();
      const manifest = await readManifest(dir);
      for (const sha256 of Object.keys(manifest)) {
        try {
          await dir.removeEntry(`${sha256}.bin`);
        } catch {
          // 개별 파일 정리 오류 시 나머지 항목 정리를 계속한다.
        }
      }
      await writeManifest(dir, {});
    },
  };
}

/** OPFS 미지원 브라우저를 위한 IndexedDB 기반 L2 지속 캐시 어댑터. */
export function createIndexedDbCacheAdapter(
  dbName = "toonstudio-hybrid-asset-cache-v1",
  storeName = "assets",
): PersistentCacheTierAdapter {
  const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("이 환경에서는 IndexedDB를 사용할 수 없습니다."));
        return;
      }
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(storeName)) {
          req.result.createObjectStore(storeName, { keyPath: "sha256" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB 열기 실패"));
    });

  const withStore = async <T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await openDb();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = run(tx.objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB 요청 실패"));
      tx.oncomplete = () => db.close();
      tx.onabort = () => db.close();
    });
  };

  return {
    kind: "indexeddb",
    async get(sha256) {
      const record = await withStore<CachedAssetRecord | undefined>("readonly", (store) => store.get(sha256));
      return record ? { ...record, bytes: new Uint8Array(record.bytes) } : null;
    },
    async put(record) {
      await withStore("readwrite", (store) => store.put({ ...record, bytes: new Uint8Array(record.bytes) }));
    },
    async touch(sha256, accessedAtMs) {
      const existing = await withStore<CachedAssetRecord | undefined>("readonly", (store) => store.get(sha256));
      if (!existing) return;
      await withStore("readwrite", (store) => store.put({ ...existing, lastAccessedAtMs: accessedAtMs }));
    },
    async delete(sha256) {
      const existing = await withStore<CachedAssetRecord | undefined>("readonly", (store) => store.get(sha256));
      if (!existing) return false;
      await withStore("readwrite", (store) => store.delete(sha256));
      return true;
    },
    async listMetadata() {
      const rows = await withStore<CachedAssetRecord[]>("readonly", (store) => store.getAll());
      return rows.map(({ sha256, mimeType, byteLength, createdAtMs, lastAccessedAtMs }) => ({
        sha256,
        mimeType,
        byteLength,
        createdAtMs,
        lastAccessedAtMs,
      }));
    },
    async clear() {
      await withStore("readwrite", (store) => store.clear());
    },
  };
}

/** 표준 Fetch 기반 L3 R2 불변 에셋 조회 어댑터. */
export function createR2FetchAdapter(): RemoteHashAssetFetcher {
  return {
    async fetchByHash({ sha256, url, signal }) {
      if (typeof fetch !== "function") {
        throw new HybridCacheFetchError(sha256, url, "fetch API를 사용할 수 없는 환경입니다.");
      }
      const response = await fetch(url, { method: "GET", cache: "force-cache", signal });
      if (!response.ok) {
        throw new HybridCacheFetchError(sha256, url, `HTTP ${response.status}`);
      }
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        mimeType: response.headers.get("content-type") ?? "application/octet-stream",
      };
    },
  };
}
