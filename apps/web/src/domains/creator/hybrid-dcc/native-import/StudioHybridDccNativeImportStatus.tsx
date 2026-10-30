import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { groupStudioNativeImportIssues } from "./studio-hybrid-dcc-native-import-copy";

import type { StudioHybridDccNativeImportModel } from "./useStudioHybridDccNativeImport";

/** 등록 결과와 지원하지 않은 데이터를 숫자 성공 로그 밖에서도 읽을 수 있게 한다. */
export function StudioHybridDccNativeImportStatus({ model }: { readonly model: StudioHybridDccNativeImportModel }) {
  const bt = useBilingual("StudioHybridDccNativeImport");
  const report = model.phase === "idle" && !model.error && !model.issues.length && !model.notice ? model.report : null;
  const issues = model.issues.length ? model.issues : report?.issues ?? [];
  const issueGroups = groupStudioNativeImportIssues(bt, issues);
  if (model.phase === "idle" && !model.error && !issues.length && !model.notice && !report) return null;
  return <section aria-label={bt("모델 가져오기 상태", "Model import status")} className="basis-full space-y-2 rounded-lg border border-line bg-panel p-3 text-xs text-fg-2" data-studio-native-import-status="true">
    {model.phase !== "idle" ? <div className="flex flex-wrap items-center gap-2"><span role="status">{model.phase === "reading" ? bt("모델 파일 읽는 중", "Reading model file") : bt("모델 검증·등록 대기 중", "Validating and registering model")}</span><button type="button" className="min-h-11 rounded-lg border border-line bg-card px-3 text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" onClick={model.cancel}>{bt("모델 가져오기 취소", "Cancel model import")}</button></div> : null}
    {report ? <div role="status"><p className="break-all font-semibold text-fg">{report.sourceName}</p><p className="mt-1">{report.committed ? formatI18nTemplate(bt("편집 가능한 메시 {count}개를 등록했습니다. 작업파일에 저장하고 되돌릴 수 있습니다.", "Registered {count} editable meshes. Save them in a workfile or undo this import."), { count: report.assets.length }) : bt("분석 정보만 읽었으며 편집 메시를 등록하지 않았습니다.", "Only analysis metadata was read; no editable mesh was registered.")}</p></div> : null}
    {model.notice ? <p role="status">{model.notice}</p> : null}
    {model.error ? <p role="alert" className="text-bad">{model.error}</p> : null}
    {issueGroups.length ? <div {...(issues.some(({ severity }) => severity === "error") ? { role: "alert" } : {})}><h4 className="font-semibold text-fg">{bt("보존·지원 범위 안내", "Preservation and support notes")}</h4><ul className="mt-1 list-disc space-y-1 pl-4 leading-relaxed">{issueGroups.map((group) => <li key={JSON.stringify([group.severity, group.text])} data-issue-severity={group.severity}>{group.text}{group.count > 1 ? formatI18nTemplate(bt(" ({count}건)", " ({count} occurrences)"), { count: group.count }) : null}</li>)}</ul></div> : null}
  </section>;
}
