import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const appSource = readFileSync(
  join(process.cwd(), "apps/web/src/app/App.tsx"),
  "utf8",
);
const routerSource = readFileSync(
  join(process.cwd(), "apps/web/src/domains/admin/router/AdminRouter.tsx"),
  "utf8",
);
const paletteSource = readFileSync(
  join(
    process.cwd(),
    "apps/web/src/domains/admin/components/AdminQuickPalette.tsx",
  ),
  "utf8",
);
const shellSource = readFileSync(
  join(process.cwd(), "apps/web/src/domains/admin/shell/AdminShell.tsx"),
  "utf8",
);
const shellCssSource = readFileSync(
  join(process.cwd(), "apps/web/src/domains/admin/shell/admin-visual-v2.css"),
  "utf8",
);
const communitySource = readFileSync(
  new URL("./AdminCommunityPage.tsx", import.meta.url),
  "utf8",
);

describe("admin shell review regressions", () => {
  it("retains authentication and public-site actions outside the authorized shell", () => {
    expect(routerSource).toContain("<AuthMenuShell />");
    expect(routerSource).toContain('href="/"');
  });

  it("sets the KMAS one-shot latch only when the deferred request begins", () => {
    const runIndex = appSource.indexOf("const run = () =>");
    const latchIndex = appSource.indexOf("kmasEntryMergeStarted = true", runIndex);
    expect(runIndex).toBeGreaterThan(-1);
    expect(latchIndex).toBeGreaterThan(runIndex);
  });

  it("portals the command palette to the document body", () => {
    expect(paletteSource).toContain("createPortal(");
    expect(paletteSource).toContain("document.body");
  });

  it("keeps a public-site exit visible at mobile widths", () => {
    expect(shellSource).toContain("aria-label={copy.openPublicSite}");
    // 모바일에서도 44px 이상 터치 타깃을 유지한다.
    expect(shellSource).toContain('className="inline-flex min-h-11 min-w-11');
  });

  it("provides the completed admin gate to embedded legacy pages", () => {
    expect(routerSource).toContain("<AdminGateOverrideProvider value={gateState}>");
  });

  it("상속받은 전역 중립 토큰을 관리자 셸 CSS가 자체 값으로 재정의하지 않는다", () => {
    // 중립 표면·전경·경계는 @theme 토큰을 상속해야 테마·고대비 설정을 따라간다.
    // 셸이 --color-canvas 등을 다시 정의하면 관리자만 별도 팔레트로 이탈한다.
    expect(shellCssSource).not.toMatch(
      /--color-(canvas|panel|card|raised|line|line-strong|fg|fg-2|fg-3)\s*:/,
    );
  });

  it("관리자 셸 내부 공지가 #main-content에 게이트 여백과 배경을 입히지 않는다", () => {
    expect(shellCssSource).toContain(
      '#main-content:has([data-admin-notice="true"]):not(:has([data-admin-shell="true"]))',
    );
    expect(shellCssSource).not.toMatch(
      /#main-content:has\(\[data-admin-notice="true"\]\)\s*\{/,
    );
  });

  it("관리자 상태 색이 팔레트 클래스 대신 의미 토큰을 쓴다", () => {
    // 상태(정상·경고·위험·정보)는 good/warn/bad/cool 토큰으로만 표현한다.
    const componentFiles = [
      "AdminSecurity.tsx",
      "AdminHeaderStats.tsx",
      "AdminPromos.tsx",
      "AdminToast.tsx",
      "AdminReports.tsx",
      "AdminBusinessVerifications.tsx",
      "../traffic/WebVitalsDashboardPage.tsx",
    ];
    for (const file of componentFiles) {
      const source = readFileSync(
        join(process.cwd(), "apps/web/src/domains/admin/components", file),
        "utf8",
      );
      expect(source, file).not.toMatch(/(?:rose|emerald|amber|cyan|red|slate)-\d{3}/);
    }
  });

  it("mounts the dedicated Creator Market board inside the existing admin gate", () => {
    expect(communitySource).toContain(
      'import { CreatorMarketplaceModerationBoard } from "./components/CreatorMarketplaceModerationBoard";',
    );
    const adminGate = communitySource.indexOf('gate.kind === "admin"');
    const creatorMarketBoard = communitySource.indexOf("<CreatorMarketplaceModerationBoard />");
    const legacyAssetBoard = communitySource.indexOf("<AssetModerationBoard />");

    expect(adminGate).toBeGreaterThan(-1);
    expect(creatorMarketBoard).toBeGreaterThan(adminGate);
    expect(legacyAssetBoard).toBeGreaterThan(creatorMarketBoard);
  });
});
