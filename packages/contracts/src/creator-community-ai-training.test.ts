import { describe, expect, it } from "vitest";

import {
  CREATOR_COMMUNITY_AI_TRAINING_CONSENTS,
  DEFAULT_CREATOR_COMMUNITY_AI_TRAINING_CONSENT,
  createDefaultCreatorCommunityMetadata,
  normalizeCreatorCommunityMetadata,
  parseCreatorCommunityAiTrainingConsent,
  readCreatorCommunityMetadata,
  resolveCreatorCommunityAiTraining,
  validateCreatorCommunityMetadata,
  withCreatorCommunityAiTraining,
  writeCreatorCommunityMetadata,
} from "./creator-community-publication-contract";

describe("작품·회차 AI 학습 허용 표기 계약", () => {
  it("값 어휘는 미지정·허용·불허 세 가지로 고정되고 기본값은 미지정이다", () => {
    expect([...CREATOR_COMMUNITY_AI_TRAINING_CONSENTS]).toEqual([
      "unspecified",
      "allowed",
      "prohibited",
    ]);
    expect(DEFAULT_CREATOR_COMMUNITY_AI_TRAINING_CONSENT).toBe("unspecified");
    expect(parseCreatorCommunityAiTrainingConsent("allowed")).toBe("allowed");
    expect(parseCreatorCommunityAiTrainingConsent("prohibited")).toBe("prohibited");
    expect(parseCreatorCommunityAiTrainingConsent("unspecified")).toBe("unspecified");
    for (const junk of ["yes", "ALLOWED", "", " allowed", 1, true, null, undefined, {}, []]) {
      expect(parseCreatorCommunityAiTrainingConsent(junk)).toBeNull();
    }
  });

  it("기본 메타데이터는 미지정이며 레거시 불리언도 꺼져 있다", () => {
    for (const format of ["cuttoon", "upload", undefined, "unknown-format"]) {
      const metadata = createDefaultCreatorCommunityMetadata(format);
      expect(metadata.aiTraining).toBe("unspecified");
      expect(metadata.trainingAllowed).toBe(false);
    }
  });

  it("명시한 값은 그대로 읽고 trainingAllowed는 허용일 때만 참인 파생 값이다", () => {
    expect(normalizeCreatorCommunityMetadata({ aiTraining: "allowed" })).toMatchObject({
      aiTraining: "allowed",
      trainingAllowed: true,
    });
    expect(normalizeCreatorCommunityMetadata({ aiTraining: "prohibited" })).toMatchObject({
      aiTraining: "prohibited",
      trainingAllowed: false,
    });
    expect(normalizeCreatorCommunityMetadata({ aiTraining: "unspecified" })).toMatchObject({
      aiTraining: "unspecified",
      trainingAllowed: false,
    });
  });

  it("필드가 없는 기존 게시물은 명시적으로 켠 레거시 허용만 허용으로 읽는다", () => {
    expect(resolveCreatorCommunityAiTraining({ trainingAllowed: true })).toBe("allowed");
    // 레거시 false 는 '꺼 둔 것'과 '건드리지 않은 것'을 구분할 수 없으므로 불허가 아니라 미지정이다.
    expect(resolveCreatorCommunityAiTraining({ trainingAllowed: false })).toBe("unspecified");
    expect(resolveCreatorCommunityAiTraining({})).toBe("unspecified");
    expect(readCreatorCommunityMetadata({}, { format: "upload" }).aiTraining).toBe("unspecified");
    expect(readCreatorCommunityMetadata({ community: { trainingAllowed: true } }).aiTraining)
      .toBe("allowed");
    expect(readCreatorCommunityMetadata({ community: { trainingAllowed: false } }).aiTraining)
      .toBe("unspecified");
  });

  it("근거 없는 입력은 어떤 경우에도 허용이 되지 않는다", () => {
    const junkValues: unknown[] = [
      null,
      undefined,
      0,
      1,
      "true",
      "allowed ",
      "Allowed",
      [],
      {},
      { allowed: true },
    ];
    for (const junk of junkValues) {
      expect(resolveCreatorCommunityAiTraining(junk as never)).toBe("unspecified");
      expect(resolveCreatorCommunityAiTraining({ aiTraining: junk })).toBe("unspecified");
      expect(resolveCreatorCommunityAiTraining({ trainingAllowed: junk })).toBe("unspecified");
      expect(normalizeCreatorCommunityMetadata({ aiTraining: junk, trainingAllowed: junk }).aiTraining)
        .toBe("unspecified");
    }
    expect(resolveCreatorCommunityAiTraining(null)).toBe("unspecified");
    expect(resolveCreatorCommunityAiTraining(undefined)).toBe("unspecified");
  });

  it("유효한 aiTraining 이 있으면 레거시 불리언과 어긋나도 aiTraining 이 이긴다", () => {
    expect(
      normalizeCreatorCommunityMetadata({ aiTraining: "prohibited", trainingAllowed: true }),
    ).toMatchObject({ aiTraining: "prohibited", trainingAllowed: false });
    expect(
      normalizeCreatorCommunityMetadata({ aiTraining: "allowed", trainingAllowed: false }),
    ).toMatchObject({ aiTraining: "allowed", trainingAllowed: true });
    // 알 수 없는 값이면 aiTraining 이 없는 것으로 보고 레거시 불리언으로 되돌아간다.
    expect(
      normalizeCreatorCommunityMetadata({ aiTraining: "maybe", trainingAllowed: true }),
    ).toMatchObject({ aiTraining: "allowed", trainingAllowed: true });
  });

  it("withCreatorCommunityAiTraining 은 원본을 바꾸지 않고 두 필드를 함께 맞춘다", () => {
    const base = createDefaultCreatorCommunityMetadata("upload");
    const allowed = withCreatorCommunityAiTraining(base, "allowed");
    expect(allowed).toMatchObject({ aiTraining: "allowed", trainingAllowed: true });
    expect(base).toMatchObject({ aiTraining: "unspecified", trainingAllowed: false });

    const prohibited = withCreatorCommunityAiTraining(allowed, "prohibited");
    expect(prohibited).toMatchObject({ aiTraining: "prohibited", trainingAllowed: false });
    expect(allowed.aiTraining).toBe("allowed");

    expect(
      withCreatorCommunityAiTraining(allowed, "nope" as never),
    ).toMatchObject({ aiTraining: "unspecified", trainingAllowed: false });
  });

  it("문서에 쓰고 다시 읽어도 표기가 유지되고 다른 편집기 필드를 건드리지 않는다", () => {
    const written = writeCreatorCommunityMetadata(
      { pagesList: [{ id: "page-1" }], publication: { visibility: "public" } },
      withCreatorCommunityAiTraining(createDefaultCreatorCommunityMetadata("cuttoon"), "prohibited"),
    );
    expect(written.pagesList).toEqual([{ id: "page-1" }]);
    expect(written.publication).toEqual({ visibility: "public" });
    expect(readCreatorCommunityMetadata(written).aiTraining).toBe("prohibited");

    const throughJson = JSON.parse(JSON.stringify(written)) as unknown;
    expect(readCreatorCommunityMetadata(throughJson).aiTraining).toBe("prohibited");
  });

  it("이전 릴리스 manifest(필드 없음)와 새 manifest 모두 같은 정규화 경로로 읽힌다", () => {
    const previousManifestCommunity = {
      version: 1,
      kind: "webtoon_episode",
      portfolio: false,
      provenance: "human",
      contentDescriptors: [],
      feedbackTopics: ["general"],
      downloadAllowed: false,
      trainingAllowed: false,
      attributionText: "",
      altText: "대체 텍스트",
    };
    expect(resolveCreatorCommunityAiTraining(previousManifestCommunity)).toBe("unspecified");
    expect(normalizeCreatorCommunityMetadata(previousManifestCommunity)).toMatchObject({
      ...previousManifestCommunity,
      aiTraining: "unspecified",
    });
    expect(
      resolveCreatorCommunityAiTraining({ ...previousManifestCommunity, aiTraining: "prohibited" }),
    ).toBe("prohibited");
    expect(
      resolveCreatorCommunityAiTraining({ ...previousManifestCommunity, trainingAllowed: true }),
    ).toBe("allowed");
  });

  it("정규화 결과는 기존 필드를 모두 유지하고 aiTraining 만 더한 상위 집합이다", () => {
    const legacyKeys = [
      "version",
      "kind",
      "portfolio",
      "provenance",
      "contentDescriptors",
      "feedbackTopics",
      "downloadAllowed",
      "trainingAllowed",
      "attributionText",
      "altText",
    ];
    const keys = Object.keys(normalizeCreatorCommunityMetadata({}));
    expect(keys).toEqual(expect.arrayContaining(legacyKeys));
    expect(keys.filter((key) => !legacyKeys.includes(key))).toEqual(["aiTraining"]);
  });

  it("허용 표기는 출처·이용 조건 안내 경고를 유지하고 불허·미지정은 요구하지 않는다", () => {
    const issueCodes = (consent: "allowed" | "prohibited" | "unspecified") =>
      validateCreatorCommunityMetadata(
        { ...createDefaultCreatorCommunityMetadata("upload"), aiTraining: consent, altText: "설명" },
        { pageCount: 1 },
      ).map((issue) => issue.code);

    expect(issueCodes("allowed")).toContain("RIGHTS_ATTRIBUTION_RECOMMENDED");
    expect(issueCodes("prohibited")).not.toContain("RIGHTS_ATTRIBUTION_RECOMMENDED");
    expect(issueCodes("unspecified")).not.toContain("RIGHTS_ATTRIBUTION_RECOMMENDED");
    // 필드 없이 레거시 불리언만 켠 기존 게시물도 같은 안내를 받는다.
    expect(
      validateCreatorCommunityMetadata(
        { trainingAllowed: true, altText: "설명" },
        { pageCount: 1 },
      ).map((issue) => issue.code),
    ).toContain("RIGHTS_ATTRIBUTION_RECOMMENDED");
  });
});
