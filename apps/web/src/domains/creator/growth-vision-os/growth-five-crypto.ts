/**
 * 성장 단계 5대 엔진 공용 결정적 해시 · 수치 보정 · UTF-8 Base64URL 유틸.
 */

export function fnv1a32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function deterministicDigest(payload: string, salt: string): string {
  const rounds = 6;
  let laneA = fnv1a32(`${salt}:a:${payload}`, 0x811c9dc5);
  let laneB = fnv1a32(`${salt}:b:${payload}`, 0x9e3779b9);
  let laneC = fnv1a32(`${payload}:c:${salt}`, 0x85ebca6b);
  let laneD = fnv1a32(`${payload}:d:${salt}`, 0xc2b2ae35);
  for (let r = 0; r < rounds; r += 1) {
    const step = `${r}:${laneA.toString(16)}:${laneB.toString(16)}:${laneC.toString(16)}:${laneD.toString(16)}:${salt}`;
    laneA = fnv1a32(step, laneA ^ 0x27d4eb2d);
    laneB = fnv1a32(`${step}:1`, laneB ^ 0x165667b1);
    laneC = fnv1a32(`${step}:2`, laneC ^ 0xd3a2646c);
    laneD = fnv1a32(`${step}:3`, laneD ^ 0xfd7046c5);
  }
  const hex = [laneA, laneB, laneC, laneD]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
  return `ts-v1:${hex}`;
}

export function constantTimeEquals(left: string, right: string): boolean {
  const maxLen = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < maxLen; i += 1) {
    const a = i < left.length ? left.charCodeAt(i) : 0;
    const b = i < right.length ? right.charCodeAt(i) : 0;
    diff |= a ^ b;
  }
  return diff === 0;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function utf8ToBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

export function base64UrlToUtf8(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) return null;
  const padded = encoded
    .replace(/-/gu, "+")
    .replace(/_/gu, "/")
    .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}
