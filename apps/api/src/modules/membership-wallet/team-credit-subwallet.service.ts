/**
 * team-credit-subwallet.service.ts — 팀 공용 크레딧 지갑의 외주 어시스턴트별 작업 한도 배정 및 원클릭 회수.
 *
 * 핵심 설계:
 *  - PD·스튜디오 대표(ownerUserId)가 이번 회차 합류 어시스턴트(assistantUserId)에게
 *    해당 작업방(workspaceId) 전용 크레딧 사용 한도(limitCredits)만 배정한다.
 *  - 현금이나 영구 양도 크레딧이 어시 개인 지갑으로 넘어가지 않으므로 환전·양도 분쟁이 없다.
 *  - 회차 납품 승인 완료 시 [한도·권한 즉시 회수(revoke)] 호출 한 번으로 미사용 잔여 한도를
 *    즉시 0으로 잠그고 감사 로그를 남긴다.
 */

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import { eq } from "drizzle-orm";

import { appSettings, db } from "../../platform/database";
import { logAuditAction } from "../admin/admin-types";
import { createSchemaReadinessCheck } from "../health/schema-readiness";
import { requireUserId } from "./membership-wallet.service";

const SUBWALLET_SETTING_KEY = "team_credit_subwallet_allocations";

export const TEAM_SUBWALLET_STORE = Symbol("TEAM_SUBWALLET_STORE");

const ensureSettingsTable = createSchemaReadinessCheck([
  'SELECT "key", "value", "updatedAt" FROM "app_setting" WHERE FALSE',
]);

export interface TeamAssistantQuotaRecord {
  readonly allocationId: string;
  readonly ownerUserId: string;
  readonly workspaceId: string;
  readonly assistantUserId: string;
  readonly assistantNickname: string;
  readonly roleKo: string;
  readonly limitCredits: number;
  readonly usedCredits: number;
  readonly remainingCredits: number;
  readonly status: "active" | "revoked";
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

export interface TeamSubwalletStore {
  listAll(): Promise<TeamAssistantQuotaRecord[]>;
  saveAll(records: readonly TeamAssistantQuotaRecord[]): Promise<void>;
}

const inMemoryQuotas: TeamAssistantQuotaRecord[] = [];

export const defaultTeamSubwalletStore: TeamSubwalletStore = {
  async listAll() {
    if (!process.env.DATABASE_URL?.trim()) {
      return [...inMemoryQuotas];
    }
    await ensureSettingsTable();
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, SUBWALLET_SETTING_KEY))
      .limit(1);
    const existing = (rows[0]?.value ?? {}) as {
      items?: TeamAssistantQuotaRecord[];
    };
    return Array.isArray(existing.items) ? existing.items : [];
  },

  async saveAll(records) {
    const trimmed = records.slice(0, 500);
    if (!process.env.DATABASE_URL?.trim()) {
      inMemoryQuotas.splice(0, inMemoryQuotas.length, ...trimmed);
      return;
    }
    await ensureSettingsTable();
    const updatedAt = new Date();
    await db
      .insert(appSettings)
      .values({
        key: SUBWALLET_SETTING_KEY,
        value: { items: trimmed, count: trimmed.length },
        updatedAt,
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: { items: trimmed, count: trimmed.length }, updatedAt },
      });
  },
};

@Injectable()
export class TeamCreditSubwalletService {
  private readonly store: TeamSubwalletStore;

  constructor(
    @Optional()
    @Inject(TEAM_SUBWALLET_STORE)
    store?: TeamSubwalletStore,
  ) {
    this.store = store ?? defaultTeamSubwalletStore;
  }

  async listQuotasForUser(userIdValue: string | undefined) {
    const userId = requireUserId(userIdValue);
    const all = await this.store.listAll();
    const items = all.filter(
      (q) => q.ownerUserId === userId || q.assistantUserId === userId,
    );
    return { items };
  }

  async allocateQuota(
    ownerUserIdValue: string | undefined,
    body: {
      workspaceId?: unknown;
      assistantUserId?: unknown;
      assistantNickname?: unknown;
      roleKo?: unknown;
      limitCredits?: unknown;
    },
  ): Promise<TeamAssistantQuotaRecord> {
    const ownerUserId = requireUserId(ownerUserIdValue);
    const assistantUserId =
      typeof body?.assistantUserId === "string"
        ? body.assistantUserId.trim()
        : "";
    if (assistantUserId.length < 2 || assistantUserId.length > 80) {
      throw new BadRequestException("한도를 배정할 어시스턴트 식별자를 입력해 주세요.");
    }
    if (assistantUserId === ownerUserId) {
      throw new BadRequestException("본인 계정에는 외주 한도를 별도 배정할 필요가 없습니다.");
    }
    const workspaceId =
      typeof body?.workspaceId === "string" && body.workspaceId.trim()
        ? body.workspaceId.trim().slice(0, 80)
        : "default-review-room";
    const limitCredits = Math.trunc(Number(body?.limitCredits ?? 0));
    if (!Number.isFinite(limitCredits) || limitCredits < 10 || limitCredits > 20_000) {
      throw new BadRequestException("배정 한도는 10 C 이상 20,000 C 이하 정수여야 합니다.");
    }
    const assistantNickname =
      typeof body?.assistantNickname === "string" && body.assistantNickname.trim()
        ? body.assistantNickname.trim().slice(0, 40)
        : assistantUserId;
    const roleKo =
      typeof body?.roleKo === "string" && body.roleKo.trim()
        ? body.roleKo.trim().slice(0, 30)
        : "선화·채색 어시스턴트";

    const all = await this.store.listAll();
    const record: TeamAssistantQuotaRecord = {
      allocationId: `quota-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      ownerUserId,
      workspaceId,
      assistantUserId,
      assistantNickname,
      roleKo,
      limitCredits,
      usedCredits: 0,
      remainingCredits: limitCredits,
      status: "active",
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    await this.store.saveAll([record, ...all]);
    await logAuditAction(
      ownerUserId,
      "membership_wallet.subwallet_allocate",
      "team_subwallet",
      record.allocationId,
      { assistantUserId, workspaceId, limitCredits },
    );
    return record;
  }

  async spendWithinQuota(
    assistantUserIdValue: string | undefined,
    allocationId: string,
    body: { amountCredits?: unknown; featureLabel?: unknown },
  ): Promise<TeamAssistantQuotaRecord> {
    const assistantUserId = requireUserId(assistantUserIdValue);
    const amount = Math.trunc(Number(body?.amountCredits ?? 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("차감할 크레딧 수량은 1 C 이상이어야 합니다.");
    }
    const all = await this.store.listAll();
    const idx = all.findIndex((q) => q.allocationId === allocationId);
    if (idx < 0) {
      throw new BadRequestException("배정된 팀 크레딧 한도를 찾을 수 없습니다.");
    }
    const current = all[idx]!;
    if (current.assistantUserId !== assistantUserId) {
      throw new ForbiddenException("해당 작업방 한도를 사용할 권한이 없습니다.");
    }
    if (current.status !== "active") {
      throw new ForbiddenException("이미 회수된 작업방 크레딧 한도입니다.");
    }
    if (current.usedCredits + amount > current.limitCredits) {
      throw new ForbiddenException("배정된 회차 작업 크레딧 한도를 초과했습니다.");
    }
    const usedCredits = current.usedCredits + amount;
    const updated: TeamAssistantQuotaRecord = {
      ...current,
      usedCredits,
      remainingCredits: current.limitCredits - usedCredits,
    };
    all[idx] = updated;
    await this.store.saveAll(all);
    return updated;
  }

  async revokeQuota(
    ownerUserIdValue: string | undefined,
    allocationId: string,
  ): Promise<TeamAssistantQuotaRecord & { readonly releasedCredits: number }> {
    const ownerUserId = requireUserId(ownerUserIdValue);
    const all = await this.store.listAll();
    const idx = all.findIndex((q) => q.allocationId === allocationId);
    if (idx < 0) {
      throw new BadRequestException("회수할 팀 크레딧 한도를 찾을 수 없습니다.");
    }
    const current = all[idx]!;
    if (current.ownerUserId !== ownerUserId) {
      throw new ForbiddenException("팀 한도를 배정한 결재자만 회수할 수 있습니다.");
    }
    const releasedCredits =
      current.status === "active" ? current.remainingCredits : 0;
    const updated: TeamAssistantQuotaRecord = {
      ...current,
      remainingCredits: 0,
      status: "revoked",
      revokedAt: current.revokedAt ?? new Date().toISOString(),
    };
    all[idx] = updated;
    await this.store.saveAll(all);
    await logAuditAction(
      ownerUserId,
      "membership_wallet.subwallet_revoke",
      "team_subwallet",
      allocationId,
      { assistantUserId: current.assistantUserId, releasedCredits },
    );
    return { ...updated, releasedCredits };
  }
}
