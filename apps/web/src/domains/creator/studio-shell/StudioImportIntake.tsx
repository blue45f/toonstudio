import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { AlertTriangle, CheckCircle2, FileUp, FolderOpen, Plus, ShieldCheck } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import {
  planStudioImport,
  type StudioImportPlanItem,
} from "../studio-import-compatibility";
import { importStudioProjectPackage } from "../save-first/studio-project-package-import";
import { classifyStudioProjectOpenFailure } from "../studio-cuttoon-editor/studio-project-open-failure";
import {
  STUDIO_IMPORT_HANDOFF_ACCEPT,
  registerStudioImportHandoff,
  studioImportHandoffHref,
  studioImportHandoffTargetForFormat,
} from "../studio-import-handoff";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioImportIntake", ko, en);

export type StudioImportIntakeLocale = string;

type Selection = Readonly<{
  file: File;
  item: StudioImportPlanItem;
}>;

function statusClasses(status: StudioImportPlanItem["status"]): string {
  if (status === "accepted") return "border-success/35 bg-success/10 text-success";
  if (status === "review") return "border-warning/35 bg-warning/10 text-warning";
  return "border-danger/35 bg-danger/10 text-danger";
}

function statusLabel(status: StudioImportPlanItem["status"], _locale: string): string {
  if (status === "accepted") return bi("바로 가져올 수 있음", "Ready to import");
  if (status === "review") return bi("변환 내용 확인 필요", "Review conversion");
  return bi("가져오기 차단", "Import blocked");
}

function listLabel(values: readonly string[], fallback: string): string {
  return values.length > 0 ? values.join(" · ") : fallback;
}

/**
 * Runs a truthful compatibility preview, then hands the original browser File to the existing
 * editor import owner. Files never enter localStorage or URL state and the handoff is single-use.
 */
export function StudioImportIntake({ locale }: { readonly locale: StudioImportIntakeLocale }) {
  useBilingualI18nRevision();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [failedSelectionFile, setFailedSelectionFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const continuingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    setMessage("");
    setFailedSelectionFile(null);
    if (!file) return;
    try {
      const plan = planStudioImport([{
        name: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
      }]);
      setSelection(Object.freeze({ file, item: plan.items[0]! }));
    } catch (error) {
      setSelection(null);
      setMessage(error instanceof Error ? error.message : "Import preflight failed.");
    }
  };

  const continueImport = async () => {
    if (
      !selection
      || selection.item.status === "blocked"
      || failedSelectionFile === selection.file
      || importing
      || continuingRef.current
    ) {
      return;
    }
    continuingRef.current = true;
    try {
      if (selection.item.format === "toonstudio") {
        setImporting(true);
        setMessage("");
        try {
          const restored = await importStudioProjectPackage(selection.file, {
            storage: window.localStorage,
            target: window,
            authUserId: session?.user?.id ?? null,
          });
          navigate(restored.href, { replace: true });
        } catch (error) {
          setFailedSelectionFile(selection.file);
          setMessage(error instanceof Error
            ? error.message
            : bi("ToonStudio 프로젝트 파일을 복원하지 못했습니다.", "The ToonStudio project file could not be restored."));
          setImporting(false);
        }
        return;
      }
      if (!studioImportHandoffTargetForFormat(selection.item.format)) {
        setFailedSelectionFile(selection.file);
        setMessage(bi("이 형식은 아래 전용 작업공간에서 가져와야 합니다. 파일은 전송하거나 저장하지 않았습니다.", "This format must be imported in its dedicated workspace. The file was not uploaded or stored."));
        return;
      }
      try {
        const handoff = registerStudioImportHandoff(selection.file, selection.item.format);
        navigate(studioImportHandoffHref(handoff));
      } catch (error) {
        setFailedSelectionFile(selection.file);
        setMessage(error instanceof Error ? error.message : "Import handoff failed.");
      }
    } finally {
      continuingRef.current = false;
    }
  };

  const operational = selection
    ? selection.item.format === "toonstudio"
      || studioImportHandoffTargetForFormat(selection.item.format) !== null
    : false;
  const selectionRejected = Boolean(selection && failedSelectionFile === selection.file);
  const failureKind = message ? classifyStudioProjectOpenFailure(message) : null;
  const Icon = selection?.item.status === "accepted"
    ? CheckCircle2
    : selection?.item.status === "review"
      ? AlertTriangle
      : ShieldCheck;

  return (
    <section
      className="mt-8 rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-6"
      aria-labelledby="studio-import-intake-title"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            {bi("파일 가져오기", "Import files")}</p>
          <h2 id="studio-import-intake-title" className="mt-1 text-xl font-black text-fg">
            {bi("파일 내용을 확인하고 불러오세요", "Preview your file before importing")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-fg-3">
            {bi("파일을 고르면 유지되는 내용과 달라질 수 있는 내용을 먼저 볼 수 있어요. ToonStudio 작업 파일은 원고를 새 프로젝트로 불러옵니다.", "Choose a file to see what will be kept and what may change. ToonStudio project files restore the manuscript into a new project.")}
          </p>
        </div>
        <label className={buttonClass({ size: "lg", className: "shrink-0 cursor-pointer gap-2" })}>
          <FileUp size={17} aria-hidden="true" />
          {bi("파일 선택", "Choose file")}
          <input
            ref={fileInputRef}
            type="file"
            accept={STUDIO_IMPORT_HANDOFF_ACCEPT}
            disabled={importing}
            className="sr-only"
            onChange={selectFile}
          />
        </label>
      </div>

      <details className="mt-3 text-xs leading-5 text-fg-2">
        <summary className="min-h-12 cursor-pointer content-center font-semibold">{bi("지원 파일 형식", "Supported file formats")}</summary>
        <p>{bi("ToonStudio 프로젝트(.toonstudio), 아카이브(.toonproject.zip), JSON, PSD, ORA, CBZ, 브러시 팩과 이미지 파일을 확인할 수 있어요. 실제 보존 내용과 제한은 파일을 선택한 뒤 표시됩니다.", "You can preview ToonStudio projects (.toonstudio), archives (.toonproject.zip), JSON, PSD, ORA, CBZ, brush packs and image files. Preservation details and limitations appear after you select a file.")}</p>
      </details>

      {selection ? (
        <article className="mt-5 rounded-2xl border border-line bg-panel/55 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold",
                  selectionRejected
                    ? "border-danger/35 bg-danger/10 text-danger"
                    : statusClasses(selection.item.status),
                )}>
                  <Icon size={14} aria-hidden="true" />
                  {selectionRejected
                    ? bi("열기 차단됨", "Open blocked")
                    : statusLabel(selection.item.status, locale)}
                </span>
                <strong className="truncate text-sm text-fg">{selection.file.name}</strong>
                <span className="text-xs uppercase text-fg-3">{selection.item.format}</span>
              </div>
              <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="font-bold text-fg-2">{bi("보존", "Preserved")}</dt>
                  <dd className="mt-1 leading-5 text-fg-3">
                    {listLabel(selection.item.preservedFeatures, bi("보존 항목 없음", "No preserved features"))}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold text-fg-2">{bi("변환·손실", "Conversion and loss")}</dt>
                  <dd className="mt-1 leading-5 text-fg-3">
                    {listLabel(selection.item.losses, bi("알려진 손실 없음", "No known loss"))}
                  </dd>
                </div>
              </dl>
              {selection.item.warnings.length > 0 ? (
                <p className="mt-3 rounded-xl border border-warning/30 bg-warning-soft/10 px-3 py-2 text-xs leading-5 text-warning">
                  {selection.item.warnings.join(" · ")}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={selection.item.status === "blocked" || selectionRejected || !operational || importing}
              onClick={() => { void continueImport(); }}
              className={buttonClass({ className: "shrink-0 gap-2" })}
            >
              {importing
                ? bi("프로젝트 복원 중…", "Restoring project…")
                : selection.item.format === "toonstudio"
                  ? bi("프로젝트 복원", "Restore project")
                  : bi("편집기에서 가져오기", "Import in editor")}
              <FileUp size={15} aria-hidden="true" />
            </button>
          </div>
        </article>
      ) : null}

      {message ? (
        <div
          data-studio-import-failure-recovery={failureKind ?? "invalid-format"}
          className="mt-4 rounded-2xl border border-danger/35 bg-danger-soft/15 p-4 text-xs text-danger"
          role="alert"
        >
          <p className="font-semibold leading-5">{message}</p>
          <p className="mt-1.5 leading-5 text-fg-2">
            {failureKind === "incompatible-version"
              ? bi(
                  "기존에 저장된 내 작업과 원고는 변경되지 않았습니다. 현재 빌드가 지원하는 호환 버전 파일이나 .toonproject.zip 아카이브를 선택해 열어 주세요.",
                  "Your saved projects and manuscripts remain untouched. Choose a compatible file version or a .toonproject.zip archive.",
                )
              : failureKind === "missing-resource"
                ? bi(
                    "기존에 저장된 내 작업과 원고는 변경되지 않았습니다. 원고 스냅샷과 첨부 리소스가 모두 포함된 .toonproject.zip 아카이브 또는 정상 백업 파일을 선택해 주세요.",
                    "Your saved projects and manuscripts remain untouched. Select a .toonproject.zip archive or complete backup containing all snapshots and linked resources.",
                  )
                : bi(
                    "기존에 저장된 내 작업과 원고는 변경되지 않았습니다. 다른 호환 파일을 다시 선택하거나 내 작업에서 기존 원고를 열어 이어서 작업할 수 있습니다.",
                    "Your saved projects and manuscripts remain untouched. Choose another compatible file or open an existing project from My Works.",
                  )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
              className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}
            >
              <FileUp size={14} aria-hidden="true" />
              {bi("다른 호환 파일 선택", "Choose compatible file")}
            </button>
            <Link
              to="/studio"
              className={buttonClass({ variant: "ghost", size: "sm", className: "gap-1.5 border border-line bg-card" })}
            >
              <FolderOpen size={14} aria-hidden="true" />
              {bi("내 작업 열기", "Open My Works")}
            </Link>
            <Link
              to="/studio/new"
              className={buttonClass({ variant: "ghost", size: "sm", className: "gap-1.5 border border-line bg-card" })}
            >
              <Plus size={14} aria-hidden="true" />
              {bi("새 작품 시작", "Start new work")}
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
