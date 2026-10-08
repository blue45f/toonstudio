import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ARCHITECTURE_DELIVERY_SECTIONS } from "./engineering-architecture-guide-delivery";

/**
 * 아키텍처 해설 · 만들고 지키는 구조(8~12번) 구간이 화면에 내보내는 구조 수치를 코드·설정과 대조한다.
 * 구간의 일반 계약(길이·경로·도감 id·도식)은 engineering-architecture-guide-content.test.ts 가 검사하므로 여기서는 수치만 본다.
 *
 * 규칙: 구조를 이루는 상수(앱·패키지 개수, 승인 SHA 자릿수, 프로토콜 버전, CI 필수 잡 수 …)만 정확히 대조한다.
 * 정리가 진행되며 해마다 달라지는 수치(래칫 상한, 시나리오 수 등)는 구간 안에서 "2026-10-08 기준"으로 날짜를 달고 여기서는 고정하지 않는다.
 * 읽는 파일은 모두 apps·packages·config·scripts·e2e·.github·render.yaml 안에 있다(docs·assets 는 읽지 않는다: 부분 체크아웃 호환).
 */

const read = (path: string): string => readFileSync(path, "utf8");

const directoriesIn = (path: string): string[] =>
  readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
    .map((entry) => entry.name);

/** `const NAME = [ "a", "b" ]` 꼴 배열에서 따옴표 항목을 센다. */
const quotedItems = (source: string, pattern: RegExp): string[] => {
  const block = pattern.exec(source)?.[1];
  if (block === undefined) throw new Error(`배열을 찾지 못함: ${pattern}`);
  return [...block.matchAll(/["']([^"']+)["']/gu)].map((match) => match[1] as string);
};

const sectionOf = (id: string) => {
  const found = ARCHITECTURE_DELIVERY_SECTIONS.find((section) => section.id === id);
  if (!found) throw new Error(`구간이 없음: ${id}`);
  return found;
};

const factValues = (id: string): string[] => (sectionOf(id).facts ?? []).map((fact) => fact.value);
const diagramText = (id: string): string => JSON.stringify(sectionOf(id).diagram);
const hint = "구간의 수치를 코드에 맞게 고치세요(engineering-architecture-guide-delivery-*.ts)";

describe("아키텍처 해설 · 만들고 지키는 구조 구간", () => {
  it("번호 8~12 와 id·묶음이 고정이다", () => {
    expect(ARCHITECTURE_DELIVERY_SECTIONS.map((section) => [section.number, section.id, section.group])).toEqual([
      [8, "monorepo-layout", "delivery"],
      [9, "build-and-ship", "delivery"],
      [10, "front-back-alignment", "delivery"],
      [11, "quality-gates", "delivery"],
      [12, "ai-assisted-dev", "delivery"],
    ]);
  });

  it("도식 종류를 섞어 쓴다(계층·그래프·순서도·계층·그래프)", () => {
    expect(ARCHITECTURE_DELIVERY_SECTIONS.map((section) => section.diagram.kind)).toEqual([
      "layers",
      "graph",
      "sequence",
      "layers",
      "graph",
    ]);
  });

  it(`monorepo-layout: 앱 7개·공유 패키지 13개·래칫 규칙 17개가 저장소와 같다 — ${hint}`, () => {
    const apps = directoriesIn("apps");
    const packages = directoriesIn("packages");
    const ratchetKeys = Object.keys(JSON.parse(read("config/architecture-boundary-ratchet.json")) as Record<string, number>);
    expect(apps).toHaveLength(7);
    expect(packages).toHaveLength(13);
    expect(ratchetKeys).toHaveLength(17);
    expect(factValues("monorepo-layout")).toEqual(expect.arrayContaining(["7", "13", "17"]));
    const text = diagramText("monorepo-layout");
    expect(text).toContain("앱 7개");
    expect(text).toContain("공유 패키지 13개");
    expect(text).toContain("경계 래칫 17개 규칙");
    // 작업공간이 앱·패키지·교차 앱 시험을 한 곳에 묶는다.
    const workspace = read("pnpm-workspace.yaml");
    for (const glob of ["apps/*", "packages/*", "tests/integration/*"]) expect(workspace).toContain(glob);
  });

  it(`monorepo-layout: 앱 사이 6방향 import 와 계약 패키지의 환경 전용 import 는 0으로 고정이다 — ${hint}`, () => {
    const ratchet = JSON.parse(read("config/architecture-boundary-ratchet.json")) as Record<string, number>;
    for (const key of ["webToAdmin", "webToApi", "adminToWeb", "adminToApi", "apiToWeb", "apiToAdmin", "contractsToApps", "contractsForbiddenImport"]) {
      expect(ratchet[key], key).toBe(0);
    }
    const boundaries = read("scripts/validate-app-boundaries.mjs");
    for (const forbidden of ["react", "react-dom", "@nestjs/", "express", "socket.io", "node:"]) {
      expect(boundaries).toContain(`"${forbidden}"`);
    }
  });

  it(`build-and-ship: CI core 필수 잡 7개·회귀 샤드 5개·SHA 40자리·실행 명령 6개·자동 배포 꺼진 Render 서비스 2개 — ${hint}`, () => {
    const ci = read(".github/workflows/ci.yml");
    expect(quotedItems(ci, /const required = \[([^\]]*)\]/u)).toEqual(["lint", "typecheck", "static", "serial", "a11y", "build", "database"]);
    expect(quotedItems(read("scripts/ci-core-regression-shards-impl.mjs"), /SHARD_NAMES = Object\.freeze\(\[([^\]]*)\]/u)).toHaveLength(5);

    const deploy = read("scripts/deploy-cloudflare-static.mjs");
    expect(deploy).toContain("[0-9a-f]{40}");
    expect(deploy).toContain("TOONSPECTRUM_APPROVED_MAIN_SHA");
    expect(deploy.match(/executable:/gu)).toHaveLength(6);

    expect(read("render.yaml").match(/autoDeployTrigger:\s*"off"/gu)).toHaveLength(2);

    expect(factValues("build-and-ship")).toEqual(["7", "40", "6", "2"]);
    const text = `${diagramText("build-and-ship")}${JSON.stringify(sectionOf("build-and-ship").steps)}`;
    expect(text).toContain("7개 잡");
    expect(text).toContain("40자리");
  });

  it(`front-back-alignment: SHA 40자리·buildId 12자·프로토콜 버전 8(웹 쪽 선언)이 코드와 같다 — ${hint}`, () => {
    const shaGates = [
      "scripts/deploy-cloudflare-static.mjs",
      ".github/workflows/production-database-migrations.yml",
      ".github/workflows/api-container-release.yml",
    ];
    for (const path of shaGates) expect(read(path), path).toContain("{40}");

    expect(read("apps/web/src/app/service-worker/studio-service-worker-precache-plan.ts")).toContain(".slice(0, 12)");

    // API 쪽 선언·z.literal·CSRF 가져오기는 앱 사이를 가로지르는 단언이라 tests/integration/web-api/domains/legal/technology 의 api-facts 시험이 맡는다.
    expect(/STUDIO_CRDT_PROTOCOL_VERSION = (\d+) as const/u.exec(read("apps/web/src/domains/creator/live/studio-crdt-protocol.ts"))?.[1]).toBe("8");
    expect(read("tests/integration/api-web/api/modules/creator/studio-live.protocol.test.ts")).toContain(
      "expect(protocol.STUDIO_CRDT_PROTOCOL_VERSION).toBe(BROWSER_STUDIO_CRDT_PROTOCOL_VERSION)",
    );

    expect(factValues("front-back-alignment")).toEqual(["40", "12", "8"]);
  });

  it("front-back-alignment: '같은 SHA 로 묶여 있다'는 단정은 오해 방지 문구(pitfall)에서만 쓴다", () => {
    const { pitfall, ...rest } = sectionOf("front-back-alignment");
    expect(pitfall?.ko).toContain("말하지 마세요");
    expect(JSON.stringify(rest)).not.toMatch(/SHA 로 묶/u);
    expect(JSON.stringify(rest)).not.toMatch(/bound by the same SHA/iu);
  });

  it(`quality-gates: 잡 7개·규칙 17개·새 파일 1,000줄·접근성 시나리오가 설정과 같다 — ${hint}`, () => {
    expect(read("apps/web/src/shared/lib/__tests__/file-size-ratchet.test.ts")).toContain("NEW_FILE_MAX_LINES = 1000");
    const spec = read("e2e/a11y-smoke.spec.ts");
    expect(quotedItems(spec, /DESKTOP_A11Y_ROUTES = \[([^\]]*)\]/u)).toHaveLength(10);
    expect(quotedItems(spec, /MOBILE_A11Y_ROUTES = \[([^\]]*)\]/u)).toHaveLength(4);
    // 줄 머리의 test( 는 4곳: 데스크톱 반복 1 + 터치 시험 2 + 모바일 반복 1 → 시나리오 10 + 2 + 4 = 16 (구간 facts 의 스냅샷 값).
    expect(spec.match(/^\s*test\(/gmu)).toHaveLength(4);
    const source = JSON.parse(read("config/architecture-source-ratchet.json")) as { lintStrictMaxWarnings: number };
    expect(source.lintStrictMaxWarnings).toBeGreaterThan(0);
    expect(read("package.json")).toContain(`--max-warnings=${source.lintStrictMaxWarnings}`);
    expect(factValues("quality-gates")).toEqual(expect.arrayContaining(["7", "17", "5"]));
    // 번들 크기는 마지막으로 받아들인 측정값(baseline)에서 2% 넘게 커지면 실패하는 래칫이고, CI build 잡이 이 검사를 돌린다.
    const bundleCheck = read("scripts/check-studio-bundle.mjs");
    expect(bundleCheck).toContain("byteTolerance: 0.02");
    expect(bundleCheck).toContain("bundle-baseline.json");
    expect(read(".github/workflows/ci.yml")).toContain("pnpm run check:studio-bundle");
    // 병합을 막는 잡 목록이 구간 설명과 같다.
    expect(read(".github/workflows/ci.yml")).toContain("needs: [lint, typecheck, static, serial, a11y, build, database]");
  });

  it(`ai-assisted-dev: 하네스 필수 파일 19개·AGENTS.md 10개(루트 1 + 하위 9)·어댑터 5개가 코드와 같다 — ${hint}`, () => {
    const harness = read("scripts/agent-harness.mjs");
    const required = quotedItems(harness, /const REQUIRED_FILES = \[([^\]]*)\]/u);
    const adapters = quotedItems(harness, /const ADAPTER_FILES = \[([^\]]*)\]/u);
    expect(required).toHaveLength(19);
    expect(required.filter((path) => path.endsWith("AGENTS.md"))).toHaveLength(10);
    expect(adapters).toHaveLength(5);
    expect(factValues("ai-assisted-dev")).toEqual(["19", "1 + 9", "5", "7"]);
    // 한글 커밋 제목 규칙이 commitlint 에 연결되어 있다.
    expect(read("commitlint.config.cjs")).toContain('"subject-korean": [2, "always"]');
  });
});
