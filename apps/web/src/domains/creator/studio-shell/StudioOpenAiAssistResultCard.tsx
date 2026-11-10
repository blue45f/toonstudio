import { Check, Copy, ListPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type {
  StudioOpenAiAssistSuccess,
  StudioOpenAiScriptToCutsData,
} from "../ai/studio-openai-creative-assist-client";
import type { StudioStoryBeat } from "../studio-storyboard-planner";

async function copyPlainText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function cutsToStoryBeats(
  cuts: StudioOpenAiScriptToCutsData["cuts"],
): StudioStoryBeat[] {
  return cuts.map((cut, idx) => ({
    id: `openai-cut:${idx + 1}`,
    sceneId: "scene:openai-draft",
    order: idx,
    kind: cut.beatKind,
    summary: `[${cut.shotType}] ${cut.visualAction} (${cut.scrollGapHint})`,
    dialogue: cut.dialogue,
    characterIds: cut.beatKind === "transition" ? [] : ["character:lead"],
    locationId: "location:opening",
  }));
}

export function StudioOpenAiAssistResultCard({
  response,
  onAppendStoryBeats,
}: {
  readonly response: StudioOpenAiAssistSuccess;
  readonly onAppendStoryBeats?: (beats: readonly StudioStoryBeat[]) => void;
}) {
  const bt = useBilingual("StudioOpenAiAssistResultCard");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [appendedResponse, setAppendedResponse] =
    useState<StudioOpenAiAssistSuccess | null>(null);
  const appended = appendedResponse === response;

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async (key: string, value: string) => {
    const ok = await copyPlainText(value);
    if (ok) {
      setCopiedKey(key);
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2_000);
    }
  };

  const { result, privacy, quota, model } = response;

  return (
    <div
      data-testid="openai-assist-result-card"
      className="mt-4 rounded-2xl border border-accent/35 bg-card p-4 shadow-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-bold text-accent">
            OpenAI · {model}
          </span>
          <span className="text-fg-3">
            {bt(
              `원본 미보관(store: false) · 남은 일일 요청 ${quota.remainingDaily}/${quota.dailyLimit}회`,
              `Not stored (store: false) · ${quota.remainingDaily}/${quota.dailyLimit} daily left`,
            )}
          </span>
        </div>
        {privacy.piiRedactedCount > 0 ? (
          <span className="rounded-full border border-warning/35 bg-warning-soft/20 px-2.5 py-0.5 font-semibold text-warning">
            {bt(
              `개인정보·민감 문자열 ${privacy.piiRedactedCount}건 자동 마스킹 후 전송됨`,
              `Auto-masked ${privacy.piiRedactedCount} sensitive item(s) before sending`,
            )}
          </span>
        ) : null}
      </div>

      {result.mode === "idea-remix" ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm font-semibold text-fg">{result.data.summary}</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {result.data.angles.map((angle) => {
              const key = `angle:${angle.lens}`;
              return (
                <article
                  key={key}
                  className="flex flex-col justify-between rounded-xl border border-line bg-panel/65 p-3"
                >
                  <div>
                    <span className="inline-block rounded bg-accent/15 px-2 py-0.5 text-[0.65rem] font-extrabold text-accent">
                      {angle.lensLabelKo}
                    </span>
                    <h4 className="mt-1.5 text-sm font-bold text-fg">{angle.headline}</h4>
                    <p className="mt-1 text-xs leading-5 text-fg-2">{angle.pitch}</p>
                    <p className="mt-2 rounded-lg bg-card px-2.5 py-1.5 text-[0.7rem] text-fg-3">
                      <strong className="text-fg-2">{bt("첫 컷 힌트:", "First panel:")}</strong>{" "}
                      {angle.firstCutHint}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void handleCopy(
                        key,
                        `[${angle.lensLabelKo}] ${angle.headline}\n${angle.pitch}\n첫 컷: ${angle.firstCutHint}`,
                      )
                    }
                    className={buttonClass({
                      variant: "outline",
                      size: "sm",
                      className: "mt-3 min-h-9 self-start gap-1.5",
                    })}
                  >
                    {copiedKey === key ? <Check size={13} /> : <Copy size={13} />}
                    {copiedKey === key ? bt("복사됨", "Copied") : bt("이 발상 복사", "Copy angle")}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {result.mode === "script-to-cuts" ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-xl bg-panel/70 p-3 text-xs leading-5 text-fg-2">
            <p>
              <strong className="text-fg">{bt("장면 목표:", "Scene goal:")}</strong>{" "}
              {result.data.episodeGoal}
            </p>
            <p className="mt-1">
              <strong className="text-fg">{bt("스크롤 호흡 팁:", "Scroll pacing:")}</strong>{" "}
              {result.data.pacingTip}
            </p>
          </div>
          <ol className="space-y-2">
            {result.data.cuts.map((cut) => (
              <li
                key={cut.cutNumber}
                className="rounded-xl border border-line bg-panel/55 p-3 text-xs leading-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm font-black text-fg">
                    {bt(`${cut.cutNumber}컷`, `Panel ${cut.cutNumber}`)} · {cut.shotType}
                  </strong>
                  <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.65rem] font-semibold text-fg-3">
                    {cut.scrollGapHint}
                  </span>
                </div>
                <p className="mt-1 text-fg-2">{cut.visualAction}</p>
                {cut.dialogue ? (
                  <p className="mt-1.5 rounded-lg bg-card px-2.5 py-1.5 font-semibold text-fg">
                    “{cut.dialogue}”
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
          {onAppendStoryBeats ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-xs text-fg-3">
                {bt(
                  "기존 컷 계획을 덮어쓰지 않고 맨 뒤에 사본으로 덧붙입니다.",
                  "Appends behind existing story beats without overwriting.",
                )}
              </span>
              <button
                type="button"
                disabled={appended}
                onClick={() => {
                  onAppendStoryBeats(cutsToStoryBeats(result.data.cuts));
                  setAppendedResponse(response);
                }}
                className={buttonClass({
                  variant: appended ? "outline" : "solid",
                  size: "sm",
                  className: "min-h-10 gap-1.5",
                })}
              >
                {appended ? <Check size={14} /> : <ListPlus size={14} />}
                {appended
                  ? bt("기획 컷 목록에 추가됨", "Added to story beats")
                  : bt("기획 컷 목록에 사본으로 추가", "Append to story beats")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {result.mode === "dialogue-polish" ? (
        <div className="mt-3 space-y-3">
          <p className="rounded-xl bg-panel/70 p-3 text-xs leading-5 text-fg-2">
            <strong className="text-fg">{bt("가독성 메모:", "Readability note:")}</strong>{" "}
            {result.data.readabilityNote}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {result.data.balloons.map((item, idx) => {
              const key = `balloon:${idx}`;
              const combined = item.subBubble
                ? `${item.line}\n(${item.subBubble})`
                : item.line;
              return (
                <article
                  key={key}
                  className="flex flex-col justify-between rounded-xl border border-line bg-panel/60 p-3 text-xs"
                >
                  <div>
                    <span className="inline-block rounded bg-accent/15 px-2 py-0.5 text-[0.65rem] font-bold text-accent">
                      {item.toneLabel}
                    </span>
                    <p className="mt-2 text-sm font-bold leading-5 text-fg">“{item.line}”</p>
                    {item.subBubble ? (
                      <p className="mt-1 text-xs font-semibold text-fg-2">
                        + “{item.subBubble}”
                      </p>
                    ) : null}
                    <p className="mt-2 text-[0.7rem] leading-4 text-fg-3">{item.reason}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopy(key, combined)}
                    className={buttonClass({
                      variant: "outline",
                      size: "sm",
                      className: "mt-3 min-h-9 self-start gap-1.5",
                    })}
                  >
                    {copiedKey === key ? <Check size={13} /> : <Copy size={13} />}
                    {copiedKey === key ? bt("복사됨", "Copied") : bt("대사 복사", "Copy line")}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {result.mode === "export-preflight-coach" ? (
        <div className="mt-3 space-y-3 text-xs">
          <p className="font-semibold text-fg">{result.data.readinessSummary}</p>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-panel/70 p-3">
            <div>
              <span className="text-[0.68rem] font-bold text-accent">
                {bt("추천 회차 한 줄 소개", "Suggested episode blurb")}
              </span>
              <p className="mt-1 text-sm font-bold text-fg">
                {result.data.episodeBlurbSuggestion}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleCopy("blurb", result.data.episodeBlurbSuggestion)}
              className={buttonClass({
                variant: "outline",
                size: "sm",
                className: "min-h-9 gap-1.5",
              })}
            >
              {copiedKey === "blurb" ? <Check size={13} /> : <Copy size={13} />}
              {copiedKey === "blurb" ? bt("복사됨", "Copied") : bt("소개글 복사", "Copy blurb")}
            </button>
          </div>
          <ul className="space-y-1.5">
            {result.data.checks.map((check, idx) => (
              <li
                key={`${check.category}:${idx}`}
                className={cn(
                  "rounded-xl border px-3 py-2 leading-5",
                  check.severity === "fix"
                    ? "border-danger/35 bg-danger-soft/15 text-danger"
                    : check.severity === "tip"
                      ? "border-warning/35 bg-warning-soft/15 text-fg-2"
                      : "border-success/30 bg-success-soft/15 text-fg-2",
                )}
              >
                <strong className="font-bold text-fg">[{check.category}]</strong> {check.detail}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
