import { describe, expect, it } from "vitest";

import { detectAiKeyProvider, maskAiKey, normalizePastedAiKey, splitPastedAiKeys } from "./ai-key-detect";
import { addQuickKey, chooseQuickKeyModel, findQuickKeyConnection, isQuickKeyRegistered, quickKeyProviderOf, removeQuickKey } from "./ai-quick-key";
import { userAiPersonalFirstConnectionsForCapability } from "./user-ai-store";
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

  it("값 뒤 메모·주석 줄·Windows·PowerShell·JSON 형식에서도 값만 키로 잡는다", () => {
    const openai = `sk-proj-${"e".repeat(48)}`;
    const pasted = [
      "# 개인 키 모음",
      `GEMINI_API_KEY=${GEMINI} # personal`,
      `$env:GROQ_API_KEY="${GROQ}"`,
      `set "ANTHROPIC_API_KEY=${CLAUDE}"`,
      `  "OPENROUTER_API_KEY": "${OPENROUTER}",`,
      `setx OPENAI_API_KEY "${openai}"`,
    ].join("\n");
    expect(splitPastedAiKeys(pasted)).toEqual([GEMINI, GROQ, CLAUDE, OPENROUTER, openai]);
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

  it("유료 키는 비용 청구를 확인했을 때만 자동 경로에서도 쓰도록 켜고, 동의는 그 키의 연결에만 남긴다", () => {
    const withoutConsent = addQuickKey(EMPTY_AI_CONFIGURATION, "anthropic", CLAUDE);
    expect(userAiRoutingSettings(withoutConsent.configuration).allowPaidFallback).toBe(false);
    expect(findQuickKeyConnection(withoutConsent.configuration, "anthropic")?.paidAutoUse).toBeUndefined();

    const withConsent = addQuickKey(EMPTY_AI_CONFIGURATION, "anthropic", CLAUDE, { allowPaid: true });
    expect(userAiRoutingSettings(withConsent.configuration).allowPaidFallback).toBe(true);
    const claude = findQuickKeyConnection(withConsent.configuration, "anthropic");
    expect(claude).toMatchObject({ id: "claude-byok", costPolicy: "user-funded-byok", paidAutoUse: true });

    // 같은 설정에 동의 없이 더한 다른 유료 키에는 동의가 번지지 않는다.
    const deepseek = addQuickKey(withConsent.configuration, "deepseek", `sk-${"d".repeat(32)}`);
    expect(normalizeUserAiConfiguration(deepseek.configuration).connections.find((item) => item.id === deepseek.connectionId)?.paidAutoUse)
      .toBeUndefined();
  });

  it("주소가 같아도 재확인이 필요한 옛 연결이나 이미지 전용 연결에는 키를 붙이지 않고, 텍스트에 쓰일 새 연결을 만든다", () => {
    const legacy = addQuickKey(EMPTY_AI_CONFIGURATION, "openrouter", `sk-or-v1-${"0".repeat(64)}`);
    const migrated = normalizeUserAiConfiguration({
      ...legacy.configuration,
      connections: legacy.configuration.connections.map((item) => ({ ...item, id: "migrated", costPolicy: "unverified" as const })),
      assignments: { ...legacy.configuration.assignments, text: "migrated" },
      routeAssignments: { ...legacy.configuration.routeAssignments!, text: { connectionId: "migrated", apiKeyId: null, modelId: null } },
    });
    expect(findQuickKeyConnection(migrated, "openrouter")).toBeUndefined();

    const added = addQuickKey(migrated, "openrouter", OPENROUTER);
    expect(added.connectionId).not.toBe("migrated");
    const normalized = normalizeUserAiConfiguration(added.configuration);
    expect(normalized.connections.find((item) => item.id === added.connectionId)?.costPolicy).toBe("openrouter-free");
    // 텍스트에 쓰이지 않던 옛 배정을 새 연결로 바꾼다.
    expect(normalized.assignments.text).toBe(added.connectionId);
    // 이후 같은 서비스 키는 새 연결에 쌓인다.
    expect(findQuickKeyConnection(normalized, "openrouter")?.id).toBe(added.connectionId);
  });

  it("같은 주소에 유료 BYOK로 정해 둔 키를 다시 붙여 넣으면 중복으로 보고, 무료 정책 연결을 새로 만들지 않는다", () => {
    const base = addQuickKey(EMPTY_AI_CONFIGURATION, "gemini", GEMINI);
    // 고급 설정에서 같은 Gemini 주소의 연결을 "사용자 결제 BYOK"로 바꿔 둔 상태.
    const paid = normalizeUserAiConfiguration({
      ...base.configuration,
      connections: base.configuration.connections.map((item) => ({ ...item, costPolicy: "user-funded-byok" as const })),
    });

    const again = addQuickKey(paid, "gemini", GEMINI);
    expect(again.duplicate).toBe(true);
    expect(again.connectionId).toBe(base.connectionId);
    expect(again.configuration).toBe(paid);

    // 다른 새 키는 무료 정책 연결로 따로 등록한다.
    const other = addQuickKey(paid, "gemini", `AIza${"B".repeat(35)}`);
    expect(other.duplicate).toBe(false);
    expect(normalizeUserAiConfiguration(other.configuration).connections.find((item) => item.id === other.connectionId)?.costPolicy)
      .toBe("provider-free-tier");
  });

  it("텍스트에 쓰이는 기존 배정은 다른 서비스 키를 더해도 그대로 둔다", () => {
    const first = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", GROQ);
    const second = addQuickKey(first.configuration, "gemini", GEMINI);
    expect(normalizeUserAiConfiguration(second.configuration).assignments.text).toBe(first.connectionId);

    // 유료 Claude 연결도 텍스트에 쓰이는 배정이라 그대로 둔다.
    const claude = addQuickKey(EMPTY_AI_CONFIGURATION, "anthropic", CLAUDE, { allowPaid: true });
    const withGemini = addQuickKey(claude.configuration, "gemini", GEMINI);
    expect(normalizeUserAiConfiguration(withGemini.configuration).assignments.text).toBe(claude.connectionId);
  });

  it("텍스트에 쓰이는 연결에 있는 키만 이미 등록한 키로 본다(재확인 필요 연결의 키는 다시 등록할 수 있다)", () => {
    const added = addQuickKey(EMPTY_AI_CONFIGURATION, "openrouter", OPENROUTER);
    expect(isQuickKeyRegistered(added.configuration, OPENROUTER)).toBe(true);
    expect(isQuickKeyRegistered(added.configuration, GROQ)).toBe(false);

    const legacy = normalizeUserAiConfiguration({
      ...added.configuration,
      connections: added.configuration.connections.map((item) => ({ ...item, costPolicy: "unverified" as const })),
    });
    expect(isQuickKeyRegistered(legacy, OPENROUTER)).toBe(false);
  });

  it("꺼 둔 같은 키를 다시 붙여 넣으면 새로 만들지 않고 그 키를 다시 켠다", () => {
    const first = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", GROQ);
    const otherKey = `gsk_${"z".repeat(52)}`;
    const second = addQuickKey(first.configuration, "groq", otherKey);
    // 고급 설정에서 첫 키만 꺼 둔 상태.
    const keyOff = normalizeUserAiConfiguration({
      ...second.configuration,
      connections: second.configuration.connections.map((item) => ({
        ...item,
        apiKeys: item.apiKeys?.map((entry) => (entry.id === first.keyId ? { ...entry, enabled: false } : entry)),
      })),
    });
    // 꺼 둔 키는 지금 쓰이지 않으므로 붙여 넣을 때 "이미 등록한 키"로 막지 않는다.
    expect(isQuickKeyRegistered(keyOff, GROQ)).toBe(false);
    expect(isQuickKeyRegistered(keyOff, otherKey)).toBe(true);

    const again = addQuickKey(keyOff, "groq", GROQ);
    expect(again).toMatchObject({ duplicate: false, reenabled: true, connectionId: first.connectionId, keyId: first.keyId });
    const normalized = normalizeUserAiConfiguration(again.configuration);
    expect(normalized.connections).toHaveLength(1);
    expect(normalized.connections[0]?.apiKeys?.map((item) => [item.apiKey, item.enabled])).toEqual([[GROQ, true], [otherKey, true]]);
    expect(isQuickKeyRegistered(again.configuration, GROQ)).toBe(true);
  });

  it("연결을 통째로 꺼 둔 키도 다시 붙이면 그 연결을 다시 켜고, 비용 정책은 그대로 두며 텍스트 배정을 되살린다", () => {
    const base = addQuickKey(EMPTY_AI_CONFIGURATION, "gemini", GEMINI);
    const off = normalizeUserAiConfiguration({
      ...base.configuration,
      connections: base.configuration.connections.map((item) => ({ ...item, enabled: false, costPolicy: "user-funded-byok" as const })),
      assignments: { ...base.configuration.assignments, text: null },
      routeAssignments: { ...base.configuration.routeAssignments!, text: null },
    });
    expect(isQuickKeyRegistered(off, GEMINI)).toBe(false);

    const revived = addQuickKey(off, "gemini", GEMINI);
    expect(revived).toMatchObject({ duplicate: false, reenabled: true, connectionId: base.connectionId });
    const normalized = normalizeUserAiConfiguration(revived.configuration);
    expect(normalized.connections).toHaveLength(1);
    // 사용자가 정해 둔 유료 BYOK 정책은 바꾸지 않는다.
    expect(normalized.connections[0]).toMatchObject({ enabled: true, costPolicy: "user-funded-byok" });
    expect(normalized.assignments.text).toBe(base.connectionId);
  });

  it("동의한 유료 키는 동의하지 않은 같은 서비스 연결(AI 보조 카드의 키 등)에 섞지 않고 그 키만 든 연결로 둔다", () => {
    // 비용 동의 없이 연결한 Claude 키(대화상자 전용).
    const dialogOnly = addQuickKey(EMPTY_AI_CONFIGURATION, "anthropic", CLAUDE);
    const consentedKey = `sk-ant-api03-${"q".repeat(40)}`;
    const consented = addQuickKey(dialogOnly.configuration, "anthropic", consentedKey, { allowPaid: true });

    expect(consented.connectionId).not.toBe(dialogOnly.connectionId);
    const normalized = normalizeUserAiConfiguration(consented.configuration);
    const dialog = normalized.connections.find((item) => item.id === dialogOnly.connectionId);
    expect(dialog?.paidAutoUse).toBeUndefined();
    expect(dialog?.apiKeys?.map((item) => item.apiKey)).toEqual([CLAUDE]);
    expect(normalized.connections.find((item) => item.id === consented.connectionId)).toMatchObject({ paidAutoUse: true, apiKey: consentedKey });
    // 자동 경로에서 먼저 쓰는 유료 키는 이번에 동의한 키 하나뿐이다(대화상자용 키는 비용이 생기지 않는다).
    expect(userAiPersonalFirstConnectionsForCapability("text", normalized).map((route) => route.apiKey)).toEqual([consentedKey]);

    // 이미 동의한 연결이 있으면 그 연결의 키 목록에 쌓는다.
    const third = addQuickKey(consented.configuration, "anthropic", `sk-ant-api03-${"r".repeat(40)}`, { allowPaid: true });
    expect(third.connectionId).toBe(consented.connectionId);
  });

  it("동의하지 않은 연결에서 꺼 둔 유료 키를 동의와 함께 다시 붙이면, 같은 연결의 다른 키는 그대로 두고 그 키만 따로 켠다", () => {
    const openaiA = `sk-proj-${"a".repeat(48)}`;
    const openaiB = `sk-proj-${"b".repeat(48)}`;
    const first = addQuickKey(EMPTY_AI_CONFIGURATION, "openai", openaiA, { allowPaid: true });
    const both = addQuickKey(first.configuration, "openai", openaiB, { allowPaid: true });
    // 사용자가 B 키를 끄고, 유료 키 자동 사용도 꺼 두었다(동의 철회).
    const optedOut = normalizeUserAiConfiguration({
      ...both.configuration,
      connections: both.configuration.connections.map((item) => ({
        ...item,
        paidAutoUse: false,
        apiKeys: item.apiKeys?.map((entry) => (entry.apiKey === openaiB ? { ...entry, enabled: false } : entry)),
      })),
      routing: { ...userAiRoutingSettings(both.configuration), allowPaidFallback: false, preferPaidKeys: false },
    });

    const revived = addQuickKey(optedOut, "openai", openaiB, { allowPaid: true });
    expect(revived.connectionId).not.toBe(first.connectionId);
    const normalized = normalizeUserAiConfiguration(revived.configuration);
    const old = normalized.connections.find((item) => item.id === first.connectionId);
    expect(old?.paidAutoUse).toBeUndefined();
    expect(old?.apiKeys?.map((item) => item.apiKey)).toEqual([openaiA]);
    expect(userAiPersonalFirstConnectionsForCapability("text", normalized).map((route) => route.apiKey)).toEqual([openaiB]);
  });

  it("켜진 마지막 키를 지워도 꺼 둔 키는 잃지 않고, 그 연결을 꺼 둔 채로 남긴다", () => {
    const first = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", GROQ);
    const offKey = `gsk_${"x".repeat(52)}`;
    const second = addQuickKey(first.configuration, "groq", offKey);
    const withOffKey = normalizeUserAiConfiguration({
      ...second.configuration,
      connections: second.configuration.connections.map((item) => ({
        ...item,
        apiKeys: item.apiKeys?.map((entry) => (entry.apiKey === offKey ? { ...entry, enabled: false } : entry)),
      })),
    });

    const removed = normalizeUserAiConfiguration(removeQuickKey(withOffKey, first.connectionId, first.keyId));
    expect(removed.connections).toHaveLength(1);
    expect(removed.connections[0]).toMatchObject({ enabled: false });
    expect(removed.connections[0]?.apiKeys?.map((item) => item.apiKey)).toEqual([offKey]);
    // 꺼 둔 연결이라 어떤 경로에도 쓰이지 않는다. 그 키를 다시 붙이면 다시 켠다.
    expect(userAiPersonalFirstConnectionsForCapability("text", removed)).toEqual([]);
    expect(addQuickKey(removed, "groq", offKey)).toMatchObject({ reenabled: true, connectionId: first.connectionId });
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
