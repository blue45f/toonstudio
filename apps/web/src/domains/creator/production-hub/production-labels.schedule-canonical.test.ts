import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  EPISODE_DEADLINE_HEALTH_LABELS,
  EPISODE_STATE_LABELS,
  SCHEDULE_RISK_LABELS,
  SCOPE_KIND_LABELS,
  TASK_STATUS_LABELS,
  episodeDeadlineHealthLabel,
  episodeStateLabel,
  scheduleRiskLabel,
  scopeKindLabel,
  taskStatusLabel,
} from "./production-labels";

const ko = (text: string) => text;
const en = (_ko: string, text: string) => text;

function expectBilingual(map: Readonly<Record<string, { readonly ko: string; readonly en: string }>>) {
  for (const label of Object.values(map)) {
    expect(label.ko.length).toBeGreaterThan(0);
    expect(label.en.length).toBeGreaterThan(0);
    expect(label.en).not.toBe(label.ko);
  }
}

describe("일정·회차 운영 라벨 정본 (schedule-labels-canonical)", () => {
  it("작업 상태 14종이 정본에만 있고 이전 한국어 문구와 같다", () => {
    expect(Object.keys(TASK_STATUS_LABELS).sort()).toEqual([
      "approved",
      "blocked",
      "cancelled",
      "changes-requested",
      "conditionally-approved",
      "done",
      "draft",
      "external-review",
      "in-progress",
      "internal-review",
      "needs-input",
      "out-of-scope",
      "paused",
      "ready",
    ]);
    expectBilingual(TASK_STATUS_LABELS);
    // 이전 ProductionScheduleWorkspace 로컬 STATUS_LABEL 의 한국어 결과값 고정.
    expect(taskStatusLabel("draft", ko)).toBe("초안");
    expect(taskStatusLabel("needs-input", ko)).toBe("입력 필요");
    expect(taskStatusLabel("ready", ko)).toBe("시작 가능");
    expect(taskStatusLabel("in-progress", ko)).toBe("진행 중");
    expect(taskStatusLabel("internal-review", ko)).toBe("내부 검수");
    expect(taskStatusLabel("external-review", ko)).toBe("외부 검수");
    expect(taskStatusLabel("changes-requested", ko)).toBe("수정 요청");
    expect(taskStatusLabel("conditionally-approved", ko)).toBe("조건부 승인");
    expect(taskStatusLabel("approved", ko)).toBe("승인");
    expect(taskStatusLabel("done", ko)).toBe("완료");
    expect(taskStatusLabel("blocked", ko)).toBe("차단");
    expect(taskStatusLabel("paused", ko)).toBe("일시 중지");
    expect(taskStatusLabel("cancelled", ko)).toBe("취소");
    expect(taskStatusLabel("out-of-scope", ko)).toBe("범위 밖");
    expect(taskStatusLabel("in-progress", en)).toBe("In progress");
    expect(taskStatusLabel("out-of-scope", en)).toBe("Out of scope");
  });

  it("회차 상태 19종은 기존 정본을 그대로 쓰고 en 에서 영문이 나온다", () => {
    expect(Object.keys(EPISODE_STATE_LABELS)).toHaveLength(19);
    expectBilingual(EPISODE_STATE_LABELS);
    expect(episodeStateLabel("thumbnailing", ko)).toBe("콘티 제작");
    expect(episodeStateLabel("thumbnailing", en)).toBe("Storyboarding");
    // 정본 단일화로 달라지는 유일한 한국어: 로컬 "변경 요청 중" → 정본 "변경 검토".
    expect(episodeStateLabel("change-request-open", ko)).toBe("변경 검토");
    expect(episodeStateLabel("change-request-open", en)).toBe("Change review");
  });

  it("회차 마감 건강도 5종이 정본에 있고 이전 한국어 문구와 같다", () => {
    expect(Object.keys(EPISODE_DEADLINE_HEALTH_LABELS).sort()).toEqual([
      "critical",
      "healthy",
      "published",
      "risk",
      "unplanned",
    ]);
    expectBilingual(EPISODE_DEADLINE_HEALTH_LABELS);
    expect(episodeDeadlineHealthLabel("published", ko)).toBe("공개 완료");
    expect(episodeDeadlineHealthLabel("critical", ko)).toBe("즉시 조치");
    expect(episodeDeadlineHealthLabel("risk", ko)).toBe("일정 주의");
    expect(episodeDeadlineHealthLabel("healthy", ko)).toBe("일정 정상");
    expect(episodeDeadlineHealthLabel("unplanned", ko)).toBe("마감 미정");
    expect(episodeDeadlineHealthLabel("healthy", en)).toBe("On schedule");
  });

  it("일정 위험 5단계와 범위 종류 9종이 정본에 있고 이전 한국어 문구와 같다", () => {
    expect(Object.keys(SCHEDULE_RISK_LABELS).sort()).toEqual([
      "attention",
      "forecast",
      "normal",
      "overdue",
      "predicted",
    ]);
    expectBilingual(SCHEDULE_RISK_LABELS);
    expect(scheduleRiskLabel("normal", ko)).toBe("정상");
    expect(scheduleRiskLabel("attention", ko)).toBe("주의");
    expect(scheduleRiskLabel("predicted", ko)).toBe("예측 위험");
    expect(scheduleRiskLabel("forecast", ko)).toBe("예상 초과");
    expect(scheduleRiskLabel("overdue", ko)).toBe("기한 초과");
    expect(scheduleRiskLabel("overdue", en)).toBe("Overdue");

    expect(Object.keys(SCOPE_KIND_LABELS).sort()).toEqual([
      "asset",
      "cut",
      "deliverable",
      "episode",
      "layer-group",
      "project",
      "scene",
      "scroll-segment",
      "season",
    ]);
    expectBilingual(SCOPE_KIND_LABELS);
    expect(scopeKindLabel("project", ko)).toBe("프로젝트");
    expect(scopeKindLabel("scroll-segment", ko)).toBe("스크롤");
    expect(scopeKindLabel("deliverable", ko)).toBe("산출물");
    expect(scopeKindLabel("layer-group", en)).toBe("Layer group");
  });

  it("두 워크스페이스에 로컬 상태 라벨 맵 정의가 없고 정본 헬퍼만 소비한다", () => {
    const schedule = readFileSync(new URL("./ProductionScheduleWorkspace.tsx", import.meta.url), "utf8");
    const episodes = readFileSync(
      new URL("./ProductionEpisodeOperationsWorkspace.tsx", import.meta.url),
      "utf8",
    );

    for (const source of [schedule, episodes]) {
      expect(source).not.toMatch(/const\s+(STATUS_LABEL|EPISODE_STATE_LABELS|HEALTH_LABELS)\b/);
      expect(source).not.toContain("STATUS_LABEL[");
      expect(source).not.toContain("EPISODE_STATE_LABELS[");
      expect(source).not.toContain("HEALTH_LABELS[");
    }
    expect(schedule).toContain("taskStatusLabel(task.status, bt)");
    expect(schedule).toContain("taskStatusLabel(status, bt)");
    expect(schedule).toContain("scheduleRiskLabel(risk, bt)");
    expect(schedule).toContain("scopeKindLabel(task.scope.kind, localize)");
    expect(schedule).not.toContain("function riskLabel");
    expect(episodes).toContain("episodeStateLabel(row.episode.state, bt)");
    expect(episodes).toContain("episodeDeadlineHealthLabel(health, bt)");
  });
});
