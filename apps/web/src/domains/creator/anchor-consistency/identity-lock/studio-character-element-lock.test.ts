import { describe, expect, it } from "vitest";

import {
  DEFAULT_PERFORMANCE_TRANSFER_CONFIG,
  auditElementLockCompleteness,
  createCharacterElementLock,
  evaluateIdentityDriftScore,
  mapFacialPerformanceToBlendshapes,
  recordContinuityState,
  resolveCharacterMentionBinding,
  upsertAngleReference,
  type CharacterElementLockV1,
} from "./studio-character-element-lock";

function buildHeroElementLock(): CharacterElementLockV1 {
  let lock = createCharacterElementLock({
    elementId: "elem-yuna",
    characterId: "char-yuna",
    displayName: "강유나",
    mentionAliases: ["유나", "은빛 검사"],
    angleRefs: [
      {
        slot: "front",
        assetId: "asset-yuna-front",
        contentSha256: "a".repeat(64),
        width: 1024,
        height: 1536,
        capturedFrom3dStage: true,
      },
      {
        slot: "left-34",
        assetId: "asset-yuna-l34",
        contentSha256: "b".repeat(64),
        width: 1024,
        height: 1536,
        capturedFrom3dStage: true,
      },
      {
        slot: "right-34",
        assetId: "asset-yuna-r34",
        contentSha256: "c".repeat(64),
        width: 1024,
        height: 1536,
        capturedFrom3dStage: true,
      },
    ],
    asymmetricMarks: [
      {
        id: "mark-scar",
        label: "왼쪽 눈 밑 흉터",
        kind: "scar",
        bodySide: "character-left",
        requiredAngles: ["front", "left-34"],
      },
    ],
    albedoLocks: [
      { slot: "skin", l: 0.86, c: 0.04, h: 55, tolerance: 0.06 },
      { slot: "hair", l: 0.78, c: 0.03, h: 245, tolerance: 0.07 },
      { slot: "eyes", l: 0.56, c: 0.16, h: 248, tolerance: 0.08 },
      { slot: "outfit-primary", l: 0.28, c: 0.05, h: 255, tolerance: 0.08 },
    ],
    rights: {
      consentKind: "virtual-character-owned",
      confirmed: true,
      attestedAtIso: "2026-11-20T09:00:00Z",
      holderNote: "창작자 오리지널 주연 캐릭터",
    },
  });

  lock = recordContinuityState(lock, {
    episodeId: "ep-03",
    cutId: "cut-12",
    outfitStateId: "uniform-torn-sleeve",
    activeInjuries: ["오른팔 붕대"],
    activeProps: ["은검"],
    note: "옥상 결투 직후 상태",
  });
  return lock;
}

describe("studio-character-element-lock", () => {
  it("권리·동의 확인이 없으면 엘리먼트 락 생성을 차단하고, 짝이 깨진 반측 각도를 탐지한다", () => {
    expect(() =>
      createCharacterElementLock({
        elementId: "elem-bad",
        characterId: "char-bad",
        displayName: "무단 인물",
        rights: {
          consentKind: "explicit-likeness-signed",
          confirmed: false,
          attestedAtIso: "2026-11-20T09:00:00Z",
        },
      }),
    ).toThrow("동의 확인");

    const hero = buildHeroElementLock();
    expect(auditElementLockCompleteness(hero).complete).toBe(true);

    // 좌측 측면만 넣고 우측 측면을 빠뜨리면 mirror pair 경고가 발생해야 한다.
    const unbalanced = upsertAngleReference(hero, {
      slot: "left",
      assetId: "asset-yuna-left",
      contentSha256: "d".repeat(64),
      width: 1024,
      height: 1536,
      capturedFrom3dStage: true,
    });
    const audit = auditElementLockCompleteness(unbalanced);
    expect(audit.complete).toBe(false);
    expect(audit.brokenMirrorPairs).toEqual([["left", "right"]]);
  });

  it("@별칭 멘션으로 엘리먼트 락과 최신 부상·의상 연속성 원장을 정확히 바인딩한다", () => {
    const hero = buildHeroElementLock();
    const binding = resolveCharacterMentionBinding([hero], "@은빛 검사", "ep-03");
    expect(binding).not.toBeNull();
    expect(binding?.characterId).toBe("char-yuna");
    expect(binding?.referenceAssetIds).toHaveLength(3);
    expect(binding?.chiralityGuardsKo[0]).toContain("캐릭터 왼쪽");
    expect(binding?.lockedAlbedoTokens[0]).toContain("oklch(");
    expect(binding?.activeContinuity?.activeInjuries).toEqual(["오른팔 붕대"]);
  });

  it("일관성 드리프트 채점이 색상 이탈과 좌우 반전(Chirality) 위반을 구분해 권고한다", () => {
    const hero = buildHeroElementLock();

    const clean = evaluateIdentityDriftScore(hero, {
      sampledAlbedo: [
        { slot: "skin", l: 0.85, c: 0.04, h: 56 },
        { slot: "hair", l: 0.77, c: 0.03, h: 244 },
        { slot: "eyes", l: 0.57, c: 0.15, h: 249 },
        { slot: "outfit-primary", l: 0.29, c: 0.05, h: 256 },
      ],
      silhouetteSimilarity01: 0.94,
      proportionSimilarity01: 0.92,
      observedMarkSides: { "mark-scar": "character-left" },
    });
    expect(clean.recommendation).toBe("accept");
    expect(clean.overallScore).toBeGreaterThan(90);

    // 흉터가 좌우 반전되면 즉시 재생성(regenerate) 권고
    const flipped = evaluateIdentityDriftScore(hero, {
      sampledAlbedo: [
        { slot: "skin", l: 0.86, c: 0.04, h: 55 },
        { slot: "hair", l: 0.78, c: 0.03, h: 245 },
      ],
      silhouetteSimilarity01: 0.9,
      proportionSimilarity01: 0.9,
      observedMarkSides: { "mark-scar": "character-right" },
    });
    expect(flipped.chiralityViolations).toHaveLength(1);
    expect(flipped.recommendation).toBe("regenerate");

    // 형태·좌우는 정상이지만 머리색만 크게 벗어나면 팔레트 보정 권고
    const paletteOff = evaluateIdentityDriftScore(hero, {
      sampledAlbedo: [
        { slot: "skin", l: 0.86, c: 0.04, h: 55 },
        { slot: "hair", l: 0.4, c: 0.25, h: 30 },
        { slot: "eyes", l: 0.56, c: 0.16, h: 248 },
        { slot: "outfit-primary", l: 0.28, c: 0.05, h: 255 },
      ],
      silhouetteSimilarity01: 0.92,
      proportionSimilarity01: 0.92,
      observedMarkSides: { "mark-scar": "character-left" },
    });
    expect(paletteOff.paletteDrifts.some((d) => d.slot === "hair" && d.exceeded)).toBe(true);
    expect(paletteOff.recommendation).toBe("adjust-palette");
  });

  it("표정 퍼포먼스 전이 매핑이 데드존·비대칭 미소·스무딩을 처리하고 원본 영상을 미보관한다", () => {
    const first = mapFacialPerformanceToBlendshapes(
      {
        jawOpen: 0.02, // 데드존 이하 -> 0
        smileLeft: 0.2,
        smileRight: 0.85,
        browRaiseInner: 0.1,
        browFurrow: 0,
        eyeBlinkLeft: 0.9,
        eyeBlinkRight: 0.02,
        lipPucker: 0,
        headYawDeg: 18,
        headPitchDeg: -5,
        headRollDeg: 3,
        audioEnergy01: 0.5,
      },
      DEFAULT_PERFORMANCE_TRANSFER_CONFIG,
    );
    expect(first.rawVideoRetained).toBe(false);
    expect(first.aa).toBe(0);
    expect(first.blinkLeft).toBeGreaterThan(0.8);
    expect(first.blinkRight).toBe(0);
    expect(first.smileAsymmetry).toBeGreaterThan(0.4);

    // 두 번째 프레임에서 스무딩 알파가 급격한 점프를 완화한다.
    const second = mapFacialPerformanceToBlendshapes(
      {
        jawOpen: 0.8,
        smileLeft: 0,
        smileRight: 0,
        browRaiseInner: 0.8,
        browFurrow: 0,
        eyeBlinkLeft: 0,
        eyeBlinkRight: 0,
        lipPucker: 0.1,
        headYawDeg: -10,
        headPitchDeg: 10,
        headRollDeg: 0,
        audioEnergy01: 0.9,
      },
      DEFAULT_PERFORMANCE_TRANSFER_CONFIG,
      first,
    );
    expect(second.aa).toBeGreaterThan(0.4);
    expect(second.surprised).toBeGreaterThan(0.4);
    expect(second.headYawDeg).toBeLessThan(18);
    expect(second.headYawDeg).toBeGreaterThan(-10);
  });
});
