import {
  createDefaultCreatorCommunityMetadata,
  readCreatorCommunityMetadata,
  resolveCreatorCommunityAiTraining,
  withCreatorCommunityAiTraining,
  writeCreatorCommunityMetadata,
  type CreatorCommunityMetadata,
  type CreatorCommunityReleaseManifest,
} from "@toonstudio/contracts/creator-community-publication-contract";
import { describe, expect, it, vi } from "vitest";

import {
  CreateCreatorWorkSchema,
  UpdateCreatorWorkSchema,
} from "./creator.dto";
import { toPublicCreatorDoc } from "../../server/creator-doc-visibility";

import { projectCreatorWorkWithRelease } from "../../server/creator/community-publishing";

import type { CreatorWorkSummary } from "../../server/creator/works-contract";

// community-publishing 은 DB 모듈을 import 한다. 이 파일은 순수 투영 함수만 쓰므로 스키마만 살리고 연결은 비운다.
vi.mock("../../platform/database", async () => ({
  ...await import("../../platform/database/schema"),
  db: {},
  dbClient: {},
}));

/**
 * 작품·회차 AI 학습 허용 표기는 기존 JSONB 필드(`creator_work.doc -> 'community'`,
 * `creator_work_release.manifest -> 'community'`)에 실린다. DB 스키마와 최상위 DTO 키를 바꾸지 않으므로
 * API 가 새 필드를 거부하거나 지우지 않는다는 점을 경계마다 고정한다.
 */
describe("AI 학습 허용 표기의 API 저장·전달 경계", () => {
  const consents = ["unspecified", "allowed", "prohibited"] as const;

  it("작품 생성·수정 DTO 는 doc.community.aiTraining 을 거부하지 않고 그대로 보존한다", () => {
    for (const consent of consents) {
      const doc = writeCreatorCommunityMetadata(
        { pagesList: [] },
        withCreatorCommunityAiTraining(createDefaultCreatorCommunityMetadata("upload"), consent),
        { format: "upload" },
      );
      const created = CreateCreatorWorkSchema.safeParse({ title: "1화", format: "upload", doc });
      expect(created.success).toBe(true);
      expect(created.data?.doc).toEqual(doc);

      const updated = UpdateCreatorWorkSchema.safeParse({ doc, baseRevision: 3 });
      expect(updated.success).toBe(true);
      expect(readCreatorCommunityMetadata(updated.data?.doc).aiTraining).toBe(consent);
    }
  });

  it("새 필드는 doc 안에만 두고 최상위 body 키를 늘리지 않는다(strict DTO 유지)", () => {
    expect(CreateCreatorWorkSchema.safeParse({ title: "1화", aiTraining: "allowed" }).success).toBe(false);
    expect(UpdateCreatorWorkSchema.safeParse({ title: "수정", aiTraining: "allowed" }).success).toBe(false);
  });

  it("DTO 는 doc 을 불투명 JSON 으로 받으므로 잘못된 값은 읽을 때 미지정으로 정규화된다", () => {
    const parsed = UpdateCreatorWorkSchema.parse({
      doc: { community: { aiTraining: "maybe", trainingAllowed: "yes" } },
    });
    expect(parsed.doc).toEqual({ community: { aiTraining: "maybe", trainingAllowed: "yes" } });
    expect(readCreatorCommunityMetadata(parsed.doc, { format: "upload" })).toMatchObject({
      aiTraining: "unspecified",
      trainingAllowed: false,
    });
  });

  it("공개 doc 투영은 community 의 표기를 지우지 않고 비공개 필드만 제거한다", () => {
    const doc = {
      comments: { threads: ["비공개 토론"] },
      writerRoom: { note: "비공개" },
      community: { aiTraining: "prohibited", trainingAllowed: false, altText: "대체 텍스트" },
    };
    const projected = toPublicCreatorDoc(doc);
    expect(projected.community).toEqual(doc.community);
    expect(projected).not.toHaveProperty("comments");
    expect(projected).not.toHaveProperty("writerRoom");
  });

  describe("릴리스 manifest 투영", () => {
    const work: CreatorWorkSummary = {
      id: "work-1",
      title: "현재 제목",
      description: "",
      cover: "",
      tags: [],
      format: "upload",
      pagesCount: 1,
      sourceKind: null,
      titleId: null,
      status: "published",
      author: { id: "user-1", name: "작가", avatar: "#7c5cfc" },
      likes: 0,
      comments: 0,
      views: 0,
      liked: false,
      community: createDefaultCreatorCommunityMetadata("upload"),
      seriesId: null,
      episodeNo: null,
      seriesTitle: null,
      challengeId: null,
      challengeTitle: null,
      remixFromId: null,
      createdAt: "2026-10-01T00:00:00.000Z",
    };

    function manifestWith(community: unknown): CreatorCommunityReleaseManifest {
      return {
        version: 1,
        workId: "work-1",
        workRevision: 2,
        title: "게시본 제목",
        description: "",
        cover: "",
        tags: [],
        format: "upload",
        pages: ["page-1"],
        doc: {},
        seriesId: null,
        episodeNo: null,
        challengeId: null,
        remixFromId: null,
        author: { id: "user-1", name: "작가", avatar: "#7c5cfc" },
        community: readCreatorCommunityMetadata({ community }, { format: "upload" }),
        capturedAt: "2026-10-01T00:00:00.000Z",
      };
    }

    it("독자에게 나가는 community 는 작성 중인 문서가 아니라 게시된 릴리스의 표기다", () => {
      const live: CreatorWorkSummary = {
        ...work,
        community: withCreatorCommunityAiTraining(
          createDefaultCreatorCommunityMetadata("upload"),
          "allowed",
        ),
      };
      const projected = projectCreatorWorkWithRelease(
        live,
        manifestWith({ aiTraining: "prohibited" }),
      );
      expect(projected.community?.aiTraining).toBe("prohibited");
      expect(projected.title).toBe("게시본 제목");
    });

    it("manifest 에 새 필드가 있으면 그대로, 없던 이전 릴리스는 레거시 값으로 읽는다", () => {
      for (const consent of consents) {
        const projected = projectCreatorWorkWithRelease(work, manifestWith({ aiTraining: consent }));
        expect(resolveCreatorCommunityAiTraining(projected.community)).toBe(consent);
      }

      // 이전 릴리스: 저장된 JSON 에는 aiTraining 이 없고 레거시 불리언만 있다.
      const { aiTraining: _omitted, ...legacyAllowed } = withCreatorCommunityAiTraining(
        createDefaultCreatorCommunityMetadata("upload"),
        "allowed",
      );
      const { aiTraining: _omittedOff, ...legacyOff } = createDefaultCreatorCommunityMetadata("upload");
      const storedLegacy = (community: CreatorCommunityMetadata): CreatorCommunityReleaseManifest => ({
        ...manifestWith({}),
        community,
      });
      expect(
        resolveCreatorCommunityAiTraining(
          projectCreatorWorkWithRelease(work, storedLegacy(legacyAllowed)).community,
        ),
      ).toBe("allowed");
      expect(
        resolveCreatorCommunityAiTraining(
          projectCreatorWorkWithRelease(work, storedLegacy(legacyOff)).community,
        ),
      ).toBe("unspecified");
    });
  });
});
