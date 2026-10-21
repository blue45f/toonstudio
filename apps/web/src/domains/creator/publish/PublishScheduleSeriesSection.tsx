/**
 * 게시 명령 센터 아래에 붙는 예약 발행 섹션.
 *
 * 시리즈가 연결된 게시 동선(seriesId)에서만 나타나며, 회차 목록은 게시
 * 명령 센터와 같은 서버 API(`getSeries`)에서 읽는다. 예약 자체는 서버
 * API가 아직 없어 `publish-schedule-store`가 브라우저 localStorage에만
 * 저장한다 — 그 사실을 숨기지 않고 패널 위에 고지로 명시한다.
 *
 * 상태: 로딩 / 불러오기 실패(재시도) / 예약 가능 회차 없음(빈 상태) /
 * 패널 표시. seriesId가 없으면 아무것도 그리지 않는다(호출부가 연결된
 * 시리즈가 있을 때만 마운트한다).
 */
import { useEffect, useState } from "react";

import { getSeries, type SeriesDetail } from "@/platform/creator-client";

import { Container } from "@/shared/components/container";
import { useT } from "@/shared/lib/i18n";

import { PublishSchedulePanel } from "./PublishSchedulePanel";
import { publishScheduleEpisodeOptions } from "./publish-schedule-series";
import "./publish-schedule.css";
import "./publish-schedule-i18n";

type SectionState =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly series: SeriesDetail };

export function PublishScheduleSeriesSection({
  seriesId,
}: {
  readonly seriesId: string | null;
}) {
  const t = useT();
  const lt = (fallback: string, key: string) => {
    const translated = t(key, fallback);
    return translated === key ? fallback : translated;
  };
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SectionState>({ kind: "loading" });

  useEffect(() => {
    if (!seriesId) return;
    let alive = true;
    const controller = new AbortController();
    setState({ kind: "loading" });
    getSeries(seriesId, controller.signal).then(
      (series) => {
        if (alive) setState({ kind: "ready", series });
      },
      () => {
        if (alive && !controller.signal.aborted) setState({ kind: "error" });
      },
    );
    return () => {
      alive = false;
      controller.abort();
    };
  }, [seriesId, attempt]);

  if (!seriesId) return null;

  return (
    <Container size="wide" className="pb-10">
      <section
        aria-label={lt("예약 발행", "studio.publish.schedule.title")}
        data-testid="publish-schedule-series-section"
        className="rounded-2xl border border-line bg-card p-4 text-fg sm:p-5"
      >
        {state.kind === "loading" ? (
          <p role="status" aria-busy="true" className="text-sm text-fg-2">
            {lt("예약할 회차를 불러오는 중…", "studio.publish.schedule.sectionLoading")}
          </p>
        ) : state.kind === "error" ? (
          <div role="alert">
            <p className="text-sm font-semibold text-fg">
              {lt(
                "시리즈 회차를 불러오지 못했어요. 예약 발행은 회차 목록이 필요합니다.",
                "studio.publish.schedule.sectionLoadError",
              )}
            </p>
            <button
              type="button"
              className="psched__btn mt-3"
              onClick={() => setAttempt((value) => value + 1)}
            >
              {lt("다시 불러오기", "studio.publish.schedule.retryLoad")}
            </button>
          </div>
        ) : publishScheduleEpisodeOptions(state.series).length === 0 ? (
          <p className="text-sm text-fg-2">
            {lt(
              "예약할 수 있는 회차가 없어요. 게시되지 않은 회차가 생기면 여기서 예약할 수 있습니다.",
              "studio.publish.schedule.sectionEmptyEpisodes",
            )}
          </p>
        ) : (
          <>
            <p
              role="note"
              className="mb-4 rounded-xl border border-warn/35 bg-warn/10 px-3 py-2 text-xs leading-5 text-fg-2"
            >
              {lt(
                "예약과 발행 패턴은 지금은 이 브라우저에만 저장됩니다(localStorage). 서버 발행과 자동으로 이어지지 않으니, 예약 시각이 되면 게시 명령 센터에서 직접 게시해 주세요.",
                "studio.publish.schedule.localOnlyNotice",
              )}
            </p>
            <PublishSchedulePanel
              seriesId={state.series.id}
              seriesTitle={state.series.title}
              episodes={publishScheduleEpisodeOptions(state.series)}
            />
          </>
        )}
      </section>
    </Container>
  );
}
