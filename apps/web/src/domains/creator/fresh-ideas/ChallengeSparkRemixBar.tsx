/**
 * ChallengeSparkRemixBar.tsx — 창작 챌린지 주제 → 3컷 스파크 리믹서.
 *
 * 진행 중인 챌린지 상세 영역에서 분위기 4종 + 카메라 구도 3종 + 주사위 셔플로
 * 1컷 도입 · 2컷 전환 · 3컷 여운/반전 콘티 스파크를 즉시 조합하고,
 * 클립보드 복사(실패 시 인라인 복사 영역 안내)와 스튜디오 진입까지 원클릭으로 이어 준다.
 */

import { Camera, Check, Copy, Dices, Film, PenLine, Sparkles } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import {
  buildChallengeSparkPlan,
  nextSparkCamera,
  SPARK_CAMERAS,
  SPARK_MOODS,
  type ChallengeSparkInput,
  type SparkCameraId,
  type SparkMoodId,
} from "./challenge-spark-remix";

import "./challenge-spark-remix.css";

interface CopyFeedbackState {
  readonly planKey: string;
  readonly status: "copied" | "failed";
}

function CutCameraGuideGlyph({
  cameraId,
  cutIndex,
}: {
  readonly cameraId: SparkCameraId;
  readonly cutIndex: 1 | 2 | 3;
}) {
  if (cameraId === "closeup-twist") {
    const inset = cutIndex === 1 ? 8 : cutIndex === 2 ? 12 : 16;
    return (
      <svg viewBox="0 0 64 36" className="h-7 w-12 shrink-0" aria-hidden="true">
        <rect x="4" y="4" width="56" height="28" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.2" />
        <rect
          x={inset}
          y={inset * 0.45}
          width={64 - inset * 2}
          height={36 - inset * 0.9}
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <circle cx="32" cy="18" r={cutIndex === 3 ? 4.5 : 2.5} fill="currentColor" fillOpacity="0.7" />
      </svg>
    );
  }
  if (cameraId === "high-angle-isolation") {
    return (
      <svg viewBox="0 0 64 36" className="h-7 w-12 shrink-0" aria-hidden="true">
        <path d="M6 6 L24 30 M58 6 L40 30 M6 14 L58 14" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.2" />
        <circle cx={cutIndex === 2 ? 32 : cutIndex === 1 ? 32 : 44} cy={cutIndex === 1 ? 24 : 20} r="3.4" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 36" className="h-7 w-12 shrink-0" aria-hidden="true">
      <path d="M8 28 L56 8 M12 16 L46 6 M18 30 L56 18" fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx={cutIndex === 1 ? 18 : cutIndex === 2 ? 36 : 50} cy={cutIndex === 1 ? 24 : cutIndex === 2 ? 16 : 11} r="3.4" fill="currentColor" />
    </svg>
  );
}

export function ChallengeSparkRemixBar({
  challenge,
}: {
  readonly challenge: ChallengeSparkInput;
}) {
  const bt = useBilingual("ChallengeSparkRemixBar");
  const isKorean = useI18n((state) => state.lang.startsWith("ko"));
  const [moodId, setMoodId] = useState<SparkMoodId>("flutter");
  const [cameraId, setCameraId] = useState<SparkCameraId>("closeup-twist");
  const [seed, setSeed] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedbackState | null>(null);

  const plan = useMemo(
    () => buildChallengeSparkPlan({ challenge, moodId, cameraId, seed }),
    [challenge, moodId, cameraId, seed],
  );

  const planKey = `${plan.challengeId}:${plan.mood.id}:${plan.camera.id}:${plan.seed}`;
  const activeCopyStatus = copyFeedback?.planKey === planKey ? copyFeedback.status : null;
  const clipboardText = isKorean ? plan.clipboardTextKo : plan.clipboardTextEn;

  const handleShuffle = () => {
    setSeed((prev) => prev + 1);
    setCameraId((prev) => nextSparkCamera(prev));
  };

  const handleCopyMemo = async () => {
    try {
      const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      if (!clipboard || typeof clipboard.writeText !== "function") {
        setCopyFeedback({ planKey, status: "failed" });
        return;
      }
      await clipboard.writeText(clipboardText);
      setCopyFeedback({ planKey, status: "copied" });
    } catch {
      setCopyFeedback({ planKey, status: "failed" });
    }
  };

  return (
    <section
      data-testid="challenge-spark-remix-bar"
      aria-labelledby="challenge-spark-remix-heading"
      className="challenge-spark-bar mb-5 p-4 sm:p-5 [word-break:keep-all]"
      style={{ "--spark-mood-tone": plan.mood.toneVar } as CSSProperties}
    >
      <span className="challenge-spark-bar__ribbon" aria-hidden="true" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id="challenge-spark-remix-heading"
              className="flex items-center gap-1.5 text-sm font-bold text-fg sm:text-base"
            >
              <Sparkles size={15} strokeWidth={1.6} className="shrink-0 text-accent" aria-hidden="true" />
              {bt("주제 → 3컷 스파크 리믹서", "Theme → 3-Cut Spark Remixer")}
            </h3>
            <span
              data-testid="challenge-spark-seed-badge"
              className="inline-flex items-center rounded-full border border-line bg-card/85 px-2 py-0.5 text-xs font-semibold tabular-nums text-fg-2"
            >
              {bt("구상", "Spark")} #{plan.seed + 1}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-fg-2">
            {bt(
              "분위기와 카메라 구도를 골라 3컷 콘티 초안을 바로 뽑아 보세요. 외부 AI 호출 없이 즉시 바뀝니다.",
              "Pick a mood and camera angle to spin a 3-cut storyboard spark instantly with zero external calls.",
            )}
          </p>
        </div>

        <button
          type="button"
          data-testid="challenge-spark-shuffle-btn"
          onClick={handleShuffle}
          className="challenge-spark-shuffle inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-xs font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Dices size={15} strokeWidth={1.6} aria-hidden="true" />
          <span>{bt("새 구도 섞기", "Shuffle angle")}</span>
        </button>
      </div>

      {/* 분위기 4종 + 카메라 구도 3종 선택 */}
      <div className="mt-3.5 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label={bt("3컷 분위기 선택", "Choose 3-cut mood")}
          className="flex flex-wrap items-center gap-1.5"
        >
          {SPARK_MOODS.map((mood) => {
            const active = mood.id === moodId;
            return (
              <button
                key={mood.id}
                type="button"
                data-testid={`challenge-spark-mood-${mood.id}`}
                aria-pressed={active}
                onClick={() => setMoodId(mood.id)}
                style={{ "--chip-tone": mood.toneVar } as CSSProperties}
                className="challenge-spark-chip inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: mood.toneVar }}
                />
                <span>{bt(mood.labelKo, mood.labelEn)}</span>
              </button>
            );
          })}
        </div>

        <div
          role="group"
          aria-label={bt("카메라 구도 선택", "Choose camera composition")}
          className="flex flex-wrap items-center gap-1.5"
        >
          <span className="inline-flex items-center gap-1 pr-1 text-xs font-medium text-fg-3">
            <Camera size={13} aria-hidden="true" />
            {bt("구도", "Camera")}
          </span>
          {SPARK_CAMERAS.map((camera) => {
            const active = camera.id === cameraId;
            return (
              <button
                key={camera.id}
                type="button"
                data-testid={`challenge-spark-camera-${camera.id}`}
                aria-pressed={active}
                onClick={() => setCameraId(camera.id)}
                style={{ "--chip-tone": plan.mood.toneVar } as CSSProperties}
                className="challenge-spark-chip inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-xs font-medium text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {bt(camera.labelKo, camera.labelEn)}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3컷 비주얼 스트립 카드 */}
      <ol
        key={planKey}
        data-testid="challenge-spark-cuts"
        aria-label={bt("3컷 콘티 스파크", "3-cut storyboard spark")}
        className="mt-4 grid gap-2.5 md:grid-cols-3"
      >
        {plan.cuts.map((cut) => (
          <li
            key={cut.stage}
            data-testid={`challenge-spark-cut-${cut.index}`}
            style={{ "--cut-tone": cut.toneVar } as CSSProperties}
            className="challenge-spark-cut flex flex-col rounded-2xl p-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                <span
                  className="inline-grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-bold tabular-nums text-on-accent"
                  style={{ backgroundColor: cut.toneVar }}
                >
                  0{cut.index}
                </span>
                <span>{bt(cut.stageLabelKo, cut.stageLabelEn)}</span>
              </span>
              <span className="rounded-md border border-line bg-raised/80 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-fg-2">
                {cut.frameRatio}
              </span>
            </div>

            <div className="challenge-spark-cut__guide mt-2.5 flex items-center justify-between gap-2 rounded-xl px-2.5 py-2">
              <span className="text-xs font-semibold text-fg">
                {bt(cut.shotTagKo, cut.shotTagEn)}
              </span>
              <CutCameraGuideGlyph cameraId={plan.camera.id} cutIndex={cut.index} />
            </div>

            <p className="mt-2.5 text-xs leading-relaxed text-fg-2">
              {isKorean ? cut.visualDirectionKo : cut.visualDirectionEn}
            </p>

            <p className="mt-auto pt-2.5 text-xs font-semibold text-fg">
              {bt(cut.dialogueHookKo, cut.dialogueHookEn)}
            </p>
          </li>
        ))}
      </ol>

      {/* 하단 액션 바: 추천 컷 비율 + 3컷 메모 복사 + 이 구상으로 스튜디오 열기 */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-line/70 pt-3.5">
        <p
          data-testid="challenge-spark-ratio"
          className="inline-flex items-center gap-1.5 text-xs font-medium tabular-nums text-fg-2"
        >
          <Film size={14} aria-hidden="true" className="shrink-0 text-accent" />
          <span>{bt("추천 컷 비율", "Suggested cut ratio")}:</span>
          <strong className="font-semibold text-fg">
            {bt(plan.ratioLabelKo, plan.ratioLabelEn)}
          </strong>
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="challenge-spark-copy-btn"
            onClick={() => {
              void handleCopyMemo();
            }}
            className={buttonClass({
              size: "sm",
              variant: "outline",
              className: "min-h-11 gap-1.5 px-3.5 text-xs",
            })}
          >
            {activeCopyStatus === "copied" ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Copy size={14} aria-hidden="true" />
            )}
            <span>
              {activeCopyStatus === "copied"
                ? bt("3컷 메모 복사됨", "3-cut notes copied")
                : bt("3컷 메모 복사", "Copy 3-cut notes")}
            </span>
          </button>

          <Link
            href={plan.studioHref}
            data-testid="challenge-spark-studio-cta"
            data-no-sfx
            className={buttonClass({
              size: "sm",
              variant: "solid",
              className: "min-h-11 gap-1.5 px-3.5 text-xs",
            })}
          >
            <PenLine size={14} aria-hidden="true" />
            <span>{bt("이 구상으로 스튜디오 열기", "Open Studio with this spark")}</span>
          </Link>
        </div>
      </div>

      {/* 클립보드 복사 결과 또는 실패 시 인라인 안내 */}
      {activeCopyStatus ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="challenge-spark-copy-status"
          className="mt-3 rounded-xl border border-line bg-card/85 px-3.5 py-2.5 text-xs text-fg-2"
        >
          {activeCopyStatus === "copied" ? (
            <p className="font-medium text-good">
              {bt(
                "3컷 콘티 메모를 클립보드에 복사했어요. 스튜디오 노트에 바로 붙여 넣으세요.",
                "Copied the 3-cut notes to your clipboard. Paste them straight into Studio notes.",
              )}
            </p>
          ) : (
            <div className="space-y-2">
              <p className="font-medium text-warn">
                {bt(
                  "자동 복사를 사용할 수 없어 아래에 메모를 열었어요. 직접 선택해 복사해 주세요.",
                  "Automatic clipboard copy is unavailable here. Select and copy the notes below.",
                )}
              </p>
              <pre
                data-testid="challenge-spark-copy-fallback"
                className="max-h-36 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-panel px-3 py-2 text-xs leading-relaxed text-fg select-all"
              >
                {clipboardText}
              </pre>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
