import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  getSessionAuthenticationPrincipal,
  getSessionAuthenticationSource,
} from "../../session-middleware";

import { StudioRealtimeTicketController } from "./studio-realtime-ticket.controller";

vi.mock("../../session-middleware", () => ({
  getSessionAuthenticationPrincipal: vi.fn(),
  getSessionAuthenticationSource: vi.fn(),
}));

const PRINCIPAL = {
  userId: "owner",
  sessionVersion: 7,
  expiresAt: Date.parse("2026-07-31T02:00:00.000Z"),
} as const;

const REQUEST = {
  version: 1,
  providerId: "cloudflare-realtime-seoul",
  sessionId: "session-1",
  scope: { workId: "work-1", roomId: "room-1" },
  workloads: ["presence"],
  capabilities: ["presence.snapshot-v1"],
} as const;

const GUEST_SESSION_ID = "Ab3dEf6hJkLmNpQr";
const GUEST_REQUEST = {
  version: 1,
  providerId: "cloudflare-realtime-seoul",
  sessionId: "00000000-0000-4000-8000-000000000002",
  scope: { workId: "project-1", roomId: "project-1" },
  workloads: ["presence"],
  capabilities: ["presence.snapshot-v1"],
  guestAccess: {
    kind: "invite",
    token: "T".repeat(43),
    guestSessionId: GUEST_SESSION_ID,
  },
} as const;

describe("StudioRealtimeTicketController", () => {
  it("requires an HttpOnly-cookie-authenticated middleware identity", () => {
    const issue = vi.fn();
    const controller = new StudioRealtimeTicketController({ issue } as never);
    const request = {} as never;

    vi.mocked(getSessionAuthenticationSource).mockReturnValue(null);
    vi.mocked(getSessionAuthenticationPrincipal).mockReturnValue(null);
    expect(() => controller.issue(request, undefined, REQUEST))
      .toThrow(UnauthorizedException);
    vi.mocked(getSessionAuthenticationSource).mockReturnValue("header");
    vi.mocked(getSessionAuthenticationPrincipal).mockReturnValue(PRINCIPAL);
    expect(() => controller.issue(request, undefined, REQUEST))
      .toThrow(UnauthorizedException);
    vi.mocked(getSessionAuthenticationSource).mockReturnValue("cookie");
    vi.mocked(getSessionAuthenticationPrincipal).mockReturnValue(null);
    expect(() => controller.issue(request, undefined, REQUEST))
      .toThrow(UnauthorizedException);
    expect(issue).not.toHaveBeenCalled();
  });

  it("mints a guest principal only for Magma-style instant jam rooms", async () => {
    const jam = {
      ...REQUEST,
      sessionId: "00000000-0000-4000-8000-000000000001",
      scope: {
        workId: "work-instant-m5kabcde-i54w",
        roomId: "work-instant-m5kabcde-i54w",
      },
    } as const;
    const response = {
      version: 1,
      providerId: jam.providerId,
      scope: jam.scope,
      workloads: jam.workloads,
      capabilities: jam.capabilities,
      ticket: `${"a".repeat(80)}.${"b".repeat(43)}`,
      issuedAt: "2026-07-31T01:00:00.000Z",
      expiresAt: "2026-07-31T01:02:00.000Z",
    } as const;
    const issue = vi.fn(async () => response);
    const controller = new StudioRealtimeTicketController({ issue } as never);
    const request = {} as never;
    vi.mocked(getSessionAuthenticationSource).mockReturnValue(null);
    vi.mocked(getSessionAuthenticationPrincipal).mockReturnValue(null);

    await expect(
      controller.issue(request, "https://www.toonstudio.cloud", jam),
    ).resolves.toBe(response);
    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "guest:00000000-0000-4000-8000-000000000001",
        sessionVersion: 1,
      }),
      "https://www.toonstudio.cloud",
      jam,
    );

    issue.mockClear();
    expect(() =>
      controller.issue(request, "https://www.toonstudio.cloud", REQUEST),
    ).toThrow(UnauthorizedException);
    expect(issue).not.toHaveBeenCalled();
  });

  it("mints a project guest principal only from a guest access claim", async () => {
    const response = {
      version: 1,
      providerId: GUEST_REQUEST.providerId,
      scope: GUEST_REQUEST.scope,
      workloads: GUEST_REQUEST.workloads,
      capabilities: GUEST_REQUEST.capabilities,
      ticket: `${"a".repeat(80)}.${"b".repeat(43)}`,
      issuedAt: "2026-07-31T01:00:00.000Z",
      expiresAt: "2026-07-31T01:02:00.000Z",
    } as const;
    const issue = vi.fn(async () => response);
    const controller = new StudioRealtimeTicketController({ issue } as never);
    const request = {} as never;
    vi.mocked(getSessionAuthenticationSource).mockReturnValue(null);
    vi.mocked(getSessionAuthenticationPrincipal).mockReturnValue(null);

    await expect(
      controller.issue(request, "https://www.toonstudio.cloud", GUEST_REQUEST),
    ).resolves.toBe(response);
    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: `guest:${GUEST_SESSION_ID}`,
        sessionVersion: 1,
      }),
      "https://www.toonstudio.cloud",
      GUEST_REQUEST,
    );
  });

  it("does not mint a project guest principal for header sources or malformed session ids", async () => {
    const issue = vi.fn();
    const controller = new StudioRealtimeTicketController({ issue } as never);
    const request = {} as never;
    vi.mocked(getSessionAuthenticationPrincipal).mockReturnValue(null);

    vi.mocked(getSessionAuthenticationSource).mockReturnValue("header");
    expect(() =>
      controller.issue(request, "https://www.toonstudio.cloud", GUEST_REQUEST),
    ).toThrow(UnauthorizedException);

    vi.mocked(getSessionAuthenticationSource).mockReturnValue(null);
    const malformed = {
      ...GUEST_REQUEST,
      guestAccess: {
        ...GUEST_REQUEST.guestAccess,
        guestSessionId: "too-short",
      },
    } as const;
    expect(() =>
      controller.issue(request, "https://www.toonstudio.cloud", malformed),
    ).toThrow(UnauthorizedException);
    expect(issue).not.toHaveBeenCalled();
  });

  it("keeps the jam guest principal ahead of a project guest claim on jam scopes", async () => {
    const jamGuest = {
      ...GUEST_REQUEST,
      scope: {
        workId: "work-instant-m5kabcde-i54w",
        roomId: "work-instant-m5kabcde-i54w",
      },
    } as const;
    const response = {
      version: 1,
      providerId: jamGuest.providerId,
      scope: jamGuest.scope,
      workloads: jamGuest.workloads,
      capabilities: jamGuest.capabilities,
      ticket: `${"a".repeat(80)}.${"b".repeat(43)}`,
      issuedAt: "2026-07-31T01:00:00.000Z",
      expiresAt: "2026-07-31T01:02:00.000Z",
    } as const;
    const issue = vi.fn(async () => response);
    const controller = new StudioRealtimeTicketController({ issue } as never);
    const request = {} as never;
    vi.mocked(getSessionAuthenticationSource).mockReturnValue(null);
    vi.mocked(getSessionAuthenticationPrincipal).mockReturnValue(null);

    await expect(
      controller.issue(request, "https://www.toonstudio.cloud", jamGuest),
    ).resolves.toBe(response);
    expect(issue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: `guest:${jamGuest.sessionId}`,
        sessionVersion: 1,
      }),
      "https://www.toonstudio.cloud",
      jamGuest,
    );
  });

  it("prefers the cookie principal when a session and a guest claim are both present", async () => {
    const response = {
      version: 1,
      providerId: GUEST_REQUEST.providerId,
      scope: GUEST_REQUEST.scope,
      workloads: GUEST_REQUEST.workloads,
      capabilities: GUEST_REQUEST.capabilities,
      ticket: `${"a".repeat(80)}.${"b".repeat(43)}`,
      issuedAt: "2026-07-31T01:00:00.000Z",
      expiresAt: "2026-07-31T01:02:00.000Z",
    } as const;
    const issue = vi.fn(async () => response);
    const controller = new StudioRealtimeTicketController({ issue } as never);
    const request = {} as never;
    vi.mocked(getSessionAuthenticationSource).mockReturnValue("cookie");
    vi.mocked(getSessionAuthenticationPrincipal).mockReturnValue(PRINCIPAL);

    await expect(
      controller.issue(request, "https://www.toonstudio.cloud", GUEST_REQUEST),
    ).resolves.toBe(response);
    expect(issue).toHaveBeenCalledWith(
      PRINCIPAL,
      "https://www.toonstudio.cloud",
      GUEST_REQUEST,
    );
  });

  it("delegates only the authenticated identity, origin, and strict request body", async () => {
    const response = {
      version: 1,
      providerId: REQUEST.providerId,
      scope: REQUEST.scope,
      workloads: REQUEST.workloads,
      capabilities: REQUEST.capabilities,
      ticket: `${"a".repeat(80)}.${"b".repeat(43)}`,
      issuedAt: "2026-07-31T01:00:00.000Z",
      expiresAt: "2026-07-31T01:02:00.000Z",
    } as const;
    const issue = vi.fn(async () => response);
    const controller = new StudioRealtimeTicketController({ issue } as never);
    const request = {} as never;
    vi.mocked(getSessionAuthenticationSource).mockReturnValue("cookie");
    vi.mocked(getSessionAuthenticationPrincipal).mockReturnValue(PRINCIPAL);

    await expect(
      controller.issue(
        request,
        "https://www.toonstudio.cloud",
        REQUEST,
      ),
    ).resolves.toBe(response);
    expect(issue).toHaveBeenCalledWith(
      PRINCIPAL,
      "https://www.toonstudio.cloud",
      REQUEST,
    );
  });
});
