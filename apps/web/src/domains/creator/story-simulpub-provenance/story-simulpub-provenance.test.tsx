// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  auditNarrativeCausality,
  CLEAN_NARRATIVE_CAUSALITY_DATASET,
  computeDeterministicHmacSha256Hex,
  computeDeterministicSha256Hex,
  computeRectOverlapArea,
  createLocalIntegrityManifest,
  createC2paProvenanceManifest as createLegacyManifest,
  verifyC2paProvenanceManifest as verifyLegacyManifest,
  createDemoCreatorIdentity,
  createSyntheticArtworkRgba,
  cropRgbaBuffer,
  DEFAULT_NARRATIVE_CAUSALITY_DATASET,
  DEFAULT_SCROLL_EPISODE_PRESETS,
  DEFAULT_SIMULPUB_PANEL_INPUT,
  encodeCropResistantWatermark,
  evaluateScrollBeatAtPosition,
  LOCALE_EXPANSION_PROFILES,
  reflowPanelAllLocales,
  reflowPanelForLocale,
  SIMULPUB_LOCALES,
  simulateScrollPacingHeatmap,
  StudioStorySimulpubPanel,
  verifyLocalIntegrityManifest,
  verifyCropResistantWatermark,
  type NarrativeCausalityDataset,
  type SimulpubPanelLayoutInput,
} from "./index";

const MODULE_DIR = resolve(
  process.cwd(),
  "apps/web/src/domains/creator/story-simulpub-provenance",
);

describe("Wave 39D: 스토리 인과 감사관 · 5개국 리플로우 & 로컬 HMAC 예제 · 독자 스크롤 히트맵", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. 체호프의 총 복선·회수 DAG는 미회수 복선 경고·회수율·위상 정렬을 정확히 계산한다", () => {
    const report = auditNarrativeCausality(DEFAULT_NARRATIVE_CAUSALITY_DATASET);

    expect(report.chekhovSummary.totalThreads).toBe(4);
    expect(report.chekhovSummary.resolvedCount).toBe(2);
    expect(report.chekhovSummary.unresolvedCount).toBe(1);
    expect(report.chekhovSummary.invertedCount).toBe(1);
    expect(report.chekhovSummary.payoffRatePct).toBe(50);
    expect(report.dag.topologicalOrder).toHaveLength(4);
    expect(report.dag.topologicalOrder[0]).toBe("fs-silver-key");

    const unresolved = report.warnings.find((w) => w.kind === "unresolved-chekhov");
    expect(unresolved).toBeDefined();
    expect(unresolved?.targetId).toBe("fs-clock-chime");
    expect(unresolved?.severity).toBe("warning");
  });

  it("2. 복선 시간선 역전(payoff < plant, 동일 회차 역전)과 순환 인과(cycle)를 치명 경고로 감지한다", () => {
    const cyclicDataset: NarrativeCausalityDataset = {
      seriesTitleKo: "순환 테스트",
      seriesTitleEn: "Cycle Test",
      currentEpisode: 10,
      foreshadowThreads: [
        {
          id: "fs-same-ep-inv",
          titleKo: "동일 회차 역전",
          titleEn: "Same-Ep Inversion",
          descriptionKo: "회수 컷이 설치 컷보다 빠름",
          descriptionEn: "Payoff cut before plant cut",
          importance: "major",
          plantEpisode: 3,
          plantCut: 12,
          payoffEpisode: 3,
          payoffCut: 8,
        },
        {
          id: "fs-loop-a",
          titleKo: "순환 A",
          titleEn: "Loop A",
          descriptionKo: "B에 의존",
          descriptionEn: "Depends on B",
          importance: "core",
          plantEpisode: 1,
          plantCut: 2,
          payoffEpisode: 6,
          payoffCut: 5,
          dependsOnIds: ["fs-loop-b"],
        },
        {
          id: "fs-loop-b",
          titleKo: "순환 B",
          titleEn: "Loop B",
          descriptionKo: "A에 의존",
          descriptionEn: "Depends on A",
          importance: "core",
          plantEpisode: 2,
          plantCut: 4,
          payoffEpisode: 8,
          payoffCut: 7,
          dependsOnIds: ["fs-loop-a"],
        },
      ],
      secretFacts: [],
      knowledgeEvents: [],
      utterances: [],
      continuityObservations: [],
    };

    const report = auditNarrativeCausality(cyclicDataset);
    expect(report.chekhovSummary.invertedCount).toBeGreaterThanOrEqual(1);
    expect(report.chekhovSummary.cyclicCount).toBe(2);
    expect(report.dag.cycles).toHaveLength(1);
    expect(report.warnings.some((w) => w.kind === "timeline-inversion")).toBe(true);
    expect(report.warnings.some((w) => w.kind === "causal-cycle")).toBe(true);
  });

  it("3. 인물 지식 격차(Knowledge-Gap) 모순을 탐지하고 습득·공개 이후 대사는 정상 통과시킨다", () => {
    const report = auditNarrativeCausality(DEFAULT_NARRATIVE_CAUSALITY_DATASET);

    const gapWarnings = report.warnings.filter((w) => w.kind === "knowledge-gap");
    expect(gapWarnings).toHaveLength(1);
    expect(gapWarnings[0]?.severity).toBe("critical");
    expect(gapWarnings[0]?.targetId).toBe("utt-2");
    expect(gapWarnings[0]?.episode).toBe(6);

    const yunaEntry = report.knowledgeMatrix.find(
      (entry) => entry.characterId === "char-yuna" && entry.factId === "fact-vault-passcode",
    );
    expect(yunaEntry?.hasGapViolation).toBe(true);
    expect(yunaEntry?.acquiredAtEpisode).toBe(9);
    expect(yunaEntry?.firstMentionedEpisode).toBe(6);

    // 한서준은 EP.3에 목격 후 EP.4에 언급했으므로 위반 없음
    const seojunEntry = report.knowledgeMatrix.find(
      (entry) => entry.characterId === "char-seojun" && entry.factId === "fact-vault-passcode",
    );
    expect(seojunEntry?.hasGapViolation).toBe(false);
  });

  it("4. 비밀을 아직 모르는 인물이 타인에게 전달하는 연쇄 지식 누수(uninformed-informant)를 감지한다", () => {
    const leakDataset: NarrativeCausalityDataset = {
      seriesTitleKo: "전달자 모순",
      seriesTitleEn: "Informant Leak",
      currentEpisode: 8,
      foreshadowThreads: [],
      secretFacts: [
        {
          factId: "fact-secret-map",
          titleKo: "지하 비밀 통로 지도",
          titleEn: "Underground Tunnel Map",
          introducedEpisode: 2,
          introducedCut: 3,
        },
      ],
      knowledgeEvents: [
        {
          eventId: "ke-leak-1",
          characterId: "char-b",
          characterNameKo: "박지호",
          characterNameEn: "Park Jiho",
          factId: "fact-secret-map",
          episode: 4,
          cut: 10,
          channel: "told",
          sourceCharacterId: "char-a",
        },
      ],
      utterances: [],
      continuityObservations: [],
    };

    const report = auditNarrativeCausality(leakDataset);
    const informantWarning = report.warnings.find((w) => w.kind === "uninformed-informant");
    expect(informantWarning).toBeDefined();
    expect(informantWarning?.severity).toBe("critical");
  });

  it("5. 외형(흉터 좌우 반전)·핵심 소품(파손 후 복구 없는 재등장)·계절 급변 연속성 불일치를 정확히 감지한다", () => {
    const report = auditNarrativeCausality(DEFAULT_NARRATIVE_CAUSALITY_DATASET);

    expect(report.continuitySummary.scarInjuryMismatches).toBe(1);
    expect(report.continuitySummary.propMismatches).toBe(1);
    expect(report.continuitySummary.seasonMismatches).toBe(1);

    const kinds = new Set(report.warnings.map((w) => w.kind));
    expect(kinds.has("scar-injury-continuity")).toBe(true);
    expect(kinds.has("prop-continuity")).toBe(true);
    expect(kinds.has("season-continuity")).toBe(true);
  });

  it("6. 수정 완료 프리셋은 S등급·경고 0건을 기록하고 빈 데이터셋도 예외 없이 감사한다", () => {
    const clean = auditNarrativeCausality(CLEAN_NARRATIVE_CAUSALITY_DATASET);
    expect(clean.integrityScore).toBe(100);
    expect(clean.grade).toBe("S");
    expect(clean.warnings).toHaveLength(0);
    expect(clean.chekhovSummary.payoffRatePct).toBe(100);

    const empty = auditNarrativeCausality({
      seriesTitleKo: "빈 작품",
      seriesTitleEn: "Empty Series",
      currentEpisode: 1,
      foreshadowThreads: [],
      secretFacts: [],
      knowledgeEvents: [],
      utterances: [],
      continuityObservations: [],
    });
    expect(empty.integrityScore).toBe(100);
    expect(empty.dag.nodes).toHaveLength(0);
  });

  it("7. 5개국 동시 연재 리플로우는 영어 +25% · 스페인어 +32% 팽창과 일본어 세로쓰기(tategaki) 전환을 정확히 적용한다", () => {
    expect(LOCALE_EXPANSION_PROFILES.en.expansionFactor).toBe(1.25);
    expect(LOCALE_EXPANSION_PROFILES.es.expansionFactor).toBe(1.32);
    expect(LOCALE_EXPANSION_PROFILES.ja.writingMode).toBe("vertical-rl");

    const report = reflowPanelAllLocales(DEFAULT_SIMULPUB_PANEL_INPUT);
    expect(report.allLocalesZeroFaceOverlap).toBe(true);
    expect(report.totalBalloonsPerLocale).toBe(3);

    // 스페인어(+32%)와 영어(+25%) 말풍선 면적은 한국어 원본 대비 확장된다
    const koB1 = report.locales.ko.balloons[0];
    const enB1 = report.locales.en.balloons[0];
    const esB1 = report.locales.es.balloons[0];
    const jaB1 = report.locales.ja.balloons[0];

    expect(koB1).toBeDefined();
    expect(enB1).toBeDefined();
    expect(esB1).toBeDefined();
    expect(jaB1).toBeDefined();

    if (koB1 && enB1 && esB1 && jaB1) {
      const koArea = koB1.reflowedBox.width * koB1.reflowedBox.height;
      const enArea = enB1.reflowedBox.width * enB1.reflowedBox.height;
      const esArea = esB1.reflowedBox.width * esB1.reflowedBox.height;
      expect(enArea).toBeGreaterThan(koArea);
      expect(esArea).toBeGreaterThanOrEqual(enArea);
      expect(jaB1.writingMode).toBe("vertical-rl");
      expect(jaB1.reflowedBox.height).toBeGreaterThan(jaB1.reflowedBox.width);
    }
  });

  it("8. 말풍선 초기 좌표가 인물 얼굴·눈 안전 영역(faceSafeBoxes)과 정면 충돌해도 5개국 모두 0px 겹침으로 재배치한다", () => {
    const collidingInput: SimulpubPanelLayoutInput = {
      ...DEFAULT_SIMULPUB_PANEL_INPUT,
      panelId: "stress-face-collision",
      balloons: DEFAULT_SIMULPUB_PANEL_INPUT.balloons.map((b, idx) => ({
        ...b,
        // 의도적으로 얼굴·눈 박스 정중앙에 말풍선 원본 좌표를 겹쳐 배치
        baseBox:
          idx === 0
            ? { x: 260, y: 310, width: 240, height: 130 }
            : idx === 1
              ? { x: 430, y: 660, width: 220, height: 130 }
              : { x: 250, y: 270, width: 250, height: 120 },
      })),
    };

    const report = reflowPanelAllLocales(collidingInput);
    expect(report.allLocalesZeroFaceOverlap).toBe(true);

    for (const loc of SIMULPUB_LOCALES) {
      const summary = report.locales[loc];
      expect(summary.maxFaceOverlapAreaPx).toBe(0);
      expect(summary.zeroFaceOverlapGuaranteed).toBe(true);
      for (const b of summary.balloons) {
        expect(b.faceOverlapAreaPx).toBe(0);
        for (const face of collidingInput.faceSafeBoxes) {
          expect(computeRectOverlapArea(b.reflowedBox, face)).toBe(0);
        }
      }
    }
  });

  it("9. 순수 32-bit FIPS 180-4 SHA-256 · RFC 2104 HMAC-SHA256 · W3C DID 생성이 표준 테스트 벡터와 일치한다", () => {
    // FIPS 180-4 SHA-256 표준 벡터
    expect(computeDeterministicSha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(computeDeterministicSha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );

    // RFC 4231 Test Case 2 (HMAC-SHA256)
    expect(computeDeterministicHmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );

    const didA = createDemoCreatorIdentity("Atelier Han!");
    const didB = createDemoCreatorIdentity("Atelier Han!");
    expect(didA.didWeb).toBe("did:example:toonstudio.cloud:creators:atelier-han");
    expect(didA.didKey.startsWith("demo-hash:")).toBe(true);
    expect(didA.verificationMethod).toContain(`${didA.didWeb}#key-`);
    expect(didA.didKey).toBe(didB.didKey);
  });

  it("10. 로컬 HMAC 매니페스트는 원본 통과 및 원화 1바이트·메타데이터 변조를 즉시 차단한다", () => {
    const did = createDemoCreatorIdentity("seojun-studio");
    const artwork = createSyntheticArtworkRgba(64, 64);
    const seed = "creator-signing-seed-alpha";

    const manifest = createLocalIntegrityManifest({
      title: "검은 시계탑 12화",
      episodeCode: "EP.12",
      creatorDid: did,
      artworkBytes: artwork.data,
      humanStrokeCount: 980,
      aiAssistedRatio: 0.02,
      createdAtIso: "2026-11-24T09:00:00.000Z",
      doNotTrain: true,
      signingSeed: seed,
    });

    expect(manifest.claim.schemaVersion).toBe("toonstudio.local-integrity-demo.v1");
    expect(manifest.claim.assertions.trainingMining.doNotTrain).toBe(true);

    const ok = verifyLocalIntegrityManifest(manifest, artwork.data, seed, did);
    expect(ok.integrityMatches).toBe(true);
    expect(ok.c2paVerified).toBe(false);
    expect(ok.identityVerified).toBe(false);
    expect(ok.copyrightVerified).toBe(false);
    expect(manifest.c2paSupported).toBe(false);
    expect(manifest.verificationScope).toBe("local-hmac-integrity-only");
    expect(manifest.claim.inputClaimsVerified).toBe(false);
    expect(manifest.claim.dataOrigin).toBe("caller-provided-unverified");
    expect(JSON.stringify(manifest)).not.toContain("c2pa.created");
    expect(ok.reasons).toHaveLength(0);
    expect(verifyLegacyManifest(manifest, artwork.data, seed, did)).toEqual(ok);
    expect("verified" in ok).toBe(false);
    expect(createLegacyManifest({
      title: "합성", episodeCode: "demo", creatorDid: did, artworkBytes: artwork.data,
      humanStrokeCount: 0, aiAssistedRatio: 0, createdAtIso: "2026-11-25T00:00:00.000Z", signingSeed: seed,
    }).c2paSupported).toBe(false);

    // 1바이트 원화 변조 탐지
    const tamperedBytes = new Uint8ClampedArray(artwork.data);
    tamperedBytes[128] = ((tamperedBytes[128] ?? 0) + 1) & 0xff;
    const tamperedArtworkCheck = verifyLocalIntegrityManifest(manifest, tamperedBytes, seed, did);
    expect(tamperedArtworkCheck.integrityMatches).toBe(false);
    expect(tamperedArtworkCheck.assetHashMatches).toBe(false);
    expect(tamperedArtworkCheck.reasons).toContain("asset-sha256-mismatch");

    // 메타데이터 변경 및 잘못된 HMAC 키 탐지
    const tamperedManifest = {
      ...manifest,
      claim: { ...manifest.claim, title: "도용된 제목" },
    };
    const metaCheck = verifyLocalIntegrityManifest(tamperedManifest, artwork.data, seed, did);
    expect(metaCheck.integrityMatches).toBe(false);
    expect(metaCheck.claimDigestMatches).toBe(false);

    const wrongKeyCheck = verifyLocalIntegrityManifest(manifest, artwork.data, "wrong-seed", did);
    expect(wrongKeyCheck.integrityMatches).toBe(false);
    expect(wrongKeyCheck.hmacMatches).toBe(false);
  });

  it("긴 번역문을 잘라 성공으로 보고하지 않고 텍스트 넘침 상태와 전체 내용을 보존한다", () => {
    const text = "가".repeat(1000);
    const input: SimulpubPanelLayoutInput = {
      panelId: "overflow", titleKo: "넘침", titleEn: "Overflow", canvasWidth: 100, canvasHeight: 100,
      faceSafeBoxes: [], balloons: [{ balloonId: "long", speaker: "예시", fontSizePx: 16,
        baseBox: { x: 16, y: 16, width: 60, height: 36 },
        translations: { ko: text, en: text, ja: text, es: text, id: text } }],
    };
    const summary = reflowPanelForLocale(input, "ko");
    expect(summary.zeroFaceOverlapGuaranteed).toBe(true);
    expect(summary.hasTextOverflow).toBe(true);
    expect(summary.balloons[0]?.textOverflow).toBe(true);
    expect(summary.balloons[0]?.text).toBe(text);
  });

  it("고주파 이미지에서 기록할 수 없는 워터마크는 unsupported-image로 반환하고 원본을 보존한다", () => {
    const data = new Uint8ClampedArray(16 * 16 * 4);
    for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) {
      const offset = (y * 16 + x) * 4;
      data[offset + 2] = (x + y) % 2 === 0 ? 0 : 255;
      data[offset + 3] = 255;
    }
    const before = data.slice();
    const result = encodeCropResistantWatermark({ width: 16, height: 16, data }, "demo", "digest");
    expect(result.embeddingStatus).toBe("unsupported-image");
    expect(data).toEqual(before);
  });

  it("11. 비가시 워터마크 인코딩은 높은 화질(PSNR > 34dB)을 유지하며 전체 원화에서 64-bit 페이로드를 정확히 복원한다", () => {
    const artwork = createSyntheticArtworkRgba(128, 128);
    const did = createDemoCreatorIdentity("kim-author");
    const assetHash = computeDeterministicSha256Hex(artwork.data);

    const encoded = encodeCropResistantWatermark(artwork, did.didWeb, assetHash, 5);
    expect(encoded.embeddingStatus).toBe("embedded");
    expect(encoded.psnrDb).toBeGreaterThan(34);
    expect(encoded.tileCount).toBe(64);
    expect(encoded.payloadHex).toMatch(/^[0-9a-f]{16}$/);

    const verified = verifyCropResistantWatermark(encoded.watermarked, did.didWeb, assetHash);
    expect(verified.identityVerified).toBe(false);
    expect(verified.assetIntegrityVerified).toBe(false);
    expect(verified.detected).toBe(true);
    expect(verified.crcValid).toBe(true);
    expect(verified.creatorTagMatched).toBe(true);
    expect(verified.assetTagMatched).toBe(true);
    expect(verified.recoveredPayloadHex).toBe(encoded.payloadHex);
    expect(verified.detectedPhaseX).toBe(0);
    expect(verified.detectedPhaseY).toBe(0);
    const wrongCreator = verifyCropResistantWatermark(encoded.watermarked, "unrelated-demo", assetHash);
    expect(wrongCreator.crcValid).toBe(true);
    expect(wrongCreator.creatorTagMatched).toBe(false);
    expect(wrongCreator.identityVerified).toBe(false);
  });

  it("12. 임의 홀수 좌표 크롭(23,37) 및 밝기 보정(+14) 후에도 위상 재동기화로 워터마크를 복원하고 미삽입 원화는 거절한다", () => {
    const artwork = createSyntheticArtworkRgba(128, 128);
    const did = createDemoCreatorIdentity("kim-author");
    const assetHash = computeDeterministicSha256Hex(artwork.data);
    const encoded = encodeCropResistantWatermark(artwork, did.didWeb, assetHash, 5);

    // 50% 미만 크기 + 홀수 좌표 (23, 37) 크롭 -> 기대 위상 (16 - 7 = 9, 16 - 5 = 11)
    const oddCropped = cropRgbaBuffer(encoded.watermarked, 23, 37, 60, 60);
    const cropVerify = verifyCropResistantWatermark(oddCropped, did.didWeb, assetHash);
    expect(cropVerify.detected).toBe(true);
    expect(cropVerify.crcValid).toBe(true);
    expect(cropVerify.creatorTagMatched).toBe(true);
    expect(cropVerify.assetTagMatched).toBe(true);
    expect(cropVerify.recoveredPayloadHex).toBe(encoded.payloadHex);
    expect(cropVerify.detectedPhaseX).toBe(9);
    expect(cropVerify.detectedPhaseY).toBe(11);

    // 전역 밝기 +14 보정 후에도 차동 체커보드로 복원 유지
    const brightenedData = new Uint8ClampedArray(oddCropped.data.length);
    for (let i = 0; i < oddCropped.data.length; i += 4) {
      brightenedData[i] = Math.min(255, (oddCropped.data[i] ?? 0) + 14);
      brightenedData[i + 1] = Math.min(255, (oddCropped.data[i + 1] ?? 0) + 14);
      brightenedData[i + 2] = Math.min(255, (oddCropped.data[i + 2] ?? 0) + 14);
      brightenedData[i + 3] = 255;
    }
    const brightVerify = verifyCropResistantWatermark(
      { width: oddCropped.width, height: oddCropped.height, data: brightenedData },
      did.didWeb,
      assetHash,
    );
    expect(brightVerify.detected).toBe(true);
    expect(brightVerify.recoveredPayloadHex).toBe(encoded.payloadHex);

    // 워터마크가 없는 원본 버퍼는 미검출 처리
    const unwatermarkedVerify = verifyCropResistantWatermark(artwork, did.didWeb, assetHash);
    expect(unwatermarkedVerify.detected).toBe(false);
  });

  it("13. 모바일 9:16 스크롤 히트맵 시뮬레이터는 대사 벽·과밀 컷·여백 호흡 부족·이탈 위험도와 개선 처방을 산출한다", () => {
    const draft = DEFAULT_SCROLL_EPISODE_PRESETS[0];
    expect(draft).toBeDefined();
    if (!draft) return;

    const report = simulateScrollPacingHeatmap(draft);
    expect(report.aspectRatioLabel).toBe("9:16");
    expect(report.segments).toHaveLength(6);
    expect(report.wordWallPanelCount).toBeGreaterThanOrEqual(3);
    expect(report.peakDropOffRisk).toBeGreaterThanOrEqual(60);
    expect(report.cliffhangerHookScore).toBeLessThan(60);

    const suggestionKinds = new Set(report.suggestions.map((s) => s.kind));
    expect(suggestionKinds.has("break-word-wall")).toBe(true);
    expect(suggestionKinds.has("expand-gutter-breath")).toBe(true);
    expect(suggestionKinds.has("sharpen-cliffhanger")).toBe(true);
  });

  it("14. 리듬 최적화 회차(EP.12)는 대사 벽 과밀 회차(EP.02)보다 높은 클리프행어·완독 잔존율을 기록하며 빈 컷 입력을 안전 처리한다", () => {
    const draftPreset = DEFAULT_SCROLL_EPISODE_PRESETS[0];
    const tunedPreset = DEFAULT_SCROLL_EPISODE_PRESETS[1];
    expect(draftPreset).toBeDefined();
    expect(tunedPreset).toBeDefined();
    if (!draftPreset || !tunedPreset) return;

    const draft = simulateScrollPacingHeatmap(draftPreset);
    const tuned = simulateScrollPacingHeatmap(tunedPreset);

    expect(tuned.wordWallPanelCount).toBe(0);
    expect(tuned.cliffhangerHookScore).toBeGreaterThanOrEqual(80);
    expect(tuned.averageDropOffRisk).toBeLessThan(draft.averageDropOffRisk);
    expect(tuned.estimatedCompletionRetentionPct).toBeGreaterThan(
      draft.estimatedCompletionRetentionPct,
    );
    expect(tuned.overallPacingScore).toBeGreaterThan(draft.overallPacingScore);

    const empty = simulateScrollPacingHeatmap({
      episodeId: "empty-ep",
      episodeNumber: 1,
      titleKo: "빈 회차",
      titleEn: "Empty",
      panels: [],
    });
    expect(empty.panelCount).toBe(0);
    expect(empty.segments).toHaveLength(0);
    expect(empty.suggestions).toHaveLength(1);
  });

  it("15. 스크롤 비트 동기화 BGM/SFX 큐 시트와 실시간 스크럽 평가는 크로스페이드 및 정적 컷 덕킹(-14dB)을 계산한다", () => {
    const tunedPreset = DEFAULT_SCROLL_EPISODE_PRESETS[1];
    expect(tunedPreset).toBeDefined();
    if (!tunedPreset) return;

    const report = simulateScrollPacingHeatmap(tunedPreset);
    expect(report.cueSheet.schemaVersion).toBe("toonstudio.scroll-beat-cuesheet.v1");
    expect(report.cueSheet.bgmRegions.length).toBeGreaterThanOrEqual(3);
    expect(report.cueSheet.sfxBeats.length).toBeGreaterThanOrEqual(4);
    expect(JSON.parse(report.cueSheet.cueSheetJson)).toHaveProperty("bgmRegions");

    // 무대사 정적 호흡 컷(t-03: silence-drop) 근방 스크롤 시 -14dB 덕킹 트리거 확인
    const silenceBeat = report.cueSheet.sfxBeats.find((b) => b.sfxTag === "silence-drop");
    expect(silenceBeat).toBeDefined();
    if (silenceBeat) {
      const targetScrollY = Math.max(
        0,
        silenceBeat.triggerY - Math.round(report.viewportHeightPx * 0.36),
      );
      const snapshot = evaluateScrollBeatAtPosition(
        report.cueSheet,
        targetScrollY,
        report.viewportHeightPx,
      );
      expect(snapshot.activeDuckingDb).toBe(-14);
      expect(snapshot.triggeredSfxBeats.some((b) => b.sfxTag === "silence-drop")).toBe(true);
      expect(snapshot.activeBgmCues.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("16. StudioStorySimulpubPanel은 Props 없이 단독 렌더링되고 탭 1에서 모순 검출↔S등급 수정본 전환이 동작한다", () => {
    const onAudited = vi.fn();
    render(<StudioStorySimulpubPanel onCausalityAudited={onAudited} />);

    expect(screen.getByTestId("story-simulpub-provenance-panel")).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: /복선·모순 인과 감사/ }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(Number(screen.getByTestId("causality-critical-count").textContent)).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("btn-dataset-clean"));
    expect(screen.getByTestId("causality-critical-count").textContent).toBe("0");
    expect(screen.getByTestId("causality-clean-banner")).toBeTruthy();
    expect(onAudited).toHaveBeenCalledTimes(1);
  });

  it("17. 탭 2에서 일본어 세로쓰기(vertical-rl) 전환·0px 얼굴 보호 배지·합성 이미지 무결성 검사·워터마크 크롭 검증이 동작한다", () => {
    render(<StudioStorySimulpubPanel />);

    fireEvent.click(screen.getByTestId("tab-simulpub"));
    expect(screen.getByTestId("panel-simulpub")).toBeTruthy();
    expect(screen.getByText(/합성 대본·번역·96×96 이미지의 CPU 계산 예제/)).toBeTruthy();
    expect(screen.getByTestId("integrity-verify-status").textContent).toContain("C2PA 미지원");
    expect(screen.getByTestId("simulpub-face-overlap-badge").textContent).toContain("0px");

    // 일본어 전환 -> 세로쓰기(vertical-rl) 확인
    fireEvent.click(screen.getByTestId("locale-btn-ja"));
    expect(screen.getByTestId("simulpub-writing-mode").textContent).toContain("tategaki");
    expect(screen.getByTestId("reflow-balloon-b-01").getAttribute("data-writing-mode")).toBe(
      "vertical-rl",
    );

    // 스페인어 전환 -> +32% 팽창 계수 확인
    fireEvent.click(screen.getByTestId("locale-btn-es"));
    expect(screen.getByTestId("simulpub-expansion-factor").textContent).toBe("×1.32");

    // 합성 이미지 1바이트 변경 시뮬레이션 -> 검증 실패 전환 확인
    expect(screen.getByTestId("integrity-verify-status").textContent).toContain("HMAC 일치");
    fireEvent.click(screen.getByTestId("btn-toggle-tamper"));
    expect(screen.getByTestId("integrity-verify-status").textContent).toContain("무결성 불일치");

    // 크롭+밝기 모드 전환 -> 워터마크 CRC-16 복원 확인
    fireEvent.click(screen.getByTestId("btn-wm-crop-bright"));
    expect(screen.getByTestId("watermark-verify-summary").textContent).toContain("CRC-16·예시 태그 일치");
  });

  it("18. 탭 3 히트맵·스크롤 비트 슬라이더·영문 로케일 및 모듈 전체 정적 위생 규칙(800줄·무색상·무스토리지·props규칙)을 통과한다", () => {
    render(<StudioStorySimulpubPanel initialTab="heatmap" locale="en" />);

    expect(screen.getByTestId("panel-heatmap")).toBeTruthy();
    expect(Number(screen.getByTestId("heatmap-wordwall-count").textContent?.split(" ")[0])).toBeGreaterThanOrEqual(3);

    // EP.12 프리셋 전환
    fireEvent.click(screen.getByTestId("preset-episode-ep12-cliffhanger"));
    expect(screen.getByTestId("heatmap-wordwall-count").textContent).toContain("0");

    // 스크롤 슬라이더 조작
    const slider = screen.getByTestId("scroll-beat-slider");
    fireEvent.change(slider, { target: { value: "1400" } });
    expect(screen.getByTestId("scroll-beat-position").textContent).toContain("1400px");
    expect(screen.getByTestId("scroll-beat-readout")).toBeTruthy();

    // 정적 위생·구조 규칙 검증
    const files = [
      "narrative-causality-engine.ts",
      "simulpub-reflow-provenance.ts",
      "local-integrity-demo.ts",
      "scroll-pacing-heatmap-engine.ts",
      "StudioStorySimulpubPanel.tsx",
      "index.ts",
      "story-simulpub-provenance.test.tsx",
    ];
    const storageRe = new RegExp(["local", "Storage", "|", "session", "Storage"].join(""));
    const bigintHexRe = new RegExp(["0x[0-9a-fA-F]+", "n\\b"].join(""));
    const privateStoreRe = new RegExp(["private\\s+", "(?:readonly\\s+)?", "store\\b"].join(""));
    const rawColorRe = new RegExp(
      ["#[0-9a-fA-F]{3,8}\\b", "|\\brgba?\\s*\\(", "|\\bhsla?\\s*\\("].join(""),
    );

    for (const file of files) {
      const content = readFileSync(resolve(MODULE_DIR, file), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount, `${file} 800줄 이하 제한 위반`).toBeLessThanOrEqual(800);
      expect(storageRe.test(content), `${file} 브라우저 스토리지 금지 위반`).toBe(false);
      expect(bigintHexRe.test(content), `${file} 0x...n BigInt 리터럴 금지 위반`).toBe(false);
      expect(privateStoreRe.test(content), `${file} 비공개 Map 저장소 금지 위반`).toBe(false);
    }

    const panelSrc = readFileSync(resolve(MODULE_DIR, "StudioStorySimulpubPanel.tsx"), "utf8");
    expect(rawColorRe.test(panelSrc), "UI panel must contain zero raw hex/rgb/hsl colors").toBe(false);
    expect(panelSrc.includes("[word-break:keep-all]")).toBe(true);
    expect(panelSrc.includes("tabular-nums")).toBe(true);
    expect(panelSrc.includes("min-h-11")).toBe(true);
    expect(/:\s*StudioStorySimulpubPanelProps\s*=\s*\{\s*\}/.test(panelSrc)).toBe(false);
  });
});
