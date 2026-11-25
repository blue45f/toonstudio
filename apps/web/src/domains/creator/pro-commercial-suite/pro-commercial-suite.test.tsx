// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ALLOWED_MACRO_ACTIONS,
  CMYK_TAC_LIMIT_PCT,
  DEFAULT_BREAKOUT_LAYERS_FIXTURE,
  DEFAULT_PANEL_FRAME_FIXTURE,
  RELIGHT_PRESETS,
  SUBMISSION_TARGET_SPECS,
  StudioProCommercialPanel,
  acquireCutStageLock,
  auditEpisodeTypographyConsistency,
  buildGoodsDieCutPackage,
  buildSubmissionPackage,
  compositeThreeLayerRelight,
  computePanelBreakoutMasks,
  createDefaultEpisodeBalloons,
  createDefaultLetteringTokens,
  createDefaultProTsMacro,
  createDemoMoodboardSample,
  createDemoThreeLayerScene,
  createGoodsInkSampleBuffer,
  createInitialCutHandoffState,
  createMacroRecorder,
  createPresetSubmissionInput,
  extractMoodboardCameraLut,
  finalizeTsMacro,
  handoffCutStage,
  inspectCmykTacPreflight,
  linearToSrgbByte,
  parseAndValidateTsMacro,
  recordMacroStep,
  releaseCutStageLock,
  replayTsMacro,
  rgbBytesToPrintCmyk,
  serializeTsMacro,
  srgbByteToLinear,
  summarizeCutHandoffBoard,
  toggleLayerBreakoutFlag,
  updateTokenAndPropagate,
  type RelightPresetId,
  type SubmissionTargetId,
} from "./index";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("pro-commercial-suite: 상업 연재 프로 웹툰 8대 전문 엔진 통합 검증", () => {
  // 1. 3층 채색 리라이트 — 5종 조명 프리셋 & sRGB 안전 클램프
  it("엔진1: 비파괴 3층 채색 리라이트가 5종 조명 프리셋을 서로 다른 sRGB 클램프 RGBA 버퍼로 합성한다", () => {
    const scene = createDemoThreeLayerScene(32, 24);
    const presetIds: readonly RelightPresetId[] = ["noon", "sunset", "neon", "moonlight", "indoor"];
    expect(RELIGHT_PRESETS).toHaveLength(5);

    const dominantByPreset = new Set<string>();
    const lumaByPreset: Record<string, number> = {};

    for (const presetId of presetIds) {
      const result = compositeThreeLayerRelight(scene, presetId);
      expect(result.width).toBe(32);
      expect(result.height).toBe(24);
      expect(result.rgba).toHaveLength(32 * 24 * 4);
      expect(result.metrics.opaquePixelCount).toBe(32 * 24);
      expect(result.metrics.dominantOklch.startsWith("oklch(")).toBe(true);
      dominantByPreset.add(result.metrics.dominantOklch);
      lumaByPreset[presetId] = result.metrics.meanLuminance;

      for (let i = 0; i < result.rgba.length; i += 4) {
        expect(result.rgba[i]).toBeGreaterThanOrEqual(0);
        expect(result.rgba[i]).toBeLessThanOrEqual(255);
        expect(result.rgba[i + 3]).toBe(scene.albedo[i + 3]);
      }
    }

    expect(dominantByPreset.size).toBe(5);
    expect(lumaByPreset.noon).toBeGreaterThan(lumaByPreset.moonlight!);
  });

  // 2. 3층 채색 리라이트 — 노출/키/그림자 오버라이드 및 투명 픽셀 보존
  it("엔진1: 리라이트 오버라이드가 단조 휘도 변화를 보장하고 투명 픽셀과 버퍼 길이 검증을 지킨다", () => {
    const scene = createDemoThreeLayerScene(16, 12);
    // 첫 픽셀을 완전 투명으로 설정
    scene.albedo[3] = 0;

    const dark = compositeThreeLayerRelight(scene, "sunset", { exposureBias: -0.8, shadowStrength: 1.5 });
    const bright = compositeThreeLayerRelight(scene, "sunset", { exposureBias: 0.8, keyGain: 1.7, bounceGain: 1.6 });

    expect(bright.metrics.meanLuminance).toBeGreaterThan(dark.metrics.meanLuminance);
    expect(dark.rgba[0]).toBe(0);
    expect(dark.rgba[3]).toBe(0);
    expect(linearToSrgbByte(12.5)).toBe(255);
    expect(linearToSrgbByte(-3)).toBe(0);
    expect(srgbByteToLinear(255)).toBeCloseTo(1, 5);

    expect(() =>
      compositeThreeLayerRelight(
        { width: 8, height: 8, albedo: new Uint8ClampedArray(16), shadow: new Uint8ClampedArray(16), bounceKey: new Uint8ClampedArray(16) },
        "noon",
      ),
    ).toThrow(/부족/);
  });

  // 3. 컷 밖 돌파 마스킹 — breakoutEnabled ON/OFF 및 안전 클립 계산
  it("엔진2: 컷 밖 돌파 마스킹이 breakoutEnabled 레이어만 안전 합집합 클립 마스크로 계산한다", () => {
    const report = computePanelBreakoutMasks(DEFAULT_PANEL_FRAME_FIXTURE, DEFAULT_BREAKOUT_LAYERS_FIXTURE);
    expect(report.activeBreakoutCount).toBe(3);
    expect(report.manualEraserStrokesSaved).toBe(18);

    const bgPlan = report.layers.find((l) => l.layerId === "layer-bg-sky");
    const bladePlan = report.layers.find((l) => l.layerId === "layer-sword-blade");

    expect(bgPlan?.mode).toBe("panel-clipped");
    expect(bgPlan?.overflowRect).toBeNull();
    expect(bgPlan?.overflowAreaPx2).toBe(0);

    expect(bladePlan?.mode).toBe("breakout-union");
    expect(bladePlan?.overflowRect).not.toBeNull();
    expect(bladePlan?.overflowAreaPx2).toBeGreaterThan(0);
    expect(bladePlan?.overflowEdges).toContain("top");
    expect(bladePlan?.overflowEdges).toContain("right");
    expect(bladePlan?.clipPathSvg).toContain("M48.0 42.0");
  });

  // 4. 컷 밖 돌파 마스킹 — 페이지 외곽 클램프 및 불변 토글
  it("엔진2: 페이지 경계를 넘는 돌파 레이어를 자동 클램프하고 플래그 토글을 불변 반영한다", () => {
    const toggled = toggleLayerBreakoutFlag(DEFAULT_BREAKOUT_LAYERS_FIXTURE, "layer-sword-blade", false);
    const reportAfterToggle = computePanelBreakoutMasks(DEFAULT_PANEL_FRAME_FIXTURE, toggled);
    expect(reportAfterToggle.activeBreakoutCount).toBe(2);

    const extremeLayers = [
      {
        id: "layer-extreme-blade",
        name: "초장거리 검기",
        category: "blade" as const,
        breakoutEnabled: true,
        bounds: { x: -40, y: -20, width: 420, height: 120 },
        maxOverflowPx: 80,
        zIndex: 5,
      },
    ];
    const extremeReport = computePanelBreakoutMasks(DEFAULT_PANEL_FRAME_FIXTURE, extremeLayers);
    expect(extremeReport.layers[0]?.clampedToPageEdge).toBe(true);
    expect(extremeReport.collisionWarnings.length).toBeGreaterThan(0);
    expect(extremeReport.layers[0]?.overflowRect?.x).toBeGreaterThanOrEqual(
      DEFAULT_PANEL_FRAME_FIXTURE.pageBounds.x,
    );
  });

  // 5. 작품 전역 말풍선·식자 스타일시트 토큰 일괄 전파 + diff 리포트
  it("엔진3: 식자 토큰 1회 수정이 직접 바인딩 + 화자·감정 매칭 말풍선에 일괄 전파되고 diff를 산출한다", () => {
    const tokens = createDefaultLetteringTokens();
    const balloons = createDefaultEpisodeBalloons(tokens);

    const report = updateTokenAndPropagate(tokens, balloons, "tok-seoyeon-shout", {
      fontFamily: "Pretendard",
      fontSizePx: 30,
      letterSpacingEm: -0.05,
      lineHeight: 1.18,
      strokeWidthPx: 3.5,
      tailCurvature: 0.2,
    });

    expect(report.updatedToken.version).toBe(2);
    // BLN-03(bound), BLN-05(speaker+emotion), BLN-08(bound) 총 3개 매칭
    expect(report.matchedCount).toBe(3);
    expect(report.modifiedCount).toBe(3);
    expect(report.diffs).toHaveLength(3);

    const bln05 = report.updatedBalloons.find((b) => b.balloonId === "BLN-05");
    expect(bln05?.boundTokenId).toBe("tok-seoyeon-shout");
    expect(bln05?.appliedStyle.fontSizePx).toBe(30);
    expect(bln05?.appliedStyle.tailCurvature).toBe(0.2);

    const bln05Diff = report.diffs.find((d) => d.balloonId === "BLN-05");
    expect(bln05Diff?.matchReason).toBe("speaker-emotion");
    expect(bln05Diff?.changedFields.map((f) => f.field)).toContain("fontSizePx");
  });

  // 6. 식자 일관성 감사 (미바인딩 및 드리프트 검출)
  it("엔진3: 회차 식자 일관성 감사가 미바인딩과 스타일 드리프트 말풍선을 정확히 분류한다", () => {
    const tokens = createDefaultLetteringTokens();
    const balloons = createDefaultEpisodeBalloons(tokens);
    const beforeAudit = auditEpisodeTypographyConsistency(tokens, balloons);
    expect(beforeAudit.unboundCount).toBe(1);
    expect(beforeAudit.compliancePct).toBeLessThan(100);

    const synced = updateTokenAndPropagate(tokens, balloons, "tok-seoyeon-shout", { fontSizePx: 27 });
    const afterAudit = auditEpisodeTypographyConsistency(synced.updatedTokens, synced.updatedBalloons);
    expect(afterAudit.unboundCount).toBe(0);
    expect(afterAudit.driftedCount).toBe(0);
    expect(afterAudit.compliancePct).toBe(100);
  });

  // 7. 라이브 컷 잠금 임대 · 충돌 감지 · 만료 후 재취득
  it("엔진4: 컷×공정 잠금 임대 중 타인의 중복 요청을 충돌로 차단하고 만료 후 자동 재취득을 허용한다", () => {
    const baseMs = 1764000000000;
    const initial = createInitialCutHandoffState(baseMs);

    // CUT-01 lineart는 member-main이 활성 점유 중 → member-flat 요청 시 충돌
    const conflictOut = acquireCutStageLock(initial, {
      cutId: "CUT-01",
      stage: "lineart",
      holderId: "member-flat",
      holderName: "박지은 (밑색 어시)",
      leaseDurationMs: 1800000,
      nowMs: baseMs + 60000,
    });
    expect(conflictOut.ok).toBe(false);
    expect(conflictOut.conflict?.existingHolderId).toBe("member-main");
    expect(conflictOut.state.conflicts).toHaveLength(1);

    // 동일 보유자는 멱등 연장 가능
    const renewOut = acquireCutStageLock(conflictOut.state, {
      cutId: "CUT-01",
      stage: "lineart",
      holderId: "member-main",
      holderName: "김도현 (메인작가)",
      leaseDurationMs: 7200000,
      nowMs: baseMs + 120000,
    });
    expect(renewOut.ok).toBe(true);
    expect(renewOut.lease?.expiresAtMs).toBe(baseMs + 120000 + 7200000);

    // 만료 시각 이후에는 타 작업자가 안전하게 재취득 가능
    const takeoverOut = acquireCutStageLock(renewOut.state, {
      cutId: "CUT-01",
      stage: "lineart",
      holderId: "member-flat",
      holderName: "박지은 (밑색 어시)",
      leaseDurationMs: 1800000,
      nowMs: baseMs + 9000000,
    });
    expect(takeoverOut.ok).toBe(true);
    expect(takeoverOut.lease?.holderId).toBe("member-flat");
  });

  // 8. 라이브 컷 잠금 인수인계 & 체크섬 영수증 발급 + 반납
  it("엔진4: 공정 인수인계 시 기존 잠금을 종료하고 다음 공정 임대와 결정론적 체크섬 영수증을 발급한다", () => {
    const baseMs = 1764000000000;
    const initial = createInitialCutHandoffState(baseMs);

    const handoff = handoffCutStage(initial, {
      cutId: "CUT-01",
      fromStage: "lineart",
      fromMemberId: "member-main",
      fromMemberName: "김도현 (메인작가)",
      toMemberId: "member-flat",
      toMemberName: "박지은 (밑색 어시)",
      nowMs: baseMs + 180000,
      checklistPassed: true,
    });

    expect(handoff.ok).toBe(true);
    expect(handoff.receipt?.cutId).toBe("CUT-01");
    expect(handoff.receipt?.fromStage).toBe("lineart");
    expect(handoff.receipt?.toStage).toBe("flat");
    expect(handoff.receipt?.checksum).toMatch(/^[0-9A-F]{8}$/);
    expect(handoff.nextLease?.stage).toBe("flat");
    expect(handoff.nextLease?.holderId).toBe("member-flat");

    const released = releaseCutStageLock(handoff.state, handoff.nextLease!.leaseId, baseMs + 240000);
    const summary = summarizeCutHandoffBoard(released, baseMs + 240000);
    expect(summary.activeLeases.some((l) => l.leaseId === handoff.nextLease!.leaseId)).toBe(false);
  });

  // 9. 굿즈 칼선 — 아크릴 스탠드 (2mm 화이트 보더 + 3mm 도련 + 키링 타공)
  it("엔진5: 아크릴 스탠드 칼선 패키지가 2mm 화이트 보더·3mm 도련·키링 타공·300DPI 픽셀을 정확히 계산한다", () => {
    const pkg = buildGoodsDieCutPackage({
      kind: "acrylic-stand",
      title: "서연 한정 아크릴 스탠드",
      dpi: 300,
      artworkWidthMm: 80,
      artworkHeightMm: 130,
      whiteBorderMm: 2.0,
      bleedMm: 3.0,
      keyringHoleEnabled: true,
      keyringHoleDiameterMm: 3.5,
      samplePixelsRgba: createGoodsInkSampleBuffer("safe", 64),
    });

    expect(pkg.whiteBorderMm).toBe(2);
    expect(pkg.bleedMm).toBe(3);
    expect(pkg.trimWidthMm).toBe(84);
    expect(pkg.trimHeightMm).toBe(134);
    expect(pkg.bleedWidthMm).toBe(90);
    expect(pkg.bleedHeightMm).toBe(140);
    expect(pkg.canvasWidthPx).toBe(Math.round((90 / 25.4) * 300));
    expect(pkg.keyringHole?.diameterMm).toBe(3.5);
    expect(pkg.dieCutSvgPath).toContain("a1.75 1.75");
    expect(pkg.preflight.passed).toBe(true);
    expect(pkg.preflight.maxTacPct).toBeLessThanOrEqual(CMYK_TAC_LIMIT_PCT);
  });

  // 10. 굿즈 칼선 — 포토카드 55×85mm 라운드 코너
  it("엔진5: 포토카드 규격이 55×85mm 표준과 라운드 코너 경로·키링 미포함 규칙을 강제한다", () => {
    const pkg = buildGoodsDieCutPackage({
      kind: "photocard",
      title: "초판 특전 포토카드",
      dpi: 300,
      bleedMm: 3.0,
      cornerRadiusMm: 3.0,
      keyringHoleEnabled: true,
      samplePixelsRgba: createGoodsInkSampleBuffer("safe", 48),
    });

    expect(pkg.trimWidthMm).toBe(55);
    expect(pkg.trimHeightMm).toBe(85);
    expect(pkg.whiteBorderMm).toBe(0);
    expect(pkg.cornerRadiusMm).toBe(3);
    expect(pkg.keyringHole).toBeNull();
    expect(pkg.dieCutSvgPath).toContain("A3.00 3.00");
  });

  // 11. CMYK 총잉크량(TAC <= 300%) 초과 검출
  it("엔진5: CMYK 프리플라이트가 안전 잉크는 통과시키고 무보정 딥 리치블랙(TAC>300%)을 경고한다", () => {
    const pureBlack = rgbBytesToPrintCmyk(0, 0, 0);
    expect(pureBlack.tacPct).toBeGreaterThan(300);

    const safeReport = inspectCmykTacPreflight(createGoodsInkSampleBuffer("safe", 64));
    expect(safeReport.passed).toBe(true);
    expect(safeReport.overLimitPixelCount).toBe(0);

    const heavyReport = inspectCmykTacPreflight(createGoodsInkSampleBuffer("heavy-black", 64));
    expect(heavyReport.passed).toBe(false);
    expect(heavyReport.maxTacPct).toBeGreaterThan(300);
    expect(heavyReport.overLimitPixelCount).toBe(16);
  });

  // 12. 무드보드 레퍼런스 → 카메라 화각 / 3D LUT 추출기
  it("엔진6: 무드보드 레퍼런스 컬러·명도 분포에서 초점거리(mm)·수평 FOV·OKLCH 팔레트·3D LUT 시드를 산출한다", () => {
    const neon = extractMoodboardCameraLut(createDemoMoodboardSample("neon-chase"));
    const romance = extractMoodboardCameraLut(createDemoMoodboardSample("sunset-romance"));
    const thriller = extractMoodboardCameraLut(createDemoMoodboardSample("thriller-alley"));

    expect([24, 28]).toContain(neon.focalLengthMm);
    expect(romance.focalLengthMm).toBe(85);
    expect([35, 135]).toContain(thriller.focalLengthMm);

    expect(neon.fovHorizontalDeg).toBeGreaterThan(romance.fovHorizontalDeg);
    expect(romance.colorTempKelvin).toBeLessThan(neon.colorTempKelvin);
    expect(neon.paletteOklch).toHaveLength(4);
    expect(neon.paletteOklch.every((c) => c.startsWith("oklch("))).toBe(true);
    expect(neon.lutSeedId).toMatch(/^LUT3D-[0-9A-F]{8}$/);
    expect(neon.cubeHeaderPreview).toContain("LUT_3D_SIZE");
  });

  // 13. `.tsmacro` 레코더 · 직렬화 · 체크섬 위변조 검출
  it("엔진7: .tsmacro 레코더가 단계를 기록·직렬화하고 위변조된 체크섬 JSON을 검증 거부한다", () => {
    let rec = createMacroRecorder("야간 액션 일괄 마감");
    rec = recordMacroStep(rec, "relight-preset", "네온 리라이트", { preset: "neon" });
    rec = recordMacroStep(rec, "auto-level-tone", "명암 자동 보정", { gamma: 1.05 }, false);
    const doc = finalizeTsMacro(rec, "2단계 테스트 매크로");

    const serialized = serializeTsMacro(doc);
    const okResult = parseAndValidateTsMacro(serialized);
    expect(okResult.validation.valid).toBe(true);
    expect(okResult.document?.steps).toHaveLength(2);
    expect(ALLOWED_MACRO_ACTIONS.length).toBeGreaterThanOrEqual(6);

    const tamperedPayload = serialized.replace("네온 리라이트", "변조된 단계");
    const badResult = parseAndValidateTsMacro(tamperedPayload);
    expect(badResult.validation.valid).toBe(false);
    expect(badResult.validation.errors.some((e) => e.includes("체크섬"))).toBe(true);

    const tamperedChecksum = serialized.replace(`"checksum": "${doc.checksum}"`, `"checksum": "DEADBEEF"`);
    expect(parseAndValidateTsMacro(tamperedChecksum).validation.valid).toBe(false);
  });

  // 14. `.tsmacro` 일괄 리플레이 (활성 실행 · 비활성 건너뜀)
  it("엔진7: .tsmacro 리플레이어가 활성 단계를 결정론적으로 실행하고 비활성 단계를 건너뛴다", () => {
    let rec = createMacroRecorder("혼합 매크로");
    rec = recordMacroStep(rec, "relight-preset", "노을 리라이트", { preset: "sunset" }, true);
    rec = recordMacroStep(rec, "toggle-breakout", "돌파 토글", { enabled: true }, false);
    rec = recordMacroStep(rec, "run-preflight", "투고 프리플라이트", { target: "naver-webtoon" }, true);
    const doc = finalizeTsMacro(rec, "혼합 실행 테스트");

    const replay = replayTsMacro(doc);
    expect(replay.scope).toBe("simulation");
    expect(replay.success).toBe(true);
    expect(replay.executedCount).toBe(2);
    expect(replay.skippedCount).toBe(1);
    expect(replay.failedCount).toBe(0);
    expect(replay.logs.map((l) => l.status)).toEqual(["executed", "skipped", "executed"]);
  });

  // 15. 공모전·출판사 원클릭 투고 패키지 빌더 — 4대 플랫폼 통과
  it("엔진8: 네이버·카카오·레진·단행본 4대 투고 규격이 정상 프로파일로 매니페스트와 체크섬을 생성한다", () => {
    const targets: readonly SubmissionTargetId[] = ["naver-webtoon", "kakao-page", "lezhin", "print-tankobon"];
    expect(Object.keys(SUBMISSION_TARGET_SPECS)).toHaveLength(4);

    for (const target of targets) {
      const preset = createPresetSubmissionInput(target);
      expect(preset.totalSizeMb).toBeCloseTo(preset.sliceCount * preset.sliceSizeMb, 6);
      const manifest = buildSubmissionPackage(target, preset);
      expect(manifest.readyToSubmit).toBe(true);
      expect(manifest.scope).toBe("input-check-only");
      expect(manifest.filesMaterialized).toBe(false);
      expect(manifest.files.filter((entry) => entry.role === "episode-slice")).toHaveLength(preset.sliceCount);
      expect(JSON.parse(manifest.manifestJson).files).toEqual(manifest.files);
      expect(manifest.failCount).toBe(0);
      expect(manifest.passCount).toBe(6);
      expect(manifest.packageChecksum).toMatch(/^[0-9A-F]{8}$/);
      expect(manifest.files.some((f) => f.role === "manifest")).toBe(true);
      expect(JSON.parse(manifest.manifestJson).targetId).toBe(target);
    }
  });

  // 16. 공모전·출판사 투고 패키지 빌더 — 규격 위반 항목 검출
  it("엔진8: 폭·총용량·여백·회차 표기·DPI 위반 시 readyToSubmit=false와 상세 실패 항목을 반환한다", () => {
    const broken = buildSubmissionPackage("print-tankobon", {
      seriesTitle: "테스트작",
      authorName: "작가A",
      episodeLabel: "프롤로그_임시",
      widthPx: 690,
      sliceCount: 10,
      sliceSizeMb: 25,
      totalSizeMb: 210,
      topMarginPx: 10,
      bottomMarginPx: 12,
      dpi: 72,
    });

    expect(broken.readyToSubmit).toBe(false);
    expect(broken.failCount).toBe(6);
    expect(broken.checks.every((c) => !c.passed)).toBe(true);
  });

  // 17. UI 통합 — 무-props 단독 렌더링 및 탭1(리라이트·컷돌파) 인터랙션
  it("UI 탭1: StudioProCommercialPanel이 props 없이 단독 렌더링되고 리라이트 프리셋과 컷 돌파 토글이 동작한다", () => {
    const onRelightApplied = vi.fn();
    render(<StudioProCommercialPanel onRelightApplied={onRelightApplied} />);

    expect(screen.getByTestId("studio-pro-commercial-panel")).toBeTruthy();
    expect(screen.getByTestId("relight-preview-canvas")).toBeTruthy();

    fireEvent.click(screen.getByTestId("relight-preset-neon"));
    expect(onRelightApplied).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("pro-commercial-status").textContent).toContain("네온");

    expect(screen.getByTestId("breakout-summary-badge").textContent).toContain("활성 돌파 3개");
    fireEvent.click(screen.getByTestId("breakout-toggle-layer-sword-blade"));
    expect(screen.getByTestId("breakout-summary-badge").textContent).toContain("활성 돌파 2개");
  });

  // 18. UI 통합 — 탭2(식자 토큰 일괄 전파 & 어시 핸드오프 충돌/영수증)
  it("UI 탭2: 식자 토큰 일괄 적용 diff와 어시스턴트 잠금 충돌·인수인계 영수증 발급이 동작한다", () => {
    const onTokenPropagated = vi.fn();
    render(<StudioProCommercialPanel onTokenPropagated={onTokenPropagated} />);

    fireEvent.click(screen.getByTestId("pro-tab-typography-handoff"));
    fireEvent.change(screen.getByTestId("token-fontsize-input"), { target: { value: "32" } });
    fireEvent.click(screen.getByTestId("propagate-token-btn"));

    expect(onTokenPropagated).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("token-diff-summary").textContent).toContain("일괄 갱신");

    // 기본 선택 CUT-01 / lineart는 member-main 점유 중 → member-flat이 임대 요청하면 충돌 경고 표시
    fireEvent.click(screen.getByTestId("acquire-lock-btn"));
    expect(screen.getByTestId("handoff-conflict-alert")).toBeTruthy();

    // 인수인계 버튼 클릭 시 RCPT-0002 발급
    fireEvent.click(screen.getByTestId("handoff-stage-btn"));
    expect(screen.getByTestId("handoff-receipt-RCPT-0002")).toBeTruthy();
  });

  // 19. UI 통합 — 탭3(굿즈 칼선/CMYK · 무드보드 LUT · .tsmacro 리플레이 · 투고팩)
  it("UI 탭3: 굿즈 TAC 초과 시뮬레이션·무드보드 화각 전환·매크로 리플레이·투고팩 규격 검사가 동작한다", () => {
    const onSubmissionBuilt = vi.fn();
    render(<StudioProCommercialPanel initialTab="goods-macro-submission" onSubmissionBuilt={onSubmissionBuilt} />);

    expect(screen.getByTestId("goods-tac-badge").textContent).toContain("샘플 입력 통과");
    fireEvent.click(screen.getByTestId("goods-ink-toggle"));
    expect(screen.getByTestId("goods-tac-badge").textContent).toContain("잉크 초과");

    fireEvent.click(screen.getByTestId("mood-preset-sunset-romance"));
    expect(screen.getByTestId("mood-focal-badge").textContent).toContain("85mm");

    fireEvent.click(screen.getByTestId("macro-add-step-btn"));
    fireEvent.click(screen.getByTestId("macro-replay-btn"));
    expect(screen.getByTestId("macro-replay-result").textContent).toContain("검토 5");
    expect(screen.getByTestId("macro-replay-result").textContent).toContain("실제 명령 실행 없음");

    fireEvent.click(screen.getByTestId("submission-target-lezhin"));
    expect(onSubmissionBuilt).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("submission-ready-badge").textContent).toContain("예제 입력 규격 통과");
    expect(screen.getByTestId("submission-ready-badge").textContent).toContain("실제 파일 생성 없음");

    fireEvent.change(screen.getByTestId("submission-width-input"), { target: { value: "500" } });
    expect(screen.getByTestId("submission-ready-badge").textContent).toContain("규격 위반");
  });

  it("투고 매니페스트는 80개 분할을 전부 보존하고 잘못된 분할 수·비유한 수치·빈 이름을 명시적으로 거부한다", () => {
    const preset = createPresetSubmissionInput("naver-webtoon");
    const complete = buildSubmissionPackage("naver-webtoon", { ...preset, sliceCount: 80, sliceSizeMb: 0.1, totalSizeMb: 8 });
    expect(complete.readyToSubmit).toBe(true);
    const slices = complete.files.filter((entry) => entry.role === "episode-slice");
    expect(slices).toHaveLength(80);
    expect(slices[79]?.path).toContain("080.jpg");
    for (const sliceCount of [0, -1, 1.5, 81, NaN, Infinity]) {
      const invalid = buildSubmissionPackage("naver-webtoon", { ...preset, sliceCount });
      expect(invalid.readyToSubmit).toBe(false);
      expect(invalid.checks.find((check) => check.ruleId === "input")?.passed).toBe(false);
      expect(invalid.files.some((entry) => entry.role === "episode-slice")).toBe(false);
    }
    for (const patch of [{ dpi: Infinity }, { topMarginPx: NaN }, { sliceSizeMb: -1 }, { seriesTitle: " " }, { authorName: "" }]) {
      const invalid = buildSubmissionPackage("naver-webtoon", { ...preset, ...patch });
      expect(invalid.readyToSubmit).toBe(false);
      expect(JSON.parse(invalid.manifestJson).checks.some((check: { ruleId: string }) => check.ruleId === "input")).toBe(true);
    }
  });

  it("잘못된 매크로 단계 입력은 예외 없이 검증 실패로 돌려준다", () => {
    const doc = createDefaultProTsMacro();
    for (const step of [null, 1, {}, { ...doc.steps[0], params: null }, { ...doc.steps[0], enabled: "yes" }]) {
      const parsed = parseAndValidateTsMacro(JSON.stringify({ ...doc, steps: [step] }));
      expect(parsed.validation.valid).toBe(false);
      expect(parsed.document).toBeNull();
    }
  });

  it("필수 매크로 헤더의 삭제·타입 오류·잘못된 생성 시각을 체크섬이 유효해도 거부한다", () => {
    const doc = createDefaultProTsMacro();
    for (const field of ["macroId", "descriptionKo", "createdAtIso"] as const) {
      const missing: Record<string, unknown> = { ...doc };
      delete missing[field];
      const result = parseAndValidateTsMacro(JSON.stringify(missing));
      expect(result.document).toBeNull();
      expect(result.validation.valid).toBe(false);
      expect(result.validation.errors.some((error) => error.includes(field))).toBe(true);
      for (const value of [null, 1, {}, [], " "]) {
        const invalid = parseAndValidateTsMacro(JSON.stringify({ ...doc, [field]: value }));
        expect(invalid.document).toBeNull();
        expect(invalid.validation.valid).toBe(false);
      }
    }
    expect(parseAndValidateTsMacro(JSON.stringify({ ...doc, createdAtIso: "잘못된 날짜" })).validation.valid).toBe(false);
    const valid = parseAndValidateTsMacro(serializeTsMacro(doc));
    expect(valid.validation.valid).toBe(true);
    expect(valid.document && replayTsMacro(valid.document).macroId).toBe(doc.macroId);
  });

  it("균일 분할 크기의 합계와 입력 총량을 맞추고 실제 추정 합계로 투고 용량 제한을 검사한다", () => {
    const preset = createPresetSubmissionInput("print-tankobon");
    for (const totalSizeMb of [87, 267.84]) {
      const overLimit = buildSubmissionPackage("print-tankobon", { ...preset, sliceSizeMb: 11.16, totalSizeMb });
      expect(overLimit.readyToSubmit).toBe(false);
      const totalCheck = overLimit.checks.find((check) => check.ruleId === "total-size");
      expect(totalCheck?.passed).toBe(false);
      expect(totalCheck?.actual).toContain("분할 합계 267.84MB");
      expect(overLimit.checks.find((check) => check.ruleId === "slice-size")?.passed).toBe(true);
    }
    const mismatch = buildSubmissionPackage("print-tankobon", { ...preset, sliceSizeMb: 3, totalSizeMb: 50 });
    expect(mismatch.readyToSubmit).toBe(false);
    expect(mismatch.checks.find((check) => check.ruleId === "total-size")?.actual).toContain("분할 합계 72MB / 입력 총량 50MB");
    const uniform = buildSubmissionPackage("print-tankobon", { ...preset, sliceCount: 2, sliceSizeMb: 3, totalSizeMb: 6 });
    expect(uniform.readyToSubmit).toBe(true);
    const slices = uniform.files.filter((entry) => entry.role === "episode-slice");
    expect(slices.reduce((sum, entry) => sum + entry.estimatedKb, 0) / 1024).toBe(6);
  });

  it("다른 탭에서 처음 열거나 왕복한 리라이트 캔버스에도 합성 결과를 다시 그린다", () => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(<StudioProCommercialPanel initialTab="goods-macro-submission" />);
    fireEvent.click(screen.getByTestId("pro-tab-relight-breakout"));
    const firstCanvas = screen.getByTestId("relight-preview-canvas");
    expect(context.mock.contexts).toContain(firstCanvas);
    fireEvent.click(screen.getByTestId("pro-tab-typography-handoff"));
    fireEvent.click(screen.getByTestId("pro-tab-relight-breakout"));
    const reopenedCanvas = screen.getByTestId("relight-preview-canvas");
    expect(reopenedCanvas).not.toBe(firstCanvas);
    expect(context.mock.contexts).toContain(reopenedCanvas);
  });

  it("합성 예제 알림의 비동기 실패·중복 억제·재시도를 처리하고 응답을 실제 적용 성공으로 표시하지 않는다", async () => {
    const onRelightApplied = vi.fn().mockRejectedValueOnce(new Error("알림 실패")).mockResolvedValueOnce(undefined);
    render(<StudioProCommercialPanel onRelightApplied={onRelightApplied} />);
    const preset = screen.getByTestId("relight-preset-neon");
    expect(screen.getByTestId("pro-commercial-scope-notice").textContent).toContain("전자서명·권리 허가 증명이 아니며");
    fireEvent.click(preset);
    expect(screen.getByTestId("studio-pro-commercial-panel").getAttribute("aria-busy")).toBe("true");
    fireEvent.click(preset);
    expect(onRelightApplied).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("pro-commercial-status").textContent).toContain("처리에 실패"));
    fireEvent.click(preset);
    await waitFor(() => expect(screen.getByTestId("pro-commercial-status").textContent).toContain("실제 적용·저장·출력 완료를 뜻하지 않아요"));
    expect(onRelightApplied).toHaveBeenCalledTimes(2);
  });

  it("동기 콜백 오류를 표시하고 투고 대상 변경 시 작성한 회차 표기를 보존한다", () => {
    const onSubmissionBuilt = vi.fn().mockImplementationOnce(() => { throw new Error("알림 오류"); });
    render(<StudioProCommercialPanel initialTab="goods-macro-submission" onSubmissionBuilt={onSubmissionBuilt} />);
    fireEvent.change(screen.getByLabelText("회차 표기"), { target: { value: "09화 - 직접 입력" } });
    fireEvent.click(screen.getByTestId("submission-target-lezhin"));
    expect(screen.getByTestId("pro-commercial-status").textContent).toContain("처리에 실패");
    expect(screen.getByDisplayValue("09화 - 직접 입력")).toBeTruthy();
    fireEvent.click(screen.getByTestId("submission-target-lezhin"));
    expect(onSubmissionBuilt).toHaveBeenCalledTimes(2);
  });

  // 20. 소스 위생 게이트: 800줄 이하 · 원시 색상 0건 · Web Storage/BigInt/private Map store/props={} 0건
  it("소스 위생 게이트: pro-commercial-suite 전체 파일이 줄 수·토큰·금지 패턴 규칙을 100% 준수한다", () => {
    const dir = path.resolve(process.cwd(), "apps/web/src/domains/creator/pro-commercial-suite");
    const prodFiles = [
      "relight-breakout-engine.ts",
      "typography-handoff-engine.ts",
      "goods-macro-submission-engine.ts",
      "macro-document-header.ts",
      "StudioProCommercialPanel.tsx",
      "index.ts",
    ];

    const rawColorRegex = new RegExp("#[0-9a-fA-F]{3,8}\\b|\\brgba?\\s*\\(|\\bhsla?\\s*\\(");
    const webStorageRegex = new RegExp(`\\b(${["local", "Storage"].join("")}|${["session", "Storage"].join("")})\\b`);
    const bigIntHexRegex = /\b0x[0-9a-fA-F]+n\b/;
    const privateMapStoreRegex = /\bprivate\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map\b/;
    const emptyDefaultPropsRegex = /Props\s*=\s*\{\s*\}/;

    for (const fileName of prodFiles) {
      const content = fs.readFileSync(path.join(dir, fileName), "utf8");
      const lines = content.split("\n").length;
      expect(lines, `${fileName} 줄 수 초과`).toBeLessThanOrEqual(800);
      expect(rawColorRegex.test(content), `${fileName} 원시 색상 검출`).toBe(false);
      expect(webStorageRegex.test(content), `${fileName} Web Storage 검출`).toBe(false);
      expect(bigIntHexRegex.test(content), `${fileName} BigInt 리터럴 검출`).toBe(false);
      expect(privateMapStoreRegex.test(content), `${fileName} private Map store 검출`).toBe(false);
      expect(emptyDefaultPropsRegex.test(content), `${fileName} props = {} 금지 위반`).toBe(false);
    }

    const panelSource = fs.readFileSync(path.join(dir, "StudioProCommercialPanel.tsx"), "utf8");
    expect(panelSource).toContain("[word-break:keep-all]");
    expect(panelSource).toContain("tabular-nums");
    expect(panelSource).toContain("min-h-11");
    expect(createDefaultProTsMacro().steps.length).toBe(4);
  });
});
