import { randomUUID } from "node:crypto";

import { ConflictException, HttpException, HttpStatus, NotFoundException } from "@nestjs/common";

import { dbPool } from "../../platform/database";
import { resolveStudioAiPremiumConfig } from "../studio-ai/studio-ai-premium-config";
import { customerSupportAiReservedTokens } from "./customer-support-ai-context";

import type {
  CreateSupportConversation,
  SendSupportMessage,
  SupportAiError,
  SupportConversation,
  SupportConversationDetail,
  SupportConversationList,
  SupportConversationStatus,
  SupportMessage,
} from "@toonstudio/contracts/customer-support";
import type { Pool, PoolClient } from "pg";

export const CUSTOMER_SUPPORT_REPOSITORY = Symbol("CUSTOMER_SUPPORT_REPOSITORY");
type ConversationRow = Omit<SupportConversation, "createdAt" | "updatedAt"> & {
  ownerId: string; createdAt: Date; updatedAt: Date; aiLease: string | null; aiLeaseUntil: Date | null;
};
type MessageRow = Omit<SupportMessage, "createdAt"> & { createdAt: Date };
export interface SupportAiReservation {
  lease?: string;
  messages?: SupportMessage[];
  error?: SupportAiError;
}
export interface CustomerSupportRepository {
  isOperator(userId: string): Promise<boolean>;
  list(ownerId: string | null, status: SupportConversationStatus | undefined, limit: number, offset?: number): Promise<SupportConversationList>;
  create(ownerId: string, input: CreateSupportConversation): Promise<SupportConversationDetail>;
  detail(id: string, ownerId: string | null): Promise<SupportConversationDetail>;
  send(id: string, senderId: string, input: SendSupportMessage, admin: boolean): Promise<boolean>;
  setStatus(id: string, ownerId: string | null, status: SupportConversationStatus): Promise<void>;
  reserveAi(id: string, ownerId: string): Promise<SupportAiReservation>;
  finishAi(id: string, lease: string, content?: string): Promise<void>;
}

function conversation(row: ConversationRow): SupportConversation {
  return { id: row.id, subject: row.subject, status: row.status,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
function message(row: MessageRow): SupportMessage {
  return { id: row.id, conversationId: row.conversationId, role: row.role,
    content: row.content, createdAt: row.createdAt.toISOString() };
}
function tooMany(messageText: string): never {
  throw new HttpException({ code: "SUPPORT_RATE_LIMIT", message: messageText }, HttpStatus.TOO_MANY_REQUESTS);
}

/** 소유권·중복·순서·AI 예약을 PostgreSQL 트랜잭션에서 함께 판정한다. */
export class PostgresCustomerSupportRepository implements CustomerSupportRepository {
  constructor(private readonly pool: Pick<Pool, "query" | "connect"> = dbPool) {}

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const value = await work(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  private async locked(client: PoolClient, id: string, ownerId: string | null): Promise<ConversationRow> {
    const result = await client.query<ConversationRow>(
      'SELECT * FROM public.customer_support_conversation WHERE id=$1 AND ($2::text IS NULL OR "ownerId"=$2) FOR UPDATE',
      [id, ownerId],
    );
    if (!result.rows[0]) throw new NotFoundException("문의를 찾을 수 없어요.");
    return result.rows[0];
  }

  async isOperator(userId: string): Promise<boolean> {
    const result = await this.pool.query<{ role: string }>('SELECT role FROM public."user" WHERE id=$1', [userId]);
    return ["admin", "operator"].includes(result.rows[0]?.role?.toLowerCase() ?? "");
  }

  async list(ownerId: string | null, status: SupportConversationStatus | undefined, limit: number, offset = 0): Promise<SupportConversationList> {
    const filter = '($1::text IS NULL OR "ownerId"=$1) AND ($2::text IS NULL OR status=$2)';
    const [rows, count] = await Promise.all([
      this.pool.query<ConversationRow>(`SELECT * FROM public.customer_support_conversation WHERE ${filter} ORDER BY "updatedAt" DESC, id LIMIT $3 OFFSET $4`, [ownerId, status ?? null, limit, offset]),
      this.pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM public.customer_support_conversation WHERE ${filter}`, [ownerId, status ?? null]),
    ]);
    return { items: rows.rows.map(conversation), total: count.rows[0]?.count ?? 0 };
  }

  async create(ownerId: string, input: CreateSupportConversation): Promise<SupportConversationDetail> {
    const row = await this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('customer-support-create'),hashtext($1))", [ownerId]);
      const count = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM public.customer_support_conversation WHERE "ownerId"=$1 AND "createdAt">now()-interval \'1 hour\'', [ownerId]);
      if ((count.rows[0]?.count ?? 0) >= 10) tooMany("문의는 한 시간에 10개까지 만들 수 있어요.");
      const result = await client.query<ConversationRow>(
        'INSERT INTO public.customer_support_conversation(id,"ownerId",subject,status) VALUES($1,$2,$3,$4) RETURNING *',
        [randomUUID(), ownerId, input.subject, input.mode === "human" ? "waiting" : "ai"],
      );
      return result.rows[0];
    });
    return { conversation: conversation(row), messages: [] };
  }

  async detail(id: string, ownerId: string | null): Promise<SupportConversationDetail> {
    // 한 스냅숏에서 읽어 종료·상담 전환과 메시지 표시가 서로 엇갈리지 않게 한다.
    return this.transaction(async (client) => {
      const row = await this.locked(client, id, ownerId);
      const rows = await client.query<MessageRow>('SELECT * FROM public.customer_support_message WHERE "conversationId"=$1 ORDER BY sequence LIMIT 200', [id]);
      return { conversation: conversation(row), messages: rows.rows.map(message) };
    });
  }

  async send(id: string, senderId: string, input: SendSupportMessage, admin: boolean): Promise<boolean> {
    return this.transaction(async (client) => {
      const row = await this.locked(client, id, admin ? null : senderId);
      const duplicate = await client.query<{ content: string; senderId: string | null }>('SELECT content,"senderId" FROM public.customer_support_message WHERE "conversationId"=$1 AND "clientMessageId"=$2', [id, input.clientMessageId]);
      if (duplicate.rows[0]) {
        if (duplicate.rows[0].senderId !== senderId || duplicate.rows[0].content !== input.content) {
          throw new ConflictException("이미 사용한 메시지 번호예요. 새 메시지로 다시 보내 주세요.");
        }
        return false;
      }
      if (row.status === "closed") throw new ConflictException("종료된 문의예요. 새 문의를 만들어 주세요.");
      if (!admin && row.aiLeaseUntil && row.aiLeaseUntil.getTime() > Date.now()) {
        throw new ConflictException("AI 답변을 작성하고 있어요. 잠시 후 다시 보내 주세요.");
      }
      const count = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM public.customer_support_message WHERE "conversationId"=$1', [id]);
      // 마지막 사용자 메시지에 AI가 답할 공간을 한 개 남긴다.
      const maximum = !admin && row.status === "ai" ? 199 : 200;
      if ((count.rows[0]?.count ?? 0) >= maximum) throw new ConflictException("대화가 길어졌어요. 새 문의를 만들어 주세요.");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('customer-support-send'),hashtext($1))", [senderId]);
      const recent = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM public.customer_support_message WHERE "senderId"=$1 AND "createdAt">now()-interval \'1 hour\'', [senderId]);
      if ((recent.rows[0]?.count ?? 0) >= (admin ? 300 : 60)) tooMany("메시지를 많이 보내셨어요. 잠시 후 다시 시도해 주세요.");
      await client.query('INSERT INTO public.customer_support_message(id,"conversationId","clientMessageId",role,"senderId",content) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), id, input.clientMessageId, admin ? "admin" : "user", senderId, input.content]);
      await client.query('UPDATE public.customer_support_conversation SET status=$2,"updatedAt"=now(),"aiLease"=NULL,"aiLeaseUntil"=NULL WHERE id=$1', [id, admin ? "open" : row.status]);
      return true;
    });
  }

  async setStatus(id: string, ownerId: string | null, status: SupportConversationStatus): Promise<void> {
    await this.transaction(async (client) => {
      const row = await this.locked(client, id, ownerId);
      if (ownerId && row.status === "closed" && status !== "closed") throw new ConflictException("종료된 문의예요. 새 문의를 만들어 주세요.");
      await client.query('UPDATE public.customer_support_conversation SET status=$2,"updatedAt"=now(),"aiLease"=NULL,"aiLeaseUntil"=NULL WHERE id=$1', [id, status]);
    });
  }

  async reserveAi(id: string, ownerId: string): Promise<SupportAiReservation> {
    return this.transaction(async (client) => {
      const row = await this.locked(client, id, ownerId);
      if (row.status !== "ai") throw new ConflictException("AI 상담 중인 문의만 답변을 요청할 수 있어요.");
      if (row.aiLeaseUntil && row.aiLeaseUntil.getTime() > Date.now()) return { error: { code: "SUPPORT_AI_BUSY", message: "AI 답변을 작성하고 있어요. 잠시 후 새로고침해 주세요." } };
      const rows = await client.query<MessageRow>('SELECT * FROM public.customer_support_message WHERE "conversationId"=$1 ORDER BY sequence', [id]);
      const last = rows.rows.at(-1);
      if (!last || last.role !== "user") throw new ConflictException("답변할 새 질문이 없어요.");
      await client.query("SELECT pg_advisory_xact_lock(hashtext('customer-support-ai-budget'))");
      const counts = await client.query<{ total: number; own: number; tokens: string }>('SELECT count(*)::int AS total,count(*) FILTER (WHERE "ownerId"=$1)::int AS own,COALESCE(sum("reservedTokens"),0)::text AS tokens FROM public.customer_support_ai_attempt WHERE "createdAt">=date_trunc(\'day\',now() AT TIME ZONE \'UTC\') AT TIME ZONE \'UTC\'', [ownerId]);
      const limits = resolveStudioAiPremiumConfig().limits;
      const reservedTokens = customerSupportAiReservedTokens(rows.rows.map(message));
      if ((counts.rows[0]?.own ?? 0) >= Math.min(30, limits.userDailyRequests)
        || (counts.rows[0]?.total ?? 0) >= Math.min(400, limits.globalDailyRequests)
        || Number(counts.rows[0]?.tokens ?? 0) + reservedTokens > Math.min(3_000_000, limits.globalDailyTokens)) {
        return { error: { code: "SUPPORT_AI_LIMIT", message: "오늘의 AI 상담 한도에 도달했어요. 1:1 문의로 전환하거나 내일 다시 이용해 주세요." } };
      }
      const lease = randomUUID();
      await client.query('INSERT INTO public.customer_support_ai_attempt(id,"conversationId","ownerId","reservedTokens") VALUES($1,$2,$3,$4)', [lease, id, ownerId, reservedTokens]);
      await client.query('UPDATE public.customer_support_conversation SET "aiLease"=$2,"aiLeaseUntil"=now()+interval \'45 seconds\' WHERE id=$1', [id, lease]);
      return { lease, messages: rows.rows.map(message) };
    });
  }

  async finishAi(id: string, lease: string, content?: string): Promise<void> {
    await this.transaction(async (client) => {
      const row = await this.locked(client, id, null);
      // 상담원 전환·종료·새 예약 뒤에 도착한 응답은 저장하지 않는다.
      if (row.aiLease !== lease || row.status !== "ai") return;
      if (content) await client.query('INSERT INTO public.customer_support_message(id,"conversationId","clientMessageId",role,content) VALUES($1,$2,$3,\'assistant\',$4)', [randomUUID(), id, lease, content.slice(0, 4000)]);
      await client.query('UPDATE public.customer_support_conversation SET "aiLease"=NULL,"aiLeaseUntil"=NULL,"updatedAt"=now() WHERE id=$1', [id]);
    });
  }
}

export const customerSupportRepositoryProvider = {
  provide: CUSTOMER_SUPPORT_REPOSITORY,
  useFactory: () => new PostgresCustomerSupportRepository(),
};
