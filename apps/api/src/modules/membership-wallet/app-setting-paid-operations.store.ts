/**
 * app-setting-paid-operations.store.ts — app_setting 기반 영속 유료화 마스터 스위치 스토어.
 *
 * 사업자등록·통신판매업 신고·PG 심사 완료 전에는 항상 기본값 false(무료·활동 크레딧 모드)로
 * 동작하며, 관리자가 어드민 콘솔에서 스위치를 켜면 재배포·재시작 없이 즉시 반영·유지된다.
 * DB 장애나 미초기화 상태에서는 메모리 폴백 값(기본 false)으로 fail-closed 된다.
 */

import { Inject, Injectable, Optional } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { appSettings, db } from "../../platform/database";
import { createSchemaReadinessCheck } from "../health/schema-readiness";
import type { PaidOperationsSettingStore } from "./paid-operations-gate";

export const PAID_OPERATIONS_APP_SETTING_KEY = "paid_operations_enabled";
export const PAID_OPERATIONS_PERSISTENCE_BACKEND = Symbol(
  "PAID_OPERATIONS_PERSISTENCE_BACKEND",
);

export interface PaidOperationsPersistenceBackend {
  read(): Promise<boolean | null>;
  write(enabled: boolean): Promise<void>;
}

const ensureSettingsTable = createSchemaReadinessCheck([
  'SELECT "key", "value", "updatedAt" FROM "app_setting" WHERE FALSE',
]);

const defaultDbBackend: PaidOperationsPersistenceBackend = {
  async read(): Promise<boolean | null> {
    if (!process.env.DATABASE_URL?.trim()) return null;
    await ensureSettingsTable();
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, PAID_OPERATIONS_APP_SETTING_KEY))
      .limit(1);
    const raw = rows[0]?.value as { enabled?: unknown } | boolean | undefined;
    if (typeof raw === "boolean") return raw;
    if (raw && typeof raw === "object" && typeof raw.enabled === "boolean") {
      return raw.enabled;
    }
    return null;
  },
  async write(enabled: boolean): Promise<void> {
    if (!process.env.DATABASE_URL?.trim()) return;
    await ensureSettingsTable();
    const updatedAt = new Date();
    await db
      .insert(appSettings)
      .values({
        key: PAID_OPERATIONS_APP_SETTING_KEY,
        value: { enabled },
        updatedAt,
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: { enabled }, updatedAt },
      });
  },
};

@Injectable()
export class AppSettingPaidOperationsStore
  implements PaidOperationsSettingStore
{
  private fallbackEnabled = false;
  private readonly backend: PaidOperationsPersistenceBackend;

  constructor(
    @Optional()
    @Inject(PAID_OPERATIONS_PERSISTENCE_BACKEND)
    backend?: PaidOperationsPersistenceBackend,
  ) {
    this.backend = backend ?? defaultDbBackend;
  }

  async getPaidOperationsEnabled(): Promise<boolean> {
    try {
      const persisted = await this.backend.read();
      if (typeof persisted === "boolean") {
        this.fallbackEnabled = persisted;
        return persisted;
      }
      return this.fallbackEnabled;
    } catch {
      return this.fallbackEnabled;
    }
  }

  async setPaidOperationsEnabled(value: boolean): Promise<void> {
    const normalized = value === true;
    this.fallbackEnabled = normalized;
    await this.backend.write(normalized);
  }
}
