import type { SupportMessage } from "@toonstudio/contracts/customer-support";
import type { CustomerSupportAiMessage } from "./customer-support-ai.service";

/** 최신 질문을 유지하며 제공자 문맥을 16,000자·20개로 제한한다. */
export function customerSupportAiContext(messages: SupportMessage[]): CustomerSupportAiMessage[] {
  const result: CustomerSupportAiMessage[] = [];
  let size = 0;
  for (const item of [...messages].reverse()) {
    if (item.role === "admin") continue;
    if (result.length >= 20 || size + item.content.length > 16_000) break;
    size += item.content.length;
    result.unshift({ role: item.role, content: item.content });
  }
  while (result.length > 1 && result[0].role !== "user") result.shift();
  return result;
}

/** UTF-8 바이트 수와 시스템·메시지 포맷 여유 8,192 + 출력 1,024를 보수적으로 예약한다. */
export function customerSupportAiReservedTokens(messages: SupportMessage[]): number {
  return customerSupportAiContext(messages).reduce((sum, item) => sum + Buffer.byteLength(item.content, "utf8"), 9_216);
}
