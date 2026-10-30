import type {
  SupportStatus,
  SupportConversationDetail,
  SupportConversationList,
} from "@toonstudio/contracts/customer-support";

import { api } from "@/platform/api";

const conversationPath = (id: string) => `/support/conversations/${encodeURIComponent(id)}`;

export function getSupportAiStatus(signal?: AbortSignal): Promise<SupportStatus> {
  return api.get("/support/status", { signal, retry: 0 });
}

export function listMySupportConversations(
  signal?: AbortSignal,
  page: { limit: number; offset: number } = { limit: 50, offset: 0 },
): Promise<SupportConversationList> {
  return api.get("/support/conversations", { signal, retry: 0, params: page });
}

export function getSupportConversation(id: string, signal?: AbortSignal): Promise<SupportConversationDetail> {
  return api.get(conversationPath(id), { signal, retry: 0 });
}

export function createSupportConversation(
  subject: string,
  mode: "ai" | "human",
  signal?: AbortSignal,
): Promise<SupportConversationDetail> {
  return api.post("/support/conversations", { subject, mode }, { signal });
}

export function sendSupportMessage(
  id: string,
  content: string,
  clientMessageId: string,
  signal?: AbortSignal,
): Promise<SupportConversationDetail> {
  return api.post(`${conversationPath(id)}/messages`, { content, clientMessageId }, { signal });
}

export function actOnSupportConversation(
  id: string,
  action: "escalate" | "retry" | "close",
  signal?: AbortSignal,
): Promise<SupportConversationDetail> {
  return api.post(`${conversationPath(id)}/${action}`, {}, { signal });
}
