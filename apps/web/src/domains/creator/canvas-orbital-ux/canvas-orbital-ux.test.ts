// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CANVAS_COMMAND_CATALOG,
  DEFAULT_ORBITAL_WHEEL_CONFIG,
  ORBITAL_WHEEL_SECTORS,
  StudioCanvasOrbitalUxPanel,
  adjustTabletLeftWheel,
  adjustTabletRightWheel,
  buildOrbitalSectorSvgPath,
  clampOrbitalWheelOrigin,
  computeMinimapViewportRect,
  computeMobileThumbArcDock,
  computeTabletDualWheelLayout,
  computeValueContrastAudit,
  createInitialMinimapInspectionState,
  createInitialTabletDualWheelState,
  createInitialUndoFilmstrip,
  extractHangulChoseong,
  jumpToFilmstripIndex,
  panCanvasFromMinimapPoint,
  polarBearingToCartesian,
  pushFilmstripCheckpoint,
  recordCommandUsage,
  resolveContextMagicBar,
  resolveOrbitalWheelPointer,
  searchCanvasCommands,
  setFilmstripScrubPreview,
  solveMobileEdgeScrub,
  solvePrecisionLoupePlacement,
  stepFilmstripRedo,
  stepFilmstripUndo,
  toggleMinimapInspectionMode,
  toggleMobileHandedness,
  type MagicBarActionId,
  type MagicBarToolContext,
  type StudioCanvasOrbitalUxPanelProps,
} from "./index";

afterEach(() => {
  cleanup();
});

describe("8분할 커서 오비탈 휠 엔진 (데드존 · 각도 자석 스냅 · 히스테리시스)", () => {
  it("1. 8개 방향 벡터가 브러시·지우개·스포이드·변형·대칭·좌우반전·실행취소·레이어 피크에 정확히 자석 스냅된다", () => {
    expect(ORBITAL_WHEEL_SECTORS).toHaveLength(8);
    const expectedIds = [
      "brush",
      "eraser",
      "eyedropper",
      "transform",
      "symmetry",
      "flip-horizontal",
      "undo",
      "layer-peek",
    ] as const;

    for (let idx = 0; idx < expectedIds.length; idx += 1) {
      const bearing = idx * 45 + 9; // 중심에서 +9° 치우친 입력도 자석 스냅 검증
      const pt = polarBearingToCartesian(0, 0, 86, bearing);
      const resolved = resolveOrbitalWheelPointer(pt.x, pt.y);

      expect(resolved.inDeadzone).toBe(false);
      expect(resolved.snappedSectorIndex).toBe(idx);
      expect(resolved.snappedSector?.id).toBe(expectedIds[idx]);
      expect(resolved.magneticSnapAngleDeg).toBe(idx * 45);
      expect(resolved.magneticPullStrength).toBeGreaterThan(0.5);
      expect(resolved.ringDepth).toBe("primary");

      const svgPath = buildOrbitalSectorSvgPath(152, 152, 44, 132, idx);
      expect(svgPath.startsWith("M ")).toBe(true);
      expect(svgPath.endsWith("Z")).toBe(true);
    }
  });

  it("2. 중심 데드존 반경 안쪽에서는 선택을 차단하고, 경계 히스테리시스 및 외곽 플릭 커밋을 정확히 판정한다", () => {
    const inside = resolveOrbitalWheelPointer(12, -10);
    expect(inside.inDeadzone).toBe(true);
    expect(inside.snappedSectorIndex).toBeNull();
    expect(inside.snappedSector).toBeNull();
    expect(inside.ringDepth).toBe("deadzone");

    // 0번 섹터(0°, 경계 22.5°)에서 25°로 살짝 넘어가도 히스테리시스(4.5°) 안쪽이면 0번을 유지한다
    const nearEdge = polarBearingToCartesian(0, 0, 84, 25);
    const held = resolveOrbitalWheelPointer(nearEdge.x, nearEdge.y, {
      previousSectorIndex: 0,
    });
    expect(held.snappedSectorIndex).toBe(0);
    expect(held.heldByHysteresis).toBe(true);

    // 외곽 플릭 반경 초과 시 즉시 커밋 링으로 인식한다
    const flick = resolveOrbitalWheelPointer(0, -(DEFAULT_ORBITAL_WHEEL_CONFIG.flickCommitRadiusPx + 12));
    expect(flick.ringDepth).toBe("flick-commit");
    expect(flick.snappedSector?.id).toBe("brush");

    // 캔버스 모서리 소환 시 화면 안쪽으로 안전 클램핑
    const clamped = clampOrbitalWheelOrigin({ x: 20, y: 18 }, { width: 1280, height: 800 });
    expect(clamped.clampedX).toBe(true);
    expect(clamped.clampedY).toBe(true);
    expect(clamped.x).toBeGreaterThanOrEqual(DEFAULT_ORBITAL_WHEEL_CONFIG.outerRadiusPx);
  });
});

describe("태블릿 플로팅 듀얼 휠 & 컨텍스트 매직 바", () => {
  it("3. 왼손 휠(굵기·불투명도·레이어)과 오른손 휠(360° 기준각 스냅·줌·언두 스크럽)이 정밀 동작한다", () => {
    let state = createInitialTabletDualWheelState("right");
    state = adjustTabletLeftWheel(state, 3);
    expect(state.brushSizePx).toBe(20);

    state = adjustTabletLeftWheel({ ...state, leftMode: "opacity" }, -2);
    expect(state.opacityPct).toBe(80);

    state = adjustTabletLeftWheel({ ...state, leftMode: "layer-switch" }, 1);
    expect(state.activeLayerIndex).toBe(3);

    // 오른손 휠 6스텝(6 × 15° = 90°) 회전 시 기준각 스냅 표시
    state = adjustTabletRightWheel({ ...state, rightMode: "rotation" }, 6);
    expect(state.canvasRotationDeg).toBe(90);
    expect(state.rotationSnappedCardinalDeg).toBe(90);

    state = adjustTabletRightWheel({ ...state, rightMode: "zoom" }, 2);
    expect(state.zoomPct).toBeGreaterThan(120);

    state = adjustTabletRightWheel({ ...state, rightMode: "undo-scrub" }, -2);
    expect(state.undoCursor).toBe(4);

    const landscape = computeTabletDualWheelLayout({ width: 1194, height: 834 });
    expect(landscape.orientation).toBe("landscape");
    expect(landscape.leftWheelCenter.x).toBeLessThan(landscape.rightWheelCenter.x);
  });

  it("4. 컨텍스트 매직 바가 brush · lasso · 3d-model · speech-balloon 4도구별 핵심 액션 4개씩 동적 전환한다", () => {
    const contexts: readonly MagicBarToolContext[] = [
      "brush",
      "lasso",
      "3d-model",
      "speech-balloon",
    ];
    const seenActionIds = new Set<MagicBarActionId>();

    for (const ctx of contexts) {
      const model = resolveContextMagicBar(ctx, new Set<MagicBarActionId>(["stabilize-stroke", "sync-cut-light"]));
      expect(model.toolContext).toBe(ctx);
      expect(model.actions).toHaveLength(4);
      for (const action of model.actions) {
        expect(action.toolContext).toBe(ctx);
        seenActionIds.add(action.id);
      }
    }

    // 4개 도구 × 4개 고유 액션 = 16개 중복 없이 독립 구성
    expect(seenActionIds.size).toBe(16);
    const brushBar = resolveContextMagicBar("brush", new Set<MagicBarActionId>(["stabilize-stroke"]));
    expect(brushBar.actions.find((a) => a.id === "stabilize-stroke")?.active).toBe(true);
    expect(brushBar.actions.find((a) => a.id === "alpha-lock")?.active).toBe(false);
  });
});

describe("모바일 엄지 호(Thumb-Arc) 도크 · 엣지 스크럽 · 2.5× 오프셋 정밀 루페", () => {
  it("5. 모바일 엄지 호 도크가 1탭 반전으로 우하단↔좌하단 호를 정확히 대칭 전환하고 44px 이상 타깃을 유지한다", () => {
    const viewport = { width: 390, height: 844 };
    const rightDock = computeMobileThumbArcDock(viewport, "right");
    const flippedHand = toggleMobileHandedness("right");
    expect(flippedHand).toBe("left");
    const leftDock = computeMobileThumbArcDock(viewport, flippedHand);

    expect(rightDock.anchorCorner).toBe("bottom-right");
    expect(leftDock.anchorCorner).toBe("bottom-left");
    expect(rightDock.minHitTargetPx).toBeGreaterThanOrEqual(44);
    expect(leftDock.minHitTargetPx).toBeGreaterThanOrEqual(44);
    expect(rightDock.buttons).toHaveLength(6);
    expect(leftDock.buttons).toHaveLength(6);

    // 각 버튼의 X 좌표가 화면 중심 기준으로 대칭 반전된다
    for (let i = 0; i < rightDock.buttons.length; i += 1) {
      expect(rightDock.buttons[i].x + leftDock.buttons[i].x).toBeCloseTo(viewport.width, 0);
      expect(rightDock.buttons[i].y).toBeCloseTo(leftDock.buttons[i].y, 0);
    }
  });

  it("6. 모바일 엣지 스크럽이 가장자리 드래그를 굵기·불투명도로 매핑하고 눈금·경계별 햅틱 패턴을 생성한다", () => {
    const viewport = { width: 390, height: 844 };
    // 중앙 영역 터치는 엣지 스크럽 비활성
    const ignored = solveMobileEdgeScrub({
      edge: "left",
      startX: 180,
      startY: 400,
      currentY: 300,
      viewport,
      startValue: 20,
    });
    expect(ignored.engaged).toBe(false);
    expect(ignored.hapticPatternMs).toEqual([]);

    // 좌측 가장자리 위로 드래그 → 브러시 굵기 증가 + 눈금 햅틱
    const tickScrub = solveMobileEdgeScrub({
      edge: "left",
      startX: 10,
      startY: 420,
      currentY: 360,
      viewport,
      handedness: "right",
      startValue: 20,
    });
    expect(tickScrub.engaged).toBe(true);
    expect(tickScrub.target).toBe("brush-size");
    expect(tickScrub.value).toBeGreaterThan(20);
    expect(tickScrub.hapticPatternMs.length).toBeGreaterThan(0);

    // 우측 가장자리 최대치 도달 → 불투명도 100% + 경계 3단 햅틱 패턴
    const boundaryScrub = solveMobileEdgeScrub({
      edge: "right",
      startX: 382,
      startY: 500,
      currentY: 80,
      viewport,
      handedness: "right",
      startValue: 75,
    });
    expect(boundaryScrub.target).toBe("opacity");
    expect(boundaryScrub.value).toBe(100);
    expect(boundaryScrub.hitBoundary).toBe(true);
    expect(boundaryScrub.hapticKind).toBe("boundary");
    expect(boundaryScrub.hapticPatternMs).toEqual([14, 24, 18]);
  });

  it("7. 2.5× 오프셋 정밀 루페가 4개 모서리 터치에서도 화면 경계를 벗어나지 않고 손가락 가림 0을 유지한다", () => {
    const viewport = { width: 390, height: 844 };
    const testPoints = [
      { x: 195, y: 420 }, // 중앙
      { x: 10, y: 12 }, // 좌상단 극단 모서리
      { x: 382, y: 14 }, // 우상단 극단 모서리
      { x: 14, y: 830 }, // 좌하단 극단 모서리
      { x: 380, y: 828 }, // 우하단 극단 모서리
    ];

    for (const handedness of ["right", "left"] as const) {
      for (const touchPoint of testPoints) {
        const placed = solvePrecisionLoupePlacement({
          touchPoint,
          viewport,
          handedness,
          magnification: 2.5,
          loupeRadiusPx: 56,
          fingerOcclusionRadiusPx: 30,
          safeMarginPx: 12,
        });

        expect(placed.magnification).toBe(2.5);
        expect(placed.loupeCenter.x - placed.loupeRadiusPx).toBeGreaterThanOrEqual(12);
        expect(placed.loupeCenter.x + placed.loupeRadiusPx).toBeLessThanOrEqual(viewport.width - 12);
        expect(placed.loupeCenter.y - placed.loupeRadiusPx).toBeGreaterThanOrEqual(12);
        expect(placed.loupeCenter.y + placed.loupeRadiusPx).toBeLessThanOrEqual(viewport.height - 12);
        expect(placed.zeroFingerOcclusion).toBe(true);
        expect(placed.fingerClearancePx).toBeGreaterThanOrEqual(0);
        expect(placed.sourceSampleRect.width).toBeCloseTo((56 * 2) / 2.5, 1);
      }
    }
  });
});

describe("한국어 일상어·초성·영문 명령 팔레트(⌘K) · 미니맵 검수 · 언두 필름스트립", () => {
  it("8. 한국어 일상어 · 초성(`ㅅㄸ`, `ㅈㅇㅂㅈ`, `ㄱㅈ`, `ㄷㅋ`) · 영문 통합 검색이 정확한 1순위 명령을 반환한다", () => {
    expect(CANVAS_COMMAND_CATALOG.length).toBeGreaterThanOrEqual(12);
    expect(extractHangulChoseong("선 떨림 잡기")).toBe("ㅅㄸㄹㅈㄱ");

    const byChoseong = searchCanvasCommands("ㅅㄸ");
    expect(byChoseong[0]?.command.id).toBe("stabilize-line");
    expect(byChoseong[0]?.matchKind).toBe("choseong");

    const byEveryday = searchCanvasCommands("군중 채우기");
    expect(byEveryday[0]?.command.id).toBe("crowd-fill");

    const byFlipChoseong = searchCanvasCommands("ㅈㅇㅂㅈ");
    expect(byFlipChoseong[0]?.command.id).toBe("flip-horizontal");

    const byDarkMode = searchCanvasCommands("다크모드 검수");
    expect(byDarkMode[0]?.command.id).toBe("dark-mode-inspect");

    const byEnglish = searchCanvasCommands("flip horizontal");
    expect(byEnglish[0]?.command.id).toBe("flip-horizontal");
    expect(byEnglish[0]?.matchKind).toBe("english");
  });

  it("9. 최근 사용한 명령에 시간 감쇠·빈도 가중치 부스트가 적용되어 상위로 올라온다", () => {
    const nowMs = 1_764_000_000_000;
    const before = searchCanvasCommands("", { nowMs, limit: 5 });
    const targetId = "dark-mode-inspect";
    expect(before[0]?.command.id).not.toBe(targetId);

    let history = recordCommandUsage([], targetId, nowMs - 120_000);
    history = recordCommandUsage(history, targetId, nowMs - 30_000);

    const after = searchCanvasCommands("", { recentUsage: history, nowMs, limit: 5 });
    expect(after[0]?.command.id).toBe(targetId);
    expect(after[0]?.recencyBoost).toBeGreaterThan(25);
  });

  it("10. 플로팅 미니맵 투영·역매핑 패닝 및 명도/실루엣 흑백 검수 토글과 대비 감사 점수가 정확히 계산된다", () => {
    let minimap = createInitialMinimapInspectionState();
    const initialRect = computeMinimapViewportRect(minimap, 128, 180);
    expect(initialRect.width).toBeGreaterThan(16);
    expect(initialRect.height).toBeGreaterThan(16);

    // 우하단 클릭 시 패닝 좌표가 우하단 방향으로 이동
    const panned = panCanvasFromMinimapPoint(minimap, 120, 170, 128, 180);
    expect(panned.panX).toBeGreaterThan(minimap.panX);
    expect(panned.panY).toBeGreaterThan(minimap.panY);

    // 흑백 명도 검수 켰다가 다시 누르면 원본으로 토글 복귀
    minimap = toggleMinimapInspectionMode(minimap, "grayscale-value");
    expect(minimap.inspectionMode).toBe("grayscale-value");
    minimap = toggleMinimapInspectionMode(minimap, "grayscale-value");
    expect(minimap.inspectionMode).toBe("normal");

    const highContrast = computeValueContrastAudit([0.08, 0.14, 0.45, 0.86, 0.94]);
    const muddyMidtone = computeValueContrastAudit([0.46, 0.48, 0.5, 0.52, 0.54]);
    expect(highContrast.silhouetteSeparationScore).toBeGreaterThan(
      muddyMidtone.silhouetteSeparationScore + 30,
    );
    expect(highContrast.tone).toBe("good");
    expect(muddyMidtone.tone).toBe("bad");
  });

  it("11. 비주얼 언두 필름스트립 스크러버가 임의 시점 점프·호버 미리보기·중간 분기 기록을 무손실 처리한다", () => {
    let strip = createInitialUndoFilmstrip(12);
    const total = strip.entries.length;
    expect(strip.cursorIndex).toBe(total - 1);

    // 2번 인덱스(3번째 단계)로 한 번에 점프
    strip = jumpToFilmstripIndex(strip, 2);
    expect(strip.cursorIndex).toBe(2);
    expect(strip.lastJumpDelta).toBe(2 - (total - 1));

    // 호버 프리뷰는 실제 커서를 건드리지 않는다
    strip = setFilmstripScrubPreview(strip, 5);
    expect(strip.previewIndex).toBe(5);
    expect(strip.cursorIndex).toBe(2);

    // Undo / Redo 단발 이동
    strip = stepFilmstripUndo(strip);
    expect(strip.cursorIndex).toBe(1);
    strip = stepFilmstripRedo(strip);
    expect(strip.cursorIndex).toBe(2);

    // 중간 시점(2)에서 새 체크포인트 기록 시 앞선 Redo 분기를 정리하고 4개 항목(0..3)으로 분기
    strip = pushFilmstripCheckpoint(strip, {
      labelKo: "수정 선화",
      toolLabelKo: "G펜",
      timestampLabel: "07:05",
      strokeCount: 50,
      activeLayerName: "인물 선화",
      deltaSummaryKo: "눈매 각도 재조정",
      thumbnailBands: [{ xPct: 20, yPct: 20, wPct: 60, hPct: 50, tone: "accent", opacity: 0.8 }],
    });
    expect(strip.entries).toHaveLength(4);
    expect(strip.cursorIndex).toBe(3);
    expect(strip.entries[3]?.labelKo).toBe("수정 선화");
  });
});

describe("StudioCanvasOrbitalUxPanel 단독 렌더링 · 인터랙션 · 토큰 위생 검증", () => {
  it("연결 없는 선택과 매직 바는 예제 구성이며 실제 원고 적용·명령 실행 성공으로 표시하지 않는다", () => {
    render(createElement<StudioCanvasOrbitalUxPanelProps>(StudioCanvasOrbitalUxPanel));
    expect(screen.getByTestId("orbital-scope-notice").textContent).toContain("선택 알림만");
    fireEvent.click(screen.getByTestId("orbital-sector-flip-horizontal"));
    expect(screen.getByTestId("orbital-status-banner").textContent).toContain("미니맵 예제");
    expect(screen.getByTestId("orbital-status-banner").textContent).toContain("실제 원고에는 반영하지 않았어요");
    fireEvent.click(screen.getByTestId("magic-action-color-drop-fill"));
    expect(screen.getByTestId("orbital-status-banner").textContent).toContain("예제를 선택했어요");
    fireEvent.change(screen.getByTestId("command-palette-input"), { target: { value: "ㅅㄸ" } });
    fireEvent.click(screen.getByTestId("palette-result-stabilize-line"));
    const status = screen.getByTestId("orbital-status-banner").textContent;
    expect(status).toContain("명령 예제 선택");
    expect(status).toContain("실제 원고에는 반영하지 않았어요");
    expect(status).not.toMatch(/바로 적용했어요|명령 실행:/u);
    expect(screen.getByTestId("minimap-scope-notice").textContent).toContain("고정 명도 샘플");
    expect(screen.getByTestId("filmstrip-scope-notice").textContent).toContain("실제 편집 기록을 읽거나 원고를 되돌리지 않아요");
    fireEvent.click(screen.getByTestId("device-mode-mobile"));
    expect(screen.getByTestId("mobile-scope-notice").textContent).toContain("원고 픽셀 확대나 기기 진동은 실행하지 않으며");
  });

  it("비동기 명령 알림의 대기·실패·재시도를 처리하고 성공 응답도 적용·저장 완료와 구분한다", async () => {
    const onCommandExecuted = vi.fn()
      .mockRejectedValueOnce(new Error("연결 실패"))
      .mockResolvedValueOnce(undefined);
    render(createElement<StudioCanvasOrbitalUxPanelProps>(StudioCanvasOrbitalUxPanel, { onCommandExecuted }));
    fireEvent.change(screen.getByTestId("command-palette-input"), { target: { value: "ㅅㄸ" } });
    const command = screen.getByTestId("palette-result-stabilize-line");
    fireEvent.click(command);
    expect(screen.getByTestId("canvas-orbital-ux-panel").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByTestId("orbital-status-banner").textContent).toContain("연결 알림 처리 중");
    fireEvent.click(command);
    expect(onCommandExecuted).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("orbital-status-banner").textContent).toContain("처리에 실패"));
    expect(screen.getByTestId("canvas-orbital-ux-panel").getAttribute("aria-busy")).toBe("false");
    fireEvent.click(command);
    await waitFor(() => expect(screen.getByTestId("orbital-status-banner").textContent).toContain("적용·저장 완료를 뜻하지 않아요"));
    expect(onCommandExecuted).toHaveBeenCalledTimes(2);
  });

  it("섹터 알림의 동기 오류와 비동기 응답도 실제 적용 성공으로 오인하지 않는다", async () => {
    const onSectorSelected = vi.fn()
      .mockImplementationOnce(() => { throw new Error("선택 알림 오류"); })
      .mockResolvedValueOnce(undefined);
    render(createElement<StudioCanvasOrbitalUxPanelProps>(StudioCanvasOrbitalUxPanel, { onSectorSelected }));
    const sector = screen.getByTestId("orbital-sector-brush");
    fireEvent.click(sector);
    expect(screen.getByTestId("orbital-status-banner").textContent).toContain("처리에 실패");
    fireEvent.click(sector);
    expect(screen.getByTestId("orbital-status-banner").textContent).toContain("연결 알림 처리 중");
    await waitFor(() => expect(screen.getByTestId("orbital-status-banner").textContent).toContain("적용·저장 완료를 뜻하지 않아요"));
    expect(onSectorSelected).toHaveBeenCalledTimes(2);
  });

  it("12. Props 없이 단독 렌더되고 8분할 SVG 오비탈 휠 섹터 클릭이 즉시 상태와 콜백에 반영된다", () => {
    const onSectorSelected = vi.fn();
    render(createElement<StudioCanvasOrbitalUxPanelProps>(StudioCanvasOrbitalUxPanel, { onSectorSelected }));

    expect(screen.getByTestId("canvas-orbital-ux-panel")).toBeTruthy();
    expect(screen.getByTestId("orbital-wheel-svg")).toBeTruthy();

    fireEvent.click(screen.getByTestId("orbital-sector-flip-horizontal"));
    expect(screen.getByTestId("orbital-flip-status").textContent).toContain("좌우 반전 중");
    expect(onSectorSelected).toHaveBeenCalledTimes(1);
    expect(onSectorSelected.mock.calls[0]?.[0]?.id).toBe("flip-horizontal");

    // Props 전혀 없이 호출해도 오류 없이 렌더된다
    cleanup();
    render(createElement<StudioCanvasOrbitalUxPanelProps>(StudioCanvasOrbitalUxPanel));
    expect(screen.getByTestId("stage-desktop-orbital")).toBeTruthy();
  });

  it("13. 데스크톱 · 태블릿 듀얼 휠 · 모바일 엄지 도크(1탭 반전/2.5× 루페) 3종 모드 전환이 정상 작동한다", () => {
    render(createElement<StudioCanvasOrbitalUxPanelProps>(StudioCanvasOrbitalUxPanel));

    // 태블릿 모드로 전환 후 좌/우 휠 조작
    fireEvent.click(screen.getByTestId("device-mode-tablet"));
    expect(screen.getByTestId("stage-tablet-dual-wheel")).toBeTruthy();
    fireEvent.click(screen.getByTestId("tablet-left-inc"));
    expect(screen.getByTestId("tablet-dual-wheel-feedback").textContent).toContain("16px");
    fireEvent.click(screen.getByTestId("tablet-right-inc"));
    expect(screen.getByTestId("tablet-dual-wheel-feedback").textContent).toContain("15°");

    // 모바일 모드로 전환 후 왼손/오른손 1탭 반전 및 모서리 루페 클램핑 확인
    fireEvent.click(screen.getByTestId("device-mode-mobile"));
    expect(screen.getByTestId("stage-mobile-thumb-dock")).toBeTruthy();
    const handBtn = screen.getByTestId("mobile-handedness-toggle");
    expect(handBtn.textContent).toContain("오른손");
    fireEvent.click(handBtn);
    expect(handBtn.textContent).toContain("왼손");

    fireEvent.click(screen.getByTestId("loupe-spot-top-left"));
    expect(screen.getByTestId("mobile-loupe-clearance").textContent).toContain("2.5×");
  });

  it("14. 컨텍스트 매직 바 4도구 전환과 실시간 초성(`ㅅㄸ`)·일상어 명령 팔레트 검색 및 필름스트립 점프가 연동된다", () => {
    const onCommandExecuted = vi.fn();
    render(createElement<StudioCanvasOrbitalUxPanelProps>(StudioCanvasOrbitalUxPanel, { onCommandExecuted }));

    // 매직 바를 3D 모델 → 말풍선으로 전환해 핵심 4액션 교체 확인
    fireEvent.click(screen.getByTestId("magic-tool-3d-model"));
    expect(screen.getByTestId("magic-action-extract-lineart")).toBeTruthy();
    fireEvent.click(screen.getByTestId("magic-tool-speech-balloon"));
    expect(screen.getByTestId("magic-action-tail-aim-speaker")).toBeTruthy();

    // 초성 검색 `ㅅㄸ` → `선 떨림 잡기` 즉시 노출
    const input = screen.getByTestId("command-palette-input");
    fireEvent.change(input, { target: { value: "ㅅㄸ" } });
    expect(screen.getByTestId("palette-result-stabilize-line")).toBeTruthy();

    // `다크모드 검수` 실행 → 미니맵 검수 배지가 다크모드로 즉시 전환
    fireEvent.change(input, { target: { value: "다크모드 검수" } });
    fireEvent.click(screen.getByTestId("palette-result-dark-mode-inspect"));
    expect(screen.getByTestId("minimap-inspection-badge").textContent).toContain("다크모드");
    expect(onCommandExecuted).toHaveBeenCalledTimes(1);

    // 필름스트립 2번 단계(3/7)로 점프
    fireEvent.click(screen.getByTestId("filmstrip-step-2"));
    expect(screen.getByTestId("filmstrip-cursor-badge").textContent).toContain("3 / 7");
  });

  it("15. 모듈 전역 위생 계약: 전 파일 <= 800줄, 원시 색상·Web Storage·private store Map·BigInt 리터럴·슬롭 패턴 0건", () => {
    const dir = path.dirname(new URL(import.meta.url).pathname);
    const allFiles = fs
      .readdirSync(dir)
      .filter((name) => /\.(ts|tsx)$/u.test(name));

    expect(allFiles.length).toBeGreaterThanOrEqual(4);

    const rawColorRegex = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\(/u;
    const rawTailwindColorRegex =
      /\b(?:bg|text|border|ring|from|to|via|shadow|accent)-(?:white|black|slate|amber|rose|sky|emerald|violet|fuchsia|red|green|blue|yellow|orange|indigo|purple|pink|cyan|teal|zinc|gray|neutral)(?:-[0-9]{2,3})?(?:\/[0-9]+)?/u;
    const forbiddenStorageRegex = /\b(?:localStorage|sessionStorage)\b/u;
    const privateStoreMapRegex = /private\s+(?:readonly\s+)?store\s*(?::|=)\s*new\s+Map/u;
    const bigIntLiteralRegex = /\b0x[0-9a-fA-F]+n\b/u;
    const slopPatternRegex =
      /\btransition-all\b|\bhover:scale-|\banimate-pulse\b|\bSparkles\b|\bfont-black\b|text-\[(?:9px|10px|0\.6rem|0\.625rem)\]/u;
    const translationeseRegex = /하는 것을 가능하게 합니다|원활한 워크플로우를 보장|직관적인 경험을 제공/u;

    for (const fileName of allFiles) {
      const content = fs.readFileSync(path.join(dir, fileName), "utf8");
      const lines = content.split("\n").length;
      expect(lines, `${fileName}이 800줄 제한(${lines}줄)을 초과했습니다`).toBeLessThanOrEqual(800);

      if (fileName.endsWith(".test.ts")) continue;

      expect(content, `${fileName} 원시 색상 검출`).not.toMatch(rawColorRegex);
      expect(content, `${fileName} 원시 Tailwind 색상 검출`).not.toMatch(rawTailwindColorRegex);
      expect(content, `${fileName} Web Storage 검출`).not.toMatch(forbiddenStorageRegex);
      expect(content, `${fileName} private store Map 검출`).not.toMatch(privateStoreMapRegex);
      expect(content, `${fileName} BigInt 리터럴 검출`).not.toMatch(bigIntLiteralRegex);
      expect(content, `${fileName} UI 슬롭 패턴 검출`).not.toMatch(slopPatternRegex);
      expect(content, `${fileName} 한국어 번역투 검출`).not.toMatch(translationeseRegex);
    }
  });
});
