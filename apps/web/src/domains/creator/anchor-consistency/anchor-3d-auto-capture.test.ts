import { describe, expect, it, vi } from "vitest";

import {
  ANCHOR_FOUR_VIEW_TURNTABLE_ANGLES,
  buildAnchor3dSheetLayout,
  executeAnchor3dAutoCapture,
  planAnchor3dTurntableCapture,
  type Anchor3dStageRendererAdapter,
} from "./anchor-3d-auto-capture";

function createFakeAdapter(options: {
  readonly duplicateFrame?: boolean;
  readonly failOnAngle?: string;
} = {}): Anchor3dStageRendererAdapter & {
  readonly appliedAngles: string[];
  readonly restored: () => boolean;
} {
  const appliedAngles: string[] = [];
  let isRestored = false;
  return {
    appliedAngles,
    restored: () => isRestored,
    applyNeutralStudioLighting: vi.fn(),
    applyCameraPose: vi.fn((pose) => {
      appliedAngles.push(pose.angleId);
    }),
    captureFrame: vi.fn(async ({ angleId, width, height }) => {
      if (options.failOnAngle === angleId) {
        throw new Error("GPU 컨텍스트 손실");
      }
      const seed = options.duplicateFrame ? 42 : angleId.charCodeAt(0) + angleId.length * 17;
      const bytes = new Uint8Array([seed, seed ^ 0x55, 0x89, 0x50, 0x4e, 0x47]);
      return { bytes, width, height, mimeType: "image/png" as const };
    }),
    restoreStageState: vi.fn(() => {
      isRestored = true;
    }),
  };
}

describe("anchor-3d-auto-capture", () => {
  it("정면·반측면·측면·후면 4뷰 턴테이블을 원클릭 자동 캡처하고 2×2 시트 레이아웃을 생성한다", async () => {
    const adapter = createFakeAdapter();
    const progressCalls: string[] = [];

    const report = await executeAnchor3dAutoCapture(adapter, {
      anchorId: "hero-sora-v1",
      characterId: "char-sora",
      displayName: "소라 기본복",
      subject: { height: 1.68 },
      mode: "four-view",
      nowIso: () => "2026-11-20T09:00:00.000Z",
      onStepProgress: ({ angleId }) => progressCalls.push(angleId),
    });

    expect(report.status).toBe("ok");
    expect(report.stageRestored).toBe(true);
    expect(adapter.restored()).toBe(true);
    expect(adapter.appliedAngles).toEqual([...ANCHOR_FOUR_VIEW_TURNTABLE_ANGLES]);
    expect(progressCalls).toEqual(["front", "left-34", "left", "back"]);
    expect(report.frames).toHaveLength(4);
    expect(report.verification.valid).toBe(true);
    expect(report.verification.completenessScore01).toBe(1);
    expect(report.sheetLayout.columns).toBe(2);
    expect(report.sheetLayout.rows).toBe(2);
    expect(report.sheetLayout.cells).toHaveLength(4);
  });

  it("카메라가 움직이지 않아 동일 프레임이 중복 캡처되면 검증 오류를 보고한다", async () => {
    const adapter = createFakeAdapter({ duplicateFrame: true });
    const report = await executeAnchor3dAutoCapture(adapter, {
      anchorId: "hero-dup",
      characterId: "char-dup",
      displayName: "중복 점검",
      subject: { height: 1.7 },
    });

    expect(report.status).toBe("partial");
    expect(report.verification.valid).toBe(false);
    expect(report.verification.issues.some((i) => i.code === "duplicate-frame-detected")).toBe(true);
    expect(report.stageRestored).toBe(true);
  });

  it("중간 캡처 실패·잘못된 식별자 입력 시 스테이지를 복구하고 fail-closed 결과를 반환한다", async () => {
    const badPlan = planAnchor3dTurntableCapture({
      anchorId: "INVALID ID",
      characterId: "",
      displayName: "",
      subject: { height: -1 },
    });
    expect(badPlan.errors.length).toBeGreaterThanOrEqual(3);
    expect(badPlan.steps).toHaveLength(0);

    const adapter = createFakeAdapter({ failOnAngle: "left" });
    const report = await executeAnchor3dAutoCapture(adapter, {
      anchorId: "hero-abort",
      characterId: "char-abort",
      displayName: "중단 복구",
      subject: { height: 1.72 },
    });

    expect(report.status).toBe("partial");
    expect(report.frames.map((f) => f.angleId)).toEqual(["front", "left-34"]);
    expect(report.failureReasonKo).toContain("GPU 컨텍스트 손실");
    expect(report.stageRestored).toBe(true);
    expect(buildAnchor3dSheetLayout(["front", "left-34", "left", "back", "right", "right-34"]).columns).toBe(3);
  });
});
