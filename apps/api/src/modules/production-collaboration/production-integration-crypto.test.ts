import { createCipheriv, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  decryptIntegrationCredential,
  encryptIntegrationCredential,
  type GoogleCredentialEnvelope,
} from "./production-integration-crypto";

const key = Buffer.alloc(32, 7);
const credential: GoogleCredentialEnvelope = {
  accessToken: "access-token-value",
  refreshToken: "refresh-token-value",
  expiresAt: "2030-01-01T00:00:00.000Z",
  tokenType: "Bearer",
  scope: "https://www.googleapis.com/auth/drive.file",
};

function parts(envelope: string): [string, string, string, string] {
  const [version, iv, tag, body] = envelope.split(".");
  return [version ?? "", iv ?? "", tag ?? "", body ?? ""];
}

describe("production integration credential cryptography", () => {
  it("round-trips a credential without exposing it in the envelope", () => {
    const envelope = encryptIntegrationCredential(credential, key);
    expect(envelope).not.toContain("access-token-value");
    expect(decryptIntegrationCredential(envelope, key)).toEqual(credential);
  });

  it("rejects a tampered ciphertext and a different key", () => {
    const envelope = encryptIntegrationCredential(credential, key);
    const [version, iv, tag, body] = parts(envelope);
    const flipped = Buffer.from(body, "base64url");
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() => decryptIntegrationCredential([version, iv, tag, flipped.toString("base64url")].join("."), key)).toThrow();
    expect(() => decryptIntegrationCredential(envelope, Buffer.alloc(32, 8))).toThrow();
  });

  it("rejects an envelope whose authentication tag is truncated", () => {
    // 길이를 정하지 않으면 Node 는 정상 태그의 앞부분인 4·8·12~15바이트 태그도 받아들이고(DEP0182), 위조 확률이 2^-(8*길이)로 떨어진다.
    const [version, iv, tag, body] = parts(encryptIntegrationCredential(credential, key));
    for (const length of [1, 4, 8, 12, 15]) {
      const truncated = Buffer.from(tag, "base64url").subarray(0, length).toString("base64url");
      expect(() => decryptIntegrationCredential([version, iv, truncated, body].join("."), key)).toThrow(
        "invalid production integration credential envelope",
      );
    }
  });

  it("still opens an envelope sealed with the default 16-byte tag", () => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(credential), "utf8"), cipher.final()]);
    const legacy = ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
    expect(decryptIntegrationCredential(legacy, key)).toEqual(credential);
  });

  it.each(["", "v2.a.b.c", "v1.a.b", "v1.a.b.c.d"])("rejects the malformed envelope %j", (envelope) => {
    expect(() => decryptIntegrationCredential(envelope, key)).toThrow("invalid production integration credential envelope");
  });
});
