import type { CreatorPublicationSourceLink } from "@toonstudio/contracts/creator-publication-integrity";

import { buildCreatorPublicReaderPreviewHref } from "./creator-public-reader-preview";
import { creatorWorkHref } from "./publishing/showcase-links";
import type { StudioPublishEnvironment } from "./studio-publish-review-safety";
import type { StudioPublishResultKind } from "./studio-publish-result";

import {
  resolveCreatorCommunityAiTraining,
  type CreatorCommunityAiTrainingConsent,
  type CreatorCommunityMetadata,
} from "@toonstudio/contracts/creator-community-publication-contract";

export interface StudioPublishReceiptPage {
  readonly name: string;
  readonly width: number;
  readonly height: number;
}

export interface StudioPublishReceiptCommunity {
  readonly kind: string;
  readonly provenance: "human" | "ai_assisted" | "agent_assisted" | "ai_generated" | "mixed";
  readonly portfolio: boolean;
  readonly downloadAllowed: boolean;
  /** 레거시 호환용 파생 값. `aiTraining === "allowed"`일 때만 참이다. */
  readonly trainingAllowed: boolean;
  /**
   * 작가가 밝힌 AI 학습 허용 표기(미지정·허용·불허). 의사 표시이며 별도 계약을 대체하지 않는다.
   * 이 필드가 없는 이전 영수증은 `trainingAllowed === true`일 때만 허용으로 읽는다.
   */
  readonly aiTraining?: CreatorCommunityAiTrainingConsent;
  readonly attributionText: string;
  readonly altText: string;
}

/** 게시 메타데이터에서 영수증에 남길 공개 필드만 골라 만든다. 표기 값은 계약의 해석 규칙을 따른다. */
export function projectStudioPublishReceiptCommunity(
  metadata: CreatorCommunityMetadata,
): StudioPublishReceiptCommunity {
  const aiTraining = resolveCreatorCommunityAiTraining(metadata);
  return {
    kind: metadata.kind,
    provenance: metadata.provenance,
    portfolio: metadata.portfolio,
    downloadAllowed: metadata.downloadAllowed,
    trainingAllowed: aiTraining === "allowed",
    aiTraining,
    attributionText: metadata.attributionText,
    altText: metadata.altText,
  };
}

export interface StudioPublishReceiptRights {
  readonly comments: "open" | "closed";
  readonly allowRemix: boolean;
  readonly searchIndexing: boolean;
  readonly contentRating: "all" | "teen" | "mature";
}

export interface StudioPublishReceiptDetails {
  readonly title: string;
  readonly visibility: "public" | "unlisted" | "private";
  readonly publishedAt: string | null;
  readonly pages: readonly StudioPublishReceiptPage[];
  readonly source: CreatorPublicationSourceLink | null;
  readonly community: StudioPublishReceiptCommunity;
  readonly rights: StudioPublishReceiptRights;
  readonly preflight: {
    readonly errors: number;
    readonly warnings: number;
  };
}

export interface StudioPublishReceiptInput {
  readonly kind: StudioPublishResultKind;
  readonly workId: string;
  readonly revision?: number;
  readonly environment: StudioPublishEnvironment;
  readonly details?: StudioPublishReceiptDetails | null;
  readonly generatedAt?: string;
}

export interface StudioPublishReceiptDocument {
  readonly schema: "toonstudio.publish-receipt.v1";
  readonly generatedAt: string;
  readonly environment: StudioPublishEnvironment;
  readonly result: StudioPublishResultKind;
  readonly workId: string;
  readonly revision: number | null;
  readonly publicPath: string | null;
  readonly anonymousPreviewPath: string | null;
  readonly details: StudioPublishReceiptDetails | null;
}

function readerVisible(kind: StudioPublishResultKind): boolean {
  return kind === "published";
}

export function createStudioPublishReceipt(
  input: StudioPublishReceiptInput,
): StudioPublishReceiptDocument {
  const visible = readerVisible(input.kind);
  return {
    schema: "toonstudio.publish-receipt.v1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    environment: input.environment,
    result: input.kind,
    workId: input.workId,
    revision: Number.isSafeInteger(input.revision) ? input.revision ?? null : null,
    publicPath: visible ? creatorWorkHref(input.workId) : null,
    anonymousPreviewPath: visible
      ? buildCreatorPublicReaderPreviewHref(input.workId)
      : null,
    details: input.details ?? null,
  };
}

export function studioPublishReceiptFileName(
  receipt: Pick<StudioPublishReceiptDocument, "workId" | "revision">,
): string {
  const workId = receipt.workId.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "work";
  return `toonstudio-publish-${workId}-r${receipt.revision ?? "pending"}.json`;
}
