import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { canonicalJson } from "./production-integration-artifacts";

/** GCM 인증 태그는 항상 16바이트로 봉하고 연다. 길이를 정하지 않으면 Node 가 4·8·12~15바이트 태그도 받아들여 위조 비용이 떨어진다(DEP0182). */
const AUTH_TAG_LENGTH = 16;

export interface GoogleCredentialEnvelope {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: string;
  readonly tokenType: string;
  readonly scope: string;
}

export function encryptIntegrationCredential(
  credential: GoogleCredentialEnvelope,
  key: Buffer,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([
    cipher.update(canonicalJson(credential), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptIntegrationCredential(
  ciphertext: string,
  key: Buffer,
): GoogleCredentialEnvelope {
  const [version, ivRaw, tagRaw, bodyRaw, ...extra] = ciphertext.split(".");
  if (
    version !== "v1"
    || !ivRaw
    || !tagRaw
    || !bodyRaw
    || extra.length > 0
  ) {
    throw new Error("invalid production integration credential envelope");
  }
  const tag = Buffer.from(tagRaw, "base64url");
  if (tag.length !== AUTH_TAG_LENGTH) {
    throw new Error("invalid production integration credential envelope");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivRaw, "base64url"),
    { authTagLength: AUTH_TAG_LENGTH },
  );
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(bodyRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as Partial<GoogleCredentialEnvelope>;
  if (
    typeof parsed.accessToken !== "string"
    || typeof parsed.expiresAt !== "string"
    || typeof parsed.tokenType !== "string"
    || typeof parsed.scope !== "string"
    || (parsed.refreshToken !== null
      && typeof parsed.refreshToken !== "string")
  ) {
    throw new Error("invalid production integration credential payload");
  }
  return parsed as GoogleCredentialEnvelope;
}
