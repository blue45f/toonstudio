import { describe, expect, it } from "vitest";

import {
  buildPerspectiveSfx3dMesh,
  createWotsPlusProvenanceSeal,
  DISTAL_TENDON_COUPLING_RATIO,
  evaluatePrimitiveSdf,
  extractDepthGuidedSoftMattes,
  HAND_TOTAL_ACTUATED_DOF,
  inpaintParallaxDisocclusion,
  projectParallaxWithDisocclusionMask,
  renderStylizedArtDirectionShader,
  runOmnichannelMasterReleaseGate,
  scanLinearPiiAndSecrets,
  solveAnatomicalHandGraspIk,
  verifyWatertightTwoManifold,
  verifyWotsPlusProvenanceSeal,
  type GraspTargetPrimitive,
  type Vec3,
} from "./index";

describe("wasm64-wave20-grand-finale: 다중 평면 패럴랙스 가림 해제 에이코날 복원", () => {
  it("시차 이동으로 드러난 구멍을 전경 윤곽 번짐 없이 배경 등조도선 결을 따라 100% 메운다", () => {
    const width = 32;
    const height = 24;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const depth = new Float32Array(width * height);

    for (let y = 0; y < height; y++) {
      // 배경 수평 등조도선(위쪽 하늘색, 아래쪽 짙은 청색)
      const bgR = y < 12 ? 42 : 28;
      const bgG = y < 12 ? 150 : 108;
      const bgB = y < 12 ? 238 : 204;

      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const o = idx * 4;
        // 중앙 전경 캐릭터 실루엣(강렬한 진홍색, depth = 0.12)
        if (x >= 10 && x <= 16 && y >= 5 && y <= 19) {
          rgba[o] = 248;
          rgba[o + 1] = 18;
          rgba[o + 2] = 26;
          rgba[o + 3] = 255;
          depth[idx] = 0.12;
        } else {
          rgba[o] = bgR;
          rgba[o + 1] = bgG;
          rgba[o + 2] = bgB;
          rgba[o + 3] = 255;
          depth[idx] = 0.90;
        }
      }
    }

    const projected = projectParallaxWithDisocclusionMask({
      width,
      height,
      rgba,
      depth,
      cameraShiftPx: { dx: 4, dy: 0 },
    });
    expect(projected.holePixelCount).toBeGreaterThan(20);

    const solved = inpaintParallaxDisocclusion({
      width,
      height,
      rgba: projected.warpedRgba,
      depth: projected.warpedDepth,
      holeMask: projected.holeMask,
      options: { backgroundMinDepth: 0.5, marchRadiusPx: 3, isophoteStrength: 2.8 },
    });

    expect(solved.remainingHoleCount).toBe(0);
    expect(solved.filledHolePixelCount).toBe(projected.holePixelCount);
    expect(solved.rejectedForegroundSampleCount).toBeGreaterThan(0);
    expect(solved.serverCostKrw).toBe(0);

    // 복원된 모든 구멍 픽셀에 전경 진홍색(R=248)이 단 1픽셀도 번지지 않고 배경 청색 계열만 채워져야 한다.
    for (let y = 5; y <= 19; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (projected.holeMask[idx] !== 1) continue;
        const o = idx * 4;
        expect(solved.inpaintedRgba[o]!).toBeLessThan(65);
        expect(solved.inpaintedRgba[o + 2]!).toBeGreaterThan(185);
        expect(solved.inpaintedRgba[o + 3]!).toBe(255);
        expect(solved.inpaintedDepth[idx]!).toBeGreaterThanOrEqual(0.5);

        // 수평 등조도선 경계(y < 12 vs y >= 12) 명암 구분도 보존되는지 확인
        if (y <= 9) {
          expect(solved.inpaintedRgba[o + 1]!).toBeGreaterThan(135);
        } else if (y >= 14) {
          expect(solved.inpaintedRgba[o + 1]!).toBeLessThan(125);
        }
      }
    }
  });

  it("전경에 완전히 둘러싸인 고립 구멍도 폴백 전진으로 빈 틈 0개를 달성한다", () => {
    const width = 12;
    const height = 12;
    const rgba = new Uint8ClampedArray(width * height * 4).fill(180);
    const depth = new Float32Array(width * height).fill(0.2);
    const holeMask = new Uint8Array(width * height);
    holeMask[5 * width + 5] = 1;
    holeMask[5 * width + 6] = 1;

    const res = inpaintParallaxDisocclusion({ width, height, rgba, depth, holeMask });
    expect(res.remainingHoleCount).toBe(0);
    expect(res.filledHolePixelCount).toBe(2);
    expect(res.fallbackSeededCount).toBeGreaterThan(0);
  });
});

describe("wasm64-wave20-grand-finale: 3D 투시 돌출·베벨 한글 효과음 수밀 2-다양체 메쉬", () => {
  it("한글 효과음 '콰아앙'과 '번쩍' 프리셋을 경계·비다양체 간선 0개인 수밀 2-다양체로 생성한다", () => {
    for (const sfx of ["콰아앙", "번쩍"]) {
      const mesh = buildPerspectiveSfx3dMesh({
        glyphText: sfx,
        vanishingPoint: { x: 40, y: -10, z: -360 },
        extrusionDepth: 72,
        bevelRadius: 3.2,
        bevelSegments: 2,
      });

      expect(mesh.manifold.isWatertightTwoManifold).toBe(true);
      expect(mesh.manifold.boundaryEdgeCount).toBe(0);
      expect(mesh.manifold.nonManifoldEdgeCount).toBe(0);
      expect(mesh.manifold.degenerateFaceCount).toBe(0);
      expect(mesh.manifold.signedVolume).toBeGreaterThan(100);
      expect(mesh.serverCostKrw).toBe(0);

      expect(mesh.roleFaceCounts.front).toBeGreaterThan(0);
      expect(mesh.roleFaceCounts.bevel).toBeGreaterThan(0);
      expect(mesh.roleFaceCounts.side).toBeGreaterThan(0);
      expect(mesh.roleFaceCounts.back).toBeGreaterThan(0);
      expect(
        mesh.roleFaceCounts.front + mesh.roleFaceCounts.bevel + mesh.roleFaceCounts.side + mesh.roleFaceCounts.back,
      ).toBe(mesh.faceRoles.length);
      expect(mesh.faceRoles.length).toBe(mesh.indices.length / 3);

      // 정점 법선이 모두 단위 벡터로 정규화되어 셀·림 셰이딩에 즉시 투입 가능한지 확인
      for (let v = 0; v < mesh.positions.length / 3; v++) {
        const len = Math.hypot(
          mesh.normals[v * 3]!,
          mesh.normals[v * 3 + 1]!,
          mesh.normals[v * 3 + 2]!,
        );
        expect(len).toBeCloseTo(1, 4);
      }
    }
  });

  it("사용자 정의 오목 폴리곤도 소실점으로 투시 수렴하며 수밀 위상을 유지한다", () => {
    const vp = { x: 0, y: 0, z: -300 };
    // 시계 방향(CW) 오목 화살표/번개 폴리곤 입력 -> 내부에서 CCW 정규화 후 메쉬화
    const customConcave = [
      { x: 40, y: 40 },
      { x: 95, y: 40 },
      { x: 95, y: 75 },
      { x: 65, y: 65 },
      { x: 65, y: 105 },
      { x: 40, y: 105 },
    ].reverse();

    const mesh = buildPerspectiveSfx3dMesh({
      glyphText: "콰아앙!",
      contours: [{ points: customConcave }],
      vanishingPoint: vp,
      extrusionDepth: 90,
      bevelRadius: 2.5,
      bevelSegments: 2,
    });

    const independentCheck = verifyWatertightTwoManifold(mesh.positions, mesh.indices);
    expect(independentCheck.isWatertightTwoManifold).toBe(true);
    expect(independentCheck.boundaryEdgeCount).toBe(0);
    expect(independentCheck.nonManifoldEdgeCount).toBe(0);

    // 전면(z ≈ 0) 대비 후면(z ≈ -90) 정점들이 소실점(0, 0) 쪽으로 수렴했는지 확인
    let frontMeanR = 0;
    let frontCount = 0;
    let backMeanR = 0;
    let backCount = 0;
    for (let v = 0; v < mesh.positions.length / 3; v++) {
      const x = mesh.positions[v * 3]!;
      const y = mesh.positions[v * 3 + 1]!;
      const z = mesh.positions[v * 3 + 2]!;
      if (Math.abs(z) < 1e-3) {
        frontMeanR += Math.hypot(x - vp.x, y - vp.y);
        frontCount++;
      } else if (Math.abs(z + 90) < 1e-3) {
        backMeanR += Math.hypot(x - vp.x, y - vp.y);
        backCount++;
      }
    }
    expect(frontCount).toBe(customConcave.length);
    expect(backCount).toBe(customConcave.length);
    expect(backMeanR / backCount).toBeLessThan((frontMeanR / frontCount) * 0.78);
  });
});

describe("wasm64-wave20-grand-finale: 해부학 15-DOF 손 파지 및 표면 접촉 IK 솔버", () => {
  const assertNoSegmentPenetration = (target: GraspTargetPrimitive, side: "right" | "left" = "right"): void => {
    const solved = solveAnatomicalHandGraspIk({ target, handSide: side });
    expect(solved.totalActuatedDof).toBe(HAND_TOTAL_ACTUATED_DOF);
    expect(solved.digitList).toHaveLength(5);
    expect(solved.interPenetrationFree).toBe(true);
    expect(solved.maxPenetrationDepthM).toBe(0);
    expect(solved.contactDigitCount).toBeGreaterThanOrEqual(4);
    expect(solved.opposingForceClosure).toBe(true);
    expect(solved.serverCostKrw).toBe(0);

    for (const d of solved.digitList) {
      // 힘줄 연동 제약: DIP ≈ 0.67 * PIP
      expect(d.dipFlexionRad).toBeCloseTo(DISTAL_TENDON_COUPLING_RATIO * d.pipFlexionRad, 6);
      expect(d.mcpFlexionRad).toBeGreaterThanOrEqual(0);
      expect(d.pipFlexionRad).toBeGreaterThan(0);

      // 각 지골 선분 내부 조밀 샘플에서 실제 SDF >= padRadius(관통 깊이 0) 독립 검증
      const chains: ReadonlyArray<readonly [Vec3, Vec3]> = [
        [d.joints.mcp, d.joints.pip],
        [d.joints.pip, d.joints.dip],
        [d.joints.dip, d.joints.tip],
      ];
      for (const [p0, p1] of chains) {
        for (let s = 0; s <= 12; s++) {
          const t = s / 12;
          const pt: Vec3 = {
            x: p0.x * (1 - t) + p1.x * t,
            y: p0.y * (1 - t) + p1.y * t,
            z: p0.z * (1 - t) + p1.z * t,
          };
          const { sdf } = evaluatePrimitiveSdf(target, pt);
          expect(sdf - d.padRadiusM).toBeGreaterThanOrEqual(-1e-4);
        }
      }
    }
  };

  it("기울어진 원기둥(검 자루·컵) 표면을 엄지와 네 손가락이 대향 파지하며 관통이 전혀 없다", () => {
    assertNoSegmentPenetration({
      kind: "cylinder",
      center: { x: 0.1, y: 1.15, z: -0.3 },
      axis: { x: 0.22, y: 0.97, z: 0.08 },
      radius: 0.022,
      halfHeight: 0.09,
      label: "검 자루",
    }, "right");
  });

  it("구체(보주)와 직육면체(스마트폰)에 대해서도 오른손·왼손 모두 무관통 접촉 파지를 달성한다", () => {
    assertNoSegmentPenetration({
      kind: "sphere",
      center: { x: 0, y: 1.2, z: 0 },
      radius: 0.036,
      label: "마력 보주",
    }, "right");

    assertNoSegmentPenetration({
      kind: "box",
      center: { x: -0.15, y: 1.05, z: 0.2 },
      halfExtents: { x: 0.036, y: 0.074, z: 0.0055 },
      label: "스마트폰",
    }, "left");
  });
});

describe("wasm64-wave20-grand-finale: 통합 옴니채널 마스터 출고 게이트", () => {
  it("전 채널 기준을 충족하고 WOTS+ 출처 봉인이 유효한 원고에 100점 READY 인증서를 발급한다", () => {
    const sampleCount = 4800;
    const pcm = new Float32Array(sampleCount);
    // -14 LUFS 근처 정현파 생성: -0.691 + 10*log10(A^2 / 2) = -14 => A ≈ 0.3055
    const amp = 0.3055;
    for (let i = 0; i < sampleCount; i++) {
      pcm[i] = amp * Math.sin((2 * Math.PI * 440 * i) / 48000);
    }

    // 선화 알파 마스크: 먼지가 아닌 정상 굵은 선(길이 20px)만 배치
    const maskAlpha = new Uint8Array(24 * 24);
    for (let x = 2; x < 22; x++) maskAlpha[12 * 24 + x] = 255;

    const seal = createWotsPlusProvenanceSeal({
      contentDigestHex: "a9f401bc88317720e4d1cc90112233445566778899aabbccddeeff0011223344",
      secretSeedHex: "studio-ep20-master-seed-key",
      humanAuthoredRatio: 0.98,
    });
    expect(verifyWotsPlusProvenanceSeal(seal)).toBe(true);

    const cert = runOmnichannelMasterReleaseGate({
      episodeId: "ep-020-finale",
      webtoonScroll: {
        canvasWidthPx: 800,
        sliceHeightsPx: [3200, 3200, 2840],
        maxSeamLuminanceDelta: 0.4,
        lineArtAlphaMask: { width: 24, height: 24, alpha: maskAlpha },
      },
      printCmyk: {
        pixelWidth: 2600,
        pixelHeight: 3720,
        trimWidthMm: 182,
        trimHeightMm: 257,
        bleedMm: 3.5,
        cmykPercentSamples: new Float32Array([
          15, 22, 18, 5,
          68, 62, 58, 88, // TAC = 276% <= 300%
        ]),
      },
      motionToon: {
        fps: 30,
        frameRelativeLuminances: Array.from({ length: 60 }, (_, i) => 0.35 + 0.04 * Math.sin(i * 0.2)),
        flashScreenAreaFraction: 0.4,
        saturatedRedTransitionsPerSec: 0,
      },
      audioToon: {
        pcmSamples: pcm,
        sampleRateHz: 48000,
      },
      globalLocalization: {
        balloons: [
          { balloonId: "b1", locale: "ko", text: "드디어 마지막 관문이다!", balloonWidthPx: 180, balloonHeightPx: 96, fontSizePx: 15 },
          { balloonId: "b1", locale: "en", text: "Finally, the last gate!", balloonWidthPx: 190, balloonHeightPx: 96, fontSizePx: 14 },
          { balloonId: "b1", locale: "ja", text: "ついに最後の関門だ！", balloonWidthPx: 180, balloonHeightPx: 96, fontSizePx: 15 },
        ],
      },
      metadataFields: {
        title: "20화 완결편",
        credits: "작화·연출 스튜디오 정식 출고본",
      },
      provenanceSeal: seal,
    });

    expect(cert.verdict).toBe("READY");
    expect(cert.readinessScore).toBe(100);
    expect(cert.metrics.strayPixelDustCount).toBe(0);
    expect(cert.metrics.tacViolationCount).toBe(0);
    expect(cert.metrics.ituRFlashSafe).toBe(true);
    expect(cert.metrics.balloonOverflowCount).toBe(0);
    expect(cert.metrics.piiLeakCount).toBe(0);
    expect(cert.metrics.provenanceSealValid).toBe(true);
    expect(cert.serverCostKrw).toBe(0);
  });

  it("TAC 초과·광과민 점멸·말풍선 넘침·먼지·개인정보 유출·위변조 봉인을 모두 잡아내 BLOCKED 판정한다", () => {
    const dustyAlpha = new Uint8Array(20 * 20);
    dustyAlpha[3 * 20 + 4] = 250;
    dustyAlpha[15 * 20 + 16] = 240;
    dustyAlpha[15 * 20 + 17] = 240;

    const validSeal = createWotsPlusProvenanceSeal({
      contentDigestHex: "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
      secretSeedHex: "tamper-test-seed",
    });
    const tamperedSeal = {
      ...validSeal,
      contentDigestHex: "ffeeddccbbaa00998877665544332211ffeeddccbbaa00998877665544332211",
    };

    // 30fps에서 교번 점멸(0.1 <-> 0.95) 14프레임 -> 초당 6.5Hz 섬광 발생(ITU-R 기준 3Hz 초과)
    const flashingLumas = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 0.1 : 0.95));

    const cert = runOmnichannelMasterReleaseGate({
      episodeId: "ep-020-bad",
      webtoonScroll: {
        canvasWidthPx: 800,
        sliceHeightsPx: [3000],
        lineArtAlphaMask: { width: 20, height: 20, alpha: dustyAlpha },
      },
      printCmyk: {
        pixelWidth: 1200,
        pixelHeight: 1700,
        trimWidthMm: 182,
        trimHeightMm: 257,
        bleedMm: 1.5,
        cmykPercentSamples: new Float32Array([92, 88, 84, 90]), // TAC = 354%
      },
      motionToon: {
        fps: 30,
        frameRelativeLuminances: flashingLumas,
        flashScreenAreaFraction: 0.5,
      },
      audioToon: {
        integratedLufs: -8.2,
        truePeakDbtp: -0.1,
      },
      globalLocalization: {
        balloons: [
          {
            balloonId: "b-over",
            locale: "de",
            text: "Dies ist ein viel zu langer übersetzter Satz für eine winzige Sprechblase!",
            balloonWidthPx: 72,
            balloonHeightPx: 42,
            fontSizePx: 14,
          },
        ],
      },
      metadataFields: {
        authorNote: "담당자 연락처 artist@studio.co.kr / 010-9876-5432 / /Users/dev/work",
      },
      provenanceSeal: tamperedSeal,
    });

    expect(cert.verdict).toBe("BLOCKED");
    expect(cert.readinessScore).toBeLessThan(20);
    expect(cert.metrics.strayPixelDustCount).toBe(2);
    expect(cert.metrics.maxTacPercent).toBeGreaterThan(300);
    expect(cert.metrics.ituRFlashSafe).toBe(false);
    expect(cert.metrics.maxFlashHz).toBeGreaterThan(3);
    expect(cert.metrics.balloonOverflowCount).toBe(1);
    expect(cert.metrics.piiLeakCount).toBeGreaterThanOrEqual(3);
    expect(cert.metrics.provenanceSealValid).toBe(false);

    const directPii = scanLinearPiiAndSecrets({ sample: "주민번호 900101-1234567 토큰 sk-proj-abcd" });
    expect(directPii.some((f) => f.kind === "kr-rrn")).toBe(true);
    expect(directPii.some((f) => f.kind === "secret-token")).toBe(true);
  });
});

describe("wasm64-wave20-grand-finale: 깊이 유도 소프트 매트 추출기 & 아트디렉션 스타일 셰이더", () => {
  it("저해상도 흐릿한 깊이 맵을 고해상도 색면·선화 경계에 날카롭게 밀착시키고 3분할 매트 합 1.0을 유지한다", () => {
    const width = 32;
    const height = 24;
    const guideRgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        if (x < 16) {
          // 전경 밝은 캐릭터 영역
          guideRgba[o] = 246;
          guideRgba[o + 1] = 224;
          guideRgba[o + 2] = 200;
          guideRgba[o + 3] = 255;
        } else {
          // 원경 어두운 밤하늘 배경 영역
          guideRgba[o] = 22;
          guideRgba[o + 1] = 28;
          guideRgba[o + 2] = 58;
          guideRgba[o + 3] = 255;
        }
      }
    }

    // 4x3 저해상도 깊이 격자(업샘플 시 x=16 경계가 넓게 번짐)
    const coarseW = 4;
    const coarseH = 3;
    const coarseDepth = new Float32Array([
      0.12, 0.20, 0.80, 0.92,
      0.12, 0.20, 0.80, 0.92,
      0.12, 0.20, 0.80, 0.92,
    ]);

    const res = extractDepthGuidedSoftMattes({
      width,
      height,
      guideRgba,
      coarseDepth,
      coarseWidth: coarseW,
      coarseHeight: coarseH,
      options: { guidedRadiusPx: 5, guidedEpsilon: 1e-4, jointBilateralRadiusPx: 3, colorSigma: 0.06 },
    });

    expect(res.partitionMaxResidual).toBeLessThan(1e-6);
    expect(res.refinedEdgeJumpMean).toBeGreaterThan(res.coarseEdgeJumpMean * 1.8);
    expect(res.edgeSnapImprovementRatio).toBeGreaterThan(1.8);
    expect(res.foregroundMatte[12 * width + 4]!).toBeGreaterThan(0.95);
    expect(res.backgroundMatte[12 * width + 28]!).toBeGreaterThan(0.95);
    expect(res.serverCostKrw).toBe(0);
  });

  it("양자화 셀 밴드·암부 크로스해칭·과슈 포스터 에지 림 하이라이트를 단일 패스로 렌더링한다", () => {
    const width = 40;
    const height = 40;
    const albedoRgba = new Uint8ClampedArray(width * height * 4);
    const normalMap = new Float32Array(width * height * 3);
    const depthMap = new Float32Array(width * height).fill(0.92);
    const cx = 20;
    const cy = 20;
    const radius = 15;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const o = idx * 4;
        const dx = (x - cx) / radius;
        const dy = (y - cy) / radius;
        const r2 = dx * dx + dy * dy;
        if (r2 <= 1) {
          const nz = Math.sqrt(Math.max(0, 1 - r2));
          normalMap[idx * 3] = dx;
          normalMap[idx * 3 + 1] = dy;
          normalMap[idx * 3 + 2] = nz;
          depthMap[idx] = 0.25 - nz * 0.1;
          albedoRgba[o] = 216;
          albedoRgba[o + 1] = 152;
          albedoRgba[o + 2] = 118;
          albedoRgba[o + 3] = 255;
        } else {
          normalMap[idx * 3 + 2] = 1;
          albedoRgba[o] = 34;
          albedoRgba[o + 1] = 40;
          albedoRgba[o + 2] = 56;
          albedoRgba[o + 3] = 255;
        }
      }
    }

    const shaded = renderStylizedArtDirectionShader({
      width,
      height,
      albedoRgba,
      normalMap,
      depthMap,
      lightDirection: { x: -0.65, y: -0.55, z: 0.52 },
      celBandCount: 4,
      crosshatchDensity: 0.85,
      crosshatchPitchPx: 4,
      gouachePosterLevels: 5,
      rimStrength: 0.9,
    });

    expect(shaded.stats.distinctCelBandsUsed).toBeGreaterThanOrEqual(3);
    expect(shaded.stats.crosshatchedPixelCount).toBeGreaterThan(40);
    expect(shaded.stats.rimHighlightedPixelCount).toBeGreaterThan(25);
    expect(shaded.stats.posterEdgePixelCount).toBeGreaterThan(20);
    expect(shaded.stats.serverCostKrw).toBe(0);

    // 정면 하이라이트 중심(광원 방향 쪽)은 크로스해칭이 없고, 반대편 암부에는 크로스해칭이 배치된다
    const litIdx = 14 * width + 14;
    expect(shaded.crosshatchCoverage[litIdx]!).toBe(0);
  });
});
