import { Clock3, Eye, History, TriangleAlert } from "lucide-react";
import { useEffect, useMemo } from "react";

import { availabilitySnapshotFingerprint, availabilitySnapshotOf } from "./engagement-model";
import { useEngagement, useEngagementHydrated } from "./engagement-store";

import { buildPricingTransitionsFromSnapshots } from "@/shared/lib/pricing-transition-timeline";
import type { Title } from "@/shared/lib/types";

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatObservedAt(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_TIME.format(date) : value;
}

export function AvailabilityHistoryPanel({ title }: { readonly title: Title }) {
  const observeAvailability = useEngagement((state) => state.observeAvailability);
  const record = useEngagement((state) => state.availabilityHistory[title.id]);
  const hydrated = useEngagementHydrated();
  const fingerprint = useMemo(
    () => availabilitySnapshotFingerprint(availabilitySnapshotOf(title)),
    [title],
  );

  // 복원 전에 관찰하면 기존 기록이 없는 것으로 보여 "첫 기준점"이 잘못
  // 찍히고, 복원 뒤에는 effect가 다시 돌지 않아 이번 방문의 변화가 누락된다.
  useEffect(() => {
    if (hydrated) observeAvailability(title);
  }, [hydrated, fingerprint, observeAvailability, title]);

  const events = record?.events;
  const pricingHighlights = useMemo(
    () =>
      buildPricingTransitionsFromSnapshots(
        (events ?? []).map((event) => ({
          observedAt: event.observedAt,
          status: event.snapshot.status,
          availability: event.snapshot.availability.map((entry) => ({
            platformId: entry.platformId,
            pricing: entry.pricing,
            isOriginal: entry.isOriginal,
          })),
        })),
      ),
    [events],
  );
  const eventList = events ?? [];

  return (
    <section
      data-testid="availability-history-panel"
      className="rounded-2xl border border-line bg-panel/50 p-4"
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <History size={15} aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-fg">이 기기에서 본 변화</h3>
          <p className="mt-1 text-[0.68rem] leading-5 text-fg-3 break-keep">
            방문할 때 확인된 공개 메타데이터만 비교합니다. 플랫폼 공식 가격 이력이나 실제 새 회차 공개를 보증하지 않습니다.
          </p>
        </div>
      </div>

      {pricingHighlights.length > 0 ? (
        <div
          data-testid="availability-history-pricing-highlights"
          className="mt-3 flex flex-wrap gap-1.5 border-t border-line/60 pt-3"
        >
          {pricingHighlights.slice(0, 3).map((highlight) => (
            <span
              key={highlight.id}
              className="rounded-full border border-good/40 bg-good/12 px-2.5 py-0.5 text-[0.68rem] font-bold text-good break-keep"
            >
              {highlight.previousLabel} → {highlight.currentLabel}
            </span>
          ))}
        </div>
      ) : null}

      {eventList.length <= 1 ? (
        <div className="mt-4 flex items-start gap-2 border-t border-line/60 pt-3 text-xs leading-5 text-fg-3 break-keep">
          <Eye className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            {record
              ? `${formatObservedAt(record.firstObservedAt)}에 첫 기준점을 저장했습니다. 다음 방문부터 제공처·가격 방식·연재 상태 변화가 있으면 여기에 표시됩니다.`
              : "첫 기준점을 저장하는 중입니다."}
          </p>
        </div>
      ) : (
        <ol className="mt-4 divide-y divide-line/60 border-t border-line/60">
          {eventList.slice(0, 6).map((event) => (
            <li key={event.id} className="py-3 first:pt-2.5 last:pb-0">
              <div className="flex items-center gap-1.5 text-[0.65rem] tabular-nums text-fg-3">
                <Clock3 size={12} aria-hidden="true" />
                <time dateTime={event.observedAt}>{formatObservedAt(event.observedAt)}</time>
              </div>
              {event.changes.length === 0 ? (
                <p className="mt-1.5 text-xs text-fg-2">첫 관찰 기준점</p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {event.changes.map((change, index) => (
                    <li key={`${change.kind}-${index}`} className="text-xs leading-5 text-fg-2 break-keep">
                      <strong className="font-semibold text-fg">{change.label}</strong>
                      {(change.before || change.after) ? (
                        <span className="ml-1 text-fg-3">{change.before ?? "없음"} → {change.after ?? "없음"}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex items-start gap-2 border-t border-line/50 pt-2.5 text-[0.65rem] leading-5 text-fg-3 break-keep">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden="true" />
        <p>브라우저 데이터 삭제·기기 변경 시 이 관찰 기록도 사라질 수 있습니다.</p>
      </div>
    </section>
  );
}
