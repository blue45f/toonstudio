import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { CreatorCollaborationRepository } from "../../../../../../apps/api/src/modules/creator/creator-collaboration.repository";
import { creatorPublicationCollaborationRepositoryProvider, CreatorPublicationCollaborationRepository, prepareCreatorPublicationSharedDocumentPatch } from "../../../../../../apps/api/src/modules/creator/creator-publication-collaboration.repository";
import { MembershipOperationsService } from "../../../../../../apps/api/src/modules/membership-operations/membership-operations.service";
import {
  createDefaultCreatorPublicationDirective,
  readCreatorPublicationDirective,
  writeCreatorPublicationDirective,
} from "../../../../../../apps/web/src/shared/lib/creator-publication-contract";

import type { CreatorSharedDocument } from "../../../../../../apps/api/src/modules/creator/creator-collaboration.repository";
import type { StudioScopedRestWriteInput } from "../../../../../../apps/api/src/modules/creator/studio-scoped-write-rest";

const now = new Date("2026-09-09T09:00:00.000Z");

function completeDirective(overrides: Record<string, unknown> = {}) {
  return {
    ...createDefaultCreatorPublicationDirective("Asia/Seoul"),
    socialTitle: "공유 제목",
    socialDescription: "공유 설명",
    canonicalSlug: "episode-1",
    ...overrides,
  };
}

function sharedDocument(options: {
  role?: CreatorSharedDocument["role"];
  status?: CreatorSharedDocument["document"]["status"];
  challengeId?: string | null;
  doc?: unknown;
} = {}): Pick<CreatorSharedDocument, "role" | "document"> {
  return {
    role: options.role ?? "owner",
    document: {
      titleId: null,
      title: "작품",
      description: "설명",
      cover: "cover",
      tags: [],
      format: "upload",
      pages: ["page"],
      doc: options.doc ?? {},
      status: options.status ?? "draft",
      seriesId: null,
      episodeNo: null,
      challengeId: options.challengeId ?? null,
      remixFromId: null,
    },
  };
}

describe("prepareCreatorPublicationSharedDocumentPatch", () => {
  it("restores the current publication policy when an editor attempts to change it", () => {
    const current = completeDirective({
      visibility: "unlisted",
      comments: "closed",
      allowRemix: false,
    });
    const prepared = prepareCreatorPublicationSharedDocumentPatch({
      shared: sharedDocument({
        role: "editor",
        doc: writeCreatorPublicationDirective({ keep: true }, current),
      }),
      patch: {
        title: "편집한 제목",
        doc: writeCreatorPublicationDirective(
          { changedContent: true },
          completeDirective({ visibility: "public", comments: "open" }),
        ),
      },
      now,
    });

    expect(prepared.title).toBe("편집한 제목");
    expect(prepared.doc).toMatchObject({ changedContent: true });
    expect(readCreatorPublicationDirective(prepared.doc)).toMatchObject({
      visibility: "unlisted",
      comments: "closed",
      allowRemix: false,
    });
  });

  it("removes publication metadata introduced by an editor into a legacy work", () => {
    const prepared = prepareCreatorPublicationSharedDocumentPatch({
      shared: sharedDocument({ role: "editor", doc: { legacy: true } }),
      patch: {
        doc: writeCreatorPublicationDirective(
          { content: true },
          completeDirective({ visibility: "public" }),
        ),
      },
      now,
    });

    expect(prepared.doc).toEqual({ content: true });
    expect(readCreatorPublicationDirective(prepared.doc)).toBeNull();
  });

  it("preserves policy when a legacy owner client replaces the rest of the document", () => {
    const current = completeDirective({ visibility: "unlisted" });
    const prepared = prepareCreatorPublicationSharedDocumentPatch({
      shared: sharedDocument({
        role: "owner",
        status: "published",
        doc: writeCreatorPublicationDirective({ old: true }, current),
      }),
      patch: { doc: { replacement: true } },
      now,
    });

    expect(prepared.status).toBeUndefined();
    expect(prepared.doc).toMatchObject({ replacement: true });
    expect(readCreatorPublicationDirective(prepared.doc)).toMatchObject({
      visibility: "unlisted",
    });
  });

  it("converts a future owner release to a draft-backed schedule", () => {
    const prepared = prepareCreatorPublicationSharedDocumentPatch({
      shared: sharedDocument({ role: "owner", status: "draft" }),
      patch: {
        status: "published",
        doc: writeCreatorPublicationDirective(
          { content: true },
          completeDirective({
            mode: "scheduled",
            visibility: "public",
            scheduledAt: "2026-09-10T09:00:00.000Z",
          }),
        ),
      },
      now,
    });

    expect(prepared.status).toBe("draft");
    expect(readCreatorPublicationDirective(prepared.doc)).toMatchObject({
      mode: "scheduled",
      scheduledAt: "2026-09-10T09:00:00.000Z",
      publishedAt: null,
    });
  });

  it("stamps an immediate owner release", () => {
    const prepared = prepareCreatorPublicationSharedDocumentPatch({
      shared: sharedDocument({ role: "owner", status: "draft" }),
      patch: {
        status: "published",
        doc: writeCreatorPublicationDirective({}, completeDirective()),
      },
      now,
    });

    expect(prepared.status).toBe("published");
    expect(readCreatorPublicationDirective(prepared.doc)?.publishedAt).toBe(
      "2026-09-09T09:00:00.000Z",
    );
  });

  it("keeps a private owner release as draft", () => {
    const prepared = prepareCreatorPublicationSharedDocumentPatch({
      shared: sharedDocument({ role: "owner", status: "published" }),
      patch: {
        status: "published",
        doc: writeCreatorPublicationDirective(
          {},
          completeDirective({ visibility: "private" }),
        ),
      },
      now,
    });

    expect(prepared.status).toBe("draft");
    expect(readCreatorPublicationDirective(prepared.doc)).toMatchObject({
      visibility: "private",
      mode: "immediate",
    });
  });

  it("rejects an invalid scheduled challenge release before repository mutation", () => {
    const attempt = () =>
      prepareCreatorPublicationSharedDocumentPatch({
        shared: sharedDocument({
          role: "owner",
          status: "draft",
          challengeId: "challenge-1",
        }),
        patch: {
          status: "published",
          doc: writeCreatorPublicationDirective(
            {},
            completeDirective({
              mode: "scheduled",
              visibility: "unlisted",
              scheduledAt: "2026-09-08T09:00:00.000Z",
            }),
          ),
        },
        now,
      });

    expect(attempt).toThrow(BadRequestException);
    try {
      attempt();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "creator_publication_invalid",
        message: "예약 시간은 현재보다 최소 1분 뒤여야 합니다.",
      });
    }
  });
});

describe("실제 Creator 협업 provider의 제한 저장 문맥", () => {
  const cases = (["viewer", "commenter", "editor"] as const).flatMap((role) => [
    { role, reader: "기본 reader", capabilities: undefined },
    { role, reader: "6패스 reader", capabilities: ["bg3d-sixpass-bundle.v1"] },
  ]);
  it.each(cases)("$role의 $reader 문맥을 그대로 전달하고 기존 게시 정책은 보호한다", async ({ role, capabilities }) => {
    const current = completeDirective({ visibility: "unlisted", comments: "closed", allowRemix: false });
    const shared: CreatorSharedDocument = { ...sharedDocument({ role, doc: writeCreatorPublicationDirective({ original: true }, current) }),
      workId: "work-1", status: "active", capabilities: { view: true, edit: role === "editor" },
      revision: 4, crdtServerSequence: "9", updatedAt: "2026-11-04T00:00:00.000Z" };
    const patch = { doc: writeCreatorPublicationDirective({ changedContent: true }, completeDirective({ visibility: "public", comments: "open" })) };
    const scoped: StudioScopedRestWriteInput = { mutationId: "same-scoped-mutation", writeContext: {
      version: 1, policyVersion: 7, grantIds: ["assigned-grant"], creations: [], restorations: [],
    } };
    const originalPatch = structuredClone(patch), originalScoped = structuredClone(scoped);
    const response = { workId: "work-1", revision: 5, updatedAt: "2026-11-04T00:00:01.000Z" };
    const read = vi.spyOn(CreatorCollaborationRepository.prototype, "getSharedDocument").mockResolvedValue(shared);
    const save = vi.spyOn(CreatorCollaborationRepository.prototype, "saveSharedDocument").mockResolvedValue(response);
    try {
      expect(creatorPublicationCollaborationRepositoryProvider.provide).toBe(CreatorCollaborationRepository);
      // CreatorModule과 같은 factory와 주입 토큰 타입으로 호출해 실제 override를 통과한다.
      const repository: CreatorCollaborationRepository = creatorPublicationCollaborationRepositoryProvider.useFactory(new MembershipOperationsService());
      expect(repository).toBeInstanceOf(CreatorPublicationCollaborationRepository);
      const operation = capabilities
        ? repository.saveSharedDocument("actor-1", "work-1", 4, 9n, patch, scoped, capabilities)
        : repository.saveSharedDocument("actor-1", "work-1", 4, 9n, patch, scoped);
      await expect(operation).resolves.toEqual(response);
      expect(read).toHaveBeenCalledExactlyOnceWith("actor-1", "work-1");
      expect(save).toHaveBeenCalledExactlyOnceWith("actor-1", "work-1", 4, 9n, expect.objectContaining({ doc: expect.any(Object) }), scoped, capabilities ?? []);
      expect(save.mock.calls[0]?.[5]).toBe(scoped);
      if (capabilities) expect(save.mock.calls[0]?.[6]).toBe(capabilities);
      const forwardedPatch = save.mock.calls[0]?.[4];
      expect(forwardedPatch?.doc).toMatchObject({ changedContent: true });
      expect(readCreatorPublicationDirective(forwardedPatch?.doc)).toMatchObject({ visibility: "unlisted", comments: "closed", allowRemix: false });
      expect(patch).toEqual(originalPatch); expect(scoped).toEqual(originalScoped);
    } finally { read.mockRestore(); save.mockRestore(); }
  });
});
