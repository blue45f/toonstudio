/**
 * AI 설정의 첫 화면 — "키 붙여넣기 한 번"으로 끝나는 등록과, 지금 AI가 어떤 순서로 도는지의 요약.
 *
 * - 키가 없어도 모든 AI 기능은 ToonStudio AI(운영 고성능 → 무료 순)로 바로 동작한다. 키 등록은 선택이다.
 * - 키를 붙여 넣으면 형식으로 서비스를 알아보고(모호하면 고르게 한다), 등록 직전에 공급자의 모델 목록으로
 *   키를 확인한 뒤 공식 주소·기본 모델로 연결을 만든다. 여러 키를 한 번에 붙여 넣어도 되고, 같은 서비스의 키는
 *   한 연결의 키 목록에 쌓여 한도·인증 오류 때 차례로 넘겨 쓴다.
 * - 붙여 넣은 키는 입력란에 남기지 않는다(가린 표기로만 보여 주고, 등록 후 메모리에서 지운다).
 * - 유료 서비스 키는 비용 청구를 확인해야 등록되고, 확인하면 자동 경로에서도 그 키를 먼저 쓴다.
 */
import { CheckCircle2, CircleAlert, ExternalLink, KeyRound, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

import {
  AI_KEY_PROVIDER_PICK_ORDER,
  AI_KEY_PROVIDERS,
  detectAiKeyProvider,
  maskAiKey,
  splitPastedAiKeys,
  type AiKeyProviderId,
} from "./ai-key-detect";
import {
  addQuickKey,
  chooseQuickKeyModel,
  findQuickKeyConnection,
  isQuickKeyProvider,
  QUICK_KEY_PRESETS,
  quickKeyProviderOf,
  removeQuickKey,
  type QuickKeyProviderId,
} from "./ai-quick-key";
import { probeUserAiConnection } from "./user-ai-connection-probe";
import { getUserAiSnapshot, setUserAiConfiguration, useUserAi } from "./user-ai-store";
import { EMPTY_AI_CONNECTION, userAiConnectionApiKeys, type UserAiConnection } from "./user-ai-types";

import type { FreeAiPoolStatus } from "./free-ai-pool-status";

const INPUT = "min-h-11 w-full rounded-xl border border-line bg-panel px-3 py-2 font-mono text-sm text-fg outline-none transition-colors placeholder:font-sans placeholder:text-fg-3 focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BUTTON = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";
const PRIMARY_BUTTON = `${BUTTON} border-accent bg-accent text-on-accent hover:bg-accent/90`;
const ICON_BUTTON = "inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

interface PendingKey {
  readonly id: number;
  readonly key: string;
  readonly candidates: readonly AiKeyProviderId[];
  readonly provider: AiKeyProviderId | null;
}

interface RegisterOutcome {
  readonly id: number;
  readonly tone: "ok" | "warn" | "error";
  readonly text: string;
}

export interface AiQuickKeyPanelProps {
  /** 서버 상태(ToonStudio AI 준비 여부·고성능 경로 한도). 불러오는 중이면 null. */
  readonly poolStatus: FreeAiPoolStatus | null;
  /** 직접 주소·모델을 넣는 기존 연결 마법사를 연다(키 형식이 목록에 없는 서비스용). */
  readonly onOpenAdvancedWizard: () => void;
}

function providerName(id: AiKeyProviderId): string {
  return AI_KEY_PROVIDERS[id].name;
}

function costBadge(paid: boolean) {
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.6875rem] font-bold ${paid ? "border-warn/35 bg-warn/10 text-warn" : "border-good/35 bg-good/10 text-good"}`}>
      {paid ? "유료" : "무료"}
    </span>
  );
}

/** 등록 직전 키 확인. 키가 거절되면 등록하지 않고, 확인을 못 한 경우(브라우저 차단 등)는 등록하되 알린다. */
async function verifyQuickKey(provider: QuickKeyProviderId, key: string): Promise<
  | { readonly status: "verified"; readonly model: string }
  | { readonly status: "unverified"; readonly model: string; readonly reason: string }
  | { readonly status: "rejected" }
> {
  const preset = QUICK_KEY_PRESETS[provider];
  const probe = await probeUserAiConnection(
    {
      ...structuredClone(EMPTY_AI_CONNECTION),
      id: "quick-probe",
      baseUrl: preset.baseUrl,
      apiKey: key,
      apiKeys: [{ id: "key-1", label: "키 1", apiKey: key, enabled: true, priority: 10 }],
    },
    undefined,
    { includeModelIds: true },
  );
  if (probe.status === "unauthorized") return { status: "rejected" };
  if (probe.status === "ok") {
    return { status: "verified", model: chooseQuickKeyModel(provider, probe.modelIds ?? null) };
  }
  const reason = probe.status === "http_error"
    ? `서비스가 HTTP ${probe.httpStatus}로 답했어요`
    : "브라우저에서 서비스에 바로 닿지 못했어요(서비스의 브라우저 접속 제한일 수 있어요)";
  return { status: "unverified", model: preset.model, reason };
}

export function AiQuickKeyPanel({ poolStatus, onOpenAdvancedWizard }: AiQuickKeyPanelProps) {
  const idBase = useId();
  const snapshot = useUserAi();
  const configuration = snapshot.configuration;
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingKey[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<RegisterOutcome[]>([]);
  const sequence = useRef(0);

  const connections = useMemo(
    () => [...configuration.connections].sort((left, right) => (left.priority ?? 100) - (right.priority ?? 100)),
    [configuration.connections],
  );
  const keyCount = connections.reduce((sum, connection) => sum + userAiConnectionApiKeys(connection).length, 0);
  const premium = poolStatus?.premium;
  const needsPaidConsent = pending.some((item) => item.provider && AI_KEY_PROVIDERS[item.provider].cost === "paid" && item.provider !== "fal");
  const unresolved = pending.some((item) => item.provider === null);
  const registrable = pending.filter((item) => item.provider && isQuickKeyProvider(item.provider));
  const canRegister = !busy && registrable.length > 0 && !unresolved && (!needsPaidConsent || consent);

  const addPending = (raw: string) => {
    const keys = splitPastedAiKeys(raw);
    if (!keys.length) {
      setOutcomes([{ id: -1, tone: "error", text: "API 키로 보이지 않아요. 키 전체를 그대로 붙여 넣어 주세요." }]);
      return;
    }
    setOutcomes([]);
    setPending((current) => {
      const known = new Set(current.map((item) => item.key));
      const next = [...current];
      for (const key of keys) {
        if (known.has(key)) continue;
        const detection = detectAiKeyProvider(key);
        sequence.current += 1;
        next.push({
          id: sequence.current,
          key,
          candidates: detection.candidates,
          provider: detection.exact || detection.candidates.length === 1 ? detection.candidates[0] ?? null : null,
        });
      }
      return next;
    });
    setDraft("");
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!text.trim()) return;
    // 붙여 넣은 키를 입력란에 남기지 않고 바로 가린 목록으로 옮긴다(여러 줄 붙여넣기도 그대로 나눈다).
    event.preventDefault();
    addPending(text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && draft.trim()) {
      event.preventDefault();
      addPending(draft);
    }
  };

  const register = async () => {
    if (!canRegister) return;
    setBusy(true);
    const startRevision = getUserAiSnapshot().revision;
    const results: RegisterOutcome[] = [];
    let current = getUserAiSnapshot().configuration;
    try {
      for (const item of pending) {
        const provider = item.provider;
        if (!provider || !isQuickKeyProvider(provider)) continue;
        const name = providerName(provider);
        const existing = findQuickKeyConnection(current, provider);
        const verification = await verifyQuickKey(provider, item.key);
        if (verification.status === "rejected") {
          results.push({ id: item.id, tone: "error", text: `${name} 키가 거절됐어요. 키가 맞는지, 만료되지 않았는지 확인해 주세요. 등록하지 않았어요.` });
          continue;
        }
        const added = addQuickKey(current, provider, item.key, {
          // 이미 있는 연결은 사용자가 고른 모델을 그대로 두고 키만 더한다.
          model: existing ? undefined : verification.model,
          allowPaid: consent,
        });
        current = added.configuration;
        if (added.duplicate) {
          results.push({ id: item.id, tone: "warn", text: `${name} 키는 이미 등록돼 있어요.` });
        } else if (verification.status === "verified") {
          results.push({ id: item.id, tone: "ok", text: `${name} 키를 확인하고 등록했어요.` });
        } else {
          results.push({ id: item.id, tone: "warn", text: `${name} 키를 등록했어요. ${verification.reason} — 첫 실행 때 다시 확인돼요.` });
        }
      }
      if (getUserAiSnapshot().revision !== startRevision) {
        setOutcomes([{ id: -1, tone: "error", text: "확인하는 동안 AI 설정이 바뀌었어요. 다시 등록해 주세요." }]);
        return;
      }
      setUserAiConfiguration(current);
      const skippedImageKeys = pending.filter((item) => item.provider === "fal");
      for (const item of skippedImageKeys) {
        results.push({ id: item.id, tone: "warn", text: "fal.ai 이미지 키는 연동 키 화면에서 등록해요. 아래 링크로 이동해 주세요." });
      }
      setOutcomes(results);
      setPending([]);
      setConsent(false);
    } catch (error) {
      setOutcomes([{ id: -1, tone: "error", text: error instanceof Error ? error.message : "키를 등록하지 못했어요." }]);
    } finally {
      setBusy(false);
    }
  };

  const removeKey = (connection: UserAiConnection, keyId: string) => {
    setUserAiConfiguration(removeQuickKey(getUserAiSnapshot().configuration, connection.id, keyId));
  };

  return (
    <section className="space-y-4" aria-labelledby={`${idBase}-title`} data-ai-quick-key-panel="true">
      <div className="rounded-2xl border border-line bg-panel/50 p-4 sm:p-5">
        <h3 id={`${idBase}-flow-title`} className="font-bold">지금 AI는 이렇게 동작해요</h3>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2" aria-labelledby={`${idBase}-flow-title`}>
          <li className="flex items-start gap-3 rounded-xl border border-line bg-card/60 p-3" data-ai-flow-step="my-keys">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-sm font-black text-accent">1</span>
            <span className="min-w-0">
              <strong className="block text-sm">내 키</strong>
              <span className="mt-0.5 block text-xs leading-5 text-fg-3">
                {keyCount > 0 ? `등록한 키 ${keyCount}개를 먼저 써요.` : "등록한 키가 없으면 건너뛰어요."}
              </span>
            </span>
          </li>
          <li className="flex items-start gap-3 rounded-xl border border-line bg-card/60 p-3" data-ai-flow-step="toonstudio-ai">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-good/10 text-good" aria-hidden>
              <Sparkles size={15} />
            </span>
            <span className="min-w-0">
              <strong className="block text-sm">ToonStudio AI <span className="font-semibold text-good">· 키·비용 없이</span></strong>
              <span className="mt-0.5 block text-xs leading-5 text-fg-3">
                {premium?.configured
                  ? `고성능 AI(하루 ${premium.userDailyRequestLimit}회까지) → 무료 AI 순서로 이어서 처리해요. 로그인만 하면 돼요.`
                  : poolStatus?.configured
                    ? "무료 AI가 성능 순서로 이어서 처리해요. 로그인만 하면 돼요."
                    : poolStatus
                      ? "지금은 준비 중이에요. 내 키를 등록하면 바로 쓸 수 있어요."
                      : "상태를 확인하는 중이에요."}
              </span>
            </span>
          </li>
        </ol>
      </div>

      <div className="rounded-2xl border border-accent/30 bg-panel/80 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent" aria-hidden>
            <KeyRound size={19} />
          </span>
          <div className="min-w-0">
            <h3 id={`${idBase}-title`} className="font-bold">내 키 등록 <span className="text-sm font-semibold text-fg-3">(선택)</span></h3>
            <p className="mt-1 text-sm leading-6 text-fg-2">
              API 키를 붙여 넣으면 어느 서비스 키인지 알아보고 주소·모델은 자동으로 맞춰요. 여러 개를 한꺼번에 붙여 넣어도 돼요.
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <label htmlFor={`${idBase}-key`} className="sr-only">API 키 붙여넣기</label>
          <input
            id={`${idBase}-key`}
            type="password"
            className={INPUT}
            value={draft}
            autoComplete="off"
            spellCheck={false}
            placeholder="여기에 API 키를 붙여 넣으세요"
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
          />
          <button type="button" className={BUTTON} disabled={busy || !draft.trim()} onClick={() => addPending(draft)}>
            <Plus size={16} aria-hidden /> 추가
          </button>
        </div>

        {pending.length > 0 && (
          <ul className="mt-3 space-y-2" aria-label="등록할 키">
            {pending.map((item) => {
              const provider = item.provider;
              const options = item.candidates.length > 1 || !provider
                ? (item.candidates.length ? [...item.candidates, ...AI_KEY_PROVIDER_PICK_ORDER.filter((id) => !item.candidates.includes(id))] : AI_KEY_PROVIDER_PICK_ORDER)
                : null;
              return (
                <li key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card/60 px-3 py-2" data-ai-pending-key={provider ?? "unknown"}>
                  <code className="text-xs text-fg-2">{maskAiKey(item.key)}</code>
                  {options ? (
                    <label className="flex min-w-0 items-center gap-2 text-xs text-fg-2">
                      <span>{provider ? "서비스" : "어느 서비스 키인가요?"}</span>
                      <select
                        className="min-h-11 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                        value={provider ?? ""}
                        onChange={(event) => {
                          const value = event.target.value as AiKeyProviderId;
                          setPending((current) => current.map((entry) => (entry.id === item.id ? { ...entry, provider: value || null } : entry)));
                        }}
                      >
                        <option value="">선택해 주세요</option>
                        {options.map((id) => (
                          <option key={id} value={id}>{`${providerName(id)} · ${AI_KEY_PROVIDERS[id].cost === "paid" ? "유료" : "무료"}`}</option>
                        ))}
                      </select>
                    </label>
                  ) : provider ? (
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <CheckCircle2 size={15} className="text-good" aria-hidden />
                      {`${providerName(provider)} 키예요`}
                    </span>
                  ) : null}
                  {provider === "fal" ? (
                    <span className="text-xs text-fg-3">이미지 생성 키는 연동 키 화면에서 등록해요.</span>
                  ) : provider ? costBadge(AI_KEY_PROVIDERS[provider].cost === "paid") : null}
                  <button
                    type="button"
                    className={`${ICON_BUTTON} ml-auto`}
                    aria-label={`${maskAiKey(item.key)} 키 빼기`}
                    onClick={() => setPending((current) => current.filter((entry) => entry.id !== item.id))}
                  >
                    <X size={16} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {needsPaidConsent && (
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>유료 서비스 키는 쓸 때마다 내 계정에 비용이 청구될 수 있어요. 등록하면 AI 기능이 이 키를 먼저 써요.</span>
          </label>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={PRIMARY_BUTTON} disabled={!canRegister} onClick={() => void register()}>
            {busy ? "키 확인 중…" : registrable.length > 1 ? `키 ${registrable.length}개 등록` : "등록"}
          </button>
          <button type="button" className={`${BUTTON} border-transparent text-fg-2 hover:border-line`} onClick={onOpenAdvancedWizard}>
            목록에 없는 서비스 직접 연결
          </button>
          <a className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-accent" href="/settings/api-keys">
            이미지·음성 연동 키 <ExternalLink size={14} aria-hidden />
          </a>
        </div>

        {outcomes.length > 0 && (
          <ul className="mt-3 space-y-1.5" role="status" aria-live="polite">
            {outcomes.map((outcome) => (
              <li
                key={`${outcome.id}-${outcome.text}`}
                className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${outcome.tone === "ok" ? "bg-good/10 text-good" : outcome.tone === "warn" ? "bg-warn/10 text-fg-2" : "bg-bad/10 text-bad"}`}
              >
                {outcome.tone === "ok" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden /> : <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />}
                <span>{outcome.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {connections.length > 0 && (
        <div className="rounded-2xl border border-line bg-panel/50 p-4 sm:p-5">
          <h3 id={`${idBase}-registered-title`} className="font-bold">등록한 키</h3>
          <p className="mt-1 text-xs leading-5 text-fg-3">위에서부터 먼저 쓰고, 한도나 인증 오류가 나면 다음 키로 넘어가요. 순서는 "AI 사용 순서"에서 바꿀 수 있어요.</p>
          <ul className="mt-3 space-y-2" aria-labelledby={`${idBase}-registered-title`}>
            {connections.map((connection) => {
              const provider = quickKeyProviderOf(connection);
              const keys = userAiConnectionApiKeys(connection);
              return (
                <li key={connection.id} className="rounded-xl border border-line bg-card/60 p-3" data-ai-registered-connection={provider ?? "custom"}>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">{provider ? providerName(provider) : connection.label}</strong>
                    {costBadge(connection.costPolicy === "user-funded-byok")}
                    <span className="truncate text-xs text-fg-3">{connection.textModel || connection.imageModel}</span>
                    {connection.enabled === false && <span className="text-xs font-semibold text-warn">꺼짐</span>}
                  </div>
                  <ul className="mt-2 space-y-1">
                    {keys.map((key) => (
                      <li key={key.id} className="flex items-center gap-2 text-xs text-fg-2">
                        <code>{maskAiKey(key.apiKey)}</code>
                        <span className="text-fg-3">{key.label}</span>
                        <button
                          type="button"
                          className={`${ICON_BUTTON} ml-auto`}
                          aria-label={`${provider ? providerName(provider) : connection.label} ${key.label} 삭제`}
                          onClick={() => removeKey(connection, key.id)}
                        >
                          <Trash2 size={15} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
