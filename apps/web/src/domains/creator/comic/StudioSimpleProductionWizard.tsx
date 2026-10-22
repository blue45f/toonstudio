import { creatorRestStatusText } from "../creator-rest-status-i18n";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "../../../shared/lib/utils";
import { parseDialogueScript } from "../studio-dialogue";
import { studioBackgroundPreviewCss } from "../studio-background-presets";

import {
  applySimpleProductionDefaults,
  buildSimpleProductionHandoff,
  clampSimpleProductionStep,
  createSimpleProductionDraft,
  findSimpleProductionEffect,
  SIMPLE_PRODUCTION_EFFECTS,
  SIMPLE_PRODUCTION_STEPS,
  simpleProductionBackgroundFillOptions,
  simpleProductionBackgroundSceneOptions,
  simpleProductionEditorExit,
  simpleProductionExpressionOptions,
  simpleProductionPoseOptions,
  type SimpleProductionDraft,
  type SimpleProductionHandoff,
} from "./studio-simple-production-wizard";

export interface StudioSimpleProductionWizardProps {
  /** 위저드 완료 — 조립·배경·레시피가 담긴 핸드오프를 적용하고 전문 에디터로 이어진다. */
  onComplete: (handoff: SimpleProductionHandoff) => void;
  /** 중간 단계에서 전문 에디터로 바로 가는 출구 — 지금까지의 선택은 정규화해 함께 넘긴다. */
  onOpenProEditor: (draft: SimpleProductionDraft) => void;
  onCancel: () => void;
  initialDraft?: SimpleProductionDraft;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const NEXT_BUTTON_CLASS =
  "ml-auto inline-flex min-h-11 min-w-24 items-center justify-center gap-1 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const PREV_BUTTON_CLASS =
  "inline-flex min-h-11 min-w-24 items-center justify-center gap-1 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const OPTION_CLASS =
  "flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function StudioSimpleProductionWizard({
  onComplete,
  onOpenProEditor,
  onCancel,
  initialDraft,
}: StudioSimpleProductionWizardProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<SimpleProductionDraft>(() =>
    initialDraft
      ? applySimpleProductionDefaults(initialDraft).draft
      : createSimpleProductionDraft(),
  );
  const [notice, setNotice] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const currentStep = SIMPLE_PRODUCTION_STEPS[step]!;
  const isLastStep = step === SIMPLE_PRODUCTION_STEPS.length - 1;
  const dialogueLines = parseDialogueScript(draft.dialogueScript);
  const exit = simpleProductionEditorExit();
  const handoff = isLastStep ? buildSimpleProductionHandoff(draft) : null;

  const cancelFromEffect = useEffectEvent(onCancel);
  const completeFromEffect = useEffectEvent(() => {
    if (!isLastStep) return;
    const built = buildSimpleProductionHandoff(draft);
    if (built) onComplete(built);
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const overlay = overlayRef.current;
    const inertStates: Array<readonly [HTMLElement, boolean]> = [];
    for (const child of document.body.children) {
      if (!(child instanceof HTMLElement) || child === overlay) continue;
      inertStates.push([child, child.inert]);
      child.inert = true;
    }

    const focusFrame = requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelFromEffect();
        return;
      }
      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        setStep((current) => clampSimpleProductionStep(current - 1));
        return;
      }
      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        setStep((current) => clampSimpleProductionStep(current + 1));
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        completeFromEffect();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []),
      ].filter((element) => !element.hidden);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      for (const [element, wasInert] of inertStates) element.inert = wasInert;
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  /** 다음 단계로 — 비어 있는 값이 있으면 기본값을 자동 적용하고 그 사실을 알린다. */
  function goNext(): void {
    const { draft: normalized, autoApplied } = applySimpleProductionDefaults(draft);
    setDraft(normalized);
    if (autoApplied.length > 0) {
      setNotice(creatorRestStatusText("creatorRest.status.wizard.defaultsApplied", "비어 있던 항목에 기본값이 자동 적용됐어요. 나중에 전문 에디터에서 바꿀 수 있습니다."));
    } else {
      setNotice("");
    }
    setStep((current) => clampSimpleProductionStep(current + 1));
  }

  function goPrev(): void {
    setNotice("");
    setStep((current) => clampSimpleProductionStep(current - 1));
  }

  function complete(): void {
    const built = buildSimpleProductionHandoff(draft);
    if (!built) {
      setNotice("조립할 수 없는 선택이 있어요. 배경 단계의 장면을 다시 골라 주세요.");
      setStep(0);
      return;
    }
    setDraft(built.draft);
    onComplete(built);
  }

  function openProEditorNow(): void {
    onOpenProEditor(applySimpleProductionDefaults(draft).draft);
  }

  const sceneOptions = simpleProductionBackgroundSceneOptions();
  const fillOptions = simpleProductionBackgroundFillOptions();
  const poseOptions = simpleProductionPoseOptions();
  const expressionOptions = simpleProductionExpressionOptions();
  const selectedScene =
    sceneOptions.find((template) => template.id === draft.backgroundSceneTemplateId) ?? null;
  const selectedEffect = findSimpleProductionEffect(draft.effectId);

  const content = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-5"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="간편 제작 위저드"
        data-studio-modal-owner="simple-production"
        tabIndex={-1}
        className="relative flex max-h-[calc(100dvh-env(safe-area-inset-top))] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-line bg-panel text-fg shadow-2xl sm:max-h-[min(50rem,calc(100dvh-2.5rem))] sm:rounded-2xl"
      >
        <header className="border-b border-line px-4 py-3.5 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-accent">
                <Sparkles size={13} aria-hidden="true" />
                간편 제작
              </p>
              <h2 className="mt-1 text-lg font-black text-fg">처음부터 한 컷씩 만들어요</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-fg-2">
                배경 → 캐릭터 → 대사 → 효과 순서로 진행합니다. 고르지 않은 항목은 기본값이
                자동 적용돼요.
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="간편 제작 위저드 취소"
              onClick={onCancel}
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={SIMPLE_PRODUCTION_STEPS.length}
              aria-valuenow={step + 1}
              aria-label={`진행 단계 ${step + 1}/${SIMPLE_PRODUCTION_STEPS.length}`}
              className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-card"
            >
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{
                  width: `${((step + 1) / SIMPLE_PRODUCTION_STEPS.length) * 100}%`,
                }}
              />
            </div>
            <p className="shrink-0 text-xs font-bold tabular-nums text-fg-2">
              {step + 1}/{SIMPLE_PRODUCTION_STEPS.length} · {currentStep.labelKo}
            </p>
          </div>

          <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label="제작 단계 순서">
            {SIMPLE_PRODUCTION_STEPS.map((item, index) => (
              <li
                key={item.id}
                aria-current={index === step ? "step" : undefined}
                className={cn(
                  "flex min-h-8 items-center justify-center gap-1 rounded-full border px-2 text-[0.7rem] font-bold",
                  index === step
                    ? "border-accent bg-accent-soft text-accent"
                    : index < step
                      ? "border-line bg-card text-fg-2"
                      : "border-line bg-card text-fg-3",
                )}
              >
                {index < step ? <Check size={12} aria-hidden="true" /> : null}
                {item.labelKo}
              </li>
            ))}
          </ol>
        </header>

        <div
          data-studio-simple-wizard-scroll-body="true"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5"
        >
          <p className="text-sm leading-relaxed text-fg-2">{currentStep.descriptionKo}</p>
          {notice ? (
            <p role="status" className="mt-3 rounded-xl border border-accent/40 bg-accent-soft px-3 py-2.5 text-xs font-semibold text-fg">
              {notice}
            </p>
          ) : null}

          {currentStep.id === "background" ? (
            <div className="mt-4 grid gap-5">
              <fieldset>
                <legend className="text-sm font-bold text-fg">장면 고르기</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="장면">
                  {sceneOptions.map((template) => {
                    const active = template.id === draft.backgroundSceneTemplateId;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            backgroundSceneTemplateId: template.id,
                          }))
                        }
                        className={cn(
                          OPTION_CLASS,
                          active
                            ? "border-accent bg-accent-soft"
                            : "border-line bg-card hover:bg-raised",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-fg">{template.label}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-fg-3">
                            {template.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-bold text-fg">배경색 고르기</legend>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="배경색">
                  {fillOptions.map((preset) => {
                    const active = preset.id === draft.backgroundPresetId;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() =>
                          setDraft((current) => ({ ...current, backgroundPresetId: preset.id }))
                        }
                        className={cn(
                          OPTION_CLASS,
                          "flex-col items-stretch gap-2",
                          active
                            ? "border-accent bg-accent-soft"
                            : "border-line bg-card hover:bg-raised",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className="block h-10 w-full rounded-md border border-line/60"
                          style={{ background: studioBackgroundPreviewCss(preset) }}
                        />
                        <span className="text-xs font-bold text-fg">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          ) : null}

          {currentStep.id === "character" ? (
            <div className="mt-4 grid gap-5">
              <div>
                <label htmlFor="simple-wizard-character-name" className="text-sm font-bold text-fg">
                  주인공 이름
                </label>
                <input
                  id="simple-wizard-character-name"
                  type="text"
                  value={draft.characterName}
                  maxLength={40}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, characterName: event.target.value }))
                  }
                  className="mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-panel px-3 text-sm font-semibold text-fg outline-none focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                />
                <p className="mt-1.5 text-xs text-fg-3">
                  캐릭터 한 명이 장면 가운데에 섭니다. 인물을 더 넣는 건 전문 에디터에서 할 수 있어요.
                </p>
              </div>
              <fieldset>
                <legend className="text-sm font-bold text-fg">포즈 고르기</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="포즈">
                  {poseOptions.map((preset) => {
                    const active = preset.id === draft.characterPoseRef;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() =>
                          setDraft((current) => ({ ...current, characterPoseRef: preset.id }))
                        }
                        className={cn(
                          OPTION_CLASS,
                          active
                            ? "border-accent bg-accent-soft"
                            : "border-line bg-card hover:bg-raised",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-fg">{preset.label}</span>
                          <span className="mt-0.5 block text-xs text-fg-3">{preset.tone}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-bold text-fg">표정 고르기</legend>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="표정">
                  {expressionOptions.map((preset) => {
                    const active = preset.id === draft.characterExpressionRef;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            characterExpressionRef: preset.id,
                          }))
                        }
                        className={cn(
                          OPTION_CLASS,
                          "flex-col items-center gap-1 text-center",
                          active
                            ? "border-accent bg-accent-soft"
                            : "border-line bg-card hover:bg-raised",
                        )}
                      >
                        <span aria-hidden="true" className="text-xl leading-none">
                          {preset.emoji}
                        </span>
                        <span className="text-xs font-bold text-fg">{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          ) : null}

          {currentStep.id === "dialogue" ? (
            <div className="mt-4">
              <label htmlFor="simple-wizard-dialogue" className="text-sm font-bold text-fg">
                웹툰 대사
              </label>
              <textarea
                id="simple-wizard-dialogue"
                aria-label="웹툰 대사"
                value={draft.dialogueScript}
                rows={6}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, dialogueScript: event.target.value }))
                }
                placeholder="주인공: 여기에 대사를 써요. 한 줄에 대사 하나씩요."
                className="mt-2 w-full rounded-xl border border-line-strong bg-panel px-3 py-2.5 text-sm leading-relaxed text-fg outline-none focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
              <p className="mt-2 flex items-center justify-between text-xs text-fg-3">
                <span>
                  형식은 <strong className="text-fg-2">이름: 대사</strong> — 한 줄에 하나씩
                  적으면 말풍선이 순서대로 붙습니다.
                </span>
                <span className="shrink-0 font-bold tabular-nums text-fg-2">
                  인식된 대사 {dialogueLines.length}개
                </span>
              </p>
              {draft.dialogueScript.trim() === "" ? (
                <p className="mt-2 rounded-xl border border-line bg-card px-3 py-2.5 text-xs font-semibold text-fg-2">
                  {creatorRestStatusText("creatorRest.status.wizard.emptyDialogue", "지금은 비어 있어요. 다음으로 넘어가면 시작 대사가 기본값으로 자동 적용됩니다.")}
                </p>
              ) : null}
            </div>
          ) : null}

          {currentStep.id === "effects" ? (
            <div className="mt-4 grid gap-5">
              <fieldset>
                <legend className="text-sm font-bold text-fg">효과 고르기</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="효과">
                  {SIMPLE_PRODUCTION_EFFECTS.map((effect) => {
                    const active = effect.id === draft.effectId;
                    return (
                      <button
                        key={effect.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            effectId: effect.id,
                            effectIntensity: effect.defaultIntensity,
                          }))
                        }
                        className={cn(
                          OPTION_CLASS,
                          active
                            ? "border-accent bg-accent-soft"
                            : "border-line bg-card hover:bg-raised",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-fg">{effect.labelKo}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-fg-3">
                            {effect.descriptionKo}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              {selectedEffect.effectRef ? (
                <div>
                  <label htmlFor="simple-wizard-effect-intensity" className="text-sm font-bold text-fg">
                    효과 세기 · {Math.round(draft.effectIntensity * 100)}%
                  </label>
                  <input
                    id="simple-wizard-effect-intensity"
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(draft.effectIntensity * 100)}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        effectIntensity: Number(event.target.value) / 100,
                      }))
                    }
                    className="mt-2 min-h-11 w-full accent-accent"
                  />
                </div>
              ) : null}

              <section
                aria-label="완성 요약"
                className="rounded-2xl border border-line bg-card p-3.5"
              >
                <h3 className="text-sm font-bold text-fg">이렇게 완성됩니다</h3>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-xl border border-line bg-panel px-2.5 py-2">
                    <dt className="text-fg-3">배경</dt>
                    <dd className="mt-0.5 font-bold text-fg">{selectedScene?.label ?? "-"}</dd>
                  </div>
                  <div className="rounded-xl border border-line bg-panel px-2.5 py-2">
                    <dt className="text-fg-3">캐릭터</dt>
                    <dd className="mt-0.5 font-bold text-fg">{draft.characterName}</dd>
                  </div>
                  <div className="rounded-xl border border-line bg-panel px-2.5 py-2">
                    <dt className="text-fg-3">대사</dt>
                    <dd className="mt-0.5 font-bold tabular-nums text-fg">
                      {handoff?.dialogueLineCount ?? dialogueLines.length}개
                    </dd>
                  </div>
                  <div className="rounded-xl border border-line bg-panel px-2.5 py-2">
                    <dt className="text-fg-3">효과</dt>
                    <dd className="mt-0.5 font-bold text-fg">{selectedEffect.labelKo}</dd>
                  </div>
                </dl>
                <p className="mt-2.5 text-xs leading-relaxed text-fg-3">
                  완성하면 이 내용이 페이지에 적용되고, 바로 전문 에디터에서 이어서 다듬을 수
                  있습니다. 여기서 만든 선택은 사라지지 않아요.
                </p>
              </section>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={openProEditorNow}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold text-fg-2 transition-colors hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <GraduationCap size={15} aria-hidden="true" />
            전문 에디터로 바로 가기
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 0}
            className={PREV_BUTTON_CLASS}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            이전
          </button>
          {isLastStep ? (
            <button
              type="button"
              onClick={complete}
              disabled={!handoff}
              className={NEXT_BUTTON_CLASS}
            >
              {exit.labelKo}
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" onClick={goNext} className={NEXT_BUTTON_CLASS}>
              다음
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          )}
        </footer>
      </div>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
