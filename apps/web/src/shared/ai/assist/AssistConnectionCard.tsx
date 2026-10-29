/**
 * Claude(Anthropic) 연결 카드 — /settings/ai에서 내 Anthropic 키를 연결한다.
 *
 * 정책: 운영측이 비용을 내는 AI는 비활성이므로 Claude는 항상 사용자 결제 BYOK다. 이 카드는
 * 키를 입력받아 공식 `GET /v1/models`로 검증하고(무료 호출), 통합 AI 설정 저장소에 연결을 추가한다.
 * - 키는 검증이 끝나면 입력창에서 지우고 저장소(탭 메모리)에만 둔다. 화면·로그에 다시 보이지 않는다.
 * - 전송 대상·비용 청구에 대한 동의 없이는 연결하지 않는다.
 * - 모델은 사용자가 고른 그대로 쓰며, 비용을 이유로 앱이 바꾸지 않는다.
 */
import "./ai-assist-i18n";

import { formatNumber } from "@toonstudio/core/format";
import { Eye, EyeOff, ImageIcon, KeyRound, LoaderCircle, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import {
  getUserAiSnapshot,
  setUserAiConfiguration,
  useUserAi,
} from "../user-ai-store";
import {
  EMPTY_AI_CONNECTION,
  userAiRoutingSettings,
  type UserAiCapability,
  type UserAiConfiguration,
  type UserAiConnection,
  type UserAiRouteAssignment,
} from "../user-ai-types";

import { ASSIST_DEFAULT_MODEL_ID, ASSIST_PRICE_AS_OF, assistModelInfo } from "./assist-models";
import { ANTHROPIC_API_ORIGIN, isAnthropicBaseUrl } from "./assist-protocol";
import { listAssistModelsForKey } from "./assist-transport";
import {
  ASSIST_BUTTON,
  ASSIST_CARD,
  ASSIST_INPUT,
  ASSIST_PRIMARY_BUTTON,
  ASSIST_QUIET_BUTTON,
} from "./assist-ui";
import { formatAssistUsd, resetAssistUsage, useAssistUsage } from "./assist-usage-meter";
import { AssistBudgetEditor } from "./AssistBudgetEditor";
import { AssistConnectionSteps } from "./AssistConnectionSteps";
import { AssistNotices } from "./AssistNotices";
import { useAssistTierOptions } from "./use-assist-tier-options";

import type { AssistModelListing } from "./assist-runtime";

const ASSIST_CONNECTION_ID = "claude-byok";
const CAPABILITIES: readonly UserAiCapability[] = ["text", "image", "inference", "three-d"];

type StatusTone = "ok" | "error" | "info";
interface Status {
  readonly tone: StatusTone;
  readonly text: string;
}

function buildConnection(
  apiKey: string,
  model: string,
  id: string,
  priority: number,
): UserAiConnection {
  const base = structuredClone(EMPTY_AI_CONNECTION);
  return {
    ...base,
    id,
    label: "Claude (Anthropic)",
    baseUrl: ANTHROPIC_API_ORIGIN,
    apiKey,
    textModel: model,
    imageModel: "",
    chatCompletionsPath: "/chat/completions",
    costPolicy: "user-funded-byok",
    enabled: true,
    priority,
    apiKeys: (base.apiKeys ?? []).map((item) => ({ ...item, apiKey })),
    models: (base.models ?? []).map((item) => ({ ...item, label: model, model })),
  };
}

/** 고급 설정에서 사용자가 손본 키·모델 프로필은 그대로 두고 텍스트 모델 한 개만 바꾼다. */
function withTextModel(connection: UserAiConnection, model: string): UserAiConnection {
  const models = connection.models ?? [];
  const index = models.findIndex((item) => item.capability === "text");
  const nextModels = index === -1
    ? [...models, { id: "text-claude", label: model, model, capability: "text" as const, enabled: true, priority: 100 }]
    : models.map((item, position) => (position === index ? { ...item, label: model, model, enabled: true } : item));
  return { ...connection, textModel: model, models: nextModels };
}

function emptyRouteAssignments(): Record<UserAiCapability, UserAiRouteAssignment | null> {
  return { text: null, image: null, inference: null, "three-d": null };
}

function withConnection(configuration: UserAiConfiguration, next: UserAiConnection): UserAiConfiguration {
  return {
    ...configuration,
    connections: [...configuration.connections.filter((item) => item.id !== next.id), next],
  };
}

function withoutConnection(configuration: UserAiConfiguration, id: string): UserAiConfiguration {
  const assignments = { ...configuration.assignments };
  const routeAssignments = { ...(configuration.routeAssignments ?? emptyRouteAssignments()) };
  for (const capability of CAPABILITIES) {
    if (assignments[capability] === id) assignments[capability] = null;
    if (routeAssignments[capability]?.connectionId === id) routeAssignments[capability] = null;
  }
  return {
    ...configuration,
    connections: configuration.connections.filter((item) => item.id !== id),
    assignments,
    routeAssignments,
  };
}

function withTextDefault(configuration: UserAiConfiguration, id: string): UserAiConfiguration {
  return {
    ...configuration,
    assignments: { ...configuration.assignments, text: id },
    routeAssignments: {
      ...(configuration.routeAssignments ?? emptyRouteAssignments()),
      text: { connectionId: id, apiKeyId: null, modelId: null },
    },
    routing: { ...userAiRoutingSettings(configuration), mode: "manual" },
  };
}

function usd(value: number): string {
  return `$${value}`;
}

export function AssistConnectionCard() {
  const t = useT();
  const idBase = useId();
  const snapshot = useUserAi();
  const usage = useAssistUsage();

  const connection = useMemo(
    () => snapshot.configuration.connections.find((item) => isAnthropicBaseUrl(item.baseUrl)),
    [snapshot.configuration],
  );
  const isDefault = Boolean(
    connection
      && snapshot.configuration.assignments.text === connection.id
      && userAiRoutingSettings(snapshot.configuration).mode === "manual",
  );

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(ASSIST_DEFAULT_MODEL_ID);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [liveModels, setLiveModels] = useState<readonly AssistModelListing[] | null>(null);

  const activeModel = connection?.textModel ?? model;
  const tiers = useAssistTierOptions();
  const modelOptions = useMemo(() => {
    const known = new Set(tiers.map((tier) => tier.id));
    const extras = (liveModels ?? [])
      .filter((item) => item.lifecycle === "active" && !known.has(item.id))
      .map((item) => ({ id: item.id, label: item.displayName }));
    if (!known.has(activeModel) && !extras.some((item) => item.id === activeModel)) {
      extras.unshift({ id: activeModel, label: activeModel });
    }
    return [...tiers, ...extras];
  }, [activeModel, liveModels, tiers]);

  const price = assistModelInfo(activeModel);

  const connect = async () => {
    const key = apiKey.trim();
    if (!key) {
      setStatus({ tone: "error", text: t("aiAssist.card.needKey") });
      return;
    }
    if (!consent) {
      setStatus({ tone: "error", text: t("aiAssist.card.needConsent") });
      return;
    }
    setBusy(true);
    setStatus({ tone: "info", text: t("aiAssist.card.checking") });
    try {
      const models = await listAssistModelsForKey(key);
      const configuration = getUserAiSnapshot().configuration;
      const id = connection?.id ?? ASSIST_CONNECTION_ID;
      const priority = Math.min(990, (configuration.connections.filter((item) => item.id !== id).length + 1) * 10);
      setUserAiConfiguration(withConnection(configuration, buildConnection(key, model, id, priority)));
      setLiveModels(models);
      setApiKey("");
      setShowKey(false);
      setStatus({ tone: "ok", text: t("aiAssist.card.verified", { count: models.length }) });
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const recheck = async () => {
    if (!connection?.apiKey) {
      setStatus({ tone: "error", text: t("aiAssist.card.needKey") });
      return;
    }
    setBusy(true);
    setStatus({ tone: "info", text: t("aiAssist.card.checking") });
    try {
      const models = await listAssistModelsForKey(connection.apiKey);
      setLiveModels(models);
      setStatus({ tone: "ok", text: t("aiAssist.card.verified", { count: models.length }) });
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const changeModel = (next: string) => {
    if (!connection) {
      setModel(next);
      return;
    }
    const current = getUserAiSnapshot().configuration.connections.find((item) => item.id === connection.id);
    if (!current) return;
    setUserAiConfiguration(withConnection(getUserAiSnapshot().configuration, withTextModel(current, next)));
  };

  const remove = () => {
    if (!connection) return;
    setUserAiConfiguration(withoutConnection(getUserAiSnapshot().configuration, connection.id));
    setLiveModels(null);
    setStatus({ tone: "info", text: t("aiAssist.card.removed") });
  };

  const makeDefault = () => {
    if (!connection) return;
    setUserAiConfiguration(withTextDefault(getUserAiSnapshot().configuration, connection.id));
    setStatus({ tone: "ok", text: t("aiAssist.card.defaultApplied") });
  };

  const keyId = `${idBase}-key`;
  const modelId = `${idBase}-model`;
  const consentId = `${idBase}-consent`;
  const statusClass = status?.tone === "error"
    ? "border-bad/40 bg-bad/10 text-bad"
    : status?.tone === "ok"
      ? "border-good/40 bg-good/10 text-good"
      : "border-line bg-raised text-fg-2";

  return (
    <section
      data-claude-connection-card="true"
      aria-labelledby={`${idBase}-title`}
      className={cn(ASSIST_CARD, "mt-6 space-y-5 text-fg")}
    >
      <header className="flex flex-wrap items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent" aria-hidden>
          <Sparkles size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${idBase}-title`} className="text-lg font-bold">{t("aiAssist.card.title")}</h2>
          <p className="mt-1 text-sm text-fg-2">{t("aiAssist.card.subtitle")}</p>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs font-semibold" aria-label="Claude">
            <li className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1"><KeyRound size={12} aria-hidden />{t("aiAssist.card.badgeByok")}</li>
            <li className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1"><ImageIcon size={12} aria-hidden />{t("aiAssist.card.badgeVision")}</li>
            <li className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1"><ShieldCheck size={12} aria-hidden />{t("aiAssist.card.badgeDirect")}</li>
          </ul>
        </div>
      </header>

      <AssistNotices>
        <p>{t("aiAssist.card.keyNotice")}</p>
      </AssistNotices>

      {connection ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-good">{t("aiAssist.card.connected", { model: connection.textModel })}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={modelId} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.card.modelLabel")}</label>
              <select id={modelId} className={ASSIST_INPUT} value={activeModel} onChange={(event) => changeModel(event.target.value)}>
                {modelOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-fg-3">{t("aiAssist.card.modelHint")}</p>
              {price ? (
                <p className="mt-1 text-xs text-fg-3">
                  {t("aiAssist.card.priceLine", { input: usd(price.inputUsdPerMTok), output: usd(price.outputUsdPerMTok) })}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ASSIST_BUTTON} onClick={() => void recheck()} disabled={busy}>
              {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : null}
              {t("aiAssist.card.recheck")}
            </button>
            <button type="button" className={ASSIST_BUTTON} onClick={makeDefault} disabled={busy || isDefault}>
              {t("aiAssist.card.makeDefault")}
            </button>
            <button type="button" className={ASSIST_QUIET_BUTTON} onClick={remove} disabled={busy}>
              <Trash2 size={16} aria-hidden />
              {t("aiAssist.card.remove")}
            </button>
          </div>
          <p className="text-xs text-fg-3">{t("aiAssist.card.defaultHint")}</p>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
        >
          <AssistConnectionSteps />
          <div>
            <label htmlFor={keyId} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.card.apiKeyLabel")}</label>
            <div className="flex gap-2">
              <input
                id={keyId}
                className={ASSIST_INPUT}
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={t("aiAssist.card.apiKeyPlaceholder")}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={busy}
                // 로그인 폼이 아니다. 비밀번호 관리자가 이 키를 저장하자고 묻거나 채우지 않게 한다(키는 이 브라우저의 저장소에만 둔다).
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
              />
              <button
                type="button"
                className={cn(ASSIST_BUTTON, "shrink-0 px-3")}
                aria-label={showKey ? t("aiAssist.card.hideKey") : t("aiAssist.card.showKey")}
                onClick={() => setShowKey((value) => !value)}
              >
                {showKey ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
              </button>
            </div>
          </div>
          <div className="sm:max-w-xs">
            <label htmlFor={modelId} className="mb-1 block text-xs font-bold text-fg-2">{t("aiAssist.card.modelLabel")}</label>
            <select id={modelId} className={ASSIST_INPUT} value={model} onChange={(event) => setModel(event.target.value)} disabled={busy}>
              {modelOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <p className="mt-1 text-xs text-fg-3">{t("aiAssist.card.modelHint")}</p>
            {price ? (
              <p className="mt-1 text-xs text-fg-3">
                {t("aiAssist.card.priceLine", { input: usd(price.inputUsdPerMTok), output: usd(price.outputUsdPerMTok) })}
              </p>
            ) : null}
          </div>
          <label htmlFor={consentId} className="flex items-start gap-2 text-sm">
            <input id={consentId} type="checkbox" className="mt-1" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={busy} />
            <span>{t("aiAssist.card.consent")}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={ASSIST_PRIMARY_BUTTON} disabled={busy}>
              {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : null}
              {busy ? t("aiAssist.card.checking") : t("aiAssist.card.connect")}
            </button>
          </div>
        </form>
      )}

      <p role="status" aria-live="polite" className={cn("rounded-xl border px-3 py-2 text-sm", status ? statusClass : "hidden")}>
        {status?.text}
      </p>

      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="text-sm font-bold">{t("aiAssist.card.featuresTitle")}</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-fg-2">
          <li>{t("aiAssist.card.featureArt")}</li>
          <li>{t("aiAssist.card.featurePlan")}</li>
          <li>{t("aiAssist.card.featureLocalize")}</li>
          <li>{t("aiAssist.card.featureAltText")}</li>
          <li>{t("aiAssist.card.featureText")}</li>
        </ul>
      </div>

      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="text-sm font-bold">{t("aiAssist.card.usageTitle")}</h3>
        {usage.requests === 0 ? (
          <p className="text-sm text-fg-3">{t("aiAssist.card.usageEmpty")}</p>
        ) : (
          <>
            <p className="text-sm">
              {t("aiAssist.card.usageSummary", {
                requests: formatNumber(usage.requests),
                input: formatNumber(usage.usage.inputTokens + usage.usage.cacheReadTokens + usage.usage.cacheWriteTokens),
                output: formatNumber(usage.usage.outputTokens),
                cost: formatAssistUsd(usage.estimatedUsd),
              })}
            </p>
            {usage.unpricedRequests > 0 ? (
              <p className="text-xs text-warn">{t("aiAssist.card.usageUnpriced", { count: usage.unpricedRequests })}</p>
            ) : null}
            <p className="text-xs text-fg-3">{t("aiAssist.common.estimateNote", { date: ASSIST_PRICE_AS_OF })}</p>
            <button type="button" className={ASSIST_QUIET_BUTTON} onClick={resetAssistUsage}>
              {t("aiAssist.card.usageReset")}
            </button>
          </>
        )}
      </div>

      <AssistBudgetEditor />
    </section>
  );
}
