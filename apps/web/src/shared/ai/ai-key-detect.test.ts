import { describe, expect, it } from "vitest";

import { detectAiKeyProvider, maskAiKey, normalizePastedAiKey, splitPastedAiKeys } from "./ai-key-detect";
import { addQuickKey, chooseQuickKeyModel, findQuickKeyConnection, quickKeyProviderOf, removeQuickKey } from "./ai-quick-key";
import { EMPTY_AI_CONFIGURATION, normalizeUserAiConfiguration, userAiRoutingSettings } from "./user-ai-types";

// 실제 키가 아니라 형식만 맞춘 가짜 값이다.
const GEMINI = `AIza${"A".repeat(35)}`;
const GROQ = `gsk_${"b".repeat(52)}`;
const CLAUDE = `sk-ant-api03-${"c".repeat(40)}`;
const OPENROUTER = `sk-or-v1-${"d".repeat(64)}`;

describe("detectAiKeyProvider", () => {
  it.each([
    [CLAUDE, ["anthropic"], true],
    [OPENROUTER, ["openrouter"], true],
    [`sk-proj-${"e".repeat(48)}`, ["openai"], true],
    [GROQ, ["groq"], true],
    [GEMINI, ["gemini"], true],
    [`hf_${"f".repeat(34)}`, ["huggingface"], true],
    [`csk-${"g".repeat(40)}`, ["cerebras"], true],
    [`xai-${"h".repeat(60)}`, ["xai"], true],
    [`github_pat_${"i".repeat(70)}`, ["github"], true],
    [`${"0".repeat(32)}.${"Ab".repeat(8)}`, ["zai"], true],
  ] as const)("접두사가 고유한 키는 하나로 확정한다 (%#)", (key, candidates, exact) => {
    expect(detectAiKeyProvider(key)).toEqual({ candidates, exact });
  });

  it("형식이 겹치는 키는 후보를 여러 개 돌려주고 확정하지 않는다", () => {
    expect(detectAiKeyProvider(`sk-${"a1".repeat(16)}`)).toEqual({ candidates: ["deepseek", "openai"], exact: false });
    expect(detectAiKeyProvider(`sk-${"q".repeat(48)}`)).toEqual({ candidates: ["siliconflow", "openai"], exact: false });
    expect(detectAiKeyProvider("A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6")).toEqual({ candidates: ["mistral"], exact: false });
    expect(detectAiKeyProvider("01234567-89ab-cdef-0123-456789abcdef")).toEqual({ candidates: ["sambanova"], exact: false });
    expect(detectAiKeyProvider(`01234567-89ab-cdef-0123-456789abcdef:${"f".repeat(32)}`)).toEqual({ candidates: ["fal"], exact: false });
  });

  it("모르는 형식이나 너무 짧은 값은 후보 없이 돌려준다", () => {
    expect(detectAiKeyProvider("not a key")).toEqual({ candidates: [], exact: false });
    expect(detectAiKeyProvider("abc")).toEqual({ candidates: [], exact: false });
    expect(detectAiKeyProvider("zzzzzzzzzzzzzzzzzzzzzzzzzz-unknown-format")).toEqual({ candidates: [], exact: false });
  });
});

describe("붙여넣기 정리", () => {
  it("따옴표·Bearer를 벗기고 공백이 섞인 값은 키로 보지 않는다", () => {
    expect(normalizePastedAiKey(`"${GROQ}"`)).toBe(GROQ);
    expect(normalizePastedAiKey(`Bearer ${GROQ}`)).toBe(GROQ);
    expect(normalizePastedAiKey("two words here and more")).toBe("");
  });

  it("여러 줄·쉼표·환경 변수 줄을 키 목록으로 나누고 중복을 뺀다", () => {
    const pasted = [
      `GEMINI_API_KEY=${GEMINI}`,
      `export GROQ_API_KEY="${GROQ}"`,
      `${CLAUDE}, ${OPENROUTER}`,
      GEMINI,
      "",
    ].join("\n");
    expect(splitPastedAiKeys(pasted)).toEqual([GEMINI, GROQ, CLAUDE, OPENROUTER]);
  });

  it("가린 표기에는 앞뒤 4자만 남긴다", () => {
    expect(maskAiKey(GROQ)).toBe("gsk_…bbbb");
    expect(maskAiKey("short")).toBe("••••");
  });
});

describe("addQuickKey / removeQuickKey", () => {
  it("새 서비스 키는 공식 주소·기본 모델로 연결을 만들고 텍스트 기본 연결로 둔다", () => {
    const { configuration, connectionId, duplicate } = addQuickKey(EMPTY_AI_CONFIGURATION, "gemini", GEMINI, { model: "gemini-3.8-flash" });

    expect(duplicate).toBe(false);
    const normalized = normalizeUserAiConfiguration(configuration);
    const connection = normalized.connections.find((item) => item.id === connectionId);
    expect(connection).toMatchObject({
      label: "Google Gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      textModel: "gemini-3.8-flash",
      costPolicy: "provider-free-tier",
      apiKey: GEMINI,
    });
    expect(normalized.assignments.text).toBe(connectionId);
    expect(quickKeyProviderOf(connection!)).toBe("gemini");
  });

  it("같은 서비스 키를 더 붙이면 그 연결의 키 목록에 쌓이고, 같은 키는 다시 넣지 않는다", () => {
    const first = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", GROQ);
    const secondKey = `gsk_${"z".repeat(52)}`;
    const second = addQuickKey(first.configuration, "groq", secondKey);
    const again = addQuickKey(second.configuration, "groq", secondKey);

    expect(second.connectionId).toBe(first.connectionId);
    expect(again.duplicate).toBe(true);
    const normalized = normalizeUserAiConfiguration(again.configuration);
    expect(normalized.connections).toHaveLength(1);
    expect(normalized.connections[0]?.apiKeys?.map((item) => item.apiKey)).toEqual([GROQ, secondKey]);
  });

  it("유료 키는 비용 청구를 확인했을 때만 자동 경로에서도 쓰도록 켠다", () => {
    const withoutConsent = addQuickKey(EMPTY_AI_CONFIGURATION, "anthropic", CLAUDE);
    expect(userAiRoutingSettings(withoutConsent.configuration).allowPaidFallback).toBe(false);

    const withConsent = addQuickKey(EMPTY_AI_CONFIGURATION, "anthropic", CLAUDE, { allowPaid: true });
    expect(userAiRoutingSettings(withConsent.configuration).allowPaidFallback).toBe(true);
    const claude = findQuickKeyConnection(withConsent.configuration, "anthropic");
    expect(claude).toMatchObject({ id: "claude-byok", costPolicy: "user-funded-byok" });
  });

  it("마지막 키를 지우면 연결과 그 연결을 가리키던 배정도 함께 지운다", () => {
    const added = addQuickKey(EMPTY_AI_CONFIGURATION, "openrouter", OPENROUTER);
    const removed = removeQuickKey(added.configuration, added.connectionId, added.keyId);

    const normalized = normalizeUserAiConfiguration(removed);
    expect(normalized.connections).toHaveLength(0);
    expect(normalized.assignments.text).toBeNull();
    expect(normalized.routeAssignments?.text).toBeNull();
  });

  it("키가 남아 있으면 연결은 두고 그 키만 지운다", () => {
    const first = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", GROQ);
    const second = addQuickKey(first.configuration, "groq", `gsk_${"y".repeat(52)}`);
    const removed = removeQuickKey(second.configuration, second.connectionId, first.keyId);

    const normalized = normalizeUserAiConfiguration(removed);
    expect(normalized.connections[0]?.apiKeys?.map((item) => item.id)).toEqual([second.keyId]);
  });
});

describe("chooseQuickKeyModel", () => {
  it("모델 목록에서 선호 순서대로 처음 있는 모델을 고르고, 목록이 없으면 기본 모델을 쓴다", () => {
    expect(chooseQuickKeyModel("openai", ["gpt-4o-mini", "gpt-4.1-mini"])).toBe("gpt-4.1-mini");
    expect(chooseQuickKeyModel("gemini", ["models/gemini-2.5-flash"])).toBe("gemini-2.5-flash");
    expect(chooseQuickKeyModel("groq", null)).toBe("openai/gpt-oss-120b");
  });

  it("무료 정책이 모델을 묶어 둔 서비스는 목록과 상관없이 정해진 모델을 쓴다", () => {
    expect(chooseQuickKeyModel("zai", ["glm-5.1", "glm-4.7-flash"])).toBe("glm-4.7-flash");
    expect(chooseQuickKeyModel("openrouter", ["some/paid-model"])).toBe("openrouter/free");
  });
});
