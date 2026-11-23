// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioSimpleAiSetupCard,
  USER_BYOK_PROVIDER_GUIDES,
  classifyQuotaStatus,
  consumeFreeTierTokens,
  createDefaultAiSimplePreferences,
  createInitialAiWaterfallState,
  registerUserByokKeyInState,
  selectBestAvailableAiTier,
  validateUserByokKeyInput,
  type StudioSimpleAiKeyRegistrationPayload,
} from "./index";

afterEach(cleanup);

describe("ai-quality-waterfall-engine (품질 최우선 무료 워터폴 라우터)", () => {
  it("무료 풀이 넉넉하면 Tier 1(Google Gemini 무료 최상위)을 품질 최우선으로 선택한다", () => {
    const state = createInitialAiWaterfallState();
    const decision = selectBestAvailableAiTier(state, createDefaultAiSimplePreferences());

    expect(decision.activeTierId).toBe("tier-1-gemini-free");
    expect(decision.activeTier.qualityScore).toBeGreaterThan(90);
    expect(decision.activeTier.costKrwPerRequest).toBe(0);
    expect(decision.needsUserKeyPrompt).toBe(false);
    expect(decision.allFreeTiersExhausted).toBe(false);
    expect(decision.signalTone).toBe("good");
    expect(decision.headlineKo).toBe("최상 품질 무료 AI 사용 가능");
    expect(decision.freePoolRemainingPercent).toBe(100);
  });

  it("Tier 1 무료 토큰이 소진되면 Tier 2(OpenRouter 고성능 무료)로 자동 승계한다", () => {
    const initial = createInitialAiWaterfallState({
      tier1GeminiFree: { totalTokens: 100_000, remainingTokens: 10_000 },
      tier2OpenRouterFree: { totalTokens: 80_000, remainingTokens: 80_000 },
    });

    const consumed = consumeFreeTierTokens(initial, 15_000);
    expect(consumed.deductedFromTier1).toBe(10_000);
    expect(consumed.deductedFromTier2).toBe(5_000);
    expect(consumed.cascadedToTier2).toBe(true);
    expect(consumed.exhaustedAllFreeTiers).toBe(false);

    const decision = selectBestAvailableAiTier(
      consumed.nextState,
      createDefaultAiSimplePreferences({ taskCategory: "code-script" }),
    );
    expect(decision.activeTierId).toBe("tier-2-openrouter-free");
    expect(decision.effectiveModelId).toBe("qwen/qwen3-coder:free");
    expect(decision.needsUserKeyPrompt).toBe(false);
    expect(decision.tiers[0]?.status).toBe("exhausted");
    expect(decision.tiers[1]?.status).toBe("ready");
  });

  it("Tier 1·2 무료 토큰이 모두 소진되면 needsUserKeyPrompt=true를 반환하고 오프라인 ₩0 폴백을 대기시킨다", () => {
    const initial = createInitialAiWaterfallState({
      tier1GeminiFree: { totalTokens: 100_000, remainingTokens: 5_000 },
      tier2OpenRouterFree: { totalTokens: 50_000, remainingTokens: 5_000 },
    });

    const consumed = consumeFreeTierTokens(initial, 20_000);
    expect(consumed.exhaustedAllFreeTiers).toBe(true);
    expect(consumed.unfulfilledTokens).toBe(10_000);

    const decision = selectBestAvailableAiTier(consumed.nextState);
    expect(decision.allFreeTiersExhausted).toBe(true);
    expect(decision.needsUserKeyPrompt).toBe(true);
    expect(decision.activeTierId).toBe("tier-4-local-offline");
    expect(decision.signalTone).toBe("bad");
    expect(decision.headlineKo).toBe("무료 토큰 모두 소진 — 내 API 키 연결 필요");
    expect(decision.freePoolRemainingPercent).toBe(0);
  });

  it("소진 상태에서 사용자 BYOK 키를 등록하면 Tier 3로 승계하고 키 원문을 상태에 저장하지 않는다", () => {
    const exhausted = createInitialAiWaterfallState({
      tier1GeminiFree: { totalTokens: 100_000, remainingTokens: 0 },
      tier2OpenRouterFree: { totalTokens: 50_000, remainingTokens: 0 },
    });

    const syntheticInput = ["user", "gemini", "entry", "99441122"].join("-");
    const validation = validateUserByokKeyInput("gemini", syntheticInput);
    expect(validation.valid).toBe(true);
    expect(validation.maskedFingerprint).toBeTruthy();
    expect(validation.maskedFingerprint).not.toContain(syntheticInput);

    const connected = registerUserByokKeyInState(exhausted, "gemini", validation);
    expect(JSON.stringify(connected)).not.toContain(syntheticInput);

    const decision = selectBestAvailableAiTier(connected);
    expect(decision.activeTierId).toBe("tier-3-user-byok");
    expect(decision.needsUserKeyPrompt).toBe(false);
    expect(decision.signalTone).toBe("good");
    expect(decision.headlineKo).toBe("내 API 키로 최상 품질 연결됨");
  });

  it("Local Ollama는 localhost/127.0.0.1 주소만 허용하고 외부 호스트는 차단한다", () => {
    expect(USER_BYOK_PROVIDER_GUIDES).toHaveLength(5);
    expect(validateUserByokKeyInput("ollama", "", "http://127.0.0.1:11434").valid).toBe(true);
    expect(validateUserByokKeyInput("ollama", "", "http://localhost:11434/").normalizedEndpointUrl).toBe(
      "http://localhost:11434",
    );
    expect(validateUserByokKeyInput("ollama", "", "https://evil.example.com:11434").valid).toBe(false);
    expect(classifyQuotaStatus(15, 100)).toBe("low");
    expect(classifyQuotaStatus(0, 100)).toBe("exhausted");
    expect(classifyQuotaStatus(60, 100)).toBe("ready");
  });
});

describe("StudioSimpleAiSetupCard (초보자 1-화면 단순 UI vs 고급 접힘 & 소진 배너)", () => {
  it("초기 무료 정상 상태에서는 큰 상태 배지와 단일 스위치만 보이고 고급 설정(<details>)은 접혀 있다", () => {
    render(<StudioSimpleAiSetupCard />);

    expect(screen.getByTestId("ai-simple-status-badge").textContent).toContain("최상 품질 무료 AI 사용 가능");
    expect(screen.getByTestId("ai-auto-best-quality-switch").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("ai-free-remaining-summary").textContent).toContain("100%");
    expect(screen.queryByTestId("ai-byok-exhausted-banner")).toBeNull();

    const advancedDetails = screen.getByTestId("ai-simple-advanced-details") as HTMLDetailsElement;
    expect(advancedDetails.open).toBe(false);
  });

  it("무료 토큰 소진 시 원클릭 API 키 입력 배너가 즉시 열리고 키 검증 후 상위 콜백으로 위임한다", () => {
    const onSaveUserApiKey = vi.fn<(payload: StudioSimpleAiKeyRegistrationPayload) => void>();
    const exhaustedState = createInitialAiWaterfallState({
      tier1GeminiFree: { totalTokens: 120_000, remainingTokens: 0 },
      tier2OpenRouterFree: { totalTokens: 80_000, remainingTokens: 0 },
    });

    render(<StudioSimpleAiSetupCard initialState={exhaustedState} onSaveUserApiKey={onSaveUserApiKey} />);

    expect(screen.getByTestId("ai-simple-status-badge").textContent).toContain(
      "무료 토큰 모두 소진 — 내 API 키 연결 필요",
    );
    expect(screen.getByTestId("ai-byok-exhausted-banner")).toBeTruthy();

    // 잘못된 짧은 입력 시 즉시 오류 안내
    fireEvent.change(screen.getByTestId("ai-byok-key-input"), { target: { value: "short" } });
    fireEvent.click(screen.getByTestId("ai-byok-submit-btn"));
    expect(screen.getByTestId("ai-byok-error")).toBeTruthy();
    expect(onSaveUserApiKey).not.toHaveBeenCalled();

    // OpenRouter 선택 후 정상 키 입력 -> 상위 콜백 위임 및 배지 전환
    fireEvent.click(screen.getByTestId("ai-byok-provider-openrouter"));
    const syntheticValidKey = ["or", "member", "verified", "20261123"].join("-");
    fireEvent.change(screen.getByTestId("ai-byok-key-input"), { target: { value: syntheticValidKey } });
    fireEvent.click(screen.getByTestId("ai-byok-submit-btn"));

    expect(onSaveUserApiKey).toHaveBeenCalledTimes(1);
    expect(onSaveUserApiKey.mock.calls[0]?.[0]).toMatchObject({
      providerId: "openrouter",
      apiKey: syntheticValidKey,
      endpointUrl: null,
    });
    expect(screen.getByTestId("ai-simple-status-badge").textContent).toContain("내 API 키로 최상 품질 연결됨");
    expect(screen.getByTestId("ai-byok-success-notice")).toBeTruthy();
  });

  it("소진 배너에서 원클릭 오프라인 ₩0 로컬 모드로 즉시 전환할 수 있다", () => {
    const onContinueOfflineZeroCost = vi.fn();
    const exhaustedState = createInitialAiWaterfallState({
      tier1GeminiFree: { totalTokens: 100_000, remainingTokens: 0 },
      tier2OpenRouterFree: { totalTokens: 80_000, remainingTokens: 0 },
    });

    render(
      <StudioSimpleAiSetupCard
        initialState={exhaustedState}
        onContinueOfflineZeroCost={onContinueOfflineZeroCost}
      />,
    );

    fireEvent.click(screen.getByTestId("ai-continue-offline-btn"));
    expect(onContinueOfflineZeroCost).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("ai-simple-status-badge").textContent).toContain("오프라인 ₩0 로컬 모드로 작업 중");
    expect(screen.queryByTestId("ai-byok-exhausted-banner")).toBeNull();
  });

  it("브라우저 저장소 직접 호출 0건 · 원시 HEX/RGB 0건 · 44px · keep-all · reduced-motion 계약을 지킨다", () => {
    const cssPath = resolve(process.cwd(), "apps/web/src/domains/creator/ai-simple-setup/ai-simple-setup.css");
    const tsxPath = resolve(process.cwd(), "apps/web/src/domains/creator/ai-simple-setup/StudioSimpleAiSetupCard.tsx");
    const enginePath = resolve(process.cwd(), "apps/web/src/domains/creator/ai-simple-setup/ai-quality-waterfall-engine.ts");
    const css = readFileSync(cssPath, "utf8");
    const tsx = readFileSync(tsxPath, "utf8");
    const engine = readFileSync(enginePath, "utf8");

    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toMatch(/\brgba?\(/u);
    expect(css).not.toMatch(/transition\s*:\s*all/u);
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("word-break: keep-all");
    expect(css).toContain("tabular-nums");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("forced-colors: active");

    expect(tsx).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\b/u);
    expect(engine).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\b/u);
    expect(tsx).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  });
});
