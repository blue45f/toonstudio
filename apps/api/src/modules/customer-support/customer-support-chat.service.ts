import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import { z } from "zod";

import { StudioFreeAiZeroBillRouter } from "../studio-ai/studio-free-ai-zero-bill-router";

import {
  SUPPORT_CHAT_KNOWLEDGE_BASE,
  SUPPORT_CHAT_QUICK_PROMPTS,
  classifySupportTopic,
  maskSensitiveSupportText,
  urgencyLabelKo,
  type CreatorSupportBriefCategory,
  type MaskSensitiveResult,
  type SupportActionLink,
  type SupportChatQuickPrompt,
  type SupportChatTopicId,
  type SupportTicketUrgency,
} from "./customer-support-chat-kb";

import type { EnvLike } from "../studio-ai/openai-assist/studio-openai-guardrails";

export {
  SUPPORT_CHAT_KNOWLEDGE_BASE,
  SUPPORT_CHAT_QUICK_PROMPTS,
  classifySupportTopic,
  maskSensitiveSupportText,
  urgencyLabelKo,
  type CreatorSupportBriefCategory,
  type MaskSensitiveResult,
  type SupportActionLink,
  type SupportChatQuickPrompt,
  type SupportChatTopicId,
  type SupportTicketUrgency,
};

export type SupportChatDeliveryMode = "zero-bill-free-ai" | "deterministic-kb";

export interface SupportChatTurn {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly createdAt: string;
  readonly topicId?: SupportChatTopicId;
  readonly topicLabelKo?: string;
  readonly steps?: readonly string[];
  readonly actionLinks?: readonly SupportActionLink[];
  readonly followUpPrompts?: readonly string[];
  readonly suggestEscalation?: boolean;
  readonly piiMasked?: boolean;
  readonly maskedKinds?: readonly string[];
  readonly mode?: SupportChatDeliveryMode;
}

export interface SupportChatCallerContext {
  readonly userId?: string;
  readonly forwardedFor?: string;
  readonly remoteAddress?: string;
}

export interface SupportChatStartResponse {
  readonly sessionId: string;
  readonly greeting: SupportChatTurn;
  readonly quickPrompts: readonly SupportChatQuickPrompt[];
  readonly costKrw: 0;
  readonly paidBillingBlocked: true;
  readonly zeroBillActiveCloudCount: number;
}

export interface SupportChatReplyResponse {
  readonly sessionId: string;
  readonly userTurn: SupportChatTurn;
  readonly assistantTurn: SupportChatTurn;
  readonly topicId: SupportChatTopicId;
  readonly topicLabelKo: string;
  readonly mode: SupportChatDeliveryMode;
  readonly costKrw: 0;
  readonly paidBillingBlocked: true;
  readonly piiMasked: boolean;
  readonly maskedKinds: readonly string[];
  readonly actionLinks: readonly SupportActionLink[];
  readonly steps: readonly string[];
  readonly followUpPrompts: readonly string[];
  readonly suggestEscalation: boolean;
  readonly turnCount: number;
  readonly quickPrompts: readonly SupportChatQuickPrompt[];
}

export interface SupportTicketAutofillResponse {
  readonly sessionId: string | null;
  readonly oneLineIssue: string;
  readonly requiredFieldCount: 1;
  readonly requiredFieldLabelKo: "문의 한 줄";
  readonly category: SupportChatTopicId;
  readonly categoryLabelKo: string;
  readonly creatorSupportCategory: CreatorSupportBriefCategory;
  readonly urgency: SupportTicketUrgency;
  readonly urgencyLabelKo: string;
  readonly summary: string;
  readonly diagnosticChecklist: readonly string[];
  readonly actionLinks: readonly SupportActionLink[];
  readonly piiMasked: boolean;
  readonly maskedKinds: readonly string[];
  readonly costKrw: 0;
  readonly paidBillingBlocked: true;
}

interface StoredChatSession {
  readonly sessionId: string;
  readonly createdAtMs: number;
  updatedAtMs: number;
  lastTopicId: SupportChatTopicId;
  turns: SupportChatTurn[];
}

interface RateLimitBucket {
  timestampsMs: number[];
}

export interface CustomerSupportChatServiceOptions {
  readonly env?: EnvLike;
  readonly nowMs?: () => number;
  readonly guestMaxPerMinute?: number;
  readonly userMaxPerMinute?: number;
  readonly rateWindowMs?: number;
}

const MAX_SESSIONS = 400;
const SESSION_TTL_MS = 30 * 60 * 1_000;
const MAX_TURNS_PER_SESSION = 24;
const MAX_RATE_BUCKETS = 1_000;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_GUEST_MAX_PER_MIN = 20;
const DEFAULT_USER_MAX_PER_MIN = 40;
const MAX_FREE_AI_RESPONSE_CHARS = 1_500;

const historyItemSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(2_000),
    topicId: z
      .enum([
        "local-backup-opfs",
        "wasm-webgpu-perf",
        "bg3d-vrm-composite",
        "photoshop-pro-lab",
        "collab-os-locks",
        "free-ai-zero-bill",
        "rights-bom-license",
        "export-billing",
        "general",
      ])
      .optional(),
  })
  .strict();

export const supportAiChatRequestSchema = z
  .object({
    action: z.enum(["start", "message"]).optional(),
    sessionId: z.string().trim().min(8).max(80).optional(),
    message: z.string().trim().min(1).max(2_000).optional(),
    history: z.array(historyItemSchema).max(16).optional(),
    currentPath: z.string().trim().max(200).optional(),
    useFreeAi: z.boolean().optional(),
  })
  .strict();

export const supportTicketAutofillRequestSchema = z
  .object({
    sessionId: z.string().trim().min(8).max(80).optional(),
    oneLineIssue: z.string().trim().max(200).optional(),
    messages: z.array(historyItemSchema).max(24).optional(),
    currentPath: z.string().trim().max(200).optional(),
  })
  .strict();

const FREE_AI_SYSTEM_PROMPT = `당신은 ToonStudio의 초보자 친화 1:1 AI 고객센터 상담사입니다.
규칙:
- 자연스럽고 따뜻한 한국어로 3~5문장 이내로 간결하게 답하세요. 번역투를 피하세요.
- 사용자가 직접 시도할 수 있는 구체적 해결 단계만 안내하고, 확인되지 않은 요금·환불 정책·운영 시간은 지어내지 마세요.
- 계정·결제·환불 변경을 직접 완료했다고 말하지 말고, 필요하면 화면의 '담당자 연결'을 권하세요.
- 개인정보·비밀번호·API 키를 요구하거나 출력하지 마세요. 마크다운 코드블록이나 HTML 태그는 쓰지 마세요.`;

function isSafeFreeAiReply(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_FREE_AI_RESPONSE_CHARS) return false;
  if (/<script|<iframe|javascript:/iu.test(trimmed)) return false;
  return true;
}

function normalizeCurrentPath(path?: string): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed.slice(0, 120);
}

@Injectable()
export class CustomerSupportChatService {
  private readonly router: StudioFreeAiZeroBillRouter;
  private readonly sessions = new Map<string, StoredChatSession>();
  private readonly rateBuckets = new Map<string, RateLimitBucket>();
  private readonly envOverride?: EnvLike;
  private readonly clock: () => number;
  private readonly guestMaxPerMinute: number;
  private readonly userMaxPerMinute: number;
  private readonly rateWindowMs: number;

  constructor(
    @Optional() @Inject(StudioFreeAiZeroBillRouter) zeroBillRouter?: StudioFreeAiZeroBillRouter,
    @Optional() options?: CustomerSupportChatServiceOptions,
  ) {
    this.router = zeroBillRouter ?? new StudioFreeAiZeroBillRouter();
    this.envOverride = options?.env;
    this.clock = options?.nowMs ?? (() => Date.now());
    this.guestMaxPerMinute = options?.guestMaxPerMinute ?? DEFAULT_GUEST_MAX_PER_MIN;
    this.userMaxPerMinute = options?.userMaxPerMinute ?? DEFAULT_USER_MAX_PER_MIN;
    this.rateWindowMs = options?.rateWindowMs ?? DEFAULT_RATE_WINDOW_MS;
  }

  private env(): EnvLike {
    return this.envOverride ?? process.env;
  }

  private enforceRateLimit(caller?: SupportChatCallerContext): void {
    const now = this.clock();
    const userId = caller?.userId?.trim();
    const guestRaw = caller?.forwardedFor?.split(",")[0]?.trim() || caller?.remoteAddress?.trim() || "guest-local";
    const key = userId ? `user:${userId}` : `guest:${guestRaw.slice(0, 64)}`;
    const limit = userId ? this.userMaxPerMinute : this.guestMaxPerMinute;

    if (this.rateBuckets.size >= MAX_RATE_BUCKETS && !this.rateBuckets.has(key)) {
      const oldestKey = this.rateBuckets.keys().next().value;
      if (oldestKey) this.rateBuckets.delete(oldestKey);
    }

    const bucket = this.rateBuckets.get(key) ?? { timestampsMs: [] };
    bucket.timestampsMs = bucket.timestampsMs.filter((ts) => now - ts < this.rateWindowMs);
    if (bucket.timestampsMs.length >= limit) {
      throw new HttpException(
        {
          code: "SUPPORT_CHAT_RATE_LIMITED",
          message: "잠시 숨을 고른 뒤 다시 질문해 주세요. 1분 안에 요청이 너무 많이 들어왔어요.",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    bucket.timestampsMs.push(now);
    this.rateBuckets.set(key, bucket);
  }

  private pruneSessions(nowMs: number): void {
    for (const [id, session] of this.sessions.entries()) {
      if (nowMs - session.updatedAtMs > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
    while (this.sessions.size >= MAX_SESSIONS) {
      const oldestKey = this.sessions.keys().next().value;
      if (!oldestKey) break;
      this.sessions.delete(oldestKey);
    }
  }

  startSession(
    input?: { currentPath?: string },
    caller?: SupportChatCallerContext,
  ): SupportChatStartResponse {
    this.enforceRateLimit(caller);
    const now = this.clock();
    this.pruneSessions(now);

    const sessionId = randomUUID();
    const quota = this.router.getFreeQuotaStatus(this.env(), now);
    const safePath = normalizeCurrentPath(input?.currentPath);
    const greetingContent = safePath
      ? `안녕하세요! ToonStudio AI 고객센터예요. 현재 화면(${safePath}) 기준으로 막힌 부분이나 궁금한 점을 편하게 물어보세요. 개인정보와 비밀키는 자동으로 마스킹되며, 모든 AI 상담은 ₩0 무료로 안전하게 제공돼요.`
      : "안녕하세요! ToonStudio AI 고객센터예요. 작업 파일 복구, 3D 배경·VRM 합성, 성능 개선, 무료 AI ₩0 한도, 분업 잠금 해제, 내보내기 오류까지 원클릭 해결 버튼과 함께 안내해 드릴게요. 개인정보·비밀키는 자동 마스킹됩니다.";

    const greeting: SupportChatTurn = {
      id: randomUUID(),
      role: "assistant",
      content: greetingContent,
      createdAt: new Date(now).toISOString(),
      topicId: "general",
      topicLabelKo: SUPPORT_CHAT_KNOWLEDGE_BASE.general.labelKo,
      actionLinks: SUPPORT_CHAT_KNOWLEDGE_BASE.general.actionLinks,
      followUpPrompts: SUPPORT_CHAT_KNOWLEDGE_BASE.general.followUpPrompts,
      mode: "deterministic-kb",
    };

    this.sessions.set(sessionId, {
      sessionId,
      createdAtMs: now,
      updatedAtMs: now,
      lastTopicId: "general",
      turns: [greeting],
    });

    return {
      sessionId,
      greeting,
      quickPrompts: SUPPORT_CHAT_QUICK_PROMPTS,
      costKrw: 0,
      paidBillingBlocked: true,
      zeroBillActiveCloudCount: quota.summary.activeCloudCount,
    };
  }

  async handleChatRequest(
    rawInput: unknown,
    caller?: SupportChatCallerContext,
  ): Promise<SupportChatStartResponse | SupportChatReplyResponse> {
    const parsed = supportAiChatRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException("AI 채팅상담 요청 내용을 확인해 주세요.");
    }
    const data = parsed.data;
    if (data.action === "start" && !data.message) {
      return this.startSession({ currentPath: data.currentPath }, caller);
    }
    if (!data.message) {
      throw new BadRequestException("질문 내용을 한 글자 이상 입력해 주세요.");
    }
    return this.sendMessage(
      {
        sessionId: data.sessionId,
        message: data.message,
        history: data.history,
        currentPath: data.currentPath,
        useFreeAi: data.useFreeAi,
      },
      caller,
    );
  }

  async sendMessage(
    rawInput: {
      sessionId?: string;
      message: string;
      history?: readonly { role: "user" | "assistant"; content: string; topicId?: SupportChatTopicId }[];
      currentPath?: string;
      useFreeAi?: boolean;
    },
    caller?: SupportChatCallerContext,
  ): Promise<SupportChatReplyResponse> {
    const parsed = supportAiChatRequestSchema.safeParse({ ...rawInput, action: "message" });
    if (!parsed.success || !parsed.data.message) {
      throw new BadRequestException("AI 채팅상담 메시지를 확인해 주세요.");
    }

    this.enforceRateLimit(caller);
    const now = this.clock();
    this.pruneSessions(now);

    const data = parsed.data;
    const messageText = parsed.data.message;
    const requestedSessionId = data.sessionId ?? randomUUID();
    let session = this.sessions.get(requestedSessionId);

    if (!session) {
      const hydratedTurns: SupportChatTurn[] = (data.history ?? []).map((item) => {
        const sanitized = maskSensitiveSupportText(item.content);
        return {
          id: randomUUID(),
          role: item.role,
          content: sanitized.masked,
          createdAt: new Date(now).toISOString(),
          topicId: item.topicId,
          piiMasked: sanitized.piiMasked,
          maskedKinds: sanitized.maskedKinds,
        };
      });
      const lastKnownTopic =
        [...hydratedTurns].reverse().find((turn) => turn.topicId && turn.topicId !== "general")?.topicId
        ?? "general";
      session = {
        sessionId: requestedSessionId,
        createdAtMs: now,
        updatedAtMs: now,
        lastTopicId: lastKnownTopic,
        turns: hydratedTurns,
      };
      this.sessions.set(requestedSessionId, session);
    }

    const sanitizedUser = maskSensitiveSupportText(messageText);
    const classification = classifySupportTopic(sanitizedUser.masked, session.lastTopicId);
    const kb = SUPPORT_CHAT_KNOWLEDGE_BASE[classification.topicId];
    const priorUserTurns = session.turns.filter((turn) => turn.role === "user").length;
    const isRepeatTopicTurn =
      classification.isFollowUp
      || (session.lastTopicId === classification.topicId && priorUserTurns >= 1 && classification.topicId !== "general");

    const deterministicReply = isRepeatTopicTurn ? kb.followUpReplyKo : kb.replyKo;
    const steps = isRepeatTopicTurn ? kb.followUpSteps : kb.steps;
    const suggestEscalation =
      classification.needsHumanEscalation || isRepeatTopicTurn || priorUserTurns >= 3;

    let replyText = deterministicReply;
    let mode: SupportChatDeliveryMode = "deterministic-kb";

    const quota = this.router.getFreeQuotaStatus(this.env(), now);
    if (data.useFreeAi !== false && quota.summary.activeCloudCount > 0) {
      const recentContext = session.turns
        .slice(-4)
        .map((turn) => `${turn.role === "user" ? "사용자" : "상담사"}: ${turn.content}`)
        .join("\n");
      const safePath = normalizeCurrentPath(data.currentPath);
      const userPrompt = [
        `감지된 주제: ${kb.labelKo}`,
        safePath ? `현재 화면: ${safePath}` : null,
        recentContext ? `최근 대화:\n${recentContext}` : null,
        `새 질문: ${sanitizedUser.masked}`,
        `공식 해결 기준:\n- ${steps.join("\n- ")}`,
        "위 공식 기준을 벗어나지 않으면서 초보자가 바로 따라 할 수 있게 친절한 한국어로 답하세요.",
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n\n");

      const cascade = await this.router.executeCascade(
        {
          systemInstruction: FREE_AI_SYSTEM_PROMPT,
          userPrompt,
          maxOutputTokens: 450,
          temperature: 0.3,
          allowLocalDeterministicFallback: true,
          localDeterministicOutput: () => deterministicReply,
        },
        {
          env: this.env(),
          nowMs: now,
          validateContent: isSafeFreeAiReply,
        },
      );

      if (cascade.ok && cascade.providerTier === "cloud-free" && isSafeFreeAiReply(cascade.content)) {
        const sanitizedAi = maskSensitiveSupportText(cascade.content.trim());
        replyText = sanitizedAi.masked;
        mode = "zero-bill-free-ai";
      }
    }

    const userTurn: SupportChatTurn = {
      id: randomUUID(),
      role: "user",
      content: sanitizedUser.masked,
      createdAt: new Date(now).toISOString(),
      topicId: classification.topicId,
      piiMasked: sanitizedUser.piiMasked,
      maskedKinds: sanitizedUser.maskedKinds,
    };

    const assistantTurn: SupportChatTurn = {
      id: randomUUID(),
      role: "assistant",
      content: replyText,
      createdAt: new Date(now).toISOString(),
      topicId: classification.topicId,
      topicLabelKo: kb.labelKo,
      steps,
      actionLinks: kb.actionLinks,
      followUpPrompts: kb.followUpPrompts,
      suggestEscalation,
      piiMasked: sanitizedUser.piiMasked,
      maskedKinds: sanitizedUser.maskedKinds,
      mode,
    };

    session.turns = [...session.turns, userTurn, assistantTurn].slice(-MAX_TURNS_PER_SESSION);
    session.lastTopicId = classification.topicId;
    session.updatedAtMs = now;

    return {
      sessionId: session.sessionId,
      userTurn,
      assistantTurn,
      topicId: classification.topicId,
      topicLabelKo: kb.labelKo,
      mode,
      costKrw: 0,
      paidBillingBlocked: true,
      piiMasked: sanitizedUser.piiMasked,
      maskedKinds: sanitizedUser.maskedKinds,
      actionLinks: kb.actionLinks,
      steps,
      followUpPrompts: kb.followUpPrompts,
      suggestEscalation,
      turnCount: session.turns.filter((turn) => turn.role === "user").length,
      quickPrompts: SUPPORT_CHAT_QUICK_PROMPTS,
    };
  }

  suggestTicketAutofill(
    rawInput: unknown,
    caller?: SupportChatCallerContext,
  ): SupportTicketAutofillResponse {
    const parsed = supportTicketAutofillRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException("담당자 문의 자동 채우기 입력을 확인해 주세요.");
    }

    this.enforceRateLimit(caller);
    const data = parsed.data;
    const stored = data.sessionId ? this.sessions.get(data.sessionId) : undefined;

    const rawUserMessages: string[] = [];
    const maskedKindsSet = new Set<string>();
    let piiMasked = false;

    const collectSanitized = (text: string): string => {
      const result = maskSensitiveSupportText(text.trim());
      if (result.piiMasked) {
        piiMasked = true;
        for (const kind of result.maskedKinds) maskedKindsSet.add(kind);
      }
      return result.masked;
    };

    const sourceTurns =
      data.messages && data.messages.length > 0
        ? data.messages
        : (stored?.turns ?? []).map((turn) => ({
            role: turn.role,
            content: turn.content,
            topicId: turn.topicId,
          }));

    for (const turn of sourceTurns) {
      if (turn.role === "user") {
        const clean = collectSanitized(turn.content);
        if (clean) rawUserMessages.push(clean);
      }
    }

    const explicitLine = data.oneLineIssue ? collectSanitized(data.oneLineIssue) : "";
    const derivedLine = explicitLine || rawUserMessages.at(-1)?.slice(0, 120) || "";

    if (!derivedLine) {
      throw new BadRequestException("문의 한 줄을 입력하거나 진행 중인 상담 대화를 전달해 주세요.");
    }

    const combinedText = [explicitLine, ...rawUserMessages].filter(Boolean).join("\n");
    const classification = classifySupportTopic(combinedText, stored?.lastTopicId);
    const kb = SUPPORT_CHAT_KNOWLEDGE_BASE[classification.topicId];
    const safePath = normalizeCurrentPath(data.currentPath);

    const summaryLines = [
      `[문의 한 줄] ${derivedLine}`,
      `[AI 자동 분류] ${kb.labelKo} · 긴급도: ${urgencyLabelKo(classification.urgency)}`,
      safePath ? `[발생 화면] ${safePath}` : null,
      rawUserMessages.length > 0
        ? `[상담 질문 기록]\n${rawUserMessages
            .slice(-4)
            .map((line, idx) => `${idx + 1}. ${line}`)
            .join("\n")}`
        : null,
      `[AI 사전 안내 체크]\n${kb.diagnosticChecklist.map((item) => `- [ ] ${item}`).join("\n")}`,
    ].filter((line): line is string => Boolean(line));

    return {
      sessionId: stored?.sessionId ?? data.sessionId ?? null,
      oneLineIssue: derivedLine,
      requiredFieldCount: 1,
      requiredFieldLabelKo: "문의 한 줄",
      category: kb.topicId,
      categoryLabelKo: kb.labelKo,
      creatorSupportCategory: kb.creatorSupportCategory,
      urgency: classification.urgency,
      urgencyLabelKo: urgencyLabelKo(classification.urgency),
      summary: summaryLines.join("\n\n"),
      diagnosticChecklist: kb.diagnosticChecklist,
      actionLinks: kb.actionLinks,
      piiMasked,
      maskedKinds: [...maskedKindsSet],
      costKrw: 0,
      paidBillingBlocked: true,
    };
  }
}
