import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { LIBRARY_GUIDE_AREAS_A } from "./engineering-library-guide-areas-a";
import { LIBRARY_GUIDE_OVERVIEW } from "./engineering-library-guide-overview";
import { repoPathExists } from "./engineering-repo-paths-test-kit";

/**
 * 라이브러리 해설 영역 1~4(브러시·VRM/3D·2D 스튜디오·협업)와 한 장 요약이 본문에 적은 "숫자·버전·상태 주장"이
 * 저장소의 실제 값과 같은지 대조한다. 계약 검사기(engineering-library-guide-content.test.ts)가 구조·경로·라이선스를 보는 것과 달리,
 * 여기서는 개수·크기·고정 버전·ADR 상태처럼 시간이 지나면 어긋나기 쉬운 사실을 원본(설정·소스·문서)에서 읽어 단언한다(하드코딩 금지).
 * 값이 바뀌면 이 테스트가 먼저 실패해 문구를 고치게 한다.
 * 작업 트리에 내려받지 않을 수 있는 폴더(tests/benchmarks/results/, apps/web/public/vrm|assets/, artifacts/)의 파일 내용은 읽지 않는다.
 */

const read = (path: string): string => readFileSync(path, "utf8");

const area = (id: string): string => {
  const found = LIBRARY_GUIDE_AREAS_A.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`영역 ${id} 없음`);
  return JSON.stringify(found);
};
const card = (areaId: string, cardId: string): string => {
  const found = LIBRARY_GUIDE_AREAS_A.find((candidate) => candidate.id === areaId)?.libraries.find((item) => item.id === cardId);
  if (!found) throw new Error(`카드 ${areaId}/${cardId} 없음`);
  return JSON.stringify(found);
};
const everything = JSON.stringify([LIBRARY_GUIDE_OVERVIEW, LIBRARY_GUIDE_AREAS_A]);

const ENGLISH_NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"] as const;
const englishWord = (value: number): string => ENGLISH_NUMBER_WORDS[value] ?? String(value);

/** `export const NAME = Object.freeze([ "a", "b", ... ] as const` 처럼 문자열 배열 상수의 항목 수. */
function stringArrayLength(source: string, declaration: string): number {
  const start = source.indexOf(declaration);
  if (start < 0) throw new Error(`${declaration} 선언 없음`);
  const end = source.indexOf("] as const", start);
  return [...source.slice(start, end).matchAll(/"[^"]+"/gu)].length;
}

describe("라이브러리 해설 영역 1~4 · 숫자·상태 주장", () => {
  it("본문이 인용한 ADR 번호는 모두 docs/adr 에 있고 ADR-0026 이 Proposed 라는 서술이 실제 상태와 같다", () => {
    const numbers = new Set<string>();
    for (const match of everything.matchAll(/ADR-(\d{4})((?:·\d{4})*)/gu)) {
      numbers.add(match[1] as string);
      for (const rest of (match[2] ?? "").split("·").filter(Boolean)) numbers.add(rest);
    }
    expect(numbers.size).toBeGreaterThan(8);
    const files = readdirSync("docs/adr");
    for (const number of numbers) expect(files.some((name) => name.startsWith(`${number}-`)), `ADR-${number}`).toBe(true);

    const adr26 = files.find((name) => name.startsWith("0026-"));
    expect(adr26).toBeDefined();
    expect(read(join("docs/adr", adr26 as string))).toMatch(/^- 상태:\s*Proposed/mu);
    expect(area("vrm-3d-characters")).toContain("ADR-0026은 아직 Proposed");
    expect(area("vrm-3d-characters")).toContain("ADR-0026 is still Proposed");
  });

  it("정확히 고정했다고 쓴 버전은 루트 package.json 의 정확한 버전이고 설치본과 같다", () => {
    const manifest = JSON.parse(read("package.json")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const declared = { ...manifest.dependencies, ...manifest.devDependencies };
    const pins: readonly (readonly [string, string])[] = [
      ["canvaskit-wasm", "brush-engines"],
      ["perfect-freehand", "brush-engines"],
      ["@react-three/fiber", "vrm-3d-characters"],
      ["closed-chain-ik", "vrm-3d-characters"],
    ];
    for (const [name, areaId] of pins) {
      const spec = declared[name];
      expect(spec, `${name} 선언`).toMatch(/^\d+\.\d+\.\d+$/u);
      const installed = (JSON.parse(read(join("node_modules", name, "package.json"))) as { version: string }).version;
      expect(installed, `${name} 설치본`).toBe(spec);
      expect(area(areaId), `${name} 문구`).toContain(spec as string);
    }
    expect(JSON.stringify(LIBRARY_GUIDE_OVERVIEW)).toContain(`CanvasKit ${declared["canvaskit-wasm"] as string}`);

    const reactVersion = (JSON.parse(read("node_modules/react/package.json")) as { version: string }).version;
    expect(reactVersion.split(".")[0]).toBe("19");
    expect(card("canvas-2d-virtual-studio", "react")).toContain("React 19");
  });

  it("Hokusai 크레이트는 0.3.0 으로 정확히 고정돼 있고, 제품 자동 라우트에 오른 프리셋 목록은 비어 있다", () => {
    const cargo = read("packages/studio-hokusai-wasm/Cargo.toml");
    const pins = [...cargo.matchAll(/^(hokusai-(?:brush|core|tile-mem))\s*=\s*"=(\d+\.\d+\.\d+)"/gmu)];
    expect(pins.map((match) => match[1]).sort()).toEqual(["hokusai-brush", "hokusai-core", "hokusai-tile-mem"]);
    const versions = new Set(pins.map((match) => match[2]));
    expect([...versions]).toEqual(["0.3.0"]);
    expect(card("brush-engines", "hokusai")).toContain("0.3.0");

    const policy = read("apps/web/src/domains/creator/brush/studio-brush-backend-quality-policy.ts");
    expect(policy).toMatch(/STUDIO_HOKUSAI_PRODUCT_PROMOTED_PRESETS:\s*readonly [^=]+=\s*Object\.freeze\(\[\]\)/u);
    expect(card("brush-engines", "hokusai")).toContain("자동 라우트에 오른 프리셋은 0개");
    expect(card("brush-engines", "hokusai")).toContain("No preset is on the automatic route");
  });

  it("패치 이름과 개수가 pnpm-workspace.yaml 의 patchedDependencies 와 같다", () => {
    const workspace = parse(read("pnpm-workspace.yaml")) as { patchedDependencies?: Record<string, string> };
    const patched = Object.entries(workspace.patchedDependencies ?? {});
    const find = (name: string) => patched.find(([key]) => key.startsWith(`${name}@`));

    // 카드가 개별 패치를 말하는 곳: 패치 키가 있고 패치 파일이 실제로 있다.
    for (const name of ["p5.brush", "@react-three/fiber", "@gltf-transform/functions", "ktx2-encoder", "manifold-3d"]) {
      const entry = find(name);
      expect(entry, `${name} 패치`).toBeDefined();
      expect(repoPathExists((entry as [string, string])[1]), `${name} 패치 파일`).toBe(true);
    }
    expect(find("@react-three/fiber")?.[0]).toBe("@react-three/fiber@9.6.1");
    expect(read((find("@react-three/fiber") as [string, string])[1])).toContain("THREE.Clock is deprecated");
    expect(read((find("manifold-3d") as [string, string])[1])).toContain("new Function");

    // 영역 2 가 CSP 때문에 얹었다고 말하는 패치 묶음 = glTF Transform · ktx2-encoder · manifold-3d.
    const csp = ["@gltf-transform/functions", "ktx2-encoder", "manifold-3d"].filter((name) => find(name)).length;
    expect(area("vrm-3d-characters")).toContain(`패치 ${csp}개를 얹었습니다`);
    expect(area("vrm-3d-characters")).toContain(`${englishWord(csp)} patches adapt them`);
    // 같은 묶음에서 glTF Transform 카드가 직접 세는 패치 = glTF Transform · ktx2-encoder.
    const gltf = ["@gltf-transform/functions", "ktx2-encoder"].filter((name) => find(name)).length;
    expect(card("vrm-3d-characters", "gltf-transform")).toContain(`pnpm 패치 ${gltf}개`);
    expect(card("vrm-3d-characters", "gltf-transform")).toContain(`${englishWord(gltf).toLowerCase()} pnpm patches`);
  });

  it("뼈 이름 허용 목록 55개·필수 뼈 15개·획 레인 8가지가 코드 상수와 같다", () => {
    const names = stringArrayLength(read("apps/web/src/domains/creator/studio-humanoid-bones.ts"), "export const STUDIO_HUMANOID_BONE_NAMES");
    const required = stringArrayLength(read("apps/web/src/domains/creator/vrm/studio-vrm-proportion-core.ts"), "export const STUDIO_VRM_REQUIRED_HUMANOID_BONES");
    const lanes = stringArrayLength(read("apps/web/src/domains/creator/brush/studio-stroke-surface-route.ts"), "export const STUDIO_STROKE_SURFACE_ROUTE_PRIORITY");

    const vrm = card("vrm-3d-characters", "vrm-format");
    expect(vrm).toContain(`${names}개 이름 허용 목록`);
    expect(vrm).toContain(`allowlist of ${names} names`);
    expect(vrm).toContain(`필수 뼈 ${required}개`);
    expect(vrm).toContain(`${required} required bones`);

    const brush = area("brush-engines");
    expect(brush).toContain(`${lanes}가지 레인`);
    expect(brush).toContain(`one of ${englishWord(lanes).toLowerCase()} lanes`);
  });

  it("WASM 크기 주장(CanvasKit·libmypaint·OpenCascade.js)이 설치본·저장소 파일과 맞다", () => {
    const megabytes = (path: string): number => statSync(path).size / 1_000_000;
    const kilobytes = (path: string): number => statSync(path).size / 1_000;

    expect(Math.abs(megabytes("node_modules/canvaskit-wasm/bin/canvaskit.wasm") - 7.2)).toBeLessThanOrEqual(0.1);
    expect(card("brush-engines", "canvaskit")).toContain("약 7.2MB");
    expect(card("brush-engines", "canvaskit")).toContain("about 7.2 MB");

    expect(Math.abs(kilobytes("packages/studio-brush-platform/src/libmypaint/mypaint-wasm.wasm") - 83)).toBeLessThanOrEqual(1);
    expect(card("brush-engines", "libmypaint")).toContain("약 83KB");
    expect(card("brush-engines", "libmypaint")).toContain("about 83 KB");

    expect(Math.abs(megabytes("node_modules/opencascade.js/dist/opencascade.wasm.wasm") - 65.9)).toBeLessThanOrEqual(0.1);
    expect(card("vrm-3d-characters", "manifold-csg")).toContain("약 65.9MB");
    expect(card("vrm-3d-characters", "manifold-csg")).toContain("about 65.9 MB");
  });

  it("문서에서 가져온 수치(169/255·처리량 배수·76개 소스·Mixbox 2.0.0 핀)가 원문에 있다", () => {
    const promotion = read("docs/studio-bg3d-webgpu-engine-promotion-2026-08-29.md");
    expect(promotion).toContain("169/255");
    const vrm = card("vrm-3d-characters", "three-vrm");
    expect(vrm).toContain("최대 169/255, 2026-08-29");
    expect(vrm).toContain("up to 169/255, one model, 2026-08-29");

    // Hokusai 처리량: 원문의 wash·ink 배수(소수 셋째 자리까지 반올림)가 카드의 범위와 같다.
    const survey = read("docs/candidates/engine-portfolio/capability-survey.md");
    const ratios = /Hokusai\/libmypaint 처리량 ([\d.]+)×\(wash\), ([\d.]+)×\(ink\)/u.exec(survey);
    expect(ratios).not.toBeNull();
    const sorted = [Number(ratios?.[2]), Number(ratios?.[1])].sort((a, b) => a - b).map((value) => value.toFixed(3));
    const low = sorted[0] ?? "";
    const high = sorted[1] ?? "";
    expect(low).not.toBe("");
    expect(high).not.toBe("");
    const hokusai = card("brush-engines", "hokusai");
    expect(hokusai).toContain(`${low}~${high}배`);
    expect(hokusai).toContain(`${low} to ${high} times`);
    expect(read("docs/adr/0011-v12-frontier-quarantine-ledger.md")).toContain("2026-08-08 실측");
    expect(hokusai).toContain("2026-08-08");

    expect(read("packages/studio-brush-platform/src/ink-mesh/README.md")).toContain("76 translation units");
    expect(card("brush-engines", "google-ink")).toContain("76개 소스");
    expect(card("brush-engines", "google-ink")).toContain("76 translation units");

    const profile = read("apps/web/src/domains/creator/brush-lab/brush-studio-v6-license-profile.ts");
    expect(profile).toMatch(/id: "mixbox-js-v2",\s*label: "Mixbox",\s*version: "2\.0\.0"/u);
    expect(card("brush-engines", "mixbox")).toContain("2.0.0 감사 핀");
    expect(card("brush-engines", "mixbox")).toContain("2.0.0 audit pin");
  });

  it("경로#심볼로 적은 근거는 그 파일 안에 심볼이 실제로 있다", () => {
    let checked = 0;
    for (const entry of LIBRARY_GUIDE_AREAS_A) {
      for (const library of entry.libraries) {
        for (const path of library.paths) {
          const [file, symbol] = path.split("#", 2);
          if (!file || !symbol) continue;
          expect(repoPathExists(file), `${library.id}: ${file}`).toBe(true);
          expect(read(file), `${library.id}: ${path}`).toContain(symbol);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
