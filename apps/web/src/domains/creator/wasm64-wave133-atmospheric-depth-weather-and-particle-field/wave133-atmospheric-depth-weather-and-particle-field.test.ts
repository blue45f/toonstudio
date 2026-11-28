import { describe, expect, it } from "vitest";
import {
  DEPTH_LAYER_BOUNDS_METERS,
  WEATHER_PRESETS,
  WEATHER_PRESET_IDS,
  auditKeepOutOcclusions,
  buildAtmosphericWeatherWgsl,
  computeAtmosphericTransmittance,
  doesSegmentIntersectExpandedBox,
  escapeWeatherSvgXml,
  getWeatherPreset,
  listWeatherPresets,
  renderAtmosphericWeatherSvg,
  sampleTransmittanceCurve,
  sha256Wave133Hex,
  summarizeAtmosphericWeatherKo,
  synthesizeAtmosphericWeatherField,
  validateAtmosphericWeatherWgsl,
  type KeepOutBoxInput,
  type WeatherPresetId,
} from "./index";

const HERO_FACE_BOXES: readonly KeepOutBoxInput[] = [
  { id: "hero-face-main", labelKo: "주인공 얼굴", x: 310, y: 260, width: 180, height: 220, marginPx: 12 },
];

const SPEECH_BALLOON_BOXES: readonly KeepOutBoxInput[] = [
  { id: "balloon-top-left", labelKo: "대사 말풍선 1", x: 64, y: 72, width: 220, height: 150, marginPx: 10 },
  { id: "balloon-mid-right", labelKo: "대사 말풍선 2", x: 520, y: 420, width: 230, height: 170, marginPx: 10 },
];

describe("Wave 133 — 3-심도 대기 원근·Beer-Lambert 산란 안개·5종 날씨 파티클 & 무가림 연출 엔진", () => {
  describe("1. 5종 정규 웹툰 날씨 프리셋 및 기본 합성", () => {
    it("5종 정규 웹툰 날씨 프리셋이 고유한 형상과 한국어 라벨을 제공한다", () => {
      const presets = listWeatherPresets();
      expect(presets).toHaveLength(5);
      expect(WEATHER_PRESET_IDS).toEqual([
        "cherry-blossom-gust",
        "monsoon-neon-rain",
        "silent-winter-snow",
        "sunlit-classroom-dust",
        "battlefield-embers",
      ]);
      const shapes = new Set(presets.map((p) => p.shape));
      const labels = new Set(presets.map((p) => p.labelKo));
      expect(shapes.size).toBe(5);
      expect(labels.size).toBe(5);
    });

    it.each(WEATHER_PRESET_IDS)(
      "프리셋 %s 합성이 모든 물리·보호 불변식을 통과한다",
      (presetId) => {
        const result = synthesizeAtmosphericWeatherField({
          presetId,
          viewportWidthPx: 800,
          viewportHeightPx: 1200,
          seed: 13301,
          faceKeepOutBoxes: HERO_FACE_BOXES,
          balloonKeepOutBoxes: SPEECH_BALLOON_BOXES,
        });

        expect(result.presetId).toBe(presetId);
        expect(result.particles.length).toBeGreaterThan(20);
        expect(result.heroFaceAndBalloonOcclusionCount).toBe(0);
        expect(result.invariants.transmittanceStrictlyMonotonic).toBe(true);
        expect(result.invariants.sizeHierarchyValid).toBe(true);
        expect(result.invariants.speedHierarchyValid).toBe(true);
        expect(result.invariants.midgroundSharpestBokeh).toBe(true);
        expect(result.invariants.zeroFaceAndBalloonOcclusion).toBe(true);
        expect(result.invariants.reducedMotionSafe).toBe(true);
        expect(result.weatherFieldSha256Hex).toMatch(/^[0-9a-f]{64}$/u);
      },
    );

    it("전장 불티는 상승 기류(vy < 0)로 솟구치고 네온 폭우는 하강(vy > 0)한다", () => {
      const embers = synthesizeAtmosphericWeatherField({
        presetId: "battlefield-embers",
        seed: 2026,
      });
      const rain = synthesizeAtmosphericWeatherField({
        presetId: "monsoon-neon-rain",
        seed: 2026,
      });

      const meanVy = (list: readonly { readonly vyPxPerSec: number }[]): number =>
        list.reduce((sum, item) => sum + item.vyPxPerSec, 0) / Math.max(1, list.length);

      expect(meanVy(embers.particles)).toBeLessThan(0);
      expect(meanVy(rain.particles)).toBeGreaterThan(0);
    });
  });

  describe("2. Beer-Lambert 지수 대기 투과율 & 안개 혼합 비율", () => {
    it("T(z) = exp(-beta * max(0, z - focusStartM)) 공식 및 fogBlend = 1 - T(z)를 정확히 만족한다", () => {
      const beta = 0.12;
      const focusStart = 2.2;
      const near = computeAtmosphericTransmittance(1.5, beta, focusStart);
      expect(near.transmittance).toBe(1);
      expect(near.fogBlend).toBe(0);

      const far = computeAtmosphericTransmittance(12.2, beta, focusStart);
      const expectedT = Math.exp(-beta * 10.0);
      expect(far.transmittance).toBeCloseTo(expectedT, 12);
      expect(far.fogBlend).toBeCloseTo(1 - expectedT, 12);
      expect(far.transmittance).toBeGreaterThan(0);
      expect(far.transmittance).toBeLessThanOrEqual(1);
    });

    it("깊이가 증가할수록 모든 프리셋에서 투과율이 (0, 1] 범위에서 엄격 단조 감소한다", () => {
      const depths = [2.2, 3.0, 4.5, 6.0, 9.0, 13.0, 20.0];
      for (const presetId of WEATHER_PRESET_IDS) {
        const preset = WEATHER_PRESETS[presetId];
        const curve = sampleTransmittanceCurve(
          preset.defaultExtinctionBeta,
          preset.defaultFocusStartMeters,
          depths,
        );
        for (let i = 1; i < curve.length; i += 1) {
          expect(curve[i].transmittance).toBeGreaterThan(0);
          expect(curve[i].transmittance).toBeLessThan(curve[i - 1].transmittance);
          expect(curve[i].fogBlend).toBeGreaterThan(curve[i - 1].fogBlend);
        }
      }
    });

    it("소광 계수 beta가 클수록 동일 원경 거리에서 투과율이 낮고 안개 혼합이 짙다", () => {
      const clearDust = computeAtmosphericTransmittance(18, 0.04, 2.2);
      const denseEmberHaze = computeAtmosphericTransmittance(18, 0.16, 2.2);
      expect(denseEmberHaze.transmittance).toBeLessThan(clearDust.transmittance);
      expect(denseEmberHaze.fogBlend).toBeGreaterThan(clearDust.fogBlend);
    });
  });

  describe("3. 3-심도(근/중/원경) 시차 크기·속도·초점면 보케 불변식", () => {
    it("모든 파티클의 깊이가 각 계층 물리 범위(근경 0.8~2.2m, 중경 2.2~6.0m, 원경 6.0~20.0m) 안에 놓인다", () => {
      const result = synthesizeAtmosphericWeatherField({
        presetId: "cherry-blossom-gust",
        particleBudget: 150,
        seed: 777,
      });

      for (const p of result.particles) {
        const bounds = DEPTH_LAYER_BOUNDS_METERS[p.layer];
        expect(p.depthMeters).toBeGreaterThanOrEqual(bounds.minMeters);
        expect(p.depthMeters).toBeLessThanOrEqual(bounds.maxMeters);
      }
    });

    it("근경 > 중경 > 원경 평균 크기와 이동 속도 단조성, 중경 초점면 최소 보케 블러가 성립한다", () => {
      for (const presetId of WEATHER_PRESET_IDS) {
        const field = synthesizeAtmosphericWeatherField({
          presetId,
          particleBudget: 120,
          seed: 9991,
        });
        const fg = field.layerMetrics.foreground;
        const mid = field.layerMetrics.midground;
        const bg = field.layerMetrics.background;

        expect(fg.meanRadiusPx).toBeGreaterThan(mid.meanRadiusPx);
        expect(mid.meanRadiusPx).toBeGreaterThan(bg.meanRadiusPx);

        expect(fg.meanSpeedPxPerSec).toBeGreaterThan(mid.meanSpeedPxPerSec);
        expect(mid.meanSpeedPxPerSec).toBeGreaterThan(bg.meanSpeedPxPerSec);

        expect(mid.meanBokehBlurPx).toBeLessThan(fg.meanBokehBlurPx);
        expect(mid.meanBokehBlurPx).toBeLessThan(bg.meanBokehBlurPx);
      }
    });
  });

  describe("4. 주인공 얼굴·말풍선 무가림(0건) 우회·컬링 보장", () => {
    it("점 파티클과 꽃잎이 주인공 얼굴·말풍선 금지 박스를 0건 침범하며 외곽 우회가 작동한다", () => {
      const field = synthesizeAtmosphericWeatherField({
        presetId: "cherry-blossom-gust",
        particleBudget: 180,
        seed: 4242,
        faceKeepOutBoxes: HERO_FACE_BOXES,
        balloonKeepOutBoxes: SPEECH_BALLOON_BOXES,
      });

      expect(field.heroFaceAndBalloonOcclusionCount).toBe(0);
      expect(field.occlusionAudit.faceOcclusionCount).toBe(0);
      expect(field.occlusionAudit.balloonOcclusionCount).toBe(0);
      expect(field.relocatedCount + field.culledCount).toBeGreaterThan(0);

      const independentAudit = auditKeepOutOcclusions(
        field.particles,
        field.faceKeepOutBoxes,
        field.balloonKeepOutBoxes,
      );
      expect(independentAudit.heroFaceAndBalloonOcclusionCount).toBe(0);
    });

    it("네온 폭우의 긴 대각선 빗줄기 선분도 얼굴·말풍선 금지 박스를 단 한 건도 가로지르지 않는다", () => {
      const field = synthesizeAtmosphericWeatherField({
        presetId: "monsoon-neon-rain",
        particleBudget: 240,
        windX: 240,
        seed: 5511,
        faceKeepOutBoxes: HERO_FACE_BOXES,
        balloonKeepOutBoxes: SPEECH_BALLOON_BOXES,
      });

      expect(field.heroFaceAndBalloonOcclusionCount).toBe(0);
      for (const p of field.particles) {
        const extraRadius = p.radiusPx + p.bokehBlurPx * 0.25;
        for (const box of [...field.faceKeepOutBoxes, ...field.balloonKeepOutBoxes]) {
          expect(
            doesSegmentIntersectExpandedBox(p.x1, p.y1, p.x2, p.y2, box, extraRadius),
          ).toBe(false);
        }
      }
    });

    it("금지 박스가 전체 패널을 완전히 덮으면 모든 입자를 안전하게 제외해 침범 0건을 지킨다", () => {
      const fullCover: readonly KeepOutBoxInput[] = [
        { id: "full-face-close-up", x: 0, y: 0, width: 800, height: 1200, marginPx: 16 },
      ];
      const field = synthesizeAtmosphericWeatherField({
        presetId: "silent-winter-snow",
        viewportWidthPx: 800,
        viewportHeightPx: 1200,
        particleBudget: 80,
        faceKeepOutBoxes: fullCover,
      });

      expect(field.particles).toHaveLength(0);
      expect(field.culledCount).toBe(80);
      expect(field.heroFaceAndBalloonOcclusionCount).toBe(0);
      expect(field.invariants.zeroFaceAndBalloonOcclusion).toBe(true);
    });

    it("Liang-Barsky 선분 교차 함수가 모서리를 가로지르는 대각선 빗줄기를 정확히 적발한다", () => {
      const box = {
        id: "b1",
        kind: "face" as const,
        labelKo: "얼굴",
        x: 100,
        y: 100,
        width: 100,
        height: 100,
        marginPx: 0,
      };
      // 양 끝점은 박스 바깥이지만 선분이 박스 중앙을 관통
      expect(doesSegmentIntersectExpandedBox(50, 50, 250, 250, box, 0)).toBe(true);
      // 완전히 떨어진 평행 선분
      expect(doesSegmentIntersectExpandedBox(10, 10, 40, 250, box, 0)).toBe(false);
    });
  });

  describe("5. 바람 방향 반전·정적 접근성(prefersReducedMotion)·결정론·SHA-256", () => {
    it("바람 좌/우 방향 반전 시 빗줄기와 꽃잎의 수평 속도·기울기·선분 방향이 반전된다", () => {
      for (const presetId of ["monsoon-neon-rain", "cherry-blossom-gust"] as readonly WeatherPresetId[]) {
        const rightWind = synthesizeAtmosphericWeatherField({
          presetId,
          windX: 220,
          seed: 31415,
        });
        const leftWind = synthesizeAtmosphericWeatherField({
          presetId,
          windX: -220,
          seed: 31415,
        });

        const avgTilt = (items: readonly { readonly tiltDeg: number }[]): number =>
          items.reduce((s, p) => s + p.tiltDeg, 0) / items.length;
        const avgDeltaX = (items: readonly { readonly x1: number; readonly x2: number }[]): number =>
          items.reduce((s, p) => s + (p.x2 - p.x1), 0) / items.length;

        expect(avgTilt(rightWind.particles)).toBeGreaterThan(10);
        expect(avgTilt(leftWind.particles)).toBeLessThan(-10);
        expect(avgDeltaX(rightWind.particles)).toBeGreaterThan(0);
        expect(avgDeltaX(leftWind.particles)).toBeLessThan(0);
      }
    });

    it("prefersReducedMotion: true 시 플리커 0Hz·흔들림 0px 및 정적 일러스트 스트릭 상한을 보장한다", () => {
      const dynamicRain = synthesizeAtmosphericWeatherField({
        presetId: "monsoon-neon-rain",
        seed: 8080,
        prefersReducedMotion: false,
      });
      const reducedRain = synthesizeAtmosphericWeatherField({
        presetId: "monsoon-neon-rain",
        seed: 8080,
        prefersReducedMotion: true,
        elapsedSeconds: 12.5,
      });

      expect(dynamicRain.animatedFlickerHz).toBeGreaterThan(0);
      expect(reducedRain.animatedFlickerHz).toBe(0);
      expect(reducedRain.maxMotionJitterPx).toBe(0);
      expect(reducedRain.invariants.reducedMotionSafe).toBe(true);

      const maxDynamicStreak = Math.max(...dynamicRain.particles.map((p) => p.streakLengthPx));
      const maxReducedStreak = Math.max(...reducedRain.particles.map((p) => p.streakLengthPx));
      expect(maxReducedStreak).toBeLessThanOrEqual(
        WEATHER_PRESETS["monsoon-neon-rain"].reducedMotionMaxStreakPx,
      );
      expect(maxReducedStreak).toBeLessThan(maxDynamicStreak);

      // 정적 모드에서는 elapsedSeconds 변화에 영향을 받지 않고 동일 프레임을 고정한다.
      const reducedRainAtT0 = synthesizeAtmosphericWeatherField({
        presetId: "monsoon-neon-rain",
        seed: 8080,
        prefersReducedMotion: true,
        elapsedSeconds: 0,
      });
      expect(reducedRain.weatherFieldSha256Hex).toBe(reducedRainAtT0.weatherFieldSha256Hex);
    });

    it("동일 시드·입력은 완전히 동일한 파티클과 SHA-256 지문을 생성하고 시드 변경 시 지문이 달라진다", () => {
      const req = {
        presetId: "sunlit-classroom-dust" as const,
        seed: 20261128,
        faceKeepOutBoxes: HERO_FACE_BOXES,
      };
      const runA = synthesizeAtmosphericWeatherField(req);
      const runB = synthesizeAtmosphericWeatherField(req);
      const runOtherSeed = synthesizeAtmosphericWeatherField({ ...req, seed: 20261129 });

      expect(runA.weatherFieldSha256Hex).toBe(runB.weatherFieldSha256Hex);
      expect(runA.particles).toEqual(runB.particles);
      expect(runOtherSeed.weatherFieldSha256Hex).not.toBe(runA.weatherFieldSha256Hex);
    });

    it("순수 ES2017 FIPS 180-4 SHA-256이 NIST 공식 테스트 벡터 및 한글 UTF-8을 정확히 해시한다", () => {
      expect(sha256Wave133Hex("")).toBe(
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      );
      expect(sha256Wave133Hex("abc")).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
      expect(sha256Wave133Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
      );
      const koDigestA = sha256Wave133Hex("웹툰-웨이브133-대기원근");
      const koDigestB = sha256Wave133Hex("웹툰-웨이브133-대기원근");
      expect(koDigestA).toMatch(/^[0-9a-f]{64}$/u);
      expect(koDigestA).toBe(koDigestB);
    });

    it("NaN·Infinity·음수 치수·미등록 프리셋 등 극단 입력에서도 안전하게 유한 결과를 반환한다", () => {
      const unknownPreset = getWeatherPreset("non-existent-storm");
      expect(unknownPreset.id).toBe("cherry-blossom-gust");

      const field = synthesizeAtmosphericWeatherField({
        presetId: "unknown-id" as WeatherPresetId,
        viewportWidthPx: Number.NaN,
        viewportHeightPx: -500,
        seed: Number.POSITIVE_INFINITY,
        particleBudget: -10,
        windX: Number.NEGATIVE_INFINITY,
        windY: Number.NaN,
        extinctionBeta: -5,
        focusStartMeters: Number.NaN,
        focalDepthMeters: 999,
        elapsedSeconds: Number.POSITIVE_INFINITY,
        faceKeepOutBoxes: [
          { x: Number.NaN, y: 100, width: -20, height: 100 },
          { x: 100, y: 120, width: 120, height: 120, marginPx: Number.NaN },
        ],
      });

      expect(Number.isFinite(field.viewportWidthPx)).toBe(true);
      expect(Number.isFinite(field.viewportHeightPx)).toBe(true);
      expect(field.heroFaceAndBalloonOcclusionCount).toBe(0);
      expect(field.weatherFieldSha256Hex).toMatch(/^[0-9a-f]{64}$/u);
      for (const p of field.particles) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        expect(Number.isFinite(p.depthMeters)).toBe(true);
        expect(Number.isFinite(p.transmittance)).toBe(true);
        expect(Number.isFinite(p.bokehBlurPx)).toBe(true);
      }
    });
  });

  describe("6. WebGPU WGSL 대기 산란·파티클 컬링 셰이더 생성 및 검증", () => {
    it.each(WEATHER_PRESET_IDS)(
      "프리셋 %s WGSL이 64B(16B 정렬) 유니폼·바인딩·@compute/@fragment 검증을 통과한다",
      (presetId) => {
        const artifact = buildAtmosphericWeatherWgsl(presetId, {
          prefersReducedMotion: presetId === "silent-winter-snow",
        });
        const validation = validateAtmosphericWeatherWgsl(artifact);

        expect(validation.valid).toBe(true);
        expect(validation.errors).toEqual([]);
        expect(artifact.uniformBufferByteLength).toBe(64);
        expect(artifact.uniformAlignmentBytes).toBe(16);
        expect(artifact.bindings).toHaveLength(4);
        expect(artifact.entryPoints).toEqual([
          "cs_advect_and_cull_weather",
          "fs_composite_atmospheric_weather",
        ]);
        expect(validation.entryPointCount).toBe(2);
        expect(validation.bindingCount).toBe(4);
        expect(artifact.wgslSha256Hex).toMatch(/^[0-9a-f]{64}$/u);
      },
    );

    it("손상된 WGSL(괄호 불균형, 엔트리포인트 누락, 잘못된 유니폼 크기, NaN)을 정확히 거부한다", () => {
      const validArtifact = buildAtmosphericWeatherWgsl("cherry-blossom-gust");

      const unbalanced = validateAtmosphericWeatherWgsl(`${validArtifact.wgsl}\n{`);
      expect(unbalanced.valid).toBe(false);
      expect(unbalanced.errors.some((e) => e.includes("중괄호"))).toBe(true);

      const missingCompute = validateAtmosphericWeatherWgsl(
        validArtifact.wgsl.replace("@compute @workgroup_size(64, 1, 1)", "// stripped"),
      );
      expect(missingCompute.valid).toBe(false);
      expect(missingCompute.errors.some((e) => e.includes("@compute"))).toBe(true);

      const badUniform = validateAtmosphericWeatherWgsl({
        ...validArtifact,
        uniformBufferByteLength: 52,
      });
      expect(badUniform.valid).toBe(false);
      expect(badUniform.errors.some((e) => e.includes("64바이트"))).toBe(true);

      const withNan = validateAtmosphericWeatherWgsl(
        validArtifact.wgsl.replace("DEFAULT_WIND_X: f32 =", "DEFAULT_WIND_X: f32 = NaN; //"),
      );
      expect(withNan.valid).toBe(false);
      expect(withNan.errors.some((e) => e.includes("NaN"))).toBe(true);
    });

    it("GLSL 비호환 금지어(gl_FragColor, uniform sampler2D, varying, vec4())를 거부한다", () => {
      const base = buildAtmosphericWeatherWgsl("battlefield-embers").wgsl;
      const samples = [
        `${base}\n// gl_FragColor`,
        `${base}\n// uniform sampler2D tex;`,
        `${base}\n// varying vec2 uv;`,
        `${base}\n// let bad = vec4(1.0);`,
      ];
      for (const corrupted of samples) {
        const res = validateAtmosphericWeatherWgsl(corrupted);
        expect(res.valid).toBe(false);
        expect(res.errors.some((e) => e.includes("GLSL 금지어"))).toBe(true);
      }
    });
  });

  describe("7. 인쇄 안전 순수 OKLCH 검수 SVG 및 한국어 감독 QA 브리프", () => {
    it.each(WEATHER_PRESET_IDS)(
      "프리셋 %s SVG가 순수 oklch(...)만 사용하고 원시 hex/rgb/hsl 및 NaN/Infinity가 0건이다",
      (presetId) => {
        const field = synthesizeAtmosphericWeatherField({
          presetId,
          seed: 1337,
          faceKeepOutBoxes: HERO_FACE_BOXES,
          balloonKeepOutBoxes: SPEECH_BALLOON_BOXES,
        });
        const svg = renderAtmosphericWeatherSvg(field);

        expect(svg.startsWith("<svg ")).toBe(true);
        expect(svg.endsWith("</svg>")).toBe(true);
        expect(svg).toContain('data-layer="beer-lambert-fog-bands"');
        expect(svg).toContain('data-layer="beer-lambert-curve"');
        expect(svg).toContain('data-keepout="face"');
        expect(svg).toContain('data-keepout="balloon"');
        expect(svg).toContain(`data-shape="${WEATHER_PRESETS[presetId].shape}"`);
        expect(svg).toContain("oklch(");

        // 원시 색상 리터럴(#hex, rgb/rgba, hsl/hsla) 및 비유한 숫자 완전 차단 검증
        const rawHexColorPattern = new RegExp("#[0-9a-fA-F]{3,8}\\b", "u");
        const rawRgbHslPattern = new RegExp("\\b(?:rgba?|hsla?)\\s*\\(", "iu");
        expect(rawHexColorPattern.test(svg)).toBe(false);
        expect(rawRgbHslPattern.test(svg)).toBe(false);
        expect(/\bNaN\b|\bInfinity\b/u.test(svg)).toBe(false);
      },
    );

    it("SVG 제목과 보호 박스 라벨의 XML 특수문자 및 XSS 태그를 안전하게 이스케이프한다", () => {
      const dangerousTitle = `<script>alert("xss")</script> & '벚꽃' > 검수`;
      const field = synthesizeAtmosphericWeatherField({
        presetId: "cherry-blossom-gust",
        faceKeepOutBoxes: [
          {
            id: `face"<1>`,
            labelKo: `<img src=x onerror="hack('1')">&얼굴`,
            x: 240,
            y: 240,
            width: 160,
            height: 180,
          },
        ],
      });
      const svg = renderAtmosphericWeatherSvg(field, { customTitle: dangerousTitle });

      expect(escapeWeatherSvgXml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&apos;");
      expect(svg).not.toContain("<script>");
      expect(svg).not.toContain("<img ");
      expect(svg).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
      expect(svg).toContain("&apos;벚꽃&apos;");
    });

    it("한국어 웹툰 배경·이펙트 감독 QA 브리프가 번역투 없이 핵심 수치와 정적 안전 상태를 보고한다", () => {
      const normalField = synthesizeAtmosphericWeatherField({
        presetId: "monsoon-neon-rain",
        seed: 2026,
        faceKeepOutBoxes: HERO_FACE_BOXES,
        balloonKeepOutBoxes: SPEECH_BALLOON_BOXES,
      });
      const normalBrief = summarizeAtmosphericWeatherKo(normalField);

      expect(normalBrief.verdict).toBe("ready");
      expect(normalBrief.heroFaceAndBalloonOcclusionCount).toBe(0);
      expect(normalBrief.bulletsKo.length).toBeGreaterThanOrEqual(4);
      expect(normalBrief.reportTextKo).toContain("네온 폭우");
      expect(normalBrief.reportTextKo).toContain("침범 0건");

      const reducedField = synthesizeAtmosphericWeatherField({
        presetId: "silent-winter-snow",
        seed: 2026,
        prefersReducedMotion: true,
        faceKeepOutBoxes: HERO_FACE_BOXES,
      });
      const reducedBrief = summarizeAtmosphericWeatherKo(reducedField);
      expect(reducedBrief.verdict).toBe("reduced-motion-ready");
      expect(reducedBrief.reportTextKo).toContain("0Hz");

      const forbiddenTranslationese = [
        "가능하게 합니다",
        "직관적인 경험을 제공",
        "원활한 워크플로우를 보장",
        "제공합니다",
      ];
      for (const phrase of forbiddenTranslationese) {
        expect(normalBrief.reportTextKo).not.toContain(phrase);
        expect(reducedBrief.reportTextKo).not.toContain(phrase);
      }
    });
  });
});
