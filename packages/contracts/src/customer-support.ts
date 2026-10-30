/** 사용자 웹·관리자·API가 공유하는 비공개 고객상담 계약. */
export type SupportConversationStatus = "ai" | "waiting" | "open" | "closed";
export type SupportMessageRole = "user" | "assistant" | "admin";

export interface SupportConversation {
  id: string;
  subject: string;
  status: SupportConversationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  conversationId: string;
  role: SupportMessageRole;
  content: string;
  createdAt: string;
}

export interface SupportAiError {
  code: "SUPPORT_AI_UNAVAILABLE" | "SUPPORT_AI_LIMIT" | "SUPPORT_AI_BUSY";
  message: string;
}

export interface SupportConversationDetail {
  conversation: SupportConversation;
  messages: SupportMessage[];
  aiError?: SupportAiError;
}

export interface SupportConversationList {
  items: SupportConversation[];
  total: number;
}

export interface SupportAiStatus {
  available: boolean;
  reason: "configured" | "missing_key" | "disabled";
}

export interface SupportStatus {
  ai: SupportAiStatus;
}

export interface CreateSupportConversation {
  subject: string;
  mode: "ai" | "human";
}

export interface SendSupportMessage {
  content: string;
  clientMessageId: string;
}

export const SUPPORT_SUBJECT_MAX_LENGTH = 120;
export const SUPPORT_MESSAGE_MAX_LENGTH = 4000;
export const SUPPORT_CONVERSATION_MESSAGE_LIMIT = 200;
