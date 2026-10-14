import { describe, expect, it } from "vitest";

import {
  buildStcShaperDraft,
  createManualStcProfile,
  createStcFlowState,
  resolveStcProfile,
  stcFeaturesNeedingReview,
  stcFlowAdvance,
  stcFlowBack,
  stcFlowHandOff,
  stcFlowPatchProfile,
  stcFlowSetPhoto,
  stcFlowSetProfile,
  stcFlowSetRightsConfirmed,
  STC_FACE_LIMITS,
  STC_FACE_SHAPE_BASE,
  STC_FACE_SHAPE_ENTRY_IDS,
  validateStcPhoto,
  validateStcProfile,
} from "./stc-guided-flow";

import type { StcFaceAnalysisProvider, StcFaceFeatureProfile, StcPhotoMeta } from "./stc-guided-flow";

const GOOD_PHOTO: StcPhotoMeta = {
  fileName: "face.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 800_000,
  width: 1200,
  height: 1200,
};

function readyPhotoState() {
  const withPhoto = stcFlowSetPhoto(createStcFlowState(), { meta: GOOD_PHOTO, previewRef: "blob:test" });
  return stcFlowSetRightsConfirmed(withPhoto, true);
}

const PROVIDER_PROFILE: StcFaceFeatureProfile = {
  ...createManualStcProfile(),
  faceShape: "oval",
  eyeSize: "high",
  eyeTilt: "up",
  hairStyle: "long",
  hairColor: "#1c1c1e",
  source: "provider",
  confidence: { faceShape: 0.9, hairColor: 0.4 },
};

describe("validateStcPhoto", () => {
  it("정상 사진은 차단 이슈가 없다", () => {
    expect(validateStcPhoto(GOOD_PHOTO).filter((issue) => issue.blocking)).toEqual([]);
  });

  it("이미지가 아니면 막는다", () => {
    const issues = validateStcPhoto({ ...GOOD_PHOTO, mimeType: "application/pdf" });
    expect(issues.some((issue) => issue.code === "not-image" && issue.blocking)).toBe(true);
  });

  it("12MB 초과와 너무 작은 사진은 막고, 애매하게 작은 사진은 경고만 한다", () => {
    expect(validateStcPhoto({ ...GOOD_PHOTO, sizeBytes: 13 * 1024 * 1024 }).some((i) => i.blocking)).toBe(true);
    expect(validateStcPhoto({ ...GOOD_PHOTO, width: 100, height: 100 }).some((i) => i.blocking)).toBe(true);
    const warn = validateStcPhoto({ ...GOOD_PHOTO, width: 320, height: 320 });
    expect(warn.length).toBeGreaterThan(0);
    expect(warn.every((issue) => !issue.blocking)).toBe(true);
  });
});

describe("흐름 상태기계", () => {
  it("사진과 권리 확인 없이는 특징 단계로 넘어가지 않는다", () => {
    const empty = stcFlowAdvance(createStcFlowState());
    expect(empty.ok).toBe(false);
    const photoOnly = stcFlowAdvance(stcFlowSetPhoto(createStcFlowState(), { meta: GOOD_PHOTO, previewRef: "blob:x" }));
    expect(photoOnly.ok).toBe(false);
    if (!photoOnly.ok) expect(photoOnly.reason).toContain("동의");
  });

  it("사진→특징→초안 순서로만 전진하고, 뒤로 가기는 자유롭다", () => {
    const step2 = stcFlowAdvance(readyPhotoState());
    expect(step2.ok).toBe(true);
    if (!step2.ok) return;
    expect(step2.state.step).toBe("features");
    const step3 = stcFlowAdvance(step2.state);
    expect(step3.ok).toBe(true);
    if (!step3.ok) return;
    expect(step3.state.step).toBe("draft");
    expect(step3.state.draft).not.toBeNull();
    expect(stcFlowBack(step3.state).step).toBe("features");
    expect(stcFlowBack(step2.state).step).toBe("photo");
  });

  it("특징을 바꾸면 낡은 초안은 버려진다", () => {
    const step2 = stcFlowAdvance(readyPhotoState());
    if (!step2.ok) throw new Error("advance failed");
    const step3 = stcFlowAdvance(step2.state);
    if (!step3.ok) throw new Error("advance failed");
    const patched = stcFlowPatchProfile(step3.state, { faceShape: "round" });
    expect(patched.draft).toBeNull();
    expect(patched.handedOff).toBe(false);
  });

  it("사진을 바꾸면 특징·초안이 초기화된다", () => {
    const withProfile = stcFlowSetProfile(readyPhotoState(), PROVIDER_PROFILE);
    const replaced = stcFlowSetPhoto(withProfile, { meta: GOOD_PHOTO, previewRef: "blob:new" });
    expect(replaced.profile.source).toBe("manual");
    expect(replaced.draft).toBeNull();
    expect(replaced.step).toBe("photo");
  });

  it("전달은 초안 단계에서만 성공하고 초안을 그대로 돌려준다", () => {
    expect(stcFlowHandOff(createStcFlowState()).ok).toBe(false);
    const step2 = stcFlowAdvance(readyPhotoState());
    if (!step2.ok) throw new Error("advance failed");
    const step3 = stcFlowAdvance(step2.state);
    if (!step3.ok) throw new Error("advance failed");
    const handed = stcFlowHandOff(step3.state);
    expect(handed.ok).toBe(true);
    if (!handed.ok) return;
    expect(handed.draft).toBe(step3.state.draft);
    expect(handed.state.handedOff).toBe(true);
  });
});

describe("buildStcShaperDraft", () => {
  it("얼굴형 기본값은 셰이퍼 카탈로그 항목 id와 짝을 이룬다", () => {
    for (const kind of Object.keys(STC_FACE_SHAPE_BASE) as (keyof typeof STC_FACE_SHAPE_BASE)[]) {
      expect(STC_FACE_SHAPE_ENTRY_IDS[kind]).toBe(`face-shape:${kind === "angular" ? "angular" : kind}`);
      const draft = buildStcShaperDraft({ ...createManualStcProfile(), faceShape: kind, cheekFullness: STC_FACE_SHAPE_BASE[kind].cheekVolume, chinPointedness: 0.5 });
      // 보정이 중립이면 초안 얼굴은 카탈로그 기본값과 같다.
      expect(draft.face.headWidth).toBeCloseTo(STC_FACE_SHAPE_BASE[kind].headWidth, 6);
      expect(draft.face.chinLength).toBeCloseTo(STC_FACE_SHAPE_BASE[kind].chinLength, 6);
    }
  });

  it("초안 얼굴은 항상 Avatar Forge 한계 안에 있다", () => {
    const extreme = buildStcShaperDraft({
      ...createManualStcProfile(),
      faceShape: "round",
      cheekFullness: 1,
      chinPointedness: 1,
    });
    for (const key of Object.keys(STC_FACE_LIMITS) as (keyof typeof STC_FACE_LIMITS)[]) {
      expect(extreme.face[key]).toBeGreaterThanOrEqual(STC_FACE_LIMITS[key].min);
      expect(extreme.face[key]).toBeLessThanOrEqual(STC_FACE_LIMITS[key].max);
    }
  });

  it("특징이 형태소로 결정적으로 변환되고 0인 항목은 빠진다", () => {
    const draft = buildStcShaperDraft(PROVIDER_PROFILE);
    expect(draft.semanticMorphs.eyeSize).toBeCloseTo(0.5);
    expect(draft.semanticMorphs.eyeTilt).toBeCloseTo(0.55);
    expect(draft.semanticMorphs.irisSize).toBeCloseTo(0.3);
    expect(draft.semanticMorphs.noseHeight).toBeUndefined();
    expect(buildStcShaperDraft(PROVIDER_PROFILE)).toEqual(draft);
  });

  it("색상은 소문자 hex로 정규화되어 레시피 색상 자리에 실린다", () => {
    const draft = buildStcShaperDraft({ ...createManualStcProfile(), hairColor: "#AABBCC", irisColor: "#112233" });
    expect(draft.hair.baseColor).toBe("#aabbcc");
    expect(draft.colors.iris).toBe("#112233");
    expect(draft.hair.tipColor).toBe(draft.hair.baseColor);
  });

  it("신뢰도가 낮은 항목은 needsReview와 요약에 정직하게 드러난다", () => {
    expect(stcFeaturesNeedingReview(PROVIDER_PROFILE)).toEqual(["머리카락 색"]);
    expect(stcFeaturesNeedingReview(createManualStcProfile())).toEqual([]);
    const draft = buildStcShaperDraft(PROVIDER_PROFILE);
    expect(draft.needsReview).toEqual(["머리카락 색"]);
    expect(draft.summary.some((line) => line.includes("자동 분석"))).toBe(true);
    const manualDraft = buildStcShaperDraft(createManualStcProfile());
    expect(manualDraft.summary.some((line) => line.includes("자동 분석 없이"))).toBe(true);
  });
});

describe("resolveStcProfile — 제공자 분리·폴백 정직성", () => {
  it("제공자가 없으면 지어내지 않고 수동 프로필로 폴백한다", async () => {
    const outcome = await resolveStcProfile(null, "blob:x");
    expect(outcome.kind).toBe("manual");
    if (outcome.kind !== "manual") return;
    expect(outcome.reason).toBe("no-provider");
    expect(outcome.profile).toEqual(createManualStcProfile());
  });

  it("제공자가 실패하거나 스키마 밖 값을 주면 수동으로 폴백한다", async () => {
    const failing: StcFaceAnalysisProvider = {
      id: "stub-fail",
      analyze: async () => null,
    };
    const failed = await resolveStcProfile(failing, "blob:x");
    expect(failed.kind).toBe("manual");
    if (failed.kind === "manual") expect(failed.reason).toBe("provider-failed");

    const invalid: StcFaceAnalysisProvider = {
      id: "stub-invalid",
      analyze: async () => ({ ...PROVIDER_PROFILE, hairColor: "not-a-color" }),
    };
    const invalidOutcome = await resolveStcProfile(invalid, "blob:x");
    expect(invalidOutcome.kind).toBe("manual");
    if (invalidOutcome.kind === "manual") expect(invalidOutcome.reason).toBe("invalid-profile");
  });

  it("정상 제공자 결과는 그대로 통과한다", async () => {
    const ok: StcFaceAnalysisProvider = { id: "stub-ok", analyze: async () => PROVIDER_PROFILE };
    const outcome = await resolveStcProfile(ok, "blob:x");
    expect(outcome.kind).toBe("provider");
    if (outcome.kind === "provider") expect(outcome.profile).toBe(PROVIDER_PROFILE);
  });

  it("프로필 검증은 잘못된 색상·범위 밖 값을 잡는다", () => {
    expect(validateStcProfile(createManualStcProfile())).toEqual([]);
    expect(validateStcProfile({ ...createManualStcProfile(), skinTone: "red" }).length).toBeGreaterThan(0);
    expect(validateStcProfile({ ...createManualStcProfile(), cheekFullness: 2 }).length).toBeGreaterThan(0);
  });
});
