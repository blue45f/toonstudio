import { useMemo, useState, type RefObject } from "react";
import { useT } from "@/shared/lib/i18n";
import { planLegacyPigmentStrokeCopies } from "./studio-legacy-pigment-stroke-migration";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { downloadBlob } from "../export/studio-export";
import type { El } from "../studio-element-model";
import type { LayerGroup } from "../studio-layers";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { PageState } from "../studio-page-state";
import "./studio-legacy-pigment-stroke-status-i18n";
import { hasVisibleLegacyMixboxStrokes } from "../brush-lab/brush-studio-v6-legacy-pigment";
import type { StudioCuttoonEditorViewSession } from "../studio-cuttoon-editor/StudioCuttoonEditorViewSession";

type MigrationSession = Pick<StudioCuttoonEditorViewSession, "elements" | "groups" | "currentPageId" | "pagesHi" | "currentPageIdRef" | "pagesHiRef" | "canvasInteractionBlocked" | "collaborationDocumentLocked" | "collaborationDocumentUnavailable" | "activeSurfaceReviewLocked" | "masterEditMode" | "activePage" | "master" | "setMasterEditMode" | "captureStudioMutationTicket" | "canApplyStudioMutation" | "commit">;

export default function StudioLegacyPigmentStrokeMigrationHost({ session: s }: { readonly session: MigrationSession }) {
  const masterOnly = !hasVisibleLegacyMixboxStrokes(s.elements, s.groups) && !s.masterEditMode && !s.activePage.hideMaster && hasVisibleLegacyMixboxStrokes(s.master.elements, []);
  return <StudioLegacyPigmentStrokeMigration key={`${s.currentPageId}:${s.masterEditMode}`} elements={masterOnly ? s.master.elements : s.elements} groups={masterOnly ? [] : s.groups} animTimeline={s.masterEditMode || masterOnly ? undefined : s.activePage.animTimeline} pageId={s.currentPageId} historyIndex={s.pagesHi} currentPageIdRef={s.currentPageIdRef} pagesHiRef={s.pagesHiRef}
    masterEditMode={s.masterEditMode} masterConfirmationRequired={masterOnly} onReviewMaster={() => s.setMasterEditMode(true)}
    blocked={s.canvasInteractionBlocked || s.collaborationDocumentLocked || s.collaborationDocumentUnavailable || s.activeSurfaceReviewLocked}
    captureTicket={s.captureStudioMutationTicket} canApply={s.canApplyStudioMutation} commit={s.commit} />;
}

export interface StudioLegacyPigmentStrokeMigrationProps {
  readonly elements: readonly El[];
  readonly groups: readonly LayerGroup[];
  readonly pageId: string;
  readonly historyIndex: number;
  readonly currentPageIdRef: RefObject<string>;
  readonly pagesHiRef: RefObject<number>;
  readonly blocked: boolean;
  readonly masterEditMode?: boolean;
  readonly animTimeline?: PageState["animTimeline"];
  readonly masterConfirmationRequired?: boolean;
  readonly onReviewMaster?: () => void;
  readonly captureTicket: () => StudioEditorMutationTicket;
  readonly canApply: (ticket: StudioEditorMutationTicket) => boolean;
  readonly commit: (elements: El[], extraPatch: Pick<PageState, "groups" | "animTimeline">, pageId: string) => boolean;
}

/** 재생 엔진 교체는 원본을 수정하는 대신 명시 확인한 새 획 사본으로 저장한다. */
export function StudioLegacyPigmentStrokeMigration(props: StudioLegacyPigmentStrokeMigrationProps) {
  const t = useT();
  const [notice, setNotice] = useState("");
  const { captureTicket, elements, groups, animTimeline, pageId, historyIndex } = props;
  // 표시한 원본 스냅샷의 세대를 묶는다. 클릭 전에 원격 revision이 바뀌면 같은 history index여도 거부한다.
  const snapshot = useMemo(() => ({ ticket: captureTicket(), elements, groups, animTimeline, pageId, historyIndex }), [elements, groups, animTimeline, pageId, historyIndex, captureTicket]);
  const current = () => {
    const now = captureTicket();
    return snapshot.pageId === props.currentPageIdRef.current && snapshot.historyIndex === props.pagesHiRef.current
      && now.authScopeKey === snapshot.ticket.authScopeKey && now.workId === snapshot.ticket.workId
      && now.accessGeneration === snapshot.ticket.accessGeneration && now.documentGeneration === snapshot.ticket.documentGeneration;
  };
  const download = () => {
    if (!current()) { setNotice(t("studio.legacyPigment.stale", "그림이 변경됐습니다. 현재 페이지에서 다시 확인해 주세요.")); return; }
    try {
      const blob = new Blob([JSON.stringify({ format: "toonstudio-legacy-pigment-source", version: 1,
        pageId: snapshot.pageId, elements: snapshot.elements, groups: snapshot.groups, animTimeline: snapshot.animTimeline }, null, 2)], { type: "application/json" });
      downloadBlob(blob, "toonstudio-original-pigment-strokes.json");
    } catch (error) { setNotice(error instanceof Error ? error.message : t("studio.legacyPigment.failed", "자체 혼색 사본을 만들지 못했습니다. 원본은 유지됩니다.")); }
  };
  const migrate = () => {
    if (props.blocked || !current()) { setNotice(t("studio.legacyPigment.stale", "그림이 변경됐습니다. 현재 페이지에서 다시 확인해 주세요.")); return; }
    try {
      if (!props.canApply(snapshot.ticket)) throw new Error(t("studio.legacyPigment.denied", "현재 편집 권한으로 전환할 수 없습니다. 원본은 유지됩니다."));
      const plan = planLegacyPigmentStrokeCopies(snapshot.elements, snapshot.groups, () => crypto.randomUUID(), { archiveInGroup: !props.masterEditMode });
      if (!plan.sourceIds.length || !current() || !props.canApply(snapshot.ticket)) throw new Error(t("studio.legacyPigment.stale", "그림이 변경됐습니다. 현재 페이지에서 다시 확인해 주세요."));
      if (!props.commit(plan.elements, { groups: plan.groups, ...(snapshot.animTimeline ? { animTimeline: snapshot.animTimeline } : {}) }, snapshot.pageId)) throw new Error(t("studio.legacyPigment.denied", "현재 편집 권한으로 전환할 수 없습니다. 원본은 유지됩니다."));
    } catch (error) { setNotice(error instanceof Error ? error.message : t("studio.legacyPigment.failed", "자체 혼색 사본을 만들지 못했습니다. 원본은 유지됩니다.")); }
  };
  return <section aria-label={t("studio.legacyPigment.title", "이전 혼색 획 확인")} className="border-b border-line bg-card px-4 py-3 text-fg">
    <h2 className="text-sm font-bold">{t("studio.legacyPigment.title", "이전 혼색 획 확인")}</h2>
    <p className="mt-1 text-xs leading-5 text-fg-2">{t("studio.legacyPigment.explanation", "이 원고에는 예전 Mixbox로 그린 획이 있습니다. 색이 조용히 바뀌지 않도록 해당 획의 재생·내보내기를 멈췄습니다. 자체 혼색 사본은 색이 달라질 수 있습니다. 전환하면 이전 획은 숨긴 원본으로 남습니다.")}</p>
    <p className="mt-1 text-xs leading-5 text-fg-2">{props.masterEditMode || props.masterConfirmationRequired
      ? t("studio.legacyPigment.master", "마스터에 있는 획은 마스터 편집에서 확인하세요. 마스터 변경은 실행 취소 기록에 포함되지 않으며, 숨긴 원본 획은 레이어에서 보관합니다.")
      : t("studio.legacyPigment.undo", "전환한 획의 레이어 위치·클리핑·애니메이션은 유지합니다. 이전 데이터는 별도 숨김 그룹에 보관하며, 한 번의 실행 취소로 전환 전체를 되돌릴 수 있습니다.")}</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" onClick={download} className={`min-h-11 rounded-lg border border-line px-3 text-xs font-semibold ${STUDIO_FOCUS_RING}`}>{t("studio.legacyPigment.download", "원본 파일 내려받기")}</button>
      {props.masterConfirmationRequired
        ? <button type="button" onClick={props.onReviewMaster} className={`min-h-11 rounded-lg border border-line px-3 text-xs font-semibold ${STUDIO_FOCUS_RING}`}>{t("studio.legacyPigment.reviewMaster", "마스터 편집에서 확인")}</button>
        : <button type="button" onClick={migrate} disabled={props.blocked} className={`min-h-11 rounded-lg border border-line px-3 text-xs font-semibold disabled:opacity-50 ${STUDIO_FOCUS_RING}`}>{t("studio.legacyPigment.copy", "원본 보존·자체 혼색 사본 만들기")}</button>}
    </div>
    {notice ? <p role="alert" className="mt-2 text-xs text-fg-2">{notice}</p> : null}
  </section>;
}
