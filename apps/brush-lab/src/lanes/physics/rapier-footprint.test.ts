import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { experimentalDescription } from "../../app/state/lane-maturity";
import { laneById } from "../registry";

import {
  RAPIER_CHUNK_BYTES,
  RAPIER_FIRST_LOAD_LABEL_KO,
  RAPIER_FIRST_LOAD_MS_RANGE,
  RAPIER_FOOTPRINT_KO,
  RAPIER_GZIP_BYTES,
  RAPIER_GZIP_LABEL_KO,
  RAPIER_GZIP_MB,
} from "./rapier-footprint";
import { RAPIER_PACKAGE_VERSION } from "./rapier-loader";

/**
 * Rapier 청크 크기·초기화 시간 수치의 단일 출처(`rapier-footprint.ts`)가 UI 안내문·레인 표·README·소스 주석에 같은 값으로 쓰이는지,
 * 그리고 설치본 크기와 어긋나지 않는지 검사한다(R-B-8/R-C-8: 1.28 / 1.30 MB로 갈라져 있던 수치를 한 곳으로 모았다).
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (rel: string): string => readFileSync(path.join(APP_ROOT, rel), "utf8");

describe("Rapier 수치 단일 출처", () => {
  it("상수가 서로 일관된다: MB 표기는 gzip 바이트에서 유도되고 시간 범위는 오름차순이다", () => {
    expect(RAPIER_GZIP_MB).toBeCloseTo(RAPIER_GZIP_BYTES / 1_000_000, 2);
    expect(RAPIER_GZIP_LABEL_KO).toBe("약 1.29 MB");
    expect(RAPIER_FIRST_LOAD_LABEL_KO).toBe(`약 ${RAPIER_FIRST_LOAD_MS_RANGE[0]}~${RAPIER_FIRST_LOAD_MS_RANGE[1]} ms`);
    expect(RAPIER_FIRST_LOAD_MS_RANGE[0]).toBeLessThan(RAPIER_FIRST_LOAD_MS_RANGE[1]);
    expect(RAPIER_GZIP_BYTES).toBeLessThan(RAPIER_CHUNK_BYTES);
    expect(RAPIER_FOOTPRINT_KO).toContain(RAPIER_GZIP_LABEL_KO);
    expect(RAPIER_FOOTPRINT_KO).toContain(RAPIER_FIRST_LOAD_LABEL_KO);
  });

  it("설치본 dist/rapier.mjs의 gzip -9 크기가 상수와 0.5 % 안에서 맞는다(패키지 버전이 바뀌어 수치가 낡으면 실패한다)", () => {
    expect(RAPIER_PACKAGE_VERSION).toBe("0.21.0");
    const file = path.join(APP_ROOT, "node_modules", "@dimforge", "rapier2d-compat", "dist", "rapier.mjs");
    const bytes = gzipSync(readFileSync(file), { level: 9 }).length;
    expect(Math.abs(bytes - RAPIER_GZIP_BYTES) / RAPIER_GZIP_BYTES).toBeLessThan(0.005);
  });

  it("실험 배지 설명·레인 디스크립터·그리기 화면 안내문·소스 주석이 같은 문구를 쓰고 옛 수치(1.28·1.30 MB)가 남지 않았다", () => {
    expect(experimentalDescription(laneById("bristle-rapier"))).toContain(RAPIER_FOOTPRINT_KO);
    expect(laneById("bristle-rapier").browserVerification).toContain(RAPIER_FOOTPRINT_KO);
    const drawLaneSelect = read("src/app/ui/DrawLaneSelect.tsx");
    expect(drawLaneSelect).toContain("RAPIER_GZIP_LABEL_KO");
    for (const rel of ["src/app/ui/DrawLaneSelect.tsx", "src/app/state/lane-maturity.ts", "src/lanes/physics/rapier-loader.ts", "src/lanes/physics/rapier-bristle-lane.ts", "README.md"]) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/1\.28 ?MB/);
      expect(text, rel).not.toMatch(/1\.30 ?MB/);
    }
    expect(read("src/lanes/physics/rapier-loader.ts")).toContain(RAPIER_GZIP_LABEL_KO);
  });

  it("README의 Rapier 서술이 같은 수치를 쓴다", () => {
    const readme = read("README.md");
    expect(readme).toContain(`JS gzip ${RAPIER_GZIP_LABEL_KO}`);
    expect(readme).toContain(RAPIER_FIRST_LOAD_LABEL_KO.replace("약 ", ""));
    expect(readme).toContain("rapier-footprint.ts");
  });
});
