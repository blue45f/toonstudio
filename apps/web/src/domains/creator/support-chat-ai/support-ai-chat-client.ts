import { api } from "@/platform/api";

import {
  SUPPORT_AI_QUICK_PROMPTS,
  SUPPORT_LOCAL_KB,
  SUPPORT_TOPIC_OPTIONS,
  classifyLocalSupportTopic,
  maskSensitiveSupportInput,
  urgencyLabelKo,
  type CreatorSupportBriefCategory,
  type SupportAiActionLink,
  type SupportAiQuickPrompt,
  type SupportAiTopicId,
  type SupportTicketUrgency,
} from "./support-ai-chat-kb";

export {
  SUPPORT_AI_QUICK_PROMPTS,
  SUPPORT_LOCAL_KB,
  SUPPORT_TOPIC_OPTIONS,
  classifyLocalSupportTopic,
  maskSensitiveSupportInput,
  urgencyLabelKo,
  type CreatorSupportBriefCategory,
  type SupportAiActionLink,
  type SupportAiQuickPrompt,
  type SupportAiTopicId,
  type SupportTicketUrgency,
};

export type SupportChatSourceMode =
  | "zero-bill-free-ai"
  | "deterministic-kb"
  | "local-fallback";

export interface SupportAiChatMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly createdAt: string;
  readonly topicId?: SupportAiTopicId;
  readonly topicLabelKo?: string;
  readonly steps?: readonly string[];
  readonly actionLinks?: readonly SupportAiActionLink[];
  readonly followUpPrompts?: readonly string[];
  readonly suggestEscalation?: boolean;
  readonly piiMasked?: boolean;
  readonly maskedKinds?: readonly string[];
  readonly mode?: SupportChatSourceMode;
  readonly feedback?: "resolved" | "escalated";
}

export interface SupportAiChatReply {
  readonly sessionId: string;
  readonly userMessage: SupportAiChatMessage;
  readonly assistantMessage: SupportAiChatMessage;
  readonly topicId: SupportAiTopicId;
  readonly topicLabelKo: string;
  readonly mode: SupportChatSourceMode;
  readonly costKrw: 0;
  readonly paidBillingBlocked: true;
  readonly piiMasked: boolean;
  readonly maskedKinds: readonly string[];
  readonly actionLinks: readonly SupportAiActionLink[];
  readonly steps: readonly string[];
  readonly followUpPrompts: readonly string[];
  readonly suggestEscalation: boolean;
}

export interface SupportTicketAutofill {
  readonly sessionId: string | null;
  readonly oneLineIssue: string;
  readonly requiredFieldCount: 1;
  readonly requiredFieldLabelKo: "문의 한 줄";
  readonly category: SupportAiTopicId;
  readonly categoryLabelKo: string;
  readonly creatorSupportCategory: CreatorSupportBriefCategory;
  readonly urgency: SupportTicketUrgency;
  readonly urgencyLabelKo: string;
  readonly summary: string;
  readonly diagnosticChecklist: readonly string[];
  readonly actionLinks: readonly SupportAiActionLink[];
  readonly piiMasked: boolean;
  readonly maskedKinds: readonly string[];
  readonly costKrw: 0;
  readonly paidBillingBlocked: true;
  readonly sourceMode: "api" | "local-fallback";
}

export interface SupportHandoffPayload {
  readonly oneLineIssue: string;
  readonly category: SupportAiTopicId;
  readonly creatorSupportCategory: CreatorSupportBriefCategory;
  readonly urgency: SupportTicketUrgency;
  readonly summary: string;
  readonly checkedItems: readonly string[];
  readonly contact: string;
  readonly createdAt: string;
}

export const SUPPORT_HANDOFF_STORAGE_KEY = "toonstudio:ai-support-handoff:v1";

let localIdSeq = 0;
function nextLocalId(prefix: string): string {
  localIdSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${localIdSeq}`;
}

export function buildLocalSupportGreeting(): SupportAiChatMessage {
  return {
    id: nextLocalId("ai-greeting"),
    role: "assistant",
    content:
      "안녕하세요! ToonStudio AI 고객센터예요. 작업 파일 복구, 3D 배경·VRM 합성, 성능 개선, 무료 AI ₩0 한도, 분업 잠금 해제, 내보내기 오류까지 바로 해결 버튼과 함께 안내해 드릴게요. 개인정보·비밀키는 자동 마스킹되며 상담 비용은 ₩0입니다.",
    createdAt: new Date().toISOString(),
    topicId: "general",
    topicLabelKo: SUPPORT_LOCAL_KB.general.labelKo,
    actionLinks: SUPPORT_LOCAL_KB.general.actionLinks,
    followUpPrompts: SUPPORT_LOCAL_KB.general.followUpPrompts,
    mode: "local-fallback",
  };
}

export function generateLocalSupportReply(input: {
  readonly sessionId?: string;
  readonly message: string;
  readonly history?: readonly SupportAiChatMessage[];
}): SupportAiChatReply {
  const sessionId = input.sessionId ?? nextLocalId("local-session");
  const history = input.history ?? [];
  const lastTopic =
    [...history].reverse().find((msg) => msg.topicId && msg.topicId !== "general")?.topicId
    ?? "general";
  const priorUserTurns = history.filter((msg) => msg.role === "user").length;

  const sanitized = maskSensitiveSupportInput(input.message.trim());
  const classification = classifyLocalSupportTopic(sanitized.masked, lastTopic);
  const kb = SUPPORT_LOCAL_KB[classification.topicId];
  const isRepeatTurn =
    classification.isFollowUp
    || (lastTopic === classification.topicId && priorUserTurns >= 1 && classification.topicId !== "general");

  const nowIso = new Date().toISOString();
  const replyText = isRepeatTurn ? kb.followUpReplyKo : kb.replyKo;
  const steps = isRepeatTurn ? kb.followUpSteps : kb.steps;
  const suggestEscalation =
    classification.needsHumanEscalation || isRepeatTurn || priorUserTurns >= 3;

  const userMessage: SupportAiChatMessage = {
    id: nextLocalId("user"),
    role: "user",
    content: sanitized.masked,
    createdAt: nowIso,
    topicId: classification.topicId,
    piiMasked: sanitized.piiMasked,
    maskedKinds: sanitized.maskedKinds,
  };

  const assistantMessage: SupportAiChatMessage = {
    id: nextLocalId("ai"),
    role: "assistant",
    content: replyText,
    createdAt: nowIso,
    topicId: classification.topicId,
    topicLabelKo: kb.labelKo,
    steps,
    actionLinks: kb.actionLinks,
    followUpPrompts: kb.followUpPrompts,
    suggestEscalation,
    piiMasked: sanitized.piiMasked,
    maskedKinds: sanitized.maskedKinds,
    mode: "local-fallback",
  };

  return {
    sessionId,
    userMessage,
    assistantMessage,
    topicId: classification.topicId,
    topicLabelKo: kb.labelKo,
    mode: "local-fallback",
    costKrw: 0,
    paidBillingBlocked: true,
    piiMasked: sanitized.piiMasked,
    maskedKinds: sanitized.maskedKinds,
    actionLinks: kb.actionLinks,
    steps,
    followUpPrompts: kb.followUpPrompts,
    suggestEscalation,
  };
}

export function buildLocalTicketAutofill(input: {
  readonly sessionId?: string | null;
  readonly oneLineIssue?: string;
  readonly messages?: readonly SupportAiChatMessage[];
  readonly currentPath?: string;
}): SupportTicketAutofill {
  const maskedKinds = new Set<string>();
  let piiMasked = false;

  const sanitize = (raw: string): string => {
    const res = maskSensitiveSupportInput(raw.trim());
    if (res.piiMasked) {
      piiMasked = true;
      for (const kind of res.maskedKinds) maskedKinds.add(kind);
    }
    return res.masked;
  };

  const userLines = (input.messages ?? [])
    .filter((msg) => msg.role === "user")
    .map((msg) => sanitize(msg.content))
    .filter(Boolean);

  const explicit = input.oneLineIssue ? sanitize(input.oneLineIssue) : "";
  const oneLineIssue = explicit || userLines.at(-1)?.slice(0, 120) || "";

  const lastTopic =
    [...(input.messages ?? [])]
      .reverse()
      .find((msg) => msg.topicId && msg.topicId !== "general")?.topicId;
  const combined = [explicit, ...userLines].filter(Boolean).join("\n");
  const classification = classifyLocalSupportTopic(combined || "일반 이용 문의", lastTopic);
  const kb = SUPPORT_LOCAL_KB[classification.topicId];

  const summaryParts = [
    oneLineIssue ? `[문의 한 줄] ${oneLineIssue}` : null,
    `[AI 자동 분류] ${kb.labelKo} · 긴급도: ${urgencyLabelKo(classification.urgency)}`,
    input.currentPath?.startsWith("/") ? `[발생 화면] ${input.currentPath}` : null,
    userLines.length > 0
      ? `[상담 질문 기록]\n${userLines
          .slice(-4)
          .map((line, index) => `${index + 1}. ${line}`)
          .join("\n")}`
      : null,
    `[AI 사전 안내 체크]\n${kb.diagnosticChecklist.map((item) => `- [ ] ${item}`).join("\n")}`,
  ].filter((part): part is string => Boolean(part));

  return {
    sessionId: input.sessionId ?? null,
    oneLineIssue,
    requiredFieldCount: 1,
    requiredFieldLabelKo: "문의 한 줄",
    category: kb.topicId,
    categoryLabelKo: kb.labelKo,
    creatorSupportCategory: kb.creatorSupportCategory,
    urgency: classification.urgency,
    urgencyLabelKo: urgencyLabelKo(classification.urgency),
    summary: summaryParts.join("\n\n"),
    diagnosticChecklist: kb.diagnosticChecklist,
    actionLinks: kb.actionLinks,
    piiMasked,
    maskedKinds: [...maskedKinds],
    costKrw: 0,
    paidBillingBlocked: true,
    sourceMode: "local-fallback",
  };
}

interface RemoteChatApiResponse {
  readonly sessionId: string;
  readonly userTurn: SupportAiChatMessage;
  readonly assistantTurn: SupportAiChatMessage;
  readonly topicId: SupportAiTopicId;
  readonly topicLabelKo: string;
  readonly mode: "zero-bill-free-ai" | "deterministic-kb";
  readonly costKrw: 0;
  readonly paidBillingBlocked: true;
  readonly piiMasked: boolean;
  readonly maskedKinds: readonly string[];
  readonly actionLinks: readonly SupportAiActionLink[];
  readonly steps: readonly string[];
  readonly followUpPrompts: readonly string[];
  readonly suggestEscalation: boolean;
}

interface RemoteAutofillApiResponse {
  readonly sessionId: string | null;
  readonly oneLineIssue: string;
  readonly requiredFieldCount: 1;
  readonly requiredFieldLabelKo: "문의 한 줄";
  readonly category: SupportAiTopicId;
  readonly categoryLabelKo: string;
  readonly creatorSupportCategory: CreatorSupportBriefCategory;
  readonly urgency: SupportTicketUrgency;
  readonly urgencyLabelKo: string;
  readonly summary: string;
  readonly diagnosticChecklist: readonly string[];
  readonly actionLinks: readonly SupportAiActionLink[];
  readonly piiMasked: boolean;
  readonly maskedKinds: readonly string[];
  readonly costKrw: 0;
  readonly paidBillingBlocked: true;
}

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isValidRemoteChat(value: unknown): value is RemoteChatApiResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RemoteChatApiResponse>;
  return (
    typeof candidate.sessionId === "string"
    && Boolean(candidate.assistantTurn)
    && typeof candidate.assistantTurn?.content === "string"
    && Array.isArray(candidate.actionLinks)
  );
}

function isValidRemoteAutofill(value: unknown): value is RemoteAutofillApiResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RemoteAutofillApiResponse>;
  return (
    typeof candidate.oneLineIssue === "string"
    && typeof candidate.summary === "string"
    && Array.isArray(candidate.diagnosticChecklist)
  );
}

export async function sendSupportAiChatMessage(input: {
  readonly sessionId?: string;
  readonly message: string;
  readonly history: readonly SupportAiChatMessage[];
  readonly currentPath?: string;
  readonly signal?: AbortSignal;
}): Promise<SupportAiChatReply> {
  const sanitized = maskSensitiveSupportInput(input.message.trim());
  if (isBrowserOffline()) {
    return generateLocalSupportReply({
      sessionId: input.sessionId,
      message: input.message,
      history: input.history,
    });
  }

  try {
    const remote = await api.post<RemoteChatApiResponse>(
      "/customer-support/ai-chat",
      {
        action: "message",
        ...(input.sessionId && input.sessionId.length >= 8 ? { sessionId: input.sessionId } : {}),
        message: sanitized.masked,
        history: input.history.slice(-10).map((item) => ({
          role: item.role,
          content: maskSensitiveSupportInput(item.content).masked.slice(0, 1_500),
          ...(item.topicId ? { topicId: item.topicId } : {}),
        })),
        ...(input.currentPath?.startsWith("/") ? { currentPath: input.currentPath.slice(0, 180) } : {}),
      },
      { signal: input.signal, timeout: 6_000 },
    );

    if (!isValidRemoteChat(remote)) {
      return generateLocalSupportReply({
        sessionId: input.sessionId,
        message: input.message,
        history: input.history,
      });
    }

    const mergedMaskedKinds = [...new Set([...sanitized.maskedKinds, ...(remote.maskedKinds ?? [])])];
    const piiMasked = sanitized.piiMasked || remote.piiMasked;

    return {
      sessionId: remote.sessionId,
      userMessage: {
        ...remote.userTurn,
        piiMasked,
        maskedKinds: mergedMaskedKinds,
      },
      assistantMessage: {
        ...remote.assistantTurn,
        piiMasked,
        maskedKinds: mergedMaskedKinds,
        mode: remote.mode,
      },
      topicId: remote.topicId,
      topicLabelKo: remote.topicLabelKo,
      mode: remote.mode,
      costKrw: 0,
      paidBillingBlocked: true,
      piiMasked,
      maskedKinds: mergedMaskedKinds,
      actionLinks: remote.actionLinks,
      steps: remote.steps ?? [],
      followUpPrompts: remote.followUpPrompts ?? [],
      suggestEscalation: Boolean(remote.suggestEscalation),
    };
  } catch {
    return generateLocalSupportReply({
      sessionId: input.sessionId,
      message: input.message,
      history: input.history,
    });
  }
}

export async function requestSupportTicketAutofill(input: {
  readonly sessionId?: string | null;
  readonly oneLineIssue?: string;
  readonly messages: readonly SupportAiChatMessage[];
  readonly currentPath?: string;
  readonly signal?: AbortSignal;
}): Promise<SupportTicketAutofill> {
  const sanitizedLine = input.oneLineIssue ? maskSensitiveSupportInput(input.oneLineIssue) : null;
  if (isBrowserOffline()) {
    return buildLocalTicketAutofill(input);
  }

  try {
    const remote = await api.post<RemoteAutofillApiResponse>(
      "/customer-support/ai-chat/autofill-ticket",
      {
        ...(input.sessionId && input.sessionId.length >= 8 ? { sessionId: input.sessionId } : {}),
        ...(sanitizedLine?.masked ? { oneLineIssue: sanitizedLine.masked } : {}),
        messages: input.messages.slice(-14).map((item) => ({
          role: item.role,
          content: maskSensitiveSupportInput(item.content).masked.slice(0, 1_500),
          ...(item.topicId ? { topicId: item.topicId } : {}),
        })),
        ...(input.currentPath?.startsWith("/") ? { currentPath: input.currentPath.slice(0, 180) } : {}),
      },
      { signal: input.signal, timeout: 6_000 },
    );

    if (!isValidRemoteAutofill(remote)) {
      return buildLocalTicketAutofill(input);
    }

    const mergedMaskedKinds = [
      ...new Set([...(sanitizedLine?.maskedKinds ?? []), ...(remote.maskedKinds ?? [])]),
    ];

    return {
      ...remote,
      piiMasked: Boolean(sanitizedLine?.piiMasked || remote.piiMasked),
      maskedKinds: mergedMaskedKinds,
      sourceMode: "api",
    };
  } catch {
    return buildLocalTicketAutofill(input);
  }
}

const SUPPORT_HANDOFF_MAX_BYTES = 64 * 1024;
const SUPPORT_HANDOFF_FIELDS = ["oneLineIssue", "category", "creatorSupportCategory", "urgency", "summary", "checkedItems", "contact", "createdAt"];

function handoffObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validSupportHandoff(item: unknown): item is SupportHandoffPayload {
  if (!handoffObject(item)) return false;
  return Object.keys(item).every((key) => SUPPORT_HANDOFF_FIELDS.includes(key))
    && typeof item.oneLineIssue === "string" && item.oneLineIssue.trim().length > 0
    && typeof item.summary === "string" && typeof item.contact === "string"
    && typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt))
    && SUPPORT_TOPIC_OPTIONS.some((topic) => topic.id === item.category && topic.creatorSupportCategory === item.creatorSupportCategory)
    && ["high", "normal", "low"].some((urgency) => urgency === item.urgency)
    && Array.isArray(item.checkedItems) && item.checkedItems.every((entry) => typeof entry === "string");
}

/** 최근 문의 1개의 인계 사본이다. 원고·티켓 접수 권위가 아니며 쓰기 실패는 화면 인계를 막지 않는다. */
export function saveSupportHandoffDraft(payload: SupportHandoffPayload): boolean {
  if (typeof window === "undefined") return false;
  try {
    const copy: SupportHandoffPayload = { oneLineIssue: payload.oneLineIssue, category: payload.category,
      creatorSupportCategory: payload.creatorSupportCategory, urgency: payload.urgency, summary: payload.summary,
      checkedItems: payload.checkedItems, contact: payload.contact, createdAt: payload.createdAt };
    if (!validSupportHandoff(copy)) return false;
    const serialized = JSON.stringify(copy);
    if (new TextEncoder().encode(serialized).byteLength > SUPPORT_HANDOFF_MAX_BYTES) return false;
    const original = window.localStorage.getItem(SUPPORT_HANDOFF_STORAGE_KEY);
    if (original !== null && (original.length > SUPPORT_HANDOFF_MAX_BYTES
      || new TextEncoder().encode(original).byteLength > SUPPORT_HANDOFF_MAX_BYTES || !validSupportHandoff(JSON.parse(original)))) return false;
    window.localStorage.setItem(SUPPORT_HANDOFF_STORAGE_KEY, serialized);
    return window.localStorage.getItem(SUPPORT_HANDOFF_STORAGE_KEY) === serialized;
  } catch {
    return false;
  }
}
