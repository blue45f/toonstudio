/**
 * StudioWebtoonTensionMapTab — 웹툰 창작 보조 센터의 "텐션 맵" 탭 본문.
 *
 * 에피소드 컷 목록(콘티 대본에서 만든 계획, 또는 현재 원고의 실제 컷·여백)에서 컷별 긴장도(0~1)를
 * 곡선으로 보여 주고 늘어짐·급함·절정 후보 구간을 표시한다. 선택한 컷에는 감정·샷 크기·카메라
 * 앵글로 고른 추천 포즈 3개를 이유와 함께 붙이되, 적용은 사용자가 버튼을 누를 때만 한다.
 *
 * 이 탭은 지연 로드 청크다(`StudioWebtoonTensionMapEntry` 가 첫 활성화 때 불러온다). 차트·계산·
 * 포즈 추천 코드는 탭을 열기 전에는 내려받지 않고, 포즈 프리셋 묶음은 곡선이 그려져 추천 패널이
 * 처음 보일 때에야 요청한다. 계산식과 임계값이 휴리스틱임을 제목 옆 배지·소개 문단·"계산 방법과
 * 한계"에 모두 밝힌다.
 */

import { Activity, AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";

import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
  StudioEmptyState,
  StudioSurfaceState,
} from "../studio-panel-ui";

import {
  commitCutPoseChange,
  resolveCutPoseTarget,
  type StudioWebtoonAssistantCutPoseHost,
} from "./studio-webtoon-assistant-cut-pose";
import { useCutPoseCatalog } from "./use-cut-pose-catalog";
import { useTensionMapDraft, type TensionMapDraft } from "./use-tension-map-draft";
import { WebtoonCutPoseSuggestionPanel } from "./WebtoonCutPoseSuggestionPanel";
import { TENSION_MAP_CONFIG, type TensionCut } from "./webtoon-tension-map";
import {
  TENSION_MAP_SAMPLE_SCRIPT,
  TENSION_MAP_SCRIPT_MAX_CHARS,
  buildTensionMapView,
  type TensionMapEmptyReason,
  type TensionMapSourceKind,
  type TensionMapView,
} from "./webtoon-tension-map-source";
import { summarizeTensionMap } from "./webtoon-tension-text";
import { WebtoonTensionCurve } from "./WebtoonTensionCurve";
import {
  TensionCutDetail,
  TensionMethodNotes,
  TensionSegmentList,
  TensionTable,
} from "./WebtoonTensionReadout";

import type { ReactNode } from "react";

import type { PageState } from "../studio-page-state";
import type { StudioWebtoonAssistantPanel } from "./studio-webtoon-assistant-document";
import type { CutPoseCandidate } from "./webtoon-cut-pose-suggestion";

const bi = (ko: string, en: string): string =>
  translateBilingualValueForActiveLocale("StudioWebtoonTensionMapTab", ko, en);

const CARD_CLASS = "rounded-xl border border-line bg-card/60 p-3";
const CHIP_CLASS = cn(
  "inline-flex items-center justify-center rounded-lg border px-2.5 text-[0.65rem] font-bold",
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
);

export interface StudioWebtoonTensionMapTabProps {
  /** 현재 원고(활성 페이지)의 실제 컷(프레임). 없으면 빈 배열. */
  readonly panels: readonly StudioWebtoonAssistantPanel[];
  /** 포즈를 적용할 문서 접근. 셋이 모두 있어야 `적용` 버튼이 나타난다. */
  readonly pages?: readonly PageState[];
  readonly currentPageId?: string;
  readonly onCommitPages?: (nextPages: PageState[]) => boolean;
  /**
   * 작가가 넣은 출처·대본. 보조 센터가 들고 있으면(`useTensionMapDraft`) 센터를 닫았다 열어도 남는다.
   * 생략하면 이 탭이 스스로 들고 있다 — 탭을 닫으면 사라진다.
   */
  readonly draft?: TensionMapDraft;
  /** 시험·대체 카탈로그용. 생략하면 공유 지연 로더를 쓴다. */
  readonly loadPoseCatalog?: () => Promise<readonly CutPoseCandidate[]>;
}

function SourceToggle(props: {
  readonly kind: TensionMapSourceKind;
  readonly onSelect: (kind: TensionMapSourceKind) => void;
}) {
  const options: readonly { readonly id: TensionMapSourceKind; readonly label: string }[] = [
    { id: "script", label: bi("콘티 대본", "Storyboard script") },
    { id: "document", label: bi("현재 원고", "Current manuscript") },
  ];
  return (
    <div role="group" aria-label={bi("컷 목록 출처", "Cut list source")} className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={props.kind === option.id}
          onClick={() => props.onSelect(option.id)}
          className={cn(
            CHIP_CLASS,
            props.kind === option.id
              ? "border-accent/50 bg-accent text-on-accent shadow-sm"
              : "border-line bg-card text-fg-3 hover:text-fg",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function emptyCopy(reason: TensionMapEmptyReason): { title: string; description: string } {
  if (reason === "no-script") {
    return {
      title: bi("대본을 입력하면 곡선이 그려져요", "Enter a script to draw the curve"),
      description: bi(
        "한 줄이 한 컷이 돼요. 장면을 줄바꿈으로 나눠 적으면 컷마다 감정·샷 크기를 읽어 긴장도를 계산해요.",
        "Each line becomes one cut. Separate scenes with line breaks and each cut's emotion and shot size are read to estimate its tension.",
      ),
    };
  }
  if (reason === "no-panels") {
    return {
      title: bi("현재 원고에서 컷(프레임)을 찾지 못했어요", "No panels (frames) found in the current manuscript"),
      description: bi(
        "프레임 도구로 컷을 그리면 실제 높이와 여백으로 체류 시간을 계산해요. 먼저 '콘티 대본'으로 곡선을 그려 볼 수도 있어요.",
        "Draw panels with the frame tool and their real heights and gaps are used for dwell time. You can also try the curve from a 'Storyboard script' first.",
      ),
    };
  }
  return {
    title: bi("계산할 근거가 있는 컷이 없어요", "No cut has anything to score"),
    description: bi(
      "컷마다 감정·샷 크기·높이 중 하나는 있어야 긴장도를 계산할 수 있어요.",
      "A cut needs at least one of emotion, shot size or height to be scored.",
    ),
  };
}

export function StudioWebtoonTensionMapTab({
  panels,
  pages,
  currentPageId,
  onCommitPages,
  draft,
  loadPoseCatalog,
}: StudioWebtoonTensionMapTabProps) {
  useBilingualI18nRevision();
  const ownDraft = useTensionMapDraft();
  const { kind: chosenKind, script, onKindChange, onScriptChange } = draft ?? ownDraft;
  // 고르지 않았으면 원고에 컷이 있을 때만 원고로 연다. 고른 뒤에는 작가의 선택을 따른다.
  const kind: TensionMapSourceKind = chosenKind ?? (panels.length > 0 ? "document" : "script");
  const [selected, setSelected] = useState<number | null>(null);
  const summaryId = useId();
  const scriptId = useId();

  const view = useMemo(() => buildTensionMapView({ kind, script, panels }), [kind, script, panels]);

  const target = useMemo(
    () => (pages === undefined || currentPageId === undefined ? null : resolveCutPoseTarget(pages, currentPageId)),
    [pages, currentPageId],
  );
  const host = useMemo<StudioWebtoonAssistantCutPoseHost | null>(
    () =>
      pages === undefined || currentPageId === undefined || onCommitPages === undefined
        ? null
        : { pages, currentPageId, commitPages: onCommitPages },
    [pages, currentPageId, onCommitPages],
  );
  const applyPose = useCallback(
    (pageId: string, presetId: string | null): boolean =>
      host === null ? false : commitCutPoseChange(host, pageId, presetId),
    [host],
  );

  function selectKind(next: TensionMapSourceKind) {
    onKindChange(next);
    setSelected(null);
  }

  const sampleButton =
    script.trim() === "" ? (
      <button
        type="button"
        onClick={() => onScriptChange(TENSION_MAP_SAMPLE_SCRIPT)}
        className={cn(CHIP_CLASS, "border-line bg-raised text-fg hover:bg-card")}
      >
        {bi("예시 대본 넣기", "Insert a sample script")}
      </button>
    ) : null;

  return (
    <div data-testid="studio-tension-map-tab" className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-1.5 text-[0.8rem] font-bold text-fg">
            <Activity className="size-4 text-accent" aria-hidden />
            {bi("텐션 맵 — 감정·사건 곡선", "Tension map — emotion & event curve")}
          </h3>
          <span className="inline-flex shrink-0 items-center gap-1 rounded border border-warn/35 bg-warn/10 px-1.5 py-0.5 text-[0.58rem] font-bold text-warn">
            <AlertTriangle size={11} aria-hidden />
            {bi("휴리스틱 추정", "Heuristic estimate")}
          </span>
        </div>
        <p className="text-[0.65rem] text-fg-3">
          {bi(
            "컷마다 감정·샷 크기·체류 시간으로 긴장도(0~1)를 계산해 곡선으로 보여 줘요. 계산식과 임계값은 이 저장소가 정한 휴리스틱이며 공식 가이드나 독자 실험으로 검증한 값이 아니에요. 작품의 호흡을 훑어보는 참고용으로만 쓰세요.",
            "Each cut's tension (0–1) is estimated from its emotion, shot size and dwell time and drawn as a curve. The formula and thresholds are this repository's own heuristics, not values verified by an official guide or reader testing. Use them only as a rough look at your episode's rhythm.",
          )}
        </p>
        <SourceToggle kind={kind} onSelect={selectKind} />
      </header>

      {kind === "script" ? (
        <div className={cn(CARD_CLASS, "flex flex-col gap-2")}>
          <label htmlFor={scriptId} className="text-[0.75rem] font-bold text-fg">
            {bi("콘티 대본 (한 줄이 한 컷)", "Storyboard script (one line = one cut)")}
          </label>
          <textarea
            id={scriptId}
            rows={5}
            maxLength={TENSION_MAP_SCRIPT_MAX_CHARS}
            value={script}
            onChange={(event) => onScriptChange(event.target.value)}
            aria-describedby={`${scriptId}-hint`}
            placeholder={bi("장면을 줄바꿈으로 나눠 적어 주세요.", "Separate scenes with line breaks.")}
            className={cn(
              "w-full resize-y rounded-md border border-line bg-card p-2 font-mono text-xs text-fg",
              STUDIO_FOCUS_RING,
            )}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id={`${scriptId}-hint`} className="min-w-0 flex-1 text-[0.62rem] text-fg-3">
              {bi(
                "대본은 이 기기 안에서만 분석하고 어디에도 보내지 않아요.",
                "The script is analysed on this device only and never sent anywhere.",
              )}
            </p>
            {sampleButton}
          </div>
          <p className="text-[0.62rem] text-fg-3">
            {formatI18nTemplate(
              bi(
                "대본에는 실제 높이·간격이 없어 컷 높이 비율 × {height}px, 컷 사이 여백 {gutter}px로 가정해 체류 시간을 계산해요(휴리스틱).",
                "A script has no real heights or gaps, so dwell time assumes panel height ratio × {height}px and a {gutter}px gap between cuts (heuristic).",
              ),
              {
                height: TENSION_MAP_CONFIG.plan.referencePanelHeightPx,
                gutter: TENSION_MAP_CONFIG.plan.assumedGutterPx,
              },
            )}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {panels.length > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded border border-good/35 bg-good/10 px-1.5 py-0.5 text-[0.58rem] font-bold text-good">
              <CheckCircle2 size={11} aria-hidden />
              {formatI18nTemplate(bi("실제 원고 컷 {n}개 분석", "Analysing {n} real manuscript panels"), {
                n: panels.length,
              })}
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 rounded border border-warn/35 bg-warn/10 px-1.5 py-0.5 text-[0.58rem] font-bold text-warn">
              <AlertTriangle size={11} aria-hidden />
              {bi("현재 원고에서 컷을 찾지 못함", "No panels found in the current manuscript")}
            </span>
          )}
          <span className="min-w-0 flex-1 text-[0.62rem] text-fg-3">
            {bi(
              "원고의 컷에는 감정·샷 정보가 없어 체류 시간(실제 높이와 여백)만으로 계산하고, 절정 후보는 표시하지 않아요.",
              "Manuscript panels carry no emotion or shot data, so only dwell time (real heights and gaps) is used and no climax candidates are shown.",
            )}
          </span>
        </div>
      )}

      <TensionMapBody
        view={view}
        selected={selected}
        onSelect={setSelected}
        summaryId={summaryId}
        loadPoseCatalog={loadPoseCatalog}
        target={target}
        onApplyPose={host === null ? undefined : applyPose}
        sampleButton={sampleButton}
        onUseScript={() => selectKind("script")}
      />
    </div>
  );
}

/**
 * 추천 패널과 그 카탈로그 요청을 한 덩어리로 묶는다. 곡선이 그려져 이 구역이 처음 보일 때에야
 * 포즈 프리셋 묶음(`studio-pose-presets`)을 내려받는다 — 대본이 비었거나 원고에 컷이 없어
 * 빈 상태일 때, 탭을 열었다는 이유만으로 무거운 데이터를 요청하지 않는다.
 */
function PoseSuggestionSection(props: {
  readonly loadPoseCatalog: StudioWebtoonTensionMapTabProps["loadPoseCatalog"];
  readonly resetKey: string;
  readonly cut: TensionCut;
  readonly cutLabel: string;
  readonly target: ReturnType<typeof resolveCutPoseTarget>;
  readonly onApplyPose: ((pageId: string, presetId: string | null) => boolean) | undefined;
}) {
  const catalog = useCutPoseCatalog(props.loadPoseCatalog);
  return (
    <WebtoonCutPoseSuggestionPanel
      resetKey={props.resetKey}
      initial={{
        emotion: props.cut.emotion,
        shotScale: props.cut.shotScale,
        cameraAngle: props.cut.cameraAngle,
      }}
      cutLabel={props.cutLabel}
      catalog={catalog.state}
      onRetryCatalog={catalog.retry}
      target={props.target}
      onApplyPose={props.onApplyPose}
    />
  );
}

function TensionMapBody(props: {
  readonly view: TensionMapView;
  readonly selected: number | null;
  readonly onSelect: (index: number) => void;
  readonly summaryId: string;
  readonly loadPoseCatalog: StudioWebtoonTensionMapTabProps["loadPoseCatalog"];
  readonly target: ReturnType<typeof resolveCutPoseTarget>;
  readonly onApplyPose: ((pageId: string, presetId: string | null) => boolean) | undefined;
  readonly sampleButton: ReactNode;
  readonly onUseScript: () => void;
}) {
  const { view } = props;

  if (view.status === "error") {
    return (
      <StudioSurfaceState
        state="error"
        title={bi("곡선을 계산하지 못했어요", "Could not compute the curve")}
        description={bi(
          "대본이나 원고를 고치면 다시 계산해요. 계속되면 대본을 줄이거나 비워 보세요.",
          "It recalculates when you edit the script or manuscript. If it keeps failing, shorten or clear the script.",
        )}
      />
    );
  }

  if (view.status === "empty") {
    const copy = emptyCopy(view.reason);
    return (
      <StudioEmptyState
        icon={<FileText size={20} aria-hidden />}
        title={copy.title}
        description={copy.description}
        action={
          view.reason === "no-panels" ? (
            <button
              type="button"
              onClick={props.onUseScript}
              className={cn(CHIP_CLASS, "border-line bg-raised text-fg hover:bg-card")}
            >
              {bi("콘티 대본으로 전환", "Switch to the storyboard script")}
            </button>
          ) : (
            props.sampleButton
          )
        }
      />
    );
  }

  const { cuts, segments, peakIndex, truncated, excluded } = view.result;
  const selectedIndex =
    props.selected !== null && props.selected >= 0 && props.selected < cuts.length
      ? props.selected
      : (peakIndex ?? 0);
  const cut = cuts[selectedIndex];
  const cutLabel = formatI18nTemplate(bi("컷 {n}", "Cut {n}"), { n: cut.index + 1 });

  return (
    <>
      {truncated ? (
        <p role="status" className="rounded-lg border border-warn/35 bg-warn/10 p-2 text-[0.65rem] text-warn">
          {formatI18nTemplate(
            bi(
              "컷이 {max}개를 넘어 앞의 {max}컷만 분석했어요.",
              "There are more than {max} cuts, so only the first {max} were analysed.",
            ),
            { max: TENSION_MAP_CONFIG.limits.maxCuts },
          )}
        </p>
      ) : null}
      {excluded.length > 0 ? (
        <p role="status" className="rounded-lg border border-line bg-card/60 p-2 text-[0.65rem] text-fg-3">
          {formatI18nTemplate(
            bi(
              "계산할 근거가 없어 곡선에서 뺀 컷이 {n}개 있어요.",
              "{n} cuts without any usable basis were left out of the curve.",
            ),
            { n: excluded.length },
          )}
        </p>
      ) : null}

      <p id={props.summaryId} data-testid="tension-summary" className="text-[0.7rem] font-semibold text-fg-2">
        {summarizeTensionMap(view.result)}
      </p>

      <WebtoonTensionCurve
        cuts={cuts}
        segments={segments}
        selectedIndex={selectedIndex}
        onSelect={props.onSelect}
        describedBy={props.summaryId}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <TensionCutDetail cut={cut} cuts={cuts} segments={segments} />
          <TensionSegmentList cuts={cuts} segments={segments} onSelect={props.onSelect} />
        </div>
        <div className="min-w-0">
          <PoseSuggestionSection
            loadPoseCatalog={props.loadPoseCatalog}
            resetKey={`${view.kind}|${cut.id}`}
            cut={cut}
            cutLabel={cutLabel}
            target={props.target}
            onApplyPose={props.onApplyPose}
          />
        </div>
      </div>

      <TensionTable cuts={cuts} selectedIndex={selectedIndex} />
      <TensionMethodNotes />
    </>
  );
}
