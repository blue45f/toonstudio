import {
  AlertTriangle,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import "../admin-i18n-loader";
import { adminButtonClass, adminFetch, type AdminApiError } from "./admin-client";
import {
  AdminCard,
  AdminNotice,
  AdminSpinner,
  adminInputClass,
} from "./admin-ui";
import { formatNumber } from "@toonstudio/core/format";

import { getCurrentUiLocale } from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";

interface PaidOperationsState {
  paidOperationsEnabled: boolean;
}

/**
 * 유료 운영 마스터 스위치(어드민 전용).
 */
export function AdminPaidOperationsToggle({ uid }: { uid: string }) {
  const t = useT();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const next = await adminFetch<PaidOperationsState>(
        "/membership/paid-operations",
        uid,
      );
      setEnabled(next.paidOperationsEnabled === true);
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async () => {
    if (enabled === null || busy) return;
    const next = !enabled;
    setBusy(true);
    setError("");
    try {
      const saved = await adminFetch<PaidOperationsState>(
        "/membership/paid-operations",
        uid,
        { method: "POST", body: JSON.stringify({ enabled: next }) },
      );
      setEnabled(saved.paidOperationsEnabled === true);
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard className="border-accent/30">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-accent">
            PAID OPERATIONS GATE
          </p>
          <h2 className="mt-1 text-xl font-bold text-fg">
            {t("admin.paidOperations.title")}
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-fg-3">
            {t("admin.paidOperations.desc")}
          </p>
        </div>
        <span
          className={
            "rounded-full border px-3 py-1 text-xs font-bold "
            + (enabled
              ? "border-warn/40 bg-warn/10 text-warn"
              : "border-good/40 bg-good/10 text-good")
          }
        >
          {enabled
            ? t("admin.paidOperations.enabled")
            : t("admin.paidOperations.disabled")}
        </span>
      </div>

      {enabled === null ? (
        error ? (
          <div className="mt-5" role="alert">
            <p className="text-sm text-bad">
              {t("admin.paidOperations.loadFailed")}
            </p>
            <button
              type="button"
              className={`${adminButtonClass("ghost")} mt-3`}
              onClick={() => void load()}
            >
              {t("admin.paidOperations.retry")}
            </button>
          </div>
        ) : (
          <AdminSpinner />
        )
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={
              enabled
                ? t("admin.paidOperations.toggleOff")
                : t("admin.paidOperations.toggleOn")
            }
            disabled={busy}
            onClick={() => void toggle()}
            className={
              "min-h-10 rounded-full border px-4 text-sm font-bold "
              + (enabled
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2")
            }
          >
            {busy
              ? t("admin.paidOperations.saving")
              : enabled
                ? t("admin.paidOperations.toggleOff")
                : t("admin.paidOperations.toggleOn")}
          </button>
          <p className="text-[11px] leading-4 text-fg-3">
            {t("admin.paidOperations.freeNote")}
          </p>
        </div>
      )}
      {enabled !== null && error ? (
        <p role="alert" className="mt-3 text-xs text-bad">
          {t("admin.paidOperations.saveFailed")}
        </p>
      ) : null}
    </AdminCard>
  );
}

type PolicyState = {
  economy: {
    mode: string;
    paymentsEnabled: boolean;
    studioCreditsEnabled: boolean;
    membershipCreditsEnabled: boolean;
    creditPurchasesEnabled: boolean;
  };
  plans: Array<{
    id: string;
    label: string;
    description: string;
    entitlements: Record<string, number | boolean>;
  }>;
  activityRewards: Array<{
    key: string;
    label: string;
    points: number;
    dailyGrantLimit: number;
    cooldownSeconds: number;
  }>;
  overrides: Array<{
    key: string;
    value: unknown;
    active: boolean;
  }>;
};
type UserOverview = {
  membership: {
    planId: string;
    grants: Array<{
      id: string;
      planId: string;
      source: string;
      endsAt?: string | null;
    }>;
  };
  wallet: {
    points: {
      available: number;
      lifetimeGranted: number;
      lifetimeSpent: number;
    };
    studioCredits: {
      available: number;
      lifetimeGranted: number;
      lifetimeSpent: number;
    };
  };
  levels: {
    creatorLevel: string;
    trustLevel: string;
    sellerLevel: string;
    trustScore: number;
  };
};

const creatorLevels = [
  "new", "verified", "active", "trusted", "professional", "partner",
];
const trustLevels = ["new", "verified", "trusted", "restricted"];
const sellerLevels = ["none", "starter", "verified", "professional"];

export function AdminMembershipPolicy({ uid }: { uid: string }) {
  const t = useT();
  const [policy, setPolicy] = useState<PolicyState | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [targetUserId, setTargetUserId] = useState("");
  const [user, setUser] = useState<UserOverview | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [delta, setDelta] = useState("100");
  const [reason, setReason] = useState(() => t("admin.membership.defaultReason"));
  const [planId, setPlanId] = useState("creator");
  const [durationDays, setDurationDays] = useState("30");
  const [creatorLevel, setCreatorLevel] = useState("new");
  const [trustLevel, setTrustLevel] = useState("new");
  const [sellerLevel, setSellerLevel] = useState("none");
  const [trustScore, setTrustScore] = useState("0");
  const [overrideKey, setOverrideKey] = useState("activity:community.comment.created");
  const [overrideJson, setOverrideJson] = useState('{"points":3,"dailyGrantLimit":10,"cooldownSeconds":20}');
  const [message, setMessage] = useState("");

  const loadPolicy = useCallback(async () => {
    setPolicyError(null);
    try {
      setPolicy(await adminFetch<PolicyState>("/membership/policy", uid));
    } catch (error) {
      setPolicyError((error as AdminApiError).message);
    }
  }, [uid]);

  useEffect(() => {
    void loadPolicy();
  }, [loadPolicy]);
  const loadUser = useCallback(async () => {
    const id = targetUserId.trim();
    if (!id) return;
    setUserError(null);
    setMessage("");
    try {
      const next = await adminFetch<UserOverview>(
        "/membership/users/" + encodeURIComponent(id),
        uid,
      );
      setUser(next);
      setCreatorLevel(next.levels.creatorLevel);
      setTrustLevel(next.levels.trustLevel);
      setSellerLevel(next.levels.sellerLevel);
      setTrustScore(String(next.levels.trustScore ?? 0));
    } catch (error) {
      setUser(null);
      setUserError((error as AdminApiError).message);
    }
  }, [targetUserId, uid]);

  const mutate = async (
    path: string,
    body: Record<string, unknown>,
    success: string,
  ) => {
    setBusy(true);
    setMessage("");
    setUserError(null);
    try {
      await adminFetch(path, uid, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMessage(success);
      if (targetUserId.trim()) await loadUser();
      await loadPolicy();
    } catch (error) {
      setUserError((error as AdminApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const applyPointAdjustment = () => {
    const id = targetUserId.trim();
    if (!id) return;
    void mutate(
      "/membership/users/" + encodeURIComponent(id) + "/wallet-adjustments",
      {
        asset: "reward_point",
        delta: Number(delta),
        requestKey: crypto.randomUUID(),
        reason: reason.trim(),
      },
      t("admin.membership.adjustSuccess"),
    );
  };
  const applyMembership = () => {
    const id = targetUserId.trim();
    if (!id) return;
    void mutate(
      "/membership/users/" + encodeURIComponent(id) + "/memberships",
      {
        planId,
        durationDays: Number(durationDays),
        requestKey: crypto.randomUUID(),
        reason: "관리자 멤버십 부여",
      },
      t("admin.membership.grantSuccess"),
    );
  };

  const applyLevels = () => {
    const id = targetUserId.trim();
    if (!id) return;
    void mutate(
      "/membership/users/" + encodeURIComponent(id) + "/levels",
      {
        creatorLevel,
        trustLevel,
        sellerLevel,
        trustScore: Number(trustScore),
      },
      t("admin.membership.levelsSuccess"),
    );
  };
  const applyOverride = async () => {
    let value: unknown;
    try {
      value = JSON.parse(overrideJson);
    } catch {
      setPolicyError(t("admin.membership.overrideJsonError"));
      return;
    }
    setBusy(true);
    setPolicyError(null);
    setMessage("");
    try {
      await adminFetch(
        "/membership/policy/" + encodeURIComponent(overrideKey.trim()),
        uid,
        {
          method: "POST",
          body: JSON.stringify({ value, active: true }),
        },
      );
      setMessage(t("admin.membership.overrideSuccess"));
      await loadPolicy();
    } catch (error) {
      setPolicyError((error as AdminApiError).message);
    } finally {
      setBusy(false);
    }
  };

  if (!policy && !policyError) return <AdminSpinner />;
  return (
    <section className="mt-8 border-t border-line pt-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black tracking-[0.13em] text-accent">
            MEMBERSHIP POLICY ENGINE
          </p>
          <h2 className="mt-1 text-xl font-bold text-fg">
            {t("admin.membership.title")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-3">
            {t("admin.membership.desc")}
          </p>
        </div>
        <button
          type="button"
          className={adminButtonClass("ghost")}
          onClick={() => void loadPolicy()}
        >
          <RefreshCw size={14} /> {t("admin.membership.refreshPolicy")}
        </button>
      </div>

      {policyError ? (
        <div className="mt-4">
          <AdminNotice title={t("admin.membership.policyErrorTitle")} body={policyError} />
        </div>
      ) : null}
      {policy ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-line bg-panel/55 p-4">
            <ShieldCheck size={18} className="text-accent" />
            <h3 className="mt-3 font-semibold text-fg">{t("admin.membership.economyTitle")}</h3>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-3">{t("admin.membership.economyMode")}</dt>
                <dd className="font-semibold text-fg">{policy.economy.mode}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-3">{t("admin.membership.economyPayments")}</dt>
                <dd className="font-semibold text-fg">
                  {policy.economy.paymentsEnabled ? t("admin.membership.enabled") : t("admin.membership.disabled")}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-3">{t("admin.membership.economyCreditPurchases")}</dt>
                <dd className="font-semibold text-fg">
                  {policy.economy.creditPurchasesEnabled ? t("admin.membership.enabled") : t("admin.membership.disabled")}
                </dd>
              </div>
            </dl>
          </article>
          <article className="rounded-2xl border border-line bg-panel/55 p-4 lg:col-span-2">
            <h3 className="font-semibold text-fg">{t("admin.membership.rewardsTitle")}</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {policy.activityRewards.map((reward) => (
                <div
                  key={reward.key}
                  className="rounded-xl border border-line bg-card/45 px-3 py-2.5 text-xs"
                >
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold text-fg">{reward.label}</span>
                    <span className="font-bold text-accent">+{reward.points} P</span>
                  </div>
                  <p className="mt-1 text-fg-3">
                    {t("admin.membership.rewardCadence", { limit: reward.dailyGrantLimit, seconds: reward.cooldownSeconds })}
                  </p>
                </div>
              ))}
            </div>
          </article>
        </div>
      ) : null}

      <div className="mt-5">
        <AdminPaidOperationsToggle uid={uid} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-line bg-panel/55 p-4">
          <h3 className="flex items-center gap-2 font-semibold text-fg">
            <Search size={16} /> {t("admin.membership.userOpsTitle")}
          </h3>
          <div className="mt-3 flex gap-2">
            <input
              className={adminInputClass}
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value)}
              placeholder={t("admin.membership.userIdPlaceholder")}
            />
            <button
              type="button"
              className={adminButtonClass("ghost")}
              onClick={() => void loadUser()}
            >
              {t("admin.membership.lookup")}
            </button>
          </div>

          {userError ? <p className="mt-3 text-xs text-bad">{userError}</p> : null}
          {message ? <p className="mt-3 text-xs text-good">{message}</p> : null}

          {user ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                {[
                  [t("admin.membership.statMembership"), user.membership.planId],
                  [t("admin.membership.statPoints"), formatNumber(user.wallet.points.available) + " P"],
                  ["Credit", formatNumber(user.wallet.studioCredits.available) + " C"],
                  ["Trust", user.levels.trustLevel],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-line bg-card/45 p-3">
                    <p className="text-[0.68rem] text-fg-3">{label}</p>
                    <p className="mt-1 font-bold text-fg">{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-fg-2">{t("admin.membership.pointsAdjustTitle")}</p>
                <div className="grid gap-2 sm:grid-cols-[7rem_1fr_auto]">
                  <input type="number" className={adminInputClass} value={delta}
                    onChange={(event) => setDelta(event.target.value)}
                    aria-label={t("admin.membership.pointsDeltaLabel")} />
                  <input className={adminInputClass} value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={t("admin.membership.adjustReasonPlaceholder")} />
                  <button type="button" className={adminButtonClass("accent")}
                    disabled={busy || Number(delta) === 0}
                    onClick={applyPointAdjustment}>{t("admin.membership.apply")}</button>
                </div>
                <p className="mt-1 text-[0.68rem] text-fg-3">
                  {t("admin.membership.pointsAdjustNote")}
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-fg-2">{t("admin.membership.grantTitle")}</p>
                <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
                  <select className={adminInputClass} value={planId}
                    onChange={(event) => setPlanId(event.target.value)}>
                    {["free", "creator", "pro", "team"].map((plan) => (
                      <option key={plan} value={plan}>{plan}</option>
                    ))}
                  </select>
                  <input type="number" min={1} className={adminInputClass}
                    value={durationDays}
                    onChange={(event) => setDurationDays(event.target.value)}
                    aria-label={t("admin.membership.durationLabel")} />
                  <button type="button" className={adminButtonClass("accent")}
                    disabled={busy} onClick={applyMembership}>{t("admin.membership.grant")}</button>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-fg-2">{t("admin.membership.levelsTitle")}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <select className={adminInputClass} value={creatorLevel}
                    onChange={(event) => setCreatorLevel(event.target.value)}>
                    {creatorLevels.map((level) => (
                      <option key={level} value={level}>Creator · {level}</option>
                    ))}
                  </select>
                  <select className={adminInputClass} value={trustLevel}
                    onChange={(event) => setTrustLevel(event.target.value)}>
                    {trustLevels.map((level) => (
                      <option key={level} value={level}>Trust · {level}</option>
                    ))}
                  </select>
                  <select className={adminInputClass} value={sellerLevel}
                    onChange={(event) => setSellerLevel(event.target.value)}>
                    {sellerLevels.map((level) => (
                      <option key={level} value={level}>Seller · {level}</option>
                    ))}
                  </select>
                  <input type="number" min={0} max={1000}
                    className={adminInputClass} value={trustScore}
                    onChange={(event) => setTrustScore(event.target.value)}
                    aria-label={t("admin.membership.trustScoreLabel")} />
                </div>
                <button type="button"
                  className={adminButtonClass("ghost") + " mt-2"}
                  disabled={busy} onClick={applyLevels}>{t("admin.membership.saveLevels")}</button>
              </div>
            </div>
          ) : null}
        </article>

        <article className="rounded-2xl border border-line bg-panel/55 p-4">
          <h3 className="flex items-center gap-2 font-semibold text-fg">
            <SlidersHorizontal size={16} /> {t("admin.membership.overrideTitle")}
          </h3>
          <p className="mt-2 text-xs leading-5 text-fg-3">
            {t("admin.membership.overrideDesc")}
          </p>
          <label className="mt-4 block text-xs font-semibold text-fg-2">
            {t("admin.membership.overrideKey")}
            <input className={adminInputClass + " mt-1"} value={overrideKey}
              onChange={(event) => setOverrideKey(event.target.value)} />
          </label>
          <label className="mt-3 block text-xs font-semibold text-fg-2">
            {t("admin.membership.overrideValue")}
            <textarea className={adminInputClass + " mt-1 min-h-36 font-mono text-xs"}
              value={overrideJson}
              onChange={(event) => setOverrideJson(event.target.value)} />
          </label>
          <button type="button"
            className={adminButtonClass("accent") + " mt-3"}
            disabled={busy || !overrideKey.trim()}
            onClick={() => void applyOverride()}>{t("admin.membership.savePolicy")}</button>

          {policy?.overrides.length ? (
            <div className="mt-5 space-y-2">
              <p className="text-xs font-semibold text-fg-2">{t("admin.membership.activeOverrides")}</p>
              {policy.overrides.map((override) => (
                <div key={override.key}
                  className="rounded-xl border border-line bg-card/45 px-3 py-2 text-xs">
                  <p className="font-mono font-semibold text-fg">{override.key}</p>
                  <p className="mt-1 truncate font-mono text-fg-3">
                    {JSON.stringify(override.value)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}

type PolicyChange = {
  revision: number | string;
  key: string;
  beforeValue: unknown;
  afterValue: unknown;
  beforeActive: boolean | null;
  afterActive: boolean | null;
  changedBy: string | null;
  changedAt: string;
};

type PendingRecovery = {
  id: string;
  userId: string;
  activity: string;
  sourceRef: string;
  reason: string;
  requestedAmount: number | string;
  reversedAmount: number | string;
  pendingAmount: number | string;
  actorUserId: string | null;
  createdAt: string;
};

export function AdminMembershipOperations({ uid }: { uid: string }) {
  const t = useT();
  const [history, setHistory] = useState<PolicyChange[] | null>(null);
  const [recoveries, setRecoveries] = useState<PendingRecovery[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [policyHistory, pendingRecoveries] = await Promise.all([
        adminFetch<{ items: PolicyChange[] }>(
          "/membership/operations/policy-history?limit=30",
          uid,
        ),
        adminFetch<{ items: PendingRecovery[] }>(
          "/membership/operations/pending-recoveries?limit=30",
          uid,
        ),
      ]);
      setHistory(policyHistory.items);
      setRecoveries(pendingRecoveries.items);
    } catch (loadError) {
      setError((loadError as AdminApiError).message);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!history || !recoveries) {
    if (error) {
      return (
        <AdminNotice
          title={t("admin.membershipOps.errorTitle")}
          body={error}
        />
      );
    }
    return <AdminSpinner />;
  }

  return (
    <section className="mt-6 grid gap-4 xl:grid-cols-2">
      <article className="rounded-2xl border border-line bg-panel/55 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-fg">
              <History size={16} /> {t("admin.membershipOps.historyTitle")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-fg-3">
              {t("admin.membershipOps.historyDesc")}
            </p>
          </div>
          <button
            type="button"
            className={adminButtonClass("ghost")}
            onClick={() => void load()}
          >
            <RefreshCw size={13} /> {t("admin.membershipOps.refresh")}
          </button>
        </div>

        {error ? <p className="mt-3 text-xs text-bad">{error}</p> : null}
        <div className="mt-4 max-h-80 space-y-2 overflow-auto pr-1">
          {history.length === 0 ? (
            <p className="rounded-xl bg-card/45 p-3 text-xs text-fg-3">
              {t("admin.membershipOps.historyEmpty")}
            </p>
          ) : (
            history.map((item) => (
              <div
                key={String(item.revision)}
                className="rounded-xl border border-line bg-card/45 p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="font-semibold text-fg">{item.key}</code>
                  <span className="text-fg-3">rev {String(item.revision)}</span>
                </div>
                <p className="mt-2 break-all font-mono text-[0.68rem] leading-5 text-fg-3">
                  {JSON.stringify(item.beforeValue)} → {JSON.stringify(item.afterValue)}
                </p>
                <p className="mt-1 text-[0.68rem] text-fg-3">
                  {new Date(item.changedAt).toLocaleString(getCurrentUiLocale())}
                  {item.changedBy ? ` · ${item.changedBy}` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      </article>

      <article className="rounded-2xl border border-line bg-panel/55 p-4">
        <h3 className="flex items-center gap-2 font-semibold text-fg">
          <AlertTriangle size={16} /> {t("admin.membershipOps.recoveryTitle")}
        </h3>
        <p className="mt-1 text-xs leading-5 text-fg-3">
          {t("admin.membershipOps.recoveryDesc")}
        </p>
        <div className="mt-4 max-h-80 space-y-2 overflow-auto pr-1">
          {recoveries.length === 0 ? (
            <p className="rounded-xl bg-card/45 p-3 text-xs text-good">
              {t("admin.membershipOps.recoveryEmpty")}
            </p>
          ) : (
            recoveries.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-line bg-card/45 p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-fg">{item.userId}</span>
                  <span className="font-black text-warn">
                    {Number(item.pendingAmount).toLocaleString(getCurrentUiLocale())} P
                  </span>
                </div>
                <p className="mt-1 text-fg-3">
                  {item.activity} · {item.reason}
                </p>
                <p className="mt-1 text-[0.68rem] text-fg-3">
                  {t("admin.membershipOps.recoveryAmounts", { requested: Number(item.requestedAmount).toLocaleString(getCurrentUiLocale()), reversed: Number(item.reversedAmount).toLocaleString(getCurrentUiLocale()) })} ·
                  {new Date(item.createdAt).toLocaleString(getCurrentUiLocale())}
                </p>
              </div>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
