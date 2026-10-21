/**
 * B2(안정화 프리셋 층 + Weighted) · B3(ColorDrop 드래그 임계 제스처) 배선 계약.
 *
 * 엔진·프리셋·제스처 상태기계 자체는 각 단위 테스트가 검증한다. 여기서는 실제
 * 그리기/채우기 파이프라인에 닿았는지를 소스 계약으로 고정한다 — 파일 존재가
 * 아니라 소비 지점의 호출 형태를 본다.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { studioStabilizerHudLabel } from "./brush/studio-draw-hud";
import {
  readStudioCuttoonEditorSource,
  readStudioCuttoonStagePointersSource,
} from "./studio-cuttoon-editor/read-studio-cuttoon-editor-source";

const baseDir = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const readCreatorSource = (rel: string) => readFileSync(resolve(baseDir, rel), "utf8");

const editorSource = readStudioCuttoonEditorSource();
const pointersSource = readStudioCuttoonStagePointersSource();
const advancedFillRunSource = readCreatorSource(
  "./studio-cuttoon-editor/studio-cuttoon-advanced-fill-run.ts",
);

describe("B2 안정화 배선 계약", () => {
  it("freehand 스트로크 경로는 게이트 포함 옵션 해석기를 두 분기 모두에서 쓴다", () => {
    const calls =
      pointersSource.match(/resolveStudioStabilizerOptionsForState\(/g) ?? [];
    // precision 폴백 분기 + 일반 분기. 리터럴 옵션으로 되돌아가면 속도 게이트
    // 프리셋(느릴 때만)이 화면에 나타나지 않는다.
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("Weighted 도출 필압은 커밋 샘플의 pressure에 곱해 합성된다", () => {
    expect(pointersSource).toContain(
      "pressure = pressure * (stabilized.derivedPressure ?? 1);",
    );
  });

  it("그리기 옵션 바의 보정 방식 선택기에서 Weighted를 직접 고를 수 있다", () => {
    const barSource = readCreatorSource("./brush/StudioDrawOptionsBar.tsx");
    expect(barSource).toContain(
      '{ id: "weighted" as const, label: "무게 추", previewVariant: "adaptive" as const }',
    );
    expect(barSource).toContain("onStabilizerModeChange(item.id)");
  });

  it("HUD 라벨은 weighted를 적응으로 오표기하지 않는다", () => {
    expect(studioStabilizerHudLabel(6, "weighted")).toBe("보정 6 · 무게 추");
    expect(studioStabilizerHudLabel(6, "standard")).toBe("보정 6 · 표준");
    expect(studioStabilizerHudLabel(6, "precision")).toBe("보정 6 · 정밀");
    expect(studioStabilizerHudLabel(6, "adaptive")).toBe("보정 6 · 적응");
  });

  it("스테이지 HUD·뷰포트 타입은 weighted를 수용한다", () => {
    expect(readCreatorSource("./canvas/StudioCanvasStageHud.tsx")).toContain(
      '"standard" | "adaptive" | "precision" | "weighted"',
    );
    expect(readCreatorSource("./canvas/StudioCanvasViewportTypes.ts")).toContain(
      '"standard" | "adaptive" | "precision" | "weighted"',
    );
  });
});

describe("B3 ColorDrop 실시간 미리보기 배선 계약", () => {
  it("드래그 move는 previewTolerance가 생길 때마다 실시간 미리보기를 요청한다", () => {
    expect(pointersSource).toContain(
      "if (payload) previewAdvancedFillColorDrop(payload, dropMove.previewTolerance);",
    );
  });

  it("호스트 미리보기는 설정을 바꾸지 않고 원본 기준·무장 유지로 실행 어댑터를 부른다", () => {
    expect(editorSource).toContain("function previewAdvancedFillColorDrop(");
    expect(editorSource).toContain("advancedFillKeepArmed: true,");
    expect(editorSource).toContain(
      "advancedFillSettings: { ...advancedFillSettingsRef.current, tolerance },",
    );
    // 동시 실행 1건 제한 + 최신 요청 1건만 이어 실행.
    expect(editorSource).toContain(
      "advancedFillColorDropPreviewPendingRef.current = { payload, tolerance };",
    );
    expect(editorSource).toContain(
      'advancedFillColorDropRef.current?.drop.phase === "dragging"',
    );
  });

  it("실행 어댑터는 keepArmed 미리보기에서 도구를 무장 해제하지 않는다", () => {
    expect(advancedFillRunSource).toContain(
      "if (!advancedFillSettings.continuousFill && !advancedFillKeepArmed) setAdvancedFillActive(false);",
    );
  });

  it("커밋은 진행 중 미리보기를 대체하고 최종 허용 오차로 원본에서 다시 계산한다", () => {
    expect(editorSource).toContain(
      "const supersededPreview = advancedFillColorDropPreviewBusyRef.current;",
    );
    // pointerup 가드: 실행 중인 것이 이 드래그의 미리보기뿐이면 커밋을 막지 않는다.
    expect(pointersSource).toContain(
      "(!advancedFillAbortRef.current || advancedFillColorDropPreviewBusyRef.current)",
    );
    expect(pointersSource).toContain(
      "void runAdvancedFillColorDropCommit(payload, dropEnd.outcome.tolerance);",
    );
  });

  it("취소 복원은 pointerup·pointercancel 양쪽에서 미리보기를 폐기한다", () => {
    const cancelCalls = pointersSource.match(/cancelAdvancedFillColorDropPreview\(\);/g) ?? [];
    // up(restore 분기) + finish(pointercancel restore 분기).
    expect(cancelCalls.length).toBeGreaterThanOrEqual(2);
    expect(editorSource).toContain("function cancelAdvancedFillColorDropPreview()");
    expect(editorSource).toContain(
      'setAdvancedFillStatus("드래그가 취소되어 원래 허용 오차로 돌아갔습니다.");',
    );
  });

  it("포인터 호스트 가방은 미리보기·취소·busy ref를 노출한다", () => {
    expect(editorSource).toContain("previewAdvancedFillColorDrop,");
    expect(editorSource).toContain("cancelAdvancedFillColorDropPreview,");
    expect(editorSource).toContain("advancedFillColorDropPreviewBusyRef,");
  });
});
