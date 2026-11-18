import { sha256HexPortable } from "./sha256-portable";

function canonicalJsonValue(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "n";
  if (typeof value === "string") return `s:${JSON.stringify(value)}`;
  if (typeof value === "boolean") return value ? "b:1" : "b:0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Studio 3D command state contains a non-finite number.");
    return `d:${Object.is(value, -0) ? "0" : JSON.stringify(value)}`;
  }
  if (typeof value === "bigint") return `i:${value.toString()}`;
  if (typeof value === "undefined") return "u";
  if (typeof value === "function" || typeof value === "symbol") {
    throw new TypeError("Studio 3D command state is not serializable.");
  }
  if (typeof value !== "object") return `x:${JSON.stringify(value)}`;
  if (ancestors.has(value)) throw new TypeError("Studio 3D command state contains a cycle.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `a:[${value.map((item) => canonicalJsonValue(item, ancestors)).join(",")}]`;
    }
    const obj = value as Record<string, unknown>;
    const properties: string[] = [];
    for (const key of Object.keys(obj).sort()) {
      const item = obj[key];
      if (typeof item === "undefined" || typeof item === "function" || typeof item === "symbol") continue;
      properties.push(`${JSON.stringify(key)}:${canonicalJsonValue(item, ancestors)}`);
    }
    return `o:{${properties.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}
export function hashStudioScene3dCutValue(value: unknown): string {
  return `sha256:${sha256HexPortable(new TextEncoder().encode(canonicalJsonValue({ value }, new Set())))}`;
}
