import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";
import type { StoryToArtHandoffPackage } from "@toonstudio/core/production";
import { ClipboardList } from "lucide-react";

import {
  buildAssistantBrief,
  buildAssistantBriefText,
  type AssistantBrief,
  type AssistantBriefAggregate,
  type AssistantBriefPalette,
} from "./assistant-brief-model";
import { PRODUCTION_DEFAULT_PROCESS_ORDER, productionProcessLabel } from "./production-labels";
import { ProductionPill, ProductionSectionCard } from "./production-ui";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 어시가 실제로 받는 공정 — 스토리 확정 자체는 브리프 대상이 아니다. */
const BRIEF_PROCESS_FALLBACK: readonly string[] = Object.freeze([
  "storyboard",
  "line-art",
  "background",
  "color",
  "lettering",
]);

const MISSING_LABELS: Readonly<Record<string, { readonly ko: string; readonly en: string }>> = Object.freeze({
  "cut-range": { ko: "컷 범위", en: "Cut range" },
  "style-rules": { ko: "스타일 규칙", en: "Style rules" },
  palette: { ko: "팔레트", en: "Palette" },
  "reference-cuts": { ko: "참조 컷", en: "Reference cuts" },
  "queue-task": { ko: "연결할 작업", en: "Queue task" },
  "completion-criteria": { ko: "완료 기준", en: "Done criteria" },
});

/**
 * 어시 작업 브리프 자동 조립 패널 (REPORT A-3).
 * 인계 표면 안에서 컷 범위·공정을 고르면 스타일 규칙·팔레트·참조 컷이 조립된
 * 브리프가 미리 보이고, 그 브리프는 인계 패키지와 함께 복사해 전달하거나
 * 받는 쪽 작업(ProductionTask.briefBlocks)에 붙여 작업 큐로 연결할 수 있다.
 * 조립되지 못한 항목은 숨기지 않고 "아직 비어 있음"으로 드러낸다.
 */
export function AssistantBriefPanel({
  aggregate,
  handoff,
  palette,
  canEdit,
  onAttachBrief,
}: {
  readonly aggregate: AssistantBriefAggregate;
  readonly handoff: StoryToArtHandoffPackage;
  /** 에디터 팔레트 등 실제 팔레트 소스가 있을 때만 전달. 없으면 브리프가 없음으로 명시한다. */
  readonly palette?: AssistantBriefPalette | null;
  readonly canEdit: boolean;
  /** 큐 작업에 브리프를 붙이는 실행 콜백(호스트가 upsert-task-batch로 보낸다). */
  readonly onAttachBrief?: (brief: AssistantBrief) => Promise<void>;
}) {
  const bt = useBilingual("AssistantBriefPanel");
  const localize = (ko: string, en: string) => bt(ko, en);
  const episodeCuts = useMemo(
    () =>
      aggregate.cutPlans
        .filter((cut) => cut.episodeId === handoff.episodeId)
        .slice()
        .sort((left, right) => left.order - right.order),
    [aggregate.cutPlans, handoff.episodeId],
  );
  const processOptions = useMemo(() => {
    const keys = aggregate.workflowProfile?.steps.map((step) => step.key) ?? [...PRODUCTION_DEFAULT_PROCESS_ORDER];
    const canonicalKeys = [...new Set(keys.map((key) => canonicalProductionProcessKey(key)))];
    const briefable = canonicalKeys.filter((key) => key !== "story-lock");
    return briefable.length > 0 ? briefable : [...BRIEF_PROCESS_FALLBACK];
  }, [aggregate.workflowProfile]);
  const [processKey, setProcessKey] = useState<string>(() =>
    processOptions.includes("color") ? "color" : (processOptions[0] ?? "color"),
  );
  const [fromCutId, setFromCutId] = useState<string>("");
  const [toCutId, setToCutId] = useState<string>("");
  const [referenceCutIds, setReferenceCutIds] = useState<readonly string[]>([]);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [attached, setAttached] = useState(false);

  const fromCut = episodeCuts.find((cut) => cut.cutId === fromCutId);
  const toCut = episodeCuts.find((cut) => cut.cutId === toCutId);
  const brief = buildAssistantBrief(aggregate, handoff.id, {
    processKey,
    fromOrder: fromCut ? fromCut.order : null,
    toOrder: toCut ? toCut.order : null,
    palette: palette ?? null,
    referenceCutIds,
  });
  if (!brief) return null;
  const briefText = buildAssistantBriefText(brief, "ko");
  const missingLabel = (code: string) => {
    if (code.startsWith("unknown-cut:")) return bt("범위에 없는 컷", "Cut outside the range");
    if (code.startsWith("unknown-reference-cut:")) return bt("없는 참조 컷", "Unknown reference cut");
    const label = MISSING_LABELS[code];
    return label ? bt(label.ko, label.en) : code;
  };

  const selectClass = "rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-fg";

  return (
    <ProductionSectionCard
      title={bt("어시 작업 브리프", "Assistant work brief")}
      description={bt(
        "컷 범위와 공정을 고르면 스타일 규칙·팔레트·참조 컷이 자동으로 조립돼 인계에 포함됩니다. 받는 쪽은 작업 큐에서 바로 이어집니다.",
        "Pick a cut range and stage — style rules, palette, and reference cuts assemble into the handoff. The receiver continues from their work queue.",
      )}
      action={
        <ProductionPill tone={brief.ready ? "success" : "warning"}>
          {brief.ready ? bt("조립 완료", "Assembled") : bt("비어 있는 항목 있음", "Has gaps")}
        </ProductionPill>
      }
    >
      <div data-testid="assistant-brief-panel" className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-[0.6875rem] font-bold text-fg-3">
            {bt("공정", "Stage")}
            <select
              aria-label={bt("브리프 공정", "Brief stage")}
              className={`${selectClass} block`}
              value={brief.processKey}
              onChange={(event) => { setProcessKey(event.target.value); setAttached(false); }}
            >
              {processOptions.map((key) => (
                <option key={key} value={key}>{productionProcessLabel(aggregate, key, localize)}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[0.6875rem] font-bold text-fg-3">
            {bt("시작 컷", "From cut")}
            <select
              aria-label={bt("시작 컷", "From cut")}
              className={`${selectClass} block`}
              value={fromCutId}
              onChange={(event) => { setFromCutId(event.target.value); setAttached(false); }}
            >
              <option value="">{bt("처음부터", "From start")}</option>
              {episodeCuts.map((cut) => (
                <option key={cut.cutId} value={cut.cutId}>{cut.order}{bt("컷", "")}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[0.6875rem] font-bold text-fg-3">
            {bt("끝 컷", "To cut")}
            <select
              aria-label={bt("끝 컷", "To cut")}
              className={`${selectClass} block`}
              value={toCutId}
              onChange={(event) => { setToCutId(event.target.value); setAttached(false); }}
            >
              <option value="">{bt("끝까지", "To end")}</option>
              {episodeCuts.map((cut) => (
                <option key={cut.cutId} value={cut.cutId}>{cut.order}{bt("컷", "")}</option>
              ))}
            </select>
          </label>
          <span className="pb-1 text-xs font-bold text-fg-2">{bt(brief.cutRangeLabel.ko, brief.cutRangeLabel.en)}</span>
        </div>

        {episodeCuts.length > 0 ? (
          <fieldset className="rounded-xl border border-line bg-panel p-3">
            <legend className="px-1 text-xs font-bold text-fg">{bt("참조 컷", "Reference cuts")}</legend>
            <div className="flex flex-wrap gap-2">
              {episodeCuts.map((cut) => {
                const checked = referenceCutIds.includes(cut.cutId);
                return (
                  <label key={cut.cutId} className="flex items-center gap-1.5 rounded-lg bg-raised px-2 py-1 text-xs text-fg-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setReferenceCutIds(
                          event.target.checked
                            ? [...referenceCutIds, cut.cutId]
                            : referenceCutIds.filter((id) => id !== cut.cutId),
                        );
                        setAttached(false);
                      }}
                    />
                    {cut.order}{bt("컷", "")} · {cut.framing}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-line bg-panel p-3">
            <p className="text-xs font-bold text-fg">{bt("스타일 규칙·금지", "Style rules & prohibitions")}</p>
            <ul className="mt-2 space-y-1 text-xs leading-5 text-fg-2">
              {brief.styleRules.map((rule) => <li key={rule}>· {rule}</li>)}
              {brief.styleRules.length === 0 ? <li className="text-fg-3">{bt("등록된 스타일 규칙이 없습니다.", "No style rules registered.")}</li> : null}
              {brief.forbidden.map((item) => <li key={item} className="text-bad">✕ {item}</li>)}
            </ul>
          </div>
          <div className="rounded-xl border border-line bg-panel p-3">
            <p className="text-xs font-bold text-fg">{bt("팔레트", "Palette")}</p>
            {brief.palette ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {brief.palette.swatches.map((swatch) => (
                  <span key={`${swatch.name}-${swatch.hex}`} className="flex items-center gap-1.5 text-xs text-fg-2">
                    <span className="inline-block size-4 rounded border border-line" style={{ backgroundColor: swatch.hex }} aria-hidden="true" />
                    {swatch.name} {swatch.hex}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-warn">
                {bt("연결된 팔레트가 없습니다. 있는 것처럼 꾸미지 않으니, 작업 전에 팔레트를 연결하거나 확인하세요.", "No palette is linked. The brief won't invent one — link or confirm a palette before work starts.")}
              </p>
            )}
            <p className="mt-3 text-xs font-bold text-fg">{bt("참조 컷", "Reference cuts")}</p>
            {brief.referenceCuts.length > 0 ? (
              <ul className="mt-1 space-y-1 text-xs leading-5">
                {brief.referenceCuts.map((cut) => (
                  <li key={cut.cutId}>
                    <Link className="text-accent underline-offset-2 hover:underline" to={cut.href}>{cut.label}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-fg-3">{bt("위에서 참조 컷을 골라 주세요.", "Pick reference cuts above.")}</p>
            )}
          </div>
        </div>

        {brief.completionCriteria.length > 0 ? (
          <div className="rounded-xl border border-line bg-panel p-3">
            <p className="text-xs font-bold text-fg">{bt("완료 기준", "Done when")}</p>
            <ul className="mt-1 space-y-1 text-xs leading-5 text-fg-2">
              {brief.completionCriteria.map((criterion) => <li key={criterion}>· {criterion}</li>)}
            </ul>
          </div>
        ) : null}

        {brief.missing.length > 0 ? (
          <p className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-fg" role="status">
            {bt("아직 비어 있는 항목", "Still missing")}: {brief.missing.map(missingLabel).join(", ")}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <ClipboardList className="size-4 text-fg-3" aria-hidden="true" />
          {brief.queueTaskIds.length > 0 ? (
            <p className="text-xs text-fg-2">
              {bt(`받는 쪽 작업 ${brief.queueTaskIds.length}건에 연결됩니다`, `Connects to ${brief.queueTaskIds.length} receiver task(s)`)}
              {brief.queueTaskTitles.length > 0 ? `: ${brief.queueTaskTitles.join(" · ")}` : ""}
            </p>
          ) : (
            <p className="text-xs text-fg-3">{bt("이 공정·범위의 작업이 아직 없습니다. 공정 보드에서 작업을 만들면 브리프가 연결됩니다.", "No task exists for this stage and range yet. Create one on the board and the brief connects.")}</p>
          )}
          <span className="ml-auto flex flex-wrap gap-2">
            <Link className={buttonClass({ variant: "outline", size: "sm" })} to={brief.queueHref}>
              {bt("작업 큐 열기", "Open work queue")}
            </Link>
            <button
              type="button"
              className={buttonClass({ variant: "outline", size: "sm" })}
              onClick={() => {
                setCopied(false);
                setCopyFailed(false);
                void navigator.clipboard.writeText(briefText).then(() => setCopied(true)).catch(() => setCopyFailed(true));
              }}
            >
              {bt("브리프 복사", "Copy brief")}
            </button>
            {canEdit && onAttachBrief ? (
              <button
                type="button"
                className={buttonClass({ variant: "solid", size: "sm" })}
                disabled={brief.queueTaskIds.length === 0}
                onClick={() => { void onAttachBrief(brief).then(() => setAttached(true)); }}
              >
                {bt("작업 큐에 브리프 붙이기", "Attach brief to queue")}
              </button>
            ) : null}
          </span>
        </div>
        {copied ? <p role="status" className="text-xs font-bold text-accent">{bt("브리프를 복사했습니다. 인계와 함께 전달하세요.", "Brief copied. Send it with the handoff.")}</p> : null}
        {attached ? <p role="status" className="text-xs font-bold text-accent">{bt("브리프를 작업 큐에 붙였습니다.", "Brief attached to the work queue.")}</p> : null}
        {copyFailed ? (
          <textarea
            readOnly
            aria-label={bt("어시 작업 브리프 텍스트", "Assistant brief text")}
            value={briefText}
            rows={10}
            className="w-full rounded-lg border border-line bg-canvas p-2 text-xs text-fg"
            onFocus={(event) => event.currentTarget.select()}
          />
        ) : null}
      </div>
    </ProductionSectionCard>
  );
}
