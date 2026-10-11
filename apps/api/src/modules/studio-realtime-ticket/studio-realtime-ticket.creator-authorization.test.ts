import { describe, expect, it, vi } from "vitest";

import { CreatorCollaborationRepository } from "../creator/creator-collaboration.repository";
import { StudioVirtualSpaceAccessRepository } from "../studio-virtual-space-access/studio-virtual-space-access.repository";

import {
  CreatorStudioRealtimeTicketAuthorization,
  isCanonicalCreatorStudioRealtimeScope,
} from "./studio-realtime-ticket.creator-authorization";

import type {
  StudioRealtimeTicketAuthorizationInput,
} from "./studio-realtime-ticket.authorization";

const ORIGIN = "https://www.toonstudio.cloud";
const PROVIDER_ID = "cloudflare-realtime-v1";

function request(
  overrides: Partial<StudioRealtimeTicketAuthorizationInput> = {},
): StudioRealtimeTicketAuthorizationInput {
  return {
    version: 1,
    actorUserId: "artist-1",
    providerId: PROVIDER_ID,
    sessionId: "session-1",
    scope: { workId: "work-1", roomId: "work-1" },
    workloads: ["presence", "comments", "screen-signaling"],
    capabilities: [
      "presence.snapshot-v1",
      "comments.invalidation-v1",
      "screen-signaling.session-v1",
    ],
    origin: ORIGIN,
    ...overrides,
  };
}

function repository(
  getAuthorization: ReturnType<typeof vi.fn>,
): CreatorCollaborationRepository {
  return {
    getAuthorization,
  } as unknown as CreatorCollaborationRepository;
}

function authorization(
  getAuthorization: ReturnType<typeof vi.fn>,
): CreatorStudioRealtimeTicketAuthorization {
  return new CreatorStudioRealtimeTicketAuthorization(
    repository(getAuthorization),
    {
      providerIds: [PROVIDER_ID],
      allowedOrigins: [ORIGIN],
    },
  );
}

describe("Creator Studio realtime room binding", () => {
  it("uses the work id as the canonical live room for saved and provisional works", () => {
    expect(
      isCanonicalCreatorStudioRealtimeScope({
        workId: "saved-work-1",
        roomId: "saved-work-1",
      }),
    ).toBe(true);
    expect(
      isCanonicalCreatorStudioRealtimeScope({
        workId: "22222222-2222-4222-8222-222222222222",
        roomId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBe(true);
  });

  it("does not treat the draft provisioning lease id as a live room id", () => {
    expect(
      isCanonicalCreatorStudioRealtimeScope({
        workId: "22222222-2222-4222-8222-222222222222",
        roomId:
          "draft-room_11111111-1111-4111-8111-111111111111",
      }),
    ).toBe(false);
  });
});

describe("CreatorStudioRealtimeTicketAuthorization", () => {
  it("maps the transactionally fenced Creator ACL snapshot without widening it", async () => {
    const getAuthorization = vi.fn().mockResolvedValue({
      workId: "work-1",
      viewer: {
        userId: "artist-1",
        role: "commenter",
        status: "active",
        capabilities: {
          view: true,
          comment: true,
          edit: false,
          manageMembers: false,
          respondInvite: false,
        },
      },
      authorizationEpoch: "2026-07-31T23:59:59.000Z",
      authorizationExpiresAt: "2026-08-01T00:00:00.000Z",
    });

    await expect(
      authorization(getAuthorization).authorize(request()),
    ).resolves.toEqual({
      allowed: true,
      ...request(),
      role: "commenter",
      creatorCapabilities: {
        view: true,
        comment: true,
        edit: false,
        manageMembers: false,
      },
      authorizationEpoch: "2026-07-31T23:59:59.000Z",
      authorizationExpiresAt: "2026-08-01T00:00:00.000Z",
    });
    expect(getAuthorization).toHaveBeenCalledWith(
      "artist-1",
      "work-1",
    );
  });

  it.each([
    {
      label: "unknown provider",
      override: { providerId: "unknown-provider" },
    },
    {
      label: "unapproved origin",
      override: { origin: "https://attacker.example" },
    },
    {
      label: "missing browser origin",
      override: { origin: null },
    },
    {
      label: "non-canonical room",
      override: {
        scope: { workId: "work-1", roomId: "other-room" },
      },
    },
  ])("denies $label before touching the Creator ACL", async ({ override }) => {
    const getAuthorization = vi.fn();

    await expect(
      authorization(getAuthorization).authorize(request(override)),
    ).resolves.toEqual({ allowed: false });
    expect(getAuthorization).not.toHaveBeenCalled();
  });

  it("authorizes public instant jam rooms without touching Creator ACL", async () => {
    const getAuthorization = vi.fn();
    const jam = request({
      actorUserId: "guest:00000000-0000-4000-8000-000000000001",
      scope: {
        workId: "work-instant-m5kabcde-i54w",
        roomId: "work-instant-m5kabcde-i54w",
      },
    });

    await expect(
      authorization(getAuthorization).authorize(jam),
    ).resolves.toMatchObject({
      allowed: true,
      actorUserId: jam.actorUserId,
      scope: jam.scope,
      role: "editor",
      creatorCapabilities: {
        view: true,
        comment: true,
        edit: true,
        manageMembers: false,
      },
    });
    expect(getAuthorization).not.toHaveBeenCalled();
  });

  it("turns repository failures into a denial without reflecting the cause", async () => {
    const getAuthorization = vi
      .fn()
      .mockRejectedValue(new Error("database-secret-detail"));

    await expect(
      authorization(getAuthorization).authorize(request()),
    ).resolves.toEqual({ allowed: false });
  });

  it.each([
    {
      label: "pending member",
      snapshot: {
        workId: "work-1",
        viewer: {
          userId: "artist-1",
          role: "editor",
          status: "pending",
          capabilities: {
            view: false,
            comment: false,
            edit: false,
            manageMembers: false,
            respondInvite: true,
          },
        },
      },
    },
    {
      label: "viewer without view capability",
      snapshot: {
        workId: "work-1",
        viewer: {
          userId: "artist-1",
          role: "viewer",
          status: "active",
          capabilities: {
            view: false,
            comment: false,
            edit: false,
            manageMembers: false,
            respondInvite: false,
          },
        },
      },
    },
    {
      label: "mismatched work",
      snapshot: {
        workId: "work-2",
        viewer: {
          userId: "artist-1",
          role: "owner",
          status: "active",
          capabilities: {
            view: true,
            comment: true,
            edit: true,
            manageMembers: true,
            respondInvite: false,
          },
        },
      },
    },
  ])("denies a $label snapshot", async ({ snapshot }) => {
    await expect(
      authorization(vi.fn().mockResolvedValue(snapshot)).authorize(
        request(),
      ),
    ).resolves.toEqual({ allowed: false });
  });
});

const GUEST_SESSION_ID = "Ab3dEf6hJkLmNpQr";
const GUEST_ACTOR_ID = `guest:${GUEST_SESSION_ID}`;
const INVITE_TOKEN = "a".repeat(43);
const INVITE_EXPIRES_AT = "2026-08-15T00:00:00.000Z";

function guestRequest(
  overrides: Partial<StudioRealtimeTicketAuthorizationInput> = {},
): StudioRealtimeTicketAuthorizationInput {
  return {
    version: 1,
    actorUserId: GUEST_ACTOR_ID,
    providerId: PROVIDER_ID,
    sessionId: "00000000-0000-4000-8000-000000000002",
    scope: { workId: "project-1", roomId: "project-1" },
    workloads: ["presence"],
    capabilities: [
      "presence.snapshot-v1",
      "presence.members-v1",
      "presence.cursor-v1",
      "presence.resume-v1",
    ],
    origin: ORIGIN,
    guestAccess: {
      kind: "invite",
      token: INVITE_TOKEN,
      guestSessionId: GUEST_SESSION_ID,
    },
    ...overrides,
  };
}

function guestAuthorization(options: {
  verifyInvite?: ReturnType<typeof vi.fn>;
  verifyEntryCode?: ReturnType<typeof vi.fn>;
  withAccessRepository?: boolean;
}): {
  authorization: CreatorStudioRealtimeTicketAuthorization;
  getAuthorization: ReturnType<typeof vi.fn>;
} {
  const getAuthorization = vi.fn();
  const accessRepository = {
    verifyInvite:
      options.verifyInvite ?? vi.fn().mockResolvedValue({ valid: false }),
    verifyEntryCode:
      options.verifyEntryCode ?? vi.fn().mockResolvedValue({ valid: false }),
  } as unknown as StudioVirtualSpaceAccessRepository;
  const instance = new CreatorStudioRealtimeTicketAuthorization(
    repository(getAuthorization),
    { providerIds: [PROVIDER_ID], allowedOrigins: [ORIGIN] },
    options.withAccessRepository === false ? undefined : accessRepository,
  );
  return { authorization: instance, getAuthorization };
}

describe("CreatorStudioRealtimeTicketAuthorization project guests", () => {
  it("authorizes an invite-qualified guest as a view-only presence viewer capped by the invite expiry", async () => {
    const verifyInvite = vi.fn().mockResolvedValue({
      valid: true,
      workspaceId: "workspace-1",
      role: "editor",
      expiresAt: INVITE_EXPIRES_AT,
    });
    const { authorization, getAuthorization } = guestAuthorization({
      verifyInvite,
    });
    const input = guestRequest();

    const decision = await authorization.authorize(input);

    expect(decision).toMatchObject({
      allowed: true,
      actorUserId: GUEST_ACTOR_ID,
      role: "viewer",
      creatorCapabilities: {
        view: true,
        comment: false,
        edit: false,
        manageMembers: false,
      },
      authorizationExpiresAt: INVITE_EXPIRES_AT,
    });
    expect(verifyInvite).toHaveBeenCalledWith({
      token: INVITE_TOKEN,
      context: { kind: "project-space", projectId: "project-1" },
    });
    expect(getAuthorization).not.toHaveBeenCalled();
  });

  it("authorizes an entry-code-qualified guest against the space id", async () => {
    const verifyEntryCode = vi.fn().mockResolvedValue({
      valid: true,
      spaceId: "project-1",
      spaceName: "스튜디오",
      expiresAt: INVITE_EXPIRES_AT,
    });
    const { authorization } = guestAuthorization({ verifyEntryCode });
    const input = guestRequest({
      guestAccess: {
        kind: "entry-code",
        code: "ABC234",
        guestSessionId: GUEST_SESSION_ID,
      },
    });

    await expect(authorization.authorize(input)).resolves.toMatchObject({
      allowed: true,
      role: "viewer",
      authorizationExpiresAt: INVITE_EXPIRES_AT,
    });
    expect(verifyEntryCode).toHaveBeenCalledWith({
      spaceId: "project-1",
      code: "ABC234",
    });
  });

  it.each([
    { label: "unknown invite", reason: "not-found" },
    { label: "revoked invite", reason: "revoked" },
    { label: "consumed invite", reason: "consumed" },
    { label: "expired invite", reason: "expired" },
    { label: "invite for another space", reason: "space-mismatch" },
  ])("denies a $label without reflecting the reason", async ({ reason }) => {
    const verifyInvite = vi
      .fn()
      .mockResolvedValue({ valid: false, reason });
    const { authorization } = guestAuthorization({ verifyInvite });

    await expect(
      authorization.authorize(guestRequest()),
    ).resolves.toEqual({ allowed: false });
  });

  it("denies a locked entry code and a repository failure the same way", async () => {
    const locked = guestAuthorization({
      verifyEntryCode: vi
        .fn()
        .mockResolvedValue({ valid: false, reason: "locked" }),
    });
    await expect(
      locked.authorization.authorize(
        guestRequest({
          guestAccess: {
            kind: "entry-code",
            code: "ABC234",
            guestSessionId: GUEST_SESSION_ID,
          },
        }),
      ),
    ).resolves.toEqual({ allowed: false });

    const failing = guestAuthorization({
      verifyInvite: vi
        .fn()
        .mockRejectedValue(new Error("database-secret-detail")),
    });
    await expect(
      failing.authorization.authorize(guestRequest()),
    ).resolves.toEqual({ allowed: false });
  });

  it.each([
    {
      label: "screen-signaling workload",
      overrides: {
        workloads: ["presence", "screen-signaling"],
        capabilities: [
          "presence.snapshot-v1",
          "screen-signaling.session-v1",
        ],
      } as Partial<StudioRealtimeTicketAuthorizationInput>,
    },
    {
      label: "comments workload",
      overrides: {
        workloads: ["comments"],
        capabilities: ["comments.invalidation-v1"],
      } as Partial<StudioRealtimeTicketAuthorizationInput>,
    },
  ])(
    "denies a guest requesting the $label before verifying the qualification",
    async ({ overrides }) => {
      const verifyInvite = vi.fn().mockResolvedValue({
        valid: true,
        workspaceId: "workspace-1",
        role: "editor",
        expiresAt: INVITE_EXPIRES_AT,
      });
      const { authorization } = guestAuthorization({ verifyInvite });

      await expect(
        authorization.authorize(guestRequest(overrides)),
      ).resolves.toEqual({ allowed: false });
      expect(verifyInvite).not.toHaveBeenCalled();
    },
  );

  it("denies when the actor is not the guest session that presented the qualification", async () => {
    const verifyInvite = vi.fn().mockResolvedValue({
      valid: true,
      workspaceId: "workspace-1",
      role: "editor",
      expiresAt: INVITE_EXPIRES_AT,
    });
    const { authorization } = guestAuthorization({ verifyInvite });

    await expect(
      authorization.authorize(
        guestRequest({ actorUserId: "guest:ZZZZZZZZZZZZZZZZ" }),
      ),
    ).resolves.toEqual({ allowed: false });
    await expect(
      authorization.authorize(guestRequest({ actorUserId: "artist-1" })),
    ).resolves.toEqual({ allowed: false });
    expect(verifyInvite).not.toHaveBeenCalled();
  });

  it("denies guest claims when no access repository is wired", async () => {
    const { authorization } = guestAuthorization({
      withAccessRepository: false,
    });

    await expect(
      authorization.authorize(guestRequest()),
    ).resolves.toEqual({ allowed: false });
  });

  it("denies guest claims on a non-canonical room before verifying", async () => {
    const verifyInvite = vi.fn();
    const { authorization } = guestAuthorization({ verifyInvite });

    await expect(
      authorization.authorize(
        guestRequest({
          scope: { workId: "project-1", roomId: "other-room" },
        }),
      ),
    ).resolves.toEqual({ allowed: false });
    expect(verifyInvite).not.toHaveBeenCalled();
  });
});
