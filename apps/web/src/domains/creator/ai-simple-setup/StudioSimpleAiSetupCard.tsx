import "./ai-simple-setup.css";

import { ChevronDown, Cpu, ExternalLink, KeyRound, ShieldCheck, SlidersHorizontal, Sparkles } from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  AI_TASK_SMART_DEFAULTS,
  USER_BYOK_PROVIDER_GUIDES,
  clampMaxOutputTokens,
  clampTemperature,
  createDefaultAiSimplePreferences,
  createInitialAiWaterfallState,
  getUserByokProviderGuide,
  registerUserByokKeyInState,
  selectBestAvailableAiTier,
  validateUserByokKeyInput,
  type AiSimpleModePreferences,
  type AiTaskCategory,
  type AiTierAvailabilityStatus,
  type AiWaterfallRoutingDecision,
  type AiWaterfallState,
  type UserByokProviderId,
} from "./ai-quality-waterfall-engine";

export interface StudioSimpleAiKeyRegistrationPayload {
  readonly providerId: UserByokProviderId;
  /** 상위 보안 보관함·메모리 저장소로 위임되는 사용자 입력값(이 컴포넌트는 브라우저 영구 저장소에 기록하지 않는다). */
  readonly apiKey: string;
  readonly endpointUrl: string | null;
  readonly maskedFingerprint: string;
}

export interface StudioSimpleAiSetupCardProps {
  /** 외부 주입 워터폴 상태(미전달 시 무료 티어 정상 기본 상태로 초기화). */
  readonly initialState?: AiWaterfallState;
  /** 외부 제어 워터폴 상태(전달 시 controlled 모드로 동작). */
  readonly state?: AiWaterfallState;
  readonly initialPreferences?: Partial<AiSimpleModePreferences>;
  /** 사용자 API 키 검증 통과 시 상위 보안/메모리 설정으로 위임하는 콜백. */
  readonly onSaveUserApiKey?: (payload: StudioSimpleAiKeyRegistrationPayload) => void;
  readonly onContinueOfflineZeroCost?: (decision: AiWaterfallRoutingDecision) => void;
  readonly onPreferencesChange?: (next: AiSimpleModePreferences, decision: AiWaterfallRoutingDecision) => void;
  readonly className?: string;
}

const TIER_STATUS_LABEL_KO: Readonly<Record<AiTierAvailabilityStatus, string>> = Object.freeze({
  ready: "사용 가능",
  low: "여유 적음",
  exhausted: "소진됨",
  "user-key-required": "키 연결 대기",
});

const TIER_STATUS_TONE: Readonly<Record<AiTierAvailabilityStatus, "good" | "warn" | "bad" | "cool">> = Object.freeze({
  ready: "good",
  low: "warn",
  exhausted: "bad",
  "user-key-required": "cool",
});

const TASK_CATEGORIES: readonly AiTaskCategory[] = Object.freeze([
  "story-dialogue",
  "vision-reference",
  "code-script",
  "fast-assist",
]);

function formatTokenCount(tokens: number): string {
  return new Intl.NumberFormat("ko-KR").format(Math.max(0, Math.round(tokens)));
}

/**
 * 초보자용 AI 설정 초단순화 1-화면 카드.
 * - 기본 화면에는 큰 상태 배지, 단일 '자동 최상 품질' 스위치, 무료 토큰 진행 바만 노출한다.
 * - 1·2단계 무료 토큰이 모두 소진되면 즉시 원클릭 API 키 입력 배너(3초 도식 + 검증 + 오프라인 ₩0 전환)를 연다.
 * - 모델·온도·토큰·프롬프트 같은 고급 파라미터는 `<details>` 접힘 안에 숨긴다.
 */
export function StudioSimpleAiSetupCard({
  initialState,
  state: controlledState,
  initialPreferences,
  onSaveUserApiKey,
  onContinueOfflineZeroCost,
  onPreferencesChange,
  className = "",
}: StudioSimpleAiSetupCardProps) {
  const inputId = useId();
  const [internalState, setInternalState] = useState<AiWaterfallState>(() =>
    createInitialAiWaterfallState(initialState),
  );
  const effectiveState = controlledState ?? internalState;

  const [preferences, setPreferences] = useState<AiSimpleModePreferences>(() =>
    createDefaultAiSimplePreferences(initialPreferences),
  );
  const [manualByokDrawerOpen, setManualByokDrawerOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<UserByokProviderId>("gemini");
  const [keyInput, setKeyInput] = useState("");
  const [endpointInput, setEndpointInput] = useState("http://127.0.0.1:11434");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keySuccessNotice, setKeySuccessNotice] = useState<string | null>(null);

  const decision = useMemo(
    () => selectBestAvailableAiTier(effectiveState, preferences),
    [effectiveState, preferences],
  );
  const activeGuide = useMemo(() => getUserByokProviderGuide(selectedProvider), [selectedProvider]);
  const showByokBanner = decision.needsUserKeyPrompt || manualByokDrawerOpen;

  function updatePreferences(patch: Partial<AiSimpleModePreferences>) {
    const nextCategory = patch.taskCategory ?? preferences.taskCategory;
    const categoryChanged = nextCategory !== preferences.taskCategory;
    const taskDefault = AI_TASK_SMART_DEFAULTS[nextCategory];
    const nextPrefs: AiSimpleModePreferences = Object.freeze({
      ...preferences,
      ...patch,
      ...(categoryChanged
        ? {
            temperature: taskDefault.defaultTemperature,
            maxOutputTokens: taskDefault.defaultMaxOutputTokens,
            systemPromptNote: taskDefault.defaultSystemPromptNote,
          }
        : {}),
    });
    setPreferences(nextPrefs);
    const nextDecision = selectBestAvailableAiTier(effectiveState, nextPrefs);
    onPreferencesChange?.(nextPrefs, nextDecision);
  }

  function handleToggleAutoBestQuality() {
    updatePreferences({
      autoBestQuality: !preferences.autoBestQuality,
      preferOfflineZeroCost: false,
    });
  }

  function handleContinueOfflineMode() {
    const nextPrefs: AiSimpleModePreferences = Object.freeze({
      ...preferences,
      preferOfflineZeroCost: true,
    });
    setPreferences(nextPrefs);
    setManualByokDrawerOpen(false);
    setKeyError(null);
    const nextDecision = selectBestAvailableAiTier(effectiveState, nextPrefs);
    onPreferencesChange?.(nextPrefs, nextDecision);
    onContinueOfflineZeroCost?.(nextDecision);
  }

  function handleResumeFreeOrByok() {
    updatePreferences({ preferOfflineZeroCost: false });
  }

  function handleSubmitUserApiKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateUserByokKeyInput(
      selectedProvider,
      activeGuide.requiresEndpointUrl ? endpointInput : keyInput,
      endpointInput,
    );
    if (!validation.valid || !validation.maskedFingerprint) {
      setKeyError(validation.reasonKo ?? "입력값을 다시 확인해 주세요.");
      setKeySuccessNotice(null);
      return;
    }

    onSaveUserApiKey?.({
      providerId: selectedProvider,
      apiKey: activeGuide.requiresEndpointUrl ? "" : keyInput.trim(),
      endpointUrl: validation.normalizedEndpointUrl,
      maskedFingerprint: validation.maskedFingerprint,
    });

    const nextState = registerUserByokKeyInState(
      effectiveState,
      selectedProvider,
      validation,
      preferences.preferredModelOverride,
    );
    if (!controlledState) {
      setInternalState(nextState);
    }
    if (preferences.preferOfflineZeroCost) {
      const nextPrefs = Object.freeze({ ...preferences, preferOfflineZeroCost: false });
      setPreferences(nextPrefs);
      onPreferencesChange?.(nextPrefs, selectBestAvailableAiTier(nextState, nextPrefs));
    }
    setKeyInput("");
    setKeyError(null);
    setManualByokDrawerOpen(false);
    setKeySuccessNotice(
      `${activeGuide.labelKo} 연결을 마쳤어요(${validation.maskedFingerprint}). 키는 상위 보안 설정에 위임됩니다.`,
    );
  }

  return (
    <section
      className={`ai-simple-card ${className}`.trim()}
      data-testid="studio-simple-ai-setup-card"
      data-signal-tone={decision.signalTone}
      aria-label="초보자용 AI 설정 초단순화 및 무료 토큰 자동 전환"
    >
      <div className="ai-simple-body">
        <header className="ai-simple-hero">
          <div className="ai-simple-hero-main">
            <span className="ai-simple-emblem" aria-hidden="true">
              <img
                src="/assets/studio/vibrant-sprites/tool-ai-compass.webp"
                alt=""
                width={40}
                height={40}
                loading="lazy"
                decoding="async"
              />
            </span>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="ai-simple-status-badge"
                  data-testid="ai-simple-status-badge"
                  data-tone={decision.signalTone}
                  role="status"
                  aria-live="polite"
                >
                  <span className="ai-simple-status-dot" aria-hidden="true" />
                  {decision.headlineKo}
                </span>
                <span className="ai-simple-pill ai-simple-num" data-tone={decision.signalTone}>
                  활성 모델: {decision.effectiveModelId}
                </span>
              </div>
              <p className="text-xs leading-5 text-fg-2">{decision.sublineKo}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={preferences.autoBestQuality}
              data-testid="ai-auto-best-quality-switch"
              className="ai-simple-switch-btn"
              onClick={handleToggleAutoBestQuality}
            >
              <Sparkles className="size-4 text-accent" aria-hidden="true" />
              <span>자동 최상 품질</span>
              <span className="ai-simple-switch-track" aria-hidden="true">
                <span className="ai-simple-switch-thumb" />
              </span>
            </button>

            {preferences.preferOfflineZeroCost ? (
              <button
                type="button"
                className="ai-simple-action-btn"
                onClick={handleResumeFreeOrByok}
              >
                자동 품질 워터폴 복귀
              </button>
            ) : !showByokBanner ? (
              <button
                type="button"
                data-testid="ai-open-byok-banner-btn"
                className="ai-simple-action-btn"
                onClick={() => setManualByokDrawerOpen(true)}
              >
                <KeyRound className="size-4 text-accent" aria-hidden="true" />
                내 API 키 미리 연결
              </button>
            ) : null}
          </div>
        </header>

        <div className="ai-simple-meter-box">
          <div className="ai-simple-meter-head">
            <span className="text-xs font-bold text-fg">
              무료 크레딧 워터폴 잔여량 (품질 최우선 자동 전환)
            </span>
            <span className="ai-simple-num text-xs font-extrabold text-fg" data-testid="ai-free-remaining-summary">
              {decision.freePoolRemainingPercent}% · {formatTokenCount(decision.freePoolRemainingTokens)} /{" "}
              {formatTokenCount(decision.freePoolTotalTokens)} 토큰
            </span>
          </div>

          <div
            className="ai-simple-progress-track"
            role="progressbar"
            aria-label="남은 무료 AI 토큰 비율"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={decision.freePoolRemainingPercent}
          >
            <div
              className="ai-simple-progress-fill"
              data-tone={decision.signalTone}
              style={{ width: `${decision.freePoolRemainingPercent}%` }}
            />
          </div>

          <div className="ai-simple-tier-grid" role="list" aria-label="4단계 품질 우선 AI 워터폴">
            {decision.tiers.map((tier) => {
              const isActive = tier.tierId === decision.activeTierId;
              const statusTone = TIER_STATUS_TONE[tier.status];
              return (
                <article
                  key={tier.tierId}
                  role="listitem"
                  className="ai-simple-tier-tile"
                  data-active={isActive ? "true" : "false"}
                  data-testid={`ai-tier-card-${tier.tierId}`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xs font-extrabold text-fg">{tier.shortLabelKo}</span>
                    <span className="ai-simple-pill" data-tone={isActive ? "good" : statusTone}>
                      {isActive ? "현재 사용 중" : TIER_STATUS_LABEL_KO[tier.status]}
                    </span>
                  </div>
                  <p className="ai-simple-num text-[0.7rem] font-semibold text-fg-2">
                    {tier.totalTokens > 0
                      ? `${formatTokenCount(tier.remainingTokens)} / ${formatTokenCount(tier.totalTokens)} 토큰`
                      : tier.resetWindowKo}
                  </p>
                  <p className="text-[0.6875rem] leading-4 text-fg-3">{tier.modelId}</p>
                </article>
              );
            })}
          </div>
        </div>

        {keySuccessNotice ? (
          <p role="status" data-testid="ai-byok-success-notice" className="flex items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-semibold text-good">
            <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
            <span>{keySuccessNotice}</span>
          </p>
        ) : null}

        {showByokBanner ? (
          <section
            className="ai-simple-byok-banner"
            data-testid="ai-byok-exhausted-banner"
            data-urgent={decision.needsUserKeyPrompt ? "true" : "false"}
            aria-label="내 API 키 원클릭 연결 안내"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <h3 className="flex items-center gap-1.5 text-sm font-black text-fg">
                  <KeyRound className="size-4 text-accent" aria-hidden="true" />
                  {decision.needsUserKeyPrompt
                    ? "무료 토큰이 모두 소진됐어요 — 3초 만에 내 키를 연결하거나 오프라인 ₩0로 이어가세요"
                    : "내 API 키(BYOK) 바로 연결하기"}
                </h3>
                <p className="text-xs leading-5 text-fg-2">
                  키는 브라우저 저장소에 직접 쓰지 않고 상위 메모리·보안 설정에만 안전하게 위임합니다.
                </p>
              </div>
              {!decision.needsUserKeyPrompt ? (
                <button
                  type="button"
                  className="ai-simple-action-btn"
                  onClick={() => setManualByokDrawerOpen(false)}
                >
                  배너 닫기
                </button>
              ) : null}
            </div>

            <div className="ai-simple-provider-row" role="group" aria-label="API 키 공급자 선택">
              {USER_BYOK_PROVIDER_GUIDES.map((guide) => (
                <button
                  key={guide.id}
                  type="button"
                  aria-pressed={selectedProvider === guide.id}
                  data-testid={`ai-byok-provider-${guide.id}`}
                  className="ai-simple-provider-btn"
                  onClick={() => {
                    setSelectedProvider(guide.id);
                    setKeyError(null);
                  }}
                >
                  <span>{guide.labelKo}</span>
                  <span className="ai-simple-pill" data-tone={guide.hasFreeTier ? "good" : "cool"}>
                    {guide.freeTierBadgeKo}
                  </span>
                </button>
              ))}
            </div>

            <ol className="ai-simple-steps-flow" aria-label="무료 API 키 발급 3초 도식 안내">
              {activeGuide.stepsKo.map((stepText, index) => (
                <li key={stepText} className="ai-simple-step-item">
                  <span className="ai-simple-step-index ai-simple-num" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>{stepText}</span>
                </li>
              ))}
            </ol>

            <form className="space-y-3" onSubmit={handleSubmitUserApiKey}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2">
                <label htmlFor={`${inputId}-byok-input`} className="font-bold text-fg">
                  {activeGuide.requiresEndpointUrl
                    ? `${activeGuide.labelKo} 로컬 서버 주소`
                    : `${activeGuide.labelKo} API 키 입력`}
                </label>
                <a
                  href={activeGuide.signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 font-bold text-accent hover:underline"
                >
                  {activeGuide.signupHostLabel}에서 발급받기
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                </a>
              </div>

              <input
                id={`${inputId}-byok-input`}
                data-testid="ai-byok-key-input"
                type={activeGuide.requiresEndpointUrl ? "url" : "password"}
                value={activeGuide.requiresEndpointUrl ? endpointInput : keyInput}
                onChange={(event) => {
                  if (activeGuide.requiresEndpointUrl) {
                    setEndpointInput(event.target.value);
                  } else {
                    setKeyInput(event.target.value);
                  }
                  setKeyError(null);
                }}
                placeholder={activeGuide.keyFormatHintKo}
                autoComplete="off"
                spellCheck={false}
                className="ai-simple-input"
              />

              {keyError ? (
                <p role="alert" data-testid="ai-byok-error" className="text-xs font-bold text-bad">
                  {keyError}
                </p>
              ) : null}

              <div className="ai-simple-actions-row">
                <button
                  type="submit"
                  data-testid="ai-byok-submit-btn"
                  data-variant="primary"
                  className="ai-simple-action-btn"
                >
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  키 검증 후 바로 연결
                </button>
                <button
                  type="button"
                  data-testid="ai-continue-offline-btn"
                  data-variant="offline"
                  className="ai-simple-action-btn"
                  onClick={handleContinueOfflineMode}
                >
                  <Cpu className="size-4" aria-hidden="true" />
                  오프라인 ₩0 로컬 모드로 계속하기
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <details className="ai-simple-details" data-testid="ai-simple-advanced-details">
          <summary className="ai-simple-details-summary">
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-fg-3" aria-hidden="true" />
              <span>고급 설정 · 작업별 모델 · 온도 · 프롬프트 (초보자는 열지 않아도 됩니다)</span>
            </span>
            <ChevronDown className="size-4 text-fg-3" aria-hidden="true" />
          </summary>

          <div className="ai-simple-details-body">
            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-fg-2">작업 유형 스마트 기본값</span>
              <div className="ai-simple-provider-row" role="group" aria-label="작업 유형 선택">
                {TASK_CATEGORIES.map((category) => {
                  const task = AI_TASK_SMART_DEFAULTS[category];
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={preferences.taskCategory === category}
                      data-testid={`ai-task-category-${category}`}
                      className="ai-simple-provider-btn"
                      onClick={() => updatePreferences({ taskCategory: category })}
                    >
                      {task.labelKo}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-fg-3">{AI_TASK_SMART_DEFAULTS[preferences.taskCategory].summaryKo}</p>
            </div>

            <div className="ai-simple-advanced-grid">
              <label htmlFor={`${inputId}-model-override`} className="space-y-1 text-xs font-bold text-fg-2">
                <span>수동 모델 지정 (자동 최상 품질 꺼짐 시 적용)</span>
                <input
                  id={`${inputId}-model-override`}
                  type="text"
                  disabled={preferences.autoBestQuality}
                  value={preferences.preferredModelOverride ?? ""}
                  onChange={(event) => updatePreferences({ preferredModelOverride: event.target.value || null })}
                  placeholder={decision.activeTier.modelId}
                  className="ai-simple-input"
                />
              </label>

              <label htmlFor={`${inputId}-temperature`} className="space-y-1 text-xs font-bold text-fg-2">
                <span className="ai-simple-num">
                  창의성 온도 (Temperature): {decision.effectiveTemperature.toFixed(2)}
                </span>
                <input
                  id={`${inputId}-temperature`}
                  type="range"
                  min={0}
                  max={1.2}
                  step={0.05}
                  disabled={preferences.autoBestQuality}
                  value={preferences.temperature}
                  onChange={(event) => updatePreferences({ temperature: clampTemperature(Number(event.target.value)) })}
                  className="min-h-11 w-full accent-accent"
                />
              </label>

              <label htmlFor={`${inputId}-max-tokens`} className="space-y-1 text-xs font-bold text-fg-2">
                <span className="ai-simple-num">최대 응답 길이 (토큰): {decision.effectiveMaxOutputTokens}</span>
                <input
                  id={`${inputId}-max-tokens`}
                  type="number"
                  min={128}
                  max={8192}
                  step={128}
                  disabled={preferences.autoBestQuality}
                  value={preferences.maxOutputTokens}
                  onChange={(event) => updatePreferences({ maxOutputTokens: clampMaxOutputTokens(Number(event.target.value)) })}
                  className="ai-simple-input ai-simple-num"
                />
              </label>

              <label htmlFor={`${inputId}-prompt-note`} className="space-y-1 text-xs font-bold text-fg-2">
                <span>기본 지시 메모 (System Prompt)</span>
                <input
                  id={`${inputId}-prompt-note`}
                  type="text"
                  disabled={preferences.autoBestQuality}
                  value={preferences.systemPromptNote}
                  onChange={(event) => updatePreferences({ systemPromptNote: event.target.value })}
                  className="ai-simple-input"
                />
              </label>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
