// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioSignatureWebtoonLabPanel } from "./StudioSignatureWebtoonLabPanel";
import {
  RELIGHT_MOOD_LIST,
  analyzeEyeFlowAndCutRhythm,
  createDemoEyeFlowInput,
  createDemoMagneticFramingInput,
  createDemoRelightInput,
  oklchToSrgb,
  relightCutOklchNonDestructive,
  solveMagneticSpeedlinesAndBalloonTails,
  srgbToOklch,
  type RelightMoodPresetId,
  type SpeedlineStyleId,
} from "./eyeflow-relighting-magnetic";
import {
  analyzeErgonomicFatigueAndRemap,
  auditThumbnailAndFirst3Cuts,
  buildOfflineVaultAndQrMirrorSession,
  computeWcagContrastRatio,
  createDemoErgonomicSessionInput,
  createDemoOfflineVaultQrInput,
  createDemoThumbnailAndCutsInput,
} from "./thumbnail-ergonomics-offline-qr";

afterEach(cleanup);

describe("1. 실시간 시선 흐름 히트맵 & 컷 리듬 오실로스코프 (analyzeEyeFlowAndCutRhythm)", () => {
  it("정돈된 컷 흐름 대비 시선 역행(세로·가로·시선 충돌)과 클리프행어 호흡 부족을 정확히 탐지한다", () => {
    const clean = analyzeEyeFlowAndCutRhythm(createDemoEyeFlowInput(false));
    const flawed = analyzeEyeFlowAndCutRhythm(createDemoEyeFlowInput(true));

    expect(clean.backtrackEvents).toHaveLength(0);
    expect(clean.backtrackRiskScore).toBe(0);
    expect(clean.flowSmoothnessScore).toBeGreaterThanOrEqual(90);
    expect(clean.cliffhangerBreathScore).toBeGreaterThanOrEqual(90);
    expect(clean.heatmapGrid).toHaveLength(clean.heatmapCols * clean.heatmapRows);
    expect(clean.heatmapGrid.every((c) => c.heat >= 0 && c.heat <= 1 && c.backtrackHeat >= 0 && c.backtrackHeat <= 1)).toBe(true);
    expect(clean.peakCell.heat).toBeCloseTo(1, 2);

    expect(flawed.backtrackEvents.length).toBeGreaterThanOrEqual(2);
    expect(flawed.backtrackEvents.some((e) => e.cause === "vertical-reversal")).toBe(true);
    expect(flawed.backtrackEvents.some((e) => e.cause === "gaze-conflict")).toBe(true);
    expect(flawed.backtrackRiskScore).toBeGreaterThan(clean.backtrackRiskScore + 35);
    expect(flawed.cliffhangerBreathScore).toBeLessThan(clean.cliffhangerBreathScore - 40);
    expect(flawed.overallScore).toBeLessThan(clean.overallScore - 30);

    // 같은 수평 대역 가로 교차 역행 탐지 검증
    const horizontalCross = analyzeEyeFlowAndCutRhythm({
      episodeTitle: "가로 교차 테스트",
      canvasWidthPx: 800,
      readingOrder: "ltr-scroll",
      cuts: [
        {
          cutId: "h-cut",
          order: 1,
          yStartPx: 0,
          widthPx: 800,
          heightPx: 600,
          gapBeforePx: 80,
          contrastRatio: 7.2,
          focalPoint: { x: 0.5, y: 0.5, contrastStrength: 0.7 },
          balloons: [
            { id: "h1", order: 1, x: 0.78, y: 0.35, width: 0.25, height: 0.12, charCount: 14, kind: "dialogue" },
            { id: "h2", order: 2, x: 0.22, y: 0.38, width: 0.25, height: 0.12, charCount: 16, kind: "dialogue" },
          ],
        },
      ],
    });
    expect(horizontalCross.backtrackEvents.some((e) => e.cause === "horizontal-crossing")).toBe(true);
  });
});

describe("2. 비파괴 OKLCH 팔레트 락 & 5종 컷 분위기 일괄 리라이팅 (relightCutOklchNonDestructive)", () => {
  it("sRGB <-> OKLCH 변환이 정확하고 가멋 초과 색상을 안전하게 가멋 매핑한다", () => {
    const sample = { r: 0.82, g: 0.44, b: 0.29 };
    const ok = srgbToOklch(sample.r, sample.g, sample.b);
    const back = oklchToSrgb(ok);
    expect(back.srgb.r).toBeCloseTo(sample.r, 2);
    expect(back.srgb.g).toBeCloseTo(sample.g, 2);
    expect(back.srgb.b).toBeCloseTo(sample.b, 2);

    const outOfGamut = oklchToSrgb({ l: 0.75, c: 0.42, h: 145 });
    expect(outOfGamut.gamutMapped).toBe(true);
    expect(outOfGamut.srgb.r).toBeGreaterThanOrEqual(0);
    expect(outOfGamut.srgb.r).toBeLessThanOrEqual(1);
    expect(outOfGamut.srgb.g).toBeGreaterThanOrEqual(0);
    expect(outOfGamut.srgb.g).toBeLessThanOrEqual(1);
  });

  it("5종 분위기 모두 원본 픽셀을 파괴하지 않고 100% 원본 복원을 보장하며 팔레트 락이 잠금 색을 보호한다", () => {
    const baseInput = createDemoRelightInput("daylight", true);
    const originalCopy = new Uint8ClampedArray(baseInput.sourcePixels);
    const digests = new Set<string>();

    expect(RELIGHT_MOOD_LIST).toHaveLength(5);
    const moods: readonly RelightMoodPresetId[] = [
      "daylight", "sunset-gold", "flashback-sepia", "rainy-night", "moonlight-blue",
    ];

    for (const mood of moods) {
      const result = relightCutOklchNonDestructive({ ...baseInput, mood });
      digests.add(result.relitDigest);

      // 원본 버퍼 불변성 + 100% 복원 검증
      expect(result.metrics.originalIntact).toBe(true);
      expect(Array.from(baseInput.sourcePixels)).toEqual(Array.from(originalCopy));
      const restored = result.restoreOriginal();
      expect(Array.from(restored)).toEqual(Array.from(originalCopy));
      expect(restored).not.toBe(result.originalSnapshot);
      expect(result.nonDestructiveRecipe.mood).toBe(mood);
    }

    // 5종 분위기가 모두 구분되는 출력 생성
    expect(digests.size).toBe(5);

    const rainy = relightCutOklchNonDestructive({ ...baseInput, mood: "rainy-night" });
    const sepia = relightCutOklchNonDestructive({ ...baseInput, mood: "flashback-sepia" });
    expect(rainy.metrics.meanDeltaL).toBeLessThan(-0.04);
    expect(sepia.metrics.meanDeltaC).toBeLessThan(0);

    // 팔레트 락 ON vs OFF: 주인공 피부톤(첫 픽셀) 채도/색조 변화가 락 ON 시 현저히 작아야 함
    const unlockedSepia = relightCutOklchNonDestructive(createDemoRelightInput("flashback-sepia", false));
    const lockedSepia = relightCutOklchNonDestructive(createDemoRelightInput("flashback-sepia", true));
    expect(lockedSepia.metrics.lockedPixelCount).toBeGreaterThan(0);
    expect(unlockedSepia.metrics.lockedPixelCount).toBe(0);

    const skinSrc = srgbToOklch((originalCopy[0] ?? 0) / 255, (originalCopy[1] ?? 0) / 255, (originalCopy[2] ?? 0) / 255);
    const skinLocked = srgbToOklch((lockedSepia.relitPixels[0] ?? 0) / 255, (lockedSepia.relitPixels[1] ?? 0) / 255, (lockedSepia.relitPixels[2] ?? 0) / 255);
    const skinUnlocked = srgbToOklch((unlockedSepia.relitPixels[0] ?? 0) / 255, (unlockedSepia.relitPixels[1] ?? 0) / 255, (unlockedSepia.relitPixels[2] ?? 0) / 255);
    expect(Math.abs(skinLocked.c - skinSrc.c)).toBeLessThan(Math.abs(skinUnlocked.c - skinSrc.c));
  });
});

describe("3. 자석 효과선·집중선·말풍선 꼬리 솔버 (solveMagneticSpeedlinesAndBalloonTails)", () => {
  it("3종 효과선 스타일 전수에서 캐릭터 얼굴·눈 영역 침범 0%를 수학적으로 보장한다", () => {
    const styles: readonly SpeedlineStyleId[] = ["focus-radial", "action-parallel", "shock-burst"];
    for (const style of styles) {
      const input = createDemoMagneticFramingInput(style);
      const solved = solveMagneticSpeedlinesAndBalloonTails(input);

      expect(solved.rays.length).toBeGreaterThan(10);
      expect(solved.balloonTails).toHaveLength(2);
      expect(solved.verification.faceEyeIntrusionCount).toBe(0);
      expect(solved.verification.faceEyeIntrusionPercent).toBe(0);
      expect(solved.verification.guaranteedFaceEyeClear).toBe(true);

      // 독립 샘플링 재검증: 모든 레이와 말풍선 꼬리 베지어 곡선 상 25점이 얼굴·눈 원본 박스 내부에 0점 진입
      const rawFaceEyes = input.protectedZones.filter((z) => z.kind === "face" || z.kind === "eye");
      for (const ray of solved.rays) {
        for (let s = 0; s <= 24; s += 1) {
          const t = s / 24;
          const px = ray.startX + (ray.endX - ray.startX) * t;
          const py = ray.startY + (ray.endY - ray.startY) * t;
          for (const z of rawFaceEyes) {
            const inside = px > z.x && px < z.x + z.width && py > z.y && py < z.y + z.height;
            expect(inside).toBe(false);
          }
        }
      }
      for (const tail of solved.balloonTails) {
        for (let s = 0; s <= 24; s += 1) {
          const t = s / 24;
          const mt = 1 - t;
          const px = mt * mt * tail.anchorX + 2 * mt * t * tail.controlX + t * t * tail.tipX;
          const py = mt * mt * tail.anchorY + 2 * mt * t * tail.controlY + t * t * tail.tipY;
          for (const z of rawFaceEyes) {
            const inside = px > z.x && px < z.x + z.width && py > z.y && py < z.y + z.height;
            expect(inside).toBe(false);
          }
        }
      }
    }
  });
});

describe("4. 160px 소형 썸네일 & 첫 3컷 이탈률 사전 점검 샌드박스 (auditThumbnailAndFirst3Cuts)", () => {
  it("WCAG 2.1 대비 공식과 160px 라이트/다크 피드·첫 3컷 점수가 최적화본과 이탈 위험 초안을 명확히 변별한다", () => {
    expect(computeWcagContrastRatio({ r: 1, g: 1, b: 1 }, { r: 0, g: 0, b: 0 })).toBe(21);
    expect(computeWcagContrastRatio({ r: 0.5, g: 0.5, b: 0.5 }, { r: 0.5, g: 0.5, b: 0.5 })).toBe(1);

    const strong = auditThumbnailAndFirst3Cuts(createDemoThumbnailAndCutsInput(false));
    const weak = auditThumbnailAndFirst3Cuts(createDemoThumbnailAndCutsInput(true));

    expect(strong.simulatedWidthPx).toBe(160);
    expect(strong.titleWcagAaPass).toBe(true);
    expect(strong.characterOccupancyPercent).toBeGreaterThan(40);
    expect(strong.overallRetentionScore).toBeGreaterThanOrEqual(85);
    expect(strong.first3CutsHookScore).toBeGreaterThanOrEqual(85);
    expect(strong.lightFeedAudit.blendsIntoFeed).toBe(false);
    expect(strong.darkFeedAudit.blendsIntoFeed).toBe(false);
    expect(strong.improvementActions).toHaveLength(0);

    expect(weak.titleWcagAaPass).toBe(false);
    expect(weak.darkFeedAudit.blendsIntoFeed).toBe(true);
    expect(weak.overallRetentionScore).toBeLessThan(strong.overallRetentionScore - 35);
    expect(weak.first3CutsHookScore).toBeLessThan(strong.first3CutsHookScore - 35);
    expect(weak.estimatedBounceRiskPercent).toBeGreaterThan(strong.estimatedBounceRiskPercent + 25);
    expect(weak.improvementActions.length).toBeGreaterThanOrEqual(3);
  });
});

describe("5. 100% 로컬 손목 피로 감지 & 한 손 단축키 자동 재매핑 (analyzeErgonomicFatigueAndRemap)", () => {
  it("반복 Undo·고필압·손목 꺾임을 로컬 메모리에서만 감지하고 최빈 3개 도구를 비우세손·휠로 자동 추천한다", () => {
    const fresh = analyzeErgonomicFatigueAndRemap(createDemoErgonomicSessionInput(false, "right"));
    const crunchRight = analyzeErgonomicFatigueAndRemap(createDemoErgonomicSessionInput(true, "right"));
    const crunchLeft = analyzeErgonomicFatigueAndRemap(createDemoErgonomicSessionInput(true, "left"));

    expect(crunchRight.privacyMode).toBe("local-memory-only");
    expect(crunchRight.networkTelemetrySent).toBe(false);
    expect(crunchRight.rapidUndoBurstCount).toBeGreaterThanOrEqual(2);
    expect(crunchRight.highPressureStreakSec).toBeGreaterThanOrEqual(150);
    expect(crunchRight.excessiveWristBendRatio).toBeGreaterThanOrEqual(0.6);
    expect(crunchRight.fatigueScore).toBeGreaterThan(fresh.fatigueScore + 45);
    expect(crunchRight.stretchRecommended).toBe(true);
    expect(crunchRight.microStretchPlan).toHaveLength(3);

    // 최빈 3개 도구(undo, brush-pen, eraser) 순서 및 비우세손 대칭 매핑 검증
    expect(crunchRight.top3Remaps.map((r) => r.toolId)).toEqual(["undo", "brush-pen", "eraser"]);
    expect(crunchRight.shortcutHand).toBe("left");
    expect(crunchRight.top3Remaps[0]?.recommendedOneHandKey).toContain("Q");
    expect(crunchRight.top3Remaps[0]?.recommendedMouseWheel).toContain("휠");

    expect(crunchLeft.shortcutHand).toBe("right");
    expect(crunchLeft.top3Remaps[0]?.recommendedOneHandKey).toContain("O");
    expect(crunchRight.wristTravelReductionPercent).toBeGreaterThan(20);
  });
});

describe("6. 오프라인 비행기 모드 OPFS 금고 & QR 스마트폰 스크롤 검수 (buildOfflineVaultAndQrMirrorSession)", () => {
  it("OPFS 무결성 체크리스트·체크섬 손상 탐지·LAN QR 페이로드 및 25×25 QR SVG 매트릭스를 생성한다", () => {
    const clean = buildOfflineVaultAndQrMirrorSession(createDemoOfflineVaultQrInput(true, false));
    const fault = buildOfflineVaultAndQrMirrorSession(createDemoOfflineVaultQrInput(true, true));

    expect(clean.checklist).toHaveLength(5);
    expect(clean.corruptedFilePaths).toHaveLength(0);
    expect(clean.verifiedFileCount).toBe(clean.totalFileCount);
    expect(clean.integrityScore).toBeGreaterThanOrEqual(90);

    expect(fault.vaultStatus).toBe("fault");
    expect(fault.corruptedFilePaths).toContain("opfs://vault/ep024/cuts-tiles.bin");
    expect(fault.integrityScore).toBeLessThan(clean.integrityScore - 25);

    // LAN 전용 QR 미러 페이로드 & 25x25 파인더 무결성
    expect(clean.mirrorSession.lanOnly).toBe(true);
    expect(clean.mirrorSession.externalCloudUsed).toBe(false);
    expect(clean.mirrorSession.mirrorUrl).toContain("http://192.168.0.42:4173/mirror/scroll");
    const parsed = JSON.parse(clean.mirrorSession.mirrorPayloadJson) as { schema: string; lanOnly: boolean; scrollCutCount: number };
    expect(parsed.schema).toBe("toonstudio.qr-scroll-mirror.v1");
    expect(parsed.lanOnly).toBe(true);
    expect(parsed.scrollCutCount).toBe(48);

    expect(clean.qrModuleCount).toBe(25);
    expect(clean.qrMatrix).toHaveLength(25);
    expect(clean.finderPatternIntact).toBe(true);
    expect(clean.qrSvgMarkup).toContain('fill="currentColor"');
    expect(clean.qrSvgMarkup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("7. StudioSignatureWebtoonLabPanel UI · 3탭 · KO/EN · Calm Atelier 위생 계약", () => {
  it("props 없이 마운트되며 3개 탭 전체가 인터랙티브하게 동작하고 콜백을 호출한다", () => {
    const onEyeFlowAnalyzed = vi.fn();
    const onRelightRestored = vi.fn();
    const onMagneticSolved = vi.fn();
    const onThumbnailAudited = vi.fn();
    const onErgonomicRemapApplied = vi.fn();
    const onQrSessionCreated = vi.fn();

    render(
      <StudioSignatureWebtoonLabPanel
        locale="ko"
        onEyeFlowAnalyzed={onEyeFlowAnalyzed}
        onRelightRestored={onRelightRestored}
        onMagneticSolved={onMagneticSolved}
        onThumbnailAudited={onThumbnailAudited}
        onErgonomicRemapApplied={onErgonomicRemapApplied}
        onQrSessionCreated={onQrSessionCreated}
      />,
    );

    // 탭 1: 시선 흐름 · OKLCH 리라이팅 · 자석 프레이밍
    expect(screen.getByTestId("eyeflow-backtrack-score").textContent).toContain("0/100");
    expect(screen.getByTestId("magnetic-clearance-badge").textContent).toContain("0%");
    fireEvent.click(screen.getByRole("button", { name: /역행·호흡 부족 시뮬레이션/i }));
    expect(screen.getByTestId("eyeflow-backtrack-score").textContent).not.toContain("0/100");
    fireEvent.click(screen.getByRole("button", { name: "비 오는 밤" }));
    fireEvent.click(screen.getByRole("button", { name: "액션 평행선" }));
    expect(screen.getByTestId("magnetic-clearance-badge").textContent).toContain("0%");
    fireEvent.click(screen.getByRole("button", { name: /원본 100% 복원 검증/i }));
    expect(onRelightRestored).toHaveBeenCalledWith(expect.anything(), true);
    expect(onEyeFlowAnalyzed).toHaveBeenCalledTimes(1);
    expect(onMagneticSolved).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("100% 무손실 복원");

    // 탭 2: 160px 썸네일 · 첫 3컷 진단
    fireEvent.click(screen.getByRole("tab", { name: /160px 썸네일/i }));
    expect(screen.getByTestId("thumb-retention-score").textContent).toContain("(S)");
    fireEvent.click(screen.getByRole("button", { name: /이탈 위험 초안 시뮬레이션/i }));
    expect(screen.getByTestId("thumb-improvement-list").children.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(screen.getByRole("button", { name: /다크 피드 160px/i }));
    fireEvent.click(screen.getByRole("button", { name: /썸네일·첫 3컷 진단 확정/i }));
    expect(onThumbnailAudited).toHaveBeenCalledTimes(1);

    // 탭 3: 손목 피로 예방 · 비행기 금고 & QR 미러
    fireEvent.click(screen.getByRole("tab", { name: /손목 피로 예방/i }));
    expect(screen.getByTestId("ergo-top3-remaps").children).toHaveLength(3);
    expect(screen.getByTestId("opfs-vault-checklist").children).toHaveLength(5);
    expect(screen.getByTestId("qr-mirror-svg").querySelectorAll("rect").length).toBeGreaterThan(150);
    fireEvent.click(screen.getByRole("button", { name: /오른손 펜/i }));
    expect(screen.getByTestId("ergo-top3-remaps").textContent).toContain("O (오른손");
    fireEvent.click(screen.getByRole("button", { name: /한 손 단축키 추천 적용/i }));
    expect(onErgonomicRemapApplied).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /체크섬 손상 테스트/i }));
    expect(screen.getByTestId("opfs-vault-checklist").textContent).toContain("fail");
    fireEvent.click(screen.getByRole("button", { name: /LAN QR 검수 세션 확정/i }));
    expect(onQrSessionCreated).toHaveBeenCalledTimes(1);
  });

  it("영어(en) 로케일 및 배럴 금지·줄 수 상한·원시 색상/localStorage/transition-all 금지 위생 계약을 지킨다", () => {
    render(<StudioSignatureWebtoonLabPanel locale="en" />);
    expect(screen.getByRole("tab", { name: "Eye-Flow · OKLCH Relight · Magnetic" })).toBeTruthy();
    expect(screen.getByTestId("magnetic-clearance-badge").textContent).toContain("0%");

    // props 0개 마운트 회귀 확인
    cleanup();
    render(<StudioSignatureWebtoonLabPanel />);
    expect(screen.getByRole("tablist")).toBeTruthy();

    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/webtoon-signature-lab");
    expect(existsSync(resolve(dir, "index.ts"))).toBe(false);
    expect(existsSync(resolve(dir, "index.tsx"))).toBe(false);

    const files = [
      { name: "eyeflow-relighting-magnetic.ts", maxLines: 700 },
      { name: "thumbnail-ergonomics-offline-qr.ts", maxLines: 680 },
      { name: "StudioSignatureWebtoonLabPanel.tsx", maxLines: 460 },
      { name: "webtoon-signature-lab.test.tsx", maxLines: 750 },
    ] as const;

    for (const file of files) {
      const source = readFileSync(resolve(dir, file.name), "utf8");
      const lineCount = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
      expect(lineCount).toBeLessThanOrEqual(file.maxLines);
      if (file.name !== "webtoon-signature-lab.test.tsx") {
        expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(source).not.toMatch(/\brgba?\s*\(/i);
        expect(source).not.toMatch(/\bhsla?\s*\(/i);
        expect(source).not.toContain("localStorage");
      }
      if (file.name === "StudioSignatureWebtoonLabPanel.tsx") {
        expect(source).not.toContain("transition-all");
        expect(source).toContain("[word-break:keep-all]");
        expect(source).toContain("tabular-nums");
      }
    }
  });
});
