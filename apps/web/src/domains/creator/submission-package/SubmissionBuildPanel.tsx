import { Download, PackageCheck, RotateCcw, Square } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";

import { Button } from "@/shared/components/ui/button";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { formatStudioByteSize } from "../export/studio-episode-byte-budget";

import type { SubmissionPackageBuildError, SubmissionBuildErrorCode } from "./submission-package-build";
import type { SubmissionBuildViewState, SubmissionSaveState } from "./use-submission-package-build";

export interface SubmissionBuildPanelProps {
  readonly state: SubmissionBuildViewState;
  readonly saveState: SubmissionSaveState;
  readonly canBuild: boolean;
  readonly errorCount: number;
  /** 만든 뒤에 초안이 바뀌어 결과 ZIP 에 반영되지 않았는가. */
  readonly stale: boolean;
  readonly onBuild: () => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
  readonly onReset: () => void;
}

function errorMessage(code: SubmissionBuildErrorCode, error: SubmissionPackageBuildError, bt: (ko: string, en: string) => string): { title: string; hint: string } {
  switch (code) {
    case "invalid-draft":
      return {
        title: bt("점검에서 막는 문제가 남아 있어서 만들지 못했어요.", "The package was not built because blocking items remain."),
        hint: bt("위 ‘만들기 전 점검’의 막는 문제를 먼저 고쳐 주세요.", "Fix the blocking items in the pre-build check above first."),
      };
    case "limit":
      return {
        title: bt("앱이 정한 크기·개수 상한을 넘어 만들지 못했어요.", "The package exceeds the size or count cap set by the app."),
        hint: bt("회차나 이미지를 줄이거나 JPEG로 내보내 용량을 줄인 뒤 다시 시도해 주세요.", "Include fewer episodes or images, or export JPEG to shrink them, then try again."),
      };
    case "source-changed":
      return {
        title: bt("고른 파일을 읽는 도중 바뀌었거나 읽을 수 없게 됐어요.", "A chosen file changed or became unreadable while it was being read."),
        hint: bt(
          "파일을 옮기거나 지웠는지 확인하고, 해당 이미지를 다시 골라 추가한 뒤 다시 시도해 주세요.",
          "Check whether the file was moved or deleted, add that image again, then try again.",
        ),
      };
    default:
      return {
        title: bt("패키지를 만드는 중 문제가 생겼어요.", "Something went wrong while building the package."),
        hint: error.message,
      };
  }
}

export function SubmissionBuildPanel({ state, saveState, canBuild, errorCount, stale, onBuild, onCancel, onSave, onReset }: SubmissionBuildPanelProps) {
  const bt = useBilingual("SubmissionBuildPanel");
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const blockedId = `${baseId}-blocked`;
  const progressId = `${baseId}-progress`;
  // 단계가 바뀌면 방금 누른 단추가 사라지므로(만들기 → 취소 → 저장), 키보드 사용자가 길을 잃지 않게
  // 새 단계의 주된 단추로 초점을 옮긴다. 처음 그릴 때는 초점을 가져오지 않는다.
  // 레이아웃 이펙트에서 옮겨야 단계 전이와 같은 커밋 안에서 초점이 확정된다. 패시브 이펙트로 미루면
  // 전이 직후 짧은 구간에 초점이 본문에 남고, 부하가 큰 환경에서는 그 구간이 관측 가능해진다.
  const primaryRef = useRef<HTMLButtonElement>(null);
  const previousStatus = useRef(state.status);
  useLayoutEffect(() => {
    if (previousStatus.current === state.status) return;
    previousStatus.current = state.status;
    primaryRef.current?.focus();
  }, [state.status]);

  return (
    <section aria-labelledby={titleId} className="space-y-3 rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <h3 id={titleId} className="text-base font-black text-fg">
        {bt("패키지 만들기", "Build the package")}
      </h3>

      {state.status === "idle" || state.status === "cancelled" ? (
        <div className="space-y-2">
          {state.status === "cancelled" ? (
            <p role="status" className="rounded-xl border border-line bg-card px-3 py-2 text-sm text-fg">
              {bt("만들기를 취소했어요. 아무것도 저장되지 않았고 다시 만들 수 있어요.", "Building was cancelled. Nothing was saved and you can build again.")}
            </p>
          ) : null}
          <Button ref={primaryRef} type="button" onClick={onBuild} disabled={!canBuild} aria-describedby={canBuild ? undefined : blockedId}>
            <PackageCheck aria-hidden="true" className="size-4" />
            {state.status === "cancelled" ? bt("다시 만들기", "Build again") : bt("투고 패키지 만들기", "Build submission package")}
          </Button>
          {!canBuild ? (
            <p id={blockedId} className="text-xs leading-relaxed text-fg-2">
              {formatI18nTemplate(bt("막는 문제 {count}건을 먼저 고쳐 주세요. 위 ‘만들기 전 점검’에 이유와 방법이 있어요.", "Fix {count} blocking item(s) first. The pre-build check above says why and how."), { count: errorCount })}
            </p>
          ) : null}
          <p className="text-xs leading-relaxed text-fg-3">
            {bt(
              "ZIP 은 이 브라우저 안에서 만들고 서버로 보내지 않아요. 크기에 따라 시간이 걸릴 수 있고 도중에 취소할 수 있어요.",
              "The ZIP is built inside this browser and never sent to a server. Large packages take a while and you can cancel at any time.",
            )}
          </p>
        </div>
      ) : null}

      {state.status === "building" ? (
        <div className="space-y-2" aria-busy="true">
          {state.progress && state.progress.totalBytes > 0 ? (
            <progress id={progressId} className="h-2 w-full overflow-hidden rounded-full accent-accent" value={state.progress.processedBytes} max={state.progress.totalBytes} aria-label={bt("패키지 만들기 진행률", "Package build progress")} />
          ) : (
            <progress id={progressId} className="h-2 w-full overflow-hidden rounded-full accent-accent" aria-label={bt("패키지 만들기 진행률", "Package build progress")} />
          )}
          <p role="status" className="text-sm text-fg">
            {state.progress && state.progress.phase === "packing"
              ? formatI18nTemplate(bt("묶는 중 · 파일 {done} / {total} · {processed} / {all}", "Packing · file {done} of {total} · {processed} of {all}"), {
                  done: state.progress.completedFiles,
                  total: state.progress.totalFiles,
                  processed: formatStudioByteSize(state.progress.processedBytes),
                  all: formatStudioByteSize(state.progress.totalBytes),
                })
              : state.progress?.phase === "finishing"
                ? bt("마무리하는 중…", "Finishing…")
                : bt("점검하고 표지를 만드는 중…", "Checking and preparing the cover…")}
          </p>
          {state.progress?.path ? <p className="break-all text-xs text-fg-3">{state.progress.path}</p> : null}
          <Button ref={primaryRef} type="button" variant="outline" onClick={onCancel}>
            <Square aria-hidden="true" className="size-4" />
            {bt("취소", "Cancel")}
          </Button>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="space-y-2">
          {(() => {
            const message = errorMessage(state.error.code, state.error, bt);
            return (
              <div role="alert" className="rounded-xl border border-bad/50 bg-bad-soft px-3 py-2 text-sm text-fg">
                <p className="font-bold">{message.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-2">{message.hint}</p>
              </div>
            );
          })()}
          {state.error.retryable ? (
            <Button ref={primaryRef} type="button" onClick={onBuild} disabled={!canBuild}>
              <RotateCcw aria-hidden="true" className="size-4" />
              {bt("다시 시도", "Try again")}
            </Button>
          ) : (
            <Button ref={primaryRef} type="button" variant="outline" onClick={onReset}>
              {bt("확인", "OK")}
            </Button>
          )}
        </div>
      ) : null}

      {state.status === "done" ? (
        <div className="space-y-3">
          <div role="status" className="rounded-xl border border-good/50 bg-good-soft px-3 py-2 text-sm text-fg">
            <p className="font-bold">{bt("투고 패키지를 만들었어요.", "The submission package is ready.")}</p>
            <p className="mt-0.5 text-xs text-fg-2">
              {formatI18nTemplate(bt("{name} · 파일 {count}개 · {size}", "{name} · {count} file(s) · {size}"), {
                name: state.result.fileName,
                count: state.result.fileCount,
                size: formatStudioByteSize(state.result.bytes),
              })}
            </p>
          </div>
          {stale ? (
            <p role="status" className="rounded-xl border border-warn/50 bg-warning-soft px-3 py-2 text-xs leading-relaxed text-fg">
              {bt(
                "이 ZIP 을 만든 뒤에 내용을 고쳤어요. 고친 내용은 이 ZIP 에 들어 있지 않으니 ‘고쳐서 다시 만들기’를 눌러 새로 만들어 주세요.",
                "You changed things after this ZIP was built. The changes are not in it, so press “Edit and build again” to build a new one.",
              )}
            </p>
          ) : null}
          {state.result.warnings.map((warning) => (
            <p key={warning.code} role="status" className="rounded-xl border border-warn/50 bg-warning-soft px-3 py-2 text-xs leading-relaxed text-fg">
              {warning.code === "cover-pdf-failed"
                ? bt("이 브라우저에서 표지 PDF 를 그리지 못해 PDF 없이 만들었어요. 표지는 cover.md 에 들어 있어요.", "This browser could not draw the cover PDF, so the package was built without it. The cover is in cover.md.")
                : bt("CRC 계산 작업자를 쓸 수 없어 메인 스레드로 계산했어요. 결과는 같지만 평소보다 느릴 수 있어요.", "The CRC worker was unavailable, so the checksums were computed on the main thread. The result is the same but may be slower.")}
            </p>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button ref={primaryRef} type="button" onClick={onSave} disabled={saveState.status === "saving"}>
              <Download aria-hidden="true" className="size-4" />
              {saveState.status === "saving" ? bt("저장하는 중…", "Saving…") : bt("ZIP 저장", "Save ZIP")}
            </Button>
            <Button type="button" variant="outline" onClick={onReset}>
              {bt("고쳐서 다시 만들기", "Edit and build again")}
            </Button>
          </div>
          <p role="status" className="min-h-5 text-sm text-fg-2">
            {saveState.status === "saved"
              ? saveState.outcome === "file-handle"
                ? bt("선택한 위치에 저장했어요.", "Saved to the location you chose.")
                : bt("다운로드를 시작했어요. 브라우저의 다운로드 폴더를 확인해 주세요.", "The download has started. Check your browser's download folder.")
              : saveState.status === "cancelled"
                ? bt("저장을 취소했어요. 만든 패키지는 그대로 있어요.", "Saving was cancelled. The package is still here.")
                : ""}
          </p>
          {saveState.status === "error" ? (
            <p role="alert" className="text-sm text-bad">
              {bt("저장하지 못했어요. 다시 ‘ZIP 저장’을 눌러 주세요.", "Could not save. Press “Save ZIP” again.")}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
