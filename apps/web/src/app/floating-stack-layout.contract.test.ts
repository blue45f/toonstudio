import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const sitewideCss = readFileSync(
  new URL("./styles/sitewide-visual-ux.css", import.meta.url),
  "utf8",
);
const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const appShell = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");
const ostPlayer = readFileSync(
  new URL("../shared/components/SiteBackgroundMusicPlayer.tsx", import.meta.url),
  "utf8",
);
const betaGate = readFileSync(
  new URL("../domains/creator/StudioBetaNoticeGate.tsx", import.meta.url),
  "utf8",
);
const degradedBanner = readFileSync(
  new URL("./service-state/ServiceDegradedBanner.tsx", import.meta.url),
  "utf8",
);

describe("하단 플로팅 스택 배치 계약", () => {
  it("알림 열 스택의 총 점유 높이를 --floating-stack-clearance 로 합성한다", () => {
    // 기본 합성: 연결 칩·상태 배너의 점유 높이와 OST 알약을 얹은 높이 중 큰 값.
    expect(sitewideCss).toContain("--floating-stack-clearance: max(");
    expect(sitewideCss).toContain("var(--service-status-overlay-clearance, 0px)");
    expect(sitewideCss).toContain("var(--site-ost-pill-height, 0px)");
    // 베타 안내가 떠 있으면 안내가 게시한 높이 + 간격(0.75rem)까지가 스택 총높이다.
    expect(sitewideCss).toContain(':root:has([data-studio-beta-notice-host="true"])');
    expect(sitewideCss).toContain("var(--first-run-notice-height, 0px) + 0.75rem");
  });

  it("셸 본문 하단 여백이 스택 총높이를 보장한다", () => {
    for (const source of [app, appShell]) {
      expect(source).toContain("pb-[max(5rem,var(--floating-stack-clearance,0px))]");
      expect(source).toContain("md:pb-[var(--floating-stack-clearance,0px)]");
    }
  });

  it("접힌 OST 알약이 자기 높이를 스택 합성용으로 게시한다", () => {
    expect(ostPlayer).toContain("SITE_OST_PILL_HEIGHT_PROPERTY");
    expect(ostPlayer).toContain(
      "useElementHeight(asideRef, SITE_OST_PILL_HEIGHT_PROPERTY, !dock && !expanded)",
    );
  });

  it("베타 안내는 서비스 웜업 동안 열리지 않고, 홍보 카드는 베타 안내에 순서를 양보한다", () => {
    expect(betaGate).toContain("useServiceCapabilityState");
    expect(betaGate).toContain('serviceState.status === "degraded" && serviceState.warmingUp === true');
    expect(betaGate).toContain("if (!eligible || !open || serviceWarmingUp) return null;");
    expect(sitewideCss).toContain(
      'body:has([data-studio-beta-notice-host="true"]) > [data-beta-open-prompt="engaged"]',
    );
  });

  it("고정 배너는 웜업 안내와 렌더링이 교체되는 전이에서도 점유 높이를 다시 잰다", () => {
    expect(degradedBanner).toContain(
      "`${state.status}:${state.warmingUp === true}:${compact}`",
    );
  });
});
