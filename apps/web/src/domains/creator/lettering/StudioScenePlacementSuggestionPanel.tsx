/**
 * 씬 배치 제안 패널 — 컷 안 캐릭터 위치·여백을 읽어 말풍선·효과음의
 * 배치 후보를 제안하고, 골라서 미리본 뒤 한 번에 적용/취소한다.
 *
 * 판정·채점은 순수 모듈(studio-scene-placement-suggestion)이 하고, 이
 * 패널은 선택 상태와 미리보기/적용/취소만 담당한다. 실제 요소 이동은
 * 호스트가 onApply로 받은 패치를 자기 커밋 경로에 얹는다(applyScene-
 * PlacementPatches 헬퍼 제공). 취소는 패치를 버리는 것이라 문서에
 * 아무 흔적도 남지 않는다.
 *
 * 상태: 후보가 없는 요청은 이유(경고)를 그대로 보여주고 적용 대상에서
 * 제외한다 — 없는 후보를 지어내지 않는다. 감정 매처와 지정 감정이
 * 어긋난 요청은 그 사실을 경고로 드러낸다.
 */

import { useMemo, useState } from "react";

import {
  buildScenePlacementPatch,
  suggestScenePlacements,
  type ScenePlacementPatch,
  type ScenePlacementReasonCode,
  type ScenePlacementRequest,
  type ScenePlacementScene,
} from "./studio-scene-placement-suggestion";

const REASON_LABELS: Record<ScenePlacementReasonCode, string> = {
  "near-speaker": "화자 가까이",
  "above-speaker": "화자 위쪽",
  "clear-of-figures": "캐릭터를 가리지 않음",
  "face-overlap": "얼굴과 겹침",
  "figure-overlap": "캐릭터와 겹침",
  "occupied-overlap": "다른 요소와 겹침",
  "obstacle-overlap": "배경 요소와 겹침",
  "wide-clearance": "주변 여유 넉넉",
  "emotion-room": "외침 형상에 맞는 여유",
  "emotion-cramped": "외침 형상엔 좁음",
  "near-action": "소리 나는 곳 가까이",
  "panel-edge": "패널 가장자리",
  "stable-position": "지금 자리와 가까움",
  "tail-clamped": "꼬리가 최대 길이에 닿음",
};

export interface StudioScenePlacementSuggestionPanelProps {
  readonly scene: ScenePlacementScene;
  readonly requests: readonly ScenePlacementRequest[];
  /** 선택한 패치 일괄 적용 (호스트 커밋 경로로 연결). */
  readonly onApply: (patches: readonly ScenePlacementPatch[]) => void;
  /** 취소 — 미리보기·선택을 버릴 때. 문서에는 아무것도 적용되지 않는다. */
  readonly onCancel?: () => void;
}

export function StudioScenePlacementSuggestionPanel(
  props: StudioScenePlacementSuggestionPanelProps,
) {
  const suggestions = useMemo(
    () => suggestScenePlacements(props.requests, props.scene),
    [props.requests, props.scene],
  );
  const [selections, setSelections] = useState<Readonly<Record<string, number>>>({});
  const [previewing, setPreviewing] = useState(false);

  const patches = useMemo(() => {
    const out: ScenePlacementPatch[] = [];
    for (const suggestion of suggestions) {
      const patch = buildScenePlacementPatch(
        suggestion,
        selections[suggestion.requestId] ?? 0,
      );
      if (patch) out.push(patch);
    }
    return out;
  }, [suggestions, selections]);

  const reset = () => {
    setSelections({});
    setPreviewing(false);
  };

  if (props.requests.length === 0) {
    return (
      <section aria-label="씬 배치 제안" className="flex flex-col gap-3">
        <p className="text-sm text-fg-3">
          배치할 말풍선이나 효과음을 먼저 선택해 주세요. 캐릭터 위치와 컷의
          여백을 읽어 어울리는 자리를 제안해 드려요.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="씬 배치 제안" className="flex flex-col gap-4">
      <p className="text-sm font-bold text-fg">
        컷 안 여백을 읽어 배치 후보를 골랐어요
      </p>
      {suggestions.map((suggestion) => {
        const selected = selections[suggestion.requestId] ?? 0;
        const request = props.requests.find((r) => r.id === suggestion.requestId);
        return (
          <div key={suggestion.requestId} className="flex flex-col gap-2">
            <p className="text-xs font-bold text-fg-3">
              {suggestion.kind === "balloon" ? "말풍선" : "효과음"} ·{" "}
              {request?.id}
              {suggestion.emotion ? (
                <>
                  {" "}
                  — 읽힌 감정: {suggestion.emotion.detectedEmotion} (추천 형상{" "}
                  {suggestion.emotion.recommendedBubbleShape})
                  {suggestion.emotion.needsHumanReview
                    ? " · 근거가 약해 확인이 필요해요"
                    : ""}
                </>
              ) : null}
            </p>
            {suggestion.warnings.map((warning) => (
              <p key={warning} className="text-xs text-fg-3" role="note">
                {warning}
              </p>
            ))}
            {suggestion.candidates.length === 0 ? (
              <p className="text-sm text-fg-3">
                이 컷에는 들어갈 자리가 없어 적용 대상에서 제외했어요.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {suggestion.candidates.map((candidate, index) => (
                  <button
                    key={`${candidate.x},${candidate.y}`}
                    type="button"
                    aria-pressed={index === selected}
                    onClick={() =>
                      setSelections((prev) => ({
                        ...prev,
                        [suggestion.requestId]: index,
                      }))
                    }
                    className={
                      index === selected
                        ? "rounded-2xl border border-accent bg-panel px-3 py-2 text-left text-xs text-fg"
                        : "rounded-2xl border border-line bg-panel px-3 py-2 text-left text-xs text-fg-2"
                    }
                  >
                    {index + 1}순위 · {candidate.score}점 · ({candidate.x},{" "}
                    {candidate.y})
                    {candidate.tail
                      ? ` · 꼬리 ${candidate.tail.tailDirection}`
                      : ""}
                    <br />
                    {candidate.reasons
                      .map((code) => REASON_LABELS[code])
                      .join(" · ")}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {previewing ? (
        <div aria-live="polite" className="flex flex-col gap-1">
          <p className="text-xs font-bold text-fg-3">미리보기 — 적용될 위치</p>
          {patches.map((patch) => (
            <p key={patch.id} className="text-xs text-fg-2">
              {patch.id}: ({patch.x}, {patch.y})
              {patch.tail
                ? ` · 꼬리 ${patch.tail.tailDirection}/${patch.tail.tailHeight}px`
                : ""}
            </p>
          ))}
          {patches.length === 0 ? (
            <p className="text-xs text-fg-3">적용할 후보가 없어요.</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={previewing}
          onClick={() => setPreviewing((v) => !v)}
          className="rounded-2xl border border-line bg-panel px-4 py-2 text-sm text-fg"
        >
          {previewing ? "미리보기 끄기" : "미리보기"}
        </button>
        <button
          type="button"
          disabled={patches.length === 0}
          onClick={() => {
            props.onApply(patches);
            reset();
          }}
          className="rounded-2xl border border-accent bg-panel px-4 py-2 text-sm font-bold text-fg disabled:opacity-50"
        >
          선택한 배치 한 번에 적용
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            props.onCancel?.();
          }}
          className="rounded-2xl border border-line bg-panel px-4 py-2 text-sm text-fg-2"
        >
          취소
        </button>
      </div>
    </section>
  );
}
