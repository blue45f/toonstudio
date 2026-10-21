import { describe, expect, it } from "vitest";

import {
  STUDIO_MOBILE_TOUCH_PLANS,
  classifyStudioTouchViewport,
  resolveStudioMobileTouchPlan,
  shouldShowStudioMobileTouchNotice,
} from "./studio-mobile-touch-flow";
import { STUDIO_2D_WORKSPACE_SURFACES } from "./studio-workspace-route";

/**
 * 모바일·터치 제작 동선 정본 경계 테스트 (A7).
 *
 * 핵심 불변식: 안내가 약속하는 작업은 실제로 배선된 경로뿐이어야 하고,
 * 안 되는 작업은 모든 표면에서 명시돼야 한다. 특히 캔버스 도크가 없는 표면이
 * 도크 그리기를 자기 표면의 가능 작업으로 약속하면 "눌렀는데 안 되는" 거짓 안내가 된다.
 */
const ALL_SURFACES = [...STUDIO_2D_WORKSPACE_SURFACES, "dcc"] as const;
const CANVAS_DOCK_DRAW_KO = "모바일 도크 펜·지우개·도형·굵기 조절로 간단히 그리기·지우기";

describe("표면별 터치 계획 전수", () => {
  it("모든 편집 표면(2D 7종 + dcc)에 계획이 있고 등급이 고정된다", () => {
    expect(Object.keys(STUDIO_MOBILE_TOUCH_PLANS).sort()).toEqual([...ALL_SURFACES].sort());
    expect(resolveStudioMobileTouchPlan("canvas").tier).toBe("touch-edit");
    expect(resolveStudioMobileTouchPlan("comic").tier).toBe("touch-edit");
    expect(resolveStudioMobileTouchPlan("animation").tier).toBe("touch-assisted");
    expect(resolveStudioMobileTouchPlan("brushes").tier).toBe("touch-assisted");
    expect(resolveStudioMobileTouchPlan("character").tier).toBe("touch-assisted");
    expect(resolveStudioMobileTouchPlan("bg3d").tier).toBe("desktop-required");
    expect(resolveStudioMobileTouchPlan("poser").tier).toBe("desktop-required");
    expect(resolveStudioMobileTouchPlan("dcc").tier).toBe("desktop-required");
  });

  it("모든 계획이 되는 작업·안 되는 작업·최소 동선을 비어 있지 않게 가진다", () => {
    for (const surface of ALL_SURFACES) {
      const plan = resolveStudioMobileTouchPlan(surface);
      expect(plan.canDo.length, surface).toBeGreaterThanOrEqual(2);
      expect(plan.cannotDo.length, surface).toBeGreaterThanOrEqual(1);
      expect(plan.steps.length, surface).toBeGreaterThanOrEqual(3);
      for (const entry of [...plan.canDo, ...plan.cannotDo]) {
        expect(entry.ko.length, surface).toBeGreaterThan(0);
        expect(entry.en.length, surface).toBeGreaterThan(0);
      }
      // 안 되는 작업은 최소 하나가 "이 기기에서 안 돼요"를 명시해 진입 시점에 막는다.
      expect(
        plan.cannotDo.some((entry) => entry.ko.includes("안 돼요") || entry.ko.includes("데스크톱")),
        surface,
      ).toBe(true);
    }
  });

  it("캔버스 최소 동선은 컷 목록 → 컷 작업 → 도크 수정 → 빠른 작업 → 저장 확인 순서다", () => {
    const plan = resolveStudioMobileTouchPlan("canvas");
    expect(plan.steps.map((step) => step.id)).toEqual([
      "open-pages",
      "cut-basics",
      "dock-simple-edit",
      "selection-quick-fix",
      "check-autosave",
    ]);
    expect(plan.canDo.map((entry) => entry.ko)).toContain(CANVAS_DOCK_DRAW_KO);
    // 터치 컷 동선의 실배선 근거(StudioPageListPaneBase·StudioMobileEditingDock)와 문구가 맞는다.
    expect(plan.canDo.some((entry) => entry.ko.includes("여러 개 선택"))).toBe(true);
    expect(plan.canDo.some((entry) => entry.ko.includes("카드 버튼으로 순서"))).toBe(true);
  });

  it("도크가 없는 표면은 도크 그리기를 자기 가능 작업으로 약속하지 않는다", () => {
    for (const surface of ["bg3d", "poser", "dcc", "animation", "character"] as const) {
      const plan = resolveStudioMobileTouchPlan(surface);
      expect(plan.canDo.map((entry) => entry.ko), surface).not.toContain(CANVAS_DOCK_DRAW_KO);
      // 대신 캔버스로 이동하는 대체 경로를 가능 목록에 명시한다.
      expect(plan.canDo.some((entry) => entry.ko.includes("캔버스 표면으로 이동")), surface).toBe(true);
    }
  });

  it("데스크톱 필수 표면은 표면 자체 편집이 안 됨을 가능 목록보다 먼저 읽히게 명시한다", () => {
    for (const surface of ["bg3d", "poser", "dcc"] as const) {
      const plan = resolveStudioMobileTouchPlan(surface);
      expect(plan.cannotDo[0]?.ko, surface).toContain("이 기기에서 안 돼요");
      expect(plan.cannotDo[0]?.ko, surface).toContain("데스크톱");
    }
  });

  it("모르는 표면은 편집 가능을 약속하지 않는 fail-closed 기본값으로 떨어진다", () => {
    const plan = resolveStudioMobileTouchPlan("some-future-surface");
    expect(plan.tier).toBe("desktop-required");
    expect(plan.canDo.map((entry) => entry.ko)).not.toContain(CANVAS_DOCK_DRAW_KO);
    expect(plan.cannotDo[0]?.ko).toContain("이 기기에서 안 돼요");
  });
});

describe("터치 뷰포트 분류", () => {
  it("좁은 폭은 포인터 종류와 무관하게 터치 동선이다(기존 모바일 레이아웃 경계 유지)", () => {
    expect(classifyStudioTouchViewport({ widthPx: 390, pointerCoarse: true })).toBe("touch-narrow");
    expect(classifyStudioTouchViewport({ widthPx: 834, pointerCoarse: true })).toBe("touch-narrow");
    expect(classifyStudioTouchViewport({ widthPx: 1023, pointerCoarse: false })).toBe("touch-narrow");
  });

  it("태블릿 가로(데스크톱 폭 + 거친 포인터)는 안내 대상이다", () => {
    expect(classifyStudioTouchViewport({ widthPx: 1180, pointerCoarse: true })).toBe("touch-tablet");
    expect(classifyStudioTouchViewport({ widthPx: 1366, pointerCoarse: true })).toBe("touch-tablet");
    expect(shouldShowStudioMobileTouchNotice({ widthPx: 1180, pointerCoarse: true })).toBe(true);
  });

  it("데스크톱 폭+마우스와 초대형 터치 화면은 안내 대상이 아니다", () => {
    expect(classifyStudioTouchViewport({ widthPx: 1280, pointerCoarse: false })).toBe("desktop");
    expect(classifyStudioTouchViewport({ widthPx: 1440, pointerCoarse: true })).toBe("desktop");
    expect(shouldShowStudioMobileTouchNotice({ widthPx: 1280, pointerCoarse: false })).toBe(false);
  });
});
