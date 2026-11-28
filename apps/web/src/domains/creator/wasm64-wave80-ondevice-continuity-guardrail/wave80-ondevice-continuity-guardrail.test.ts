import { describe, expect, it } from "vitest";
import {
  CONTINUITY_PIN_HIT_TARGET_PX,
  MAX_VISIBLE_CONTINUITY_PINS,
  ON_DEVICE_PRIVACY_CONTRACT,
  OnDeviceSeriesCanonIndex,
  assertOnDevicePrivacyContract,
  auditCutContinuityGuardrail,
  buildContinuityCanvasPinOverlays,
  computeLocalSha256Hex,
  computeOklchDeltaE00,
  evaluateLightingAdaptedPaletteDeltaE,
  inferAnatomicalSideFromScreen,
  isTraitVisibleFromCamera,
  resolveExpectedScreenSide,
  resolveTraitLifecycleAt,
  summarizeEpisodeContinuityReport,
  verifySeriesCanonSnapshot,
  type ContinuityAuditFinding,
  type CutContinuityAuditResult,
  type ObservedCharacterInCut,
  type SceneLightingMood,
} from "./index";

const RIGHT_EARRING_FRONT = { traitId: "right-ear-piercing", present: true, observedScreenSide: "left" as const };

function createSeriesIndex(): OnDeviceSeriesCanonIndex {
  const index = new OnDeviceSeriesCanonIndex({ seriesId: "series-seoul-noir-2026", seriesTitle: "밤의 경계선" });
  index.upsertCharacter({
    characterId: "char-seoyeon",
    displayName: "서연",
    dominantHand: "right",
    canonicalHeightCm: 164,
    traits: [
      {
        traitId: "left-cheek-scar",
        label: "흉터",
        category: "scar",
        region: "cheek",
        anatomicalSide: "left",
        introducedAt: { episodeNumber: 3, cutNumber: 14 },
        permanent: true,
      },
      {
        traitId: "right-ear-piercing",
        label: "은빛 귀걸이",
        category: "earring",
        region: "ear",
        anatomicalSide: "right",
        introducedAt: { episodeNumber: 1, cutNumber: 1 },
        permanent: false,
      },
    ],
    palette: [
      { slot: "hair", label: "머리색", oklch: { l: 0.28, c: 0.06, h: 255 } },
      { slot: "eye", label: "눈동자", oklch: { l: 0.48, c: 0.12, h: 45 } },
      { slot: "skin", label: "피부톤", oklch: { l: 0.84, c: 0.04, h: 65 } },
    ],
    proportionHistory: [
      { at: { episodeNumber: 1, cutNumber: 3 }, headToShoulderRatio: 0.72, neckLengthRatio: 0.36 },
      { at: { episodeNumber: 2, cutNumber: 5 }, headToShoulderRatio: 0.74, neckLengthRatio: 0.37 },
      { at: { episodeNumber: 3, cutNumber: 7 }, headToShoulderRatio: 0.71, neckLengthRatio: 0.35 },
      { at: { episodeNumber: 4, cutNumber: 4 }, headToShoulderRatio: 0.73, neckLengthRatio: 0.36 },
      { at: { episodeNumber: 5, cutNumber: 9 }, headToShoulderRatio: 0.72, neckLengthRatio: 0.36 },
    ],
  });
  index.upsertCharacter({
    characterId: "char-minjun",
    displayName: "민준",
    dominantHand: "left",
    canonicalHeightCm: 186,
    traits: [
      {
        traitId: "left-shoulder-tattoo",
        label: "용 문신",
        category: "tattoo",
        region: "shoulder",
        anatomicalSide: "left",
        introducedAt: { episodeNumber: 1, cutNumber: 1 },
        permanent: true,
      },
    ],
    palette: [{ slot: "hair", label: "머리색", oklch: { l: 0.22, c: 0.02, h: 260 } }],
    proportionHistory: [],
  });
  return index;
}

function auditSeoyeon(
  index: OnDeviceSeriesCanonIndex,
  ep: number,
  cut: number,
  sceneId: string,
  lightingMood: SceneLightingMood,
  overrides: Partial<ObservedCharacterInCut>,
): CutContinuityAuditResult {
  return auditCutContinuityGuardrail(index, {
    episodeNumber: ep,
    cutNumber: cut,
    sceneId,
    lightingMood,
    characters: [
      {
        characterId: "char-seoyeon",
        facingDirection: "front",
        observedTraits: [RIGHT_EARRING_FRONT],
        ...overrides,
      },
    ],
  });
}

describe("Wave 80: 100% 온디바이스 연재 작화 연속성 로컬 가드레일", () => {
  it("1. 온디바이스 제로 업로드 프라이버시 계약 불변식을 강제한다", () => {
    const index = createSeriesIndex();
    expect(index.privacyContract).toEqual(ON_DEVICE_PRIVACY_CONTRACT);
    expect(index.privacyContract.executionLocality).toBe("on-device-only");
    expect(index.privacyContract.networkEgressBytes).toBe(0);
    expect(index.privacyContract.externalModelUpload).toBe(false);
    expect(Object.isFrozen(index.privacyContract)).toBe(true);
    expect(() =>
      assertOnDevicePrivacyContract({
        executionLocality: "cloud-hybrid",
        networkEgressBytes: 128,
        externalModelUpload: true,
        telemetryUpload: false,
        storageBackend: "opfs-sqlite-local",
      }),
    ).toThrow(/제로 업로드 계약 위반/);
  });

  it("2. FIPS 180-4 SHA-256 표준 테스트 벡터를 순수 동기로 산출한다", () => {
    expect(computeLocalSha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(computeLocalSha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("3. 스냅샷 내보내기·복원이 SHA-256 체크섬과 함께 결정론적으로 왕복한다", () => {
    const index = createSeriesIndex();
    index.indexEpisodeCutState({
      episodeNumber: 4,
      cutNumber: 2,
      sceneId: "scene-alley",
      lightingMood: "rainy-night-neon",
      props: [{ propId: "prop-coat", label: "검은 코트", ownerCharacterId: "char-seoyeon", state: "torn" }],
      costumes: [{
        characterId: "char-seoyeon",
        outfitId: "outfit-winter-coat",
        outfitLabel: "겨울 롱코트",
        equippedAccessories: ["glasses", "watch"],
        accessoryLabels: { glasses: "안경", watch: "손목시계" },
      }],
    });
    index.dismissFinding("palette-color-drift:scene-alley:char-seoyeon:hair");

    const snap1 = index.exportSnapshot("2026-11-28T03:00:00.000Z");
    expect(snap1.checksumAlgorithm).toBe("SHA-256");
    expect(snap1.checksumHex).toHaveLength(64);
    expect(verifySeriesCanonSnapshot(snap1).valid).toBe(true);

    const restored = OnDeviceSeriesCanonIndex.importSnapshot(snap1);
    const snap2 = restored.exportSnapshot("2026-11-28T03:00:00.000Z");
    expect(snap2.checksumHex).toBe(snap1.checksumHex);
    expect(snap2.byteLength).toBe(snap1.byteLength);
    expect(restored.isFindingDismissed("palette-color-drift:scene-alley:char-seoyeon:hair")).toBe(true);
  });

  it("4. 변조된 스냅샷 체크섬과 바이트 길이 불일치를 차단한다", () => {
    const snap = createSeriesIndex().exportSnapshot("2026-11-28T03:00:00.000Z");
    const tampered = { ...snap, payload: { ...snap.payload, seriesTitle: "변조된 작품명" } };
    expect(verifySeriesCanonSnapshot(tampered).valid).toBe(false);
    expect(() => OnDeviceSeriesCanonIndex.importSnapshot(tampered)).toThrow(/체크섬/);
    expect(() => OnDeviceSeriesCanonIndex.importSnapshot({ ...snap, checksumHex: "0".repeat(64) })).toThrow(/체크섬/);
  });

  it("5. 타임라인 진화: 3화 14컷에 생긴 흉터는 이전 회차(2화)에서 누락으로 오탐하지 않는다", () => {
    const res = auditSeoyeon(createSeriesIndex(), 2, 8, "scene-school", "neutral-daylight", {});
    expect(res.findings).toHaveLength(0);
    expect(res.privacyContract.networkEgressBytes).toBe(0);
  });

  it("6. 타임라인 진화: 3화 14컷에 생긴 흉터가 4화 정면 컷에서 빠지면 누락을 검출한다", () => {
    const res = auditSeoyeon(createSeriesIndex(), 4, 1, "scene-office", "neutral-daylight", {});
    const missing = res.findings.find((f) => f.kind === "missing-canonical-trait");
    expect(missing?.severity).toBe("blocker");
    expect(missing?.messageKo).toContain("3화 14컷");
    expect(missing?.referenceCut).toEqual({ episodeNumber: 3, cutNumber: 14 });
    expect(missing?.suggestedFix.actionKind).toBe("restore-canonical-trait");
  });

  it("7. 타임라인 전이: 흉터가 치유(healed) 또는 은폐(concealed) 처리되면 이후 회차에서 제외한다", () => {
    const index = createSeriesIndex();
    index.recordTraitTransition("char-seoyeon", "left-cheek-scar", {
      at: { episodeNumber: 6, cutNumber: 10 },
      status: "concealed",
      reason: "컨실러 은폐",
    });
    const scar = index.getCharacter("char-seoyeon")?.traits.find((t) => t.traitId === "left-cheek-scar");
    expect(scar && resolveTraitLifecycleAt(scar, { episodeNumber: 5, cutNumber: 1 })).toBe("active");
    expect(scar && resolveTraitLifecycleAt(scar, { episodeNumber: 6, cutNumber: 10 })).toBe("concealed");
    expect(auditSeoyeon(index, 7, 2, "scene-party", "indoor-soft", {}).findings).toHaveLength(0);
  });

  it("8. 카메라 가림: 오른쪽 측면(right-profile)에서는 가려진 왼쪽 볼 흉터를 오탐하지 않는다", () => {
    const index = createSeriesIndex();
    const scar = index.getCharacter("char-seoyeon")?.traits.find((t) => t.traitId === "left-cheek-scar");
    expect(scar && isTraitVisibleFromCamera(scar, "right-profile")).toBe(false);
    expect(scar && isTraitVisibleFromCamera(scar, "left-profile")).toBe(true);
    expect(scar && isTraitVisibleFromCamera(scar, "back")).toBe(false);

    const res = auditSeoyeon(index, 4, 5, "scene-corridor", "neutral-daylight", {
      facingDirection: "right-profile",
      observedTraits: [{ traitId: "right-ear-piercing", present: true, observedAnatomicalSide: "right" }],
    });
    expect(res.findings).toHaveLength(0);
  });

  it("9. 명시적 가림(occludedRegions) 지정 시 머리카락 등으로 덮인 부위 누락 오탐을 방지한다", () => {
    const res = auditSeoyeon(createSeriesIndex(), 4, 6, "scene-wind", "neutral-daylight", {
      occludedRegions: ["cheek"],
    });
    expect(res.findings).toHaveLength(0);
  });

  it("10. 키랄성 반전: 일반 정면 컷에서 왼쪽 볼 흉터가 오른쪽 볼(화면 왼쪽)에 그려지면 검출한다", () => {
    expect(resolveExpectedScreenSide("left", "front", false)).toBe("right");
    expect(inferAnatomicalSideFromScreen("left", "front", false)).toBe("right");
    const res = auditSeoyeon(createSeriesIndex(), 4, 3, "scene-room", "neutral-daylight", {
      isMirrorReflection: false,
      observedTraits: [
        { traitId: "left-cheek-scar", present: true, observedScreenSide: "left" },
        RIGHT_EARRING_FRONT,
      ],
    });
    const flip = res.findings.find((f) => f.kind === "chirality-flip");
    expect(flip?.severity).toBe("blocker");
    expect(flip?.messageKo).toContain("3화 14컷에서 왼쪽 볼에 생긴 흉터가 이번 컷에서는 오른쪽으로 반전되었습니다");
    expect(flip?.suggestedFix.targetValue).toBe("right");
  });

  it("11. 거울 반사 샷(isMirrorReflection: true)에서는 화면 좌우가 뒤집혀도 오탐하지 않는다", () => {
    expect(resolveExpectedScreenSide("left", "front", true)).toBe("left");
    expect(inferAnatomicalSideFromScreen("left", "front", true)).toBe("left");
    const res = auditSeoyeon(createSeriesIndex(), 4, 9, "scene-mirror", "indoor-soft", {
      isMirrorReflection: true,
      observedTraits: [
        { traitId: "left-cheek-scar", present: true, observedScreenSide: "left" },
        { traitId: "right-ear-piercing", present: true, observedScreenSide: "right" },
      ],
    });
    expect(res.findings).toHaveLength(0);
  });

  it("12. 거울 반사 샷에서 반전을 깜빡해 원래 화면 위치에 그대로 그리면 오류를 검출한다", () => {
    const res = auditSeoyeon(createSeriesIndex(), 4, 10, "scene-mirror", "indoor-soft", {
      isMirrorReflection: true,
      observedTraits: [
        { traitId: "left-cheek-scar", present: true, observedScreenSide: "right" },
        { traitId: "right-ear-piercing", present: true, observedScreenSide: "right" },
      ],
    });
    expect(res.findings.some((f) => f.kind === "chirality-flip")).toBe(true);
  });

  it("13. 후면 컷(back)에서 왼쪽 어깨 문신은 화면 왼쪽이 정상, 화면 오른쪽은 반전 오류다", () => {
    const index = createSeriesIndex();
    const backOk = auditCutContinuityGuardrail(index, {
      episodeNumber: 2, cutNumber: 3, sceneId: "scene-gym", lightingMood: "neutral-daylight",
      characters: [{
        characterId: "char-minjun", facingDirection: "back",
        observedTraits: [{ traitId: "left-shoulder-tattoo", present: true, observedScreenSide: "left" }],
      }],
    });
    expect(backOk.findings).toHaveLength(0);

    const backFlip = auditCutContinuityGuardrail(index, {
      episodeNumber: 2, cutNumber: 4, sceneId: "scene-gym", lightingMood: "neutral-daylight",
      characters: [{
        characterId: "char-minjun", facingDirection: "back",
        observedTraits: [{ traitId: "left-shoulder-tattoo", present: true, observedScreenSide: "right" }],
      }],
    });
    expect(backFlip.findings.some((f) => f.kind === "chirality-flip")).toBe(true);
  });

  it("14. 지각 색차 수학: 동일 OKLCH 색상의 ΔE00은 0이고 큰 차이는 정확히 반영한다", () => {
    const darkNavy = { l: 0.28, c: 0.06, h: 255 };
    expect(computeOklchDeltaE00(darkNavy, darkNavy)).toBeCloseTo(0, 6);
    expect(computeOklchDeltaE00(darkNavy, { l: 0.85, c: 0.14, h: 95 })).toBeGreaterThan(45);
  });

  it("15. 중립 조명에서 기준 머리색·눈동자는 통과하고 틀린 채색은 palette-color-drift를 검출한다", () => {
    const index = createSeriesIndex();
    const ok = auditSeoyeon(index, 2, 1, "scene-day", "neutral-daylight", {
      observedPalette: [
        { slot: "hair", oklch: { l: 0.28, c: 0.06, h: 255 } },
        { slot: "eye", oklch: { l: 0.48, c: 0.12, h: 45 } },
      ],
    });
    expect(ok.findings).toHaveLength(0);

    const bad = auditSeoyeon(index, 2, 2, "scene-day", "neutral-daylight", {
      observedPalette: [{ slot: "hair", oklch: { l: 0.52, c: 0.18, h: 30 } }],
    });
    const drift = bad.findings.find((f) => f.kind === "palette-color-drift");
    expect(drift?.severity).toBe("blocker");
    expect(drift?.suggestedFix.targetValue).toContain("oklch(");
  });

  it("16. 노을 조명(golden-sunset)은 따뜻한 광원 틴트를 허용하되 엉뚱한 형광 연두는 검출한다", () => {
    const index = createSeriesIndex();
    const sunsetHair = { l: 0.34, c: 0.07, h: 45 };
    const evalRes = evaluateLightingAdaptedPaletteDeltaE({ l: 0.28, c: 0.06, h: 255 }, sunsetHair, "golden-sunset", 8.0);
    expect(evalRes.effectiveDeltaE00).toBeLessThanOrEqual(evalRes.effectiveThreshold);

    expect(
      auditSeoyeon(index, 2, 12, "scene-sunset", "golden-sunset", {
        observedPalette: [{ slot: "hair", oklch: sunsetHair }],
      }).findings,
    ).toHaveLength(0);

    const glaring = auditSeoyeon(index, 2, 13, "scene-sunset", "golden-sunset", {
      observedPalette: [{ slot: "hair", oklch: { l: 0.78, c: 0.24, h: 145 } }],
    });
    expect(glaring.findings.some((f) => f.kind === "palette-color-drift")).toBe(true);
  });

  it("17. 비 오는 네온 야경(rainy-night-neon) 및 흑백 회상(monochrome-flashback) 조명에 적응한다", () => {
    const index = createSeriesIndex();
    expect(
      auditSeoyeon(index, 2, 15, "scene-neon", "rainy-night-neon", {
        observedPalette: [{ slot: "hair", oklch: { l: 0.22, c: 0.11, h: 270 } }],
      }).findings,
    ).toHaveLength(0);
    expect(
      auditSeoyeon(index, 2, 16, "scene-flashback", "monochrome-flashback", {
        observedPalette: [{ slot: "eye", oklch: { l: 0.48, c: 0.0, h: 0 } }],
      }).findings,
    ).toHaveLength(0);
  });

  it("18. 작가 화풍 학습 비례 z-score: 개성 있는 SD/과장 비례를 5회차 유지하면 패널티 없이 통과한다", () => {
    const index = createSeriesIndex();
    const baseline = index.computeProportionBaseline("char-seoyeon", "headToShoulderRatio", { episodeNumber: 6, cutNumber: 1 });
    expect(baseline?.sampleCount).toBe(5);
    expect(baseline?.mean).toBeCloseTo(0.724, 3);

    const ok = auditSeoyeon(index, 6, 1, "scene-studio", "neutral-daylight", {
      observedTraits: [{ traitId: "left-cheek-scar", present: true, observedScreenSide: "right" }, RIGHT_EARRING_FRONT],
      observedProportions: { headToShoulderRatio: 0.74, neckLengthRatio: 0.37 },
    });
    expect(ok.findings).toHaveLength(0);
  });

  it("19. 작가 화풍 비례 z-score: 직전 5회차 평균 대비 갑작스러운 22% 목·어깨 비례 이탈을 검출한다", () => {
    const res = auditSeoyeon(createSeriesIndex(), 6, 2, "scene-studio", "neutral-daylight", {
      observedTraits: [{ traitId: "left-cheek-scar", present: true, observedScreenSide: "right" }, RIGHT_EARRING_FRONT],
      observedProportions: { headToShoulderRatio: 0.724 * 1.22, neckLengthRatio: 0.36 * 1.25 },
    });
    const findings = res.findings.filter((f) => f.kind === "proportion-style-drift");
    expect(findings).toHaveLength(2);
    expect(findings[0]?.messageKo).toContain("직전 5회 표본 평균");
  });

  it("20. 공동 등장 캐릭터 상대 신장 순서 역전을 검출하고 원근 예외(perspectiveOverride)는 존중한다", () => {
    const index = createSeriesIndex();
    const reversed = auditCutContinuityGuardrail(index, {
      episodeNumber: 2, cutNumber: 20, sceneId: "scene-street", lightingMood: "neutral-daylight",
      characters: [
        {
          characterId: "char-minjun", facingDirection: "front",
          observedTraits: [{ traitId: "left-shoulder-tattoo", present: true, observedScreenSide: "right" }],
          observedProportions: { screenHeightRatio: 0.52, depthLayer: 0 },
        },
        {
          characterId: "char-seoyeon", facingDirection: "front",
          observedTraits: [RIGHT_EARRING_FRONT],
          observedProportions: { screenHeightRatio: 0.64, depthLayer: 0 },
        },
      ],
    });
    expect(reversed.findings.some((f) => f.kind === "proportion-style-drift")).toBe(true);

    const overrideOk = auditCutContinuityGuardrail(index, {
      episodeNumber: 2, cutNumber: 21, sceneId: "scene-street", lightingMood: "neutral-daylight",
      characters: [
        {
          characterId: "char-minjun", facingDirection: "front",
          observedTraits: [{ traitId: "left-shoulder-tattoo", present: true, observedScreenSide: "right" }],
          observedProportions: { screenHeightRatio: 0.52, depthLayer: 0, perspectiveOverride: true },
        },
        {
          characterId: "char-seoyeon", facingDirection: "front",
          observedTraits: [RIGHT_EARRING_FRONT],
          observedProportions: { screenHeightRatio: 0.64, depthLayer: 0 },
        },
      ],
    });
    expect(overrideOk.findings).toHaveLength(0);
  });

  it("21. 소품 상태 회귀: 같은 장면에서 찢어진(torn) 코트가 수리 없이 온전함(intact)으로 되돌아가면 검출한다", () => {
    const index = createSeriesIndex();
    index.indexEpisodeCutState({
      episodeNumber: 4, cutNumber: 2, sceneId: "scene-alley", lightingMood: "rainy-night-neon",
      props: [{ propId: "prop-coat", label: "검은 코트", ownerCharacterId: "char-seoyeon", state: "torn" }],
      costumes: [],
    });
    const res = auditCutContinuityGuardrail(index, {
      episodeNumber: 4, cutNumber: 5, sceneId: "scene-alley", lightingMood: "rainy-night-neon",
      characters: [],
      props: [{ propId: "prop-coat", label: "검은 코트", ownerCharacterId: "char-seoyeon", state: "intact" }],
    });
    const f = res.findings.find((item) => item.kind === "prop-state-regression");
    expect(f?.severity).toBe("blocker");
    expect(f?.messageKo).toContain("4화 2컷");
  });

  it("22. 소품 상태: 점진적 손상(cracked→torn), 명시적 수리(repaired: true), 새 장면 전환은 허용한다", () => {
    const index = createSeriesIndex();
    index.indexEpisodeCutState({
      episodeNumber: 4, cutNumber: 2, sceneId: "scene-alley", lightingMood: "rainy-night-neon",
      props: [{ propId: "prop-sword", label: "가문의 검", state: "cracked" }],
      costumes: [],
    });
    expect(auditCutContinuityGuardrail(index, {
      episodeNumber: 4, cutNumber: 3, sceneId: "scene-alley", lightingMood: "rainy-night-neon",
      characters: [], props: [{ propId: "prop-sword", label: "가문의 검", state: "torn" }],
    }).findings).toHaveLength(0);
    expect(auditCutContinuityGuardrail(index, {
      episodeNumber: 4, cutNumber: 4, sceneId: "scene-alley", lightingMood: "rainy-night-neon",
      characters: [], props: [{ propId: "prop-sword", label: "가문의 검", state: "intact", repaired: true }],
    }).findings).toHaveLength(0);
    expect(auditCutContinuityGuardrail(index, {
      episodeNumber: 4, cutNumber: 8, sceneId: "scene-morning", lightingMood: "neutral-daylight",
      characters: [], props: [{ propId: "prop-sword", label: "가문의 검", state: "intact" }],
    }).findings).toHaveLength(0);
  });

  it("23. 장면 내 의상 불일치: 같은 장면 연속 컷에서 안경 누락과 의상 급변을 검출한다", () => {
    const index = createSeriesIndex();
    index.indexEpisodeCutState({
      episodeNumber: 2, cutNumber: 5, sceneId: "scene-cafe", lightingMood: "indoor-soft",
      props: [],
      costumes: [{
        characterId: "char-seoyeon", outfitId: "outfit-winter-coat", outfitLabel: "겨울 롱코트",
        equippedAccessories: ["glasses", "watch"], accessoryLabels: { glasses: "안경", watch: "손목시계" },
      }],
    });
    const noGlasses = auditSeoyeon(index, 2, 6, "scene-cafe", "indoor-soft", {
      observedCostume: {
        outfitId: "outfit-winter-coat", outfitLabel: "겨울 롱코트",
        equippedAccessories: ["watch"], accessoryLabels: { glasses: "안경", watch: "손목시계" },
      },
    });
    expect(noGlasses.findings.find((f) => f.kind === "costume-scene-mismatch")?.messageKo).toContain("안경");

    const outfitJump = auditSeoyeon(index, 2, 7, "scene-cafe", "indoor-soft", {
      observedCostume: { outfitId: "outfit-summer-shirt", outfitLabel: "여름 셔츠", equippedAccessories: ["glasses", "watch"] },
    });
    expect(outfitJump.findings.find((f) => f.kind === "costume-scene-mismatch")?.severity).toBe("blocker");
  });

  it("24. 의도적 연출로 무시(dismissFinding) 등록 시 반복 알림을 억제하고 복원할 수 있다", () => {
    const index = createSeriesIndex();
    const run = (): CutContinuityAuditResult =>
      auditSeoyeon(index, 4, 3, "scene-room", "neutral-daylight", {
        observedTraits: [{ traitId: "left-cheek-scar", present: true, observedScreenSide: "left" }, RIGHT_EARRING_FRONT],
      });
    const first = run();
    expect(first.findings).toHaveLength(1);
    const key = first.findings[0]?.findingKey ?? "";

    index.dismissFinding(key);
    const second = run();
    expect(second.findings).toHaveLength(0);
    expect(second.suppressedFindings).toHaveLength(1);

    expect(index.restoreFinding(key)).toBe(true);
    expect(run().findings).toHaveLength(1);
  });

  it("25. Calm Atelier 캔버스 핀 오버레이는 최대 9개 예산, 오버플로우 묶음, OKLCH 토큰, 키보드 순서를 지킨다", () => {
    const findings: ContinuityAuditFinding[] = Array.from({ length: 13 }, (_, idx) => ({
      findingKey: `synthetic:${idx}`,
      suppressionScopeKey: `synthetic-scope:${idx}`,
      kind: idx % 2 === 0 ? "chirality-flip" : "palette-color-drift",
      severity: idx < 3 ? "blocker" : idx < 8 ? "warning" : "info",
      episodeNumber: 5, cutNumber: 1, sceneId: "scene-climax",
      titleKo: `연속성 항목 ${idx + 1}`, messageKo: `안내 ${idx + 1}`, citationKo: "3화 14컷 기준",
      anchor: { x: (idx % 5) * 0.2 + 0.1, y: Math.floor(idx / 5) * 0.3 + 0.15 },
      suggestedFix: { actionKind: "restore-canonical-trait", labelKo: "원본 설정 복원" },
      dismissActionLabelKo: "의도적 연출로 무시",
    }));
    const overlay = buildContinuityCanvasPinOverlays({
      seriesId: "series-seoul-noir-2026", episodeNumber: 5, cutNumber: 1, sceneId: "scene-climax",
      lightingMood: "neutral-daylight", privacyContract: ON_DEVICE_PRIVACY_CONTRACT,
      findings, suppressedFindings: [], checkedRuleCount: 13,
    });
    expect(overlay.maxVisiblePins).toBe(MAX_VISIBLE_CONTINUITY_PINS);
    expect(overlay.visiblePinCount).toBe(9);
    expect(overlay.pins).toHaveLength(8);
    expect(overlay.overflowGroup?.groupedCount).toBe(5);
    expect(overlay.overflowGroup?.focusOrder).toBe(9);
    expect(overlay.overflowGroup?.hitTargetPx).toBe(CONTINUITY_PIN_HIT_TARGET_PX);
    expect(overlay.pins.map((p) => p.focusOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const pin of overlay.pins) {
      expect(pin.hitTargetPx).toBeGreaterThanOrEqual(44);
      expect(pin.badge.badgeBgOklch).toMatch(/^oklch\(/);
    }
  });

  it("26. 회차 프리플라이트 종합 요약이 이상 없음·확인 필요 상태를 정확히 집계한다", () => {
    const index = createSeriesIndex();
    const cleanCut = auditSeoyeon(index, 4, 1, "scene-a", "neutral-daylight", {
      observedTraits: [{ traitId: "left-cheek-scar", present: true, observedScreenSide: "right" }, RIGHT_EARRING_FRONT],
    });
    const cleanSummary = summarizeEpisodeContinuityReport(4, [cleanCut]);
    expect(cleanSummary.readinessStatus).toBe("ready");
    expect(cleanSummary.privacyContract.networkEgressBytes).toBe(0);

    const brokenCut = auditSeoyeon(index, 4, 2, "scene-a", "neutral-daylight", {
      observedTraits: [{ traitId: "left-cheek-scar", present: true, observedScreenSide: "left" }, RIGHT_EARRING_FRONT],
    });
    const mixed = summarizeEpisodeContinuityReport(4, [cleanCut, brokenCut]);
    expect(mixed.readinessStatus).toBe("needs-attention");
    expect(mixed.blockerCount).toBe(1);
    expect(mixed.byBlunderKind["chirality-flip"]).toBe(1);
    expect(mixed.headlineKo).toContain("4화 마감 전 확인 필요");
  });
});
