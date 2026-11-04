import { sha256HexPortable } from "@toonstudio/contracts/sha256-portable";

const encoder = new TextEncoder();
function canonical(value: unknown, depth = 0, seen = new Set<object>()): string {
  if (depth > 12) throw new Error("6패스 manifest 중첩 예산을 초과했습니다.");
  if (value && typeof value === "object") {
    if (seen.has(value)) throw new Error("6패스 manifest 순환 참조는 저장할 수 없습니다.");
    seen = new Set(seen).add(value);
  }
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("6패스 manifest 수치가 올바르지 않습니다.");
    const text = JSON.stringify(value);
    if (text === undefined) throw new Error("6패스 manifest에 저장할 수 없는 값이 있습니다.");
    return text;
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry, depth + 1, seen)).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry, depth + 1, seen)}`).join(",")}}`;
}
export function studioBg3dSixPassManifestHash(value: unknown): `sha256:${string}` {
  const bytes = encoder.encode(canonical(value));
  if (bytes.byteLength > 8192) throw new Error("6패스 manifest 바이트 예산을 초과했습니다.");
  return `sha256:${sha256HexPortable(bytes)}`;
}
