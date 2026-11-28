import { createHash, randomBytes } from "node:crypto";

import { HttpException } from "@nestjs/common";

import type { StudioOpenAiCreativeAssistRequest } from "../studio-openai-creative-assist.dto";
import type { PostgresStudioAiAdmissionRepository } from "../studio-ai-admission.repository";
import {
  parseStudioAiIdempotencyKey, studioAiUserIdempotencyKeyHash,
  STUDIO_AI_IDEMPOTENCY_RECEIPT_RETENTION_MS,
} from "../studio-ai-idempotency";

type Receipts = Pick<PostgresStudioAiAdmissionRepository,
  "claimCreativeAssist" | "markSent" | "markSucceeded" | "markAmbiguous" | "abandonBeforeSend" | "abandonSafeRejection">;

export interface CreativeAssistSendBoundary {
  authorize(): Promise<void>;
  dispatched(): void;
  rejectedBeforeInference(): void;
}

function error(status: number, code: string, message: string) {
  return new HttpException({ code, message }, status);
}

function unavailable() {
  return error(503, "OPENAI_IDEMPOTENCY_UNAVAILABLE", "기존 작업의 상태를 확인할 수 없어요. 같은 요청으로 다시 확인해 주세요.");
}

export class StudioOpenAiAssistIdempotency {
  // 최대 64 × 64KiB. 원고·결과를 영구 저장하지 않고, 만료 시 유휴 프로세스에서도 제거한다.
  private readonly cache = new Map<string, { json: string; expiresAt: number; timer: ReturnType<typeof setTimeout> }>();

  constructor(private receipts?: Receipts) {}

  async run<T>(actor: string, input: StudioOpenAiCreativeAssistRequest, keyInput: unknown,
    execute: (boundary: CreativeAssistSendBoundary) => Promise<T>): Promise<T> {
    let key: string;
    try { key = parseStudioAiIdempotencyKey(keyInput); }
    catch { throw error(400, "OPENAI_INVALID_IDEMPOTENCY_KEY", "작업 키의 형식이 잘못됐어요."); }
    if (!actor.startsWith("user:") || !actor.slice(5)) {
      throw error(401, "OPENAI_ASSIST_LOGIN_REQUIRED", "로그인 후 작업을 다시 확인해 주세요.");
    }
    const userId = actor.slice(5);
    const userKeyHash = studioAiUserIdempotencyKeyHash(userId, key);
    const requestHash = createHash("sha256").update(JSON.stringify([
      "studio-openai-assist-v1", key, input.mode, input.inputText, input.projectTitle ?? "",
      input.genreOrTone ?? "", input.targetPlatform ?? "", input.allowZeroBillCascade ?? false,
    ])).digest();
    const receipt = { userId, userKeyHash, requestHash, fence: randomBytes(6).readUIntBE(0, 6).toString() };
    const cacheKey = Buffer.from(userKeyHash).toString("hex") + requestHash.toString("hex");
    const started = Date.now();
    const receipts = this.receipts ??= await import("../studio-ai-admission.repository")
      .then(({ PostgresStudioAiAdmissionRepository }) => new PostgresStudioAiAdmissionRepository())
      .catch(() => { throw unavailable(); });
    const conflict = await receipts.claimCreativeAssist(receipt).catch(() => { throw unavailable(); });
    switch (conflict) {
      case "key_reused_with_different_request":
        throw error(409, "OPENAI_IDEMPOTENCY_KEY_REUSED", "이 작업 키는 다른 원고에 사용됐어요.");
      case "request_admitted":
      case "request_sent":
        throw error(425, "OPENAI_REQUEST_IN_PROGRESS", "같은 작업이 진행 중이에요. 같은 요청으로 결과를 확인해 주세요.");
      case "request_ambiguous":
        throw error(409, "OPENAI_REQUEST_OUTCOME_UNKNOWN", "이전 요청이 공급자에 전달됐어요. 과금 여부를 확인할 때까지 같은 작업의 생성을 보류합니다.");
      case "request_succeeded": {
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) return JSON.parse(cached.json) as T;
        throw error(409, "OPENAI_RESULT_ALREADY_PRODUCED", "이 작업은 이미 생성됐어요. 현재 서버에서 이전 결과를 불러올 수 없습니다.");
      }
    }

    this.removeCached(cacheKey);
    let authorized = false;
    let dispatched = false;
    let rejectedBeforeInference = false;
    let result: T;
    try {
      result = await execute({
        authorize: async () => {
          authorized = await receipts.markSent(receipt).catch(() => { throw unavailable(); });
          if (!authorized) throw unavailable();
        },
        dispatched: () => { dispatched = true; },
        rejectedBeforeInference: () => { rejectedBeforeInference = true; },
      });
    } catch (cause) {
      // 확실히 미전송인 작업만 해제한다. 기록 실패 때에도 기존 영수증이 재전송을 차단한다.
      if (dispatched && !rejectedBeforeInference) {
        await receipts.markAmbiguous(receipt).catch(() => false);
      } else if (authorized) {
        await receipts.abandonSafeRejection(receipt).catch(() => false);
      } else {
        // 전송 기록은 커밋됐지만 DB 응답만 유실됐을 수 있다. 두 삭제 모두 소유자 fence를 검사한다.
        const removed = await receipts.abandonBeforeSend(receipt).catch(() => false);
        if (!removed) await receipts.abandonSafeRejection(receipt).catch(() => false);
      }
      throw cause;
    }

    // 생성 후의 DB 장애가 이미 받은 성공 응답을 가리지 않게 한다. sent가 재전송을 막는다.
    if (await receipts.markSucceeded(receipt).catch(() => false)) {
      const json = JSON.stringify(result);
      const expiresAt = started + STUDIO_AI_IDEMPOTENCY_RECEIPT_RETENTION_MS;
      if (Buffer.byteLength(json) <= 64 * 1024 && expiresAt > Date.now()) {
        const oldest = this.cache.keys().next().value;
        if (this.cache.size >= 64 && oldest !== undefined) this.removeCached(oldest);
        const timer = setTimeout(() => this.removeCached(cacheKey), expiresAt - Date.now());
        timer.unref();
        this.cache.set(cacheKey, { json, expiresAt, timer });
      }
    }
    return result;
  }

  private removeCached(key: string) {
    const entry = this.cache.get(key);
    if (entry) clearTimeout(entry.timer);
    this.cache.delete(key);
  }
}
