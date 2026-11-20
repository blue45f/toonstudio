import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import {
  createRecord, updateRecord, transitionRecord, requestRecordSchema,
  productionChangeCreateSchema, productionChangeSaveSchema, productionChangeTransitionSchema,
  PRODUCTION_CHANGE_RECORD_MAX_BYTES,
  type Actor, type RequestRecord, type ProductionChangeCreate, type ProductionChangeSave, type ProductionChangeTransition,
} from "@toonstudio/contracts/admin-production-change";
import { PrivateObjectReferenceSchema, type PrivateObjectReference } from "../../platform/adapters/private-object-storage/private-object-storage.contract";
import type { Pool, PoolClient } from "pg";

export const ADMIN_PRODUCTION_CHANGES_POOL = Symbol("ADMIN_PRODUCTION_CHANGES_POOL");
const MAX_VERSION = 2_147_483_647;
interface StoredRequest { id: string; version: number; document: unknown }
interface Receipt { request_id: string; request_digest: string }
export interface CaptureMetadata { id: string; object: PrivateObjectReference; contentType: string; byteLength: number }

function unavailable() {
  return new ServiceUnavailableException({ code: "production_changes_unavailable", message: "제작 변경 저장소를 사용할 수 없습니다. migration과 서버 연결을 확인해 주세요. 기존 기록은 초기화하지 않습니다." });
}
function conflict(message = "다른 관리자가 요청을 변경했습니다. 현재 입력을 보존한 뒤 최신 요청을 다시 열어 주세요.") {
  return new ConflictException({ code: "production_changes_conflict", message });
}
export function productionChangeDigest(value: unknown): string {
  const stable = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(stable);
    if (item !== null && typeof item === "object") return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, itemValue]) => [key, stable(itemValue)]));
    return item;
  };
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
function input<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try { return schema.parse(value); }
  catch { throw new BadRequestException("제작 변경 요청의 입력 형식·버전·저장 요청 ID를 확인해 주세요."); }
}
function decode(row: StoredRequest | undefined): RequestRecord {
  if (!row) throw new NotFoundException("제작 변경 요청을 찾을 수 없습니다.");
  const parsed = requestRecordSchema.safeParse(row.document);
  if (!parsed.success || parsed.data.id !== row.id || parsed.data.version !== row.version) throw unavailable();
  return parsed.data;
}
function workflow<T>(action: () => T): T {
  try { return action(); }
  catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "변경 상태와 증빙을 확인해 주세요."); }
}
function requireId(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)) throw new BadRequestException("유효한 요청 ID가 필요합니다.");
}

/** 제작 변경의 기록만 저장한다. 소스 코드·배포·운영 제작 데이터를 실행하지 않는다. */
@Injectable()
export class AdminProductionChangesRepository {
  constructor(@Inject(ADMIN_PRODUCTION_CHANGES_POOL) private readonly pool: Pool) {}

  private async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    let discard = false;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      if (client) {
        try { await client.query("ROLLBACK"); }
        catch { discard = true; }
      }
      if (error instanceof HttpException) throw error;
      throw unavailable();
    } finally { client?.release(discard); }
  }

  private async actor(client: PoolClient, userId: string, write = false): Promise<Actor> {
    if (typeof userId !== "string" || !userId.trim() || userId.length > 256) throw new ForbiddenException("로그인이 필요합니다.");
    const row = (await client.query<{ role: string; name: string | null }>(
      `SELECT role,name FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, [userId])).rows[0];
    if (!row || (row.role !== "admin" && (write || row.role !== "operator"))) throw new ForbiddenException("제작 변경 조회는 활성 관리자·운영자, 수정은 관리자 권한이 필요합니다.");
    return { userId, displayName: (row.name?.trim() || userId).slice(0, 240) };
  }

  private async ready(client: PoolClient) {
    await client.query(`SELECT request.id,request.version,request.document,audit.request_id,audit.actor_id,audit.mutation_id,
      audit.request_digest,audit.before_document,audit.after_document,capture.id,capture.object_reference,capture.created_by
      FROM admin_production_change_request request CROSS JOIN admin_production_change_audit audit
      CROSS JOIN admin_production_change_capture capture WHERE FALSE`);
  }
  private async load(client: PoolClient, id: string, lock = false) {
    requireId(id);
    return decode((await client.query<StoredRequest>(`SELECT id,version,document FROM admin_production_change_request WHERE id=$1${lock ? " FOR UPDATE" : ""}`, [id])).rows[0]);
  }
  private async now(client: PoolClient) {
    // 잠금 대기가 끝난 시각으로 예약·증빙 유효성을 판단한다. now()는 BEGIN 시각에 고정된다.
    const value = (await client.query<{ at: Date | string }>("SELECT clock_timestamp() AS at")).rows[0]?.at;
    if (!value || !Number.isFinite(new Date(value).getTime())) throw unavailable();
    return new Date(value).toISOString();
  }
  private async receipt(client: PoolClient, userId: string, mutationId: string, digest: string) {
    // 최초 생성과 재전송도 같은 요청 ID로 직렬화한다. 다른 요청의 변경까지 잠그지 않는다.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`production-change:${userId}:${mutationId}`]);
    const previous = (await client.query<Receipt>(`SELECT request_id,request_digest FROM admin_production_change_audit WHERE actor_id=$1 AND mutation_id=$2`, [userId, mutationId])).rows[0];
    if (!previous) return null;
    if (previous.request_digest !== digest) throw conflict("같은 저장 요청 ID에 다른 내용이 전달됐습니다. 입력을 보존하고 새 요청으로 저장해 주세요.");
    // 재전송 응답은 과거 사본이 아니라 현재 상태를 반환한다.
    return this.load(client, previous.request_id);
  }
  private async audit(client: PoolClient, actor: Actor, mutationId: string, digest: string, action: "create" | "save" | "transition", before: RequestRecord | null, after: RequestRecord, at: string) {
    await client.query(`INSERT INTO admin_production_change_audit(id,request_id,version,actor_id,mutation_id,request_digest,action,before_document,after_document,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)`, [randomUUID(), after.id, after.version, actor.userId, mutationId, digest, action, before ? JSON.stringify(before) : null, JSON.stringify(after), at]);
  }
  private async checkSize(client: PoolClient, record: RequestRecord) {
    const bytes = (await client.query<{ bytes: number }>("SELECT octet_length($1::jsonb::text)::integer AS bytes", [JSON.stringify(record)])).rows[0]?.bytes;
    if (!Number.isSafeInteger(bytes) || bytes < 2) throw unavailable();
    if (bytes > PRODUCTION_CHANGE_RECORD_MAX_BYTES) throw new BadRequestException("변경 요청과 이력이 2MiB 저장 한도를 넘습니다. 원본을 보존하고 후속 요청을 만들어 주세요.");
  }

  read(userId: string): Promise<{ requests: RequestRecord[] }> {
    return this.transaction(async client => {
      await this.actor(client, userId);
      await this.ready(client);
      const rows = (await client.query<StoredRequest>("SELECT id,version,document FROM admin_production_change_request ORDER BY updated_at DESC,id")).rows;
      return { requests: rows.map(decode) };
    });
  }
  assertWrite(userId: string): Promise<void> {
    return this.transaction(async client => { await this.actor(client, userId, true); await this.ready(client); });
  }
  create(userId: string, value: ProductionChangeCreate): Promise<{ request: RequestRecord }> {
    const command = input(productionChangeCreateSchema, value);
    const digest = productionChangeDigest({ action: "create", command });
    return this.transaction(async client => {
      const actor = await this.actor(client, userId, true);
      await this.ready(client);
      const replay = await this.receipt(client, userId, command.mutationId, digest);
      if (replay) return { request: replay };
      const at = await this.now(client);
      const record = workflow(() => createRecord(command.data, actor, at));
      await this.checkSize(client, record);
      await client.query(`INSERT INTO admin_production_change_request(id,version,document,created_by,updated_by,created_at,updated_at)
        VALUES($1,$2,$3::jsonb,$4,$4,$5,$5)`, [record.id, record.version, JSON.stringify(record), userId, at]);
      await this.audit(client, actor, command.mutationId, digest, "create", null, record, at);
      return { request: record };
    });
  }
  save(userId: string, id: string, value: ProductionChangeSave): Promise<{ request: RequestRecord }> {
    return this.change(userId, id, input(productionChangeSaveSchema, value), "save");
  }
  transition(userId: string, id: string, value: ProductionChangeTransition): Promise<{ request: RequestRecord }> {
    return this.change(userId, id, input(productionChangeTransitionSchema, value), "transition");
  }
  private change(userId: string, id: string, command: ProductionChangeSave | ProductionChangeTransition, action: "save" | "transition"): Promise<{ request: RequestRecord }> {
    requireId(id);
    const digest = productionChangeDigest({ action, id, command });
    return this.transaction(async client => {
      const actor = await this.actor(client, userId, true);
      await this.ready(client);
      const replay = await this.receipt(client, userId, command.mutationId, digest);
      if (replay) return { request: replay };
      const before = await this.load(client, id, true);
      if (before.version !== command.expectedVersion) throw conflict();
      if (before.version >= MAX_VERSION) throw conflict("버전 한도에 도달했습니다. 기록을 보존한 뒤 후속 요청을 만들어 주세요.");
      const at = await this.now(client);
      const after = workflow(() => "data" in command ? updateRecord(before, command.data, actor, at) : transitionRecord(before, { status: command.status, note: command.note }, actor, at));
      await this.checkSize(client, after);
      const updated = await client.query(`UPDATE admin_production_change_request SET version=$3,document=$4::jsonb,updated_by=$5,updated_at=$6
        WHERE id=$1 AND version=$2 RETURNING id`, [id, before.version, after.version, JSON.stringify(after), userId, at]);
      if (updated.rows.length !== 1) throw conflict();
      await this.audit(client, actor, command.mutationId, digest, action, before, after, at);
      return { request: after };
    });
  }

  saveCapture(userId: string, metadata: CaptureMetadata): Promise<void> {
    return this.transaction(async client => {
      await this.actor(client, userId, true);
      await client.query(`INSERT INTO admin_production_change_capture(id,object_reference,content_type,byte_length,created_by)
        VALUES($1,$2::jsonb,$3,$4,$5)`, [metadata.id, JSON.stringify(metadata.object), metadata.contentType, metadata.byteLength, userId]);
    });
  }
  readCapture(userId: string, id: string): Promise<CaptureMetadata> {
    requireId(id);
    return this.transaction(async client => {
      await this.actor(client, userId);
      const row = (await client.query<{ id: string; object_reference: unknown; content_type: string; byte_length: number }>(
        "SELECT id,object_reference,content_type,byte_length FROM admin_production_change_capture WHERE id=$1", [id])).rows[0];
      if (!row) throw new NotFoundException("저장된 캡처를 찾을 수 없습니다.");
      const parsed = PrivateObjectReferenceSchema.safeParse(row.object_reference);
      if (!parsed.success || parsed.data.contentType !== row.content_type || parsed.data.byteLength !== row.byte_length) throw unavailable();
      return { id, object: parsed.data, contentType: row.content_type, byteLength: row.byte_length };
    });
  }
}
