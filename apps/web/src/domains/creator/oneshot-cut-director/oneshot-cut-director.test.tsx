// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BASE_916_CUT_HEIGHT_PX,
  CUT_VIEWBOX_HEIGHT,
  CUT_VIEWBOX_WIDTH,
  DEFAULT_ONESHOT_LAYERS,
  HAND_JOINT_COUNT,
  NEUTRAL_ROUGH_ONLY_LAYERS,
  ONESHOT_EMOTION_SPECS,
  ONESHOT_LAYER_IDS,
  ONESHOT_LAYER_SPECS,
  ONESHOT_SCENE_PRESETS,
  ROUGH_STROKE_PRESETS,
  SAFE_FACE_BALLOON_GAP_PX,
  StudioOneshotCutDirectorPanel,
  composeOneshotCutPlan,
  computeDeterministicDigest,
  computeRectMinClearancePx,
  computeRectOverlapArea,
  computeRectOverlapRatio,
  exportOneshotCutPlanJson,
  extractDialogueVisemes,
  formatOklch,
  getOneshotEmotionSpec,
  getOneshotScenePreset,
  getRoughStrokePresetSpec,
  isVioletSlopHue,
  sanitizeNonVioletHue,
  type OneshotEmotionId,
  type OneshotLayerToggles,
  type RoughStrokePresetId,
} from "./index";

afterEach(cleanup);

function assertZeroVioletAndRawColors(markup: string): void {
  expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(markup).not.toMatch(/\brgba?\s*\(/iu);
  expect(markup).not.toMatch(/\bhsla?\s*\(/iu);
  for (const match of markup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isVioletSlopHue(Number(match[1]))).toBe(false);
  }
}

describe("1. 카탈로그·탈-바이올렛 OKLCH·결정론 해시·기하학 유틸", () => {
  it("5종 감정/장르 스펙의 ID·팔레트·스크롤 리듬 메타데이터가 완비되어 있다", () => {
    expect(ONESHOT_EMOTION_SPECS.map((e) => e.id)).toEqual([
      "tense-action", "romance-heartbeat", "noir-reveal", "comedy-shock", "epic-fantasy",
    ]);
    for (const spec of ONESHOT_EMOTION_SPECS) {
      expect(spec.nameKo.length).toBeGreaterThan(2);
      expect(spec.nameEn.length).toBeGreaterThan(2);
      expect(spec.sfxTextKo.length).toBeGreaterThan(1);
      expect(spec.baseCutHeightPx).toBeGreaterThanOrEqual(1040);
    }
  });

  it("4종 3획 구도 러프 프리셋이 각각 정확히 3개의 SVG 가이드 획과 얼굴 안전 박스를 가진다", () => {
    expect(ROUGH_STROKE_PRESETS.map((s) => s.id)).toEqual([
      "diagonal-slash", "low-heroic-triangle", "intimate-close-arc", "high-isolation-grid",
    ]);
    for (const preset of ROUGH_STROKE_PRESETS) {
      expect(preset.strokes).toHaveLength(3);
      expect(preset.strokes.map((st) => st.index)).toEqual([1, 2, 3]);
      expect(preset.baseFaceSafeBox.width).toBeGreaterThan(60);
      expect(preset.baseFaceSafeBox.height).toBeGreaterThan(70);
    }
  });

  it("4종 웹툰 대표 씬 프리셋과 5대 비파괴 레이어 스펙이 정합하다", () => {
    expect(ONESHOT_SCENE_PRESETS).toHaveLength(4);
    expect(ONESHOT_LAYER_SPECS.map((l) => l.id)).toEqual(ONESHOT_LAYER_IDS);
    for (const scene of ONESHOT_SCENE_PRESETS) {
      expect(getOneshotEmotionSpec(scene.emotion).id).toBe(scene.emotion);
      expect(getRoughStrokePresetSpec(scene.strokePreset).id).toBe(scene.strokePreset);
      expect(scene.dialogueKo.length).toBeGreaterThan(8);
    }
  });

  it("5종 감정의 모든 OKLCH 조명·배경·실루엣·여백 색상이 바이올렛 휴(270~320°)를 0% 배제한다", () => {
    for (const spec of ONESHOT_EMOTION_SPECS) {
      const colors = [spec.keyLight.color, spec.rimLight.color, spec.backdropTop, spec.backdropBottom, spec.silhouetteColor, spec.gutterTone];
      for (const color of colors) {
        expect(isVioletSlopHue(color.h)).toBe(false);
        assertZeroVioletAndRawColors(formatOklch(color));
      }
    }
  });

  it("isVioletSlopHue와 sanitizeNonVioletHue가 음수·360° 초과 각도까지 포함해 바이올렛을 차단한다", () => {
    expect(isVioletSlopHue(270)).toBe(true);
    expect(isVioletSlopHue(295)).toBe(true);
    expect(isVioletSlopHue(320)).toBe(true);
    expect(isVioletSlopHue(655)).toBe(true);
    expect(isVioletSlopHue(-70)).toBe(true);
    expect(isVioletSlopHue(198)).toBe(false);
    expect(isVioletSlopHue(34)).toBe(false);
    for (let deg = 270; deg <= 320; deg += 5) {
      expect(isVioletSlopHue(sanitizeNonVioletHue(deg))).toBe(false);
    }
  });

  it("formatOklch가 명도·채도를 안전 클램핑하고 바이올렛 입력을 자동 치환한다", () => {
    expect(formatOklch({ l: 0.78, c: 0.14, h: 48 })).toBe("oklch(0.78 0.14 48)");
    const safe = formatOklch({ l: 1.5, c: 0.8, h: 288 }, 0.65);
    expect(safe).toBe("oklch(1 0.37 248 / 0.65)");
    assertZeroVioletAndRawColors(safe);
  });

  it("computeDeterministicDigest가 동일 입력에 동일한 8자리 16진수 해시를 반환한다", () => {
    const a = computeDeterministicDigest("여기서 끝내자|tense-action|diagonal-slash");
    const b = computeDeterministicDigest("여기서 끝내자|tense-action|diagonal-slash");
    const c = computeDeterministicDigest("사실… 그날부터|romance-heartbeat|intimate-close-arc");
    expect(a).toMatch(/^[0-9a-f]{8}$/u);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("AABB 기하학 유틸이 겹침 면적·비율·최소 이격 거리를 정확히 계산한다", () => {
    const a = { x: 10, y: 10, width: 100, height: 100 };
    const disjoint = { x: 120, y: 10, width: 80, height: 80 };
    const overlapped = { x: 60, y: 60, width: 100, height: 100 };
    expect(computeRectOverlapArea(a, disjoint)).toBe(0);
    expect(computeRectOverlapRatio(a, disjoint)).toBe(0);
    expect(computeRectMinClearancePx(a, disjoint)).toBe(10);
    expect(computeRectOverlapArea(a, overlapped)).toBe(2500);
    expect(computeRectOverlapRatio(a, overlapped)).toBe(0.25);
    expect(computeRectMinClearancePx(a, overlapped)).toBe(0);
  });
});

describe("2. 3D 카메라·180° 시선 축 & WebGPU 역광·색온도 레이어", () => {
  it("모든 5감정 × 4구도 조합에서 화각 24~85mm, 틸트 ±18°, 180° 규칙 위반 0건을 보장한다", () => {
    for (const emotion of ONESHOT_EMOTION_SPECS) {
      for (const stroke of ROUGH_STROKE_PRESETS) {
        const plan = composeOneshotCutPlan({ dialogue: "지금이다!", emotion: emotion.id, strokePreset: stroke.id });
        expect(plan.camera3d.focalLengthMm).toBeGreaterThanOrEqual(24);
        expect(plan.camera3d.focalLengthMm).toBeLessThanOrEqual(85);
        expect(plan.camera3d.dutchTiltDeg).toBeGreaterThanOrEqual(-18);
        expect(plan.camera3d.dutchTiltDeg).toBeLessThanOrEqual(18);
        expect(plan.camera3d.fovVerticalDeg).toBeGreaterThan(15);
        expect(plan.camera3d.fovVerticalDeg).toBeLessThan(60);
        expect(plan.camera3d.eyeLineAxis.rule180BaselineDeg).toBe(180);
        expect(plan.camera3d.eyeLineAxis.crossed180Rule).toBe(false);
        expect(plan.camera3d.eyeLineAxis.cameraAzimuthDeg).toBeGreaterThan(0);
        expect(plan.camera3d.eyeLineAxis.cameraAzimuthDeg).toBeLessThan(180);
      }
    }
  });

  it("친밀 클로즈업+로맨스는 85mm 망원, 사선+코미디는 24mm 광각으로 차별화된다", () => {
    const closeRomance = composeOneshotCutPlan({ dialogue: "기다렸어.", emotion: "romance-heartbeat", strokePreset: "intimate-close-arc" });
    const shockWide = composeOneshotCutPlan({ dialogue: "뭐라고?!", emotion: "comedy-shock", strokePreset: "diagonal-slash" });
    expect(closeRomance.camera3d.focalLengthMm).toBe(85);
    expect(shockWide.camera3d.focalLengthMm).toBe(24);
    expect(closeRomance.camera3d.fovVerticalDeg).toBeLessThan(shockWide.camera3d.fovVerticalDeg);
  });

  it("camera3d 레이어를 끄면 중립 50mm · 틸트 0° · 피치 0° 기준점으로 즉시 복귀한다", () => {
    const plan = composeOneshotCutPlan({
      dialogue: "여기서 끝내자!", emotion: "tense-action", strokePreset: "diagonal-slash",
      layers: { camera3d: false },
    });
    expect(plan.camera3d.enabled).toBe(false);
    expect(plan.camera3d.focalLengthMm).toBe(50);
    expect(plan.camera3d.dutchTiltDeg).toBe(0);
    expect(plan.camera3d.pitchDeg).toBe(0);
    expect(plan.camera3d.guideStrokes).toHaveLength(3);
  });

  it("WebGPU 역광 레이어 ON 시 탈-바이올렛 OKLCH 4패스 셰이더와 주광/역광 각도를 계산한다", () => {
    const plan = composeOneshotCutPlan({ dialogue: "봉인을 풀어라!", emotion: "epic-fantasy", strokePreset: "low-heroic-triangle" });
    expect(plan.webgpuRimLight.enabled).toBe(true);
    expect(plan.webgpuRimLight.violetFreeVerified).toBe(true);
    expect(plan.webgpuRimLight.webgpuShaderPassCount).toBe(4);
    expect(plan.webgpuRimLight.rimLight.intensity01).toBeGreaterThan(0.8);
    assertZeroVioletAndRawColors(plan.webgpuRimLight.keyLight.oklch);
    assertZeroVioletAndRawColors(plan.webgpuRimLight.rimLight.oklch);
    assertZeroVioletAndRawColors(plan.webgpuRimLight.backdropTopOklch);
    assertZeroVioletAndRawColors(plan.webgpuRimLight.backdropBottomOklch);
  });

  it("webgpuRimLight 레이어를 끄면 역광 강도 0 · 1패스 중립 용지로 비파괴 전환된다", () => {
    const plan = composeOneshotCutPlan({
      dialogue: "진실은 여기 있다.", emotion: "noir-reveal", strokePreset: "high-isolation-grid",
      layers: { webgpuRimLight: false },
    });
    expect(plan.webgpuRimLight.enabled).toBe(false);
    expect(plan.webgpuRimLight.rimLight.intensity01).toBe(0);
    expect(plan.webgpuRimLight.webgpuShaderPassCount).toBe(1);
    expect(plan.webgpuRimLight.paletteNameKo).toContain("중립");
  });

  it("동일 입력을 반복 합성하면 100% 동일한 플랜과 planDigest를 반환한다", () => {
    const input = { dialogue: "네 검은 이미 늦었어!", emotion: "tense-action" as const, strokePreset: "diagonal-slash" as const };
    const first = composeOneshotCutPlan(input);
    const second = composeOneshotCutPlan(input);
    expect(first).toEqual(second);
    expect(first.planDigest).toBe(second.planDigest);
  });
});

describe("3. 캐릭터 표정 · 한글/영문 음절 비젬 · 15관절 손 그립 포즈", () => {
  it("한글 첫 음절 모음 계열별로 정확한 비젬(A/E/I/O/U)을 분류한다", () => {
    expect(extractDialogueVisemes("바람이 분다", true).startViseme.code).toBe("A_WIDE");
    expect(extractDialogueVisemes("세상이 변해", true).startViseme.code).toBe("E_SPREAD");
    expect(extractDialogueVisemes("지금 출발해", true).startViseme.code).toBe("I_TENSE");
    expect(extractDialogueVisemes("오늘 밤이야", true).startViseme.code).toBe("O_ROUND");
    expect(extractDialogueVisemes("우린 멈추지 않아", true).startViseme.code).toBe("U_PUCKER");
  });

  it("한글 끝 음절 양순음 받침(ㅁ·ㅂ)과 말줄임표(…)를 입술 폐쇄(M_CLOSED)로 판별한다", () => {
    expect(extractDialogueVisemes("그건 바로 지금", true).endViseme.code).toBe("M_CLOSED");
    expect(extractDialogueVisemes("정확한 대답", true).endViseme.code).toBe("M_CLOSED");
    expect(extractDialogueVisemes("사실은 말이야…", true).endViseme.code).toBe("M_CLOSED");
  });

  it("느낌표(!) 대사는 입 개구 높이를 키우고 영문 대사도 첫/끝 음절 비젬을 추출한다", () => {
    const calm = extractDialogueVisemes("가자", true);
    const shout = extractDialogueVisemes("가자!", true);
    expect(shout.startViseme.openHeight01).toBeGreaterThan(calm.startViseme.openHeight01);

    const eng = extractDialogueVisemes("Attack right now!", true);
    expect(eng.startViseme.code).toBe("A_WIDE");
    expect(eng.endViseme.code).toBe("O_ROUND");
    expect(extractDialogueVisemes("Keep calm", true).endViseme.code).toBe("M_CLOSED");
  });

  it("빈 대사나 기호만 입력된 경우 안전하게 M_CLOSED로 폴백한다", () => {
    const empty = extractDialogueVisemes("   ", true);
    const symbols = extractDialogueVisemes("...?!", true);
    expect(empty.startViseme.code).toBe("M_CLOSED");
    expect(empty.endViseme.code).toBe("M_CLOSED");
    expect(symbols.startViseme.code).toBe("M_CLOSED");
  });

  it("5종 감정 각각 고유한 손 그립 아키타입과 정확히 15관절(5손가락 × MCP/PIP/DIP)을 생성한다", () => {
    const seenArchetypes = new Set<string>();
    for (const emotion of ONESHOT_EMOTION_SPECS) {
      const plan = composeOneshotCutPlan({ dialogue: "간다!", emotion: emotion.id, strokePreset: "diagonal-slash" });
      const { handGrip } = plan.charExpressionPose;
      seenArchetypes.add(handGrip.archetypeId);
      expect(handGrip.jointCount).toBe(HAND_JOINT_COUNT);
      expect(handGrip.joints).toHaveLength(15);
      for (const joint of handGrip.joints) {
        expect(joint.flexionDeg).toBeGreaterThanOrEqual(0);
        expect(joint.flexionDeg).toBeLessThanOrEqual(105);
        expect(joint.spreadDeg).toBeGreaterThanOrEqual(0);
        expect(joint.spreadDeg).toBeLessThanOrEqual(50);
      }
    }
    expect(seenArchetypes.size).toBe(5);
  });

  it("느낌표(!)는 손가락 굴곡을 강화하고 물음표(?)는 손가락 벌림을 넓힌다", () => {
    const plain = composeOneshotCutPlan({ dialogue: "진짜야", emotion: "comedy-shock", strokePreset: "diagonal-slash" });
    const exclaim = composeOneshotCutPlan({ dialogue: "진짜야!", emotion: "comedy-shock", strokePreset: "diagonal-slash" });
    const question = composeOneshotCutPlan({ dialogue: "진짜야?", emotion: "comedy-shock", strokePreset: "diagonal-slash" });
    expect(exclaim.charExpressionPose.handGrip.averageFlexionDeg).toBeGreaterThan(plain.charExpressionPose.handGrip.averageFlexionDeg);
    expect(question.charExpressionPose.handGrip.joints[0].spreadDeg).toBeGreaterThan(plain.charExpressionPose.handGrip.joints[0].spreadDeg);
  });

  it("charExpressionPose 레이어 OFF 시 중립 표정 · M_CLOSED · relaxed-neutral 15관절로 복귀한다", () => {
    const plan = composeOneshotCutPlan({
      dialogue: "여기서 끝내자!", emotion: "tense-action", strokePreset: "diagonal-slash",
      layers: { charExpressionPose: false },
    });
    expect(plan.charExpressionPose.enabled).toBe(false);
    expect(plan.charExpressionPose.browTiltDeg).toBe(0);
    expect(plan.charExpressionPose.startViseme.code).toBe("M_CLOSED");
    expect(plan.charExpressionPose.handGrip.archetypeId).toBe("relaxed-neutral");
    expect(plan.charExpressionPose.handGrip.joints).toHaveLength(15);
  });
});

describe("4. 얼굴 안전 영역 겹침 0% 수학 증명 · 9:16 스크롤 여백 · JSON 시트", () => {
  it("5감정 × 4구도 × 5가지 대사 길이(100개 조합) 전원 얼굴-말풍선 겹침 0% 및 최소 이격 ≥10px를 수학적으로 보장한다", () => {
    const dialogues = [
      "",
      "아!",
      "지금이다!",
      "여기서 끝내자. 네 검은 이미 늦었어!",
      "사건 파일의 마지막 증인이 바로 당신이었다는 사실을 이제 와서 숨길 수 있을 거라 생각했나? 모든 기록은 이미 남아 있다!",
    ];
    let verifiedCount = 0;
    for (const emotion of ONESHOT_EMOTION_SPECS) {
      for (const stroke of ROUGH_STROKE_PRESETS) {
        for (const dialogue of dialogues) {
          const plan = composeOneshotCutPlan({ dialogue, emotion: emotion.id, strokePreset: stroke.id });
          const { faceSafeBox } = plan.camera3d;
          const { balloonBox, sfxBox, faceOverlapAreaPx2, faceOverlapRatio, faceClearancePx, sfxFaceOverlapRatio } = plan.opticalBalloonSfx;

          // 독립 재계산으로 엔진 보고값과 수학적 불변식 교차 증명
          expect(computeRectOverlapArea(balloonBox, faceSafeBox)).toBe(0);
          expect(computeRectOverlapRatio(balloonBox, faceSafeBox)).toBe(0);
          expect(faceOverlapAreaPx2).toBe(0);
          expect(faceOverlapRatio).toBe(0);
          expect(faceClearancePx).toBeGreaterThanOrEqual(SAFE_FACE_BALLOON_GAP_PX);
          expect(computeRectOverlapArea(sfxBox, faceSafeBox)).toBe(0);
          expect(sfxFaceOverlapRatio).toBe(0);
          expect(balloonBox.x).toBeGreaterThanOrEqual(16);
          expect(balloonBox.x + balloonBox.width).toBeLessThanOrEqual(CUT_VIEWBOX_WIDTH - 16);
          expect(balloonBox.y).toBeGreaterThanOrEqual(16);
          expect(balloonBox.y + balloonBox.height).toBeLessThanOrEqual(CUT_VIEWBOX_HEIGHT - 16);
          verifiedCount += 1;
        }
      }
    }
    expect(verifiedCount).toBe(100);
  });

  it("5개 레이어 2^5=32가지 모든 ON/OFF 토글 조합에서 얼굴-말풍선 겹침 0%와 SFX 비충돌이 유지된다", () => {
    for (let mask = 0; mask < 32; mask += 1) {
      const layers: OneshotLayerToggles = {
        camera3d: Boolean(mask & 1),
        webgpuRimLight: Boolean(mask & 2),
        charExpressionPose: Boolean(mask & 4),
        opticalBalloonSfx: Boolean(mask & 8),
        scrollGutterRhythm: Boolean(mask & 16),
      };
      const plan = composeOneshotCutPlan({
        dialogue: "봉인을 풀어라! 고대의 맹세가 지금 깨어난다!",
        emotion: "epic-fantasy",
        strokePreset: "low-heroic-triangle",
        layers,
      });
      expect(plan.opticalBalloonSfx.faceOverlapRatio).toBe(0);
      expect(plan.opticalBalloonSfx.sfxFaceOverlapRatio).toBe(0);
      expect(plan.opticalBalloonSfx.sfxBalloonOverlapRatio).toBe(0);
      expect(plan.authorSovereignty.activeLayerCount + plan.authorSovereignty.bypassedLayerIds.length).toBe(5);
    }
  });

  it("5종 감정이 각각 고유한 말풍선 형태를 사용하고 대사 줄바꿈이 3줄 이내로 제어된다", () => {
    const shapes = new Set<string>();
    for (const emotion of ONESHOT_EMOTION_SPECS) {
      const plan = composeOneshotCutPlan({
        dialogue: "이것은 매우 긴 대사 줄바꿈 테스트 문장이며 세 줄을 넘지 않도록 광학 말풍선이 정리합니다.",
        emotion: emotion.id,
        strokePreset: "intimate-close-arc",
      });
      shapes.add(plan.opticalBalloonSfx.balloonShape);
      expect(plan.opticalBalloonSfx.wrappedLines.length).toBeGreaterThanOrEqual(1);
      expect(plan.opticalBalloonSfx.wrappedLines.length).toBeLessThanOrEqual(3);
    }
    expect(shapes.size).toBe(5);
  });

  it("모바일 9:16 세로 스크롤 컷 높이와 상하 여백이 장르별 호흡을 반영하고 OFF 시 표준값으로 원복된다", () => {
    const comedy = composeOneshotCutPlan({ dialogue: "헐?!", emotion: "comedy-shock", strokePreset: "diagonal-slash" });
    const epic = composeOneshotCutPlan({ dialogue: "봉인을 풀어라! 고대의 맹세가 지금 깨어난다!", emotion: "epic-fantasy", strokePreset: "high-isolation-grid" });
    expect(epic.scrollGutterRhythm.cutHeightPx).toBeGreaterThan(comedy.scrollGutterRhythm.cutHeightPx);
    expect(epic.scrollGutterRhythm.topGutterPx + epic.scrollGutterRhythm.bottomGutterPx).toBeGreaterThan(
      comedy.scrollGutterRhythm.topGutterPx + comedy.scrollGutterRhythm.bottomGutterPx,
    );
    expect(epic.scrollGutterRhythm.totalScrollSpanPx).toBe(
      epic.scrollGutterRhythm.topGutterPx + epic.scrollGutterRhythm.cutHeightPx + epic.scrollGutterRhythm.bottomGutterPx,
    );

    const neutral = composeOneshotCutPlan({
      dialogue: "테스트", emotion: "epic-fantasy", strokePreset: "low-heroic-triangle",
      layers: { scrollGutterRhythm: false },
    });
    expect(neutral.scrollGutterRhythm.cutHeightPx).toBe(BASE_916_CUT_HEIGHT_PX);
    expect(neutral.scrollGutterRhythm.topGutterPx).toBe(120);
    expect(neutral.scrollGutterRhythm.bottomGutterPx).toBe(120);
  });

  it("작가 주권 리포트가 비파괴·원본 러프 보존·바이패스 레이어 목록을 정확히 추적한다", () => {
    const allOn = composeOneshotCutPlan({ dialogue: "출발", emotion: "tense-action", strokePreset: "diagonal-slash", layers: DEFAULT_ONESHOT_LAYERS });
    const rawOnly = composeOneshotCutPlan({ dialogue: "출발", emotion: "tense-action", strokePreset: "diagonal-slash", layers: NEUTRAL_ROUGH_ONLY_LAYERS });
    expect(allOn.authorSovereignty.nonDestructive).toBe(true);
    expect(allOn.authorSovereignty.originalRoughPreserved).toBe(true);
    expect(allOn.authorSovereignty.activeLayerCount).toBe(5);
    expect(allOn.authorSovereignty.bypassedLayerIds).toEqual([]);
    expect(rawOnly.authorSovereignty.activeLayerCount).toBe(0);
    expect(rawOnly.authorSovereignty.bypassedLayerIds).toEqual(ONESHOT_LAYER_IDS);
  });

  it("exportOneshotCutPlanJson이 유효한 결정론 JSON 시트와 불변식 필드를 출력한다", () => {
    const preset = getOneshotScenePreset("rain-alley-truth");
    const plan = composeOneshotCutPlan({ dialogue: preset.dialogueKo, emotion: preset.emotion, strokePreset: preset.strokePreset, presetId: preset.id });
    const json = exportOneshotCutPlanJson(plan);
    const parsed = JSON.parse(json) as {
      schemaVersion: string;
      planDigest: string;
      invariants: { faceBalloonOverlapRatio: number; sfxFaceOverlapRatio: number; crossed180Rule: boolean; violetFreeOklch: boolean; handJointCount: number; nonDestructive: boolean };
    };
    expect(parsed.schemaVersion).toBe("toonstudio.oneshot-cut-director.v1");
    expect(parsed.planDigest).toBe(plan.planDigest);
    expect(parsed.invariants).toEqual({
      faceBalloonOverlapRatio: 0,
      faceBalloonClearancePx: plan.opticalBalloonSfx.faceClearancePx,
      sfxFaceOverlapRatio: 0,
      crossed180Rule: false,
      violetFreeOklch: true,
      handJointCount: 15,
      nonDestructive: true,
    });
    assertZeroVioletAndRawColors(json);
  });

  it("presetId를 생략하면 custom으로 표기되고 9:16 viewBox 치수를 유지한다", () => {
    const plan = composeOneshotCutPlan({ dialogue: "임의 대사", emotion: "noir-reveal", strokePreset: "high-isolation-grid" });
    expect(plan.presetId).toBe("custom");
    expect(plan.viewBox).toEqual({ width: 360, height: 640 });
  });
});

describe("5. StudioOneshotCutDirectorPanel UI 상호작용 · SVG 라이브 동기화 · 로케일", () => {
  it("선택적 props 없이 기본 렌더링되고 초기 프리셋과 5/5 비파괴 배지가 표시된다", () => {
    render(<StudioOneshotCutDirectorPanel />);
    const panel = screen.getByTestId("oneshot-cut-director-panel");
    expect(panel.getAttribute("aria-label")).toBe("원샷 컷 라이브 연출기");
    expect(screen.getByTestId("oneshot-sovereignty-badge").textContent).toContain("비파괴 5/5");
    expect(screen.getByTestId("oneshot-sovereignty-badge").textContent).toContain("겹침 0%");

    const svg = screen.getByTestId("oneshot-preview-svg");
    expect(svg.getAttribute("data-emotion")).toBe("tense-action");
    expect(svg.getAttribute("data-stroke-preset")).toBe("diagonal-slash");
    expect(svg.getAttribute("data-face-overlap-ratio")).toBe("0");
    expect(svg.getAttribute("data-violet-free")).toBe("true");
  });

  it("4종 웹툰 대표 씬 프리셋 클릭 시 대사·감정·3획 구도가 즉시 전환되고 onPlanChange가 호출된다", () => {
    const onPlanChange = vi.fn();
    render(<StudioOneshotCutDirectorPanel onPlanChange={onPlanChange} />);

    fireEvent.click(screen.getByTestId("oneshot-preset-subway-sunset-confession"));
    expect(screen.getByTestId("oneshot-preview-svg").getAttribute("data-emotion")).toBe("romance-heartbeat");
    expect(screen.getByTestId("oneshot-preview-svg").getAttribute("data-stroke-preset")).toBe("intimate-close-arc");
    expect((screen.getByTestId("oneshot-dialogue-input") as HTMLInputElement).value).toContain("너만 보고");
    expect(onPlanChange).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("oneshot-preset-citadel-awakening-oath"));
    expect(screen.getByTestId("oneshot-preview-svg").getAttribute("data-emotion")).toBe("epic-fantasy");
    expect(screen.getByTestId("oneshot-preview-svg").getAttribute("data-stroke-preset")).toBe("low-heroic-triangle");
  });

  it("대사 입력창에 새 한글 대사를 입력하면 첫/끝 음절 비젬과 SVG 말풍선 텍스트가 실시간 갱신된다", () => {
    render(<StudioOneshotCutDirectorPanel />);
    const input = screen.getByTestId("oneshot-dialogue-input");
    fireEvent.change(input, { target: { value: "바람처럼 지금!" } });
    expect(screen.getByTestId("oneshot-viseme-readout").textContent).toContain("바[A_WIDE]");
    expect(screen.getByTestId("oneshot-viseme-readout").textContent).toContain("금[M_CLOSED]");
    expect(screen.getByTestId("oneshot-svg-balloon-layer").textContent).toContain("바람처럼 지금!");
  });

  it("5종 감정 버튼 전환 시 WebGPU 역광 색온도와 SFX가 실시간 변경된다", () => {
    render(<StudioOneshotCutDirectorPanel />);
    const emotions: readonly OneshotEmotionId[] = ["romance-heartbeat", "noir-reveal", "comedy-shock", "epic-fantasy", "tense-action"];
    for (const emotionId of emotions) {
      fireEvent.click(screen.getByTestId(`oneshot-emotion-${emotionId}`));
      expect(screen.getByTestId("oneshot-preview-svg").getAttribute("data-emotion")).toBe(emotionId);
      expect(screen.getByTestId("oneshot-preview-svg").getAttribute("data-face-overlap-ratio")).toBe("0");
    }
  });

  it("4종 3획 구도 버튼 전환 시 카메라 화각·구도 데이터 속성이 즉시 갱신된다", () => {
    render(<StudioOneshotCutDirectorPanel />);
    const strokes: readonly RoughStrokePresetId[] = ["low-heroic-triangle", "intimate-close-arc", "high-isolation-grid", "diagonal-slash"];
    for (const strokeId of strokes) {
      fireEvent.click(screen.getByTestId(`oneshot-stroke-${strokeId}`));
      expect(screen.getByTestId("oneshot-preview-svg").getAttribute("data-stroke-preset")).toBe(strokeId);
    }
  });

  it("5개 비파괴 레이어 스위치를 개별 OFF/ON하면 해당 SVG 오버레이 레이어가 즉시 토글된다", () => {
    render(<StudioOneshotCutDirectorPanel />);
    const layerTestMap: readonly [string, string][] = [
      ["oneshot-layer-camera3d", "oneshot-svg-camera3d-layer"],
      ["oneshot-layer-webgpuRimLight", "oneshot-svg-rimlight-layer"],
      ["oneshot-layer-charExpressionPose", "oneshot-svg-expression-layer"],
      ["oneshot-layer-opticalBalloonSfx", "oneshot-svg-balloon-layer"],
      ["oneshot-layer-scrollGutterRhythm", "oneshot-svg-gutter-layer"],
    ];
    for (const [switchId, svgLayerId] of layerTestMap) {
      expect(screen.queryByTestId(svgLayerId)).not.toBeNull();
      fireEvent.click(screen.getByTestId(switchId));
      expect(screen.queryByTestId(svgLayerId)).toBeNull();
      expect(screen.getByTestId(switchId).getAttribute("aria-checked")).toBe("false");
      fireEvent.click(screen.getByTestId(switchId));
      expect(screen.queryByTestId(svgLayerId)).not.toBeNull();
      expect(screen.getByTestId(switchId).getAttribute("aria-checked")).toBe("true");
    }
  });

  it("'원본 3획 러프만' 클릭 시 5레이어 모두 바이패스하되 3획 러프 경로는 비파괴 보존되고 '초기 원복'으로 되돌린다", () => {
    render(<StudioOneshotCutDirectorPanel />);
    fireEvent.click(screen.getByTestId("oneshot-layers-rough-only"));
    expect(screen.getByTestId("oneshot-preview-svg").getAttribute("data-active-layers")).toBe("0");
    expect(screen.queryByTestId("oneshot-svg-rough-strokes")).not.toBeNull();
    expect(screen.queryByTestId("oneshot-svg-balloon-layer")).toBeNull();

    fireEvent.click(screen.getByTestId("oneshot-layers-all-on"));
    expect(screen.getByTestId("oneshot-preview-svg").getAttribute("data-active-layers")).toBe("5");

    fireEvent.change(screen.getByTestId("oneshot-dialogue-input"), { target: { value: "임시 수정 대사" } });
    fireEvent.click(screen.getByTestId("oneshot-reset-btn"));
    expect((screen.getByTestId("oneshot-dialogue-input") as HTMLInputElement).value).toBe(
      getOneshotScenePreset("rooftop-blade-standoff").dialogueKo,
    );
  });

  it("JSON 복사 버튼이 클립보드와 onExportJson 콜백을 실행하고 미리보기 토글이 JSON 시트를 노출한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const onExportJson = vi.fn();

    render(<StudioOneshotCutDirectorPanel onExportJson={onExportJson} />);
    fireEvent.click(screen.getByTestId("oneshot-copy-json-btn"));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(onExportJson).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("oneshot-status-banner").textContent).toContain("JSON 연출 시트"));

    expect(screen.queryByTestId("oneshot-json-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("oneshot-toggle-json-btn"));
    const preview = screen.getByTestId("oneshot-json-preview");
    expect(preview.textContent).toContain("toonstudio.oneshot-cut-director.v1");
    expect(preview.textContent).toContain("\"faceBalloonOverlapRatio\": 0");
  });

  it("15관절 손 그립 테이블에 5손가락(엄지·검지·중지·약지·소지) 각도가 모두 표시된다", () => {
    render(<StudioOneshotCutDirectorPanel />);
    const table = screen.getByTestId("oneshot-hand-joints-table");
    expect(table.children).toHaveLength(5);
    expect(table.textContent).toContain("엄지");
    expect(table.textContent).toContain("소지");
    expect(table.textContent).toContain("°");
  });

  it("영문 로케일(locale='en')과 initialPresetId·className props가 정확히 적용된다", () => {
    render(
      <StudioOneshotCutDirectorPanel
        locale="en"
        initialPresetId="rain-alley-truth"
        className="custom-w58b-director-shell"
      />,
    );
    const panel = screen.getByTestId("oneshot-cut-director-panel");
    expect(panel.getAttribute("aria-label")).toBe("One-Shot Cut Live Director");
    expect(panel.className).toContain("custom-w58b-director-shell");
    expect(screen.getByTestId("oneshot-preview-svg").getAttribute("data-emotion")).toBe("noir-reveal");
    expect(screen.getByTestId("oneshot-sovereignty-badge").textContent).toContain("Non-Destructive 5/5");
  });
});

describe("6. 엄격 품질·하네스 계약 및 Calm Studio 자가 검증", () => {
  it("소유 파일 4종 존재, 줄 수 상한 준수(engine<=750, panel<=680, all<=800) 및 금지 패턴 0건", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "oneshot-cut-director-engine.ts",
      "StudioOneshotCutDirectorPanel.tsx",
      "index.ts",
      "oneshot-cut-director.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles).toHaveLength(4);

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "oneshot-cut-director-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioOneshotCutDirectorPanel.tsx") expect(lines).toBeLessThanOrEqual(680);

      if (file !== "oneshot-cut-director.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공");
        expect(src).not.toContain("원활한 워크플로우를 보장");
      }

      if (file === "StudioOneshotCutDirectorPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("렌더된 모든 버튼이 min-h-11을 유지하고 스위치 role='switch'가 5개 제공된다", () => {
    const { container } = render(<StudioOneshotCutDirectorPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(22);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
    expect(container.querySelectorAll('button[role="switch"]')).toHaveLength(5);
  });

  it("5종 감정 전환 시 렌더된 모든 SVG에 원시 색(#hex/rgb/hsl)과 바이올렛 휴(270~320°)가 0건이다", () => {
    const { container } = render(<StudioOneshotCutDirectorPanel />);
    for (const spec of ONESHOT_EMOTION_SPECS) {
      fireEvent.click(screen.getByTestId(`oneshot-emotion-${spec.id}`));
      const svgs = container.querySelectorAll("svg");
      expect(svgs.length).toBeGreaterThanOrEqual(6);
      for (const svg of svgs) {
        assertZeroVioletAndRawColors(svg.outerHTML);
      }
    }
  });

  it("4개 소유 파일이 금지 도메인(vrm·bg3d·market·apps/api·apps/admin-web)을 정적으로 import하지 않는다", () => {
    const dir = path.resolve(import.meta.dirname);
    const files = [
      "oneshot-cut-director-engine.ts",
      "StudioOneshotCutDirectorPanel.tsx",
      "index.ts",
      "oneshot-cut-director.test.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const importLines = src.split(/\r?\n/).filter((line) => /^\s*import\b/u.test(line));
      for (const line of importLines) {
        expect(line).not.toMatch(/\/(?:vrm|bg3d|market)\b/u);
        expect(line).not.toContain("apps/api");
        expect(line).not.toContain("apps/admin-web");
      }
    }
  });
});

describe("연출 예제 입력과 복사 경계", () => {
  it("긴 대사를 제한하고 말풍선 줄 바꿈에서 이모지를 나누지 않는다", () => {
    const dialogue = "🎬".repeat(400);
    const plan = composeOneshotCutPlan({ dialogue, emotion: "noir-reveal", strokePreset: "high-isolation-grid" });
    expect(plan.dialogue.length).toBeLessThanOrEqual(280);
    expect(plan.opticalBalloonSfx.wrappedLines.every((line) => !/[\uD800-\uDFFF]/u.test(line))).toBe(true);
  });

  it("표기 직전 반올림과 유한하지 않은 입력을 안전하게 처리한다", () => {
    expect(isVioletSlopHue(sanitizeNonVioletHue(269.99))).toBe(false);
    expect(formatOklch({ l: NaN, c: Infinity, h: -Infinity }, NaN)).toBe("oklch(0 0 0 / 0.00)");
  });

  it("SVG 미리보기의 실행 방식을 내보낼 때도 보존한다", () => {
    const plan = composeOneshotCutPlan({ dialogue: "연출", emotion: "noir-reveal", strokePreset: "high-isolation-grid" });
    expect(plan.webgpuRimLight).toMatchObject({ renderPath: "svg-preview", submittedWebgpuPassCount: 0 });
    expect(exportOneshotCutPlanJson(plan)).toContain('"renderPath": "svg-preview"');
  });

  it("거절된 클립보드를 복사 성공으로 표시하지 않는다", async () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    try {
      const writeText = vi.fn().mockRejectedValue(new Error("clipboard unavailable"));
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
      render(<StudioOneshotCutDirectorPanel locale="en" />);
      fireEvent.click(screen.getByTestId("oneshot-copy-json-btn"));
      await waitFor(() => expect(screen.getByTestId("oneshot-status-banner").textContent).toContain("Could not copy"));
      expect(screen.getByTestId("oneshot-json-preview")).toBeTruthy();
    } finally {
      if (previous) Object.defineProperty(navigator, "clipboard", previous);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});
