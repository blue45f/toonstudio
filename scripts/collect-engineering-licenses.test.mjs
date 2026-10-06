import { describe, expect, it } from "vitest";

import {
  inventoryDrift,
  licenseOf,
  normalizeRepository,
  parseLockfileResolvedVersions,
} from "./collect-engineering-licenses.mjs";

describe("collect-engineering-licenses", () => {
  it("lockfile importers에서 피어 접미사를 벗긴 resolved version을 모은다", () => {
    const lockfile = [
      "lockfileVersion: '9.0'",
      "",
      "importers:",
      "",
      "  .:",
      "    dependencies:",
      "      react:",
      "        specifier: ^19.0.0",
      "        version: 19.1.0",
      "    devDependencies:",
      "      vite:",
      "        specifier: ^6.0.0",
      "        version: 6.0.0",
      "",
      "  apps/web:",
      "    dependencies:",
      "      '@radix-ui/react-dialog':",
      "        specifier: ^1.1.15",
      "        version: 1.1.15(react@19.1.0)",
      "",
      "packages:",
      "  react@19.1.0:",
      "    resolution: {}",
    ].join("\n");
    const resolved = parseLockfileResolvedVersions(lockfile);
    expect(resolved.get("react")).toEqual(new Set(["19.1.0"]));
    expect(resolved.get("@radix-ui/react-dialog")).toEqual(new Set(["1.1.15"]));
    expect(resolved.has("vite")).toBe(false); // devDependencies는 범위 밖
  });

  it("repository 표기를 https URL로 정규화한다", () => {
    expect(normalizeRepository("git+https://github.com/foo/bar.git")).toBe("https://github.com/foo/bar");
    expect(normalizeRepository({ url: "git@github.com:foo/bar.git" })).toBe("https://github.com/foo/bar");
    expect(normalizeRepository(undefined)).toBeUndefined();
    // npm의 GitHub shorthand("owner/repo", "github:owner/repo")도 공식 저장소 URL로 편다.
    expect(normalizeRepository("foo/bar")).toBe("https://github.com/foo/bar");
    expect(normalizeRepository("github:foo/bar")).toBe("https://github.com/foo/bar");
    expect(normalizeRepository("not-a-repository")).toBeUndefined();
  });

  it("license 필드의 문자열·객체·배열 표기를 모두 읽는다", () => {
    expect(licenseOf({ license: "MIT" })).toBe("MIT");
    expect(licenseOf({ license: { type: "Apache-2.0" } })).toBe("Apache-2.0");
    expect(licenseOf({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] })).toBe("MIT OR Apache-2.0");
    expect(licenseOf({})).toBeUndefined();
  });

  it("인벤토리 차분은 신규·잔류·변경 항목을 나눠 보고한다", () => {
    const inventorySource = `
export const ENGINEERING_LIBRARY_LICENSES = [
  { name: "kept", version: "1.0.0", license: "MIT", surface: "web", role: { ko: "ㄱ", en: "a" } },
  { name: "moved",
    version: "2.0.0",
    license: "MIT", surface: "web", role: { ko: "ㄴ", en: "b" } },
  { name: "gone", version: "3.0.0", license: "ISC", surface: "web", role: { ko: "ㄷ", en: "c" } },
];
export const ENGINEERING_MODEL_ASSET_LICENSES = [];
`;
    const entries = [
      { name: "kept", versions: ["1.0.0"], license: "MIT" },
      { name: "moved", versions: ["2.1.0"], license: "MIT" },
      { name: "fresh", versions: ["0.1.0"], license: "BSD-3-Clause" },
    ];
    const drift = inventoryDrift(entries, inventorySource);
    expect(drift.missing).toEqual(["fresh"]);
    expect(drift.extra).toEqual(["gone"]);
    expect(drift.changed).toEqual([
      { name: "moved", recorded: "2.0.0 / MIT", collected: "2.1.0 / MIT" },
    ]);
  });
});
