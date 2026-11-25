import { MAX_NOTE_TEXT_UNITS, assertText } from "./human-ink-input-contract";

export interface HumanInkNoteDigest {
  readonly algorithm: "SHA-256";
  readonly digestHex: string;
  readonly byteLength: number;
  readonly covers: "unsigned-note-json-without-noteDigest";
  readonly signed: false;
}

/** JSON 원문 바이트의 실제 비동기 digest다. 작가 신원·권리·서명 검증은 하지 않는다. */
export async function digestHumanInkNoteJson(json: string): Promise<HumanInkNoteDigest> {
  assertText(json, MAX_NOTE_TEXT_UNITS, true);
  if (typeof globalThis.crypto?.subtle?.digest !== "function") throw new Error("WebCrypto SHA-256 unavailable");
  const bytes = new TextEncoder().encode(json);
  const result = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  if (result.byteLength !== 32) throw new Error("Invalid SHA-256 result length");
  const digestHex = Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { algorithm: "SHA-256", digestHex, byteLength: bytes.length, covers: "unsigned-note-json-without-noteDigest", signed: false };
}
