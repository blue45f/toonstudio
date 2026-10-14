import { CalendarClock, ShieldAlert, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  DEFAULT_RELEASE_INTERVAL_DAYS,
  DEFAULT_SAFE_BUFFER_COUNT,
  deriveBufferFromSummary,
  deriveReleaseIntervalDays,
  deriveSerializationBuffer,
  episodeBufferFacts,
  planHiatus,
  serializationBufferWarning,
  type SerializationBufferDigest,
} from "./serialization-buffer";

/**
 * 연재 버퍼 방패 표시 — 버퍼 칩(게시 횟수·일수) + 안전선 하회 경고 +
 * 휴재 시나리오 계산. 계산은 전부 serialization-buffer 순수 모듈이 하고,
 * 이 컴포넌트는 표시와 시나리오 입력(시작일·기간)만 소유한다.
 */
export function SerializationBufferShield({
  digest,
  releaseIntervalDays,
}: Readonly<{
  digest: SerializationBufferDigest;
  releaseIntervalDays: number;
}>) {
  const bt = useBilingual("SerializationBufferShield");
  const warning = serializationBufferWarning(digest, bt);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [startsOn, setStartsOn] = useState(todayIso);
  const [weeks, setWeeks] = useState(2);
  const scenario = useMemo(
    () => planHiatus(digest, { startsOn: startsOn || todayIso, weeks, releaseIntervalDays }),
    [digest, startsOn, todayIso, weeks, releaseIntervalDays],
  );
  const toneClass = digest.level === "empty"
    ? "border-danger/40 bg-danger/5"
    : digest.level === "thin"
      ? "border-warn/40 bg-warn/5"
      : "border-line bg-panel/40";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`} data-buffer-level={digest.level}>
      <div className="flex flex-wrap items-center gap-2">
        {digest.level === "safe"
          ? <ShieldCheck size={16} aria-hidden className="text-good" />
          : <ShieldAlert size={16} aria-hidden className={digest.level === "empty" ? "text-danger" : "text-warn"} />}
        <strong className="text-sm font-bold text-fg">
          {bt(`연재 버퍼 ${digest.bufferedReleases}회`, `Buffer: ${digest.bufferedReleases} release(s)`)}
        </strong>
        <span className="text-sm text-fg-2">
          {bt(`약 ${digest.bufferedDays}일분`, `about ${digest.bufferedDays} day(s)`)}
        </span>
        {digest.unknownEpisodeCount > 0 ? (
          <span className="text-xs font-semibold text-fg-3">
            {bt(`판정 불가 ${digest.unknownEpisodeCount}화 제외`, `${digest.unknownEpisodeCount} unassessed episode(s) excluded`)}
          </span>
        ) : null}
      </div>

      {warning ? (
        <p className="mt-2 text-sm leading-6 text-fg-2" role="alert">
          <span className="font-semibold text-fg">{warning.title}. </span>
          {warning.reason}
        </p>
      ) : (
        <p className="mt-2 text-sm leading-6 text-fg-2">
          {bt(
            `안전선 위에 있어요. 이 속도면 ${digest.projectedEmptyDate ?? "-"}까지 게시를 이어갈 수 있어요.`,
            `Above your safety line. At this pace releases are covered until ${digest.projectedEmptyDate ?? "-"}.`,
          )}
        </p>
      )}

      <details className="mt-3">
        <summary className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 text-sm font-semibold text-accent">
          <CalendarClock size={14} aria-hidden /> {bt("휴재 시나리오 계산", "Plan a hiatus")}
        </summary>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-fg-3">
            {bt("휴재 시작일", "Hiatus starts")}
            <input
              type="date"
              value={startsOn}
              onChange={(event) => setStartsOn(event.target.value)}
              className="min-h-10 rounded-xl border border-line bg-card px-3 text-sm text-fg"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-fg-3">
            {bt("휴재 기간 (주)", "Length (weeks)")}
            <input
              type="number"
              min={0}
              max={52}
              value={weeks}
              onChange={(event) => setWeeks(Math.max(0, Number(event.target.value) || 0))}
              className="min-h-10 w-24 rounded-xl border border-line bg-card px-3 text-sm text-fg"
            />
          </label>
        </div>
        <p className="mt-3 text-sm leading-6 text-fg-2" role="status">
          {scenario.gapReleases === 0
            ? bt(
                `버퍼만으로 ${scenario.coveredByBufferWeeks}주를 버틸 수 있어요. 복귀일은 ${scenario.resumeDate}예요.`,
                `The buffer alone covers ${scenario.coveredByBufferWeeks} week(s). You would return on ${scenario.resumeDate}.`,
              )
            : bt(
                `버퍼로 ${scenario.coveredByBufferWeeks}주를 버티고, ${scenario.gapReleases}회는 결방돼요. 버퍼 소진일은 ${scenario.bufferRunsOutOn ?? "-"}, 복귀일은 ${scenario.resumeDate}예요.`,
                `The buffer covers ${scenario.coveredByBufferWeeks} week(s); ${scenario.gapReleases} release(s) would be missed. Buffer runs out on ${scenario.bufferRunsOutOn ?? "-"}; return on ${scenario.resumeDate}.`,
              )}
        </p>
      </details>
    </div>
  );
}

/** 개요 표면용 — aggregate에서 사실·주기·버퍼를 도출해 방패를 그린다. */
export function AggregateBufferShield({
  aggregate,
}: Readonly<{ aggregate: Pick<ProductionProjectAggregate, "episodes" | "releasePlans"> }>) {
  const digest = useMemo(() => {
    const facts = episodeBufferFacts(aggregate.episodes, aggregate.releasePlans ?? []);
    const interval = deriveReleaseIntervalDays([
      ...(aggregate.releasePlans ?? []).map((plan) => plan.scheduledAt),
      ...aggregate.episodes.map((episode) => episode.plannedReleaseAt),
    ]);
    return {
      digest: deriveSerializationBuffer({
        episodes: facts,
        releaseIntervalDays: interval,
        policy: { safeBufferCount: DEFAULT_SAFE_BUFFER_COUNT },
        today: new Date().toISOString().slice(0, 10),
      }),
      interval,
    };
  }, [aggregate]);
  return <SerializationBufferShield digest={digest.digest} releaseIntervalDays={digest.interval} />;
}

/** 연재 센터 현황(요약)용 — readyBufferCount에서 버퍼만 도출한다. 주기는 주 1회 기본값을 명시해 쓴다. */
export function SummaryBufferShield({
  readyBufferCount,
}: Readonly<{ readyBufferCount: number }>) {
  const digest = useMemo(
    () => deriveBufferFromSummary({
      readyBufferCount,
      releaseIntervalDays: DEFAULT_RELEASE_INTERVAL_DAYS,
      policy: { safeBufferCount: DEFAULT_SAFE_BUFFER_COUNT },
      today: new Date().toISOString().slice(0, 10),
    }),
    [readyBufferCount],
  );
  return <SerializationBufferShield digest={digest} releaseIntervalDays={DEFAULT_RELEASE_INTERVAL_DAYS} />;
}
