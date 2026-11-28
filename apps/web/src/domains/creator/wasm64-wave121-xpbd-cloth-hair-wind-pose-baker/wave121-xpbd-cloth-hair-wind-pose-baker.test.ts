import { describe, expect, it } from "vitest";
import {
  CLOTH_HAIR_PRESETS,
  COLLIDER_PENETRATION_TOLERANCE,
  FABRIC_MATERIALS,
  bakeHeroWebtoonFreezeFrame,
  buildXpbdClothHairWgsl,
  computeXpbdClothMetrics,
  createXpbdClothHairState,
  distancePointToCapsule,
  escapeXpbdSvgXml,
  extractClothTensionFoldRidges,
  renderXpbdClothHairBakeSvg,
  sampleWindField,
  simulateXpbdClothHair,
  stepXpbdClothHair,
  summarizeXpbdClothHairBakeKo,
  validateXpbdClothHairWgsl,
  type ClothHairPresetId,
} from "./index";

const ALL_PRESETS: readonly ClothHairPresetId[] = [
  "long-straight-hair",
  "fantasy-flowing-cape",
  "hanbok-chima-ribbon",
  "scarf-action-trail",
];

describe("Wave 121 XPBD 물리 옷주름·망토·머리카락 바람장 정지컷 포즈 베이커", () => {
  it("1. 4종 웹툰 의상·헤어 프리셋이 관통 0건 및 유한 좌표로 초기화된다", () => {
    for (const presetId of ALL_PRESETS) {
      const state = createXpbdClothHairState(presetId);
      expect(state.presetId).toBe(presetId);
      expect(state.particles.length).toBe(CLOTH_HAIR_PRESETS[presetId].rows * CLOTH_HAIR_PRESETS[presetId].cols);
      expect(state.metrics.colliderPenetrationCount).toBe(0);
      expect(state.metrics.nonFiniteCount).toBe(0);
      expect(state.metrics.maxStretchErrorRatio).toBeLessThan(1e-6);
    }
  });

  it("2. 긴 생머리 프리셋이 다중 프레임 바람장 시뮬레이션에서 안정적으로 동작한다", () => {
    const result = simulateXpbdClothHair("long-straight-hair", { steps: 26 });
    expect(result.stepMetrics.length).toBe(26);
    expect(result.state.metrics.nonFiniteCount).toBe(0);
    expect(result.state.metrics.colliderPenetrationCount).toBe(0);
    expect(result.state.metrics.maxStretchErrorRatio).toBeLessThan(0.02);
    expect(result.state.metrics.tailDisplacement.magnitude).toBeGreaterThan(8);
  });

  it("3. 판타지 망토 프리셋이 강한 측풍에서 넓게 펼쳐지며 2% 신축 한계를 지킨다", () => {
    const result = simulateXpbdClothHair("fantasy-flowing-cape", { steps: 28 });
    expect(result.state.metrics.nonFiniteCount).toBe(0);
    expect(result.state.metrics.colliderPenetrationCount).toBe(0);
    expect(result.state.metrics.maxStretchErrorRatio).toBeLessThan(0.02);
    expect(result.state.metrics.silhouetteSweepRatio).toBeGreaterThan(1.05);
  });

  it("4. 한복 치마·고름 리본 프리셋이 풍성한 드레이프와 관통 0건을 유지한다", () => {
    const result = simulateXpbdClothHair("hanbok-chima-ribbon", { steps: 26 });
    expect(result.state.metrics.nonFiniteCount).toBe(0);
    expect(result.state.metrics.colliderPenetrationCount).toBe(0);
    expect(result.state.metrics.maxStretchErrorRatio).toBeLessThan(0.02);
    expect(result.state.metrics.tailDisplacement.x).toBeGreaterThan(5);
  });

  it("5. 액션 머플러 꼬리 프리셋이 긴 18행 스트립에서도 신축 오차 2% 미만을 지킨다", () => {
    const result = simulateXpbdClothHair("scarf-action-trail", { steps: 30 });
    expect(result.state.rows).toBe(18);
    expect(result.state.metrics.nonFiniteCount).toBe(0);
    expect(result.state.metrics.colliderPenetrationCount).toBe(0);
    expect(result.state.metrics.maxStretchErrorRatio).toBeLessThan(0.02);
    expect(result.state.metrics.tailDisplacement.x).toBeGreaterThan(20);
  });

  it("6. 고정 루트 핀(invMass === 0)은 강한 돌풍 아래에서도 단 1픽셀도 움직이지 않는다", () => {
    for (const presetId of ALL_PRESETS) {
      const initial = createXpbdClothHairState(presetId, {
        wind: { windVector: { x: 340, y: -90 }, gustAmplitude: 140 },
      });
      let state = initial;
      for (let i = 0; i < 32; i += 1) {
        state = stepXpbdClothHair(state, { dt: 1 / 60 });
      }
      const pinnedParticles = state.particles.filter((p) => p.pinned);
      expect(pinnedParticles.length).toBe(state.cols);
      for (const p of pinnedParticles) {
        expect(p.invMass).toBe(0);
        expect(p.x).toBe(p.restX);
        expect(p.y).toBe(p.restY);
        expect(p.z).toBe(p.restZ);
        expect(p.vx).toBe(0);
        expect(p.vy).toBe(0);
      }
    }
  });

  it("7. 모든 4종 프리셋에서 구조 거리 제약 최대 신축 오차가 2% 미만이다", () => {
    for (const presetId of ALL_PRESETS) {
      const { state } = simulateXpbdClothHair(presetId, {
        steps: 32,
        wind: { windVector: { x: 280, y: -40 }, gustAmplitude: 120 },
      });
      const recomputed = computeXpbdClothMetrics(state);
      expect(recomputed.maxStretchErrorRatio).toBeLessThan(0.02);
      expect(recomputed.meanStretchErrorRatio).toBeLessThan(0.01);
    }
  });

  it("8. 강풍 방향을 오른쪽(+X)에서 왼쪽(-X)으로 반전하면 망토 꼬리 변위 부호가 반전된다", () => {
    const rightSim = simulateXpbdClothHair("fantasy-flowing-cape", {
      steps: 28,
      wind: { windVector: { x: 260, y: -15 }, gustAmplitude: 40, turbulenceAmplitude: 12 },
    });
    const leftSim = simulateXpbdClothHair("fantasy-flowing-cape", {
      steps: 28,
      wind: { windVector: { x: -260, y: -15 }, gustAmplitude: 40, turbulenceAmplitude: 12 },
    });
    expect(rightSim.state.metrics.tailDisplacement.x).toBeGreaterThan(35);
    expect(leftSim.state.metrics.tailDisplacement.x).toBeLessThan(-20);
  });

  it("9. 긴 생머리와 액션 머플러에서도 좌·우 바람 반전 시 꼬리 수평 변위 방향이 반전된다", () => {
    for (const presetId of ["long-straight-hair", "scarf-action-trail"] as const) {
      const rightSim = simulateXpbdClothHair(presetId, {
        steps: 28,
        wind: { windVector: { x: 250, y: -10 }, gustAmplitude: 30, turbulenceAmplitude: 10 },
      });
      const leftSim = simulateXpbdClothHair(presetId, {
        steps: 28,
        wind: { windVector: { x: -250, y: -10 }, gustAmplitude: 30, turbulenceAmplitude: 10 },
      });
      expect(rightSim.state.metrics.tailDisplacement.x).toBeGreaterThan(25);
      expect(leftSim.state.metrics.tailDisplacement.x).toBeLessThan(-15);
    }
  });

  it("10. 상승 기류(-Y)는 하강 기류(+Y)보다 자락 끝단을 더 높게 띄운다", () => {
    const updraft = simulateXpbdClothHair("scarf-action-trail", {
      steps: 26,
      wind: { windVector: { x: 180, y: -220 }, gustAmplitude: 20, turbulenceAmplitude: 8 },
    });
    const downdraft = simulateXpbdClothHair("scarf-action-trail", {
      steps: 26,
      wind: { windVector: { x: 180, y: 220 }, gustAmplitude: 20, turbulenceAmplitude: 8 },
    });
    expect(updraft.state.metrics.tailDisplacement.y).toBeLessThan(downdraft.state.metrics.tailDisplacement.y);
  });

  it("11. 왼쪽 역풍이 머리카락·망토를 인체 캡슐로 밀어붙여도 충돌 관통은 정확히 0건이다", () => {
    for (const presetId of ALL_PRESETS) {
      const { state } = simulateXpbdClothHair(presetId, {
        steps: 34,
        wind: { windVector: { x: -320, y: 15 }, gustAmplitude: 95, turbulenceAmplitude: 35 },
      });
      expect(state.metrics.colliderPenetrationCount).toBe(0);
      expect(state.metrics.colliderContactCount).toBeGreaterThan(0);

      for (const p of state.particles) {
        if (p.pinned) continue;
        for (const col of state.colliders) {
          const hit = distancePointToCapsule(p.x, p.y, col);
          expect(hit.dist).toBeGreaterThanOrEqual(col.radius - COLLIDER_PENETRATION_TOLERANCE);
        }
      }
    }
  });

  it("12. 커스텀 원형 장애물 충돌체를 천 경로 한복판에 배치해도 관통 0건 불변식이 유지된다", () => {
    const customColliders = [
      ...CLOTH_HAIR_PRESETS["fantasy-flowing-cape"].colliders,
      { id: "sword-guard", labelKo: "검 코등이", ax: 420, ay: 380, bx: 420, by: 380, radius: 42, friction: 0.25 },
    ];
    const { state } = simulateXpbdClothHair("fantasy-flowing-cape", {
      steps: 32,
      colliders: customColliders,
      wind: { windVector: { x: 260, y: -10 }, gustAmplitude: 40 },
    });
    expect(state.metrics.colliderPenetrationCount).toBe(0);
    for (const p of state.particles) {
      if (p.pinned) continue;
      for (const col of customColliders) {
        expect(distancePointToCapsule(p.x, p.y, col).dist).toBeGreaterThanOrEqual(
          col.radius - COLLIDER_PENETRATION_TOLERANCE,
        );
      }
    }
  });

  it("13. 실크 물성은 고강성 가죽 물성보다 동일 바람장에서 더 큰 굽힘 변형과 꼬리 처짐을 보인다", () => {
    const commonWind = {
      windVector: { x: 190, y: -25 },
      gustAmplitude: 90,
      turbulenceAmplitude: 65,
      turbulenceSeed: 7771,
    };
    const silk = simulateXpbdClothHair("fantasy-flowing-cape", {
      steps: 26,
      materialId: "silk",
      wind: commonWind,
    });
    const leather = simulateXpbdClothHair("fantasy-flowing-cape", {
      steps: 26,
      materialId: "heavy-leather",
      wind: commonWind,
    });
    expect(FABRIC_MATERIALS.silk.bendingCompliance).toBeGreaterThan(FABRIC_MATERIALS["heavy-leather"].bendingCompliance);
    expect(silk.state.metrics.averageBendingAngleRad).toBeGreaterThan(leather.state.metrics.averageBendingAngleRad * 1.15);
  });

  it("14. bendingCompliance 직접 오버라이드로 유연 원단과 경질 원단의 굽힘 강성을 차등 제어할 수 있다", () => {
    const soft = simulateXpbdClothHair("scarf-action-trail", {
      steps: 24,
      bendingCompliance: 0.02,
      wind: { windVector: { x: 170, y: -20 }, gustAmplitude: 80, turbulenceAmplitude: 60 },
    });
    const stiff = simulateXpbdClothHair("scarf-action-trail", {
      steps: 24,
      bendingCompliance: 0.000008,
      wind: { windVector: { x: 170, y: -20 }, gustAmplitude: 80, turbulenceAmplitude: 60 },
    });
    expect(soft.state.metrics.averageBendingAngleRad).toBeGreaterThan(stiff.state.metrics.averageBendingAngleRad * 1.2);
    expect(stiff.state.metrics.maxStretchErrorRatio).toBeLessThan(0.02);
  });

  it("15. 극단 강풍(windSpeed = 500, gust = 220)에서도 NaN/Infinity 0건·관통 0건·신축 <2%를 지킨다", () => {
    for (const presetId of ALL_PRESETS) {
      const { state } = simulateXpbdClothHair(presetId, {
        steps: 22,
        wind: { windVector: { x: 500, y: -120 }, gustAmplitude: 220, turbulenceAmplitude: 140 },
      });
      expect(state.metrics.nonFiniteCount).toBe(0);
      expect(state.metrics.colliderPenetrationCount).toBe(0);
      expect(state.metrics.maxStretchErrorRatio).toBeLessThan(0.02);
      expect(Number.isFinite(state.metrics.kineticEnergy)).toBe(true);
    }
  });

  it("16. 극단적으로 큰 dt(0.5s, 2.0s) 입력에도 CFL 서브스텝 분할이 수치 발산을 막는다", () => {
    let state = createXpbdClothHairState("fantasy-flowing-cape", {
      wind: { windVector: { x: 500, y: -50 }, gustAmplitude: 180 },
    });
    state = stepXpbdClothHair(state, { dt: 0.5 });
    state = stepXpbdClothHair(state, { dt: 2.0 });
    expect(state.substepsExecuted).toBeGreaterThanOrEqual(40);
    expect(state.metrics.nonFiniteCount).toBe(0);
    expect(state.metrics.colliderPenetrationCount).toBe(0);
    expect(state.metrics.maxStretchErrorRatio).toBeLessThan(0.02);
  });

  it("17. 잘못된 dt(NaN, Infinity, 음수) 입력도 안전 폴백으로 NaN 없이 처리된다", () => {
    let state = createXpbdClothHairState("long-straight-hair");
    state = stepXpbdClothHair(state, { dt: Number.NaN });
    state = stepXpbdClothHair(state, { dt: Number.POSITIVE_INFINITY });
    state = stepXpbdClothHair(state, { dt: -0.25 });
    expect(state.metrics.nonFiniteCount).toBe(0);
    expect(state.metrics.colliderPenetrationCount).toBe(0);
    expect(state.stepCount).toBe(3);
  });

  it("18. 동일 turbulenceSeed는 입자 좌표와 지표를 비트 단위로 동일하게 재현한다(시드 결정론)", () => {
    const runA = simulateXpbdClothHair("hanbok-chima-ribbon", {
      steps: 24,
      wind: { turbulenceSeed: 90210 },
    });
    const runB = simulateXpbdClothHair("hanbok-chima-ribbon", {
      steps: 24,
      wind: { turbulenceSeed: 90210 },
    });
    expect(runA.state.particles).toEqual(runB.state.particles);
    expect(runA.state.metrics).toEqual(runB.state.metrics);
  });

  it("19. 서로 다른 turbulenceSeed는 물리 불변식을 지키면서도 구분되는 난류 파형을 만든다", () => {
    const windA = sampleWindField(CLOTH_HAIR_PRESETS["scarf-action-trail"].defaultWind, 380, 420, 0.35);
    const windB = sampleWindField(
      { ...CLOTH_HAIR_PRESETS["scarf-action-trail"].defaultWind, turbulenceSeed: 99991 },
      380,
      420,
      0.35,
    );
    expect(Math.hypot(windA.x - windB.x, windA.y - windB.y, windA.z - windB.z)).toBeGreaterThan(1);

    const simA = simulateXpbdClothHair("scarf-action-trail", { steps: 20, wind: { turbulenceSeed: 101 } });
    const simB = simulateXpbdClothHair("scarf-action-trail", { steps: 20, wind: { turbulenceSeed: 99991 } });
    expect(simA.state.metrics.tailDisplacement.y).not.toBe(simB.state.metrics.tailDisplacement.y);
  });

  it("20. extractClothTensionFoldRidges가 파이프·드레이프·펄럭임 마루 3종 주름 능선을 모두 추출한다", () => {
    const { state } = simulateXpbdClothHair("fantasy-flowing-cape", { steps: 28 });
    const ridgeSet = extractClothTensionFoldRidges(state);
    expect(ridgeSet.ridges.length).toBeGreaterThanOrEqual(5);
    expect(ridgeSet.countsByKind["pipe-fold"]).toBeGreaterThan(0);
    expect(ridgeSet.countsByKind["drape-fold"]).toBeGreaterThan(0);
    expect(ridgeSet.countsByKind["wind-flutter-crest"]).toBeGreaterThan(0);
  });

  it("21. 추출된 모든 주름 능선은 유한 폴리라인, 양수 선폭, 단위 음영 방향 벡터를 갖는다", () => {
    for (const presetId of ALL_PRESETS) {
      const { state } = simulateXpbdClothHair(presetId, { steps: 24 });
      const ridgeSet = extractClothTensionFoldRidges(state);
      for (const ridge of ridgeSet.ridges) {
        expect(ridge.points.length).toBeGreaterThanOrEqual(2);
        expect(ridge.strokeWidthPx).toBeGreaterThan(0.5);
        expect(ridge.compressionStrain).toBeGreaterThanOrEqual(0);
        expect(ridge.bendingAngleRad).toBeGreaterThanOrEqual(0);
        const normalLen = Math.hypot(ridge.shadingNormal.x, ridge.shadingNormal.y);
        expect(normalLen).toBeCloseTo(1, 5);
        for (const pt of ridge.points) {
          expect(Number.isFinite(pt.x)).toBe(true);
          expect(Number.isFinite(pt.y)).toBe(true);
        }
      }
    }
  });

  it("22. 키라이트 방향 반전 시 주름 능선의 음영 법선 벡터도 그림자 쪽으로 일관되게 전환된다", () => {
    const { state } = simulateXpbdClothHair("hanbok-chima-ribbon", { steps: 24 });
    const leftTopLight = extractClothTensionFoldRidges(state, { x: -0.8, y: -0.6 });
    const rightBottomLight = extractClothTensionFoldRidges(state, { x: 0.8, y: 0.6 });
    const firstA = leftTopLight.ridges[0];
    const firstB = rightBottomLight.ridges[0];
    const dot = firstA.shadingNormal.x * firstB.shadingNormal.x + firstA.shadingNormal.y * firstB.shadingNormal.y;
    expect(dot).toBeLessThan(-0.99);
  });

  it("23. bakeHeroWebtoonFreezeFrame이 4종 프리셋 모두에 대해 즉시 트레이싱 가능한 스냅샷을 반환한다", () => {
    for (const presetId of ALL_PRESETS) {
      const bake = bakeHeroWebtoonFreezeFrame(presetId, { steps: 26 });
      expect(bake.traceReady).toBe(true);
      expect(bake.colliderPenetrationCount).toBe(0);
      expect(bake.maxStretchErrorRatio).toBeLessThan(0.02);
      expect(bake.silhouetteSweepRatio).toBeGreaterThan(1.0);
      expect(bake.outerContourPolyline.length).toBeGreaterThan(10);
      expect(bake.foldRidges.ridges.length).toBeGreaterThan(0);
      expect(bake.windStreamlines.length).toBe(7);
      expect(bake.bakedFrameIndex).toBeGreaterThanOrEqual(1);
      expect(bake.bakedFrameIndex).toBeLessThanOrEqual(26);
    }
  });

  it("24. selectPeakDramaFrame=false 옵션이면 정확히 마지막 시뮬레이션 프레임을 베이크한다", () => {
    const bake = bakeHeroWebtoonFreezeFrame("scarf-action-trail", {
      steps: 20,
      selectPeakDramaFrame: false,
    });
    expect(bake.bakedFrameIndex).toBe(20);
    expect(bake.totalSimulatedSteps).toBe(20);
    expect(bake.traceReady).toBe(true);
  });

  it("25. buildXpbdClothHairWgsl과 validateXpbdClothHairWgsl이 4종 프리셋 WGSL을 통과시킨다", () => {
    for (const presetId of ALL_PRESETS) {
      const artifact = buildXpbdClothHairWgsl(presetId);
      const report = validateXpbdClothHairWgsl(artifact);
      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
      expect(artifact.uniformBufferByteLength % 16).toBe(0);
      expect(artifact.uniformBufferByteLength).toBe(96);
      expect(artifact.bindings.length).toBe(4);
      expect(artifact.entryPoints.length).toBe(3);
    }
  });

  it("26. prefersReducedMotion=true WGSL 생성 시 돌풍 배율이 감쇠되고 검증을 통과한다", () => {
    const reduced = buildXpbdClothHairWgsl("fantasy-flowing-cape", { prefersReducedMotion: true });
    expect(reduced.prefersReducedMotion).toBe(true);
    expect(reduced.wgsl).toContain("0.25");
    expect(validateXpbdClothHairWgsl(reduced).valid).toBe(true);
  });

  it("27. validateXpbdClothHairWgsl이 16바이트 미정렬 유니폼 버퍼를 거부한다", () => {
    const valid = buildXpbdClothHairWgsl("fantasy-flowing-cape");
    const broken = validateXpbdClothHairWgsl({ ...valid, uniformBufferByteLength: 92 });
    expect(broken.valid).toBe(false);
    expect(broken.errors.some((e) => e.includes("16바이트"))).toBe(true);
  });

  it("28. validateXpbdClothHairWgsl이 GLSL 금지어(#version, gl_GlobalInvocationID, vec2(, sampler2D)를 거부한다", () => {
    const valid = buildXpbdClothHairWgsl("long-straight-hair");
    const glslInjected = validateXpbdClothHairWgsl({
      ...valid,
      wgsl: `${valid.wgsl}\n// bad: #version 450\nlet x = gl_GlobalInvocationID.x + vec2(1.0, 2.0).x;`,
    });
    expect(glslInjected.valid).toBe(false);
    expect(glslInjected.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("29. validateXpbdClothHairWgsl이 바인딩 누락, 엔트리포인트 누락, 괄호 불균형 및 NaN을 거부한다", () => {
    const valid = buildXpbdClothHairWgsl("hanbok-chima-ribbon");
    const strippedBinding = validateXpbdClothHairWgsl({
      ...valid,
      wgsl: valid.wgsl.replace("@group(0) @binding(3)", "@group(0) @binding(9)"),
    });
    expect(strippedBinding.valid).toBe(false);

    const brokenBraces = validateXpbdClothHairWgsl({
      ...valid,
      wgsl: `${valid.wgsl}\nfn broken() { let a = NaN;`,
    });
    expect(brokenBraces.valid).toBe(false);
    expect(brokenBraces.errors.some((e) => e.includes("NaN"))).toBe(true);
    expect(brokenBraces.errors.some((e) => e.includes("중괄호"))).toBe(true);
  });

  it("30. renderXpbdClothHairBakeSvg가 순수 OKLCH 색상만 사용하고 원시 hex·rgb·rgba·hsl을 0건 출력한다", () => {
    const rawHexPattern = new RegExp("#[0-9a-fA-F]{3,8}\\b", "u");
    const rawFuncPattern = new RegExp("\\b(?:rgba?|hsla?)\\s*\\(", "iu");

    for (const theme of ["calm-atelier-print", "studio-dark"] as const) {
      const bake = bakeHeroWebtoonFreezeFrame("fantasy-flowing-cape", { steps: 24 });
      const svg = renderXpbdClothHairBakeSvg(bake, { theme });
      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain("oklch(");
      expect(rawHexPattern.test(svg)).toBe(false);
      expect(rawFuncPattern.test(svg)).toBe(false);
      expect(svg.includes("NaN")).toBe(false);
      expect(svg.includes("Infinity")).toBe(false);
      expect(svg).toContain('data-layer="wind-streamlines"');
      expect(svg).toContain('data-layer="body-colliders"');
      expect(svg).toContain('data-layer="baked-cloth-mesh"');
      expect(svg).toContain('data-layer="tension-fold-ridges"');
    }
  });

  it("31. renderXpbdClothHairBakeSvg와 escapeXpbdSvgXml이 XML/XSS 특수문자를 완전히 이스케이프한다", () => {
    const malicious = `<script>alert("x&'y")</script>`;
    expect(escapeXpbdSvgXml(malicious)).toBe("&lt;script&gt;alert(&quot;x&amp;&apos;y&quot;)&lt;/script&gt;");

    const bake = bakeHeroWebtoonFreezeFrame("scarf-action-trail", {
      steps: 18,
      title: malicious,
      colliders: [
        { id: `col<"1">`, labelKo: `어깨&'보호'<tag>`, ax: 240, ay: 240, bx: 266, by: 246, radius: 28, friction: 0.2 },
      ],
    });
    const svg = renderXpbdClothHairBakeSvg(bake);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;alert(&quot;x&amp;&apos;y&quot;)&lt;/script&gt;");
    expect(svg).toContain("어깨&amp;&apos;보호&apos;&lt;tag&gt;");
  });

  it("32. summarizeXpbdClothHairBakeKo가 자연스러운 한국어 작화 감독 브리프를 생성하고 번역투가 0건이다", () => {
    const translationesePatterns: readonly RegExp[] = [
      /하는\s*것을\s*가능하게\s*합니다/u,
      /직관적인\s*경험을\s*제공합니다/u,
      /원활한\s*워크플로우를\s*보장합니다/u,
      /혁신적인\s*솔루션/u,
      /최적의\s*결과를\s*도출합니다/u,
    ];

    for (const presetId of ALL_PRESETS) {
      const bake = bakeHeroWebtoonFreezeFrame(presetId, { steps: 24 });
      const brief = summarizeXpbdClothHairBakeKo(bake);
      expect(brief.presetId).toBe(presetId);
      expect(brief.headlineKo).toContain("관통 0건");
      expect(brief.physicsAuditKo).toContain("2.00% 미만");
      expect(brief.inkingGuideKo).toContain("파이프 주름");
      expect(brief.checklistKo.length).toBe(4);
      expect(brief.markdownSummaryKo).toContain("### ");

      const fullText = [
        brief.headlineKo,
        brief.silhouetteAssessmentKo,
        brief.physicsAuditKo,
        brief.inkingGuideKo,
        ...brief.checklistKo,
      ].join("\n");
      for (const pat of translationesePatterns) {
        expect(pat.test(fullText)).toBe(false);
      }
    }
  });
});
