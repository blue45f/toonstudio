import { describe, expect, it } from "vitest";

import {
  compareAnchorFeatures,
  oklchDeltaE,
  registerCanonicalCharacterProfile,
  srgbToOklch,
} from "./anchor-consistency-compare";
import {
  scanEpisodeCharacterConsistency,
  scoreEpisodeCutsAgainstAnchors,
  toggleIntentionalLightingException,
} from "./anchor-consistency-score";
import type {
  EpisodeCutConsistencyInput,
  OklchColor,
} from "./anchor-episode-consistency-auditor";
import { extractAnchorFeatures } from "./anchor-image-features";
import {
  FIGURE_STYLE_A,
  figureRaster,
  flipRasterHorizontally,
} from "./anchor-synthetic-raster";

function buildHeroProfile() {
  return registerCanonicalCharacterProfile({
    profileId: "hero-sora-v1",
    characterId: "char-sora",
    characterNameKo: "소라",
    palette: [
      { slot: "skin", target: "#f0c9b0", maxDeltaE: 0.085 },
      { slot: "hair", target: "#2c3a58", maxDeltaE: 0.09 },
      { slot: "eyes", target: "#3f7d58", maxDeltaE: 0.09 },
      { slot: "outfit", target: "#b43c44", maxDeltaE: 0.095 },
    ],
    asymmetricAnchors: [
      { id: "scar-cheek", kind: "scar", labelKo: "왼쪽 볼 흉터", expectedSide: "left" },
      { id: "earring-star", kind: "earring", labelKo: "오른쪽 별 귀걸이", expectedSide: "right" },
      { id: "eyepatch-black", kind: "eyepatch", labelKo: "왼쪽 안대", expectedSide: "left" },
      { id: "mole-chin", kind: "mole", labelKo: "오른쪽 턱 점", expectedSide: "right" },
    ],
  });
}

function normalObservedAnchors() {
  return [
    { anchorId: "scar-cheek", observedSide: "left" as const },
    { anchorId: "earring-star", observedSide: "right" as const },
    { anchorId: "eyepatch-black", observedSide: "left" as const },
    { anchorId: "mole-chin", observedSide: "right" as const },
  ];
}

describe("60컷 캐릭터 일관성 자동 검수관 (#126–#130)", () => {
  it("OKLCH 변환·거리 계산 및 필수 4슬롯(피부/머리/눈/복장) 등록 검증이 결정적으로 동작한다", () => {
    const a = srgbToOklch(240, 201, 176);
    const b = srgbToOklch(240, 201, 176);
    const c = srgbToOklch(40, 120, 230);
    expect(oklchDeltaE(a, b)).toBe(0);
    expect(oklchDeltaE(a, c)).toBeGreaterThan(0.2);

    expect(() =>
      registerCanonicalCharacterProfile({
        characterId: "bad",
        characterNameKo: "미완성",
        palette: [{ slot: "skin", target: "#f0c9b0" }],
      }),
    ).toThrow(/누락/);
  });

  it("합성 60컷 회귀 스캔: 회상 세피아·흑백·역광 실루엣 오탐 0건 + 실제 팔레트 이탈·좌우 반전 100% 탐지", () => {
    const profile = buildHeroProfile();
    const canonicalSlots = {
      skin: profile.paletteRanges.skin.target,
      hair: profile.paletteRanges.hair.target,
      eyes: profile.paletteRanges.eyes.target,
      outfit: profile.paletteRanges.outfit.target,
    };

    const sepiaSlots: Record<"skin" | "hair" | "eyes" | "outfit", OklchColor> = {
      skin: { l: 0.78, c: 0.06, h: 72 },
      hair: { l: 0.34, c: 0.04, h: 68 },
      eyes: { l: 0.48, c: 0.05, h: 76 },
      outfit: { l: 0.52, c: 0.07, h: 64 },
    };

    const monoSlots: Record<"skin" | "hair" | "eyes" | "outfit", OklchColor> = {
      skin: { l: 0.82, c: 0.005, h: 0 },
      hair: { l: 0.32, c: 0.004, h: 0 },
      eyes: { l: 0.52, c: 0.006, h: 0 },
      outfit: { l: 0.48, c: 0.005, h: 0 },
    };

    const backlitSlots: Record<"skin" | "hair" | "eyes" | "outfit", OklchColor> = {
      skin: { l: 0.22, c: 0.03, h: 250 },
      hair: { l: 0.14, c: 0.02, h: 250 },
      eyes: { l: 0.19, c: 0.03, h: 245 },
      outfit: { l: 0.16, c: 0.02, h: 255 },
    };

    const cuts: EpisodeCutConsistencyInput[] = [];
    for (let i = 1; i <= 60; i += 1) {
      const cutId = `ep1-cut-${String(i).padStart(2, "0")}`;
      if (i >= 11 && i <= 15) {
        // 5컷: 회상 세피아 (#130)
        cuts.push({
          cutId,
          cutIndex: i,
          moodTag: "flashback-sepia",
          sampledSlots: sepiaSlots,
          observedAnchors: normalObservedAnchors(),
        });
      } else if (i >= 21 && i <= 24) {
        // 4컷: 흑백 모노크롬 (#130)
        cuts.push({
          cutId,
          cutIndex: i,
          moodTag: "monochrome",
          sampledSlots: monoSlots,
          observedAnchors: normalObservedAnchors(),
        });
      } else if (i >= 31 && i <= 34) {
        // 4컷: 역광 실루엣 (#130 — 미세 점 누락/가림도 허용)
        cuts.push({
          cutId,
          cutIndex: i,
          moodTag: "backlit-silhouette",
          sampledSlots: backlitSlots,
          observedAnchors: [
            { anchorId: "scar-cheek", observedSide: "occluded" },
            { anchorId: "earring-star", observedSide: "right" },
            { anchorId: "eyepatch-black", observedSide: "left" },
            { anchorId: "mole-chin", observedSide: "missing" },
          ],
        });
      } else if (i === 40) {
        // 1컷: 실제 팔레트 이탈 결함 (남색 머리가 형광 초록으로 튐)
        cuts.push({
          cutId,
          cutIndex: i,
          sampledSlots: { ...canonicalSlots, hair: "#32e868" },
          observedAnchors: normalObservedAnchors(),
        });
      } else if (i === 45) {
        // 1컷: 실제 복장 팔레트 이탈 결함 (붉은 복장이 시안으로 튐)
        cuts.push({
          cutId,
          cutIndex: i,
          sampledSlots: { ...canonicalSlots, outfit: "#16c8d8" },
          observedAnchors: normalObservedAnchors(),
        });
      } else if (i === 50 || i === 51) {
        // 2컷: 극적인 붉은 석양 조명(의도적 조명 변화 무시 대상)
        cuts.push({
          cutId,
          cutIndex: i,
          sampledSlots: {
            skin: "#e88462",
            hair: "#582438",
            eyes: "#6e4e34",
            outfit: "#d84824",
          },
          observedAnchors: normalObservedAnchors(),
        });
      } else if (i === 55) {
        // 1컷: 좌우 비대칭 결함 (왼쪽 볼 흉터 + 왼쪽 안대가 오른쪽으로 좌우 반전)
        cuts.push({
          cutId,
          cutIndex: i,
          sampledSlots: canonicalSlots,
          observedAnchors: [
            { anchorId: "scar-cheek", observedSide: "right" },
            { anchorId: "earring-star", observedSide: "left" },
            { anchorId: "eyepatch-black", observedSide: "right" },
            { anchorId: "mole-chin", observedSide: "left" },
          ],
        });
      } else {
        // 나머지 42컷: 정상 정본 범위 (미세 변동 포함)
        const jitter = ((i % 5) - 2) * 0.008;
        cuts.push({
          cutId,
          cutIndex: i,
          sampledSlots: {
            skin: { ...canonicalSlots.skin, l: canonicalSlots.skin.l + jitter },
            hair: { ...canonicalSlots.hair, l: canonicalSlots.hair.l - jitter },
            eyes: canonicalSlots.eyes,
            outfit: canonicalSlots.outfit,
          },
          observedAnchors: normalObservedAnchors(),
        });
      }
    }

    expect(cuts).toHaveLength(60);

    const initialReport = scanEpisodeCharacterConsistency(profile, cuts);
    expect(initialReport.totalCuts).toBe(60);

    // 13개 무드 컷(세피아 5 + 흑백 4 + 역광 4)에서 오탐 0건!
    const moodCutIds = [
      ...Array.from({ length: 5 }, (_, k) => `ep1-cut-${String(11 + k)}`),
      ...Array.from({ length: 4 }, (_, k) => `ep1-cut-${String(21 + k)}`),
      ...Array.from({ length: 4 }, (_, k) => `ep1-cut-${String(31 + k)}`),
    ];
    for (const id of moodCutIds) {
      const cutResult = initialReport.cuts.find((c) => c.cutId === id)!;
      expect(cutResult.verdict).toBe("pass");
      expect(cutResult.activePaletteDefectCount).toBe(0);
      expect(cutResult.activeAsymmetryDefectCount).toBe(0);
    }
    expect(initialReport.moodRelaxedCutCount).toBe(13);

    // 실제 결함 컷(40, 45 팔레트 이탈 + 50, 51 석양 조명 + 55 좌우 반전)만 정확히 검출
    expect(initialReport.cuts.find((c) => c.cutId === "ep1-cut-40")?.verdict).toBe("fail");
    expect(initialReport.cuts.find((c) => c.cutId === "ep1-cut-45")?.verdict).toBe("fail");
    expect(initialReport.cuts.find((c) => c.cutId === "ep1-cut-55")?.verdict).toBe("fail");
    expect(initialReport.asymmetryFlipCount).toBe(4);
    expect(initialReport.actionableIssues[0]?.category).toBe("asymmetry-flip");
    expect(initialReport.actionableIssues[0]?.cutIndex).toBe(55);

    // 1클릭 "의도적 조명 변화 무시"를 50·51컷에 적용하면 조명 오탐만 억제되고 40·45·55 결함은 유지된다.
    const step1 = toggleIntentionalLightingException(profile, cuts, "ep1-cut-50", true);
    const step2 = toggleIntentionalLightingException(profile, step1.cuts, "ep1-cut-51", true);
    expect(step2.report.lightingIgnoredCount).toBe(2);
    expect(step2.report.cuts.find((c) => c.cutId === "ep1-cut-50")?.verdict).toBe("ignored-lighting");
    expect(step2.report.cuts.find((c) => c.cutId === "ep1-cut-51")?.verdict).toBe("ignored-lighting");
    expect(step2.report.paletteDriftCount).toBe(2); // 40컷 머리 + 45컷 복장만 남음

    // 중요 불변식: 좌우 반전 결함이 있는 55컷에 "의도적 조명 변화 무시"를 켜도 좌우 반전은 절대 무시되지 않는다.
    const flipAttempt = toggleIntentionalLightingException(profile, step2.cuts, "ep1-cut-55", true);
    expect(flipAttempt.report.cuts.find((c) => c.cutId === "ep1-cut-55")?.verdict).toBe("fail");
    expect(flipAttempt.report.asymmetryFlipCount).toBe(4);
  });

  it("anchor-consistency-compare 및 anchor-consistency-score와 실제 연동되어 무드 완화·좌우 반전을 통합 평가한다", () => {
    const profile = buildHeroProfile();
    const frontAnchor = extractAnchorFeatures(figureRaster({ style: FIGURE_STYLE_A }));

    // 흑백 변형된 동일 실루엣 후보 이미지
    const monochromeCandidate = extractAnchorFeatures(
      figureRaster({
        style: {
          hair: [64, 64, 64],
          skin: [198, 198, 198],
          top: [118, 118, 118],
          bottom: [82, 82, 82],
          bag: [142, 142, 142],
        },
      }),
    );

    const normalCompare = compareAnchorFeatures(frontAnchor, monochromeCandidate);
    const monoRelaxedCompare = compareAnchorFeatures(frontAnchor, monochromeCandidate, {
      moodTag: "monochrome",
      canonicalProfile: profile,
      cutId: "mono-1",
      cutIndex: 1,
    });
    const lightingIgnoredCompare = compareAnchorFeatures(frontAnchor, monochromeCandidate, {
      ignoreIntentionalLighting: true,
    });

    // 흑백 무드 완화 및 의도적 조명 변화 무시 적용 시 색/팔레트 패널티가 줄어 참고 점수가 크게 회복된다.
    expect(monoRelaxedCompare.score).toBeGreaterThan(normalCompare.score + 0.15);
    expect(lightingIgnoredCompare.score).toBeGreaterThan(normalCompare.score + 0.2);
    expect(monoRelaxedCompare.episodeAudit?.verdict).toBe("pass");

    // 좌우 반전된 합성 래스터는 scoreEpisodeCutsAgainstAnchors에서 자동으로 좌우 반전 결함으로 포착된다.
    const flippedFeatures = extractAnchorFeatures(
      flipRasterHorizontally(figureRaster({ style: FIGURE_STYLE_A })),
    );
    const bundle = scoreEpisodeCutsAgainstAnchors({
      anchors: [{ angleId: "front", features: frontAnchor }],
      profile,
      cuts: [
        {
          cutId: "clean-1",
          cutIndex: 1,
          features: frontAnchor,
          sampledSlots: {
            skin: profile.paletteRanges.skin.target,
            hair: profile.paletteRanges.hair.target,
            eyes: profile.paletteRanges.eyes.target,
            outfit: profile.paletteRanges.outfit.target,
          },
        },
        {
          cutId: "flipped-2",
          cutIndex: 2,
          features: flippedFeatures,
          sampledSlots: {
            skin: profile.paletteRanges.skin.target,
            hair: profile.paletteRanges.hair.target,
            eyes: profile.paletteRanges.eyes.target,
            outfit: profile.paletteRanges.outfit.target,
          },
        },
      ],
    });

    expect(bundle.perCutAnchorScores).toHaveLength(2);
    expect(bundle.auditReport.cuts[0]?.verdict).toBe("pass");
    expect(bundle.auditReport.cuts[1]?.mirroredHorizontally).toBe(true);
    expect(bundle.auditReport.cuts[1]?.verdict).toBe("fail");
    expect(bundle.auditReport.asymmetryFlipCount).toBe(4);
  });
});
