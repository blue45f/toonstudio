import {
  CheckCircle2,
  ChevronDown,
  PencilLine,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useCallback, useId, useMemo, useRef, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  SMART_FORM_WORKFLOW_IDS,
  SMART_FORM_WORKFLOW_SCHEMAS,
  applySmartFormRecommendations,
  countAiFilledOptionalFields,
  createInitialSmartFormState,
  enhanceRecommendationsWithZeroBillAi,
  generateSmartFormRecommendations,
  restoreSingleFieldAiSuggestion,
  undoSmartFormAutofill,
  updateOptionalFieldValue,
  updateRequiredFieldValue,
  validateMinimalFormSubmission,
  type SmartFormFieldDefinition,
  type SmartFormState,
  type SmartFormWorkflowId,
  type ZeroBillAssistRunner,
} from "./minimal-required-form-engine";

export interface SmartFormAppliedPayload {
  readonly workflowId: SmartFormWorkflowId;
  readonly requiredValues: Readonly<Record<string, string>>;
  readonly optionalValues: Readonly<Record<string, string>>;
  readonly genre: string | null;
  readonly targetPlatformSpec: string | null;
}

export interface StudioSmartAutofillAssistantCardProps {
  readonly initialWorkflowId?: SmartFormWorkflowId;
  readonly initialPrompt?: string;
  readonly assistRunner?: ZeroBillAssistRunner;
  readonly onApplyRecommendation?: (payload: SmartFormAppliedPayload) => void;
  readonly className?: string;
}

function buildInitialState(
  workflowId: SmartFormWorkflowId,
  initialPrompt?: string,
): SmartFormState {
  const base = createInitialSmartFormState(workflowId);
  const trimmed = initialPrompt?.trim();
  if (!trimmed) return base;
  const firstRequired = SMART_FORM_WORKFLOW_SCHEMAS[workflowId].requiredFields[0];
  if (!firstRequired) return base;
  return updateRequiredFieldValue(base, firstRequired.id, trimmed);
}

export function StudioSmartAutofillAssistantCard({
  initialWorkflowId = "project-create",
  initialPrompt,
  assistRunner,
  onApplyRecommendation,
  className,
}: StudioSmartAutofillAssistantCardProps) {
  const bt = useBilingual("StudioSmartAutofillAssistantCard");
  const baseId = useId();
  const [state, setState] = useState<SmartFormState>(() =>
    buildInitialState(initialWorkflowId, initialPrompt),
  );
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [missingFieldIds, setMissingFieldIds] = useState<readonly string[]>([]);
  const [validationBannerKo, setValidationBannerKo] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);

  const requiredInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const optionalInputRefs = useRef<
    Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>
  >({});

  const schema = SMART_FORM_WORKFLOW_SCHEMAS[state.workflowId];
  const aiFilledCount = useMemo(() => countAiFilledOptionalFields(state), [state]);
  const optionalTotalCount = schema.optionalFields.length;
  const manualEditedCount = useMemo(
    () =>
      Object.values(state.fieldOrigins).filter((origin) => origin === "user-edited").length,
    [state.fieldOrigins],
  );

  const handleSelectWorkflow = useCallback((nextWorkflowId: SmartFormWorkflowId) => {
    setState(createInitialSmartFormState(nextWorkflowId));
    setOptionalOpen(false);
    setMissingFieldIds([]);
    setValidationBannerKo(null);
  }, []);

  const handleRequiredChange = useCallback((fieldId: string, value: string) => {
    setState((prev) => updateRequiredFieldValue(prev, fieldId, value));
    setMissingFieldIds((prev) => prev.filter((id) => id !== fieldId));
    setValidationBannerKo(null);
  }, []);

  const handleOptionalChange = useCallback((fieldId: string, value: string) => {
    setState((prev) => updateOptionalFieldValue(prev, fieldId, value));
  }, []);

  const handleApplySample = useCallback(
    (sampleText: string) => {
      setState((prev) => {
        const currentSchema = SMART_FORM_WORKFLOW_SCHEMAS[prev.workflowId];
        if (prev.workflowId === "team-division-invite") {
          let next = prev;
          if (!(next.requiredValues.inviteTarget?.trim())) {
            next = updateRequiredFieldValue(next, "inviteTarget", "김채색");
          }
          return updateRequiredFieldValue(next, "teamNeed", sampleText);
        }
        const firstField = currentSchema.requiredFields[0];
        return firstField ? updateRequiredFieldValue(prev, firstField.id, sampleText) : prev;
      });
      setMissingFieldIds([]);
      setValidationBannerKo(null);
    },
    [],
  );

  const focusFirstMissing = useCallback((ids: readonly string[]) => {
    const first = ids[0];
    if (first) {
      requiredInputRefs.current[first]?.focus();
    }
  }, []);

  const handleLocalAutofill = useCallback(() => {
    const validation = validateMinimalFormSubmission(state);
    if (!validation.valid) {
      setMissingFieldIds(validation.missingFieldIds);
      setValidationBannerKo(validation.messageKo);
      focusFirstMissing(validation.missingFieldIds);
      return;
    }
    const result = generateSmartFormRecommendations({
      workflowId: state.workflowId,
      requiredValues: state.requiredValues,
    });
    setMissingFieldIds([]);
    setValidationBannerKo(null);
    setState((prev) => applySmartFormRecommendations(prev, result));
    if (result.hasEnoughContext) {
      setOptionalOpen(true);
    }
  }, [focusFirstMissing, state]);

  const handleZeroBillCascadeEnhance = useCallback(async () => {
    const validation = validateMinimalFormSubmission(state);
    if (!validation.valid) {
      setMissingFieldIds(validation.missingFieldIds);
      setValidationBannerKo(validation.messageKo);
      focusFirstMissing(validation.missingFieldIds);
      return;
    }
    setEnhancing(true);
    setMissingFieldIds([]);
    setValidationBannerKo(null);
    try {
      const result = await enhanceRecommendationsWithZeroBillAi({
        workflowId: state.workflowId,
        requiredValues: state.requiredValues,
        assistRunner,
      });
      setState((prev) => applySmartFormRecommendations(prev, result));
      if (result.hasEnoughContext) {
        setOptionalOpen(true);
      }
    } finally {
      setEnhancing(false);
    }
  }, [assistRunner, focusFirstMissing, state]);

  const handleUndo = useCallback(() => {
    setState((prev) => undoSmartFormAutofill(prev));
  }, []);

  const handleKeepAiSuggestion = useCallback((fieldId: string) => {
    setState((prev) => restoreSingleFieldAiSuggestion(prev, fieldId));
  }, []);

  const handleManualEditFocus = useCallback((fieldId: string) => {
    setOptionalOpen(true);
    const control = optionalInputRefs.current[fieldId];
    if (control) {
      control.focus();
    }
  }, []);

  const handleApplyToHost = useCallback(() => {
    const validation = validateMinimalFormSubmission(state);
    if (!validation.valid) {
      setMissingFieldIds(validation.missingFieldIds);
      setValidationBannerKo(validation.messageKo);
      focusFirstMissing(validation.missingFieldIds);
      return;
    }
    setMissingFieldIds([]);
    setValidationBannerKo(validation.messageKo);
    onApplyRecommendation?.({
      workflowId: state.workflowId,
      requiredValues: state.requiredValues,
      optionalValues: state.optionalValues,
      genre: state.optionalValues.genre || state.recommendations.genre?.value || null,
      targetPlatformSpec:
        state.optionalValues.targetPlatformSpec ||
        state.recommendations.targetPlatformSpec?.value ||
        null,
    });
  }, [focusFirstMissing, onApplyRecommendation, state]);

  const renderOptionalInput = (field: SmartFormFieldDefinition, inputId: string) => {
    const value = state.optionalValues[field.id] ?? "";
    const commonClassName =
      "mt-2 min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 text-sm text-fg transition-colors duration-150 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";

    if (field.kind === "select" && field.options && field.options.length > 0) {
      return (
        <select
          id={inputId}
          ref={(node) => {
            optionalInputRefs.current[field.id] = node;
          }}
          value={value}
          onChange={(event) => handleOptionalChange(field.id, event.target.value)}
          className={commonClassName}
        >
          <option value="">{field.placeholderKo}</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    if (field.kind === "textarea") {
      return (
        <textarea
          id={inputId}
          ref={(node) => {
            optionalInputRefs.current[field.id] = node;
          }}
          rows={3}
          value={value}
          placeholder={field.placeholderKo}
          onChange={(event) => handleOptionalChange(field.id, event.target.value)}
          className={cn(commonClassName, "leading-relaxed")}
        />
      );
    }

    return (
      <input
        id={inputId}
        ref={(node) => {
          optionalInputRefs.current[field.id] = node;
        }}
        type="text"
        value={value}
        placeholder={field.placeholderKo}
        onChange={(event) => handleOptionalChange(field.id, event.target.value)}
        className={commonClassName}
      />
    );
  };

  return (
    <section
      aria-label={bt("필수항목 최소화 AI 자동 채우기 도우미", "Minimal Required Form AI Autofill")}
      data-testid="smart-form-autofill-card"
      className={cn(
        "rounded-3xl border border-line-strong/70 bg-card p-4 text-fg shadow-sm sm:p-5",
        className,
      )}
    >
      {/* 초보자 친화 안내 배너 */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-accent/35 bg-accent-soft/65 p-3.5">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-xs font-extrabold text-accent [word-break:keep-all]">
            <Sparkles size={14} aria-hidden="true" />
            <span>
              {bt(
                "필수 1개만 입력하면 나머지는 AI가 채워드립니다",
                "Fill just 1 required field and let AI complete the rest",
              )}
            </span>
          </p>
          <h3 className="mt-1 text-base font-black text-fg [word-break:keep-all]">
            {schema.headlineKo}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-fg-2 [word-break:keep-all]">
            {schema.summaryKo}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            data-testid="smart-form-zero-cost-badge"
            className="inline-flex items-center gap-1 rounded-full border border-good/40 bg-good-soft px-2.5 py-1 text-xs font-bold text-good tabular-nums"
          >
            <ShieldCheck size={13} aria-hidden="true" />
            {bt("외부 유료 과금 ₩0", "Zero Paid Billing ₩0")}
          </span>
          <span
            data-testid="smart-form-field-ratio-badge"
            className="inline-flex items-center rounded-full border border-line bg-panel px-2.5 py-1 text-xs font-bold text-fg-2 tabular-nums"
          >
            {`필수 ${schema.requiredFields.length}개 · 선택 ${optionalTotalCount}개`}
          </span>
        </div>
      </div>

      {/* 5대 핵심 워크플로 전환 탭 */}
      <div
        role="tablist"
        aria-label={bt("스마트 폼 워크플로 선택", "Select smart form workflow")}
        className="mt-4 flex flex-wrap gap-2"
      >
        {SMART_FORM_WORKFLOW_IDS.map((workflowId) => {
          const item = SMART_FORM_WORKFLOW_SCHEMAS[workflowId];
          const selected = state.workflowId === workflowId;
          return (
            <button
              key={workflowId}
              id={`${baseId}-tab-${workflowId}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${workflowId}`}
              data-testid={`smart-form-tab-${workflowId}`}
              onClick={() => handleSelectWorkflow(workflowId)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors duration-150 [word-break:keep-all] motion-reduce:transition-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                selected
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-line bg-panel text-fg-2 hover:border-accent/50 hover:bg-raised hover:text-fg",
              )}
            >
              <span>{bt(item.tabLabelKo, item.tabLabelEn)}</span>
              <span className="rounded-md bg-card px-1.5 py-0.5 text-xs font-extrabold text-accent tabular-nums">
                {`필수 ${item.requiredFields.length}`}
              </span>
            </button>
          );
        })}
      </div>

      {/* 활성 워크플로 본문 */}
      <div
        id={`${baseId}-panel-${state.workflowId}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${state.workflowId}`}
        className="mt-4 space-y-4"
      >
        {/* 필수 1~2칸 상단 집중 구역 */}
        <div
          data-testid="smart-form-required-zone"
          className="rounded-2xl border border-line bg-panel p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-fg [word-break:keep-all]">
              <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-black text-on-accent tabular-nums">
                {`필수 ${schema.requiredFields.length}개`}
              </span>
              <span>{bt("여기만 채우면 바로 시작할 수 있어요", "Only this section is required")}</span>
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {schema.requiredFields.map((field) => {
              const inputId = `${baseId}-req-${field.id}`;
              const errorId = `${baseId}-req-err-${field.id}`;
              const isMissing = missingFieldIds.includes(field.id);
              return (
                <div
                  key={field.id}
                  className={cn(schema.requiredFields.length === 1 && "sm:col-span-2")}
                >
                  <label
                    htmlFor={inputId}
                    className="flex items-center gap-1.5 text-sm font-bold text-fg [word-break:keep-all]"
                  >
                    <span>{bt(field.labelKo, field.labelEn)}</span>
                    <span className="text-accent" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <input
                    id={inputId}
                    ref={(node) => {
                      requiredInputRefs.current[field.id] = node;
                    }}
                    type="text"
                    aria-required="true"
                    aria-invalid={isMissing || undefined}
                    aria-describedby={isMissing ? errorId : undefined}
                    data-testid={`smart-form-required-input-${field.id}`}
                    value={state.requiredValues[field.id] ?? ""}
                    placeholder={field.placeholderKo}
                    onChange={(event) => handleRequiredChange(field.id, event.target.value)}
                    className={cn(
                      "mt-1.5 min-h-11 w-full rounded-xl border bg-card px-3.5 py-2 text-sm font-semibold text-fg transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
                      isMissing ? "border-danger" : "border-line-strong focus-visible:border-accent",
                    )}
                  />
                  <p className="mt-1.5 text-xs text-fg-3 [word-break:keep-all]">{field.helperKo}</p>
                  {isMissing ? (
                    <p
                      id={errorId}
                      role="alert"
                      className="mt-1 text-xs font-bold text-danger [word-break:keep-all]"
                    >
                      {`${field.labelKo} 항목을 한 줄만 입력해 주세요.`}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* 1탭 예시 입력 칩 */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-fg-3">
              {bt("예시 한 줄 넣어보기:", "Try an example:")}
            </span>
            {schema.sampleInputsKo.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => handleApplySample(sample)}
                className="inline-flex min-h-11 items-center rounded-xl border border-line bg-card px-3 py-1.5 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:border-accent/60 hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all] motion-reduce:transition-none"
              >
                {sample}
              </button>
            ))}
          </div>
        </div>

        {/* AI 권장 채우기 & Undo 컨트롤 바 */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="smart-form-autofill-btn"
            onClick={handleLocalAutofill}
            className={buttonClass({
              variant: "solid",
              className: "min-h-11 px-4 text-sm font-extrabold [word-break:keep-all]",
            })}
          >
            <Wand2 size={16} aria-hidden="true" />
            <span>{bt("AI 권장값 한 번에 채우기", "Fill Recommended Values with AI")}</span>
          </button>

          <button
            type="button"
            disabled={enhancing}
            data-testid="smart-form-cascade-btn"
            onClick={() => {
              void handleZeroBillCascadeEnhance();
            }}
            className={buttonClass({
              variant: "outline",
              className: "min-h-11 px-3.5 text-xs font-bold [word-break:keep-all]",
            })}
          >
            <Sparkles size={15} aria-hidden="true" />
            <span>
              {enhancing
                ? bt("₩0 무료 AI로 보강 중…", "Enhancing with ₩0 AI…")
                : bt("₩0 무료 AI 심화 보강", "Enhance with ₩0 Free AI")}
            </span>
          </button>

          <button
            type="button"
            disabled={state.undoStack.length === 0}
            data-testid="smart-form-undo-btn"
            onClick={handleUndo}
            className={buttonClass({
              variant: "outline",
              className: "min-h-11 px-3.5 text-xs font-bold tabular-nums [word-break:keep-all]",
            })}
          >
            <RotateCcw size={15} aria-hidden="true" />
            <span>
              {state.undoStack.length > 0
                ? `이전으로 되돌리기 (${state.undoStack.length})`
                : bt("이전으로 되돌리기", "Undo Autofill")}
            </span>
          </button>

          {onApplyRecommendation ? (
            <button
              type="button"
              data-testid="smart-form-apply-host-btn"
              onClick={handleApplyToHost}
              className={buttonClass({
                variant: "ghost",
                className: "ml-auto min-h-11 border border-accent/40 px-3.5 text-xs font-bold text-accent [word-break:keep-all]",
              })}
            >
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>{schema.submitLabelKo}</span>
            </button>
          ) : null}
        </div>

        {/* 라이브 상태 / 검증 안내 */}
        {validationBannerKo ? (
          <p
            role="alert"
            data-testid="smart-form-validation-banner"
            className="rounded-xl border border-danger/45 bg-danger-soft px-3.5 py-2.5 text-xs font-bold text-danger [word-break:keep-all]"
          >
            {validationBannerKo}
          </p>
        ) : null}

        {state.lastNoticeKo ? (
          <p
            role="status"
            aria-live="polite"
            data-testid="smart-form-status-banner"
            className="rounded-xl border border-good/35 bg-good-soft px-3.5 py-2.5 text-xs font-semibold text-fg tabular-nums [word-break:keep-all]"
          >
            {`${state.lastNoticeKo} · 과금 ₩0`}
          </p>
        ) : null}

        {/* 점진적 공개 (<details>) 선택 항목 영역 */}
        <details
          data-testid="smart-form-optional-details"
          open={optionalOpen}
          onToggle={(event) => setOptionalOpen(event.currentTarget.open)}
          className="rounded-2xl border border-line bg-panel/75 p-3.5"
        >
          <summary
            data-testid="smart-form-optional-summary"
            className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-xl px-1 text-sm font-extrabold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent tabular-nums [word-break:keep-all]"
          >
            <span className="inline-flex items-center gap-2">
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={cn(
                  "shrink-0 text-accent transition-transform duration-150 motion-reduce:transition-none",
                  optionalOpen && "rotate-180",
                )}
              />
              <span>
                {`선택 항목 ${optionalTotalCount}개 보기 (AI 권장 채움 ${aiFilledCount}개)`}
              </span>
            </span>
            <span className="shrink-0 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-bold text-fg-2 tabular-nums">
              {manualEditedCount > 0
                ? `직접 수정 ${manualEditedCount}개`
                : bt("안 채워도 진행 가능", "All optional")}
            </span>
          </summary>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {schema.optionalFields.map((field) => {
              const inputId = `${baseId}-opt-${field.id}`;
              const origin = state.fieldOrigins[field.id] ?? "empty";
              const rec = state.recommendations[field.id];
              const isAiFilled = origin === "ai-suggested";
              const isUserEdited = origin === "user-edited";

              return (
                <div
                  key={field.id}
                  data-testid={`smart-form-optional-field-${field.id}`}
                  className={cn(
                    "rounded-2xl border p-3.5 transition-colors duration-150 motion-reduce:transition-none",
                    isAiFilled
                      ? "border-good/40 bg-card"
                      : isUserEdited
                        ? "border-cool/45 bg-card"
                        : "border-line bg-card/85",
                    field.kind === "textarea" && "md:col-span-2",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor={inputId}
                      className="inline-flex items-center gap-1.5 text-xs font-extrabold text-fg [word-break:keep-all]"
                    >
                      <span>{bt(field.labelKo, field.labelEn)}</span>
                      <span className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-xs font-semibold text-fg-3">
                        {bt("선택", "Optional")}
                      </span>
                    </label>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {isAiFilled ? (
                        <span
                          data-testid={`smart-form-ai-badge-${field.id}`}
                          className="inline-flex items-center gap-1 rounded-full border border-good/40 bg-good-soft px-2 py-0.5 text-xs font-bold text-good tabular-nums"
                        >
                          <Sparkles size={12} aria-hidden="true" />
                          <span>{bt("AI 권장 채움", "AI Filled")}</span>
                          {rec ? <span>{`${Math.round(rec.confidence * 100)}%`}</span> : null}
                        </span>
                      ) : null}

                      {isUserEdited ? (
                        <span
                          data-testid={`smart-form-manual-badge-${field.id}`}
                          className="inline-flex items-center gap-1 rounded-full border border-cool/40 bg-info-soft px-2 py-0.5 text-xs font-bold text-cool"
                        >
                          {bt("직접 수정됨", "Edited")}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {renderOptionalInput(field, inputId)}

                  {rec ? (
                    <p
                      data-testid={`smart-form-reason-${field.id}`}
                      className="mt-2 text-xs leading-relaxed text-fg-2 [word-break:keep-all]"
                    >
                      {`추천 사유: ${rec.reasonKo}`}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-fg-3 [word-break:keep-all]">{field.helperKo}</p>
                  )}

                  {rec?.tagsPreview && rec.tagsPreview.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="추천 태그 미리보기">
                      {rec.tagsPreview.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-accent/35 bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={!rec}
                      data-testid={`smart-form-keep-ai-${field.id}`}
                      onClick={() => handleKeepAiSuggestion(field.id)}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 [word-break:keep-all] motion-reduce:transition-none",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                        isAiFilled
                          ? "border-good/50 bg-good-soft text-good"
                          : "border-line bg-panel text-fg-2 hover:border-accent/50 hover:text-fg",
                      )}
                    >
                      <CheckCircle2 size={13} aria-hidden="true" />
                      <span>
                        {isAiFilled
                          ? bt("AI 제안 유지 중", "Keeping AI suggestion")
                          : bt("AI 제안 유지", "Keep AI suggestion")}
                      </span>
                    </button>

                    <button
                      type="button"
                      data-testid={`smart-form-edit-manual-${field.id}`}
                      onClick={() => handleManualEditFocus(field.id)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-1.5 text-xs font-bold text-fg-2 transition-colors duration-150 hover:border-accent/50 hover:bg-raised hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all] motion-reduce:transition-none"
                    >
                      <PencilLine size={13} aria-hidden="true" />
                      <span>{bt("직접 수정", "Edit directly")}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      </div>
    </section>
  );
}

export default StudioSmartAutofillAssistantCard;
