import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { CreatorCollaborationRepository } from "../creator/creator-collaboration.repository";

import { CreatorStudioRealtimeTicketAuthorization } from "./studio-realtime-ticket.creator-authorization";
import { resolveStudioRealtimeTicketDeployment } from "./studio-realtime-ticket.integration";
import { CloudflareStudioRealtimeTicketSigner } from "./studio-realtime-ticket.provider";
import { StudioRealtimeTicketService } from "./studio-realtime-ticket.service";

import type {
  CreatorCollaborationMembershipRecord,
  CreatorCollaborationPersistence,
  CreatorCollaborationUnitOfWork,
  CreatorCollaborationWorkRecord,
} from "../creator/creator-collaboration.persistence-contract";
import type { StudioRealtimeTicketAuthorizationInput } from "./studio-realtime-ticket.authorization";

/**
 * 실제 CreatorCollaborationRepository가 만드는 스냅샷으로 티켓 인가를 검증한다.
 *
 * 티켓 모듈의 단위 테스트는 손으로 쓴 픽스처를 쓰기 때문에, 저장소의
 * capabilities 형태가 바뀌어도(예: respondInvite 추가) 양쪽이 각자 통과하는
 * 계약 드리프트가 생겼다. 여기서는 capabilities를 저장소 내부 정책이 실제로
 * 만들게 두므로, 정책 형태가 다시 바뀌면 이 테스트가 먼저 깨진다.
 */

const OWNER_ID = "owner-1";
const WORK_ID = "work-1";
const ORIGIN = "https://www.toonstudio.cloud";
const TEST_SECRET =
  "test-only-cloudflare-ticket-secret-with-more-than-32-bytes";

const WORK_RECORD: CreatorCollaborationWorkRecord = {
  id: WORK_ID,
  ownerUserId: OWNER_ID,
  title: "저장 작품",
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

function membershipRecord(
  overrides: Partial<CreatorCollaborationMembershipRecord> &
    Pick<
      CreatorCollaborationMembershipRecord,
      "userId" | "role" | "status"
    >,
): CreatorCollaborationMembershipRecord {
  return {
    workId: WORK_ID,
    invitationId: "invitation-1",
    invitedBy: OWNER_ID,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    respondedAt: null,
    ...overrides,
  };
}

function realRepository(
  memberships: readonly CreatorCollaborationMembershipRecord[],
): CreatorCollaborationRepository {
  // getAuthorization 경로는 findWork/findMembership만 사용한다 (loadContext 기준).
  const unit = {
    findWork: async (workId: string) =>
      workId === WORK_ID ? WORK_RECORD : null,
    findMembership: async (workId: string, userId: string) =>
      memberships.find(
        (membership) =>
          membership.workId === workId && membership.userId === userId,
      ) ?? null,
  };
  const persistence: CreatorCollaborationPersistence = {
    read: async <T>(
      run: (unit: CreatorCollaborationUnitOfWork) => Promise<T>,
    ): Promise<T> => run(unit as unknown as CreatorCollaborationUnitOfWork),
    transaction: async <T>(
      run: (unit: CreatorCollaborationUnitOfWork) => Promise<T>,
    ): Promise<T> => run(unit as unknown as CreatorCollaborationUnitOfWork),
  };
  return new CreatorCollaborationRepository(persistence);
}

function deployment() {
  const resolved = resolveStudioRealtimeTicketDeployment({
    NODE_ENV: "production",
    API_CORS_ALLOWED_ORIGINS:
      "https://www.toonstudio.cloud,https://toonstudio.cloud",
    STUDIO_REALTIME_TICKET_ENABLED: "true",
    STUDIO_REALTIME_CLOUDFLARE_PROVIDER_ID: "cloudflare-realtime-v1",
    STUDIO_REALTIME_CLOUDFLARE_TICKET_ISSUER: "toonspectrum-api",
    STUDIO_REALTIME_CLOUDFLARE_TICKET_AUDIENCE: "toonspectrum-realtime",
    STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET: TEST_SECRET,
    STUDIO_REALTIME_CLOUDFLARE_TICKET_TTL_SECONDS: "120",
    STUDIO_REALTIME_CLOUDFLARE_SESSION_TTL_SECONDS: "300",
  });
  if (!resolved.enabled) {
    throw new Error("테스트용 발급이 활성화되어야 합니다.");
  }
  return resolved;
}

function authorizationFor(
  repository: CreatorCollaborationRepository,
): CreatorStudioRealtimeTicketAuthorization {
  const resolved = deployment();
  return new CreatorStudioRealtimeTicketAuthorization(repository, {
    providerIds: [resolved.signer.providerId],
    allowedOrigins: resolved.allowedOrigins,
  });
}

function serviceFor(
  repository: CreatorCollaborationRepository,
): StudioRealtimeTicketService {
  const resolved = deployment();
  return new StudioRealtimeTicketService(
    authorizationFor(repository),
    [new CloudflareStudioRealtimeTicketSigner(resolved.signer)],
  );
}

function request(
  actorUserId: string,
): StudioRealtimeTicketAuthorizationInput {
  return {
    version: 1,
    actorUserId,
    providerId: "cloudflare-realtime-v1",
    sessionId: "session-1",
    scope: { workId: WORK_ID, roomId: WORK_ID },
    workloads: ["presence", "comments", "screen-signaling"],
    capabilities: [
      "presence.snapshot-v1",
      "comments.invalidation-v1",
      "screen-signaling.session-v1",
    ],
    origin: ORIGIN,
  };
}

function issueBody() {
  return {
    version: 1,
    providerId: "cloudflare-realtime-v1",
    sessionId: "session-1",
    scope: { workId: WORK_ID, roomId: WORK_ID },
    workloads: ["presence", "comments", "screen-signaling"] as const,
    capabilities: [
      "presence.snapshot-v1",
      "comments.invalidation-v1",
      "screen-signaling.session-v1",
    ],
  };
}

describe("실제 Creator 협업 저장소와 실시간 티켓 인가의 계약", () => {
  it("저장소가 반환하는 실제 capabilities 형태로 소유자에게 티켓을 발급한다", async () => {
    const repository = realRepository([]);

    // 저장소 스냅샷 자체의 형태를 먼저 고정한다. 정책 쪽 키 집합이 바뀌면
    // 이 단언이 깨지고, 티켓 모듈 스키마를 함께 갱신해야 한다는 신호가 된다.
    const snapshot = await repository.getAuthorization(OWNER_ID, WORK_ID);
    expect(snapshot.viewer).toMatchObject({
      userId: OWNER_ID,
      role: "owner",
      status: "active",
    });
    expect(snapshot.viewer.capabilities).toEqual({
      view: true,
      comment: true,
      edit: true,
      manageMembers: true,
      respondInvite: false,
    });

    const response = await serviceFor(repository).issue(
      {
        userId: OWNER_ID,
        sessionVersion: 3,
        expiresAt: Date.now() + 4 * 60 * 1_000,
      },
      ORIGIN,
      issueBody(),
    );
    expect(response.scope).toEqual({ workId: WORK_ID, roomId: WORK_ID });
    expect(response.ticket.length).toBeGreaterThan(0);
  });

  it("활성 멤버(editor)의 실제 스냅샷을 티켓 capabilities로 투영한다", async () => {
    const repository = realRepository([
      membershipRecord({
        userId: "editor-1",
        role: "editor",
        status: "active",
      }),
    ]);

    const decision = await authorizationFor(repository).authorize(
      request("editor-1"),
    );
    expect(decision).toMatchObject({
      allowed: true,
      role: "editor",
      creatorCapabilities: {
        view: true,
        comment: true,
        edit: true,
        manageMembers: false,
      },
    });
    if (decision.allowed) {
      // respondInvite는 티켓 계약에 실리지 않는다.
      expect(decision.creatorCapabilities).not.toHaveProperty(
        "respondInvite",
      );
    }
  });

  it("pending 초대자는 respondInvite 스냅샷이어도 티켓을 거부한다", async () => {
    const repository = realRepository([
      membershipRecord({
        userId: "invitee-1",
        role: "editor",
        status: "pending",
      }),
    ]);

    const snapshot = await repository.getAuthorization("invitee-1", WORK_ID);
    expect(snapshot.viewer.status).toBe("pending");
    expect(snapshot.viewer.capabilities).toEqual({
      view: false,
      comment: false,
      edit: false,
      manageMembers: false,
      respondInvite: true,
    });

    await expect(
      authorizationFor(repository).authorize(request("invitee-1")),
    ).resolves.toEqual({ allowed: false });
  });

  it("멤버가 아닌 사용자는 실제 저장소 거부로 티켓이 발급되지 않는다", async () => {
    const repository = realRepository([]);

    await expect(
      authorizationFor(repository).authorize(request("outsider-1")),
    ).resolves.toEqual({ allowed: false });

    await expect(
      serviceFor(repository).issue(
        {
          userId: "outsider-1",
          sessionVersion: 1,
          expiresAt: Date.now() + 4 * 60 * 1_000,
        },
        ORIGIN,
        issueBody(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
