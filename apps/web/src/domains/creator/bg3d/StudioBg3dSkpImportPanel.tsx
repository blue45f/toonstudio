import { AlertTriangle, CheckCircle2, Info, Loader2, Ruler, X } from "lucide-react";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";

import {
  STUDIO_BG3D_SKP_LEGAL_NOTICE,
  STUDIO_BG3D_SKP_SUPPORT_SUMMARY,
  describeStudioBg3dSkpAppliedUnit,
  describeStudioBg3dSkpConversion,
  describeStudioBg3dSkpCounts,
  describeStudioBg3dSkpDeclaredUnit,
  describeStudioBg3dSkpMetadataStatus,
  describeStudioBg3dSkpNameList,
  describeStudioBg3dSkpSizeLevel,
  describeStudioBg3dSkpSource,
  describeStudioBg3dSkpStage,
  describeStudioBg3dSkpWarning,
  formatStudioBg3dSkpDimensions,
} from "./studio-bg3d-skp-import-copy";
import { studioBg3dSkpImportSession } from "./studio-bg3d-skp-import-session";
import { STUDIO_BG3D_SKP_UNIT_LABELS } from "./studio-bg3d-skp-unit";

import type {
  StudioBg3dSkpImportSession,
  StudioBg3dSkpResultEntry,
  StudioBg3dSkpUnitQuestion,
} from "./studio-bg3d-skp-import-session";
import type { StudioBg3dSkpUnitDecision } from "./studio-bg3d-skp-import";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const SMALL_BUTTON = `inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9`;

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function UnitQuestionCard({
  question,
  onAnswer,
}: {
  readonly question: StudioBg3dSkpUnitQuestion;
  readonly onAnswer: (decision: StudioBg3dSkpUnitDecision) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { assessment } = question;

  // 질문이 열리면 키보드·스크린리더 사용자가 바로 알 수 있게 제목으로 초점을 옮긴다.
  useEffect(() => {
    headingRef.current?.focus();
  }, [question.id]);

  // Escape 로 질문을 취소한다. 카드 안 어느 요소에 초점이 있어도 동작해야 하고 편집기 전역의 Escape 처리로
  // 번지면 안 된다. 비대화형 요소(group)에 JSX 키 핸들러를 다는 것은 접근성 규칙(jsx-a11y)이 막으므로
  // 카드에 직접 단 네이티브 리스너로 처리한다.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onAnswer({ kind: "cancel" });
    };
    group.addEventListener("keydown", onKeyDown);
    return () => group.removeEventListener("keydown", onKeyDown);
  }, [onAnswer]);

  return (
    <div
      ref={groupRef}
      role="group"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-3 text-xs"
    >
      <h4
        ref={headingRef}
        id={titleId}
        tabIndex={-1}
        className={cx("flex items-center gap-1.5 font-bold text-fg", FOCUS_RING)}
      >
        <Ruler size={14} className="shrink-0 text-warn" aria-hidden />
        모델 크기를 확인해 주세요
      </h4>
      <p id={descriptionId} className="mt-1 break-words leading-relaxed text-fg-2 [overflow-wrap:anywhere]">
        ‘{question.sourceName}’이(가) 지금 {formatStudioBg3dSkpDimensions(question.report.size?.meters ?? [0, 0, 0])}{" "}
        ({describeStudioBg3dSkpSizeLevel(assessment.level)})로 읽혔습니다. SketchUp은 모델을 인치로 저장하므로
        모델을 만들 때 쓴 단위를 고르면 실제 크기로 다시 맞춥니다. 고른 단위는 변환 보고서에 기록됩니다.
      </p>
      <ul className="mt-2 grid gap-1.5">
        {assessment.candidates.map((candidate) => {
          const recommended = candidate.unit === assessment.recommendedUnit;
          const label = STUDIO_BG3D_SKP_UNIT_LABELS[candidate.unit];
          return (
            <li key={candidate.unit}>
              <button
                type="button"
                onClick={() => onAnswer({ kind: "unit", unit: candidate.unit })}
                className={cx(
                  SMALL_BUTTON,
                  "w-full justify-between gap-2 text-left",
                  recommended
                    ? "border-accent/55 bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                  {candidate.unit === "inch" ? `${label} · 지금 크기 그대로` : `${label}로 해석`}
                  {" → "}
                  {formatStudioBg3dSkpDimensions(candidate.sizeMeters)}
                </span>
                {recommended ? <span className="shrink-0 text-[0.65rem] font-bold">추천</span> : null}
                {!candidate.plausible ? <span className="shrink-0 text-[0.65rem] text-fg-3">비현실적 크기</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => onAnswer({ kind: "cancel" })}
        className={cx(SMALL_BUTTON, "mt-2 border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg")}
      >
        <X size={14} aria-hidden />
        가져오기 취소
      </button>
    </div>
  );
}

function ResultCard({
  entry,
  onDismiss,
}: {
  readonly entry: StudioBg3dSkpResultEntry;
  readonly onDismiss: (id: string) => void;
}) {
  const titleId = useId();
  const { report } = entry;
  const imported = entry.status === "imported";
  const warnings = report.warnings.map(describeStudioBg3dSkpWarning);
  const size = report.size;
  return (
    <article
      aria-labelledby={titleId}
      className={cx(
        "rounded-xl border px-3 py-2.5 text-xs",
        imported ? "border-good/35 bg-good/10" : "border-warn/40 bg-warn/10",
      )}
    >
      <header className="flex items-start gap-2">
        {imported
          ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-good" aria-hidden />
          : <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden />}
        <div className="min-w-0 flex-1">
          <h4 id={titleId} className="break-words font-bold text-fg [overflow-wrap:anywhere]">
            {entry.sourceName}
          </h4>
          <p className="break-words text-fg-2 [overflow-wrap:anywhere]">
            {imported ? "SketchUp 변환 보고서 · 가져옴" : `가져오지 못함 · ${entry.reason ?? ""}`}
          </p>
        </div>
        <button
          type="button"
          aria-label={`${entry.sourceName} 변환 결과 닫기`}
          onClick={() => onDismiss(entry.id)}
          className={cx(
            "-mr-1 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg sm:size-9",
            FOCUS_RING,
          )}
        >
          <X size={14} aria-hidden />
        </button>
      </header>

      <ul className="mt-2 space-y-1 break-words text-fg-2 [overflow-wrap:anywhere]">
        <li>{describeStudioBg3dSkpAppliedUnit(report)}</li>
        <li>
          {size
            ? `${formatStudioBg3dSkpDimensions(size.meters)}${size.level === "ok" ? "" : ` · ${describeStudioBg3dSkpSizeLevel(size.level)}`}`
            : "형상 없음"}
        </li>
        <li>{describeStudioBg3dSkpCounts(report)}</li>
      </ul>

      {warnings.length > 0 ? (
        <ul className="mt-2 space-y-1" aria-label="변환 경고">
          {warnings.map((warning) => (
            <li
              key={warning.code}
              className={cx(
                "flex items-start gap-1.5 break-words [overflow-wrap:anywhere]",
                warning.severity === "warning" ? "text-warn" : "text-fg-3",
              )}
            >
              {warning.severity === "warning"
                ? <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden />
                : <Info size={12} className="mt-0.5 shrink-0" aria-hidden />}
              <span>{warning.text}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <details className="mt-2 text-fg-3">
        <summary className={cx("min-h-11 cursor-pointer py-2 font-semibold text-fg-2 sm:min-h-9", FOCUS_RING)}>
          자세히 보기
        </summary>
        <ul className="space-y-1 break-words pb-1 [overflow-wrap:anywhere]">
          <li>{describeStudioBg3dSkpSource(report)}</li>
          <li>{describeStudioBg3dSkpDeclaredUnit(report)}</li>
          <li>{describeStudioBg3dSkpConversion(report)}</li>
          <li>{describeStudioBg3dSkpNameList("컴포넌트", report.names.components)}</li>
          <li>{describeStudioBg3dSkpNameList("태그", report.names.tags)}</li>
          <li>{describeStudioBg3dSkpNameList("장면", report.names.scenes)}</li>
          {imported ? <li>{describeStudioBg3dSkpMetadataStatus(entry.metadata)}</li> : null}
        </ul>
      </details>
    </article>
  );
}

/**
 * 자산 라이브러리 패널 안에서 .skp 가져오기의 안내·진행·단위 확인·변환 보고서를 보여 주는 잎 컴포넌트.
 * 상태는 가져오기 액션과 공유하는 외부 저장소(studio-bg3d-skp-import-session)에서만 읽는다.
 * 마운트되는 동안 "응답할 화면이 있음"을 저장소에 알려, 크기가 비정상일 때 가져오기가 단위를 물을 수 있게 한다.
 */
export function StudioBg3dSkpImportPanel({
  session = studioBg3dSkpImportSession,
}: {
  readonly session?: StudioBg3dSkpImportSession;
}) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => session.registerHost(), [session]);
  const { activity, question, results } = snapshot;

  // 질문 카드가 닫히면 초점이 문서 맨 앞으로 튀지 않게 이 패널 영역으로 돌려 놓는다.
  const rootRef = useRef<HTMLDivElement>(null);
  const hadQuestionRef = useRef(false);
  useEffect(() => {
    if (hadQuestionRef.current && question === null) rootRef.current?.focus();
    hadQuestionRef.current = question !== null;
  }, [question]);

  return (
    <div ref={rootRef} tabIndex={-1} className={cx("mt-2 space-y-2", FOCUS_RING)}>
      <details className="rounded-xl border border-line bg-card/60 px-3 py-2 text-xs leading-relaxed text-fg-3">
        <summary className={cx("min-h-11 cursor-pointer py-2 font-bold text-fg-2 sm:min-h-9", FOCUS_RING)}>
          SketchUp(.skp) 가져오기 안내
        </summary>
        <p className="pb-1">{STUDIO_BG3D_SKP_SUPPORT_SUMMARY}</p>
        <p className="pb-1">{STUDIO_BG3D_SKP_LEGAL_NOTICE}</p>
      </details>

      {activity && !question ? (
        <p
          role="status"
          aria-live="polite"
          className="flex items-start gap-2 rounded-xl border border-line bg-card/70 px-3 py-2 text-xs text-fg-2"
        >
          <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">
            <strong className="font-bold text-fg">{activity.sourceName}</strong>
            {" · "}
            {describeStudioBg3dSkpStage(activity.progress)}
          </span>
        </p>
      ) : null}

      {question ? (
        <UnitQuestionCard
          question={question}
          onAnswer={(decision) => {
            session.answerUnit(question.id, decision);
          }}
        />
      ) : null}

      {results.length > 0 ? (
        <section aria-label="SketchUp 변환 결과" className="space-y-2">
          {results.map((entry) => (
            <ResultCard key={entry.id} entry={entry} onDismiss={session.dismissResult} />
          ))}
          {results.length > 1 ? (
            <button
              type="button"
              onClick={session.clearResults}
              className={cx(SMALL_BUTTON, "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg")}
            >
              변환 결과 모두 지우기
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
