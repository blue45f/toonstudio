import { describe, expect, it } from "vitest";

import {
  createStudioPublishReceipt,
  projectStudioPublishReceiptCommunity,
  studioPublishReceiptFileName,
} from "./studio-publish-receipt-data";

import {
  createDefaultCreatorCommunityMetadata,
  withCreatorCommunityAiTraining,
} from "@toonstudio/contracts/creator-community-publication-contract";

describe("studio publish receipt data", () => {
  it("records a public and anonymous reader path with source integrity", () => {
    const receipt = createStudioPublishReceipt({
      kind: "published",
      workId: "work / 1",
      revision: 7,
      environment: "production",
      generatedAt: "2026-09-24T10:47:14.280Z",
      details: {
        title: "성운의 왕관",
        visibility: "public",
        publishedAt: "2026-09-24T10:47:13.708Z",
        pages: [{ name: "page.webp", width: 1280, height: 1600 }],
        source: {
          version: 1,
          kind: "studio_document",
          projectId: "project-1",
          documentId: "document-1",
          revisionId: "studio-generation:7:history:12",
          contentChecksum: "a".repeat(64),
          disclosure: "브라우저 편집기에서 제작",
        },
        community: {
          kind: "illustration",
          provenance: "agent_assisted",
          portfolio: true,
          downloadAllowed: false,
          trainingAllowed: false,
          attributionText: "AI 에이전트 드로잉 · 소유자 최종 검수",
          altText: "별빛 왕관을 쓴 판타지 소녀",
        },
        rights: {
          comments: "open",
          allowRemix: true,
          searchIndexing: true,
          contentRating: "all",
        },
        preflight: { errors: 0, warnings: 0 },
      },
    });

    expect(receipt).toMatchObject({
      schema: "toonstudio.publish-receipt.v1",
      revision: 7,
      publicPath: "/showcase/work/work%20%2F%201",
      anonymousPreviewPath: "/showcase/work/work%20%2F%201?view=reader&publicPreview=1",
      details: {
        source: { contentChecksum: "a".repeat(64) },
        community: {
          provenance: "agent_assisted",
          altText: "별빛 왕관을 쓴 판타지 소녀",
        },
        preflight: { errors: 0, warnings: 0 },
      },
    });
    expect(studioPublishReceiptFileName(receipt)).toBe("toonstudio-publish-work-1-r7.json");
  });

  it("does not expose reader paths for a private draft", () => {
    expect(createStudioPublishReceipt({
      kind: "private",
      workId: "private-work",
      environment: "preview",
    })).toMatchObject({
      publicPath: null,
      anonymousPreviewPath: null,
      revision: null,
      details: null,
    });
  });

  it("projects the creator's AI training label into the receipt community block", () => {
    const base = createDefaultCreatorCommunityMetadata("upload");
    expect(projectStudioPublishReceiptCommunity(base)).toMatchObject({
      aiTraining: "unspecified",
      trainingAllowed: false,
    });
    expect(projectStudioPublishReceiptCommunity(withCreatorCommunityAiTraining(base, "allowed")))
      .toMatchObject({ aiTraining: "allowed", trainingAllowed: true });
    expect(projectStudioPublishReceiptCommunity(withCreatorCommunityAiTraining(base, "prohibited")))
      .toMatchObject({ aiTraining: "prohibited", trainingAllowed: false });
  });

  it("projects only the public community fields and reads legacy metadata conservatively", () => {
    const { aiTraining: _omitted, ...legacy } = createDefaultCreatorCommunityMetadata("upload");
    const projected = projectStudioPublishReceiptCommunity({ ...legacy, trainingAllowed: true });
    expect(projected.aiTraining).toBe("allowed");
    expect(Object.keys(projected).sort()).toEqual([
      "aiTraining",
      "altText",
      "attributionText",
      "downloadAllowed",
      "kind",
      "portfolio",
      "provenance",
      "trainingAllowed",
    ]);
    expect(projectStudioPublishReceiptCommunity(legacy).aiTraining).toBe("unspecified");
  });

  it("keeps the label in the downloadable receipt JSON without changing the schema id", () => {
    const base = createDefaultCreatorCommunityMetadata("upload");
    const receipt = createStudioPublishReceipt({
      kind: "published",
      workId: "work-1",
      revision: 3,
      environment: "production",
      generatedAt: "2026-10-15T00:00:00.000Z",
      details: {
        title: "작품",
        visibility: "public",
        publishedAt: "2026-10-15T00:00:00.000Z",
        pages: [{ name: "page.webp", width: 1280, height: 1600 }],
        source: null,
        community: projectStudioPublishReceiptCommunity(
          withCreatorCommunityAiTraining(base, "prohibited"),
        ),
        rights: { comments: "open", allowRemix: true, searchIndexing: true, contentRating: "all" },
        preflight: { errors: 0, warnings: 0 },
      },
    });
    expect(receipt.schema).toBe("toonstudio.publish-receipt.v1");
    // 영수증 JSON을 내려받았다가 다시 읽어도 표기가 그대로 남는다.
    const roundTripped: unknown = JSON.parse(JSON.stringify(receipt));
    expect(roundTripped).toMatchObject({
      details: { community: { aiTraining: "prohibited", trainingAllowed: false } },
    });
  });
});
