import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import {
  STAGE_GATE_FREE_POLICY, normalizeStageGateConditions, stageGateRecordId, validateStageGateDecisionForStorage,
  type StageConsensusGateRecord, type StageGateBundle, type StageGateDecisionRecord,
  type StageGateMutationResult, type StageGateRoundRecord, type StageGateStageIdContract,
} from "@toonstudio/contracts/production-stage-gate";
import type { StageGateCommand } from "./stage-gate.dto";
import { PRODUCTION_TEAM_POOL } from "./team-workspace.repository";

interface ActiveUser { id: string; name: string | null }
interface GateRow {
  id: string; episode_id: string; stage_id: StageGateStageIdContract;
  lead_reviewer_id: string | null; lead_reviewer_name: string; revision: number;
}
interface RoundRow {
  gate_id: string; round: number; submitted_by_id: string; submitted_by_name: string;
  revision_ref: string | null; submitted_at: Date;
}
interface DecisionRow {
  gate_id: string; round: number; reviewer_id: string; reviewer_name: string;
  role: "lead" | "participant"; value: StageGateDecisionRecord["value"]; reason: string;
  conditions: string[]; pin_thread_ids: string[]; decided_at: Date;
}
type ProjectRole = "owner" | "admin" | "editor" | "commenter" | "viewer";
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
function digest(value: unknown): string {
  const canonical = (input: unknown): unknown => Array.isArray(input) ? input.map(canonical)
    : input !== null && typeof input === "object"
      ? Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)])) : input;
  return hash(JSON.stringify(canonical(value)));
}
function quota(resource: string, current: number, limit: number): never {
  throw new HttpException({ code: "usage_limit_reached", resource, current, limit,
    message: "이용 한도에 도달했습니다. 사용 중인 항목을 정리한 뒤 다시 시도해주세요." }, 429);
}
const STAGE_ORDER = "CASE stage_id WHEN 'plan' THEN 0 WHEN 'storyboard' THEN 1 ELSE 2 END";

/**
 * 단계 합의 게이트 서버 저장 본체. 팀·조직 리포지토리와 같은 골격이다:
 * 트랜잭션 + advisory lock, mutationId 멱등 receipt(내용이 다르면 거부),
 * expectedRevision 낙관적 동시성(어긋나면 409 + 현재 revision 반환),
 * 전 커맨드 감사 기록. 다기기 동기화는 "서버가 원천, revision이 순서"다.
 */
@Injectable()
export class StageGateRepository {
  constructor(@Inject(PRODUCTION_TEAM_POOL) private readonly pool: Pool) {}
  private async transaction<T>(action: (client: PoolClient) => Promise<T>, write = false): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (write) await client.query("SELECT pg_advisory_xact_lock(173205, 1110)");
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  private async activeUser(client: PoolClient, actor: string): Promise<ActiveUser> {
    const result = await client.query<ActiveUser>(`SELECT id,name FROM "user" WHERE id=$1 AND status='active' FOR SHARE`, [actor]);
    if (!result.rows[0]) throw new ForbiddenException("유효한 로그인이 필요합니다.");
    return result.rows[0];
  }
  /** 프로젝트 접근 역할. 작품 소유자이거나 활성 협업자여야 하며, 아니면 404다(존재를 숨긴다). */
  private async projectRole(client: PoolClient, actor: string, projectId: string): Promise<ProjectRole> {
    const result = await client.query<{ role: ProjectRole }>(`SELECT CASE WHEN cw."userId"=$1 THEN 'owner' ELSE c.role END role
      FROM production_project p JOIN creator_work cw ON cw.id=p."workId"
      LEFT JOIN creator_work_collaborator c ON c."workId"=cw.id AND c."userId"=$1 AND c.status='active'
      WHERE p.id=$2 AND (cw."userId"=$1 OR c."userId" IS NOT NULL)`, [actor, projectId]);
    if (!result.rows[0]) throw new NotFoundException("접근 가능한 프로젝트가 없습니다.");
    return result.rows[0].role;
  }
  /**
   * 리드 후보가 이 프로젝트의 활성 구성원(작품 소유자 또는 활성 협업자)인지 확인하고 표시 이름을 돌려준다.
   * 쿼리가 참조하는 파라미터만 바인딩한다 — SQL에서 쓰지 않는 `$n`이 하나라도 있으면 PostgreSQL이
   * 그 파라미터의 타입을 추론하지 못해 "could not determine data type of parameter"로 실패한다.
   */
  private async memberName(client: PoolClient, projectId: string, userId: string): Promise<string> {
    const result = await client.query<{ name: string }>(`SELECT coalesce(u.name,'구성원') name FROM "user" u
      WHERE u.id=$2 AND u.status='active' AND EXISTS (SELECT 1 FROM production_project p JOIN creator_work cw ON cw.id=p."workId"
        LEFT JOIN creator_work_collaborator c ON c."workId"=cw.id AND c."userId"=$2 AND c.status='active'
        WHERE p.id=$1 AND (cw."userId"=$2 OR c."userId" IS NOT NULL))`, [projectId, userId]);
    if (!result.rows[0]) throw new BadRequestException("리드 리뷰어는 이 프로젝트의 구성원이어야 합니다.");
    return result.rows[0].name;
  }
  private async loadGate(client: PoolClient, projectId: string, episodeId: string, stageId: string, lock = false): Promise<GateRow | null> {
    const result = await client.query<GateRow>(`SELECT id,episode_id,stage_id,lead_reviewer_id,lead_reviewer_name,revision
      FROM production_stage_gate WHERE project_id=$1 AND episode_id=$2 AND stage_id=$3 ${lock ? "FOR UPDATE" : ""}`, [projectId, episodeId, stageId]);
    return result.rows[0] ?? null;
  }
  private async assemble(client: PoolClient, projectId: string, rows: GateRow[]): Promise<StageConsensusGateRecord[]> {
    const gates: StageConsensusGateRecord[] = [];
    for (const row of rows) {
      const roundRows = (await client.query<RoundRow>(`SELECT gate_id,round,submitted_by_id,submitted_by_name,revision_ref,submitted_at
        FROM production_stage_gate_round WHERE gate_id=$1 ORDER BY round`, [row.id])).rows;
      const decisionRows = (await client.query<DecisionRow>(`SELECT gate_id,round,reviewer_id,reviewer_name,role,value,reason,conditions,pin_thread_ids,decided_at
        FROM production_stage_gate_decision WHERE gate_id=$1 ORDER BY round,decision_index`, [row.id])).rows;
      const rounds: StageGateRoundRecord[] = roundRows.map((round) => ({
        round: round.round, submittedById: round.submitted_by_id, submittedByName: round.submitted_by_name,
        revisionRef: round.revision_ref, submittedAt: round.submitted_at.toISOString(),
        decisions: decisionRows.filter((decision) => decision.round === round.round).map((decision): StageGateDecisionRecord => ({
          reviewerId: decision.reviewer_id, reviewerName: decision.reviewer_name, role: decision.role,
          value: decision.value, reason: decision.reason, conditions: decision.conditions,
          pinThreadIds: decision.pin_thread_ids, decidedAt: decision.decided_at.toISOString(),
        })),
      }));
      gates.push({ id: row.id, projectId, episodeId: row.episode_id, stageId: row.stage_id,
        leadReviewerId: row.lead_reviewer_id, leadReviewerName: row.lead_reviewer_name, rounds, revision: row.revision });
    }
    return gates;
  }
  async list(actor: string, projectId: string, episodeId: string): Promise<StageGateBundle> {
    return this.transaction(async (client) => {
      await this.activeUser(client, actor);
      await this.projectRole(client, actor, projectId);
      const rows = (await client.query<GateRow>(`SELECT id,episode_id,stage_id,lead_reviewer_id,lead_reviewer_name,revision
        FROM production_stage_gate WHERE project_id=$1 AND episode_id=$2 ORDER BY ${STAGE_ORDER}`, [projectId, episodeId])).rows;
      return { projectId, episodeId, gates: await this.assemble(client, projectId, rows), serverTime: new Date().toISOString() };
    });
  }
  private async receipt(client: PoolClient, actor: string, mutationId: string, gateId: string, input: unknown): Promise<StageGateMutationResult | null> {
    const found = (await client.query<{ request_digest: string; response: StageGateMutationResult; gate_id: string }>(
      "SELECT request_digest,response,gate_id FROM production_stage_gate_receipt WHERE actor_user_id=$1 AND mutation_id=$2", [actor, mutationId])).rows[0];
    if (!found) return null;
    if (found.gate_id !== gateId || found.request_digest !== digest(input)) {
      throw new ConflictException({ code: "idempotency_key_reuse", message: "같은 요청 ID의 내용이 다릅니다." });
    }
    return found.response;
  }
  async command(actor: string, projectId: string, episodeId: string, stageId: StageGateStageIdContract,
    input: StageGateCommand): Promise<StageGateMutationResult> {
    return this.transaction(async (client) => {
      const user = await this.activeUser(client, actor);
      const role = await this.projectRole(client, actor, projectId);
      const gateId = stageGateRecordId(episodeId, stageId);
      const replay = await this.receipt(client, actor, input.mutationId, gateId, { projectId, episodeId, stageId, ...input });
      if (replay) return replay;
      let gate = await this.loadGate(client, projectId, episodeId, stageId, true);
      const currentRevision = gate?.revision ?? 0;
      if (input.expectedRevision !== currentRevision) {
        throw new ConflictException({ code: "revision_conflict", currentRevision,
          message: "다른 기기에서 먼저 변경됐습니다. 최신 게이트를 다시 불러온 뒤 시도해 주세요." });
      }
      if (!gate) {
        await client.query(`INSERT INTO production_stage_gate(id,project_id,episode_id,stage_id) VALUES($1,$2,$3,$4)`,
          [gateId, projectId, episodeId, stageId]);
        gate = { id: gateId, episode_id: episodeId, stage_id: stageId, lead_reviewer_id: null, lead_reviewer_name: "", revision: 0 };
      }
      if (input.type === "assign-lead") {
        if (role !== "owner" && role !== "admin") throw new ForbiddenException("리드 지정은 작품 소유자나 관리자만 할 수 있습니다.");
        const leadName = await this.memberName(client, projectId, input.leadReviewerId);
        await client.query("UPDATE production_stage_gate SET lead_reviewer_id=$2, lead_reviewer_name=$3 WHERE id=$1",
          [gateId, input.leadReviewerId, leadName]);
      } else if (input.type === "submit-round") {
        if (role === "commenter" || role === "viewer") throw new ForbiddenException("제출은 편집 권한이 있는 구성원만 할 수 있습니다.");
        const count = (await client.query<{ count: number; max: number | null }>(
          "SELECT count(*)::int count, max(round) max FROM production_stage_gate_round WHERE gate_id=$1", [gateId])).rows[0];
        if (count.count >= STAGE_GATE_FREE_POLICY.roundsPerGate) quota("roundsPerGate", count.count, STAGE_GATE_FREE_POLICY.roundsPerGate);
        await client.query(`INSERT INTO production_stage_gate_round(gate_id,round,submitted_by_id,submitted_by_name,revision_ref)
          VALUES($1,$2,$3,$4,$5)`, [gateId, (count.max ?? 0) + 1, actor, user.name ?? "구성원", input.revisionRef]);
      } else {
        if (role === "viewer") throw new ForbiddenException("판정은 보기 전용 구성원을 제외한 구성원만 남길 수 있습니다.");
        if (!gate.lead_reviewer_id) {
          throw new ConflictException({ code: "lead_not_assigned", message: "아직 검수 리드가 지정되지 않았습니다. 리드를 먼저 지정해 주세요." });
        }
        const conditions = normalizeStageGateConditions(input.conditions);
        const issues = validateStageGateDecisionForStorage({ value: input.value, reason: input.reason, conditions });
        if (issues.length > 0) {
          throw new BadRequestException({ code: issues[0],
            message: issues[0] === "reason-required" ? "반려하려면 이유를 적어 주세요." : "조건부 승인은 조건을 적어야 합니다." });
        }
        const round = (await client.query<{ count: number }>(
          "SELECT count(*)::int count FROM production_stage_gate_decision WHERE gate_id=$1 AND round=$2", [gateId, input.round])).rows[0];
        const roundExists = (await client.query("SELECT 1 FROM production_stage_gate_round WHERE gate_id=$1 AND round=$2", [gateId, input.round])).rowCount;
        if (!roundExists) throw new NotFoundException("제출된 라운드가 없습니다.");
        if (round.count >= STAGE_GATE_FREE_POLICY.decisionsPerRound) quota("decisionsPerRound", round.count, STAGE_GATE_FREE_POLICY.decisionsPerRound);
        // 역할은 클라이언트가 정하지 않는다 — 리드 지정 본인이면 lead, 아니면 participant.
        const decisionRole = actor === gate.lead_reviewer_id ? "lead" : "participant";
        await client.query(`INSERT INTO production_stage_gate_decision(gate_id,round,decision_index,reviewer_id,reviewer_name,role,value,reason,conditions,pin_thread_ids)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)`,
          [gateId, input.round, round.count, actor, user.name ?? "구성원", decisionRole, input.value,
            input.reason, JSON.stringify(conditions), JSON.stringify(input.pinThreadIds)]);
      }
      const revision = currentRevision + 1;
      await client.query("UPDATE production_stage_gate SET revision=$2, updated_at=now() WHERE id=$1", [gateId, revision]);
      const result: StageGateMutationResult = { gateId, revision };
      await client.query(`INSERT INTO production_stage_gate_receipt(actor_user_id,mutation_id,gate_id,request_digest,response)
        VALUES($1,$2,$3,$4,$5::jsonb)`, [actor, input.mutationId, gateId, digest({ projectId, episodeId, stageId, ...input }), JSON.stringify(result)]);
      await client.query(`INSERT INTO production_stage_gate_audit(gate_id,actor_user_id,action,target_id,revision)
        VALUES($1,$2,$3,$4,$5)`, [gateId, actor, input.type, gateId, revision]);
      return result;
    }, true);
  }
}
