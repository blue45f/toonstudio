import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * F5 배선 고정 테스트.
 *
 * 마감 위험 예보와 예약 발행 패널군은 모델·컴포넌트·테스트가 있어도
 * 소비처가 없으면 사용자에게 닿지 않는다(전수 조사 ③ 판정). 이 테스트는
 * 실제 표면 파일이 두 기능을 import해 렌더링하는지를 소스 수준에서 고정해,
 * 배선이 다시 끊기면 CI에서 바로 드러나게 한다.
 */
function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const EPISODE_OPERATIONS =
  "apps/web/src/domains/creator/production-hub/ProductionEpisodeOperationsWorkspace.tsx";
const PUBLISH_ROUTE =
  "apps/web/src/domains/creator/studio-router/routes/StudioPublishRoute.tsx";
const SERIES_SECTION =
  "apps/web/src/domains/creator/publish/PublishScheduleSeriesSection.tsx";
const SCHEDULE_PANEL =
  "apps/web/src/domains/creator/publish/PublishSchedulePanel.tsx";

describe("F5 배선: 마감 리스크 예보", () => {
  it("회차 운영 카드가 단계별 마감 계획과 같은 자리에서 예보를 렌더링한다", () => {
    const workspace = source(EPISODE_OPERATIONS);
    expect(workspace).toContain(
      'import { ProductionDeadlineRiskForecast } from "./ProductionDeadlineRiskForecast";',
    );
    expect(workspace).toContain("<ProductionDeadlineRiskForecast");
    expect(workspace).toContain("<ProductionStageDeadlinePlan");
    // 예보는 단계별 마감 계획 바로 아래에 붙는다 — 같은 aggregate·episodeId를 쓴다.
    const planIndex = workspace.indexOf("<ProductionStageDeadlinePlan");
    const forecastIndex = workspace.indexOf("<ProductionDeadlineRiskForecast");
    expect(planIndex).toBeGreaterThanOrEqual(0);
    expect(forecastIndex).toBeGreaterThan(planIndex);
  });
});

describe("F5 배선: 예약 발행 패널군", () => {
  it("게시 명령 센터 라우트가 시리즈 예약 섹션을 지연 로드로 마운트한다", () => {
    const route = source(PUBLISH_ROUTE);
    expect(route).toContain('import("../../publish/PublishScheduleSeriesSection")');
    expect(route).toContain("<PublishScheduleSeriesSection seriesId={seriesId} />");
    // 기존 게시 명령 센터 지연 로드 경계는 그대로 유지한다.
    expect(route).toContain('import("../../StudioPublishingCommandCenter")');
  });

  it("예약 섹션이 패널군과 시리즈 어댑터, localStorage 고지를 소비한다", () => {
    const section = source(SERIES_SECTION);
    expect(section).toContain("<PublishSchedulePanel");
    expect(section).toContain("publishScheduleEpisodeOptions");
    expect(section).toContain("studio.publish.schedule.localOnlyNotice");
    expect(section).toContain("getSeries");
  });

  it("패널이 캘린더와 다이얼로그를 함께 렌더링한다", () => {
    const panel = source(SCHEDULE_PANEL);
    expect(panel).toContain("<PublishScheduleCalendar");
    expect(panel).toContain("<PublishScheduleDialog");
  });
});
