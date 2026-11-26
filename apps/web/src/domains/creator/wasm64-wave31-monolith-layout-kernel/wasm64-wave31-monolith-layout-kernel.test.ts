import { describe, expect, it } from "vitest";

import {
  CRISP_INTEGER_ZOOMS,
  MAX_CAMERA_ZOOM,
  MAX_VISIBLE_TOP_MENUS,
  MIN_CAMERA_ZOOM,
  MIN_HUD_SEPARATION_PX,
  MIN_TOUCH_HIT_SIZE_PX,
  SACRED_CONTEXT_BAR_HEIGHT_PX,
  SACRED_MIN_CANVAS_RATIO,
  applyAnchorLockedZoom,
  applyAnchorLockedZoomByFactor,
  computeAabbSeparationPx,
  createInitialCameraPhysicsState,
  createInitialRulerSnapState,
  launchInertialPanFling,
  projectOrthogonalOntoEllipse,
  replicateSymmetricStrokePoint,
  resolvePixelGridCrispTransform,
  screenToWorldPoint,
  snapCameraPanToDevicePixelGrid,
  snapStylusPointToRuler,
  snapStylusStrokePolyline,
  solveCanonicalViewportPresets,
  solveSacredCanvasViewportLayout,
  stepInertialPanPhysics,
  worldToScreenPoint,
  type HudOverlayInput,
  type RulerPoint2D,
  type TopMenuActionInput,
} from "./index";

describe("Wave 31 — 성역 82% 캔버스 뷰포트 및 무충돌 HUD 레이아웃 솔버", () => {
  it("모바일·태블릿·노트북·데스크톱 4대 해상도에서 44px 단일 바, <= 7 메뉴, >= 82% 캔버스, HUD 겹침 0건을 달성한다", () => {
    const presets = solveCanonicalViewportPresets();
    const entries = Object.entries(presets);
    expect(entries.length).toBe(4);

    for (const [, sol] of entries) {
      expect(sol.contextBarHeightPx).toBe(SACRED_CONTEXT_BAR_HEIGHT_PX);
      expect(sol.visibleTopMenuCount).toBeLessThanOrEqual(MAX_VISIBLE_TOP_MENUS);
      expect(sol.unobstructedCanvasRatio).toBeGreaterThanOrEqual(SACRED_MIN_CANVAS_RATIO);
      expect(sol.dockFreeCanvasRatio).toBeGreaterThanOrEqual(SACRED_MIN_CANVAS_RATIO);
      expect(sol.hudOverlapCount).toBe(0);
      expect(sol.minPairwiseHudSeparationPx).toBeGreaterThanOrEqual(MIN_HUD_SEPARATION_PX);
      expect(sol.meetsSacredInvariants).toBe(true);

      for (const hud of sol.hudOverlays) {
        expect(hud.rect.widthPx).toBeGreaterThanOrEqual(MIN_TOUCH_HIT_SIZE_PX);
        expect(hud.rect.heightPx).toBeGreaterThanOrEqual(MIN_TOUCH_HIT_SIZE_PX);
        expect(hud.rect.x).toBeGreaterThanOrEqual(sol.canvasBoundsRect.x);
        expect(hud.rect.y).toBeGreaterThanOrEqual(sol.canvasBoundsRect.y);
        expect(hud.rect.x + hud.rect.widthPx).toBeLessThanOrEqual(
          sol.canvasBoundsRect.x + sol.canvasBoundsRect.widthPx,
        );
        expect(hud.rect.y + hud.rect.heightPx).toBeLessThanOrEqual(
          sol.canvasBoundsRect.y + sol.canvasBoundsRect.heightPx,
        );
      }
    }

    // 360x640 모바일에서는 82% 성역 보장을 위해 양측 도크가 컴팩트 시트로 자동 폴딩된다.
    expect(presets["mobile-360x640"].leftDock?.foldStage).toBe("compact-sheet");
    expect(presets["mobile-360x640"].rightDock?.foldStage).toBe("compact-sheet");
    // 1920x1080 데스크톱에서는 주 도구 도크 펼침을 유지하면서 82% 이상을 지킨다.
    expect(presets["desktop-1920x1080"].leftDock?.foldStage).toBe("expanded-dock");
  });

  it("상단 액션이 7개를 초과하면 우선순위 상위 6개만 남기고 나머지를 '더보기' 배지 슬롯으로 수납한다", () => {
    const elevenMenus: readonly TopMenuActionInput[] = [
      { id: "m1", labelKo: "파일", priority: 1 },
      { id: "m2", labelKo: "펜촉", priority: 2 },
      { id: "m3", labelKo: "원근 자", priority: 3 },
      { id: "m4", labelKo: "컷 분할", priority: 4 },
      { id: "m5", labelKo: "말풍선", priority: 5 },
      { id: "m6", labelKo: "3D 소품", priority: 6 },
      { id: "m7", labelKo: "색보정", priority: 7 },
      { id: "m8", labelKo: "효과음", priority: 8 },
      { id: "m9", labelKo: "권리 검증", priority: 9 },
      { id: "m10", labelKo: "타임랩스", priority: 10 },
      { id: "m11", labelKo: "내보내기", priority: 11 },
    ];

    const sol = solveSacredCanvasViewportLayout({
      viewportWidthPx: 1280,
      viewportHeightPx: 800,
      topMenus: elevenMenus,
    });

    expect(sol.visibleTopMenuCount).toBe(7);
    expect(sol.overflowMenuDisclosure).not.toBeNull();
    expect(sol.overflowMenuDisclosure?.labelKo).toBe("더보기");
    expect(sol.overflowMenuDisclosure?.hiddenCount).toBe(5);
    expect(sol.overflowMenuDisclosure?.badgeLabelKo).toBe("+5");
    expect(sol.overflowMenuDisclosure?.hitBox.widthPx).toBeGreaterThanOrEqual(44);
    expect(sol.overflowMenuDisclosure?.hitBox.heightPx).toBe(44);
  });

  it("모든 플로팅 HUD가 동일한 픽셀 좌표에 중첩 요청되어도 최소 8px AABB 이격으로 완전 분리한다", () => {
    const collidingHuds: readonly HudOverlayInput[] = [
      { id: "zoom-compass", anchor: "top-left", preferredX: 80, preferredY: 80, widthPx: 84, heightPx: 44 },
      { id: "color-loupe", anchor: "top-left", preferredX: 80, preferredY: 80, widthPx: 72, heightPx: 44 },
      { id: "undo-toast", anchor: "bottom-left", preferredX: 80, preferredY: 80, widthPx: 96, heightPx: 44 },
      { id: "save-status-pill", anchor: "top-right", preferredX: 80, preferredY: 80, widthPx: 92, heightPx: 44 },
    ];

    for (const [w, h] of [
      [360, 640],
      [768, 1024],
      [1280, 800],
    ] as const) {
      const sol = solveSacredCanvasViewportLayout({
        viewportWidthPx: w,
        viewportHeightPx: h,
        hudOverlays: collidingHuds,
      });

      expect(sol.hudOverlapCount).toBe(0);
      expect(sol.unobstructedCanvasRatio).toBeGreaterThanOrEqual(0.82);

      for (let i = 0; i < sol.hudOverlays.length; i += 1) {
        const a = sol.hudOverlays[i];
        if (!a) continue;
        for (let j = i + 1; j < sol.hudOverlays.length; j += 1) {
          const b = sol.hudOverlays[j];
          if (!b) continue;
          expect(computeAabbSeparationPx(a.rect, b.rect)).toBeGreaterThanOrEqual(8 - 1e-6);
        }
      }
    }
  });
});

describe("Wave 31 — 만화 원근·타원·방사 대칭 자 직교 투영 및 히스테리시스 다양체", () => {
  it("소실점 방사 자(vanishing-radial)에서 스냅된 모든 점은 소실점 광선과 외적 오차 < 1e-5 공선성을 만족한다", () => {
    const vp: RulerPoint2D = { x: 640, y: 220 };
    const strokeRaw: readonly RulerPoint2D[] = [
      { x: 740, y: 300 },
      { x: 842, y: 376 },
      { x: 960, y: 485 },
      { x: 1085, y: 568 },
    ];

    const steps = snapStylusStrokePolyline(
      strokeRaw,
      { kind: "vanishing-radial", vanishingPoint: vp },
      { snapEngagePx: 14, snapReleasePx: 28 },
    );

    const first = steps[0];
    expect(first?.isSnapped).toBe(true);
    const refVecX = (first?.outputPoint.x ?? 0) - vp.x;
    const refVecY = (first?.outputPoint.y ?? 0) - vp.y;
    const refLen = Math.hypot(refVecX, refVecY);
    const rayUnitX = refVecX / refLen;
    const rayUnitY = refVecY / refLen;

    for (const step of steps) {
      expect(step.isSnapped).toBe(true);
      const dx = step.outputPoint.x - vp.x;
      const dy = step.outputPoint.y - vp.y;
      const crossProduct = Math.abs(dx * rayUnitY - dy * rayUnitX);
      expect(crossProduct).toBeLessThan(1e-5);
      expect(step.orthogonalityResidual).toBeLessThan(1e-9);
    }
  });

  it("회전 고이심률 타원 자(concentric-ellipse) 위 직교 수선발 투영과 펜촉 접선 각도 정밀도를 검증한다", () => {
    const ellipse = {
      center: { x: 500, y: 400 },
      radiusX: 240,
      radiusY: 75,
      rotationRad: 0.38,
    };

    const probePoints: readonly RulerPoint2D[] = [
      { x: 690, y: 510 },
      { x: 320, y: 290 },
      { x: 540, y: 415 }, // 축폐선(evolute) 내부 점
      { x: 500, y: 400 }, // 타원 중심 특이점
      { x: 775, y: 512 },
    ];

    const cosR = Math.cos(ellipse.rotationRad);
    const sinR = Math.sin(ellipse.rotationRad);

    for (const pt of probePoints) {
      const proj = projectOrthogonalOntoEllipse(pt, ellipse);
      const dx = proj.footPoint.x - ellipse.center.x;
      const dy = proj.footPoint.y - ellipse.center.y;
      const lx = dx * cosR + dy * sinR;
      const ly = -dx * sinR + dy * cosR;

      const implicitVal =
        (lx * lx) / (ellipse.radiusX * ellipse.radiusX) +
        (ly * ly) / (ellipse.radiusY * ellipse.radiusY);

      expect(implicitVal).toBeCloseTo(1, 9);
      expect(proj.orthogonalityResidual).toBeLessThan(1e-9);
      expect(Math.hypot(proj.unitTangent.x, proj.unitTangent.y)).toBeCloseTo(1, 10);
    }
  });

  it("N=6 방사 대칭 자(radial-symmetry) 복제 시 반지름 불변성·60도 등각 배치·무게중심 보존 및 거울 모드를 검증한다", () => {
    const center: RulerPoint2D = { x: 400, y: 400 };
    const samplePt: RulerPoint2D = { x: 510, y: 445 };
    const nibAngleRad = 0.65;

    const rotational = replicateSymmetricStrokePoint(samplePt, nibAngleRad, {
      center,
      symmetryOrder: 6,
      symmetryMode: "rotational",
    });

    expect(rotational.length).toBe(6);
    const expectedRadius = Math.hypot(samplePt.x - center.x, samplePt.y - center.y);
    let sumX = 0;
    let sumY = 0;

    for (let k = 0; k < 6; k += 1) {
      const rep = rotational[k];
      expect(rep).toBeDefined();
      expect(rep?.isMirrored).toBe(false);
      expect(rep?.radiusPx).toBeCloseTo(expectedRadius, 9);
      sumX += rep?.point.x ?? 0;
      sumY += rep?.point.y ?? 0;

      const nextRep = rotational[(k + 1) % 6];
      if (rep && nextRep) {
        const chord = Math.hypot(nextRep.point.x - rep.point.x, nextRep.point.y - rep.point.y);
        // 정육각형 이웃 꼭짓점 현의 길이는 반지름과 정확히 일치한다.
        expect(chord).toBeCloseTo(expectedRadius, 9);
      }
    }
    expect(sumX / 6).toBeCloseTo(center.x, 9);
    expect(sumY / 6).toBeCloseTo(center.y, 9);

    const dihedral = replicateSymmetricStrokePoint(samplePt, nibAngleRad, {
      center,
      symmetryOrder: 6,
      symmetryMode: "dihedral",
    });
    expect(dihedral.length).toBe(12);
    expect(dihedral.filter((r) => r.isMirrored).length).toBe(6);
  });

  it("평행선 자 히스테리시스(snapEngagePx < snapReleasePx)로 의도적 이탈 시 경계 채터링을 방지한다", () => {
    const parallelRuler = {
      kind: "parallel" as const,
      origin: { x: 100, y: 200 },
      angleRad: 0,
    };
    const opts = { snapEngagePx: 10, snapReleasePx: 24 };

    let state = createInitialRulerSnapState();

    // 1) 거리 6px <= 10px: 스냅 진입
    const s1 = snapStylusPointToRuler({ x: 150, y: 206 }, parallelRuler, state, opts);
    expect(s1.isSnapped).toBe(true);
    expect(s1.didEngage).toBe(true);
    expect(s1.outputPoint.y).toBeCloseTo(200, 9);
    state = s1.nextState;

    // 2) 거리 18px (진입 반경 10px 초과지만 이탈 반경 24px 이하): 스냅 유지!
    const s2 = snapStylusPointToRuler({ x: 210, y: 218 }, parallelRuler, state, opts);
    expect(s2.isSnapped).toBe(true);
    expect(s2.didBreakAway).toBe(false);
    expect(s2.outputPoint.y).toBeCloseTo(200, 9);
    state = s2.nextState;

    // 3) 거리 30px > 24px: 의도적 브레이크어웨이 이탈!
    const s3 = snapStylusPointToRuler({ x: 260, y: 230 }, parallelRuler, state, opts);
    expect(s3.isSnapped).toBe(false);
    expect(s3.didBreakAway).toBe(true);
    expect(s3.outputPoint.y).toBeCloseTo(230, 9);
    state = s3.nextState;

    // 4) 불감대(16px: 10px < 16px <= 24px) 재진입 시 채터링 없이 자유선 유지!
    const s4 = snapStylusPointToRuler({ x: 300, y: 216 }, parallelRuler, state, opts);
    expect(s4.isSnapped).toBe(false);
    expect(s4.didEngage).toBe(false);
    state = s4.nextState;

    // 5) 진입 반경 이내(7px <= 10px) 복귀 시 깔끔하게 재결합
    const s5 = snapStylusPointToRuler({ x: 340, y: 207 }, parallelRuler, state, opts);
    expect(s5.isSnapped).toBe(true);
    expect(s5.didEngage).toBe(true);
    expect(s5.outputPoint.y).toBeCloseTo(200, 9);
  });
});

describe("Wave 31 — 무드리프트 앵커 고정 줌(0.05x..64x), 관성 패닝 및 픽셀 그리드 물리", () => {
  it("50회 연속 난수 핀치·휠 줌 체인 전 구간에서 커서 월드 초점 드리프트 < 1e-6 불변식을 증명한다", () => {
    let camera = createInitialCameraPhysicsState({ zoom: 1, panX: 120, panY: 64 });
    let seed = 20261127;
    const nextRand = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let step = 0; step < 50; step += 1) {
      const cursor = {
        x: 40 + nextRand() * 1600,
        y: 60 + nextRand() * 920,
      };
      const factor = 0.45 + nextRand() * 1.9;
      const worldBefore = screenToWorldPoint(cursor, camera);

      const res = applyAnchorLockedZoomByFactor(camera, factor, cursor, {
        magneticIntegerSnapToleranceRatio: 0.02,
        devicePixelRatio: 2,
      });

      const worldAfter = screenToWorldPoint(cursor, res.nextState);
      const drift = Math.hypot(worldAfter.x - worldBefore.x, worldAfter.y - worldBefore.y);

      expect(drift).toBeLessThan(1e-6);
      expect(res.worldAnchorDrift).toBeLessThan(1e-6);
      expect(res.nextState.zoom).toBeGreaterThanOrEqual(MIN_CAMERA_ZOOM);
      expect(res.nextState.zoom).toBeLessThanOrEqual(MAX_CAMERA_ZOOM);

      const screenRoundTrip = worldToScreenPoint(worldAfter, res.nextState);
      expect(screenRoundTrip.x).toBeCloseTo(cursor.x, 7);
      expect(screenRoundTrip.y).toBeCloseTo(cursor.y, 7);

      camera = res.nextState;
    }
  });

  it("배율 상·하한(0.05x..64x) 극단 클램프에서도 커서 아래 월드 좌표가 고정된다", () => {
    const start = createInitialCameraPhysicsState({ zoom: 1.5, panX: -80, panY: 45 });
    const focal = { x: 512.37, y: 388.91 };

    const zoomedOut = applyAnchorLockedZoom(start, 0.0002, focal);
    expect(zoomedOut.nextState.zoom).toBe(MIN_CAMERA_ZOOM);
    expect(zoomedOut.worldAnchorDrift).toBeLessThan(1e-6);

    const zoomedIn = applyAnchorLockedZoom(zoomedOut.nextState, 9999, focal);
    expect(zoomedIn.nextState.zoom).toBe(MAX_CAMERA_ZOOM);
    expect(zoomedIn.worldAnchorDrift).toBeLessThan(1e-6);
  });

  it("prefersReducedMotion: true 설정 시 관성 플링 발사와 진행 중 잔여 이동을 즉시 0으로 차단한다", () => {
    const base = createInitialCameraPhysicsState({ zoom: 2, panX: 100, panY: 200 });

    const blockedAtLaunch = launchInertialPanFling(
      base,
      { x: 1800, y: -1200 },
      { prefersReducedMotion: true },
    );
    expect(blockedAtLaunch.isFlingActive).toBe(false);
    expect(blockedAtLaunch.velocityX).toBe(0);
    expect(blockedAtLaunch.velocityY).toBe(0);

    const active = launchInertialPanFling(base, { x: 1500, y: -900 }, { prefersReducedMotion: false });
    expect(active.isFlingActive).toBe(true);

    const haltedMidFlight = stepInertialPanPhysics(active, 0.016, { prefersReducedMotion: true });
    expect(haltedMidFlight.deltaPanX).toBe(0);
    expect(haltedMidFlight.deltaPanY).toBe(0);
    expect(haltedMidFlight.speedPxPerSec).toBe(0);
    expect(haltedMidFlight.nextState.isFlingActive).toBe(false);
    expect(haltedMidFlight.nextState.panX).toBe(100);
    expect(haltedMidFlight.nextState.panY).toBe(200);
  });

  it("지수 감쇠 관성 패닝은 단일 큰 타임스텝과 다중 미세 서브스텝에서 프레임률 독립적으로 일치한다", () => {
    const start = launchInertialPanFling(
      createInitialCameraPhysicsState({ zoom: 1, panX: 50, panY: -30 }),
      { x: 960, y: 640 },
      { frictionPerSec: 6.0, restSpeedThresholdPxPerSec: 1 },
    );

    const macro = stepInertialPanPhysics(start, 0.12, {
      frictionPerSec: 6.0,
      restSpeedThresholdPxPerSec: 1,
    });

    let microState = start;
    for (let i = 0; i < 12; i += 1) {
      microState = stepInertialPanPhysics(microState, 0.01, {
        frictionPerSec: 6.0,
        restSpeedThresholdPxPerSec: 1,
      }).nextState;
    }

    expect(microState.panX).toBeCloseTo(macro.nextState.panX, 9);
    expect(microState.panY).toBeCloseTo(macro.nextState.panY, 9);
    expect(microState.velocityX).toBeCloseTo(macro.nextState.velocityX, 9);
    expect(microState.velocityY).toBeCloseTo(macro.nextState.velocityY, 9);
  });

  it("1x·2x·4x·8x 정수 배율에서 디바이스 물리 픽셀 그리드에 정확히 정렬해 1px 펜선 번짐을 제거한다", () => {
    for (const dpr of [1, 2, 3]) {
      for (const crispZoom of CRISP_INTEGER_ZOOMS) {
        const rawCamera = createInitialCameraPhysicsState({
          zoom: crispZoom,
          panX: 137.319,
          panY: -84.673,
        });
        const renderTx = resolvePixelGridCrispTransform(rawCamera, dpr);

        expect(renderTx.isIntegerCrispZoom).toBe(true);
        expect(renderTx.matchedCrispZoom).toBe(crispZoom);
        expect(renderTx.devicePixelResidualX).toBe(0);
        expect(renderTx.devicePixelResidualY).toBe(0);

        // 정수 원고 픽셀(예: X=17, Y=43)이 물리 디바이스 픽셀 정수 경계에 정확히 안착한다.
        const snappedState = snapCameraPanToDevicePixelGrid(rawCamera, dpr);
        const screenInkPt = worldToScreenPoint({ x: 17, y: 43 }, snappedState);
        const devicePxX = screenInkPt.x * dpr;
        const devicePxY = screenInkPt.y * dpr;
        expect(Math.abs(devicePxX - Math.round(devicePxX))).toBeLessThan(1e-10);
        expect(Math.abs(devicePxY - Math.round(devicePxY))).toBeLessThan(1e-10);
      }
    }
  });
});
