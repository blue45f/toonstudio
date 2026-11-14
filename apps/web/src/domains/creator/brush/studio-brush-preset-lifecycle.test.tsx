// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioInspectorCurrentBrushSummary } from "../StudioInspectorUtilityPanels";
import {
  DEFAULT_STUDIO_PRO_DRAW_PREFS,
  rememberRecentBrushId,
  toggleFavoriteBrushId,
} from "../studio-pro-draw-prefs";

import { DEFAULT_STUDIO_BRUSH_SNAPSHOT, createBrush } from "./studio-brush-library";
import {
  cloneCurrentStudioBrushPreset,
  restoreCurrentStudioBrushDefaults,
} from "./studio-brush-quick-preset-actions";

afterEach(cleanup);

describe("P1-10 브러시 프리셋 즐겨찾기·최근·사용자 복제·원본 복원 및 선택 상태 유지", () => {
  it("즐겨찾기 핀 순서와 최근 브러시 MRU 목록을 중복 없이 유지한다", () => {
    let prefs = DEFAULT_STUDIO_PRO_DRAW_PREFS;
    prefs = rememberRecentBrushId(prefs, "gpen");
    prefs = rememberRecentBrushId(prefs, "pencil");
    prefs = rememberRecentBrushId(prefs, "gpen");
    expect(prefs.recentBrushIds.slice(0, 2)).toEqual(["gpen", "pencil"]);

    prefs = toggleFavoriteBrushId(prefs, "gpen");
    prefs = toggleFavoriteBrushId(prefs, "marker");
    expect(prefs.favoriteBrushIds).toEqual(["gpen", "marker"]);
    prefs = toggleFavoriteBrushId(prefs, "gpen");
    expect(prefs.favoriteBrushIds).toEqual(["marker"]);
  });

  it("사용자 복제 시 고유 이름을 부여해 고정 선반에 추가하고 복제본을 즉시 선택 가능한 상태로 반환한다", async () => {
    const existing = [
      createBrush("G펜", DEFAULT_STUDIO_BRUSH_SNAPSHOT),
      createBrush("G펜 2", DEFAULT_STUDIO_BRUSH_SNAPSHOT),
    ];
    const put = vi.fn().mockResolvedValue(undefined);
    const result = await cloneCurrentStudioBrushPreset({
      baseName: "G펜",
      currentSnapshot: {
        ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
        brushId: "gpen",
        strokeWidth: 11,
      },
      existingBrushes: existing,
      repositoryFactory: async () => ({
        authority: "sqlite",
        repository: {
          put,
        } as never,
      }),
      nowMs: 1_700_000_000_000,
    });

    expect(result.cloned.name).toBe("G펜 3");
    expect(result.cloned.pinned).toBe(true);
    expect(result.cloned.strokeWidth).toBe(11);
    expect(result.nextBrushes[0]?.id).toBe(result.cloned.id);
    expect(put).toHaveBeenCalledWith(result.cloned);
  });

  it("변형된 프리셋 스냅샷에서 원본 복원을 실행하면 변경 트랜잭션을 redo로 반영한다", async () => {
    const baseline = createBrush("내 G펜", {
      ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
      brushId: "gpen",
      strokeWidth: 6,
      brushOpacity: 1,
    });
    const onRestoreDefaults = vi.fn();
    const restored = await restoreCurrentStudioBrushDefaults({
      currentSnapshot: {
        ...DEFAULT_STUDIO_BRUSH_SNAPSHOT,
        brushId: "gpen",
        strokeWidth: 24,
        brushOpacity: 0.45,
      },
      savedBrushBaseline: baseline,
      onRestoreDefaults,
    });

    expect(restored.status).toBe("restored");
    expect(onRestoreDefaults).toHaveBeenCalledOnce();
    expect(onRestoreDefaults.mock.calls[0]?.[1]).toBe("redo");
  });

  it("인스펙터 프리셋 요약 카드에서 즐겨찾기·사용자 복제·원본 복원 버튼과 활성 사용자 프리셋 이름을 노출한다", () => {
    const onToggleFavorite = vi.fn();
    const onClone = vi.fn();
    const onRestore = vi.fn();
    render(
      <StudioInspectorCurrentBrushSummary
        brushId="gpen"
        brushName="G펜"
        activeUserBrushName="G펜 3"
        isFavorite
        color="#111827"
        opacity={0.9}
        stabilizer={4}
        stabilizerMode="adaptive"
        strokeWidth={9}
        tipAngle={0}
        tipRoundness={1}
        onToggleFavorite={onToggleFavorite}
        onCloneCurrentPreset={onClone}
        onRestorePresetDefaults={onRestore}
      />,
    );

    expect(screen.getByText("현재 사용자 프리셋")).toBeTruthy();
    const favBtn = screen.getByRole("button", { name: "G펜 3 즐겨찾기 해제" });
    expect(favBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(favBtn);
    expect(onToggleFavorite).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "사용자 복제" }));
    expect(onClone).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "원본 복원" }));
    expect(onRestore).toHaveBeenCalledOnce();
  });
});
