import { ChevronDown, ChevronLeft, ChevronRight, FileDown, FileSearch, Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useT } from "@/shared/lib/i18n";
import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";

import { parseStudioBg3dSkpSceneSource } from "./studio-bg3d-skp-scene-source";
import type { StudioBg3dSkpSceneSource, StudioBg3dSkpSceneSourceReason } from "./studio-bg3d-skp-scene-source";
import type { StudioBg3dReadSkpSceneSource, StudioBg3dSkpSourceSelection } from "./studio-bg3d-skp-source-read-command";

export interface StudioBg3dSkpSourceInfoPanelProps {
  readonly disabled?: boolean;
  readonly selection?: StudioBg3dSkpSourceSelection;
  readonly onReadSource?: StudioBg3dReadSkpSceneSource;
}

type ReadState = { readonly status: "idle" | "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly source: StudioBg3dSkpSceneSource };
type DownloadState = "idle" | "loading" | "requested" | "error";
const BUTTON = "inline-flex min-h-11 min-w-11 max-w-full items-center justify-center gap-1.5 whitespace-normal rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 disabled:opacity-50";
const PAGE_SIZE = 20;
const UNAVAILABLE_REASONS: Readonly<Record<StudioBg3dSkpSceneSourceReason, string>> = {
  "metadata-pass-size-limit": "원본 크기가 장면 정보 재파싱 한도를 넘어 형상만 가져왔습니다.",
  "parser-unavailable": "가져오기에 사용한 변환기가 원본 장면 정보 읽기를 제공하지 않았습니다.",
  "metadata-parse-failed": "형상은 가져왔지만 원본 장면 정보를 다시 읽지 못했습니다.",
  "manifest-invalid-source": "파서의 원본 장면 정보가 검증 형식과 맞지 않아 보관하지 않았습니다.",
  "manifest-budget-exceeded": "원본 장면 정보가 보관 한도를 넘어 부분 정보 대신 상태와 이유를 기록했습니다.",
};

function SourceList<T>({ label, items, name, itemKey, renderItem, initiallyOpen = false }: {
  readonly label: string;
  readonly items: readonly T[];
  readonly name: (item: T) => string;
  readonly itemKey: (item: T) => string;
  readonly renderItem: (item: T) => ReactNode;
  readonly initiallyOpen?: boolean;
}) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(initiallyOpen);
  const [query, setQuery] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const needle = query.trim().toLocaleLowerCase();
  const filtered = needle ? items.filter((item) => name(item).toLocaleLowerCase().includes(needle)) : items;
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const page = Math.min(pageIndex, lastPage);
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  return (
    <section aria-labelledby={`${id}-heading`} className="min-w-0 overflow-hidden rounded-lg border border-line">
      <h4 id={`${id}-heading`}>
        <button type="button" aria-expanded={open} aria-controls={`${id}-list`} onClick={() => setOpen((previous) => !previous)}
          className={`${BUTTON} w-full justify-between border-0 text-left`}>
          <span className="min-w-0 break-words">{t("studio.bg3d.skpSource.listTitle", { label, count: items.length }, "{label} 목록 · {count}개")}</span>
          <ChevronDown className={`size-4 shrink-0 ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </h4>
      <div id={`${id}-list`} hidden={!open} className="space-y-2 border-t border-line p-2.5">{open ? <>
        <label htmlFor={`${id}-search`} className="block space-y-1 text-fg-2">
          <span>{t("studio.bg3d.skpSource.search", { label }, "{label} 이름 검색")}</span>
          <input id={`${id}-search`} type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPageIndex(0); }}
            className="min-h-11 w-full min-w-0 rounded-lg border border-line bg-panel px-3 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" />
        </label>
        {visible.length ? <ul className="space-y-2">{visible.map((item) => <li key={itemKey(item)} className="min-w-0 space-y-1 rounded-lg bg-panel p-2.5 break-words [overflow-wrap:anywhere]">{renderItem(item)}</li>)}</ul>
          : <p className="text-fg-2">{items.length === 0 ? t("studio.bg3d.skpSource.emptyList", "파서가 읽은 기록이 없습니다.") : t("studio.bg3d.skpSource.noMatches", "검색한 이름과 일치하는 기록이 없습니다.")}</p>}
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <button type="button" disabled={page === 0} aria-label={t("studio.bg3d.skpSource.previousPage", { label }, "{label} 이전 페이지")} onClick={() => setPageIndex(page - 1)} className={BUTTON}>
            <ChevronLeft className="size-4" aria-hidden /><span>{t("studio.bg3d.skpSource.previous", "이전")}</span>
          </button>
          <p role="status" className="min-w-0 text-center text-fg-2">{t("studio.bg3d.skpSource.visibleRange", { from: filtered.length ? page * PAGE_SIZE + 1 : 0, to: Math.min((page + 1) * PAGE_SIZE, filtered.length), count: filtered.length }, "{from}~{to} / {count}개")}</p>
          <button type="button" disabled={page === lastPage} aria-label={t("studio.bg3d.skpSource.nextPage", { label }, "{label} 다음 페이지")} onClick={() => setPageIndex(page + 1)} className={BUTTON}>
            <span>{t("studio.bg3d.skpSource.next", "다음")}</span><ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </> : null}</div>
    </section>
  );
}

function SourceContent({ source }: { readonly source: StudioBg3dSkpSceneSource }) {
  const t = useT();
  if (source.status === "legacy") return <p data-testid="bg3d-skp-source-legacy" role="status" className="rounded-lg border border-line bg-panel p-3 text-fg-2">{t("studio.bg3d.skpSource.legacy", "이 자산에는 원본 장면 정보가 기록되어 있지 않습니다. 기존 가져오기 자산은 원본 카메라·태그 정보를 확인할 수 없습니다.")}</p>;
  if (source.status === "unavailable") return <div data-testid="bg3d-skp-source-unavailable" className="space-y-1 rounded-lg border border-line bg-panel p-3 text-fg-2">
    <p role="status" className="font-semibold text-fg">{t("studio.bg3d.skpSource.unavailable", "원본 장면 정보를 보관하지 못한 자산입니다.")}</p>
    <p>{t(`studio.bg3d.skpSource.unavailableReason.${source.reason}`, UNAVAILABLE_REASONS[source.reason])}</p>
  </div>;
  const manifest = source.manifest;
  return <div data-testid="bg3d-skp-source-available" className="space-y-3">
    <p role="status" className="text-fg-2">{t("studio.bg3d.skpSource.available", "파서가 읽은 원본 정보를 확인했습니다. 원본 파일 전체의 개수와 생략된 정보는 확인되지 않았습니다.")}</p>
    <dl aria-label={t("studio.bg3d.skpSource.counts", "파서가 읽은 기록 수")} className="grid grid-cols-2 gap-2">
      {[
        { label: t("studio.bg3d.skpSource.cameraCount", "카메라"), value: manifest.pages.stored },
        { label: t("studio.bg3d.skpSource.tagCount", "태그"), value: manifest.tags.stored },
        { label: t("studio.bg3d.skpSource.definitionCount", "정의 (루트 포함)"), value: manifest.definitions.stored },
        { label: t("studio.bg3d.skpSource.instanceCount", "배치 기록 (정의별)"), value: manifest.instances.stored },
      ].map(({ label, value }) => <div key={label} className="min-w-0 rounded-lg border border-line bg-panel p-2.5"><dt className="text-fg-2">{label}</dt><dd className="mt-1 text-base font-bold text-fg">{value}</dd></div>)}
    </dl>
    <p className="text-fg-2">{t("studio.bg3d.skpSource.cameraLimit", "FOV는 파서가 읽은 원본 값입니다. 가로·세로 기준과 화면 비율이 확인되지 않아 현재 장면 카메라에 적용하지 않습니다.")}</p>
    <SourceList label={t("studio.bg3d.skpSource.cameraLabel", "카메라")} items={manifest.pages.items} name={(page) => page.name} itemKey={(page) => page.key} initiallyOpen
      renderItem={(page) => <>
        <p className="font-semibold text-fg">{page.name || t("studio.bg3d.skpSource.unnamedCamera", "이름 없는 카메라")}</p>
        <p className="text-fg-2">{page.parallel ? t("studio.bg3d.skpSource.parallel", "평행 투영") : t("studio.bg3d.skpSource.perspective", "원근 투영")}</p>
        <p className="text-fg-2">{t("studio.bg3d.skpSource.originalFov", { value: page.fov }, "원본 FOV {value}° · 기준 미확인")}</p>
        {page.parallel ? <p className="text-fg-2">{t("studio.bg3d.skpSource.originalOrthoHeight", { value: page.orthoHeight }, "원본 평행 높이 {value} in")}</p> : null}
      </>} />
    <SourceList label={t("studio.bg3d.skpSource.tagLabel", "태그")} items={manifest.tags.items} name={(tag) => tag.name} itemKey={(tag) => tag.key}
      renderItem={(tag) => <><p className="font-semibold text-fg">{tag.name || t("studio.bg3d.skpSource.unnamedTag", "이름 없는 태그")}</p><p className="text-fg-2">{tag.hidden ? t("studio.bg3d.skpSource.tagHidden", "파서 상태: 숨김") : t("studio.bg3d.skpSource.tagVisible", "파서 상태: 표시")}</p></>} />
    <p className="text-fg-2">{t("studio.bg3d.skpSource.parserDefaults", "카메라·태그의 생략된 원본 필드는 파서 기본값일 수 있습니다. 원본 좌표는 인치·Z-up으로 보관됩니다.")}</p>
  </div>;
}

/** key 경계에서 선택별 조회 수명을 분리한다. 이전 선택의 비동기 결과와 검색 상태를 새 선택에 노출하지 않는다. */
export function StudioBg3dSkpSourceInfoPanel(props: StudioBg3dSkpSourceInfoPanelProps) {
  const scopeKey = props.selection?.scopeKey;
  return <SkpSourceInfoScope key={scopeKey == null ? "none" : `selected:${scopeKey}`} {...props} />;
}

function SkpSourceInfoScope({ disabled = false, selection, onReadSource }: StudioBg3dSkpSourceInfoPanelProps) {
  const t = useT();
  const id = useId();
  const mounted = useRef(false);
  const requestSequence = useRef(0);
  const busy = useRef(false);
  const [readState, setReadState] = useState<ReadState>({ status: "idle" });
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestSequence.current += 1; };
  }, []);
  const blockedReason = disabled ? t("studio.bg3d.skpSource.disabled", "현재 원본 정보를 읽을 수 없습니다. 장면 작업이 끝난 뒤 다시 시도하세요.")
    : !selection?.scopeKey ? t("studio.bg3d.skpSource.noSelection", "원본 정보를 확인할 3D 모델 하나를 선택하세요.")
    : !onReadSource ? t("studio.bg3d.skpSource.noReader", "원본 정보 조회가 연결된 3D 배경 편집기를 열어 주세요.") : null;
  const selectionNotice = selection?.blockedReason ? translateCurrentStaticSourceText("domains.creator.bg3d.skpSource.hostReason", "ko", selection.blockedReason) : null;
  const notice = blockedReason ?? (readState.status === "idle" || readState.status === "loading" ? selectionNotice : null);
  const loading = readState.status === "loading";
  const source = !blockedReason && readState.status === "ready" ? readState.source : null;
  const readSource = async () => {
    if (blockedReason || busy.current || !onReadSource) return;
    busy.current = true;
    const request = ++requestSequence.current;
    setReadState({ status: "loading" });
    setDownloadState("idle");
    try {
      const result = await onReadSource();
      if (!mounted.current || request !== requestSequence.current) return;
      if (!result.ok) {
        setReadState({ status: "error", message: translateCurrentStaticSourceText("domains.creator.bg3d.skpSource.readFailure", "ko", result.messageKo) });
        return;
      }
      const parsed = parseStudioBg3dSkpSceneSource(result.value);
      setReadState(parsed.ok ? { status: "ready", source: parsed.value }
        : { status: "error", message: t("studio.bg3d.skpSource.invalidResult", "원본 정보 형식을 확인하지 못했습니다. 다시 읽어 주세요.") });
    } catch {
      if (mounted.current && request === requestSequence.current) setReadState({ status: "error", message: t("studio.bg3d.skpSource.readError", "원본 정보를 읽지 못했습니다. 모델 상태를 확인한 뒤 다시 시도하세요.") });
    } finally {
      if (mounted.current && request === requestSequence.current) busy.current = false;
    }
  };
  const downloadSource = async () => {
    if (!source || downloadState === "loading") return;
    const request = requestSequence.current;
    setDownloadState("loading");
    try {
      const { downloadBlob } = await import("../export/studio-export");
      if (!mounted.current || request !== requestSequence.current) return;
      downloadBlob(new Blob([JSON.stringify(source, null, 2)], { type: "application/json" }), "skp-source-information.json");
      setDownloadState("requested");
    } catch {
      if (mounted.current && request === requestSequence.current) setDownloadState("error");
    }
  };
  return <section data-testid="bg3d-skp-source-info-panel" aria-labelledby={`${id}-title`} className="min-w-0 space-y-3 rounded-xl border border-line bg-card p-3 text-xs text-fg [overflow-wrap:anywhere]">
    <h3 id={`${id}-title`} className="flex items-center gap-1.5 text-sm font-bold"><FileSearch className="size-4 shrink-0 text-accent" aria-hidden />{t("studio.bg3d.skpSource.title", "SKP 원본 정보")}</h3>
    <p className="text-fg-2">{t("studio.bg3d.skpSource.description", "선택한 모델에 보관된 원본 장면 정보를 조회합니다. 현재 장면에 적용하는 기능은 연결 중입니다.")}</p>
    {selection?.scopeKey ? <p data-testid="bg3d-skp-source-model" className="font-semibold">{t("studio.bg3d.skpSource.selectedModel", { name: selection.modelName }, "선택 모델: {name}")}</p> : null}
    {notice ? <p id={`${id}-blocked`} role="status" className="text-fg-2">{notice}</p> : null}
    <button type="button" data-testid="bg3d-skp-source-read" disabled={Boolean(blockedReason || loading)} aria-describedby={notice ? `${id}-blocked` : undefined}
      onClick={() => { void readSource(); }} className={BUTTON}>
      {loading ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <FileSearch className="size-4" aria-hidden />}
      {loading ? t("studio.bg3d.skpSource.reading", "원본 정보 읽는 중") : readState.status === "error" ? t("studio.bg3d.skpSource.retry", "원본 정보 다시 읽기") : source ? t("studio.bg3d.skpSource.refresh", "원본 정보 새로 읽기") : t("studio.bg3d.skpSource.read", "SKP 원본 정보 읽기")}
    </button>
    {!blockedReason && loading ? <p role="status" aria-live="polite" className="text-fg-2">{t("studio.bg3d.skpSource.loading", "선택 모델의 원본 정보를 읽고 있습니다.")}</p> : null}
    {!blockedReason && readState.status === "error" ? <p role="alert" className="text-danger">{readState.message}</p> : null}
    {source ? <div className="space-y-3">
      <SourceContent source={source} />
      <button type="button" onClick={() => { void downloadSource(); }} disabled={downloadState === "loading"} className={BUTTON}><FileDown className="size-4" aria-hidden />{t("studio.bg3d.skpSource.download", "검증된 원본 정보 JSON 내려받기")}</button>
      {downloadState === "requested" ? <p role="status" className="text-fg-2">{t("studio.bg3d.skpSource.downloadRequested", "원본 정보 JSON 다운로드를 요청했습니다.")}</p> : null}
      {downloadState === "error" ? <p role="alert" className="text-danger">{t("studio.bg3d.skpSource.downloadError", "JSON 다운로드를 시작하지 못했습니다. 내려받기 버튼으로 다시 시도하세요.")}</p> : null}
    </div> : null}
  </section>;
}
