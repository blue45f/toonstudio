import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

// 2026-10-15 신규 공개 취약점 6건(개발 전용 @lhci/cli 전이 의존성) 완화 회귀 테스트.
// tmp·basic-ftp 는 수정 릴리스로 올리고, 수정 릴리스가 없는 sprintf-js·extract-zip 은 트리에서 없앤다.
// 대체본(patches/extract-zip-disabled)은 레지스트리 패키지가 아니라 pnpm audit 이 검사하지 않으므로
// 호출되면 반드시 실패한다는 계약과 lockfile 의 최종 상태를 이 테스트가 지킨다.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const workspace = parse(readFileSync(join(ROOT, "pnpm-workspace.yaml"), "utf8"));
const lock = parse(readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8"));

const lockPackages = Object.keys(lock.packages ?? {});

function versionsOf(name) {
  const prefix = `${name}@`;
  return lockPackages
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length))
    .filter((version) => /^\d/u.test(version));
}

function atLeast(version, minimum) {
  const left = version.split(/[.+-]/u).slice(0, 3).map(Number);
  const right = minimum.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return true;
}

describe("개발 전용 전이 의존성 취약점 완화", () => {
  it("extract-zip 대체본은 어떤 입력에도 압축을 풀지 않고 이유와 함께 거부한다", async () => {
    const extract = require(join(ROOT, "patches", "extract-zip-disabled", "index.js"));
    await expect(extract("/tmp/a.zip", { dir: "/tmp/out" })).rejects.toThrow(/GHSA-jmr9-qjv8-65gv/u);
    await expect(extract()).rejects.toThrow(/GHSA-7pqw-9j4j-h8q3/u);
    expect(extract.disabledReason).toContain("patches/extract-zip-disabled");
  });

  it("오버라이드는 취약한 범위만 수정 버전·대체본으로 보낸다", () => {
    const overrides = workspace.overrides;
    expect(overrides["tmp@<0.2.6"]).toBe("0.2.7");
    expect(overrides["basic-ftp@<6.2.1"]).toBe("6.2.3");
    expect(overrides["argparse@<2"]).toBe("2.0.1");
    expect(overrides["extract-zip@<=2.0.1"]).toBe("file:patches/extract-zip-disabled");
  });

  it("lockfile 에 취약 버전이 남지 않는다", () => {
    expect(versionsOf("sprintf-js")).toEqual([]);
    expect(versionsOf("extract-zip")).toEqual([]);
    expect(lockPackages).toContain("extract-zip@file:patches/extract-zip-disabled");
    expect(versionsOf("argparse").filter((version) => !atLeast(version, "2.0.0"))).toEqual([]);
    const tmpVersions = versionsOf("tmp");
    expect(tmpVersions.length).toBeGreaterThan(0);
    expect(tmpVersions.filter((version) => !atLeast(version, "0.2.6"))).toEqual([]);
    const ftpVersions = versionsOf("basic-ftp");
    expect(ftpVersions.length).toBeGreaterThan(0);
    expect(ftpVersions.filter((version) => !atLeast(version, "6.2.1"))).toEqual([]);
  });
});
