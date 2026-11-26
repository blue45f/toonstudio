/**
 * WebCrypto `extractable: false` 정책을 강제하는 제로-트러스트 로컬 키 볼트.
 *
 * - AES-GCM-256 세션 대칭키 및 ECDSA P-256 서명 개인키 생성·등록 시 `extractable === false`를
 *   엄격히 강제해 원시 키 바이트 추출(`exportKey`)을 런타임 수준에서 원천 차단한다.
 */

export interface EncryptedVaultEnvelope {
  readonly keyId: string;
  readonly algorithm: "AES-GCM-256";
  readonly iv: Uint8Array;
  readonly ciphertext: Uint8Array;
}

export interface VaultKeyAuditRecord {
  readonly keyId: string;
  readonly kind: "aes-gcm-256" | "ecdsa-p256";
  readonly extractable: false;
  readonly createdAtIso: string;
  readonly operationCount: number;
}

interface StoredAesKeyEntry {
  readonly key: CryptoKey;
  readonly createdAtIso: string;
  operationCount: number;
}

interface StoredSigningKeyEntry {
  readonly privateKey: CryptoKey;
  readonly publicKey: CryptoKey;
  readonly createdAtIso: string;
  operationCount: number;
}

function getSubtleCrypto(): SubtleCrypto {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("WebCrypto SubtleCrypto를 사용할 수 없는 환경입니다.");
  }
  return crypto.subtle;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export class ZeroTrustKeyVault {
  private readonly aesKeys = new Map<string, StoredAesKeyEntry>();
  private readonly signingKeys = new Map<string, StoredSigningKeyEntry>();

  public async createSessionAesKey(keyId: string): Promise<VaultKeyAuditRecord> {
    const subtle = getSubtleCrypto();
    const generated = await subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    if (generated.extractable) {
      throw new Error("보안 위반: 추출 가능한 AES 키가 생성되었습니다.");
    }
    const createdAtIso = new Date().toISOString();
    this.aesKeys.set(keyId, { key: generated, createdAtIso, operationCount: 0 });
    return { keyId, kind: "aes-gcm-256", extractable: false, createdAtIso, operationCount: 0 };
  }

  public async createSigningKeyPair(
    keyId: string,
  ): Promise<{ readonly audit: VaultKeyAuditRecord; readonly publicKeyJwk: JsonWebKey }> {
    const subtle = getSubtleCrypto();
    const pair = await subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    );
    if (pair.privateKey.extractable) {
      throw new Error("보안 위반: 추출 가능한 ECDSA 개인키가 생성되었습니다.");
    }
    const createdAtIso = new Date().toISOString();
    this.signingKeys.set(keyId, {
      privateKey: pair.privateKey,
      publicKey: pair.publicKey,
      createdAtIso,
      operationCount: 0,
    });
    const publicKeyJwk = await subtle.exportKey("jwk", pair.publicKey);
    return {
      audit: { keyId, kind: "ecdsa-p256", extractable: false, createdAtIso, operationCount: 0 },
      publicKeyJwk,
    };
  }

  /** 외부 CryptoKey가 `extractable: true`이면 즉시 예외로 거부한다. */
  public registerExternalAesKey(keyId: string, key: CryptoKey): VaultKeyAuditRecord {
    if (key.extractable) {
      throw new Error("제로-트러스트 정책 위반: extractable=true 키는 볼트에 등록할 수 없습니다.");
    }
    if (key.type !== "secret") {
      throw new Error("AES 키는 secret 타입이어야 합니다.");
    }
    const createdAtIso = new Date().toISOString();
    this.aesKeys.set(keyId, { key, createdAtIso, operationCount: 0 });
    return { keyId, kind: "aes-gcm-256", extractable: false, createdAtIso, operationCount: 0 };
  }

  public async encryptPayload(
    keyId: string,
    plaintext: Uint8Array,
    additionalData?: Uint8Array,
  ): Promise<EncryptedVaultEnvelope> {
    const entry = this.aesKeys.get(keyId);
    if (!entry) throw new Error(`등록되지 않은 AES 키 ID입니다: ${keyId}`);
    if (entry.key.extractable) throw new Error("추출 가능한 키로의 암호화를 차단했습니다.");

    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);
    const params: AesGcmParams = additionalData
      ? { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData: toArrayBuffer(additionalData) }
      : { name: "AES-GCM", iv: toArrayBuffer(iv) };

    const encrypted = await getSubtleCrypto().encrypt(params, entry.key, toArrayBuffer(plaintext));
    entry.operationCount += 1;
    return { keyId, algorithm: "AES-GCM-256", iv, ciphertext: new Uint8Array(encrypted) };
  }

  public async decryptPayload(
    envelope: EncryptedVaultEnvelope,
    additionalData?: Uint8Array,
  ): Promise<Uint8Array> {
    const entry = this.aesKeys.get(envelope.keyId);
    if (!entry) throw new Error(`등록되지 않은 AES 키 ID입니다: ${envelope.keyId}`);
    const params: AesGcmParams = additionalData
      ? { name: "AES-GCM", iv: toArrayBuffer(envelope.iv), additionalData: toArrayBuffer(additionalData) }
      : { name: "AES-GCM", iv: toArrayBuffer(envelope.iv) };

    const decrypted = await getSubtleCrypto().decrypt(params, entry.key, toArrayBuffer(envelope.ciphertext));
    entry.operationCount += 1;
    return new Uint8Array(decrypted);
  }

  public async signPayload(keyId: string, payload: Uint8Array): Promise<Uint8Array> {
    const entry = this.signingKeys.get(keyId);
    if (!entry) throw new Error(`등록되지 않은 서명 키 ID입니다: ${keyId}`);
    if (entry.privateKey.extractable) throw new Error("추출 가능한 개인키 서명을 차단했습니다.");

    const sig = await getSubtleCrypto().sign(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      entry.privateKey,
      toArrayBuffer(payload),
    );
    entry.operationCount += 1;
    return new Uint8Array(sig);
  }

  public async verifyPayload(
    keyId: string,
    payload: Uint8Array,
    signature: Uint8Array,
  ): Promise<boolean> {
    const entry = this.signingKeys.get(keyId);
    if (!entry) throw new Error(`등록되지 않은 서명 키 ID입니다: ${keyId}`);
    return getSubtleCrypto().verify(
      { name: "ECDSA", hash: { name: "SHA-256" } },
      entry.publicKey,
      toArrayBuffer(signature),
      toArrayBuffer(payload),
    );
  }

  /** 볼트 키의 `extractable === false` 여부와 실제 `exportKey` 차단 동작을 능동 검증한다. */
  public async verifyKeyNonExtractable(
    keyId: string,
  ): Promise<{ readonly extractable: boolean; readonly exportBlockedByRuntime: boolean }> {
    const aes = this.aesKeys.get(keyId);
    const signing = this.signingKeys.get(keyId);
    const targetKey = aes ? aes.key : signing ? signing.privateKey : null;
    if (!targetKey) throw new Error(`키 ID를 찾을 수 없습니다: ${keyId}`);

    let exportBlockedByRuntime = false;
    try {
      await getSubtleCrypto().exportKey(aes ? "raw" : "pkcs8", targetKey);
    } catch {
      exportBlockedByRuntime = true;
    }
    return { extractable: targetKey.extractable, exportBlockedByRuntime };
  }

  public getAuditInventory(): readonly VaultKeyAuditRecord[] {
    const records: VaultKeyAuditRecord[] = [];
    this.aesKeys.forEach((entry, keyId) => {
      records.push({
        keyId,
        kind: "aes-gcm-256",
        extractable: false,
        createdAtIso: entry.createdAtIso,
        operationCount: entry.operationCount,
      });
    });
    this.signingKeys.forEach((entry, keyId) => {
      records.push({
        keyId,
        kind: "ecdsa-p256",
        extractable: false,
        createdAtIso: entry.createdAtIso,
        operationCount: entry.operationCount,
      });
    });
    return records;
  }
}
