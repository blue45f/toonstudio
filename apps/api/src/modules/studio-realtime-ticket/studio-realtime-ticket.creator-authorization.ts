import { z } from "zod";

import { isStudioLiveJamScope } from "@toonstudio/contracts/studio-live-jam-scope";
import { studioRealtimeProjectGuestActorId } from "@toonstudio/contracts/studio-live-project-guest";
import { CreatorCollaborationRepository } from "../creator/creator-collaboration.repository";
import { StudioVirtualSpaceAccessRepository } from "../studio-virtual-space-access/studio-virtual-space-access.repository";

import {
  StudioRealtimeTicketIdentifierSchema,
} from "./studio-realtime-ticket.dto";

import type {
  StudioRealtimeTicketAuthorizationDecision,
  StudioRealtimeTicketAuthorizationInput,
  StudioRealtimeTicketAuthorizationPort,
} from "./studio-realtime-ticket.authorization";

const CreatorRealtimeAuthorizationSnapshotSchema = z
  .object({
    workId: StudioRealtimeTicketIdentifierSchema,
    viewer: z.object({
      userId: StudioRealtimeTicketIdentifierSchema,
      role: z.enum(["owner", "admin", "editor", "commenter", "viewer"]),
      status: z.enum(["pending", "active", "declined"]),
      // 저장소가 반환하는 CreatorCollaborationAccess와 키 집합이 정확히 일치해야 한다.
      // .strict() 검증이라 키가 하나라도 어긋나면 저장 작품 전원의 티켓이 거부되므로,
      // 실제 저장소 스냅샷을 쓰는 통합 테스트(creator-authorization.integration)가
      // 이 형태를 고정한다.
      capabilities: z
        .object({
          view: z.boolean(),
          comment: z.boolean(),
          edit: z.boolean(),
          manageMembers: z.boolean(),
          respondInvite: z.boolean(),
        })
        .strict(),
    }),
    authorizationEpoch: z.iso.datetime({ offset: true }),
    authorizationExpiresAt: z.iso.datetime({ offset: true }).optional(),
  });

const CanonicalHttpsOriginSchema = z
  .string()
  .url()
  .max(256)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        url.origin === value &&
        url.pathname === "/" &&
        url.search === "" &&
        url.hash === "" &&
        url.username === "" &&
        url.password === ""
      );
    } catch {
      return false;
    }
  });

const CreatorStudioRealtimeAuthorizationConfigurationSchema = z
  .object({
    providerIds: z
      .array(StudioRealtimeTicketIdentifierSchema)
      .min(1)
      .max(16)
      .refine((values) => new Set(values).size === values.length),
    allowedOrigins: z
      .array(CanonicalHttpsOriginSchema)
      .min(1)
      .max(32)
      .refine((values) => new Set(values).size === values.length),
  })
  .strict();

export interface CreatorStudioRealtimeAuthorizationConfiguration {
  readonly providerIds: readonly string[];
  readonly allowedOrigins: readonly string[];
}

/**
 * Existing Studio Socket.IO rooms are keyed only by `workId`, including provisional
 * collaboration works. The separate `draft-room_<uuid>` value is a provisioning/lease
 * record identifier and is not a live transport room. Protocol v1 therefore uses the
 * canonical work id for both signed scope fields.
 */
export function isCanonicalCreatorStudioRealtimeScope(scope: {
  readonly workId: string;
  readonly roomId: string;
}): boolean {
  return scope.workId === scope.roomId;
}

export class CreatorStudioRealtimeTicketAuthorization
implements StudioRealtimeTicketAuthorizationPort {
  private readonly providerIds: ReadonlySet<string>;
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(
    private readonly collaborationRepository: CreatorCollaborationRepository,
    unsafeConfiguration: CreatorStudioRealtimeAuthorizationConfiguration,
    /**
     * 게스트 자격 검증 저장소. 주입되지 않으면 게스트 분기는 전부
     * 거부한다 — 어댑터 부재를 공개 접근으로 해석하지 않는다는
     * 이 모듈의 원칙(DenyAll)과 같은 방향이다.
     */
    private readonly spaceAccessRepository?: StudioVirtualSpaceAccessRepository,
  ) {
    const configuration =
      CreatorStudioRealtimeAuthorizationConfigurationSchema.parse(
        unsafeConfiguration,
      );
    this.providerIds = new Set(configuration.providerIds);
    this.allowedOrigins = new Set(configuration.allowedOrigins);
  }

  async authorize(
    input: StudioRealtimeTicketAuthorizationInput,
  ): Promise<StudioRealtimeTicketAuthorizationDecision> {
    if (
      input.origin === null ||
      !this.allowedOrigins.has(input.origin) ||
      !this.providerIds.has(input.providerId) ||
      !isCanonicalCreatorStudioRealtimeScope(input.scope)
    ) {
      return { allowed: false };
    }

    if (isStudioLiveJamScope(input.scope)) {
      return {
        allowed: true,
        ...input,
        role: "editor",
        creatorCapabilities: {
          view: true,
          comment: true,
          edit: true,
          manageMembers: false,
        },
        authorizationEpoch: new Date().toISOString(),
      };
    }

    if (input.guestAccess) {
      return this.authorizeProjectGuest(input);
    }

    let unsafeAuthorization: unknown;
    try {
      unsafeAuthorization =
        await this.collaborationRepository.getAuthorization(
          input.actorUserId,
          input.scope.workId,
        );
    } catch {
      return { allowed: false };
    }
    const authorization =
      CreatorRealtimeAuthorizationSnapshotSchema.safeParse(
        unsafeAuthorization,
      );
    if (
      !authorization.success ||
      authorization.data.workId !== input.scope.workId ||
      authorization.data.viewer.userId !== input.actorUserId ||
      authorization.data.viewer.status !== "active" ||
      !authorization.data.viewer.capabilities.view
    ) {
      return { allowed: false };
    }

    const { capabilities } = authorization.data.viewer;
    return {
      allowed: true,
      ...input,
      role: authorization.data.viewer.role,
      // respondInvite는 초대 응답 전용 권한이라 실시간 티켓의 creator capabilities
      // 계약에는 포함하지 않고 여기서 투영해 제외한다. 이 값이 true인 경우는
      // status가 pending일 때뿐이며 위의 status 검사에서 이미 거부되므로,
      // 이 투영이 실시간 접근을 넓히지 않는다.
      creatorCapabilities: {
        view: capabilities.view,
        comment: capabilities.comment,
        edit: capabilities.edit,
        manageMembers: capabilities.manageMembers,
      },
      authorizationEpoch: authorization.data.authorizationEpoch,
      ...(authorization.data.authorizationExpiresAt === undefined
        ? {}
        : {
            authorizationExpiresAt:
              authorization.data.authorizationExpiresAt,
          }),
    };
  }

  /**
   * 프로젝트 공간 게스트 인가. 자격 판정은 게스트 검증의 정본인
   * StudioVirtualSpaceAccessRepository에 위임하고, 여기서는 그 결과를
   * 티켓 계약으로 투영만 한다:
   *
   * - actor는 컨트롤러가 합성한 게스트 세션 신원과 정확히 묶여야 한다
   *   (계정 사용자가 게스트 분기로 새거나, 세션을 바꿔 끼우는 것 차단).
   * - 워크로드는 presence만 허용한다. screen-signaling·comments는
   *   게스트에게 열지 않으며, 요청에 섞이면 자격과 무관하게 거부한다.
   * - 권한은 view뿐인 viewer로 고정하고, 자격 만료를 결정의
   *   authorizationExpiresAt으로 실어 서명자가 티켓 수명을 캡하게 한다.
   * - 검증 실패·저장소 오류는 사유를 반영하지 않고 거부로 수렴한다
   *   (초대의 존재 여부가 응답으로 새지 않게).
   */
  private async authorizeProjectGuest(
    input: StudioRealtimeTicketAuthorizationInput,
  ): Promise<StudioRealtimeTicketAuthorizationDecision> {
    const guestAccess = input.guestAccess;
    if (
      !guestAccess ||
      !this.spaceAccessRepository ||
      input.actorUserId !==
        studioRealtimeProjectGuestActorId(guestAccess.guestSessionId) ||
      !input.workloads.every((workload) => workload === "presence")
    ) {
      return { allowed: false };
    }

    let verification: { valid: true; expiresAt: string } | { valid: false };
    try {
      if (guestAccess.kind === "invite") {
        const result = await this.spaceAccessRepository.verifyInvite({
          token: guestAccess.token,
          context: {
            kind: "project-space",
            projectId: input.scope.workId,
          },
        });
        verification = result.valid
          ? { valid: true, expiresAt: result.expiresAt }
          : { valid: false };
      } else {
        const result = await this.spaceAccessRepository.verifyEntryCode({
          spaceId: input.scope.workId,
          code: guestAccess.code,
        });
        verification = result.valid
          ? { valid: true, expiresAt: result.expiresAt }
          : { valid: false };
      }
    } catch {
      return { allowed: false };
    }
    if (!verification.valid) {
      return { allowed: false };
    }

    return {
      allowed: true,
      ...input,
      role: "viewer",
      creatorCapabilities: {
        view: true,
        comment: false,
        edit: false,
        manageMembers: false,
      },
      authorizationEpoch: new Date().toISOString(),
      authorizationExpiresAt: verification.expiresAt,
    };
  }
}
