import { and, asc, count, desc, eq, gt, gte, isNull, sql } from "drizzle-orm";
import { Injectable } from "@nestjs/common";

import {
  db,
  productionIntegrationConnections,
  productionIntegrationOauthStates,
  productionIntegrationReceipts,
  productionPushSubscriptions,
} from "../../platform/database";

import { evaluateWebPushSubscriptionLimits } from "./production-web-push-policy";

export type ProductionIntegrationProvider =
  | "google-calendar"
  | "google-gmail"
  | "google-drive"
  | "documenso"
  | "toss-payments"
  | "generic-webhook"
  | "discord"
  | "ntfy"
  | "web-push";

export type ProductionIntegrationReceiptState =
  | "pending"
  | "succeeded"
  | "failed"
  | "uncertain";

export class ProductionIntegrationMutationConflictError extends Error {
  constructor() {
    super("production_integration_mutation_conflict");
    this.name = "ProductionIntegrationMutationConflictError";
  }
}

export class ProductionIntegrationMutationInFlightError extends Error {
  constructor(
    readonly state: "pending" | "uncertain",
    readonly externalId: string | null,
  ) {
    super(`production_integration_mutation_${state}`);
    this.name = "ProductionIntegrationMutationInFlightError";
  }
}export interface ProductionIntegrationConnectionRecord {
  readonly ciphertext: string;
  readonly externalAccountId: string | null;
  readonly scopes: readonly string[];
  readonly expiresAt: Date | null;
}

export interface ProductionIntegrationOauthStateRecord {
  readonly projectId: string;
  readonly actorUserId: string;
  readonly redirectPath: string;
}

/**
 * 새 웹 푸시 구독이 프로젝트 상한에 걸렸다. 사용자 상한은 오래된 본인 구독을 교체하므로 거절하지 않는다.
 * 409 응답의 scope 필드 호환을 위해 scope 는 항상 "project" 로 남겨 둔다.
 */
export class ProductionPushSubscriptionLimitError extends Error {
  readonly scope = "project" as const;

  constructor(readonly limit: number) {
    super("production_push_subscription_project_limit");
    this.name = "ProductionPushSubscriptionLimitError";
  }
}

export interface ProductionPushSubscriptionLimits {
  readonly maxPerProject: number;
  readonly maxPerUser: number;
}

export interface ProductionPushSubscriptionRecord {
  readonly projectId: string;
  readonly actorUserId: string;
  readonly endpointHash: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly expirationTime: number | null;
}

/** 알림 한 번에 쓸 구독 목록. 전송 상한(limit)에 걸려 빠진 구독 수를 함께 돌려줘 조용한 절단을 막는다. */
export interface ProductionPushSubscriptionBatch {
  readonly subscriptions: readonly ProductionPushSubscriptionRecord[];
  /** 상한 때문에 이번 알림 대상에서 빠진 구독 수. 상한 이하이면 0. */
  readonly omitted: number;
}

@Injectable()
export class ProductionIntegrationRepository {
  async beginMutation(input: {
    readonly projectId: string;
    readonly actorUserId: string;
    readonly mutationId: string;
    readonly provider: ProductionIntegrationProvider;
    readonly operation: string;
    readonly requestDigest: string;
  }): Promise<{ readonly replay: Record<string, unknown> | null }> {
    return db.transaction(async (transaction) => {
      const inserted = await transaction
        .insert(productionIntegrationReceipts)
        .values({
          ...input,
          state: "pending",
          response: null,
          errorCode: null,
        })
        .onConflictDoNothing()
        .returning({ mutationId: productionIntegrationReceipts.mutationId });
      if (inserted.length === 1) return { replay: null };

      const rows = await transaction
        .select({
          requestDigest: productionIntegrationReceipts.requestDigest,
          state: productionIntegrationReceipts.state,
          externalId: productionIntegrationReceipts.externalId,
          response: productionIntegrationReceipts.response,
        })
        .from(productionIntegrationReceipts)
        .where(and(
          eq(productionIntegrationReceipts.projectId, input.projectId),
          eq(productionIntegrationReceipts.actorUserId, input.actorUserId),
          eq(productionIntegrationReceipts.mutationId, input.mutationId),
        ))
        .limit(1)
        .for("update");      const receipt = rows[0];
      if (!receipt || receipt.requestDigest !== input.requestDigest) {
        throw new ProductionIntegrationMutationConflictError();
      }
      if (receipt.state === "succeeded") {
        if (!receipt.response) {
          throw new Error("succeeded integration receipt has no response");
        }
        return { replay: receipt.response };
      }
      if (receipt.state === "pending" || receipt.state === "uncertain") {
        throw new ProductionIntegrationMutationInFlightError(
          receipt.state,
          receipt.externalId,
        );
      }
      await transaction
        .update(productionIntegrationReceipts)
        .set({
          state: "pending",
          externalId: null,
          response: null,
          errorCode: null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(productionIntegrationReceipts.projectId, input.projectId),
          eq(productionIntegrationReceipts.actorUserId, input.actorUserId),
          eq(productionIntegrationReceipts.mutationId, input.mutationId),
        ));
      return { replay: null };
    });
  }

  async completeMutation(input: {
    readonly projectId: string;
    readonly actorUserId: string;
    readonly mutationId: string;
    readonly externalId?: string | null;
    readonly response: Record<string, unknown>;
  }): Promise<void> {
    const rows = await db
      .update(productionIntegrationReceipts)
      .set({
        state: "succeeded",
        externalId: input.externalId ?? null,
        response: input.response,
        errorCode: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(productionIntegrationReceipts.projectId, input.projectId),
        eq(productionIntegrationReceipts.actorUserId, input.actorUserId),
        eq(productionIntegrationReceipts.mutationId, input.mutationId),
        eq(productionIntegrationReceipts.state, "pending"),
      ))
      .returning({ mutationId: productionIntegrationReceipts.mutationId });
    if (rows.length !== 1) {
      throw new Error("integration receipt completion lost its pending fence");
    }
  }
  async failMutation(input: {
    readonly projectId: string;
    readonly actorUserId: string;
    readonly mutationId: string;
    readonly state: "failed" | "uncertain";
    readonly errorCode: string;
    readonly externalId?: string | null;
  }): Promise<void> {
    await db
      .update(productionIntegrationReceipts)
      .set({
        state: input.state,
        externalId: input.externalId ?? null,
        response: null,
        errorCode: input.errorCode.slice(0, 160),
        updatedAt: new Date(),
      })
      .where(and(
        eq(productionIntegrationReceipts.projectId, input.projectId),
        eq(productionIntegrationReceipts.actorUserId, input.actorUserId),
        eq(productionIntegrationReceipts.mutationId, input.mutationId),
        eq(productionIntegrationReceipts.state, "pending"),
      ));
  }

  async countMutationsSince(input: {
    readonly projectId: string;
    readonly actorUserId: string;
    readonly operation: string;
    readonly since: Date;
  }): Promise<number> {
    const rows = await db
      .select({ value: count() })
      .from(productionIntegrationReceipts)
      .where(and(
        eq(productionIntegrationReceipts.projectId, input.projectId),
        eq(productionIntegrationReceipts.actorUserId, input.actorUserId),
        eq(productionIntegrationReceipts.operation, input.operation),
        gte(productionIntegrationReceipts.createdAt, input.since),
      ));
    return rows[0]?.value ?? 0;
  }

  async getConnection(
    projectId: string,
    actorUserId: string,
  ): Promise<ProductionIntegrationConnectionRecord | null> {
    const rows = await db
      .select({
        ciphertext: productionIntegrationConnections.ciphertext,
        externalAccountId:
          productionIntegrationConnections.externalAccountId,
        scopes: productionIntegrationConnections.scopes,
        expiresAt: productionIntegrationConnections.expiresAt,
      })
      .from(productionIntegrationConnections)
      .where(and(
        eq(productionIntegrationConnections.projectId, projectId),
        eq(productionIntegrationConnections.actorUserId, actorUserId),
        eq(productionIntegrationConnections.provider, "google-workspace"),
      ))
      .limit(1);
    return rows[0] ?? null;
  }

  async upsertConnection(input: {
    readonly projectId: string;
    readonly actorUserId: string;
    readonly ciphertext: string;
    readonly externalAccountId: string | null;
    readonly scopes: readonly string[];
    readonly expiresAt: Date | null;
  }): Promise<void> {
    await db
      .insert(productionIntegrationConnections)
      .values({
        ...input,
        scopes: [...input.scopes],
        provider: "google-workspace",
      })
      .onConflictDoUpdate({
        target: [
          productionIntegrationConnections.projectId,
          productionIntegrationConnections.actorUserId,
          productionIntegrationConnections.provider,
        ],
        set: {
          ciphertext: input.ciphertext,
          externalAccountId: input.externalAccountId,
          scopes: [...input.scopes],
          expiresAt: input.expiresAt,
          updatedAt: new Date(),
        },
      });
  }
  async deleteConnection(
    projectId: string,
    actorUserId: string,
  ): Promise<void> {
    await db
      .delete(productionIntegrationConnections)
      .where(and(
        eq(productionIntegrationConnections.projectId, projectId),
        eq(productionIntegrationConnections.actorUserId, actorUserId),
        eq(productionIntegrationConnections.provider, "google-workspace"),
      ));
  }

  async createOauthState(input: {
    readonly stateHash: string;
    readonly projectId: string;
    readonly actorUserId: string;
    readonly redirectPath: string;
    readonly expiresAt: Date;
  }): Promise<void> {
    await db.insert(productionIntegrationOauthStates).values({
      ...input,
      provider: "google-workspace",
    });
  }

  async consumeOauthState(
    stateHash: string,
  ): Promise<ProductionIntegrationOauthStateRecord | null> {
    return db.transaction(async (transaction) => {
      const rows = await transaction
        .update(productionIntegrationOauthStates)
        .set({ consumedAt: new Date() })
        .where(and(
          eq(productionIntegrationOauthStates.stateHash, stateHash),
          eq(
            productionIntegrationOauthStates.provider,
            "google-workspace",
          ),
          isNull(productionIntegrationOauthStates.consumedAt),
          gt(productionIntegrationOauthStates.expiresAt, new Date()),
        ))
        .returning({
          projectId: productionIntegrationOauthStates.projectId,
          actorUserId: productionIntegrationOauthStates.actorUserId,
          redirectPath: productionIntegrationOauthStates.redirectPath,
        });
      return rows[0] ?? null;
    });
  }

  /**
   * 웹 푸시 구독을 저장한다. 프로젝트 단위 advisory lock 안에서 상한을 판정한다: 프로젝트 상한이면 거절(오류)하고,
   * 사용자 상한이면 그 사용자의 가장 오래 갱신되지 않은 구독을 지운 뒤 저장한다.
   */
  async upsertPushSubscription(
    input: ProductionPushSubscriptionRecord,
    limits: ProductionPushSubscriptionLimits,
  ): Promise<void> {
    await db.transaction(async (transaction) => {
      // 같은 프로젝트에 동시에 들어온 구독이 함께 상한을 넘지 못하도록 프로젝트 단위로 직렬화한다.
      await transaction.execute(sql`
        select pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(
            ${`production-push-subscription:${input.projectId}`},
            0
          )
        )
      `);
      const [totals] = await transaction
        .select({
          projectCount: count(),
          userCount: sql<number>`count(*) filter (where ${productionPushSubscriptions.actorUserId} = ${input.actorUserId})`
            .mapWith(Number),
          registered: sql<number>`count(*) filter (where ${productionPushSubscriptions.actorUserId} = ${input.actorUserId} and ${productionPushSubscriptions.endpointHash} = ${input.endpointHash})`
            .mapWith(Number),
        })
        .from(productionPushSubscriptions)
        .where(eq(productionPushSubscriptions.projectId, input.projectId));
      const decision = evaluateWebPushSubscriptionLimits({
        alreadyRegistered: (totals?.registered ?? 0) > 0,
        projectCount: totals?.projectCount ?? 0,
        userCount: totals?.userCount ?? 0,
        maxPerProject: limits.maxPerProject,
        maxPerUser: limits.maxPerUser,
      });
      if (decision.kind === "reject") {
        throw new ProductionPushSubscriptionLimitError(decision.limit);
      }
      if (decision.kind === "replace-oldest-own") {
        // 사용자 상한이 가득 찼다: 본인 구독 중 가장 오래 갱신되지 않은 하나를 같은 트랜잭션(위 잠금 안)에서 지운다.
        const [oldest] = await transaction
          .select({ endpointHash: productionPushSubscriptions.endpointHash })
          .from(productionPushSubscriptions)
          .where(and(
            eq(productionPushSubscriptions.projectId, input.projectId),
            eq(productionPushSubscriptions.actorUserId, input.actorUserId),
          ))
          .orderBy(
            asc(productionPushSubscriptions.updatedAt),
            asc(productionPushSubscriptions.createdAt),
            asc(productionPushSubscriptions.endpointHash),
          )
          .limit(1);
        if (oldest) {
          await transaction
            .delete(productionPushSubscriptions)
            .where(and(
              eq(productionPushSubscriptions.projectId, input.projectId),
              eq(productionPushSubscriptions.actorUserId, input.actorUserId),
              eq(productionPushSubscriptions.endpointHash, oldest.endpointHash),
            ));
        }
      }
      await transaction
        .insert(productionPushSubscriptions)
        .values(input)
        .onConflictDoUpdate({
          target: [
            productionPushSubscriptions.projectId,
            productionPushSubscriptions.actorUserId,
            productionPushSubscriptions.endpointHash,
          ],
          set: {
            projectId: input.projectId,
            actorUserId: input.actorUserId,
            endpoint: input.endpoint,
            p256dh: input.p256dh,
            auth: input.auth,
            expirationTime: input.expirationTime,
            updatedAt: new Date(),
          },
        });
    });
  }
  async deletePushSubscription(
    projectId: string,
    actorUserId: string,
    endpointHash: string,
  ): Promise<void> {
    await db
      .delete(productionPushSubscriptions)
      .where(and(
        eq(productionPushSubscriptions.projectId, projectId),
        eq(productionPushSubscriptions.actorUserId, actorUserId),
        eq(productionPushSubscriptions.endpointHash, endpointHash),
      ));
  }

  async deletePushSubscriptionByHash(endpointHash: string): Promise<void> {
    await db
      .delete(productionPushSubscriptions)
      .where(eq(productionPushSubscriptions.endpointHash, endpointHash));
  }

  /**
   * 한 번의 알림이 다루는 구독 수는 limit 로 제한한다(최근에 갱신한 구독부터). 상한(기본 200, 환경 변수로 낮출 수 있음)보다
   * 많이 저장돼 있으면 오래된 구독은 빠지므로, 빠진 개수를 omitted 로 함께 돌려준다.
   */
  async listPushSubscriptions(
    projectId: string,
    limit: number,
  ): Promise<ProductionPushSubscriptionBatch> {
    const rows = await db
      .select({
        projectId: productionPushSubscriptions.projectId,
        actorUserId: productionPushSubscriptions.actorUserId,
        endpointHash: productionPushSubscriptions.endpointHash,
        endpoint: productionPushSubscriptions.endpoint,
        p256dh: productionPushSubscriptions.p256dh,
        auth: productionPushSubscriptions.auth,
        expirationTime: productionPushSubscriptions.expirationTime,
        // LIMIT 을 적용하기 전의 이 프로젝트 전체 구독 수(윈도 집계는 LIMIT 보다 먼저 계산된다).
        total: sql<number>`count(*) over ()`.mapWith(Number),
      })
      .from(productionPushSubscriptions)
      .where(eq(productionPushSubscriptions.projectId, projectId))
      .orderBy(desc(productionPushSubscriptions.updatedAt))
      .limit(limit);
    return {
      subscriptions: rows.map((row) => ({
        projectId: row.projectId,
        actorUserId: row.actorUserId,
        endpointHash: row.endpointHash,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        expirationTime: row.expirationTime,
      })),
      omitted: Math.max(0, (rows[0]?.total ?? 0) - rows.length),
    };
  }
}
