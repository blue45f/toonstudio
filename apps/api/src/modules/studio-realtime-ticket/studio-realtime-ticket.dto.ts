import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const STUDIO_REALTIME_TICKET_PROTOCOL_VERSION = 1 as const;
export const STUDIO_REALTIME_TICKET_MAX_LIFETIME_MS = 2 * 60 * 1_000;

const noControlCharacters = (
  value: string,
  rejectSpace = false,
): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint <= (rejectSpace ? 0x20 : 0x1f) ||
      (codePoint >= 0x7f && codePoint <= 0x9f)
    ) {
      return false;
    }
  }
  return true;
};

export const StudioRealtimeTicketIdentifierSchema = z
  .string()
  .min(1)
  .max(160)
  .refine((value) => value === value.trim(), "identifier must be canonical")
  .refine(noControlCharacters, "control characters are not allowed");

export const StudioRealtimeTicketWorkloadSchema = z.enum([
  "presence",
  "comments",
  "screen-signaling",
]);

export const StudioRealtimeTicketCapabilitySchema = z.enum([
  "presence.snapshot-v1",
  "presence.members-v1",
  "presence.cursor-v1",
  "presence.resume-v1",
  "comments.invalidation-v1",
  "comments.resume-v1",
  "screen-signaling.session-v1",
  "screen-signaling.webrtc-v1",
  "screen-signaling.resume-v1",
]);

export type StudioRealtimeTicketWorkload = z.infer<
  typeof StudioRealtimeTicketWorkloadSchema
>;
export type StudioRealtimeTicketCapability = z.infer<
  typeof StudioRealtimeTicketCapabilitySchema
>;

export const STUDIO_REALTIME_TICKET_CAPABILITY_WORKLOAD: Readonly<
  Record<StudioRealtimeTicketCapability, StudioRealtimeTicketWorkload>
> = Object.freeze({
  "presence.snapshot-v1": "presence",
  "presence.members-v1": "presence",
  "presence.cursor-v1": "presence",
  "presence.resume-v1": "presence",
  "comments.invalidation-v1": "comments",
  "comments.resume-v1": "comments",
  "screen-signaling.session-v1": "screen-signaling",
  "screen-signaling.webrtc-v1": "screen-signaling",
  "screen-signaling.resume-v1": "screen-signaling",
});

const uniqueList = <Item extends string>(values: readonly Item[]): boolean =>
  new Set(values).size === values.length;

export const StudioRealtimeTicketWorkloadListSchema = z
  .array(StudioRealtimeTicketWorkloadSchema)
  .min(1)
  .max(3)
  .refine(uniqueList, "workloads must be unique");

export const StudioRealtimeTicketCapabilityListSchema = z
  .array(StudioRealtimeTicketCapabilitySchema)
  .min(1)
  .max(32)
  .refine(uniqueList, "capabilities must be unique");

export const StudioRealtimeTicketScopeSchema = z
  .object({
    workId: StudioRealtimeTicketIdentifierSchema,
    roomId: StudioRealtimeTicketIdentifierSchema,
  })
  .strict();

/**
 * 프로젝트 공간 게스트 자격 제시. 형식은 게스트 자격 검증의 정본인
 * studio-virtual-space-access DTO와 정확히 같은 규칙을 쓴다:
 * 초대 토큰은 43자, 입장코드는 혼동 문자를 제외한 6자(정규화 후),
 * 게스트 세션 ID는 웹 게스트 세션과 같은 16자다. 자격의 유효성
 * 자체는 여기서 판정하지 않고 인가 어댑터가 검증 저장소에 위임한다.
 */
export const StudioRealtimeTicketGuestSessionIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16}$/u, "guest session id format is invalid");

export const StudioRealtimeTicketGuestAccessSchema = z.discriminatedUnion(
  "kind",
  [
    z
      .object({
        kind: z.literal("invite"),
        token: z.string().regex(
          /^[A-Za-z0-9_-]{43}$/u,
          "invite token format is invalid",
        ),
        guestSessionId: StudioRealtimeTicketGuestSessionIdSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("entry-code"),
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-HJ-NP-Z2-9]{6}$/u, "entry code format is invalid"),
        guestSessionId: StudioRealtimeTicketGuestSessionIdSchema,
      })
      .strict(),
  ],
);

export type StudioRealtimeTicketGuestAccess = z.infer<
  typeof StudioRealtimeTicketGuestAccessSchema
>;

function validateCapabilityWorkloads(
  workloads: readonly StudioRealtimeTicketWorkload[],
  capabilities: readonly StudioRealtimeTicketCapability[],
  context: z.core.$RefinementCtx,
): void {
  const workloadSet = new Set(workloads);
  for (let index = 0; index < capabilities.length; index += 1) {
    const capability = capabilities[index];
    if (!workloadSet.has(STUDIO_REALTIME_TICKET_CAPABILITY_WORKLOAD[capability])) {
      context.addIssue({
        code: "custom",
        path: ["capabilities", index],
        message: "capability belongs to a workload that was not requested",
      });
    }
  }
}

export const IssueStudioRealtimeTicketSchema = z
  .object({
    version: z.literal(STUDIO_REALTIME_TICKET_PROTOCOL_VERSION),
    providerId: StudioRealtimeTicketIdentifierSchema,
    sessionId: StudioRealtimeTicketIdentifierSchema,
    scope: StudioRealtimeTicketScopeSchema,
    workloads: StudioRealtimeTicketWorkloadListSchema,
    capabilities: StudioRealtimeTicketCapabilityListSchema,
    // 게스트 자격 제시는 선택 필드다. 계정 세션 경로는 이 필드를
    // 쓰지 않으며, 있어도 세션 인가가 우선한다(컨트롤러 분기 순서).
    guestAccess: StudioRealtimeTicketGuestAccessSchema.optional(),
  })
  .strict()
  .superRefine((request, context) => {
    validateCapabilityWorkloads(
      request.workloads,
      request.capabilities,
      context,
    );
  });

export const StudioRealtimeTicketOpaqueTokenSchema = z
  .string()
  .min(32)
  .max(8_192)
  .refine(
    (value) => noControlCharacters(value, true),
    "ticket contains whitespace or control characters",
  );

export const StudioRealtimeTicketResponseSchema = z
  .object({
    version: z.literal(STUDIO_REALTIME_TICKET_PROTOCOL_VERSION),
    providerId: StudioRealtimeTicketIdentifierSchema,
    scope: StudioRealtimeTicketScopeSchema,
    workloads: StudioRealtimeTicketWorkloadListSchema,
    capabilities: StudioRealtimeTicketCapabilityListSchema,
    issuedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    ticket: StudioRealtimeTicketOpaqueTokenSchema,
  })
  .strict()
  .superRefine((ticket, context) => {
    validateCapabilityWorkloads(
      ticket.workloads,
      ticket.capabilities,
      context,
    );
    const issuedAt = Date.parse(ticket.issuedAt);
    const expiresAt = Date.parse(ticket.expiresAt);
    const lifetimeMs = expiresAt - issuedAt;
    if (
      !Number.isFinite(lifetimeMs) ||
      lifetimeMs <= 0 ||
      lifetimeMs > STUDIO_REALTIME_TICKET_MAX_LIFETIME_MS
    ) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: "ticket lifetime is outside the short-lived boundary",
      });
    }
  });

export class IssueStudioRealtimeTicketDto extends createZodDto(
  IssueStudioRealtimeTicketSchema,
) {}

export class StudioRealtimeTicketResponseDto extends createZodDto(
  StudioRealtimeTicketResponseSchema,
) {}

export type IssueStudioRealtimeTicket = z.infer<
  typeof IssueStudioRealtimeTicketSchema
>;
export type StudioRealtimeTicketScope = z.infer<
  typeof StudioRealtimeTicketScopeSchema
>;
export type StudioRealtimeTicketResponse = z.infer<
  typeof StudioRealtimeTicketResponseSchema
>;
