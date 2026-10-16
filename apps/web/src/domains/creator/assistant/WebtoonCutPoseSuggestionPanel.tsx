/**
 * WebtoonCutPoseSuggestionPanel — 컷의 감정·샷 크기·카메라 앵글로 고른 추천 포즈 상위 3개.
 *
 * - 입력 세 가지는 선택한 컷의 값으로 미리 채워지고, 작가가 바꿔 볼 수 있다. 다른 컷을 고르면
 *   (`resetKey` 가 바뀌면) 고친 값을 버리고 새 컷의 값으로 다시 채운다. 감정을 모르는 컷(문서
 *   컷)은 감정을 직접 골라야 추천이 나온다 — 지어낸 값으로 추천하지 않는다.
 * - 추천은 절대 자동으로 적용되지 않는다. `'{페이지}'에 적용` 버튼을 누른 순간에만
 *   `onApplyPose` 가 불리고, 호스트가 편집기의 페이지 히스토리(`commitPages`)에 한 단계로 커밋한다.
 *   그래서 편집기의 실행 취소로도 되돌릴 수 있고, 이 패널의 `되돌리기` 도 같은 경로로 이전 값을
 *   다시 커밋한다. 컷을 옮겨도 패널은 다시 마운트되지 않아 되돌리기가 남는다. 다만 적용 뒤 작가가
 *   다른 포즈로 바꿨다면 되돌리기는 사라져 그 변경을 덮지 않는다
 *   (`StudioCutPoseRecommendationPanel` 과 같은 규칙).
 * - 카탈로그는 지연 로드라 loading / error(+다시 시도) / empty / ready 가 모두 있다.
 */

import { AlertTriangle, Check, PersonStanding, RotateCcw } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

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

import { CUT_POSE_SCORE_CONFIG, suggestCutPoses, type CutPoseSuggestion } from "./webtoon-cut-pose-suggestion";
import {
  CUT_CAMERA_ANGLE_LABELS,
  CUT_CAMERA_ANGLE_ORDER,
  CUT_EMOTION_LABELS,
  CUT_EMOTION_ORDER,
  CUT_SHOT_SCALE_LABELS,
  CUT_SHOT_SCALE_ORDER,
  isCutCameraAngle,
  isCutEmotion,
  isCutShotScale,
  type CutVocabularyLabel,
} from "./webtoon-cut-vocabulary";

import type { CutPoseChange } from "../studio-cut-pose";
import type {
  CharacterEmotionalTone,
  StoryboardCameraAngle,
  StoryboardShotScale,
} from "../ai/studio-ai-storyboard-director";
import type { CutPoseTarget } from "./studio-webtoon-assistant-cut-pose";
import type { CutPoseCatalogState } from "./use-cut-pose-catalog";

const bi = (ko: string, en: string): string =>
  translateBilingualValueForActiveLocale("WebtoonCutPoseSuggestionPanel", ko, en);

const t = (pair: CutVocabularyLabel): string => bi(pair.ko, pair.en);

const FIELD_CLASS = cn(
  "w-full rounded-md border border-line bg-card px-2 text-xs text-fg",
  STUDIO_TOUCH_TARGET,
  STUDIO_FOCUS_RING,
);
const BUTTON_CLASS = cn(
  "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 text-[0.68rem] font-bold",
  STUDIO_EASE,
  STUDIO_FOCUS_RING,
  STUDIO_TOUCH_TARGET,
);

export interface WebtoonCutPoseSuggestionInitial {
  readonly emotion: CharacterEmotionalTone | null;
  readonly shotScale: StoryboardShotScale | null;
  readonly cameraAngle: StoryboardCameraAngle | null;
}

export interface WebtoonCutPoseSuggestionPanelProps {
  /** 선택한 컷에서 미리 채울 값. 모르는 값은 null — 선택 상자가 비어 있다. */
  readonly initial: WebtoonCutPoseSuggestionInitial;
  /**
   * 어느 컷을 보고 있는지 알리는 값. 바뀌면 작가가 고친 입력을 버리고 `initial` 로 다시 채운다.
   * 패널을 다시 마운트하지 않으므로 방금 적용한 포즈의 `되돌리기`와 안내 문구는 컷을 옮겨도 남는다.
   * 생략하면 `initial` 의 세 값이 바뀔 때만 다시 채운다.
   */
  readonly resetKey?: string;
  /** "컷 3" 같은 컷 이름. */
  readonly cutLabel: string;
  readonly catalog: CutPoseCatalogState;
  readonly onRetryCatalog: () => void;
  /** 적용 대상(현재 페이지). 없으면 추천만 보여 준다. */
  readonly target: CutPoseTarget | null;
  /**
   * 적용과 되돌리기가 함께 쓰는 커밋. presetId 가 null 이면 포즈를 지운다.
   * 편집기 히스토리에 실제로 반영됐으면 true, 거절됐으면 false. 생략하면 적용 버튼이 없다.
   */
  readonly onApplyPose?: (pageId: string, presetId: string | null) => boolean;
}

type Notice =
  | { readonly kind: "applied"; readonly pose: string; readonly page: string }
  | { readonly kind: "undone"; readonly page: string }
  | { readonly kind: "failed" };

function SelectField<T extends string>(props: {
  readonly id: string;
  readonly label: string;
  readonly value: T | "";
  readonly onChange: (value: T | "") => void;
  readonly placeholder: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly parse: (raw: string) => T | "";
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={props.id} className="text-[0.68rem] font-semibold text-fg-2">
        {props.label}
      </label>
      <select
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(props.parse(event.target.value))}
        className={FIELD_CLASS}
      >
        <option value="">{props.placeholder}</option>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** 작가가 지금 컷에서 고친 입력만 담는다. 값이 없는 항목은 `initial` 을 따른다. */
interface PoseInputEdits {
  readonly key: string;
  readonly emotion?: CharacterEmotionalTone | "";
  readonly shotScale?: StoryboardShotScale | "";
  readonly cameraAngle?: StoryboardCameraAngle | "";
}

export function WebtoonCutPoseSuggestionPanel({
  initial,
  resetKey,
  cutLabel,
  catalog,
  onRetryCatalog,
  target,
  onApplyPose,
}: WebtoonCutPoseSuggestionPanelProps) {
  useBilingualI18nRevision();
  const inputKey = [resetKey ?? "", initial.emotion ?? "", initial.shotScale ?? "", initial.cameraAngle ?? ""].join("|");
  const [storedEdits, setStoredEdits] = useState<PoseInputEdits>({ key: inputKey });
  // 다른 컷으로 바뀌면 이전 컷에서 고친 값은 무시한다 — 상태를 맞추는 효과 없이 파생한다.
  const edits: PoseInputEdits = storedEdits.key === inputKey ? storedEdits : { key: inputKey };
  // "" 는 작가가 고른 "지정 안 함"이라 initial 로 되돌아가지 않는다(`??` 는 null·undefined 만 건너뛴다).
  const emotion = edits.emotion ?? initial.emotion ?? "";
  const shotScale = edits.shotScale ?? initial.shotScale ?? "";
  const cameraAngle = edits.cameraAngle ?? initial.cameraAngle ?? "";
  const [lastChange, setLastChange] = useState<CutPoseChange | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeRef = useRef<HTMLParagraphElement | null>(null);
  const fieldId = useId();

  const suggestions = useMemo<readonly CutPoseSuggestion[] | null>(() => {
    if (catalog.status !== "ready" || emotion === "") return null;
    return suggestCutPoses(
      { emotion, shotScale: shotScale === "" ? null : shotScale, cameraAngle: cameraAngle === "" ? null : cameraAngle },
      catalog.entries,
    );
  }, [catalog, emotion, shotScale, cameraAngle]);

  const poseName = (id: string | null): string | null => {
    if (id === null) return null;
    if (catalog.status !== "ready") return id;
    return catalog.entries.find((entry) => entry.id === id)?.label ?? id;
  };

  const canApply = target !== null && onApplyPose !== undefined;
  // 되돌리기는 "방금 여기서 적용한 값"이 그 페이지에 그대로 남아 있을 때만 유효하다.
  const canUndo =
    canApply &&
    lastChange !== null &&
    lastChange.pageId === target.pageId &&
    lastChange.after === target.currentPoseId;

  function apply(suggestion: CutPoseSuggestion) {
    if (!canApply || suggestion.presetId === target.currentPoseId) return;
    const before = target.currentPoseId;
    if (!onApplyPose(target.pageId, suggestion.presetId)) {
      setNotice({ kind: "failed" });
      return;
    }
    setLastChange(Object.freeze({ pageId: target.pageId, before, after: suggestion.presetId }));
    setNotice({ kind: "applied", pose: suggestion.label, page: target.pageLabel });
  }

  function undo() {
    if (!canUndo || lastChange === null) return;
    if (!onApplyPose(lastChange.pageId, lastChange.before)) {
      setNotice({ kind: "failed" });
      return;
    }
    setLastChange(null);
    setNotice({ kind: "undone", page: target.pageLabel });
    // 되돌리기 버튼이 사라지므로 포커스가 문서 맨 위로 튀지 않게 안내 문장에 둔다.
    queueMicrotask(() => noticeRef.current?.focus());
  }

  const weights = CUT_POSE_SCORE_CONFIG.weights;
  const noticeText =
    notice === null
      ? ""
      : notice.kind === "applied"
        ? formatI18nTemplate(
            bi(
              "'{page}'에 포즈를 적용했어요: {pose}. 마음에 들지 않으면 되돌릴 수 있어요.",
              "Applied a pose to '{page}': {pose}. You can undo it if it does not fit.",
            ),
            { pose: notice.pose, page: notice.page },
          )
        : notice.kind === "undone"
          ? formatI18nTemplate(
              bi("'{page}'의 포즈를 이전 상태로 되돌렸어요.", "Restored the previous pose of '{page}'."),
              { page: notice.page },
            )
          : bi(
              "포즈를 적용하지 못했어요. 문서가 잠겼거나 저장 중인지 확인한 뒤 다시 눌러 주세요.",
              "Could not apply the pose. Check whether the document is locked or saving, then try again.",
            );

  return (
    <section
      aria-label={bi("추천 포즈", "Suggested poses")}
      data-testid="cut-pose-suggestion-panel"
      className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[0.75rem] font-bold text-fg">
          <PersonStanding className="size-4 text-accent" aria-hidden />
          {formatI18nTemplate(bi("{cut}의 추천 포즈 (상위 3개)", "Suggested poses for {cut} (top 3)"), {
            cut: cutLabel,
          })}
        </h4>
        <span className="inline-flex shrink-0 items-center gap-1 rounded border border-warn/35 bg-warn/10 px-1.5 py-0.5 text-[0.58rem] font-bold text-warn">
          <AlertTriangle size={11} aria-hidden />
          {bi("휴리스틱 점수", "Heuristic score")}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <SelectField
          id={`${fieldId}-emotion`}
          label={bi("감정", "Emotion")}
          value={emotion}
          onChange={(value) => setStoredEdits({ ...edits, emotion: value })}
          placeholder={bi("감정을 골라 주세요", "Pick an emotion")}
          options={CUT_EMOTION_ORDER.map((value) => ({ value, label: t(CUT_EMOTION_LABELS[value]) }))}
          parse={(raw) => (isCutEmotion(raw) ? raw : "")}
        />
        <SelectField
          id={`${fieldId}-shot`}
          label={bi("샷 크기", "Shot size")}
          value={shotScale}
          onChange={(value) => setStoredEdits({ ...edits, shotScale: value })}
          placeholder={bi("지정 안 함", "Not set")}
          options={CUT_SHOT_SCALE_ORDER.map((value) => ({ value, label: t(CUT_SHOT_SCALE_LABELS[value]) }))}
          parse={(raw) => (isCutShotScale(raw) ? raw : "")}
        />
        <SelectField
          id={`${fieldId}-angle`}
          label={bi("카메라 앵글", "Camera angle")}
          value={cameraAngle}
          onChange={(value) => setStoredEdits({ ...edits, cameraAngle: value })}
          placeholder={bi("지정 안 함", "Not set")}
          options={CUT_CAMERA_ANGLE_ORDER.map((value) => ({ value, label: t(CUT_CAMERA_ANGLE_LABELS[value]) }))}
          parse={(raw) => (isCutCameraAngle(raw) ? raw : "")}
        />
      </div>

      {emotion === "" ? (
        <p data-testid="cut-pose-need-emotion" className="rounded-lg border border-line bg-card p-2 text-[0.68rem] text-fg-2">
          {bi(
            "이 컷에는 감정 정보가 없어요. 위에서 감정을 고르면 어울리는 포즈를 추천해 드려요.",
            "This cut has no emotion data. Pick an emotion above and matching poses will be suggested.",
          )}
        </p>
      ) : catalog.status === "loading" ? (
        <StudioSurfaceState
          state="loading"
          compact
          title={bi("포즈 목록을 불러오는 중…", "Loading the pose list…")}
        />
      ) : catalog.status === "error" ? (
        <StudioSurfaceState
          state="error"
          compact
          title={bi("포즈 목록을 불러오지 못했어요", "Could not load the pose list")}
          description={bi(
            "네트워크 상태를 확인한 뒤 다시 시도해 주세요. 긴장도 곡선은 그대로 볼 수 있어요.",
            "Check your connection and try again. The tension curve is still available.",
          )}
          action={
            <button
              type="button"
              onClick={onRetryCatalog}
              className={cn(BUTTON_CLASS, "border-line bg-raised text-fg hover:bg-card")}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              {bi("다시 시도", "Try again")}
            </button>
          }
        />
      ) : suggestions === null || suggestions.length === 0 ? (
        <StudioEmptyState
          title={bi("조건에 맞는 포즈가 없어요", "No pose matches these conditions")}
          description={bi(
            "감정이나 샷 크기를 바꿔 보세요.",
            "Try changing the emotion or the shot size.",
          )}
        />
      ) : (
        <ol className="flex list-none flex-col gap-2 p-0" data-testid="cut-pose-suggestion-list">
          {suggestions.map((suggestion) => {
            const isCurrent = target !== null && suggestion.presetId === target.currentPoseId;
            return (
              <li
                key={suggestion.presetId}
                data-testid={`cut-pose-suggestion-${suggestion.presetId}`}
                className="flex flex-col gap-1.5 rounded-lg border border-line bg-card p-2.5 text-[0.68rem]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-fg">
                      <span className="mr-1.5 font-mono text-fg-3">{suggestion.rank}</span>
                      {suggestion.label}
                    </p>
                    <p className="text-fg-3">{suggestion.tone}</p>
                  </div>
                  <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 font-mono text-[0.62rem] font-bold text-accent">
                    {formatI18nTemplate(bi("적합도 {score}", "Fit {score}"), { score: suggestion.score })}
                  </span>
                </div>
                <ul className="flex flex-col gap-0.5">
                  {suggestion.reasons.map((reason) => (
                    <li key={reason.code} className="flex items-start gap-1.5">
                      {reason.tone === "match" ? (
                        <Check className="mt-0.5 size-3 shrink-0 text-good" aria-hidden />
                      ) : (
                        <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warn" aria-hidden />
                      )}
                      <span className={reason.tone === "match" ? "text-fg-2" : "text-warn"}>
                        {reason.tone === "caution" ? (
                          <span className="sr-only">{bi("주의: ", "Caution: ")}</span>
                        ) : null}
                        {bi(reason.text.ko, reason.text.en)}
                      </span>
                    </li>
                  ))}
                </ul>
                {canApply ? (
                  <div>
                    <button
                      type="button"
                      aria-pressed={isCurrent}
                      aria-label={formatI18nTemplate(
                        isCurrent
                          ? bi("적용됨: {pose} ('{page}')", "Applied: {pose} ('{page}')")
                          : bi("'{page}'에 적용: {pose}", "Apply to '{page}': {pose}"),
                        { pose: suggestion.label, page: target.pageLabel },
                      )}
                      onClick={() => apply(suggestion)}
                      className={cn(
                        BUTTON_CLASS,
                        isCurrent
                          ? "border-accent/50 bg-accent-soft text-accent"
                          : "border-transparent bg-accent text-on-accent hover:opacity-90",
                      )}
                    >
                      {isCurrent ? <Check className="size-3.5" aria-hidden /> : null}
                      <span className="max-w-[14rem] truncate">
                        {isCurrent
                          ? bi("적용됨", "Applied")
                          : formatI18nTemplate(bi("'{page}'에 적용", "Apply to '{page}'"), {
                              page: target.pageLabel,
                            })}
                      </span>
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {suggestions !== null && suggestions.length > 0 ? (
        <p className="text-[0.62rem] text-fg-3">
          {formatI18nTemplate(
            bi(
              "점수는 휴리스틱이에요: 감정 {e}% · 샷 크기 {s}% · 앵글 {a}%. 감정이 맞지 않는 포즈는 후보에서 빠져요.",
              "The score is a heuristic: emotion {e}% · shot size {s}% · angle {a}%. Poses that do not fit the emotion are left out.",
            ),
            {
              e: Math.round(weights.emotion * 100),
              s: Math.round(weights.shot * 100),
              a: Math.round(weights.angle * 100),
            },
          )}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5 border-t border-line pt-2 text-[0.65rem] text-fg-3">
        {canApply ? (
          <p data-testid="cut-pose-target">
            {formatI18nTemplate(
              bi("적용 대상: '{page}'(지금 작업 중인 페이지) · 현재 포즈: {pose}", "Target: '{page}' (the page you are working on) · current pose: {pose}"),
              { page: target.pageLabel, pose: poseName(target.currentPoseId) ?? bi("없음", "none") },
            )}
          </p>
        ) : (
          <p data-testid="cut-pose-no-target">
            {bi(
              "이 화면에서는 컷에 포즈를 적용할 수 없어요. 포즈 이름을 참고해 3D 포저에서 직접 골라 주세요.",
              "Poses cannot be applied to a cut from here. Use the pose names as a guide and pick one in the 3D poser.",
            )}
          </p>
        )}
        <p>
          {bi(
            "추천은 자동으로 적용되지 않아요. 버튼을 눌렀을 때만 바뀌고, 편집기의 실행 취소로도 되돌릴 수 있어요.",
            "Suggestions are never applied automatically. Only your button press changes the page, and the editor's undo also reverts it.",
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <p
            ref={noticeRef}
            tabIndex={-1}
            role={notice?.kind === "failed" ? "alert" : "status"}
            aria-live={notice?.kind === "failed" ? "assertive" : "polite"}
            data-testid="cut-pose-notice"
            className={cn(
              "min-w-0 flex-1 outline-none",
              notice?.kind === "failed" ? "font-semibold text-bad" : "text-fg-2",
            )}
          >
            {noticeText}
          </p>
          {canUndo ? (
            <button
              type="button"
              onClick={undo}
              data-testid="cut-pose-undo"
              className={cn(BUTTON_CLASS, "border-line bg-raised text-fg hover:bg-card")}
            >
              <RotateCcw className="size-3.5" aria-hidden />
              {bi("되돌리기", "Undo")}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
