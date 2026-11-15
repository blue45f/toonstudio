import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import type { RefObject } from "react";

import { classifyStudioProjectOpenFailure } from "./studio-project-open-failure";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioProjectOpenRecoveryActions", ko, en);

interface StudioProjectOpenRecoveryActionsProps {
  readonly errorMessage: string;
  readonly projectArchiveBusy: boolean;
  readonly projectArchiveStatus: { readonly tone: "good" | "warn" | "bad"; readonly text: string } | null;
  readonly projectArchiveImportInputRef: RefObject<HTMLInputElement | null>;
  readonly projectImportInputRef: RefObject<HTMLInputElement | null>;
}

/**
 * 프로젝트 파일·아카이브 열기가 실패했을 때 현재 원고가 보호되었음을 알리고
 * 즉시 호환 아카이브(.toonproject.zip)·JSON 재선택 또는 내 작업으로 복귀할 수 있는 열기 경로를 제공한다.
 */
export function StudioProjectOpenRecoveryActions({
  errorMessage,
  projectArchiveBusy,
  projectArchiveStatus,
  projectArchiveImportInputRef,
  projectImportInputRef,
}: StudioProjectOpenRecoveryActionsProps) {
  useBilingualI18nRevision();
  if (projectArchiveStatus?.tone !== "bad" || projectArchiveStatus.text !== errorMessage) {
    return null;
  }

  const failureKind = classifyStudioProjectOpenFailure(errorMessage);
  const guidance = failureKind === "incompatible-version"
    ? bi(
        "현재 열려 있는 원고와 저장본은 그대로 유지됩니다. 현재 빌드가 지원하는 버전의 아카이브(.toonproject.zip)나 JSON 파일을 선택해 주세요.",
        "Your open manuscript and saved projects remain untouched. Choose a compatible .toonproject.zip archive or JSON file.",
      )
    : failureKind === "missing-resource"
      ? bi(
          "현재 열려 있는 원고와 저장본은 그대로 유지됩니다. 연결 리소스(이미지·3D·스냅샷)가 모두 포함된 .toonproject.zip 아카이브로 다시 열어 주세요.",
          "Your open manuscript and saved projects remain untouched. Re-open using a self-contained .toonproject.zip archive that includes all linked resources.",
        )
      : bi(
          "현재 열려 있는 원고와 저장본은 그대로 유지됩니다. 정상 내보낸 호환 파일을 다시 선택하거나 내 작업에서 기존 원고를 여세요.",
          "Your open manuscript and saved projects remain untouched. Select a valid compatible file or open an existing project from My Works.",
        );

  return (
    <div
      data-studio-project-open-recovery={failureKind}
      className="mt-1.5 flex w-full flex-col gap-2 border-t border-bad/25 pt-1.5 text-fg"
    >
      <p className="text-[11px] font-medium leading-relaxed text-fg-2">
        {guidance}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={projectArchiveBusy}
          onClick={() => projectArchiveImportInputRef.current?.click()}
          className="inline-flex min-h-9 items-center rounded-md border border-accent/45 bg-card px-2.5 py-1 text-xs font-semibold text-accent transition hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {bi("아카이브(.toonproject.zip) 열기", "Open .toonproject.zip archive")}
        </button>
        <button
          type="button"
          disabled={projectArchiveBusy}
          onClick={() => projectImportInputRef.current?.click()}
          className="inline-flex min-h-9 items-center rounded-md border border-line bg-card px-2.5 py-1 text-xs font-semibold text-fg-2 transition hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {bi("호환 JSON 다시 선택", "Choose compatible JSON")}
        </button>
        <a
          href="/studio/import"
          className="inline-flex min-h-9 items-center rounded-md border border-line bg-card px-2.5 py-1 text-xs font-semibold text-fg-2 transition hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {bi("파일 가져오기 화면", "Go to file import")}
        </a>
        <a
          href="/studio"
          className="inline-flex min-h-9 items-center rounded-md border border-line bg-card px-2.5 py-1 text-xs font-semibold text-fg-2 transition hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {bi("내 작업 열기", "Open My Works")}
        </a>
      </div>
    </div>
  );
}
