/**
 * studio-ai-reference-attachments.ts — 멀티모달 참조 첨부 스캐폴드 (순수 모듈, fetch 없음).
 *
 * 채색·컷 작업에 참조 이미지·텍스트 지시를 함께 첨부하는 UI의
 * 데이터 구조만 만든다. 실제 멀티모달 모델 호출은 유료 전제이므로
 * 이 모듈에는 호출 경로가 없으며, 첨부 목록은 게이트 뒤 스텁이
 * 소비하는 것을 전제로 한다. 이미지 참조는 호출부가 관리하는
 * data URL이며, 이 모듈은 형식만 검증한다.
 */

export type StudioAiReferenceKind = "image" | "text";

export interface StudioAiReferenceAttachment {
  readonly id: string;
  readonly kind: StudioAiReferenceKind;
  readonly label: string;
  readonly ref: string;
}

export const STUDIO_AI_REFERENCE_ATTACHMENT_CAP = 6;

export type StudioAiReferenceAttachmentResult =
  | { readonly ok: true; readonly attachments: readonly StudioAiReferenceAttachment[] }
  | {
      readonly ok: false;
      readonly reason: "cap_reached" | "empty_label" | "empty_ref" | "invalid_image_ref";
    };

function nextAttachmentId(
  attachments: readonly StudioAiReferenceAttachment[],
): string {
  return `ref-${attachments.length + 1}`;
}

export function addReferenceAttachment(
  attachments: readonly StudioAiReferenceAttachment[],
  input: {
    readonly kind: StudioAiReferenceKind;
    readonly label: string;
    readonly ref: string;
  },
): StudioAiReferenceAttachmentResult {
  const label = input.label.trim();
  if (!label) return { ok: false, reason: "empty_label" };
  const ref = input.ref.trim();
  if (!ref) return { ok: false, reason: "empty_ref" };
  if (input.kind === "image" && !ref.startsWith("data:image/")) {
    return { ok: false, reason: "invalid_image_ref" };
  }
  if (attachments.length >= STUDIO_AI_REFERENCE_ATTACHMENT_CAP) {
    return { ok: false, reason: "cap_reached" };
  }
  return {
    ok: true,
    attachments: Object.freeze([
      ...attachments,
      { id: nextAttachmentId(attachments), kind: input.kind, label, ref },
    ]),
  };
}

export function removeReferenceAttachment(
  attachments: readonly StudioAiReferenceAttachment[],
  attachmentId: string,
): readonly StudioAiReferenceAttachment[] {
  return Object.freeze(
    attachments.filter((attachment) => attachment.id !== attachmentId),
  );
}
