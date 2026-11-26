import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { BadRequestException, ForbiddenException, Injectable, Optional } from "@nestjs/common";
import {
  SECURITY_ROLE_CATALOG,
  canAssignTargetRole,
  createSecurityAuditEntry,
  evaluateSecurityPermission,
  type RbacEvaluationResult,
  type RoleAssignmentRecord,
  type SecurityAuditEntry,
  type SecurityPermissionId,
  type SecurityRoleId,
  type SecurityScopeType,
} from "@toonstudio/contracts/studio-security-rbac";

import { StudioEcosystemEventsService } from "./studio-ecosystem-events.service";

export interface EcosystemCafePostAttachmentInput {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly dataUrl: string;
  readonly caption?: string;
  readonly spoilerBlur?: boolean;
}

export interface EcosystemCafePostRecord {
  readonly id: string;
  readonly cafeId: string;
  readonly scope: SecurityScopeType;
  readonly channel: string;
  readonly authorName: string;
  readonly title: string;
  readonly body: string;
  readonly attachments: readonly EcosystemCafePostAttachmentInput[];
  readonly createdAt: string;
}

export interface EcosystemPlazaPartyRecord {
  readonly partyId: string;
  readonly title: string;
  readonly studioName: string;
  readonly genre: string;
  readonly slots: {
    readonly slotId: string;
    readonly roleCode: string;
    readonly requiredCount: number;
    readonly filledAvatarIds: string[];
    readonly budgetPerCutKrw: number;
    readonly urgent: boolean;
  }[];
}

export type PlazaPresenceAvailability = "urgent-sub-ready" | "online-ready" | "busy";

export interface EcosystemPlazaMessageRecord {
  readonly id: string;
  readonly partyId: string | null;
  readonly senderName: string;
  readonly roleLabel: string;
  readonly text: string;
  readonly createdAt: string;
}

export interface EcosystemPlazaPresenceRecord {
  readonly userId: string;
  readonly nickname: string;
  readonly roleCode: string;
  readonly availability: PlazaPresenceAvailability;
  readonly tools: readonly string[];
  readonly cutRateKrw: number;
  readonly updatedAt: string;
}

const ALLOWED_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_CAFE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_CAFE_IMAGES = 8;

@Injectable()
export class StudioEcosystemService {
  private readonly stateFilePath = process.env.TOONSTUDIO_ECOSYSTEM_STATE_FILE?.trim() || "";

  constructor(
    @Optional() private readonly events?: StudioEcosystemEventsService,
  ) {
    this.loadPersistedState();
  }

  private loadPersistedState() {
    if (!this.stateFilePath || !existsSync(this.stateFilePath)) return;
    try {
      const raw = JSON.parse(readFileSync(this.stateFilePath, "utf8")) as {
        assignments?: RoleAssignmentRecord[];
        auditLogs?: SecurityAuditEntry[];
        cafePosts?: EcosystemCafePostRecord[];
        plazaParties?: EcosystemPlazaPartyRecord[];
        plazaMessages?: EcosystemPlazaMessageRecord[];
        plazaPresence?: EcosystemPlazaPresenceRecord[];
      };
      if (Array.isArray(raw.assignments)) {
        for (const item of raw.assignments) {
          if (item?.userId) this.assignments.set(item.userId, item);
        }
      }
      if (Array.isArray(raw.auditLogs)) {
        this.auditLogs.splice(0, this.auditLogs.length, ...raw.auditLogs.slice(0, 200));
      }
      if (Array.isArray(raw.cafePosts)) {
        this.cafePosts.splice(0, this.cafePosts.length, ...raw.cafePosts.slice(0, 200));
      }
      if (Array.isArray(raw.plazaParties) && raw.plazaParties.length > 0) {
        this.plazaParties.splice(0, this.plazaParties.length, ...raw.plazaParties.slice(0, 100));
      }
      if (Array.isArray(raw.plazaMessages) && raw.plazaMessages.length > 0) {
        this.plazaMessages.splice(0, this.plazaMessages.length, ...raw.plazaMessages.slice(0, 100));
      }
      if (Array.isArray(raw.plazaPresence)) {
        for (const p of raw.plazaPresence) {
          if (p?.userId) this.plazaPresence.set(p.userId, p);
        }
      }
    } catch {
      // 손상된 스냅샷 파일은 무시하고 기본 시드 상태로 기동한다.
    }
  }

  private persistState() {
    if (!this.stateFilePath) return;
    try {
      mkdirSync(dirname(this.stateFilePath), { recursive: true });
      writeFileSync(
        this.stateFilePath,
        JSON.stringify(
          {
            assignments: [...this.assignments.values()],
            auditLogs: this.auditLogs.slice(0, 200),
            cafePosts: this.cafePosts.slice(0, 200),
            plazaParties: this.plazaParties.slice(0, 100),
            plazaMessages: this.plazaMessages.slice(0, 100),
            plazaPresence: [...this.plazaPresence.values()],
          },
          null,
          2,
        ),
        "utf8",
      );
    } catch {
      // 디스크 쓰기 실패 시 메모리 상태는 유지한다.
    }
  }

  private readonly assignments = new Map<string, RoleAssignmentRecord>([
    [
      "u-owner",
      {
        userId: "u-owner",
        displayName: "스튜디오 대표",
        roleId: "studio_owner",
        scopeType: "studio",
        scopeId: "studio-chronicle",
      },
    ],
    [
      "u-line",
      {
        userId: "u-line",
        displayName: "선화 어시스턴트",
        roleId: "line_assistant",
        scopeType: "work",
        scopeId: "work-gate-breaker",
      },
    ],
    [
      "u-guest",
      {
        userId: "u-guest",
        displayName: "외부 검수자",
        roleId: "guest_reviewer",
        scopeType: "project",
        scopeId: "proj-s2-relaunch",
      },
    ],
  ]);

  private readonly auditLogs: SecurityAuditEntry[] = [];
  private readonly cafePosts: EcosystemCafePostRecord[] = [];
  private readonly plazaPresence = new Map<string, EcosystemPlazaPresenceRecord>();
  private readonly plazaMessages: EcosystemPlazaMessageRecord[] = [
    {
      id: "plaza-msg-seed-1",
      partyId: "party-gate-01",
      senderName: "스튜디오 크로니클 PD",
      roleLabel: "파티장",
      text: "오늘 밤 11시까지 48화 액션 12컷 선화 대타 가능한 분 계신가요? .clip 원본 그대로 넘겨드립니다.",
      createdAt: "2026-11-26T06:00:00.000Z",
    },
    {
      id: "plaza-msg-seed-2",
      partyId: "party-gate-01",
      senderName: "펜선장인_루나",
      roleLabel: "선화·펜선",
      text: "클튜 EX 작업 중이라 바로 투입 가능합니다! 브러시 가이드만 공유 검수방에 올려주세요.",
      createdAt: "2026-11-26T06:02:00.000Z",
    },
  ];
  private readonly plazaParties: EcosystemPlazaPartyRecord[] = [
    {
      partyId: "party-gate-01",
      title: "[긴급] 헌터 액션 주간연재 3인 파티 모집",
      studioName: "스튜디오 크로니클",
      genre: "modern-fantasy",
      slots: [
        { slotId: "s-line", roleCode: "001.003", requiredCount: 1, filledAvatarIds: [], budgetPerCutKrw: 18000, urgent: true },
        { slotId: "s-vfx", roleCode: "001.011", requiredCount: 1, filledAvatarIds: [], budgetPerCutKrw: 15000, urgent: false },
        { slotId: "s-bg3d", roleCode: "001.021", requiredCount: 1, filledAvatarIds: [], budgetPerCutKrw: 22000, urgent: false },
      ],
    },
  ];

  listRoles() {
    return { roles: SECURITY_ROLE_CATALOG };
  }

  evaluatePermission(input: {
    readonly userId: string;
    readonly permission: SecurityPermissionId;
    readonly clientIp?: string;
  }): RbacEvaluationResult {
    const assignment = this.assignments.get(input.userId) ?? {
      userId: input.userId,
      displayName: "미지정 게스트",
      roleId: "guest_reviewer" as const,
      scopeType: "project" as const,
      scopeId: "default",
    };
    return evaluateSecurityPermission(assignment, input.permission, input.clientIp);
  }

  assignRole(input: {
    readonly actorUserId: string;
    readonly targetUserId: string;
    readonly displayName: string;
    readonly roleId: SecurityRoleId;
    readonly scopeType: SecurityScopeType;
    readonly scopeId: string;
  }): { readonly assignment: RoleAssignmentRecord; readonly audit: SecurityAuditEntry } {
    const actor = this.assignments.get(input.actorUserId);
    if (!actor || !canAssignTargetRole(actor.roleId, input.roleId)) {
      throw new ForbiddenException("해당 보안 역할을 부여할 수 있는 권한이 없습니다.");
    }

    const previousRole = this.assignments.get(input.targetUserId)?.roleId ?? "none";
    const assignment: RoleAssignmentRecord = {
      userId: input.targetUserId,
      displayName: input.displayName.trim() || input.targetUserId,
      roleId: input.roleId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
    };
    this.assignments.set(input.targetUserId, assignment);

    const audit = createSecurityAuditEntry({
      actorUserId: input.actorUserId,
      action: `role.assigned:${previousRole}->${input.roleId}`,
      targetUserId: input.targetUserId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
    });
    this.auditLogs.unshift(audit);
    this.persistState();
    this.events?.emit("rbac.role_assigned", { targetUserId: input.targetUserId, roleId: input.roleId, scopeType: input.scopeType, scopeId: input.scopeId });
    return { assignment, audit };
  }

  listAuditLogs() {
    return { items: this.auditLogs.slice(0, 50) };
  }

  listPlazaParties() {
    return { parties: this.plazaParties };
  }

  createPlazaParty(input: {
    readonly title: string;
    readonly studioName: string;
    readonly genre: string;
    readonly roleCode: string;
    readonly budgetPerCutKrw: number;
    readonly urgent?: boolean;
  }): EcosystemPlazaPartyRecord {
    const cleanTitle = input.title.trim();
    if (cleanTitle.length < 2) {
      throw new BadRequestException("파티 모집 제목은 2자 이상이어야 합니다.");
    }
    const party: EcosystemPlazaPartyRecord = {
      partyId: `party-${this.plazaParties.length + 1}-${Date.now().toString(36)}`,
      title: cleanTitle,
      studioName: input.studioName.trim() || "독립 스튜디오",
      genre: input.genre.trim() || "modern-fantasy",
      slots: [
        {
          slotId: `slot-${Date.now().toString(36)}`,
          roleCode: input.roleCode.trim() || "001.003",
          requiredCount: 1,
          filledAvatarIds: [],
          budgetPerCutKrw: Math.max(5000, Math.round(input.budgetPerCutKrw || 15000)),
          urgent: Boolean(input.urgent),
        },
      ],
    };
    this.plazaParties.unshift(party);
    this.persistState();
    this.events?.emit("plaza.party_created", { partyId: party.partyId, title: party.title, genre: party.genre });
    return party;
  }

  assignPlazaSlot(partyId: string, slotId: string, avatarId: string) {
    const party = this.plazaParties.find((p) => p.partyId === partyId);
    if (!party) throw new BadRequestException("존재하지 않는 구인 광장 파티입니다.");
    const slot = party.slots.find((s) => s.slotId === slotId);
    if (!slot) throw new BadRequestException("존재하지 않는 파티 슬롯입니다.");
    const handoffReviewPath = `/collaborate/workspace?party=${encodeURIComponent(partyId)}&slot=${encodeURIComponent(slotId)}`;
    if (slot.filledAvatarIds.includes(avatarId)) {
      return {
        party,
        assigned: true,
        brokerageFeeRate: 0 as const,
        handoffReviewPath,
      };
    }
    if (slot.filledAvatarIds.length >= slot.requiredCount) {
      throw new BadRequestException("해당 파티 슬롯 정원이 이미 마감되었습니다.");
    }
    slot.filledAvatarIds.push(avatarId);
    this.persistState();
    this.events?.emit("plaza.slot_assigned", {
      partyId,
      slotId,
      avatarId,
      handoffReviewPath,
    });
    return {
      party,
      assigned: true,
      brokerageFeeRate: 0 as const,
      handoffReviewPath,
    };
  }

  listPlazaMessages(partyId?: string) {
    const cleanPartyId = partyId?.trim() || null;
    const items = cleanPartyId
      ? this.plazaMessages.filter(
          (m) => m.partyId === cleanPartyId || m.partyId === null,
        )
      : this.plazaMessages;
    return { items: items.slice(0, 50) };
  }

  postPlazaMessage(input: {
    readonly partyId?: string | null;
    readonly senderName: string;
    readonly roleLabel?: string;
    readonly text: string;
  }): EcosystemPlazaMessageRecord {
    const cleanText = (input.text ?? "").trim();
    if (cleanText.length < 2 || cleanText.length > 280) {
      throw new BadRequestException(
        "광장 소통 메시지는 2자 이상 280자 이하로 입력해 주세요.",
      );
    }
    const cleanSender = (input.senderName ?? "").trim() || "광장 창작자";
    const cleanRole = (input.roleLabel ?? "").trim() || "어시스턴트·작가";
    const cleanPartyId = input.partyId?.trim() || null;

    const record: EcosystemPlazaMessageRecord = {
      id: `plaza-msg-${this.plazaMessages.length + 1}-${Date.now().toString(36)}`,
      partyId: cleanPartyId,
      senderName: cleanSender.slice(0, 40),
      roleLabel: cleanRole.slice(0, 30),
      text: cleanText,
      createdAt: new Date().toISOString(),
    };
    this.plazaMessages.unshift(record);
    if (this.plazaMessages.length > 100) {
      this.plazaMessages.length = 100;
    }
    this.persistState();
    this.events?.emit("plaza.message_posted", {
      id: record.id,
      partyId: record.partyId,
      senderName: record.senderName,
      roleLabel: record.roleLabel,
      text: record.text,
      createdAt: record.createdAt,
    });
    return record;
  }

  listPlazaPresence() {
    return { items: [...this.plazaPresence.values()] };
  }

  upsertPlazaPresence(input: {
    readonly userId: string;
    readonly nickname: string;
    readonly roleCode: string;
    readonly availability: PlazaPresenceAvailability;
    readonly tools?: readonly string[];
    readonly cutRateKrw?: number;
  }): EcosystemPlazaPresenceRecord {
    const cleanUserId = (input.userId ?? "").trim();
    if (!cleanUserId) {
      throw new BadRequestException("대기 상태를 갱신할 사용자 식별자가 필요합니다.");
    }
    const allowed: readonly PlazaPresenceAvailability[] = [
      "urgent-sub-ready",
      "online-ready",
      "busy",
    ];
    const availability = allowed.includes(input.availability)
      ? input.availability
      : "online-ready";
    const record: EcosystemPlazaPresenceRecord = {
      userId: cleanUserId,
      nickname: (input.nickname ?? "").trim().slice(0, 40) || "익명 어시스턴트",
      roleCode: (input.roleCode ?? "").trim() || "001.003",
      availability,
      tools: Array.isArray(input.tools) && input.tools.length > 0
        ? input.tools.slice(0, 5)
        : ["clip-studio-ex"],
      cutRateKrw: Math.max(5000, Math.round(input.cutRateKrw || 15000)),
      updatedAt: new Date().toISOString(),
    };
    this.plazaPresence.set(cleanUserId, record);
    this.persistState();
    this.events?.emit("plaza.presence_updated", {
      userId: record.userId,
      nickname: record.nickname,
      roleCode: record.roleCode,
      availability: record.availability,
    });
    return record;
  }

  listCafePosts(scope?: SecurityScopeType) {
    const items = scope
      ? this.cafePosts.filter((post) => post.scope === scope)
      : this.cafePosts;
    return { items };
  }

  createCafePost(input: {
    readonly cafeId: string;
    readonly scope: SecurityScopeType;
    readonly channel: string;
    readonly authorName: string;
    readonly title: string;
    readonly body: string;
    readonly attachments?: readonly EcosystemCafePostAttachmentInput[];
  }): EcosystemCafePostRecord {
    const cleanTitle = input.title.trim();
    const cleanBody = input.body.trim();
    const attachments = input.attachments ?? [];

    if (cleanTitle.length < 2) {
      throw new BadRequestException("게시글 제목은 2자 이상이어야 합니다.");
    }
    if (!cleanBody && attachments.length === 0) {
      throw new BadRequestException("본문 또는 이미지 첨부가 필요합니다.");
    }
    if (attachments.length > MAX_CAFE_IMAGES) {
      throw new BadRequestException(`이미지는 최대 ${MAX_CAFE_IMAGES}장까지 첨부할 수 있습니다.`);
    }
    for (const att of attachments) {
      if (!ALLOWED_IMAGE_MIMES.has(att.mimeType)) {
        throw new BadRequestException("PNG, JPG, WebP, GIF 이미지만 업로드할 수 있습니다.");
      }
      if (att.sizeBytes <= 0 || att.sizeBytes > MAX_CAFE_IMAGE_BYTES) {
        throw new BadRequestException("이미지 크기는 10MB 이하여야 합니다.");
      }
      if (!att.dataUrl.startsWith("data:image/")) {
        throw new BadRequestException("올바른 이미지 데이터 URL 형식이 아닙니다.");
      }
    }

    const post: EcosystemCafePostRecord = {
      id: `cafe-post-${this.cafePosts.length + 1}-${Date.now().toString(36)}`,
      cafeId: input.cafeId,
      scope: input.scope,
      channel: input.channel,
      authorName: input.authorName.trim() || "익명 창작자",
      title: cleanTitle,
      body: cleanBody,
      attachments,
      createdAt: new Date().toISOString(),
    };
    this.cafePosts.unshift(post);
    this.persistState();
    this.events?.emit("cafe.post_created", { postId: post.id, cafeId: post.cafeId, scope: post.scope, title: post.title });
    return post;
  }

  compileModelerCut(input: {
    readonly artStyle: string;
    readonly cameraShot: string;
    readonly lighting: string;
    readonly backgroundPrompt: string;
    readonly preserveLineartPass?: boolean;
  }) {
    const bg = input.backgroundPrompt.trim() || "clean webtoon background";
    return {
      positivePrompt: `Korean webtoon (${input.artStyle}), ${input.cameraShot}, ${input.lighting}, background: ${bg}`,
      renderPasses: input.preserveLineartPass === false
        ? (["composite"] as const)
        : (["lineart", "flat-color", "cel-shade", "composite"] as const),
    };
  }

  evaluateIpReadiness(input: {
    readonly workTitle: string;
    readonly publishedEpisodes: number;
    readonly hasCleanRightsBom: boolean;
  }) {
    const episodes = Math.max(0, Math.trunc(input.publishedEpisodes));
    const score = input.hasCleanRightsBom ? Math.min(100, 50 + Math.min(50, episodes)) : 30;
    return {
      workTitle: input.workTitle.trim() || "미정 작품",
      readinessScore: score,
      status: !input.hasCleanRightsBom ? "blocked" : score >= 80 ? "ready" : "needs-prep",
    };
  }

  triageSupportMessage(message: string) {
    const normalized = message.trim().toLowerCase();
    if (/(결제|환불|정산)/u.test(normalized)) {
      return { category: "billing-refund", suggestHumanEscalation: true, estimatedQueueMinutes: 4 };
    }
    if (/(권한|보안|rbac|워터마크)/u.test(normalized)) {
      return { category: "rbac-security", suggestHumanEscalation: true, estimatedQueueMinutes: 3 };
    }
    if (/(저장|복구|opfs)/u.test(normalized)) {
      return { category: "manuscript-recovery", suggestHumanEscalation: false, estimatedQueueMinutes: 2 };
    }
    return { category: "general", suggestHumanEscalation: false, estimatedQueueMinutes: 5 };
  }
}
