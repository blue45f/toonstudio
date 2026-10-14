import { useMemo, useState, type ReactElement } from "react";

import { StudioPoseSuggestionPanel } from "./scene-3d/StudioPoseSuggestionPanel";
import {
  buildCutPoseContext,
  cutPoseName,
  readCutPoseId,
  type CutPoseCarrier,
  type CutPoseChange,
} from "./studio-cut-pose";

import type { PoseCatalogEntry } from "./scene-3d/studio-pose-suggestion";

/**
 * 컷 단위 포즈 추천 진입 패널 — 콘티·컷 편집 표면에서 선택한 컷 하나를 대상으로
 * 포즈 추천 패널을 여는 래퍼.
 *
 * - 추천 맥락은 컷이 이미 가진 정보(메모·이름·투샷 태그)에서 도출해 미리 채운다
 *   (`buildCutPoseContext`). 작가는 확인·수정만 하면 된다.
 * - 적용은 `onCutPoseChange(pageId, presetId)` 한 번으로 그 컷에 바로 반영된다.
 *   호스트는 `studio-cut-pose` 의 applyCutPoseRecommendation/withCutPose 로
 *   페이지 상태를 불변 갱신한다.
 * - 방금 적용한 변경은 before 값을 기억해 "되돌리기"로 그 컷만 원복할 수 있다.
 *   적용 뒤 컷 포즈가 다른 값으로 바뀌면 되돌리기 버튼은 사라진다(덮어쓰기 방지 —
 *   undoCutPoseChange 와 같은 규칙).
 */
export interface StudioCutPoseRecommendationPanelProps {
  /** 대상 컷(페이지). id·메모·이름·샷 태그·현재 포즈만 읽는다. */
  readonly page: CutPoseCarrier;
  /** "3. 카페 고백" 같은 컷 표시 라벨. */
  readonly pageLabel: string;
  readonly catalog: readonly PoseCatalogEntry[];
  /** 적용/되돌리기 공통 콜백. presetId 가 null 이면 포즈 제거(적용 전 상태로 원복 포함). */
  readonly onCutPoseChange: (pageId: string, presetId: string | null) => void;
  readonly locale?: "ko" | "en";
}

const COPY = Object.freeze({
  ko: Object.freeze({
    title: "컷 포즈 추천",
    currentPose: "지금 이 컷의 포즈",
    noPose: "아직 정한 포즈가 없어요",
    undo: "되돌리기",
    appliedNote: "추천을 적용했어요. 마음에 들지 않으면 되돌릴 수 있어요.",
  }),
  en: Object.freeze({
    title: "Pose for this cut",
    currentPose: "Current pose for this cut",
    noPose: "No pose chosen yet",
    undo: "Undo",
    appliedNote: "Pose applied. Undo if it does not fit.",
  }),
});

export function StudioCutPoseRecommendationPanel(
  props: StudioCutPoseRecommendationPanelProps,
): ReactElement {
  const copy = COPY[props.locale ?? "ko"];
  const [lastChange, setLastChange] = useState<CutPoseChange | null>(null);

  const context = useMemo(() => buildCutPoseContext(props.page), [props.page]);
  const currentPoseId = readCutPoseId(props.page) ?? null;
  const currentPoseName = cutPoseName(props.page, props.catalog);
  // 되돌리기는 "방금 이 패널에서 적용한 값"이 컷에 그대로 남아 있을 때만 유효하다.
  const canUndo =
    lastChange !== null &&
    lastChange.pageId === props.page.id &&
    lastChange.after === currentPoseId;

  return (
    <section
      aria-label={`${copy.title} — ${props.pageLabel}`}
      data-testid="cut-pose-recommendation-panel"
      className="rounded-xl border border-line bg-card/60 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-bold text-fg">
          {copy.title} · {props.pageLabel}
        </h3>
        <span className="text-[11px] text-fg-3" role="status">
          {copy.currentPose}: {currentPoseName ?? copy.noPose}
        </span>
        {canUndo ? (
          <button
            type="button"
            data-testid="cut-pose-undo"
            onClick={() => {
              props.onCutPoseChange(props.page.id, lastChange.before);
              setLastChange(null);
            }}
            className="ml-auto inline-flex min-h-9 items-center rounded-lg border border-line bg-panel px-2.5 text-[11px] font-semibold text-fg-2 hover:border-accent/50 hover:text-fg"
          >
            {copy.undo}
          </button>
        ) : null}
      </div>

      {canUndo ? (
        <p className="mt-1 text-[11px] text-fg-3">{copy.appliedNote}</p>
      ) : null}

      <StudioPoseSuggestionPanel
        catalog={props.catalog}
        figures={context.figures}
        initialSceneDescription={context.sceneDescription}
        locale={props.locale}
        onApplyPose={(presetId) => {
          if (presetId === currentPoseId) return;
          setLastChange(
            Object.freeze({ pageId: props.page.id, before: currentPoseId, after: presetId }),
          );
          props.onCutPoseChange(props.page.id, presetId);
        }}
      />
    </section>
  );
}
