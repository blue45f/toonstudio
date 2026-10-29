/**
 * "키 붙여넣기 한 번" 등록 — 감지한 서비스의 공식 주소·기본 모델·비용 정책으로 연결을 만들고,
 * 같은 서비스의 키를 더 붙이면 그 연결의 키 목록에 더한다(여러 키는 한도·인증 오류 때 차례로 넘겨 쓴다).
 *
 * 순수 함수만 둔다: 설정 객체를 받아 새 설정을 돌려주고, 저장·네트워크·키 기록은 하지 않는다.
 * 실제 키 확인(모델 목록 조회)은 화면 쪽(`AiQuickKeyPanel`)이 등록 직전에 한다.
 */
import { ASSIST_DEFAULT_MODEL_ID } from "./assist/assist-models";
import { ANTHROPIC_API_ORIGIN, isAnthropicBaseUrl } from "./assist/assist-protocol";
import { freeAiConnectionPolicyIssue } from "./free-ai-policy";
import {
  EMPTY_AI_CONNECTION,
  USER_AI_CAPABILITIES,
  resolvedUserAiRoutes,
  userAiConnectionApiKeys,
  userAiConnectionModels,
  userAiRoutingSettings,
  type UserAiCapability,
  type UserAiConfiguration,
  type UserAiConnection,
  type UserAiRouteAssignment,
} from "./user-ai-types";

import { AI_KEY_PROVIDERS, type AiKeyProviderId } from "./ai-key-detect";

import type { UserAiCostPolicy } from "./free-ai-policy";

/** 이미지 키(fal)는 AI 설정 보관함이 아니라 연동 키 화면에서 등록한다. */
export type QuickKeyProviderId = Exclude<AiKeyProviderId, "fal">;

export interface QuickKeyPreset {
  readonly connectionId: string;
  readonly baseUrl: string;
  /** 모델 목록을 확인하지 못했을 때 쓰는 기본 모델. 서버 무료 풀의 기본값과 맞춘다. */
  readonly model: string;
  /** 키로 모델 목록을 읽을 수 있으면 이 순서로 찾아 처음 있는 모델을 쓴다. */
  readonly preferredModels: readonly string[];
  /** 무료 정책이 허용 모델을 묶어 둔 서비스는 목록과 상관없이 기본 모델만 쓴다. */
  readonly fixedModel?: boolean;
  readonly costPolicy: Exclude<UserAiCostPolicy, "unverified">;
}

export const QUICK_KEY_PRESETS: Readonly<Record<QuickKeyProviderId, QuickKeyPreset>> = Object.freeze({
  anthropic: {
    connectionId: "claude-byok",
    baseUrl: ANTHROPIC_API_ORIGIN,
    model: ASSIST_DEFAULT_MODEL_ID,
    preferredModels: [ASSIST_DEFAULT_MODEL_ID],
    fixedModel: true,
    costPolicy: "user-funded-byok",
  },
  openai: {
    connectionId: "quick-openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5-mini",
    preferredModels: ["gpt-5-mini", "gpt-5", "gpt-4.1-mini", "gpt-4o-mini"],
    costPolicy: "user-funded-byok",
  },
  gemini: {
    connectionId: "quick-gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.8-flash",
    preferredModels: ["gemini-3.8-flash", "gemini-3-flash", "gemini-2.5-flash"],
    costPolicy: "provider-free-tier",
  },
  groq: {
    connectionId: "quick-groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    preferredModels: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"],
    costPolicy: "provider-free-tier",
  },
  openrouter: {
    connectionId: "quick-openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openrouter/free",
    preferredModels: ["openrouter/free"],
    fixedModel: true,
    costPolicy: "openrouter-free",
  },
  cerebras: {
    connectionId: "quick-cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    model: "gpt-oss-120b",
    preferredModels: ["gpt-oss-120b", "llama-3.3-70b"],
    costPolicy: "provider-free-tier",
  },
  huggingface: {
    connectionId: "quick-huggingface",
    baseUrl: "https://router.huggingface.co/v1",
    model: "openai/gpt-oss-120b",
    preferredModels: ["openai/gpt-oss-120b"],
    costPolicy: "provider-free-tier",
  },
  github: {
    connectionId: "quick-github",
    baseUrl: "https://models.github.ai/inference",
    model: "openai/gpt-4o-mini",
    preferredModels: ["openai/gpt-4.1-mini", "openai/gpt-4o-mini"],
    costPolicy: "provider-free-tier",
  },
  mistral: {
    connectionId: "quick-mistral",
    baseUrl: "https://api.mistral.ai/v1",
    model: "mistral-small-latest",
    preferredModels: ["mistral-small-latest", "mistral-medium-latest"],
    costPolicy: "provider-free-tier",
  },
  sambanova: {
    connectionId: "quick-sambanova",
    baseUrl: "https://api.sambanova.ai/v1",
    model: "DeepSeek-V3.1",
    preferredModels: ["DeepSeek-V3.1", "Meta-Llama-3.3-70B-Instruct"],
    costPolicy: "provider-free-tier",
  },
  zai: {
    connectionId: "quick-zai",
    baseUrl: "https://api.z.ai/api/paas/v4",
    model: "glm-4.7-flash",
    preferredModels: ["glm-4.7-flash"],
    fixedModel: true,
    costPolicy: "provider-free-tier",
  },
  siliconflow: {
    connectionId: "quick-siliconflow",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "THUDM/GLM-Z1-9B-0414",
    preferredModels: ["THUDM/GLM-Z1-9B-0414"],
    fixedModel: true,
    costPolicy: "provider-free-tier",
  },
  deepseek: {
    connectionId: "quick-deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    preferredModels: ["deepseek-chat"],
    costPolicy: "user-funded-byok",
  },
  xai: {
    connectionId: "quick-xai",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-4-fast-non-reasoning",
    preferredModels: ["grok-4-fast-non-reasoning", "grok-4-fast", "grok-4", "grok-3-mini"],
    costPolicy: "user-funded-byok",
  },
});

export function isQuickKeyProvider(id: AiKeyProviderId): id is QuickKeyProviderId {
  return id !== "fal";
}

/** 키로 읽은 모델 목록(OpenAI 호환 `/models`의 id들)에서 쓸 모델을 고른다. 고를 수 없으면 기본 모델. */
export function chooseQuickKeyModel(provider: QuickKeyProviderId, listedModelIds: readonly string[] | null): string {
  const preset = QUICK_KEY_PRESETS[provider];
  if (preset.fixedModel || !listedModelIds?.length) return preset.model;
  // Gemini 호환 목록은 "models/<id>" 형태로 준다.
  const listed = new Set(listedModelIds.map((id) => id.replace(/^models\//u, "")));
  return preset.preferredModels.find((model) => listed.has(model)) ?? preset.model;
}

function endpointKey(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return `${url.host.toLowerCase()}${url.pathname.replace(/\/+$/u, "")}`;
  } catch {
    return "";
  }
}

/**
 * 이 서비스로 이미 만든, 키를 더 쌓아도 되는 연결(주소 기준). Claude는 공식 호스트면 같은 연결로 본다.
 * 주소가 같아도 비용 정책이 다르거나(옛 설정에서 가져온 "재확인 필요" 연결 등) 텍스트 모델이 없는(이미지 전용)
 * 연결에 키를 붙이면 텍스트 AI에 쓰이지 않으므로, 그런 연결은 고르지 않고 새 연결을 만들게 한다.
 */
export function findQuickKeyConnection(
  configuration: UserAiConfiguration,
  provider: QuickKeyProviderId,
  accept: (connection: UserAiConnection) => boolean = () => true,
): UserAiConnection | undefined {
  const preset = QUICK_KEY_PRESETS[provider];
  return configuration.connections.find((item) => (
    sameQuickKeyEndpoint(item, provider)
    && item.costPolicy === preset.costPolicy
    && userAiConnectionModels(item, "text").length > 0
    && accept(item)
  ));
}

function sameQuickKeyEndpoint(connection: Pick<UserAiConnection, "baseUrl">, provider: QuickKeyProviderId): boolean {
  return provider === "anthropic"
    ? isAnthropicBaseUrl(connection.baseUrl)
    : endpointKey(connection.baseUrl) === endpointKey(QUICK_KEY_PRESETS[provider].baseUrl);
}

/**
 * 같은 주소에서 텍스트에 쓰이는 연결이 이미 이 키를 갖고 있는지. 비용 정책이 달라도(예: 사용자가 유료 BYOK로 정해 둔
 * 키) 같은 키로 본다. 그래야 유료로 정해 둔 키가 무료 정책 연결로 다시 등록돼 자동 경로에 들어가지 않는다.
 * "재확인 필요"·이미지 전용 연결의 키는 텍스트에 쓰이지 않으므로 세지 않는다(다시 붙이면 쓰이는 연결을 만든다).
 * 꺼 둔 키나 꺼 둔 연결의 키도 찾아 `active: false`로 알린다(다시 붙이면 새로 만들지 않고 그 키를 다시 켠다).
 */
function findHeldQuickKey(
  configuration: UserAiConfiguration,
  provider: QuickKeyProviderId,
  key: string,
): { readonly connectionId: string; readonly keyId: string; readonly active: boolean } | null {
  for (const item of configuration.connections) {
    if (!sameQuickKeyEndpoint(item, provider) || item.costPolicy === "unverified") continue;
    if (userAiConnectionModels(item, "text").length === 0) continue;
    const keys = item.apiKeys?.length ? item.apiKeys : userAiConnectionApiKeys(item);
    const same = keys.find((entry) => entry.apiKey === key);
    if (same) return { connectionId: item.id, keyId: same.id, active: item.enabled !== false && same.enabled !== false };
  }
  return null;
}

/**
 * 이 키가 이미 텍스트에 쓰이는 연결에서 켜진 채로 등록돼 있는지(서비스·비용 정책과 상관없이 같은 키 값). 붙여 넣는
 * 순간 바로 알려 주려고 쓴다. "재확인 필요"·이미지 전용 연결의 키와 꺼 둔 키·연결은 지금 쓰이지 않으므로 세지 않는다
 * (다시 붙이면 등록 단계에서 그 키를 다시 켜거나 쓰이는 연결을 만든다).
 */
export function isQuickKeyRegistered(configuration: UserAiConfiguration, key: string): boolean {
  return configuration.connections.some((item) => (
    item.enabled !== false
    && item.costPolicy !== "unverified"
    && userAiConnectionModels(item, "text").length > 0
    && userAiConnectionApiKeys(item).some((entry) => entry.apiKey === key)
  ));
}

/** 연결 주소로 어느 서비스인지 되짚는다(목록 표시용). 모르는 주소면 null. */
export function quickKeyProviderOf(connection: Pick<UserAiConnection, "baseUrl">): QuickKeyProviderId | null {
  if (isAnthropicBaseUrl(connection.baseUrl)) return "anthropic";
  const target = endpointKey(connection.baseUrl);
  const match = (Object.keys(QUICK_KEY_PRESETS) as QuickKeyProviderId[])
    .find((id) => endpointKey(QUICK_KEY_PRESETS[id].baseUrl) === target);
  return match ?? null;
}

/** 지금 텍스트에 배정된 연결이 실제로 텍스트 AI 경로를 하나라도 내는지. */
function assignedTextUsable(configuration: UserAiConfiguration): boolean {
  const assigned = configuration.connections.find((item) => item.id === configuration.assignments.text);
  if (!assigned) return false;
  return resolvedUserAiRoutes(assigned, "text").some((route) => freeAiConnectionPolicyIssue(route, "text") === null);
}

export const QUICK_KEY_MAX_KEYS_PER_SERVICE = 12;
const MAX_CONNECTIONS = 24;

export interface QuickKeyAddResult {
  readonly configuration: UserAiConfiguration;
  readonly connectionId: string;
  readonly keyId: string;
  /** 같은 키가 이미 켜진 채로 있어 아무것도 바꾸지 않았다. */
  readonly duplicate: boolean;
  /** 꺼 둔 같은 키(또는 그 키가 든 꺼 둔 연결)를 다시 켰다. 새 키·연결은 만들지 않았다. */
  readonly reenabled: boolean;
}

function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("연결 ID를 만들지 못했어요.");
}

function emptyRouteAssignments(): Record<UserAiCapability, UserAiRouteAssignment | null> {
  return { text: null, image: null, inference: null, "three-d": null };
}

function assignText(configuration: UserAiConfiguration, connectionId: string): UserAiConfiguration {
  return {
    ...configuration,
    assignments: { ...configuration.assignments, text: connectionId },
    routeAssignments: {
      ...(configuration.routeAssignments ?? emptyRouteAssignments()),
      text: { connectionId, apiKeyId: null, modelId: null },
    },
  };
}

/**
 * 키 하나를 보관함 설정에 더한다. 같은 서비스 연결이 있으면 그 연결의 키 목록 끝에 붙이고(여러 키),
 * 없으면 새 연결을 만들어 사용 순서 맨 뒤에 둔다. 유료 키를 사용자가 확인하고 등록하면 자동 경로에서도
 * 그 키를 쓰도록 한다(`allowPaid`). 텍스트 기능에 정해 둔 연결이 없으면 이 연결을 기본으로 둔다.
 */
export function addQuickKey(
  configuration: UserAiConfiguration,
  provider: QuickKeyProviderId,
  apiKey: string,
  options: { readonly model?: string; readonly allowPaid?: boolean } = {},
): QuickKeyAddResult {
  const key = apiKey.trim();
  if (!key) throw new Error("API 키를 입력해 주세요.");
  const preset = QUICK_KEY_PRESETS[provider];
  const info = AI_KEY_PROVIDERS[provider];
  const held = findHeldQuickKey(configuration, provider, key);
  if (held?.active) {
    return { configuration, connectionId: held.connectionId, keyId: held.keyId, duplicate: true, reenabled: false };
  }
  const routing = userAiRoutingSettings(configuration);
  // 유료 키를 "먼저 쓴다"에 동의하고 등록했다: 자동 경로에서 무료 경로보다 먼저 쓴다(동의 문구가 그렇게 알린다).
  // 동의는 이 키가 든 연결에만 남긴다(다른 유료 연결은 각자 동의해야 자동 경로에 든다).
  const paidConsent = info.cost === "paid" && options.allowPaid === true;
  const nextRouting = paidConsent
    ? { ...routing, allowPaidFallback: true, preferPaidKeys: true }
    : routing;
  const consented = (connection: UserAiConnection): UserAiConnection => (paidConsent ? { ...connection, paidAutoUse: true } : connection);
  // 자동 사용 동의는 연결마다 남는다. 동의하지 않은 연결(예: AI 보조 카드에서 대화상자용으로 연결한 키)에 이 키를 넣거나
  // 그 연결을 다시 켜며 동의를 남기면, 사용자가 동의하지 않은 같은 연결의 다른 키까지 자동 경로에서 먼저 쓰여 비용이 생긴다.
  // 그래서 동의한 유료 키는 이미 동의한 연결에만 더하고, 아니면 그 키만 든 새 연결로 따로 둔다.
  const sharesUnconsentedKeys = (connection: UserAiConnection, keyId: string | null) => paidConsent
    && connection.paidAutoUse !== true
    && (connection.apiKeys?.length ? connection.apiKeys : userAiConnectionApiKeys(connection))
      .some((entry) => entry.id !== keyId && entry.enabled !== false);
  const heldConnection = held ? configuration.connections.find((item) => item.id === held.connectionId) : undefined;
  if (held && heldConnection && sharesUnconsentedKeys(heldConnection, held.keyId)) {
    // 꺼 둔 이 키를 그 연결에서 빼고(다른 키는 그대로) 아래에서 이 키만 든 동의한 연결을 새로 만든다.
    return addQuickKey(removeQuickKey(configuration, held.connectionId, held.keyId), provider, key, options);
  }
  if (held) {
    // 꺼 둔 같은 키를 다시 붙였다: 사용자가 쓰려는 뜻이므로 그 키와 연결을 다시 켠다. 비용 정책·모델·순서는 그대로 둔다.
    const connections = configuration.connections.map((item) => (item.id === held.connectionId
      ? consented({
          ...item,
          enabled: true,
          ...(item.apiKeys?.length
            ? { apiKeys: item.apiKeys.map((entry) => (entry.id === held.keyId ? { ...entry, enabled: true } : entry)) }
            : {}),
        })
      : item));
    const next = { ...configuration, connections, routing: nextRouting };
    // 새 연결을 만들 때와 같이, 텍스트 배정이 비었거나 쓰일 수 없으면 다시 켠 연결로 바꾼다.
    return {
      configuration: assignedTextUsable(next) ? next : assignText(next, held.connectionId),
      connectionId: held.connectionId,
      keyId: held.keyId,
      duplicate: false,
      reenabled: true,
    };
  }
  const existing = findQuickKeyConnection(
    configuration,
    provider,
    (connection) => !sharesUnconsentedKeys(connection, null),
  );

  if (existing) {
    // 같은 키는 위에서 이미 중복으로 돌려주거나 다시 켰다.
    const keys = existing.apiKeys?.length ? existing.apiKeys : userAiConnectionApiKeys(existing);
    if (keys.length >= QUICK_KEY_MAX_KEYS_PER_SERVICE) {
      throw new Error(`${info.name}에는 키를 ${QUICK_KEY_MAX_KEYS_PER_SERVICE}개까지 등록할 수 있어요.`);
    }
    const keyId = uniqueId(`key-${keys.length + 1}`, new Set(keys.map((item) => item.id)));
    const lastPriority = keys.reduce((max, item) => Math.max(max, item.priority), 0);
    const updated: UserAiConnection = consented({
      ...existing,
      enabled: true,
      apiKeys: [
        ...keys,
        { id: keyId, label: `키 ${keys.length + 1}`, apiKey: key, enabled: true, priority: Math.min(999, lastPriority + 10) },
      ],
    });
    return {
      configuration: {
        ...configuration,
        connections: configuration.connections.map((item) => (item.id === existing.id ? updated : item)),
        routing: nextRouting,
      },
      connectionId: existing.id,
      keyId,
      duplicate: false,
      reenabled: false,
    };
  }

  if (configuration.connections.length >= MAX_CONNECTIONS) {
    throw new Error(`AI 연결은 ${MAX_CONNECTIONS}개까지 등록할 수 있어요. 쓰지 않는 연결을 지운 뒤 다시 등록해 주세요.`);
  }
  const model = (options.model ?? "").trim() || preset.model;
  const id = uniqueId(preset.connectionId, new Set(configuration.connections.map((item) => item.id)));
  const lastPriority = configuration.connections.reduce((max, item) => Math.max(max, item.priority ?? 100), 0);
  const connection: UserAiConnection = consented({
    ...structuredClone(EMPTY_AI_CONNECTION),
    id,
    label: info.name,
    baseUrl: preset.baseUrl,
    apiKey: key,
    textModel: model,
    imageModel: "",
    costPolicy: preset.costPolicy,
    enabled: true,
    priority: Math.min(990, Math.max(10, configuration.connections.length ? lastPriority + 10 : 10)),
    apiKeys: [{ id: "key-1", label: "키 1", apiKey: key, enabled: true, priority: 10 }],
    models: [{ id: "text-1", label: model, model, capability: "text", enabled: true, priority: 10 }],
  });
  const added = { ...configuration, connections: [...configuration.connections, connection], routing: nextRouting };
  return {
    // 텍스트 배정이 비었거나, 배정된 연결이 텍스트에 쓰일 수 없으면(재확인 필요·이미지 전용 등) 새 연결로 바꾼다.
    configuration: assignedTextUsable(configuration) ? added : assignText(added, id),
    connectionId: id,
    keyId: "key-1",
    duplicate: false,
    reenabled: false,
  };
}

/**
 * 키 하나를 지운다. 그 연결에 남은 키가 없으면 연결도 지우고, 지운 연결·키를 가리키던 기능 배정은 비운다
 * (배정이 남아 있으면 보관함 검증에서 설정 전체가 거부된다). 남은 키가 모두 꺼져 있으면 연결을 지우지 않고 꺼 둔다:
 * 목록에 따로 보이는 꺼 둔 키를 함께 잃지 않게 한다. 보관함 검증은 연결마다 켜진 키를 하나 요구하므로 남은 첫 키의
 * 켜짐 표시만 살리고, 연결을 꺼서 어떤 경로에도 쓰이지 않게 한다(그 키를 다시 붙여 넣으면 다시 켜진다).
 */
export function removeQuickKey(
  configuration: UserAiConfiguration,
  connectionId: string,
  keyId: string,
): UserAiConfiguration {
  const connection = configuration.connections.find((item) => item.id === connectionId);
  if (!connection) return configuration;
  const keys = connection.apiKeys?.length ? connection.apiKeys : userAiConnectionApiKeys(connection);
  const remaining = keys.filter((item) => item.id !== keyId);
  const removeConnection = remaining.length === 0;
  const keepSwitchedOff = !removeConnection && !remaining.some((item) => item.enabled);
  const keptKeys = keepSwitchedOff
    ? remaining.map((item, index) => (index === 0 ? { ...item, enabled: true } : item))
    : remaining;
  const assignments = { ...configuration.assignments };
  const routeAssignments = { ...(configuration.routeAssignments ?? emptyRouteAssignments()) };
  for (const capability of USER_AI_CAPABILITIES) {
    const route = routeAssignments[capability];
    if (removeConnection && assignments[capability] === connectionId) assignments[capability] = null;
    if (route?.connectionId === connectionId && (removeConnection || route.apiKeyId === keyId)) {
      routeAssignments[capability] = removeConnection ? null : { ...route, apiKeyId: null };
    }
  }
  return {
    ...configuration,
    connections: removeConnection
      ? configuration.connections.filter((item) => item.id !== connectionId)
      : configuration.connections.map((item) => (item.id === connectionId
        ? { ...item, apiKeys: keptKeys, ...(keepSwitchedOff ? { enabled: false } : {}) }
        : item)),
    assignments,
    routeAssignments,
  };
}
