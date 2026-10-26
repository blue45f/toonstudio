import { describe, expect, it } from "vitest";

import {
  CLAUDE_CREATOR_TASK_PROFILES,
  CLAUDE_CREATOR_TASK_ROUTES,
  resolveCreatorTaskModelRoute,
  summarizeCreatorModelRouterCatalog,
} from "./claude-creator-model-router";

describe("claude-creator-model-router (Task-Aware Smart Model Router)", () => {
  it("3단계 프로필(fast-inline, creative-production, deep-architecture)을 정의하고 전체 AI 작업을 최적 모델로 매핑한다", () => {
    expect(CLAUDE_CREATOR_TASK_PROFILES["fast-inline"].model).toBe("claude-haiku-5-5");
    expect(CLAUDE_CREATOR_TASK_PROFILES["creative-production"].model).toBe("claude-sonnet-5-5");
    expect(CLAUDE_CREATOR_TASK_PROFILES["deep-architecture"].model).toBe("claude-opus-5-5");

    const summary = summarizeCreatorModelRouterCatalog();
    expect(summary.totalTasks).toBe(Object.keys(CLAUDE_CREATOR_TASK_ROUTES).length);
    expect(summary.byModel["claude-haiku-5-5"]).toBeGreaterThanOrEqual(6);
    expect(summary.byModel["claude-sonnet-5-5"]).toBeGreaterThanOrEqual(12);
    expect(summary.byModel["claude-opus-5-5"]).toBeGreaterThanOrEqual(7);
  });

  it("작업 특성에 맞춰 기본 모델과 effort를 자동 선택하고, 명시적 model 오버라이드는 그대로 존중한다", () => {
    const fastRoute = resolveCreatorTaskModelRoute("ecosystem:glimnavi-color-hint-stroke");
    expect(fastRoute.profile).toBe("fast-inline");
    expect(fastRoute.model).toBe("claude-haiku-5-5");
    expect(fastRoute.effort).toBe("low");
    expect(fastRoute.explicitOverride).toBe(false);

    const creativeRoute = resolveCreatorTaskModelRoute("ecosystem:novelai-multi-char-vibe");
    expect(creativeRoute.profile).toBe("creative-production");
    expect(creativeRoute.model).toBe("claude-sonnet-5-5");
    expect(creativeRoute.effort).toBe("low");

    const deepRoute = resolveCreatorTaskModelRoute("fusion:lore-foreshadow-integrity");
    expect(deepRoute.profile).toBe("deep-architecture");
    expect(deepRoute.model).toBe("claude-opus-5-5");
    expect(deepRoute.effort).toBe("medium");

    const overridden = resolveCreatorTaskModelRoute("ecosystem:glimnavi-color-hint-stroke", {
      model: "claude-opus-5-5",
      effort: "high",
    });
    expect(overridden.explicitOverride).toBe(true);
    expect(overridden.model).toBe("claude-opus-5-5");
    expect(overridden.effort).toBe("high");
  });

  it("웹툰 일관성 확보(Webtoon Consistency) 전용 10대 창의 AI 작업을 포함한 총 61개 라우팅 카탈로그를 검증한다", () => {
    const summary = summarizeCreatorModelRouterCatalog();
    expect(summary.totalTasks).toBe(61);
    expect(summary.byProfile["fast-inline"]).toBe(12);
    expect(summary.byProfile["creative-production"]).toBe(31);
    expect(summary.byProfile["deep-architecture"]).toBe(18);

    expect(
      resolveCreatorTaskModelRoute("ecosystem:asymmetric-costume-prop-wound-ledger").model,
    ).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("ecosystem:camera-axis-eyeline-height-lock").model).toBe(
      "claude-opus-5-5",
    );
    expect(
      resolveCreatorTaskModelRoute("ecosystem:cross-cut-color-script-albedo-lock").model,
    ).toBe("claude-haiku-5-5");
    expect(
      resolveCreatorTaskModelRoute("ecosystem:micro-expression-acting-continuity").model,
    ).toBe("claude-sonnet-5-5");
    expect(resolveCreatorTaskModelRoute("nextgen:visual-continuity-linter").model).toBe(
      "claude-opus-5-5",
    );
    expect(resolveCreatorTaskModelRoute("nextgen:multi-episode-canon-vault").model).toBe(
      "claude-sonnet-5-5",
    );
    expect(
      resolveCreatorTaskModelRoute("competitor:turnaround-orthographic-sheet-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("competitor:background-perspective-prop-scale-lock").model,
    ).toBe("claude-opus-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:multi-character-crowd-wardrobe-lock").model,
    ).toBe("claude-sonnet-5-5");
    expect(
      resolveCreatorTaskModelRoute("production:weather-particle-time-progression-lock").model,
    ).toBe("claude-haiku-5-5");
  });
});
