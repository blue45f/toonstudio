// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PREVIOUS_CUT_LIGHTING_PRESETS,
  SCENE_EMOTIONS,
  SCENE_LOCATION_PRESETS,
  SCENE_TIME_OF_DAY_PRESETS,
  StudioSceneLightingAdvisorPanel,
  analyzeSceneLightingEmotion,
  applyLightingProposal,
  auditLightingReadability,
  compareLightingCuts,
  createLightingSession,
  exportLightingRigJson,
  formatOklch,
  getPreviousCutLightingPreset,
  isVioletSlopHue,
  kelvinToOklch,
  previewLightingProposal,
  proposeSceneLightingTop3,
  revertLightingProposal,
  sanitizeNonVioletHue,
  tweakLightingRig,
  updateLightingPreviousCut,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("1. 대사·지문·시간대·장소 기반 6대 감정 벡터 분석기", () => {
  it("빗속 옥상 대치 대사를 tension 주감정으로 분류하고 지문·어휘 신호를 기록한다", () => {
    const res = analyzeSceneLightingEmotion({
      dialogue: "(거센 빗줄기가 옥상 난간을 때린다) 여기서 끝내자. 더는 물러설 곳 없어.",
      timeOfDay: "rainy-dusk",
      scenePresetId: "rooftop-rain",
    });
    expect(res.primaryEmotion).toBe("tension");
    expect(res.confidence).toBeGreaterThan(0.65);
    expect(res.detectedSignals.some((s) => s.includes("지문:악천후"))).toBe(true);
  });

  it("노을 교실 골든아워 고백 대사를 flutter 주감정으로 분류한다", () => {
    const res = analyzeSceneLightingEmotion({
      dialogue: "(창가로 붉은 노을이 번진다) 저기... 방과 후에 같이 걸을래? 두근거려~",
      timeOfDay: "golden-hour",
      scenePresetId: "sunset-classroom",
    });
    expect(res.primaryEmotion).toBe("flutter");
    expect(res.emotionVector.flutter).toBeGreaterThan(res.emotionVector.anger);
  });

  it("설원 결투의 배신·분노 대사와 강조 감탄(!!)을 anger 주감정으로 분류한다", () => {
    const res = analyzeSceneLightingEmotion({
      dialogue: "감히 배신하다니 용서 못 해!! 검을 뽑아라, 오늘 복수의 대가를 치른다!!",
      timeOfDay: "snow-overcast",
      scenePresetId: "snow-duel",
    });
    expect(res.primaryEmotion).toBe("anger");
    expect(res.detectedSignals.some((s) => s.includes("강조감탄"))).toBe(true);
  });

  it("새벽 침실 독백과 말줄임표(...)를 solitude 주감정으로 분류한다", () => {
    const res = analyzeSceneLightingEmotion({
      dialogue: "(커튼 틈으로 새벽빛이 스민다) 아무도 없네... 텅 빈 방에서 또 혼자 아침을 맞았어...",
      timeOfDay: "dawn",
      scenePresetId: "dawn-bedroom",
    });
    expect(res.primaryEmotion).toBe("solitude");
    expect(res.detectedSignals.some((s) => s.includes("말줄임표"))).toBe(true);
  });

  it("궁정 대전 축연 대사를 elation 주감정으로 분류한다", () => {
    const res = analyzeSceneLightingEmotion({
      dialogue: "드디어 해냈어! 승리의 축배를 들어, 오늘의 영광을 축하하자!",
      timeOfDay: "day",
      scenePresetId: "royal-hall",
    });
    expect(res.primaryEmotion).toBe("elation");
  });

  it("추격 뒷골목 네온 야경과 발소리·의문감탄(?!)을 suspense 주감정으로 분류한다", () => {
    const res = analyzeSceneLightingEmotion({
      dialogue: "(젖은 골목 어둠 속에서 발소리가 울린다) 설마 누구야?! 발소리가 따라오고 있어!!",
      timeOfDay: "night-neon",
      scenePresetId: "chase-alley",
    });
    expect(res.primaryEmotion).toBe("suspense");
    expect(res.detectedSignals.some((s) => s.includes("지문:추격"))).toBe(true);
  });

  it("6대 감정 벡터는 [0, 1] 범위로 정규화되며 동일 입력에 완전 결정론적이다", () => {
    const input = { dialogue: "잠깐 멈춰! 누구야?", timeOfDay: "rainy-dusk" as const, scenePresetId: "chase-alley" as const };
    const a = analyzeSceneLightingEmotion(input);
    const b = analyzeSceneLightingEmotion(input);
    expect(a).toEqual(b);

    const sum = Object.values(a.emotionVector).reduce((acc, v) => acc + v, 0);
    expect(sum).toBeGreaterThan(0.95);
    expect(sum).toBeLessThan(1.05);
    for (const v of Object.values(a.emotionVector)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("2. 탈-바이올렛 OKLCH 물리 및 색온도 변환 (270~320° 0%)", () => {
  it("isVioletSlopHue와 sanitizeNonVioletHue가 270~320도 구간을 완전히 배제한다", () => {
    expect(isVioletSlopHue(270)).toBe(true);
    expect(isVioletSlopHue(295)).toBe(true);
    expect(isVioletSlopHue(320)).toBe(true);
    expect(isVioletSlopHue(252)).toBe(false);
    expect(isVioletSlopHue(342)).toBe(false);
    expect(isVioletSlopHue(32)).toBe(false);

    for (let deg = 270; deg <= 320; deg += 5) {
      const safe = sanitizeNonVioletHue(deg);
      expect(isVioletSlopHue(safe)).toBe(false);
    }
  });

  it("kelvinToOklch가 2200K~9500K 전 구간에서 비-바이올렛 OKLCH 색상을 반환한다", () => {
    const warm = kelvinToOklch(2600);
    const neutral = kelvinToOklch(5400);
    const cool = kelvinToOklch(8200);
    expect(warm.h).toBeLessThan(80);
    expect(cool.h).toBeGreaterThanOrEqual(220);
    expect(cool.h).toBeLessThan(270);
    expect(neutral.c).toBeLessThan(0.06);

    for (let k = 2200; k <= 9500; k += 300) {
      expect(isVioletSlopHue(kelvinToOklch(k).h)).toBe(false);
    }
  });

  it("formatOklch가 유효한 oklch(...) 문자열만 생성하고 raw hex/rgb/hsl을 포함하지 않는다", () => {
    const solid = formatOklch({ l: 0.67, c: 0.2, h: 32 });
    const translucent = formatOklch({ l: 0.72, c: 0.14, h: 290 }, 0.4);
    expect(solid).toBe("oklch(0.67 0.20 32)");
    expect(translucent).toMatch(/^oklch\(\d\.\d{2} \d\.\d{2} 252 \/ 0\.40\)$/u);
    expect(solid).not.toMatch(/#|rgb|hsl/iu);
  });

  it("시간대·장소·감정·전 컷 프리셋 메타 전체에 바이올렛 휴(270~320°)가 0건이다", () => {
    for (const t of SCENE_TIME_OF_DAY_PRESETS) {
      expect(isVioletSlopHue(t.backdropOklch.h)).toBe(false);
    }
    for (const s of SCENE_LOCATION_PRESETS) {
      expect(isVioletSlopHue(s.rimPigmentOklch.h)).toBe(false);
    }
    for (const e of SCENE_EMOTIONS) {
      expect(isVioletSlopHue(e.rimPigmentOklch.h)).toBe(false);
    }
    for (const p of PREVIOUS_CUT_LIGHTING_PRESETS) {
      expect(isVioletSlopHue(p.rig.keyLight.colorOklch.h)).toBe(false);
      expect(isVioletSlopHue(p.rig.fillLight.colorOklch.h)).toBe(false);
      expect(isVioletSlopHue(p.rig.rimLight.pigmentOklch.h)).toBe(false);
      expect(isVioletSlopHue(p.rig.atmosphere.backdropOklch.h)).toBe(false);
    }
  });

  it("6장소 × 6시간대 전 조합(36종) Top-3 제안의 모든 광원·배경 OKLCH가 바이올렛 0%다", () => {
    for (const loc of SCENE_LOCATION_PRESETS) {
      for (const tod of SCENE_TIME_OF_DAY_PRESETS) {
        const bundle = proposeSceneLightingTop3({
          dialogue: loc.defaultDialogueKo,
          scenePresetId: loc.id,
          timeOfDay: tod.id,
        });
        for (const p of bundle.proposals) {
          expect(isVioletSlopHue(p.rig.keyLight.colorOklch.h)).toBe(false);
          expect(isVioletSlopHue(p.rig.fillLight.colorOklch.h)).toBe(false);
          expect(isVioletSlopHue(p.rig.rimLight.pigmentOklch.h)).toBe(false);
          expect(isVioletSlopHue(p.rig.atmosphere.backdropOklch.h)).toBe(false);
        }
      }
    }
  });
});

describe("3. 비파괴 Top-3 3D 조명 연출 제안 (proposeSceneLightingTop3)", () => {
  it("항상 신뢰도 내림차순 Top-3(cinematic-key·dramatic-rim·readable-soft)와 작가 승인 필수 플래그를 반환한다", () => {
    const bundle = proposeSceneLightingTop3({
      dialogue: "(거센 빗줄기) 여기서 끝내자. 더는 물러설 곳 없어.",
      timeOfDay: "rainy-dusk",
      scenePresetId: "rooftop-rain",
    });
    expect(bundle.proposals).toHaveLength(3);
    expect(bundle.proposals.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(bundle.proposals.map((p) => p.variant)).toEqual(["cinematic-key", "dramatic-rim", "readable-soft"]);
    expect(bundle.proposals[0].confidence).toBeGreaterThanOrEqual(bundle.proposals[1].confidence);
    expect(bundle.proposals[1].confidence).toBeGreaterThanOrEqual(bundle.proposals[2].confidence);
    for (const p of bundle.proposals) {
      expect(p.requiresAuthorApproval).toBe(true);
    }
  });

  it("Top-1 제안이 장면·색온도(K)·림 안료명을 포함한 자연스러운 한글 연출 이유를 생성한다", () => {
    const bundle = proposeSceneLightingTop3({
      dialogue: "(거센 빗줄기) 여기서 끝내자.",
      timeOfDay: "rainy-dusk",
      scenePresetId: "rooftop-rain",
    });
    const p1 = bundle.proposals[0];
    expect(p1.reasonKo).toContain("빗속 옥상");
    expect(p1.reasonKo).toContain("K");
    expect(p1.reasonKo).toContain("주홍");
    expect(p1.reasonKo).toContain("림라이트");
  });

  it("Top-2(dramatic-rim)는 Top-1 대비 필 비율이 낮고 림 강도 및 볼류메트릭이 높다", () => {
    const bundle = proposeSceneLightingTop3({
      dialogue: "설마 벌써 따라온 거야?!",
      timeOfDay: "night-neon",
      scenePresetId: "chase-alley",
    });
    const [p1, p2] = bundle.proposals;
    expect(p2.rig.fillLight.fillRatio).toBeLessThan(p1.rig.fillLight.fillRatio);
    expect(p2.rig.rimLight.intensity).toBeGreaterThan(p1.rig.rimLight.intensity);
    expect(p2.rig.atmosphere.volumetricStrength).toBeGreaterThanOrEqual(p1.rig.atmosphere.volumetricStrength);
  });

  it("Top-3(readable-soft)는 대사·표정 가독성 유지를 위해 필 비율 0.5 이상과 안전한 배경 명도를 유지한다", () => {
    const bundle = proposeSceneLightingTop3({
      dialogue: "검을 뽑아라! 오늘 결판을 낸다!",
      timeOfDay: "snow-overcast",
      scenePresetId: "snow-duel",
    });
    const p3 = bundle.proposals[2];
    expect(p3.rig.fillLight.fillRatio).toBeGreaterThanOrEqual(0.5);
    expect(p3.rig.atmosphere.ambientLuminance).toBeLessThanOrEqual(0.65);
    expect(p3.readabilityAudit.overallGrade).toBe("pass");
  });

  it("6대 장면 프리셋마다 고유한 키 방위각·림 각도·림 안료가 차별화된다", () => {
    const rims = new Set<string>();
    const azimuths = new Set<number>();
    for (const preset of SCENE_LOCATION_PRESETS) {
      const b = proposeSceneLightingTop3({
        dialogue: preset.defaultDialogueKo,
        scenePresetId: preset.id,
        timeOfDay: preset.defaultTimeOfDay,
      });
      rims.add(b.proposals[0].rig.rimLight.pigmentNameKo);
      azimuths.add(b.proposals[0].rig.keyLight.azimuthDeg);
    }
    expect(rims.size).toBe(6);
    expect(azimuths.size).toBe(6);
  });
});

describe("4. 얼굴 명암 대비비 & 말풍선 영역 명도 자동 점검 (auditLightingReadability)", () => {
  it("균형 잡힌 3점 조명 릭은 pass 등급과 optimal 얼굴 대비를 반환한다", () => {
    const session = createLightingSession();
    const audit = auditLightingReadability(session.baselineRig);
    expect(audit.faceContrastStatus).toBe("optimal");
    expect(audit.bubbleReadabilityStatus).toBe("clear");
    expect(audit.overallGrade).toBe("pass");
    expect(audit.warningsKo).toHaveLength(0);
  });

  it("키가 매우 강하고 필이 극도로 낮으면 harsh 얼굴 대비 경고와 필 상향 권고를 반환한다", () => {
    const base = createLightingSession();
    const darkPrev = getPreviousCutLightingPreset("neon-night").rig;
    const darkSession = createLightingSession(darkPrev, darkPrev);
    const harshSession = tweakLightingRig(darkSession, { keyIntensity: 3.0, fillRatio: 0.1, fogDensity: 0 });
    const audit = auditLightingReadability(harshSession.currentRig);
    expect(base.baselineRig).not.toEqual(harshSession.currentRig);
    expect(audit.faceContrastStatus).toBe("harsh");
    expect(audit.overallGrade).toBe("warning");
    expect(audit.warningsKo.some((w) => w.includes("얼굴 명암 대비비"))).toBe(true);
    expect(audit.recommendationsKo.some((r) => r.includes("필라이트"))).toBe(true);
  });

  it("키가 약하고 필 비율이 100%이면 flat 얼굴 대비 경고를 반환한다", () => {
    const base = createLightingSession();
    const flatSession = tweakLightingRig(base, { keyIntensity: 0.5, fillRatio: 1.0, fogDensity: 0.4 });
    const audit = auditLightingReadability(flatSession.currentRig);
    expect(audit.faceContrastStatus).toBe("flat");
    expect(audit.overallGrade).toBe("caution");
    expect(audit.warningsKo.some((w) => w.includes("평면적"))).toBe(true);
  });

  it("흐린 설원처럼 상단 배경 명도가 높으면 말풍선 가독성 주의/경고와 먹선 테두리 권고를 반환한다", () => {
    const snowBundle = proposeSceneLightingTop3({
      dialogue: "(눈보라가 거세진다) 여기서 결판을 내자.",
      timeOfDay: "snow-overcast",
      scenePresetId: "snow-duel",
    });
    const audit = snowBundle.proposals[0].readabilityAudit;
    expect(audit.bubbleZoneLuminance).toBeGreaterThanOrEqual(0.7);
    expect(["caution", "warning"]).toContain(audit.bubbleReadabilityStatus);
    expect(audit.recommendedBubbleStyleKo).toContain("먹선");
  });
});

describe("5. 비파괴 상태 머신·미세 조정·전 컷 비교 및 3D 릭 JSON 내보내기", () => {
  it("createLightingSession 초기 상태는 원본 보존(idle, canRevert=false)이다", () => {
    const session = createLightingSession();
    expect(session.status).toBe("idle");
    expect(session.canRevert).toBe(false);
    expect(session.currentRig).toEqual(session.baselineRig);
    expect(session.appliedProposalId).toBeNull();
    expect(session.history).toHaveLength(0);
  });

  it("previewLightingProposal은 baselineRig와 currentRig를 건드리지 않고 토글된다", () => {
    const bundle = proposeSceneLightingTop3({ dialogue: "여기서 끝내자.", scenePresetId: "rooftop-rain", timeOfDay: "rainy-dusk" });
    const s0 = createLightingSession();
    const s1 = previewLightingProposal(s0, bundle.proposals[0]);
    expect(s1.status).toBe("previewing");
    expect(s1.previewingProposalId).toBe(bundle.proposals[0].id);
    expect(s1.previewRig).toEqual(bundle.proposals[0].rig);
    expect(s1.currentRig).toEqual(s0.baselineRig);
    expect(s1.canRevert).toBe(false);

    const s2 = previewLightingProposal(s1, bundle.proposals[0]);
    expect(s2.status).toBe("idle");
    expect(s2.previewRig).toBeNull();
  });

  it("applyLightingProposal 후 revertLightingProposal 시 원본 baselineRig로 100% 복원된다", () => {
    const bundle = proposeSceneLightingTop3({ dialogue: "여기서 끝내자.", scenePresetId: "rooftop-rain", timeOfDay: "rainy-dusk" });
    const s0 = createLightingSession();
    const sApplied = applyLightingProposal(s0, bundle.proposals[1]);
    expect(sApplied.status).toBe("applied");
    expect(sApplied.canRevert).toBe(true);
    expect(sApplied.appliedProposalId).toBe(bundle.proposals[1].id);
    expect(sApplied.currentRig).toEqual(bundle.proposals[1].rig);
    expect(sApplied.baselineRig).toEqual(s0.baselineRig);

    const sReverted = revertLightingProposal(sApplied);
    expect(sReverted.status).toBe("reverted");
    expect(sReverted.canRevert).toBe(false);
    expect(sReverted.appliedProposalId).toBeNull();
    expect(sReverted.currentRig).toEqual(s0.baselineRig);
    expect(sReverted.history.map((h) => h.action)).toEqual(["apply", "revert"]);
  });

  it("tweakLightingRig가 파라미터 클램핑과 바이올렛 휴(290°) 자동 교정을 수행한다", () => {
    const s0 = createLightingSession();
    const sTweaked = tweakLightingRig(s0, {
      keyIntensity: 9.9,
      keyKelvin: 12000,
      fillRatio: 0.02,
      rimIntensity: 5.0,
      rimHueDeg: 290,
      fogDensity: 1.5,
    });
    expect(sTweaked.status).toBe("tweaked");
    expect(sTweaked.isTweaked).toBe(true);
    expect(sTweaked.canRevert).toBe(true);
    expect(sTweaked.currentRig.keyLight.intensity).toBe(3.0);
    expect(sTweaked.currentRig.keyLight.kelvin).toBe(9500);
    expect(sTweaked.currentRig.fillLight.fillRatio).toBe(0.1);
    expect(sTweaked.currentRig.rimLight.intensity).toBe(2.5);
    expect(isVioletSlopHue(sTweaked.currentRig.rimLight.pigmentOklch.h)).toBe(false);
    expect(sTweaked.currentRig.atmosphere.fogDensity).toBe(1.0);
  });

  it("미리보기 상태에서 tweakLightingRig 호출 시 previewRig 기준으로 미세 조정하되 baselineRig는 보존한다", () => {
    const bundle = proposeSceneLightingTop3({ dialogue: "노을이 예쁘다~", scenePresetId: "sunset-classroom", timeOfDay: "golden-hour" });
    const s0 = createLightingSession();
    const sPrev = previewLightingProposal(s0, bundle.proposals[0]);
    const sTweak = tweakLightingRig(sPrev, { keyKelvin: 3900 });
    expect(sTweak.currentRig.keyLight.kelvin).toBe(3900);
    expect(sTweak.currentRig.rimLight.pigmentNameKo).toBe(bundle.proposals[0].rig.rimLight.pigmentNameKo);
    expect(sTweak.baselineRig).toEqual(s0.baselineRig);
    expect(sTweak.canRevert).toBe(true);
  });

  it("compareLightingCuts와 updateLightingPreviousCut이 동일 컷과 급격한 전환을 정확히 판별한다", () => {
    const coldRain = getPreviousCutLightingPreset("cold-rain").rig;
    const warmSunset = getPreviousCutLightingPreset("warm-sunset").rig;
    const sameComp = compareLightingCuts(coldRain, coldRain);
    expect(sameComp.continuityScore).toBe(100);
    expect(sameComp.shiftSeverity).toBe("smooth");

    const jumpComp = compareLightingCuts(warmSunset, coldRain);
    expect(jumpComp.keyKelvinDeltaK).toBeGreaterThan(2500);
    expect(jumpComp.continuityScore).toBeLessThan(55);
    expect(["notice", "dramatic-shift"]).toContain(jumpComp.shiftSeverity);

    const updated = updateLightingPreviousCut(createLightingSession(), coldRain);
    expect(updated.previousCutRig).toEqual(coldRain);
  });

  it("exportLightingRigJson이 Three.js 및 Blender 연동용 결정론적 JSON을 생성한다", () => {
    const bundle = proposeSceneLightingTop3({ dialogue: "여기서 끝내자.", scenePresetId: "rooftop-rain", timeOfDay: "rainy-dusk" });
    const session = applyLightingProposal(createLightingSession(), bundle.proposals[0]);
    const jsonA = exportLightingRigJson(session, bundle);
    const jsonB = exportLightingRigJson(session, bundle);
    expect(jsonA).toBe(jsonB);

    const parsed = JSON.parse(jsonA) as {
      schema: string;
      violetSlopPct: number;
      requiresAuthorApproval: boolean;
      threeJs: { keyDirectionalLight: { position: number[]; colorOklch: string }; fogExp2: { density: number } };
      blender: { keySunOrArea: { energyWatts: number; blackbodyKelvin: number }; worldVolumeScatter: { density: number } };
      readabilityAudit: { faceContrastRatio: number };
      previousCutComparison: { continuityScore: number };
    };
    expect(parsed.schema).toBe("toonstudio.scene-lighting-rig.v1");
    expect(parsed.violetSlopPct).toBe(0);
    expect(parsed.requiresAuthorApproval).toBe(true);
    expect(parsed.threeJs.keyDirectionalLight.position).toHaveLength(3);
    expect(parsed.threeJs.keyDirectionalLight.colorOklch).toMatch(/^oklch\(/u);
    expect(parsed.blender.keySunOrArea.energyWatts).toBeGreaterThan(0);
    expect(parsed.readabilityAudit.faceContrastRatio).toBeGreaterThan(1);
    expect(parsed.previousCutComparison.continuityScore).toBeGreaterThanOrEqual(0);
  });
});

describe("6. StudioSceneLightingAdvisorPanel UI · 인터랙션 · 접근성 검증", () => {
  it("props 없이 렌더되며 작가 승인 배지·6대 장면 프리셋·6대 시간대·Top-3 카드·SVG 2종이 표시된다", () => {
    render(<StudioSceneLightingAdvisorPanel />);
    expect(screen.getByTestId("studio-scene-lighting-advisor-panel")).toBeTruthy();
    expect(screen.getByTestId("lighting-approval-badge").textContent).toContain("작가 승인 후 적용");
    expect(screen.getByTestId("lighting-session-status-badge").textContent).toContain("원본 유지 중");
    expect(screen.getByTestId("lighting-topview-svg").getAttribute("data-violet-free")).toBe("true");
    expect(screen.getByTestId("lighting-mood-preview-svg")).toBeTruthy();

    for (const preset of SCENE_LOCATION_PRESETS) {
      expect(screen.getByTestId(`lighting-scene-preset-${preset.id}`)).toBeTruthy();
    }
    for (const tod of SCENE_TIME_OF_DAY_PRESETS) {
      expect(screen.getByTestId(`lighting-time-${tod.id}`)).toBeTruthy();
    }
    expect(screen.getByTestId("lighting-proposal-card-1")).toBeTruthy();
    expect(screen.getByTestId("lighting-proposal-card-2")).toBeTruthy();
    expect(screen.getByTestId("lighting-proposal-card-3")).toBeTruthy();
    expect((screen.getByTestId("lighting-revert-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("6대 빠른 장면 프리셋 버튼 클릭 시 대사·감정·시간대가 즉시 전환된다", () => {
    render(<StudioSceneLightingAdvisorPanel />);
    fireEvent.click(screen.getByTestId("lighting-scene-preset-sunset-classroom"));
    expect((screen.getByTestId("lighting-dialogue-input") as HTMLTextAreaElement).value).toContain("노을");
    expect(screen.getByTestId("lighting-detected-emotion").textContent).toContain("설렘");
    expect(screen.getByTestId("lighting-time-golden-hour").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("lighting-scene-preset-chase-alley"));
    expect(screen.getByTestId("lighting-detected-emotion").textContent).toContain("서스펜스");
  });

  it("대사 직접 입력과 시간대 변경 시 감정 분석과 제안 카드가 실시간 갱신된다", () => {
    render(<StudioSceneLightingAdvisorPanel />);
    fireEvent.change(screen.getByTestId("lighting-dialogue-input"), {
      target: { value: "드디어 해냈어! 승리의 축배를 들어, 축하하자!" },
    });
    fireEvent.click(screen.getByTestId("lighting-time-day"));
    expect(screen.getByTestId("lighting-detected-emotion").textContent).toContain("환희");
    expect(screen.getByTestId("lighting-proposal-card-1").textContent).toContain("환희");
  });

  it("미리보기(onApply 미호출) → 1클릭 적용(onApply 호출) → 원클릭 되돌리기(onRevert 호출)가 동작한다", () => {
    const onApply = vi.fn();
    const onRevert = vi.fn();
    render(<StudioSceneLightingAdvisorPanel onApply={onApply} onRevert={onRevert} />);

    fireEvent.click(screen.getByTestId("lighting-preview-btn-1"));
    expect(screen.getByTestId("lighting-session-status-badge").textContent).toContain("미리보기");
    expect(screen.getByTestId("lighting-active-rig-label").textContent).toContain("미리보기");
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("lighting-apply-btn-1"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("lighting-session-status-badge").textContent).toContain("비파괴 적용됨");
    expect((screen.getByTestId("lighting-revert-btn") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("lighting-card-revert-btn-1"));
    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("lighting-session-status-badge").textContent).toContain("되돌림");
    expect((screen.getByTestId("lighting-revert-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("키·필·림 미세 슬라이더 조작 시 SVG 색온도·수치가 즉시 반영되고 되돌리기가 활성화된다", () => {
    render(<StudioSceneLightingAdvisorPanel />);
    fireEvent.change(screen.getByTestId("lighting-slider-key-kelvin"), { target: { value: "3200" } });
    expect(screen.getByTestId("lighting-slider-key-kelvin-readout").textContent).toBe("3200K");
    expect(screen.getByTestId("lighting-topview-svg").getAttribute("data-key-kelvin")).toBe("3200");
    expect(screen.getByTestId("lighting-session-status-badge").textContent).toContain("미세 조정");
    expect((screen.getByTestId("lighting-revert-btn") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(screen.getByTestId("lighting-slider-rim-intensity"), { target: { value: "2.1" } });
    expect(screen.getByTestId("lighting-slider-rim-intensity-readout").textContent).toBe("2.10");
  });

  it("전 컷 비교 전환, 3D 릭 JSON 미리보기·복사 및 영문 로케일 렌더가 정상 동작한다", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const onExportJson = vi.fn();
    render(<StudioSceneLightingAdvisorPanel locale="en" onExportJson={onExportJson} />);
    expect(screen.getByTestId("lighting-approval-badge").textContent).toContain("Author Approval Required");
    expect(screen.queryByTestId("lighting-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("lighting-prev-cut-neon-night"));
    expect(screen.getByTestId("lighting-prev-cut-neon-night").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("lighting-cut-compare-summary").textContent).toContain("Key");

    fireEvent.click(screen.getByTestId("lighting-copy-json-btn"));
    expect(write).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onExportJson).toHaveBeenCalledTimes(1));
    expect(onExportJson.mock.calls[0]?.[0]).toContain("toonstudio.scene-lighting-rig.v1");
    expect(screen.getByTestId("lighting-json-preview").textContent).toContain('"threeJs"');

    fireEvent.click(screen.getByTestId("lighting-toggle-json-btn"));
    expect(screen.queryByTestId("lighting-json-preview")).toBeNull();
  });
});

describe("7. 엄격 품질·하네스 계약 및 Calm Atelier 자가 검증", () => {
  it("소유 파일 존재, 전 파일 800줄 이하 및 금지 패턴(원시 색·transition-all·= {}·스토리지·private Map store·BigInt·Sparkles) 0건", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "scene-lighting-advisor-engine.ts",
      "StudioSceneLightingAdvisorPanel.tsx",
      "index.ts",
      "scene-lighting-advisor.test.tsx",
      "lighting-boundaries.test.tsx", "lighting-input-contract.ts", "use-lighting-copy.ts",
      "use-lighting-notification.ts", "LightingOperationStatus.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect([...allFiles].sort()).toEqual([...requiredFiles].sort());
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);

      if (file !== "scene-lighting-advisor.test.tsx") {
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
      }

      if (file === "StudioSceneLightingAdvisorPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
        expect(src).toContain("작가 승인 후 적용");
      }
    }
  });

  it("렌더된 모든 버튼이 min-h-11을 유지하고 SVG 속성에 raw hex/rgb/hsl 및 바이올렛 휴(270~320°)가 0건이다", () => {
    const { container } = render(<StudioSceneLightingAdvisorPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(20);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(2);
    for (const svg of svgs) {
      const html = svg.outerHTML;
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(html).not.toMatch(/\brgba?\s*\(/iu);
      expect(html).not.toMatch(/\bhsla?\s*\(/iu);
      const oklchMatches = html.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu);
      for (const m of oklchMatches) {
        const hue = Number(m[1]);
        expect(isVioletSlopHue(hue)).toBe(false);
      }
    }
  });
});
