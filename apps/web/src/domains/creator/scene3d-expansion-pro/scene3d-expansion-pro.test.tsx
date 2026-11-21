// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createStudioThemeCharacterSkin } from "../virtual-space/studio-virtual-space-character-theme-art";
import { StudioVirtualCharacterPreview } from "../virtual-space/StudioVirtualCharacterPreview";
import {
  applyHomography3x3,
  evaluateInteractiveSceneState,
  getSamplePhotoPosePreset,
  INTERACTIVE_ENVIRONMENT_PRESETS,
  PHOTO_POSE_PRESET_LIST,
  project2dDecalOnto3dSurface,
  reconstruct3dPoseAndCameraFromPhoto,
  type Photo2dBodyLandmarks,
} from "./scene3d-interactive-decal-pose-engine";
import {
  buildSampleWebtoonDepthNormalBuffer,
  evaluateFaceSdfAndEyeLookAt,
  evaluateHeroPerspectiveLens,
  extractThreeLayerWebtoonInkAndTone,
  MULTI_CHARACTER_SNAP_PRESETS,
  solveMultiCharacterInteractionSnap,
  WEBTOON_EXTRACT_SCENE_PRESETS,
} from "./scene3d-webtoon-extract-lens-engine";
import { StudioScene3dExpansionPanel } from "./StudioScene3dExpansionPanel";

afterEach(cleanup);

describe("1. 원클릭 3D → 한국 웹툰 3계층 선화·톤 자동 추출", () => {
  it("깊이·법선 버퍼에서 외곽선(G펜 2.4px)·내부선(마루펜 0.9px)·2단 셀 명암 3개 독립 레이어를 추출한다", () => {
    const sample = buildSampleWebtoonDepthNormalBuffer("character-closeup", 40, 30);
    const result = extractThreeLayerWebtoonInkAndTone(sample);
    expect(result.costKrw).toBe(0);
    expect(result.layers).toHaveLength(3);
    const [outline, detail, cel] = result.layers;
    expect(outline.id).toBe("outline-gpen");
    expect(outline.strokeWidthPx).toBe(2.4);
    expect(outline.activePixelCount).toBeGreaterThan(20);
    expect(detail.id).toBe("detail-marupen");
    expect(detail.strokeWidthPx).toBe(0.9);
    expect(detail.activePixelCount).toBeGreaterThan(5);
    expect(cel.id).toBe("cel-tone-2step");
    expect(cel.blendMode).toBe("multiply");
    expect(result.celBreakdown.midShadowCount + result.celBreakdown.deepShadowCount).toBeGreaterThan(10);
  });

  it("외곽선(G펜) 픽셀과 내부 디테일선(마루펜) 픽셀은 서로 중복되지 않도록 독립 분리된다", () => {
    const sample = buildSampleWebtoonDepthNormalBuffer("action-slash", 36, 28);
    const result = extractThreeLayerWebtoonInkAndTone(sample);
    const [outline, detail] = result.layers;
    let overlapCount = 0;
    for (let i = 0; i < outline.pixelMask.length; i += 1) {
      if (outline.pixelMask[i] === 1 && detail.pixelMask[i] === 1) overlapCount += 1;
    }
    expect(overlapCount).toBe(0);
  });

  it("3개 샘플 씬 프리셋 모두 결정론적 해시와 원시 HEX 없는 OKLCH SVG를 생성한다", () => {
    for (const preset of WEBTOON_EXTRACT_SCENE_PRESETS) {
      const sample = buildSampleWebtoonDepthNormalBuffer(preset.id, 32, 24);
      const first = extractThreeLayerWebtoonInkAndTone(sample);
      const second = extractThreeLayerWebtoonInkAndTone(sample);
      expect(first.manifestFingerprint).toBe(second.manifestFingerprint);
      expect(first.compositeSvgMarkup).toContain("<svg");
      expect(first.compositeSvgMarkup).not.toMatch(/#[0-9a-fA-F]{3,6}/u);
    }
  });

  it("사용자 지정 펜 굵기(G펜/마루펜)와 평탄한 배경 버퍼 경계 조건을 안전하게 처리한다", () => {
    const flatDepth = new Float32Array(16 * 12).fill(0.99);
    const flatNormal = new Float32Array(16 * 12 * 3);
    for (let i = 0; i < 16 * 12; i += 1) flatNormal[i * 3 + 2] = 1;
    const result = extractThreeLayerWebtoonInkAndTone({
      width: 16,
      height: 12,
      depthBuffer: flatDepth,
      normalBuffer: flatNormal,
      outlineWidthPx: 3.0,
      detailWidthPx: 0.7,
    });
    expect(result.layers[0].strokeWidthPx).toBe(3.0);
    expect(result.layers[1].strokeWidthPx).toBe(0.7);
    expect(result.layers[0].activePixelCount).toBe(0);
    expect(result.layers[1].activePixelCount).toBe(0);
    expect(result.celBreakdown.backgroundCount).toBe(192);
  });
});

describe("2. 웹툰 전용 박력 과장 원근 렌즈(히어로 퍼스펙티브)", () => {
  it("근접 손·무기만 비선형 과장하면서 인물 몸통·머리·골반 비율은 0% 왜곡으로 보존한다", () => {
    const result = evaluateHeroPerspectiveLens({ exaggerationFactor: 1.52 });
    expect(result.costKrw).toBe(0);
    expect(result.torsoProportionPreserved).toBe(true);
    expect(result.torsoDistortionRatio).toBe(0);
    const weapon = result.vertices.find((v) => v.role === "weapon");
    const hand = result.vertices.find((v) => v.role === "hand");
    const torso = result.vertices.find((v) => v.role === "torso");
    expect(weapon?.appliedScale).toBeGreaterThan(hand?.appliedScale ?? 0);
    expect(hand?.appliedScale).toBeGreaterThan(1.0);
    expect(weapon?.appliedScale).toBeLessThanOrEqual(1.6);
    expect(torso?.appliedScale).toBe(1);
    expect(torso?.transformedPosition).toEqual(torso?.originalPosition);
  });

  it("과장 배율 1.0x→1.3x→1.6x 증가 시 근접 무기 배율이 단조 증가하고 1.0x에서는 원본과 동일하다", () => {
    const r10 = evaluateHeroPerspectiveLens({ exaggerationFactor: 1.0 });
    const r13 = evaluateHeroPerspectiveLens({ exaggerationFactor: 1.3 });
    const r16 = evaluateHeroPerspectiveLens({ exaggerationFactor: 1.6 });
    expect(r10.maxAppliedHeroScale).toBe(1.0);
    expect(r13.maxAppliedHeroScale).toBeGreaterThan(r10.maxAppliedHeroScale);
    expect(r16.maxAppliedHeroScale).toBeGreaterThan(r13.maxAppliedHeroScale);
    expect(r16.maxAppliedHeroScale).toBeLessThanOrEqual(1.6);
  });

  it("허용 범위 밖 배율 입력도 1.0x~1.6x로 안전하게 클램프한다", () => {
    expect(evaluateHeroPerspectiveLens({ exaggerationFactor: 0.4 }).exaggerationFactor).toBe(1.0);
    expect(evaluateHeroPerspectiveLens({ exaggerationFactor: 4.5 }).exaggerationFactor).toBe(1.6);
  });
});

describe("3. 2~4인 커플·액션 자석 포즈 스냅", () => {
  it("포옹·손잡기·업기·검 맞대기·등 맞대기 5종 모두 접점 오차 0.000m로 정렬된다", () => {
    for (const preset of MULTI_CHARACTER_SNAP_PRESETS) {
      const result = solveMultiCharacterInteractionSnap({
        preset: preset.id,
        heightRatio: 0.86,
        characterCount: 2,
      });
      expect(result.costKrw).toBe(0);
      expect(result.contacts.length).toBeGreaterThanOrEqual(2);
      expect(result.maxContactErrorMeters).toBe(0);
      expect(result.formattedMaxError).toBe("0.000m");
    }
  });

  it("키 차이(heightRatio)를 0.72~1.35까지 변화시켜도 손·어깨 접점 오차 0.000m를 유지한다", () => {
    for (const ratio of [0.72, 0.84, 0.96, 1.08, 1.22, 1.35]) {
      const hug = solveMultiCharacterInteractionSnap({ preset: "hug", heightRatio: ratio });
      const hold = solveMultiCharacterInteractionSnap({ preset: "hand-hold", heightRatio: ratio });
      expect(hug.maxContactErrorMeters).toBe(0);
      expect(hug.formattedMaxError).toBe("0.000m");
      expect(hold.maxContactErrorMeters).toBe(0);
      expect(hold.formattedMaxError).toBe("0.000m");
    }
    const largeGap = solveMultiCharacterInteractionSnap({ preset: "hug", heightRatio: 0.75 });
    expect(largeGap.characters[0].kneeBendDeg).toBeGreaterThan(0);
  });

  it("2인·3인·4인 구도 확장 시 추가 캐릭터의 측면·후방 자석 접점도 0.000m로 스냅한다", () => {
    for (const count of [2, 3, 4] as const) {
      const res = solveMultiCharacterInteractionSnap({
        preset: "sword-clash",
        heightRatio: 0.92,
        characterCount: count,
      });
      expect(res.characters).toHaveLength(count);
      expect(res.maxContactErrorMeters).toBe(0);
      expect(res.contacts.every((c) => c.errorMeters === 0 && c.snapped)).toBe(true);
    }
  });

  it("업기(piggyback) 프리셋은 파트너 골반을 리드 등 위치로 올리고 양손·어깨를 0.000m로 결합한다", () => {
    const res = solveMultiCharacterInteractionSnap({ preset: "piggyback", heightRatio: 0.85 });
    expect(res.characters[1].rootPosition.y).toBeGreaterThan(0.8);
    expect(res.contacts.some((c) => c.id === "piggyback-shoulder-l")).toBe(true);
    expect(res.maxContactErrorMeters).toBe(0);
  });
});

describe("4. 얼굴 미형 툰 그림자(Face SDF) & 카메라 시선 자동 추적", () => {
  it("전 방향 광원 각도(-180°~+180°)에서 코·광대의 지저분한 그림자를 100% 차단한다", () => {
    for (const az of [-165, -90, -35, 0, 45, 95, 165]) {
      const res = evaluateFaceSdfAndEyeLookAt({
        lightAzimuthDeg: az,
        lightElevationDeg: 30,
        targetMode: "camera",
        targetPosition: { x: 0.1, y: 1.55, z: 1.8 },
      });
      expect(res.costKrw).toBe(0);
      expect(res.faceSdf.noseArtifactShadowBlocked).toBe(true);
      expect(res.faceSdf.cheekArtifactShadowBlocked).toBe(true);
      expect(res.faceSdf.artifactSuppressionScore).toBe(100);
      expect(res.faceSdf.zones.every((zone) => zone.artifactFree)).toBe(true);
    }
  });

  it("역광 각도(160°)에서는 rim-backlit 판정과 높은 림라이트 강도를 산출한다", () => {
    const res = evaluateFaceSdfAndEyeLookAt({
      lightAzimuthDeg: 160,
      lightElevationDeg: 65,
      targetMode: "camera",
      targetPosition: { x: 0, y: 1.56, z: 1.5 },
    });
    expect(res.faceSdf.litSide).toBe("rim-backlit");
    expect(res.faceSdf.rimLightIntensity).toBeGreaterThan(0.7);
  });

  it("정면·상대 캐릭터 대상 시선을 자연스럽게 추적하고 수렴각을 생리 한계 안으로 제한한다", () => {
    const res = evaluateFaceSdfAndEyeLookAt({
      lightAzimuthDeg: 30,
      lightElevationDeg: 20,
      targetMode: "partner-character",
      targetPosition: { x: -0.35, y: 1.62, z: 1.2 },
    });
    expect(res.eyeLookAt.clampedByAnatomy).toBe(false);
    expect(res.eyeLookAt.clampedYawDeg).toBeLessThan(0);
    expect(res.eyeLookAt.clampedPitchDeg).toBeGreaterThan(0);
    expect(res.eyeLookAt.convergenceDeg).toBeGreaterThan(0);
    expect(res.eyeLookAt.convergenceDeg).toBeLessThanOrEqual(12);
  });

  it("극단 측면·상단 대상은 안구 해부학 한계(Yaw ±32°, Pitch -22°~+20°)로 보호하고 고개 회전 권장값을 제시한다", () => {
    const res = evaluateFaceSdfAndEyeLookAt({
      lightAzimuthDeg: 20,
      lightElevationDeg: 15,
      targetMode: "custom-point",
      targetPosition: { x: 1.8, y: 3.6, z: 0.1 },
    });
    expect(res.eyeLookAt.clampedByAnatomy).toBe(true);
    expect(res.eyeLookAt.clampedYawDeg).toBe(32);
    expect(res.eyeLookAt.clampedPitchDeg).toBe(20);
    expect(res.eyeLookAt.recommendedHeadYawDeg).toBeGreaterThan(20);
    expect(res.eyeLookAt.recommendedHeadPitchDeg).toBeGreaterThan(10);
  });
});

describe("5. 배경 소품 상태 슬라이더 & 계절·파괴 상태 1클릭 전환", () => {
  it("5대 계절·파괴 프리셋 모두 OKLCH 조명 토큰과 전용 파티클 구성을 반환한다", () => {
    expect(INTERACTIVE_ENVIRONMENT_PRESETS).toHaveLength(5);
    for (const preset of INTERACTIVE_ENVIRONMENT_PRESETS) {
      const state = evaluateInteractiveSceneState({
        preset: preset.id,
        doorOpenDeg: 45,
        lampIntensityPct: 70,
        curtainSwayPct: 35,
      });
      expect(state.costKrw).toBe(0);
      expect(state.lighting.skyColorOklch).toMatch(/^oklch\(/u);
      expect(state.lighting.keyLightOklch).toMatch(/^oklch\(/u);
      expect(state.lighting.ambientFillOklch).toMatch(/^oklch\(/u);
      expect(state.lighting.fogColorOklch).toMatch(/^oklch\(/u);
      expect(state.lighting.accentParticleOklch).toMatch(/^oklch\(/u);
      expect(state.particles.count).toBeGreaterThan(50);
    }
  });

  it("전투 후 폐허는 파손률이 높고 비 오는 밤은 노면 습기가 높게 반영된다", () => {
    const ruined = evaluateInteractiveSceneState({
      preset: "ruined-aftermath",
      doorOpenDeg: 20,
      lampIntensityPct: 10,
      curtainSwayPct: 60,
    });
    const rainy = evaluateInteractiveSceneState({
      preset: "rainy-night",
      doorOpenDeg: 75,
      lampIntensityPct: 80,
      curtainSwayPct: 40,
    });
    expect(ruined.lighting.structuralDamageRatio).toBeGreaterThan(0.7);
    expect(ruined.particles.type).toBe("ash-debris");
    expect(rainy.lighting.surfaceWetness).toBeGreaterThan(0.9);
    expect(rainy.particles.type).toBe("rain-streaks");
  });

  it("문을 0°에서 90°로 열면 외풍 연동으로 커튼 흔들림과 통과 폭·파티클 유입이 증가한다", () => {
    const closed = evaluateInteractiveSceneState({
      preset: "rainy-night",
      doorOpenDeg: 0,
      lampIntensityPct: 50,
      curtainSwayPct: 20,
    });
    const opened = evaluateInteractiveSceneState({
      preset: "rainy-night",
      doorOpenDeg: 90,
      lampIntensityPct: 50,
      curtainSwayPct: 20,
    });
    expect(opened.props.door.clearanceMeters).toBeGreaterThan(0.9);
    expect(opened.props.curtain.effectiveSwayPct).toBeGreaterThan(
      closed.props.curtain.effectiveSwayPct,
    );
    expect(opened.particles.count).toBeGreaterThan(closed.particles.count);
  });

  it("범위를 벗어난 슬라이더 값도 문 0~90°, 조명·커튼 0~100%로 안전 클램프한다", () => {
    const clamped = evaluateInteractiveSceneState({
      preset: "golden-hour",
      doorOpenDeg: 145,
      lampIntensityPct: -20,
      curtainSwayPct: 180,
    });
    expect(clamped.props.door.openDeg).toBe(90);
    expect(clamped.props.lamp.intensityPct).toBe(0);
    expect(clamped.props.lamp.luminousFluxLm).toBe(0);
    expect(clamped.props.curtain.swayPct).toBe(100);
  });
});

describe("6. 3D 벽면·간판 위 2D 브러시 직접 투영 데칼", () => {
  it("3D 사선 벽면에 한글 간판 데칼을 투시 호모그래피로 투영하고 코너 재투영 오차 0.01px 미만을 유지한다", () => {
    const result = project2dDecalOnto3dSurface({
      textKo: "신림 24시 떡볶이",
      decalKind: "korean-signboard",
      decalBoundsUv: { uMin: 0.15, vMin: 0.2, uMax: 0.85, vMax: 0.8 },
      surface: {
        origin: { x: 0, y: 1.5, z: 0 },
        normal: { x: 0.42, y: 0, z: 0.91 },
        tangentU: { x: 0.91, y: 0.08, z: -0.42 },
        widthMeters: 3.0,
        heightMeters: 1.8,
      },
    });
    expect(result.costKrw).toBe(0);
    expect(result.backfaceCulled).toBe(false);
    expect(result.homographyMaxErrorPx).toBeLessThan(0.01);
    const mappedTopRight = applyHomography3x3(result.homographyMatrix3x3, 1, 0);
    expect(mappedTopRight.x).toBeCloseTo(result.screenCorners[1].x, 2);
    expect(mappedTopRight.y).toBeCloseTo(result.screenCorners[1].y, 2);
    expect(result.distortionCompensation.aspectCorrectionScale).toBeGreaterThanOrEqual(1);
  });

  it("벽면 UV 경계([0,1]²)를 넘는 데칼과 2D 브러시 획은 벽면 안쪽으로 정확히 클리핑한다", () => {
    const result = project2dDecalOnto3dSurface({
      textKo: "출입금지",
      decalKind: "graffiti-brush",
      decalBoundsUv: { uMin: -0.25, vMin: 0.1, uMax: 1.25, vMax: 0.9 },
      brushStrokesUv: [
        [
          { x: -0.2, y: 0.5 },
          { x: 0.5, y: 0.5 },
          { x: 1.3, y: 0.5 },
        ],
      ],
      surface: {
        origin: { x: 0, y: 1.5, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
        tangentU: { x: 1, y: 0, z: 0 },
        widthMeters: 2.5,
        heightMeters: 1.6,
      },
    });
    expect(result.isPartiallyClipped).toBe(true);
    expect(result.clippedBoundsUv.uMin).toBe(0);
    expect(result.clippedBoundsUv.uMax).toBe(1);
    expect(result.clipAreaRatio).toBeLessThan(1);
    expect(result.clippedStrokeSegmentCount).toBeGreaterThanOrEqual(2);
    expect(result.projectedStrokes).toHaveLength(1);
  });

  it("카메라 뒤쪽을 향한 벽면 법선은 후면 컬링(backfaceCulled)을 감지한다", () => {
    const result = project2dDecalOnto3dSurface({
      textKo: "후면 포스터",
      decalKind: "poster",
      decalBoundsUv: { uMin: 0.2, vMin: 0.2, uMax: 0.8, vMax: 0.8 },
      surface: {
        origin: { x: 0, y: 1.5, z: 0 },
        normal: { x: 0, y: 0, z: -1 },
        tangentU: { x: 1, y: 0, z: 0 },
        widthMeters: 2.0,
        heightMeters: 1.4,
      },
    });
    expect(result.backfaceCulled).toBe(true);
  });

  it("벽면 바깥에 완전히 벗어난 데칼은 isCompletelyOutside=true로 안전하게 처리한다", () => {
    const result = project2dDecalOnto3dSurface({
      textKo: "영역 밖 낙서",
      decalKind: "graffiti-brush",
      decalBoundsUv: { uMin: 1.2, vMin: 1.2, uMax: 1.8, vMax: 1.6 },
      surface: {
        origin: { x: 0, y: 1.5, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
        tangentU: { x: 1, y: 0, z: 0 },
        widthMeters: 2.0,
        heightMeters: 1.4,
      },
    });
    expect(result.isCompletelyOutside).toBe(true);
    expect(result.clipAreaRatio).toBe(0);
  });
});

describe("7. 사진 1장 → 3D 전신·손 포즈 + 카메라 각도 즉시 복제", () => {
  it("3종 사진 포즈 프리셋 모두 10개 3D 관절 회전각과 카메라 초점거리(mm)·피치·요를 복원한다", () => {
    expect(PHOTO_POSE_PRESET_LIST).toHaveLength(3);
    for (const preset of PHOTO_POSE_PRESET_LIST) {
      const sample = getSamplePhotoPosePreset(preset.id);
      const res = reconstruct3dPoseAndCameraFromPhoto(sample.input);
      expect(res.costKrw).toBe(0);
      expect(res.camera.focalLengthMm).toBeGreaterThanOrEqual(18);
      expect(res.camera.focalLengthMm).toBeLessThanOrEqual(135);
      expect(Object.keys(res.joints)).toHaveLength(10);
      expect(res.confidence).toBeGreaterThan(0.8);
      expect(res.reprojectionErrorPx).toBeLessThan(6);
    }
  });

  it("정면 지목 프리셋은 오른손을 검지 지목(point)으로 분류하고 사선 요(yaw) 각도를 복원한다", () => {
    const sample = getSamplePhotoPosePreset("dramatic-pointing");
    const res = reconstruct3dPoseAndCameraFromPhoto(sample.input);
    expect(res.hands.right.gripType).toBe("point");
    expect(res.hands.right.indexCurl).toBeLessThan(0.35);
    expect(res.camera.yawDeg).toBeGreaterThan(10);
  });

  it("픽셀 좌표 입력(1080×1440)과 정규화 [0..1] 입력이 동일한 3D 포즈·카메라 복원 결과를 낸다", () => {
    const base = getSamplePhotoPosePreset("contrapposto-idle").input;
    const scalePt = (pt: { readonly x: number; readonly y: number }) => ({
      x: pt.x * base.imageWidth,
      y: pt.y * base.imageHeight,
    });
    const pixelLandmarks: Photo2dBodyLandmarks = {
      nose: scalePt(base.landmarks.nose),
      neck: scalePt(base.landmarks.neck),
      leftShoulder: scalePt(base.landmarks.leftShoulder),
      rightShoulder: scalePt(base.landmarks.rightShoulder),
      leftElbow: scalePt(base.landmarks.leftElbow),
      rightElbow: scalePt(base.landmarks.rightElbow),
      leftWrist: scalePt(base.landmarks.leftWrist),
      rightWrist: scalePt(base.landmarks.rightWrist),
      pelvis: scalePt(base.landmarks.pelvis),
      leftHip: scalePt(base.landmarks.leftHip),
      rightHip: scalePt(base.landmarks.rightHip),
      leftKnee: scalePt(base.landmarks.leftKnee),
      rightKnee: scalePt(base.landmarks.rightKnee),
      leftAnkle: scalePt(base.landmarks.leftAnkle),
      rightAnkle: scalePt(base.landmarks.rightAnkle),
    };
    const normRes = reconstruct3dPoseAndCameraFromPhoto(base);
    const pxRes = reconstruct3dPoseAndCameraFromPhoto({ ...base, landmarks: pixelLandmarks });
    expect(pxRes.camera).toEqual(normRes.camera);
    expect(pxRes.joints).toEqual(normRes.joints);
  });

  it("손 랜드마크가 생략되어도 기본 자연 포즈로 안전하게 폴백한다", () => {
    const base = getSamplePhotoPosePreset("hero-landing").input;
    const res = reconstruct3dPoseAndCameraFromPhoto({
      imageWidth: base.imageWidth,
      imageHeight: base.imageHeight,
      landmarks: base.landmarks,
    });
    expect(res.hands.left.gripType).toBe("open");
    expect(res.hands.right.gripType).toBe("open");
  });
});

describe("UI 제어판 인터랙션 · lazyRetry 진입점 · 디자인 토큰 계약", () => {
  it("StudioScene3dExpansionPanel이 7대 기능 탭을 한글로 전환하며 실시간 계산 결과를 갱신한다", () => {
    render(<StudioScene3dExpansionPanel />);
    expect(screen.getByTestId("studio-scene3d-expansion-panel")).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(7);

    // 1번 탭: 레이어 토글
    expect(screen.getByTestId("s3e-tab-webtoon-3layer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /검기 대각선 베기 컷/u }));
    expect(screen.getByTestId("s3e-outline-count").textContent).toContain("2.4px");

    // 2번 탭: 히어로 퍼스펙티브 슬라이더 조절
    fireEvent.click(screen.getByRole("tab", { name: /히어로 원근 렌즈/u }));
    const heroSlider = screen.getByLabelText("근접 손·무기 과장 배율");
    fireEvent.change(heroSlider, { target: { value: "1.58" } });
    expect(screen.getByTestId("s3e-hero-scale-value").textContent).toBe("1.58x");
    expect(screen.getByTestId("s3e-torso-drift").textContent).toContain("0.00%");

    // 3번 탭: 커플·액션 자석 포즈 키 비율 변경에도 0.000m 유지
    fireEvent.click(screen.getByRole("tab", { name: /2~4인 자석 포즈/u }));
    fireEvent.click(screen.getByRole("button", { name: "4인 구도" }));
    fireEvent.change(screen.getByLabelText(/상대 캐릭터 키 비율/u), { target: { value: "1.24" } });
    expect(screen.getByTestId("s3e-snap-error").textContent).toBe("0.000m");

    // 4번 탭: 얼굴 Face SDF & 시선 극단 한계 보호 확인
    fireEvent.click(screen.getByRole("tab", { name: /얼굴 SDF·시선 추적/u }));
    fireEvent.click(screen.getByRole("button", { name: /극단 측면 대상/u }));
    expect(screen.getByTestId("s3e-sdf-clean").textContent).toContain("100%");
    expect(screen.getByTestId("s3e-eye-angles").textContent).toBe("32° / 20°");

    // 5번 탭: 5대 계절·파괴 전환
    fireEvent.click(screen.getByRole("tab", { name: /소품·계절 1클릭/u }));
    fireEvent.click(screen.getByRole("button", { name: /전투 후 폐허/u }));
    expect(screen.getByTestId("s3e-env-particle").textContent).toContain("잿가루·파편");

    // 6번 탭: 벽면 2D 데칼 한글 입력
    fireEvent.click(screen.getByRole("tab", { name: /벽면 2D 데칼 투영/u }));
    fireEvent.change(screen.getByLabelText("투영할 한글 간판·문구"), {
      target: { value: "홍대 만화방 24시" },
    });
    expect(screen.getByText("홍대 만화방 24시")).toBeTruthy();

    // 7번 탭: 사진 포즈 복제 프리셋 전환
    fireEvent.click(screen.getByRole("tab", { name: /사진 포즈·카메라 복제/u }));
    fireEvent.click(screen.getByRole("button", { name: /정면 지목/u }));
    expect(screen.getByTestId("s3e-photo-hands").textContent).toContain("검지 지목 포즈");
  });

  it("StudioVirtualCharacterPreview 하단 접이식 패널을 열 때 lazyRetry로 지연 마운트한다", async () => {
    const skin = createStudioThemeCharacterSkin({
      artStyle: "webtoon",
      labelKo: "웹툰 작가",
      labelEn: "Webtoon artist",
      textureUrl: "/assets/test/theme.png",
      width: 1536,
      height: 1024,
      frames: Array.from({ length: 32 }, () => ({
        originX: 0.5,
        originY: 0.92,
        displayHeightRatio: 0.9,
      })),
    });
    render(<StudioVirtualCharacterPreview skin={skin} alt="웹툰 작가" />);
    const disclosure = screen.getByTestId("studio-scene3d-expansion-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-scene3d-expansion-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-scene3d-expansion-panel")).toBeTruthy();
    });
  });

  it("scene3d-expansion-pro.css가 원시 HEX·transition-all 금지 및 44px 터치 타겟·reduced-motion 계약을 준수한다", () => {
    const cssPath = path.resolve(
      process.cwd(),
      "apps/web/src/domains/creator/scene3d-expansion-pro/scene3d-expansion-pro.css",
    );
    const css = fs.readFileSync(cssPath, "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toContain("transition-all");
    expect(css).not.toMatch(/transition\s*:\s*all\b/u);
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("min-height: 2.75rem");
    expect(css).toContain("oklch(");
  });
});
