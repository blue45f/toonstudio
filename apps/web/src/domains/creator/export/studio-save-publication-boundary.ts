import type { WriteStudioPublicationIntegrityInput } from "../studio-publication-integrity";
import { frozenStatus2Text } from "../status-i18n/studio-frozen2-status-i18n";

/** 담당 원고의 공동 초안 저장은 게시 감사·출처를 다시 쓰는 권한을 부여하지 않는다. */
export async function prepareStudioSavePublicationBase(input: WriteStudioPublicationIntegrityInput, boundary: {
  readonly status: "draft" | "published"; readonly shared: boolean; readonly mappedFullEdit: boolean;
}): Promise<Record<string, unknown>> {
  if (boundary.status === "draft" && boundary.shared && boundary.mappedFullEdit) {
    const document = input.document;
    if (document === null || typeof document !== "object" || Array.isArray(document)) throw new Error(frozenStatus2Text("studio.frozenStatus2.pub.sharedScopeCheckFailed", "공동 문서 저장 범위를 확인하지 못했어요."));
    return document as Record<string, unknown>;
  }
  const { writeStudioPublicationIntegrity } = await import("../studio-publication-integrity");
  return writeStudioPublicationIntegrity(input);
}
