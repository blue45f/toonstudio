/**
 * WebCrypto AES-256-GCM + PBKDF2-SHA-256 기반 크로스브라우저 로컬 암호화 샌드박스 컨테이너.
 *
 * 브라우저 Web Storage를 일체 사용하지 않고 교체 가능한 비동기 백엔드(메모리·OPFS/IDB 호환)에
 * 경로 바인딩 AAD와 고유 96비트 IV로 각 파일을 암호화 저장하며, `TSVFS1` 바이너리 봉투로
 * 비트 단위 무손실 왕복 및 변조 탐지를 제공한다.
 */

export interface SandboxedStorageBackend {
  readonly kind: "memory" | "opfs-adapter" | "idb-adapter";
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<readonly string[]>;
}

export interface EncryptedVfsEntrySummary {
  readonly virtualPath: string;
  readonly mimeType: string;
  readonly plaintextBytes: number;
  readonly ciphertextBytes: number;
  readonly sha256Hex: string;
  readonly ivHex: string;
}

export interface SandboxedVfsStats {
  readonly backendKind: SandboxedStorageBackend["kind"];
  readonly entryCount: number;
  readonly totalPlaintextBytes: number;
  readonly totalCiphertextBytes: number;
  readonly algorithm: "AES-256-GCM";
  readonly kdf: "PBKDF2-SHA-256";
  readonly pbkdf2Iterations: number;
  readonly saltBytes: number;
}

export interface CrossBrowserCryptoCapabilities {
  readonly hasWebCryptoSubtle: boolean;
  readonly hasGetRandomValues: boolean;
  readonly hasTextEncoder: boolean;
  readonly hasOpfsStorage: boolean;
  readonly hasIndexedDb: boolean;
  readonly usesWebStorage: false;
}

const CONTAINER_MAGIC = new Uint8Array([0x54, 0x53, 0x56, 0x46, 0x53, 0x31]); // "TSVFS1"
const CONTAINER_FORMAT_VERSION = 1;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const DEFAULT_PBKDF2_ITERATIONS = 100_000;
const MIN_PBKDF2_ITERATIONS = 1_000;

interface StoredEncryptedBlobRecord {
  readonly virtualPath: string;
  readonly mimeType: string;
  readonly plaintextBytes: number;
  readonly sha256Hex: string;
  readonly ivBase64: string;
  readonly ciphertextBase64: string;
}

interface ArchivePayloadManifest {
  readonly version: 1;
  readonly entries: readonly {
    readonly virtualPath: string;
    readonly mimeType: string;
    readonly sha256Hex: string;
    readonly dataBase64: string;
  }[];
}

function getWebCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle || typeof c.getRandomValues !== "function") {
    throw new Error("WebCrypto SubtleCrypto (AES-GCM / PBKDF2) is unavailable in this runtime");
  }
  return c;
}

function toOwnedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

const encodeUtf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
const decodeUtf8 = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 1) out += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x4000) {
    const sub = bytes.subarray(i, Math.min(i + 0x4000, bytes.length));
    let chunk = "";
    for (let j = 0; j < sub.length; j += 1) chunk += String.fromCharCode(sub[j] ?? 0);
    binary += chunk;
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await getWebCrypto().subtle.digest("SHA-256", toOwnedArrayBuffer(bytes));
  return bytesToHex(new Uint8Array(digest));
}

function normalizeAndValidateVirtualPath(rawPath: string): string {
  const normalized = rawPath.replaceAll("\\", "/").replace(/^\/+/, "").trim();
  if (!normalized || normalized.includes("\0")) {
    throw new Error("Invalid virtual path: empty or contains null byte");
  }
  const segments = normalized.split("/");
  for (const seg of segments) {
    if (!seg || seg === "." || seg === "..") {
      throw new Error(`Unsafe virtual path traversal rejected: ${rawPath}`);
    }
  }
  return segments.join("/");
}

async function deriveAesGcmKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error("Container passphrase must be at least 4 characters");
  }
  const cryptoApi = getWebCrypto();
  const baseKey = await cryptoApi.subtle.importKey(
    "raw",
    toOwnedArrayBuffer(encodeUtf8(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return cryptoApi.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toOwnedArrayBuffer(salt),
      iterations: Math.max(MIN_PBKDF2_ITERATIONS, Math.round(iterations)),
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** 크로스브라우저 순수 메모리 샌드박스 스토리지 백엔드 (Web Storage 미사용). */
export class InMemorySandboxedBackend implements SandboxedStorageBackend {
  public readonly kind = "memory" as const;
  private readonly store = new Map<string, Uint8Array>();

  public async get(key: string): Promise<Uint8Array | null> {
    const found = this.store.get(key);
    return found ? new Uint8Array(found) : null;
  }

  public async set(key: string, value: Uint8Array): Promise<void> {
    this.store.set(key, new Uint8Array(value));
  }

  public async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  public async keys(): Promise<readonly string[]> {
    return Array.from(this.store.keys()).sort();
  }
}

/** 크로스브라우저 WebCrypto / 샌드박스 스토리지 기능 진단 (Web Storage 미참조). */
export function detectCrossBrowserCryptoCapabilities(): CrossBrowserCryptoCapabilities {
  const cryptoObj = globalThis.crypto;
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const storageObj = nav && "storage" in nav ? (nav.storage as { getDirectory?: unknown } | undefined) : undefined;
  return {
    hasWebCryptoSubtle: Boolean(cryptoObj && cryptoObj.subtle),
    hasGetRandomValues: Boolean(cryptoObj && typeof cryptoObj.getRandomValues === "function"),
    hasTextEncoder: typeof TextEncoder === "function",
    hasOpfsStorage: Boolean(storageObj && typeof storageObj.getDirectory === "function"),
    hasIndexedDb: typeof indexedDB !== "undefined",
    usesWebStorage: false,
  };
}

/** WebCrypto AES-256-GCM 크로스브라우저 로컬 암호화 샌드박스 컨테이너. */
export class SandboxedVfsContainer {
  private readonly backend: SandboxedStorageBackend;
  private readonly masterKey: CryptoKey;
  private readonly salt: Uint8Array;
  private readonly pbkdf2Iterations: number;

  private constructor(
    backend: SandboxedStorageBackend,
    masterKey: CryptoKey,
    salt: Uint8Array,
    pbkdf2Iterations: number,
  ) {
    this.backend = backend;
    this.masterKey = masterKey;
    this.salt = salt;
    this.pbkdf2Iterations = pbkdf2Iterations;
  }

  public static async create(options: {
    readonly passphrase: string;
    readonly backend?: SandboxedStorageBackend;
    readonly pbkdf2Iterations?: number;
  }): Promise<SandboxedVfsContainer> {
    const cryptoApi = getWebCrypto();
    const salt = new Uint8Array(SALT_BYTES);
    cryptoApi.getRandomValues(salt);
    const iterations = Math.max(MIN_PBKDF2_ITERATIONS, Math.round(options.pbkdf2Iterations ?? DEFAULT_PBKDF2_ITERATIONS));
    const key = await deriveAesGcmKey(options.passphrase, salt, iterations);
    return new SandboxedVfsContainer(options.backend ?? new InMemorySandboxedBackend(), key, salt, iterations);
  }

  public async writeEntry(
    rawPath: string,
    plaintext: Uint8Array | string,
    mimeType = "application/octet-stream",
  ): Promise<EncryptedVfsEntrySummary> {
    const virtualPath = normalizeAndValidateVirtualPath(rawPath);
    const rawBytes = typeof plaintext === "string" ? encodeUtf8(plaintext) : new Uint8Array(plaintext);
    const cryptoApi = getWebCrypto();
    const iv = new Uint8Array(IV_BYTES);
    cryptoApi.getRandomValues(iv);
    const aad = encodeUtf8(`TSVFS1:v${CONTAINER_FORMAT_VERSION}:${virtualPath}`);
    const sha256Hex = await computeSha256Hex(rawBytes);

    const encryptedBuf = await cryptoApi.subtle.encrypt(
      { name: "AES-GCM", iv: toOwnedArrayBuffer(iv), additionalData: toOwnedArrayBuffer(aad) },
      this.masterKey,
      toOwnedArrayBuffer(rawBytes),
    );
    const cipherBytes = new Uint8Array(encryptedBuf);
    const record: StoredEncryptedBlobRecord = {
      virtualPath,
      mimeType,
      plaintextBytes: rawBytes.byteLength,
      sha256Hex,
      ivBase64: bytesToBase64(iv),
      ciphertextBase64: bytesToBase64(cipherBytes),
    };
    await this.backend.set(virtualPath, encodeUtf8(JSON.stringify(record)));

    return {
      virtualPath,
      mimeType,
      plaintextBytes: rawBytes.byteLength,
      ciphertextBytes: cipherBytes.byteLength,
      sha256Hex,
      ivHex: bytesToHex(iv),
    };
  }

  public async readEntry(rawPath: string): Promise<Uint8Array> {
    const virtualPath = normalizeAndValidateVirtualPath(rawPath);
    const stored = await this.backend.get(virtualPath);
    if (!stored) throw new Error(`Sandboxed VFS entry not found: ${virtualPath}`);
    const record = JSON.parse(decodeUtf8(stored)) as StoredEncryptedBlobRecord;
    const iv = base64ToBytes(record.ivBase64);
    const cipherBytes = base64ToBytes(record.ciphertextBase64);
    const aad = encodeUtf8(`TSVFS1:v${CONTAINER_FORMAT_VERSION}:${virtualPath}`);

    const plainBuf = await getWebCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: toOwnedArrayBuffer(iv), additionalData: toOwnedArrayBuffer(aad) },
      this.masterKey,
      toOwnedArrayBuffer(cipherBytes),
    );
    const plainBytes = new Uint8Array(plainBuf);
    if ((await computeSha256Hex(plainBytes)) !== record.sha256Hex) {
      throw new Error(`Integrity SHA-256 mismatch for ${virtualPath}`);
    }
    return plainBytes;
  }

  public async deleteEntry(rawPath: string): Promise<void> {
    await this.backend.delete(normalizeAndValidateVirtualPath(rawPath));
  }

  public async listEntries(): Promise<readonly EncryptedVfsEntrySummary[]> {
    const keys = await this.backend.keys();
    const out: EncryptedVfsEntrySummary[] = [];
    for (const key of keys) {
      const raw = await this.backend.get(key);
      if (!raw) continue;
      const rec = JSON.parse(decodeUtf8(raw)) as StoredEncryptedBlobRecord;
      out.push({
        virtualPath: rec.virtualPath,
        mimeType: rec.mimeType,
        plaintextBytes: rec.plaintextBytes,
        ciphertextBytes: base64ToBytes(rec.ciphertextBase64).byteLength,
        sha256Hex: rec.sha256Hex,
        ivHex: bytesToHex(base64ToBytes(rec.ivBase64)),
      });
    }
    return out;
  }

  public async getStats(): Promise<SandboxedVfsStats> {
    const entries = await this.listEntries();
    return {
      backendKind: this.backend.kind,
      entryCount: entries.length,
      totalPlaintextBytes: entries.reduce((sum, e) => sum + e.plaintextBytes, 0),
      totalCiphertextBytes: entries.reduce((sum, e) => sum + e.ciphertextBytes, 0),
      algorithm: "AES-256-GCM",
      kdf: "PBKDF2-SHA-256",
      pbkdf2Iterations: this.pbkdf2Iterations,
      saltBytes: this.salt.byteLength,
    };
  }

  /** 전체 가상 컨테이너를 단일 암호화 바이너리 봉투(`TSVFS1`)로 무손실 직렬화한다. */
  public async exportEncryptedArchive(archivePassphrase: string): Promise<Uint8Array> {
    const entries = await this.listEntries();
    const manifestEntries: ArchivePayloadManifest["entries"][number][] = [];
    for (const entry of entries) {
      const plain = await this.readEntry(entry.virtualPath);
      manifestEntries.push({
        virtualPath: entry.virtualPath,
        mimeType: entry.mimeType,
        sha256Hex: entry.sha256Hex,
        dataBase64: bytesToBase64(plain),
      });
    }

    const payloadBytes = encodeUtf8(JSON.stringify({ version: 1, entries: manifestEntries } satisfies ArchivePayloadManifest));
    const cryptoApi = getWebCrypto();
    const archiveSalt = new Uint8Array(SALT_BYTES);
    const archiveIv = new Uint8Array(IV_BYTES);
    cryptoApi.getRandomValues(archiveSalt);
    cryptoApi.getRandomValues(archiveIv);

    const archiveKey = await deriveAesGcmKey(archivePassphrase, archiveSalt, this.pbkdf2Iterations);
    const headerLen = CONTAINER_MAGIC.byteLength + 2 + 2 + 4 + SALT_BYTES + IV_BYTES + 4;
    const header = new Uint8Array(headerLen);
    const view = new DataView(header.buffer);
    header.set(CONTAINER_MAGIC, 0);
    view.setUint16(6, CONTAINER_FORMAT_VERSION, false);
    view.setUint16(8, 0, false);
    view.setUint32(10, this.pbkdf2Iterations, false);
    header.set(archiveSalt, 14);
    header.set(archiveIv, 14 + SALT_BYTES);

    const aad = header.subarray(0, 14 + SALT_BYTES + IV_BYTES);
    const encryptedBuf = await cryptoApi.subtle.encrypt(
      { name: "AES-GCM", iv: toOwnedArrayBuffer(archiveIv), additionalData: toOwnedArrayBuffer(aad) },
      archiveKey,
      toOwnedArrayBuffer(payloadBytes),
    );
    const ciphertext = new Uint8Array(encryptedBuf);
    view.setUint32(14 + SALT_BYTES + IV_BYTES, ciphertext.byteLength, false);

    const envelope = new Uint8Array(headerLen + ciphertext.byteLength);
    envelope.set(header, 0);
    envelope.set(ciphertext, headerLen);
    return envelope;
  }

  /** 암호화 바이너리 봉투(`TSVFS1`)를 복호화·인증해 새 `SandboxedVfsContainer`로 무손실 복원한다. */
  public static async importEncryptedArchive(
    archiveBytes: Uint8Array,
    archivePassphrase: string,
    options?: { readonly backend?: SandboxedStorageBackend },
  ): Promise<SandboxedVfsContainer> {
    const headerLen = CONTAINER_MAGIC.byteLength + 2 + 2 + 4 + SALT_BYTES + IV_BYTES + 4;
    if (archiveBytes.byteLength < headerLen + 16) {
      throw new Error("Encrypted archive truncated or malformed");
    }
    for (let i = 0; i < CONTAINER_MAGIC.byteLength; i += 1) {
      if (archiveBytes[i] !== CONTAINER_MAGIC[i]) {
        throw new Error("Invalid SandboxedVfsContainer magic header");
      }
    }

    const view = new DataView(archiveBytes.buffer, archiveBytes.byteOffset, archiveBytes.byteLength);
    const version = view.getUint16(6, false);
    if (version !== CONTAINER_FORMAT_VERSION) throw new Error(`Unsupported container format version: ${version}`);
    const iterations = view.getUint32(10, false);
    if (iterations < MIN_PBKDF2_ITERATIONS) throw new Error(`Unsafe PBKDF2 iteration count: ${iterations}`);
    const salt = archiveBytes.subarray(14, 14 + SALT_BYTES);
    const iv = archiveBytes.subarray(14 + SALT_BYTES, 14 + SALT_BYTES + IV_BYTES);
    const cipherLen = view.getUint32(14 + SALT_BYTES + IV_BYTES, false);
    const ciphertext = archiveBytes.subarray(headerLen);
    if (ciphertext.byteLength !== cipherLen) throw new Error("Encrypted archive payload length mismatch");

    const archiveKey = await deriveAesGcmKey(archivePassphrase, salt, iterations);
    const aad = archiveBytes.subarray(0, 14 + SALT_BYTES + IV_BYTES);
    const plainBuf = await getWebCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: toOwnedArrayBuffer(iv), additionalData: toOwnedArrayBuffer(aad) },
      archiveKey,
      toOwnedArrayBuffer(ciphertext),
    );
    const manifest = JSON.parse(decodeUtf8(new Uint8Array(plainBuf))) as ArchivePayloadManifest;
    if (manifest.version !== 1 || !Array.isArray(manifest.entries)) {
      throw new Error("Invalid decrypted VFS archive manifest");
    }

    const restored = await SandboxedVfsContainer.create({
      passphrase: archivePassphrase,
      backend: options?.backend,
      pbkdf2Iterations: iterations,
    });
    for (const entry of manifest.entries) {
      const data = base64ToBytes(entry.dataBase64);
      if ((await computeSha256Hex(data)) !== entry.sha256Hex) {
        throw new Error(`Restored entry SHA-256 mismatch: ${entry.virtualPath}`);
      }
      await restored.writeEntry(entry.virtualPath, data, entry.mimeType);
    }
    return restored;
  }
}
