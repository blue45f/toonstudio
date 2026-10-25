/**
 * studio-ai-reference-request.ts — 참조 첨부 채색 요청 구성 (순수 모듈, fetch 없음).
 *
 * 참조 첨부(studio-ai-reference-attachments.ts)는 검증까지만 있고 요청
 * 구성·모델 호출은 없었다. 이 모듈은 프롬프트와 첨부를 모델 호출용
 * 요청 페이로드 형태로 묶는다. 실제 호출은 하지 않으며, 게이트 뒤 스텁
 * 전제를 유지한다. 이미지 형식이 아닌 첨부는 빼고 경고에 남긴다.
 */

import type { StudioAiReferenceAttachment } from "./studio-ai-reference-attachments";
import { STUDIO_AI_REFERENCE_ATTACHMENT_CAP } from "./studio-ai-reference-attachments";

export interface StudioAiReferenceRequestReference {
  readonly id: string;
  readonly dataUrl: string;
}

export interface StudioAiReferenceColorizeRequest {
  readonly prompt: string;
  readonly references: readonly StudioAiReferenceRequestReference[];
  readonly warnings: readonly string[];
}

export type StudioAiReferenceRequestResult =
  | { readonly ok: true; readonly request: StudioAiReferenceColorizeRequest }
  | { readonly ok: false; readonly reason: "empty_prompt" };

export type StudioAiReferenceRequestAttachmentInput =
  | StudioAiReferenceAttachment
  | { readonly id: string; readonly dataUrl: string };

/** 프롬프트와 첨부를 요청 페이로드로 묶는다. 호출은 호출부가 맡는다. */
export function buildReferenceColorizeRequest(input: {
  readonly prompt: string;
  readonly attachments: readonly StudioAiReferenceRequestAttachmentInput[];
}): StudioAiReferenceRequestResult {
  const prompt = input.prompt.trim();
  if (!prompt) return { ok: false, reason: "empty_prompt" };
  const references: StudioAiReferenceRequestReference[] = [];
  const warnings: string[] = [];
  for (const attachment of input.attachments) {
    if (references.length >= STUDIO_AI_REFERENCE_ATTACHMENT_CAP) {
      warnings.push("첨부 상한(6장)을 넘어 나머지는 제외했다");
      break;
    }
    const dataUrl =
      "dataUrl" in attachment ? attachment.dataUrl : attachment.ref;
    if (!dataUrl.startsWith("data:image/")) {
      warnings.push(`이미지가 아닌 첨부(${attachment.id})를 제외했다`);
      continue;
    }
    references.push({ id: attachment.id, dataUrl });
  }
  return {
    ok: true,
    request: {
      prompt,
      references: Object.freeze(references),
      warnings: Object.freeze(warnings),
    },
  };
}
