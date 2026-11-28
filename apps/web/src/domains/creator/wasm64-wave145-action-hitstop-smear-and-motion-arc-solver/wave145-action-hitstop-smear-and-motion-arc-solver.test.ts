import { describe, expect, it } from "vitest";
import {
  CAMERA_SHAKE_CONVERGENCE_THRESHOLD_PX,
  WCAG_MAX_IMPACT_FLASH_RATE_HZ,
  buildActionMotionArc,
  buildActionSmearImpactWgsl,
  canonicalizeActionJson,
  compileActionImpactSequence,
  computeActionManifestSha256Hex,
  computeVolumePreservingSquashStretch,
  escapeActionXml,
  generateAfterimageGhosts,
  generateSmearFanPolygon,
  renderActionImpactStoryboardSvg,
  sampleActionMotionArcAt,
  sha256ActionUtf8Hex,
  summarizeActionImpactSequenceKo,
  synthesizeImpactCameraShake,
  validateActionSmearImpactWgsl,
  type ActionImpactTier,
  type ActionMotionArcInput,
} from "./index";

const SLASH_QUAD_ARC: ActionMotionArcInput = {
  curveKind: "quadratic-bezier",
  start: { x: 48, y: 210 },
  control1: { x: 195, y: 28 },
  end: { x: 368, y: 162 },
  sampleCount: 36,
  durationSec: 0.16,
  weaponWidthPx: 22,
  weaponProfile: "blade-slash",
};

const SLASH_CUBIC_ARC: ActionMotionArcInput = {
  curveKind: "cubic-bezier",
  start: { x: 36, y: 220 },
  control1: { x: 130, y: 36 },
  control2: { x: 284, y: 42 },
  end: { x: 382, y: 178 },
  sampleCount: 40,
  durationSec: 0.18,
  weaponWidthPx: 24,
  weaponProfile: "blade-slash",
};

const CIRCULAR_KICK_ARC: ActionMotionArcInput = {
  curveKind: "circular-arc",
  start: { x: 64, y: 204 },
  control1: { x: 212, y: 54 },
  end: { x: 360, y: 204 },
  sampleCount: 36,
  durationSec: 0.2,
  weaponWidthPx: 20,
  weaponProfile: "roundhouse-kick",
};

describe("Wave 145 — 액션 컷 히트스톱·스미어 잔상 및 모션 호 타이밍 합성 솔버", () => {
  describe("1. 모션 호(Motion Arc) 호 길이 재샘플링 및 스쿼시&스트레치 운동학", () => {
    it("2차 베지어 모션 호의 호 길이와 파라미터 u·시간이 엄격히 단조 증가한다", () => {
      const arc = buildActionMotionArc(SLASH_QUAD_ARC);
      expect(arc.arcLengthMonotonic).toBe(true);
      expect(arc.totalArcLengthPx).toBeGreaterThan(280);
      expect(arc.samples.length).toBe(36);
      for (let i = 1; i < arc.samples.length; i += 1) {
        expect(arc.samples[i].u).toBeGreaterThan(arc.samples[i - 1].u);
        expect(arc.samples[i].arcLengthPx).toBeGreaterThan(arc.samples[i - 1].arcLengthPx);
        expect(arc.samples[i].timeSec).toBeGreaterThan(arc.samples[i - 1].timeSec);
      }
    });

    it("3차 베지어 모션 호의 모든 샘플 접선·법선 벡터가 직교 단위벡터이다", () => {
      const arc = buildActionMotionArc(SLASH_CUBIC_ARC);
      expect(arc.resolvedCurveKind).toBe("cubic-bezier");
      for (const s of arc.samples) {
        expect(Math.hypot(s.tangent.x, s.tangent.y)).toBeCloseTo(1, 5);
        expect(Math.hypot(s.normal.x, s.normal.y)).toBeCloseTo(1, 5);
        expect(Math.abs(s.tangent.x * s.normal.x + s.tangent.y * s.normal.y)).toBeLessThan(1e-6);
      }
    });

    it("3점 원호(circular-arc) 궤적은 일정한 곡률 크기를 유지한다", () => {
      const arc = buildActionMotionArc(CIRCULAR_KICK_ARC);
      expect(arc.resolvedCurveKind).toBe("circular-arc");
      const firstCurv = Math.abs(arc.samples[0].signedCurvature);
      expect(firstCurv).toBeGreaterThan(0.002);
      for (const s of arc.samples) {
        expect(Math.abs(Math.abs(s.signedCurvature) - firstCurv)).toBeLessThan(1e-4);
      }
    });

    it("일직선 3점 원호 입력 시 NaN 없이 2차 베지어로 안전 폴백한다", () => {
      const collinear = buildActionMotionArc({
        curveKind: "circular-arc",
        start: { x: 10, y: 100 },
        control1: { x: 110, y: 100 },
        end: { x: 210, y: 100 },
      });
      expect(collinear.resolvedCurveKind).toBe("quadratic-bezier");
      expect(Number.isFinite(collinear.totalArcLengthPx)).toBe(true);
      expect(collinear.totalArcLengthPx).toBeCloseTo(200, 1);
    });

    it("디즈니 Slow-in → Snap → Follow-through 속도 프로파일이 중앙 후반에서 최고점을 찍는다", () => {
      const arc = buildActionMotionArc({ ...SLASH_QUAD_ARC, peakVelocityBias: 0.64 });
      const peakSample = arc.samples[arc.peakSampleIndex];
      expect(peakSample.u).toBeGreaterThan(0.5);
      expect(peakSample.u).toBeLessThan(0.78);
      expect(arc.peakSpeedPxPerSec).toBeGreaterThan(arc.samples[0].speedPxPerSec * 2);
      expect(arc.peakSpeedPxPerSec).toBeGreaterThan(arc.samples[arc.samples.length - 1].speedPxPerSec);
    });

    it("스쿼시&스트레치는 연신 구간에서 scaleParallel * scalePerp === 1.0(오차 < 1e-6)을 보존한다", () => {
      const stretch = computeVolumePreservingSquashStretch({
        speedPxPerSec: 2600,
        referenceSpeedPxPerSec: 1200,
        maxStretchRatio: 1.9,
        phaseMode: "snap-stretch",
      });
      expect(stretch.scaleParallel).toBeGreaterThan(1.3);
      expect(stretch.scalePerp).toBeLessThan(1);
      expect(stretch.areaConservationError).toBeLessThan(1e-6);
      expect(stretch.scaleParallel * stretch.scalePerp).toBeCloseTo(1, 10);
    });

    it("충돌 압축(impact-squash)에서도 면적 보존과 최대 연신 클램프가 지켜진다", () => {
      const squash = computeVolumePreservingSquashStretch({
        speedPxPerSec: 4000,
        referenceSpeedPxPerSec: 900,
        maxStretchRatio: 1.6,
        impactCompression: 0.45,
        phaseMode: "impact-squash",
      });
      expect(squash.scaleParallel).toBeLessThan(1);
      expect(squash.scalePerp).toBeGreaterThan(1);
      expect(squash.areaConservationError).toBeLessThan(1e-6);

      const extremeStretch = computeVolumePreservingSquashStretch({
        speedPxPerSec: 999999,
        referenceSpeedPxPerSec: 100,
        maxStretchRatio: 1.5,
        phaseMode: "snap-stretch",
      });
      expect(extremeStretch.clamped).toBe(true);
      expect(extremeStretch.scaleParallel).toBeCloseTo(1.5, 6);
      expect(extremeStretch.areaConservationError).toBeLessThan(1e-6);
    });

    it("모션 호 전체 샘플의 최대 면적 보존 오차가 1e-6 미만이다", () => {
      const arc = buildActionMotionArc(SLASH_CUBIC_ARC);
      expect(arc.maxAreaConservationError).toBeLessThan(1e-6);
    });

    it("호 길이 보간 조회(sampleActionMotionArcAt)가 시작·중간·끝 좌표를 정확히 반환한다", () => {
      const arc = buildActionMotionArc(SLASH_QUAD_ARC);
      const startSample = sampleActionMotionArcAt(arc, 0);
      const midSample = sampleActionMotionArcAt(arc, 0.5);
      const endSample = sampleActionMotionArcAt(arc, 1);
      expect(startSample.position.x).toBeCloseTo(SLASH_QUAD_ARC.start.x, 2);
      expect(endSample.position.x).toBeCloseTo(SLASH_QUAD_ARC.end.x, 2);
      expect(midSample.arcLengthPx).toBeCloseTo(arc.totalArcLengthPx * 0.5, 1);
    });
  });

  describe("2. 부채꼴 스미어 폴리곤(Smear Fan) 및 지수 감쇠 잔상(Afterimage Ghosts)", () => {
    it("부채꼴 스미어 폴리곤이 양수 면적과 유한 정점·중심 좌표를 생성한다", () => {
      const arc = buildActionMotionArc(SLASH_QUAD_ARC);
      const fan = generateSmearFanPolygon(arc);
      expect(fan.isPositiveArea).toBe(true);
      expect(fan.areaPx2).toBeGreaterThan(800);
      expect(fan.polygon.length).toBeGreaterThanOrEqual(14);
      expect(Number.isFinite(fan.centroid.x)).toBe(true);
      expect(Number.isFinite(fan.centroid.y)).toBe(true);
      expect(fan.angularSweepRad).toBeGreaterThan(0.1);
    });

    it("더 빠른 검격 모션 호가 더 넓은 스미어 팬 결합 계수와 면적을 생성한다", () => {
      const slowArc = buildActionMotionArc({ ...SLASH_QUAD_ARC, durationSec: 0.45 });
      const fastArc = buildActionMotionArc({ ...SLASH_QUAD_ARC, durationSec: 0.1 });
      const slowFan = generateSmearFanPolygon(slowArc);
      const fastFan = generateSmearFanPolygon(fastArc);
      expect(fastFan.speedCouplingFactor).toBeGreaterThan(slowFan.speedCouplingFactor);
      expect(fastFan.areaPx2).toBeGreaterThan(slowFan.areaPx2);
    });

    it("잔상 고스트의 알파값이 엄격히 단조 감소하고 시간 오프셋이 음수로 이어진다", () => {
      const arc = buildActionMotionArc(SLASH_CUBIC_ARC);
      const set = generateAfterimageGhosts(arc, { ghostCount: 7, initialAlpha: 0.82, alphaDecayRate: 0.4 });
      expect(set.ghosts.length).toBe(7);
      expect(set.alphaMonotonicallyDecreasing).toBe(true);
      expect(set.maxAlpha).toBeGreaterThan(set.minAlpha);
      for (let i = 0; i < set.ghosts.length; i += 1) {
        expect(set.ghosts[i].timeOffsetMs).toBeLessThan(0);
        expect(set.ghosts[i].oklchTint.startsWith("oklch(")).toBe(true);
        if (i > 0) {
          expect(set.ghosts[i].alpha).toBeLessThan(set.ghosts[i - 1].alpha);
          expect(set.ghosts[i].u).toBeLessThanOrEqual(set.ghosts[i - 1].u);
        }
      }
    });

    it("잔상 고스트 각각의 스쿼시&스트레치도 면적 보존 법칙을 따른다", () => {
      const arc = buildActionMotionArc(CIRCULAR_KICK_ARC);
      const set = generateAfterimageGhosts(arc, { ghostCount: 5 });
      for (const ghost of set.ghosts) {
        expect(ghost.squashStretch.areaConservationError).toBeLessThan(1e-6);
      }
    });
  });

  describe("3. 타격 강도별 60fps 히트스톱 타임라인 & 감쇠 카메라 셰이크", () => {
    it("4종 타격 강도의 히트스톱 정지 프레임 서열이 finisher > heavy > parry > light를 만족한다", () => {
      const tiers: readonly ActionImpactTier[] = [
        "light-jab",
        "parry-clang",
        "heavy-slash",
        "finisher-critical",
      ];
      const compiled = new Map<ActionImpactTier, ReturnType<typeof compileActionImpactSequence>>();
      for (const tier of tiers) {
        compiled.set(
          tier,
          compileActionImpactSequence({
            cutId: `cut-${tier}`,
            tier,
            arcInput: SLASH_QUAD_ARC,
          }),
        );
      }

      const light = compiled.get("light-jab");
      const parry = compiled.get("parry-clang");
      const heavy = compiled.get("heavy-slash");
      const finisher = compiled.get("finisher-critical");

      expect(finisher?.phaseCounts.hitStopFreezeFrames ?? 0).toBeGreaterThan(
        heavy?.phaseCounts.hitStopFreezeFrames ?? 0,
      );
      expect(heavy?.phaseCounts.hitStopFreezeFrames ?? 0).toBeGreaterThan(
        parry?.phaseCounts.hitStopFreezeFrames ?? 0,
      );
      expect(parry?.phaseCounts.hitStopFreezeFrames ?? 0).toBeGreaterThan(
        light?.phaseCounts.hitStopFreezeFrames ?? 0,
      );
      expect(finisher?.cameraShake.initialAmplitudePx ?? 0).toBeGreaterThan(
        heavy?.cameraShake.initialAmplitudePx ?? 0,
      );
      expect(heavy?.cameraShake.initialAmplitudePx ?? 0).toBeGreaterThan(
        light?.cameraShake.initialAmplitudePx ?? 0,
      );
    });

    it("컴파일된 타임라인 프레임 총합이 5단계 페이즈 합계와 정확히 일치한다", () => {
      const seq = compileActionImpactSequence({
        cutId: "cut-heavy-01",
        tier: "heavy-slash",
        arcInput: SLASH_QUAD_ARC,
      });
      const pc = seq.phaseCounts;
      expect(
        pc.anticipationFrames +
          pc.strikeFrames +
          pc.impactFlashFrames +
          pc.hitStopFreezeFrames +
          pc.followThroughFrames,
      ).toBe(pc.totalFrames);
      expect(seq.frames.length).toBe(pc.totalFrames);
    });

    it("감쇠 카메라 셰이크는 충격 법선 방향으로 초기 변위가 최대이고 종료 잔류가 0.05px 미만이다", () => {
      const shake = synthesizeImpactCameraShake({
        impactDirection: { x: 3, y: 4 },
        initialAmplitudePx: 18,
        dampingRate: 16,
        frequencyHz: 20,
        durationSec: 0.35,
        fps: 60,
      });
      expect(shake.peakFrameIndex).toBe(0);
      expect(shake.peakMagnitudePx).toBeCloseTo(18, 4);
      expect(shake.initialAlignmentCosine).toBeGreaterThan(0.999);
      expect(shake.samples[0].offsetX).toBeCloseTo(18 * 0.6, 3);
      expect(shake.samples[0].offsetY).toBeCloseTo(18 * 0.8, 3);
      expect(shake.terminalResidualPx).toBeLessThan(CAMERA_SHAKE_CONVERGENCE_THRESHOLD_PX);
      expect(shake.convergedWithinThreshold).toBe(true);
    });

    it("매우 약한 감쇠율을 요청해도 종료 잔류 0.05px 미만 불변량을 자동 보정한다", () => {
      const shake = synthesizeImpactCameraShake({
        impactDirection: { x: -1, y: 0.5 },
        initialAmplitudePx: 30,
        dampingRate: 2,
        durationSec: 0.25,
        fps: 60,
      });
      expect(shake.terminalResidualPx).toBeLessThan(CAMERA_SHAKE_CONVERGENCE_THRESHOLD_PX);
      expect(shake.convergedWithinThreshold).toBe(true);
    });

    it("감쇠 카메라 셰이크는 진동 과정에서 부호 반전(탄성 반동)을 보인다", () => {
      const shake = synthesizeImpactCameraShake({
        impactDirection: { x: 1, y: 0 },
        initialAmplitudePx: 15,
        frequencyHz: 18,
        durationSec: 0.3,
        fps: 60,
      });
      const hasPositive = shake.samples.some((s) => s.directionalProjectionPx > 2);
      const hasNegative = shake.samples.some((s) => s.directionalProjectionPx < -0.5);
      expect(hasPositive).toBe(true);
      expect(hasNegative).toBe(true);
    });
  });

  describe("4. WCAG 2.3.1 광과민(<= 3Hz) & prefersReducedMotion 안전 가드", () => {
    it("초당 3Hz를 초과하는 플래시 요청을 자동 클램프하고 한국어 경고를 남긴다", () => {
      const seq = compileActionImpactSequence({
        cutId: "cut-wcag-clamp",
        tier: "finisher-critical",
        arcInput: SLASH_QUAD_ARC,
        requestedFlashCount: 9,
        requestedFlashRateHz: 12,
      });
      expect(seq.safetyGuard.wcagFlashClamped).toBe(true);
      expect(seq.safetyGuard.wcagCompliant).toBe(true);
      expect(seq.safetyGuard.appliedFlashRateHz).toBeLessThanOrEqual(WCAG_MAX_IMPACT_FLASH_RATE_HZ);
      expect(seq.safetyGuard.maxFlashesInOneSecondWindow).toBeLessThanOrEqual(3);
      expect(seq.safetyGuard.warningsKo.length).toBeGreaterThan(0);
      expect(seq.safetyGuard.warningsKo[0]).toContain("WCAG 2.3.1");
    });

    it("WCAG 3Hz 이하 정상 플래시 요청은 클램프 없이 통과한다", () => {
      const seq = compileActionImpactSequence({
        cutId: "cut-wcag-safe",
        tier: "heavy-slash",
        arcInput: SLASH_QUAD_ARC,
        requestedFlashCount: 2,
      });
      expect(seq.safetyGuard.wcagFlashClamped).toBe(false);
      expect(seq.safetyGuard.wcagCompliant).toBe(true);
      expect(seq.safetyGuard.appliedFlashCount).toBe(2);
      expect(seq.safetyGuard.appliedFlashRateHz).toBeLessThanOrEqual(3);
    });

    it("prefersReducedMotion 활성 시 카메라 셰이크 0px·플래시 0회·정적 스틸 폴백으로 전환한다", () => {
      const seq = compileActionImpactSequence({
        cutId: "cut-reduced-motion",
        tier: "finisher-critical",
        arcInput: SLASH_CUBIC_ARC,
        prefersReducedMotion: true,
        requestedFlashCount: 6,
      });
      expect(seq.safetyGuard.prefersReducedMotion).toBe(true);
      expect(seq.safetyGuard.appliedFlashCount).toBe(0);
      expect(seq.safetyGuard.appliedFlashRateHz).toBe(0);
      expect(seq.safetyGuard.maxFlashesInOneSecondWindow).toBe(0);
      expect(seq.safetyGuard.reducedMotionFallbackMode).toBe("static-focus-and-afterimage-still");
      expect(seq.phaseCounts.impactFlashFrames).toBe(0);
      expect(seq.cameraShake.initialAmplitudePx).toBe(0);
      expect(seq.cameraShake.peakMagnitudePx).toBe(0);
      for (const frame of seq.frames) {
        expect(frame.cameraOffsetX).toBe(0);
        expect(frame.cameraOffsetY).toBe(0);
        expect(frame.flashMode).not.toBe("mono-invert");
        expect(frame.flashMode).not.toBe("ink-silhouette");
      }
      expect(seq.frames.some((f) => f.flashMode === "static-focus-still")).toBe(true);
    });

    it("synthesizeImpactCameraShake 단독 호출도 prefersReducedMotion 시 전 구간 0px를 반환한다", () => {
      const shake = synthesizeImpactCameraShake({
        impactDirection: { x: 1, y: 1 },
        initialAmplitudePx: 25,
        prefersReducedMotion: true,
      });
      expect(shake.initialAmplitudePx).toBe(0);
      expect(shake.peakMagnitudePx).toBe(0);
      expect(shake.terminalResidualPx).toBe(0);
      expect(shake.samples.every((s) => s.offsetX === 0 && s.offsetY === 0)).toBe(true);
    });
  });

  describe("5. WebGPU WGSL 방향성 모션 스미어 & 흑백 임팩트 셰이더 검증", () => {
    it("4종 타격 강도 WGSL 셰이더가 64바이트 16B 정렬·바인딩·저모션 분기 검증을 모두 통과한다", () => {
      const tiers: readonly ActionImpactTier[] = [
        "light-jab",
        "parry-clang",
        "heavy-slash",
        "finisher-critical",
      ];
      for (const tier of tiers) {
        const artifact = buildActionSmearImpactWgsl({ tier });
        const report = validateActionSmearImpactWgsl(artifact);
        expect(report.valid).toBe(true);
        expect(report.errors).toEqual([]);
        expect(artifact.uniformBufferByteLength).toBe(64);
        expect(artifact.uniformBufferByteLength % 16).toBe(0);
        expect(artifact.supportsReducedMotionBranch).toBe(true);
        expect(artifact.wgsl).toContain("prefers_reduced_motion");
      }
    });

    it("커스텀 스미어 탭 수 클램프가 [4, 16] 범위로 안전 반영된다", () => {
      const low = buildActionSmearImpactWgsl({ smearTapCount: 1 });
      const high = buildActionSmearImpactWgsl({ smearTapCount: 40 });
      expect(low.smearTapCount).toBe(4);
      expect(high.smearTapCount).toBe(16);
      expect(validateActionSmearImpactWgsl(low).valid).toBe(true);
      expect(validateActionSmearImpactWgsl(high).valid).toBe(true);
    });

    it("유니폼 16바이트 정렬 위반을 WGSL 검증기가 잡아낸다", () => {
      const artifact = buildActionSmearImpactWgsl({ tier: "heavy-slash" });
      const bad = validateActionSmearImpactWgsl({ ...artifact, uniformBufferByteLength: 52 });
      expect(bad.valid).toBe(false);
      expect(bad.errors.some((e) => e.includes("16바이트"))).toBe(true);
    });

    it("WGSL 괄호 불균형 손상을 검증기가 잡아낸다", () => {
      const artifact = buildActionSmearImpactWgsl({ tier: "heavy-slash" });
      const broken = validateActionSmearImpactWgsl({
        ...artifact,
        wgsl: `${artifact.wgsl}\nfn broken_unclosed( {`,
      });
      expect(broken.valid).toBe(false);
      expect(broken.errors.some((e) => e.includes("괄호"))).toBe(true);
    });

    it("GLSL 금지 구문(gl_FragCoord, texture2D, vec3() 등)이 혼입되면 실패한다", () => {
      const artifact = buildActionSmearImpactWgsl({ tier: "parry-clang" });
      const polluted = validateActionSmearImpactWgsl({
        ...artifact,
        wgsl: `${artifact.wgsl}\n// bad: gl_FragCoord vec3(1.0) texture2D(a, b)`,
      });
      expect(polluted.valid).toBe(false);
      expect(polluted.errors.length).toBeGreaterThanOrEqual(3);
    });

    it("저모션 분기(prefers_reduced_motion)나 필수 바인딩 누락을 탐지한다", () => {
      const artifact = buildActionSmearImpactWgsl({ tier: "light-jab" });
      const stripped = validateActionSmearImpactWgsl({
        ...artifact,
        wgsl: artifact.wgsl
          .replace(/prefers_reduced_motion/g, "ignored_flag")
          .replace("@group(0) @binding(2)", "@group(0) @binding(9)"),
      });
      expect(stripped.valid).toBe(false);
      expect(stripped.errors.some((e) => e.includes("prefers_reduced_motion"))).toBe(true);
      expect(stripped.errors.some((e) => e.includes("@binding(2)"))).toBe(true);
    });
  });

  describe("6. 순수 OKLCH 스토리보드 SVG, XSS 이스케이프 및 한국어 연출 QA 브리프", () => {
    it("스토리보드 SVG가 순수 oklch(...) 색상만 사용하고 원시 색상 표기를 포함하지 않는다", () => {
      const seq = compileActionImpactSequence({
        cutId: "cut-svg-paper",
        tier: "heavy-slash",
        arcInput: SLASH_QUAD_ARC,
      });
      const paperSvg = renderActionImpactStoryboardSvg(seq, { theme: "studio-paper" });
      const darkSvg = renderActionImpactStoryboardSvg(seq, { theme: "studio-dark" });

      const rawHexPattern = new RegExp("#[0-9a-fA-F]{3,8}\\b");
      const rawRgbHslPattern = new RegExp("\\b(?:rgba?|hsla?)\\s*\\(", "i");

      for (const svg of [paperSvg, darkSvg]) {
        expect(svg.startsWith("<svg ")).toBe(true);
        expect(svg.endsWith("</svg>")).toBe(true);
        expect(svg).toContain("oklch(");
        expect(rawHexPattern.test(svg)).toBe(false);
        expect(rawRgbHslPattern.test(svg)).toBe(false);
        expect(svg).not.toContain("NaN");
        expect(svg).not.toContain("Infinity");
        expect(svg).toContain('data-layer="smear-fan-polygon"');
        expect(svg).toContain('data-layer="motion-arc-curve"');
        expect(svg).toContain('data-layer="afterimage-ghosts"');
        expect(svg).toContain('data-layer="impact-star-burst"');
        expect(svg).toContain('data-layer="camera-shake-waveform"');
      }
    });

    it("악성 스크립트 제목·컷 ID 입력을 SVG 출력에서 XML 안전 이스케이프한다", () => {
      const seq = compileActionImpactSequence({
        cutId: 'cut-"<script>alert(1)</script>',
        titleKo: `일섬 <img src=x onerror="evil()"> & '체크'`,
        tier: "parry-clang",
        arcInput: SLASH_QUAD_ARC,
      });
      const svg = renderActionImpactStoryboardSvg(seq);
      expect(svg).not.toContain("<script>");
      expect(svg).not.toContain("<img ");
      expect(svg).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(svg).toContain("&lt;img src=x onerror=&quot;evil()&quot;&gt;");
      expect(escapeActionXml(`a&b<c>"d"'e'`)).toBe("a&amp;b&lt;c&gt;&quot;d&quot;&apos;e&apos;");
    });

    it("한국어 액션 연출 QA 브리프가 번역투 없이 핵심 수치와 안전 상태를 요약한다", () => {
      const seq = compileActionImpactSequence({
        cutId: "cut-qa-01",
        titleKo: "혈풍 일섬 결정타",
        tier: "finisher-critical",
        arcInput: SLASH_CUBIC_ARC,
      });
      const report = summarizeActionImpactSequenceKo(seq);
      expect(report.headlineKo).toContain("혈풍 일섬 결정타");
      expect(report.summaryParagraphKo).toContain("히트스톱");
      expect(report.summaryParagraphKo).not.toContain("하는 것을 가능하게 합니다");
      expect(report.summaryParagraphKo).not.toContain("원활한 워크플로우를 보장합니다");
      expect(report.checklistKo.length).toBeGreaterThanOrEqual(5);
      expect(report.actionSequenceSha256Hex).toBe(seq.actionSequenceSha256Hex);
      expect(report.wcagCompliant).toBe(true);
    });

    it("저모션 시퀀스의 한국어 QA 브리프가 0px 셰이크·스틸 폴백 상태를 명시한다", () => {
      const seq = compileActionImpactSequence({
        cutId: "cut-qa-reduced",
        tier: "heavy-slash",
        arcInput: SLASH_QUAD_ARC,
        prefersReducedMotion: true,
      });
      const report = summarizeActionImpactSequenceKo(seq);
      expect(report.prefersReducedMotion).toBe(true);
      expect(report.shakeAndSafetyVerdictKo).toContain("0px");
      expect(report.shakeAndSafetyVerdictKo).toContain("정적 집중선");
    });
  });

  describe("7. 순수 ES2017 FIPS 180-4 SHA-256 결정론 및 매니페스트 지문", () => {
    it("표준 NIST FIPS 180-4 SHA-256 테스트 벡터(빈 문자열·abc)와 정확히 일치한다", () => {
      expect(sha256ActionUtf8Hex("")).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
      expect(sha256ActionUtf8Hex("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    });

    it("키 순서가 다른 객체도 동일한 정규 JSON 및 SHA-256 지문을 산출한다", () => {
      const a = { z: 1.25, a: "타격", nested: { b: true, a: -0 } };
      const b = { nested: { a: 0, b: true }, a: "타격", z: 1.25 };
      expect(canonicalizeActionJson(a)).toBe(canonicalizeActionJson(b));
      expect(computeActionManifestSha256Hex(a)).toBe(computeActionManifestSha256Hex(b));
    });

    it("동일 액션 입력을 반복 컴파일하면 동일한 64자리 SHA-256 지문을 반환한다", () => {
      const run1 = compileActionImpactSequence({
        cutId: "cut-det-01",
        tier: "heavy-slash",
        arcInput: SLASH_QUAD_ARC,
      });
      const run2 = compileActionImpactSequence({
        cutId: "cut-det-01",
        tier: "heavy-slash",
        arcInput: SLASH_QUAD_ARC,
      });
      expect(run1.actionSequenceSha256Hex).toMatch(/^[0-9a-f]{64}$/);
      expect(run1.actionSequenceSha256Hex).toBe(run2.actionSequenceSha256Hex);
    });

    it("타격 강도나 저모션 설정이 바뀌면 매니페스트 SHA-256 지문이 즉시 달라진다", () => {
      const base = compileActionImpactSequence({
        cutId: "cut-det-02",
        tier: "heavy-slash",
        arcInput: SLASH_QUAD_ARC,
      });
      const changedTier = compileActionImpactSequence({
        cutId: "cut-det-02",
        tier: "finisher-critical",
        arcInput: SLASH_QUAD_ARC,
      });
      const reducedMotion = compileActionImpactSequence({
        cutId: "cut-det-02",
        tier: "heavy-slash",
        arcInput: SLASH_QUAD_ARC,
        prefersReducedMotion: true,
      });
      expect(base.actionSequenceSha256Hex).not.toBe(changedTier.actionSequenceSha256Hex);
      expect(base.actionSequenceSha256Hex).not.toBe(reducedMotion.actionSequenceSha256Hex);
    });
  });
});
