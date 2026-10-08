import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

import { LIBRARY_GUIDE_AREAS_B } from "./engineering-library-guide-areas-b";
import { repoPathExists } from "./engineering-repo-paths-test-kit";

/**
 * 라이브러리 해설 영역 5~8 의 "숫자·상태 주장"이 저장소의 실제 값과 같은지 대조한다.
 * 계약 검사기(engineering-library-guide-content.test.ts)가 구조·경로·라이선스를 보는 것과 달리, 이 파일은 카드 본문에 적은
 * 개수·크기·허용 목록 같은 사실을 설정 파일에서 읽어 단언한다(하드코딩 금지). 값이 바뀌면 이 테스트가 먼저 실패해 문구를 고치게 한다.
 * 작업 트리에 내려받지 않을 수 있는 폴더(tests/benchmarks/results/, apps/web/public/vrm|assets/)의 파일 내용은 읽지 않는다.
 */

const read = (path: string): string => readFileSync(path, "utf8");
const area = (id: string): string => {
  const found = LIBRARY_GUIDE_AREAS_B.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`영역 ${id} 없음`);
  return JSON.stringify(found);
};

/** 풀 이름 없이 package.json 만 읽는다(루트·apps·packages). */
function workspaceManifests(): readonly Record<string, unknown>[] {
  const manifests: Record<string, unknown>[] = [JSON.parse(read("package.json")) as Record<string, unknown>];
  for (const group of ["apps", "packages"]) {
    if (!existsSync(group)) continue;
    for (const dir of readdirSync(group)) {
      const file = join(group, dir, "package.json");
      if (existsSync(file)) manifests.push(JSON.parse(read(file)) as Record<string, unknown>);
    }
  }
  return manifests;
}

const megabytes = (path: string): number => statSync(path).size / 1_000_000;

describe("라이브러리 해설 영역 5~8 · 숫자 주장", () => {
  it("pnpm 패치·override·포크 개수가 pnpm-workspace.yaml 과 저장소 폴더와 같다", () => {
    const workspace = parse(read("pnpm-workspace.yaml")) as { patchedDependencies?: Record<string, string>; overrides?: Record<string, string> };
    const patches = Object.keys(workspace.patchedDependencies ?? {}).length;
    const overrides = Object.keys(workspace.overrides ?? {}).length;
    const bracesFork = Object.entries(workspace.overrides ?? {}).some(([key, value]) => key.startsWith("braces@") && value === "file:patches/braces");
    expect(bracesFork, "braces 포크 override").toBe(true);
    expect(repoPathExists("patches/braces/package.json")).toBe(true);
    const forks = [bracesFork, repoPathExists("crates/vendor/wgpu-toon")].filter(Boolean).length;

    const build = area("build-quality-media");
    expect(build).toContain(`패치 ${patches}개`);
    expect(build).toContain(`override ${overrides}개`);
    expect(build).toContain(`${patches} patches`);
    expect(build).toContain(`${overrides} overrides`);
    expect(build).toContain(`포크 ${forks}개`);
    expect(build).toContain(`${forks} forks`);
    // 낡은 개수가 남지 않았는지: 본문에 적힌 "패치 N개"는 모두 현재 값이어야 한다.
    // (ag-psd 카드의 "pnpm 패치 1개"처럼 개별 패치를 가리키는 문장은 제외하고, 전체 묶음을 가리키는 문장만 본다.)
    for (const match of build.matchAll(/(?:라이브러리|pnpm) 패치 (\d+)개(?!로)/gu)) expect(Number(match[1])).toBe(patches);
    for (const match of build.matchAll(/(\d+) (?:pnpm |library )?patches/gu)) expect(Number(match[1])).toBe(patches);
  });

  it("Cloudflare Worker 먼저-실행 경로 개수와 Render 무료 플랜·수동 배포가 설정과 같다", () => {
    const wrangler = read("deploy/cloudflare-static/wrangler.jsonc").replace(/^\s*\/\/.*$/gmu, "");
    const block = /"run_worker_first"\s*:\s*\[([\s\S]*?)\]/u.exec(wrangler)?.[1] ?? "";
    const patterns = [...block.matchAll(/"[^"]+"/gu)].length;
    expect(patterns).toBeGreaterThan(0);
    const server = area("server-data");
    expect(server).toContain(`${patterns}개 경로`);
    expect(server).toContain(`${patterns} listed path patterns`);
    expect(server).toContain(`${patterns}개`);

    const render = read("render.yaml");
    expect(render).toMatch(/plan:\s*free/u);
    expect(render).toMatch(/autoDeployTrigger:\s*"off"/u);
  });

  it("Zod 를 같은 버전으로 고정한 워크스페이스 수가 package.json 들과 같다(API 소스 대조는 tests/integration/web-api 쪽)", () => {
    const server = area("server-data");
    const manifests = workspaceManifests();
    const rootZod = (manifests[0]?.dependencies as Record<string, string> | undefined)?.zod ?? "";
    expect(rootZod).toMatch(/^\d+\.\d+\.\d+$/u);
    const pinned = manifests.filter((manifest) => {
      const groups = [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies] as (Record<string, string> | undefined)[];
      return groups.some((group) => group?.zod === rootZod);
    }).length;
    expect(server).toContain(`${pinned}개 워크스페이스`);
    expect(server).toContain(`${pinned} workspaces`);
    expect(server).toContain(rootZod);
  });

  it("접근성 스모크 라우트 수가 e2e/a11y-smoke.spec.ts 와 같고 Rolldown 버전이 설치본과 같다", () => {
    const spec = read("e2e/a11y-smoke.spec.ts");
    const count = (name: string): number => [...(new RegExp(`${name} = \\[([\\s\\S]*?)\\]`, "u").exec(spec)?.[1] ?? "").matchAll(/"[^"]+"/gu)].length;
    const desktop = count("DESKTOP_A11Y_ROUTES");
    const mobile = count("MOBILE_A11Y_ROUTES");
    const build = area("build-quality-media");
    expect(build).toContain(`데스크톱 ${desktop}·모바일 ${mobile}`);
    expect(build).toContain(`${desktop} desktop, ${mobile} mobile`);

    const store = "node_modules/.pnpm";
    const versions = readdirSync(store)
      .filter((name) => name.startsWith("rolldown@"))
      .map((name) => (JSON.parse(read(join(store, name, "node_modules", "rolldown", "package.json"))) as { version: string }).version);
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.some((version) => build.includes(`Rolldown ${version}`))).toBe(true);
    expect(read("docs/perf/heavy-feature-findings.md")).toContain("91 %");
    expect(build).toContain("91%");
  });

  it("WASM·모델 파일 크기 주장이 설치본과 맞다(MB, 10진)", () => {
    const claims: readonly (readonly [string, string, number, number])[] = [
      ["storage", "node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm", 0.86, 0.05],
      ["ai", "node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm", 26.8, 0.2],
      ["ai", "node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm", 11.2, 0.1],
      ["ai", "node_modules/@techstark/opencv-js/dist/opencv.js", 13.3, 0.2],
      ["ai", "apps/web/src/domains/creator/assets/tag2pix.onnx", 79.3, 0.2],
    ];
    const texts = { storage: area("local-storage-pwa"), ai: area("ai-on-device") } as const;
    for (const [areaKey, path, claimed, tolerance] of claims) {
      expect(Math.abs(megabytes(path) - claimed), `${path} ≈ ${claimed}MB`).toBeLessThanOrEqual(tolerance);
      expect(texts[areaKey as keyof typeof texts], `${path} 문구`).toContain(String(claimed));
    }
    // 번역 모델(OPUS-MT q8)은 저장소에 없어 파일 크기를 잴 수 없다: 코드가 적은 합계 바이트와 대조한다.
    const translation = read("apps/web/src/domains/creator-resources/research-query-mt.ts");
    const modelBytes = Number((/RESEARCH_MT_MODEL_TOTAL_BYTES\s*=\s*([\d_]+)/u.exec(translation)?.[1] ?? "").replaceAll("_", ""));
    expect(Math.round(modelBytes / 1_000_000)).toBe(123);
    expect(texts.ai).toContain("약 123MB");
    expect(texts.ai).toContain("about 123 MB");
  });

  it("영역 5 의 대기 시간·유예·계약 버전 수치가 코드 상수와 같다", () => {
    const storage = area("local-storage-pwa");
    const handoff = read("apps/web/src/domains/creator/studio-local-database-worker-handoff.ts");
    const delays = [...(/STUDIO_DATABASE_HANDOFF_DELAYS_MS\s*=\s*\[([^\]]*)\]/u.exec(handoff)?.[1] ?? "").matchAll(/\d+/gu)].map((match) => Number(match[0]));
    expect(delays.length).toBeGreaterThan(0);
    const waitSeconds = delays.reduce((sum, delay) => sum + delay, 0) / 1000;
    expect(storage).toContain(`DB 락을 ${waitSeconds}초만`);
    expect(storage).toContain(`${waitSeconds} s for the DB lock`);

    const assetStore = read("apps/web/src/domains/creator/studio-opfs-asset-store.ts");
    const graceMs = Number((/const graceMs = options\.graceMs \?\? ([\d_]+)/u.exec(assetStore)?.[1] ?? "").replaceAll("_", ""));
    expect(graceMs).toBeGreaterThan(0);
    expect(storage).toContain(`${graceMs / 60_000}분 유예`);

    const policy = read("apps/web/src/app/service-worker/studio-service-worker-policy.ts");
    const version = /STUDIO_SERVICE_WORKER_CONTRACT_VERSION\s*=\s*(\d+)/u.exec(policy)?.[1];
    expect(version).toBeDefined();
    expect(storage).toContain(`계약 버전 ${version}`);
    expect(storage).toContain(`contract version ${version}`);
  });

  it("운영 CSP connect-src 가 IPFS 게이트웨이를 허용하지 않고, MediaPipe 모델 저장소와 AI 주소 4곳은 허용한다", () => {
    const headers = read("config/http-response-headers.json");
    const connect = /connect-src[^;"]*/u.exec(headers)?.[0] ?? "";
    expect(connect).toContain("'self'");
    const gateways = ["ipfs.io", "dweb.link", "trustless-gateway.link"];
    for (const host of gateways) expect(connect).not.toContain(host);
    const source = read("apps/web/src/domains/integrations/ipfs-content-address.ts");
    for (const host of gateways) expect(source).toContain(host);
    expect(connect).toContain("https://storage.googleapis.com");
    const aiHosts = ["api.openai.com", "openrouter.ai", "api.z.ai", "api.deepseek.com"];
    for (const host of aiHosts) expect(connect).toContain(host);
    for (const host of ["api.groq.com", "api.mistral.ai", "generativelanguage.googleapis.com"]) expect(connect).not.toContain(host);
    const storage = area("local-storage-pwa");
    expect(storage).toContain("게이트웨이 3곳");
    expect(area("ai-on-device")).toContain("4곳");
  });

  it("wasm-vips 선택 근거 수치가 코드 주석과 같고, LGPL·Remotion 라이선스 서술이 설치본과 같다", () => {
    const vips = read("apps/web/src/domains/creator/export/studio-vips-export.ts");
    const build = area("build-quality-media");
    for (const figure of ["27.26dB", "0.9887", "25.31dB/0.9834", "23.78dB/0.9768"]) expect(vips).toContain(figure);
    for (const figure of ["27.26", "0.9887", "25.31/0.9834", "23.78/0.9768"]) expect(build).toContain(figure);
    // 속도 수치(약 124ms 대 15~30ms)는 tests/benchmarks/results 를 읽지 않고, 같은 표를 옮겨 적은 문서와 대조한다.
    const survey = read("docs/candidates/filters/capability-survey.md");
    for (const figure of ["27.26dB", "25.31dB", "23.78dB", "123.6ms", "15.0ms", "30.0ms"]) expect(survey).toContain(figure);
    expect(build).toContain("15~30ms 대 124ms");
    expect(build).toContain("15 to 30 ms versus 124 ms");

    const notices = read("node_modules/wasm-vips/THIRD-PARTY-NOTICES.md");
    for (const library of ["libvips", "glib", "libheif"]) expect(notices).toMatch(new RegExp(`\\|\\s*${library}\\s*\\|\\s*LGPLv3`, "u"));
    expect((JSON.parse(read("node_modules/wasm-vips/package.json")) as { license: string }).license).toBe("MIT");
    const registry = read("packages/studio-engine-registry/src/filter-providers.ts");
    expect(registry).toContain("dev-only candidate");
    expect(registry).toContain("LGPL isolated deployment mode required");
    // docs/technology/engineering-libraries.md 6절 표는 "레지스트리 라벨(LGPL-2.1-or-later)과 설치본 고지(LGPLv3)가 다르다"고 적는다.
    // 레지스트리 라벨이 바뀌면 이 단언이 실패하니, 그때 문서의 해당 문장을 함께 고친다.
    expect(registry, "레지스트리 라벨이 바뀌었다: 문서 6절 wasm-vips 행을 고친다").toContain('license: "LGPL-2.1-or-later"');

    // Remotion 카드는 package 를 적지 않는다: 설치본 license 필드가 SPDX 가 아니라 안내 문구라 지도 행(Remotion License)과 대조할 수 없다.
    expect((JSON.parse(read("node_modules/remotion/package.json")) as { license: string }).license).toBe("SEE LICENSE IN LICENSE.md");
    expect(read("node_modules/remotion/LICENSE.md")).toMatch(/^\s*# Remotion License/u);
    expect(read("THIRD_PARTY_NOTICES.md")).toContain("Remotion License");
  });
});
