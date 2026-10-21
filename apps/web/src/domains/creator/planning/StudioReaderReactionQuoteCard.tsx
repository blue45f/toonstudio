/**
 * 독자 반응 인용 카드 표면 (F3 — 체크리스트 '독자 반응 인용 카드' 병합).
 *
 * 기획 시작 화면(회차 시놉시스 표면 상단)에 장착된다. 직전 회차까지의
 * 실집계 반응(조회·잔존·유입)을 인용 문장으로 보여 주고, 버튼 한 번으로
 * 그 인용을 다음 회차 기획 메모(readerReactionMemo)로 저장하게 한다.
 *
 * 정직성 (studio-reader-reaction-quote.ts 모델이 강제):
 * - 실집계가 없으면 인용 숫자를 만들지 않고 빈 상태 안내만 낸다.
 *   데이터가 없는 프로젝트에서도 이 안내가 기획 시작 화면에 그대로 뜬다.
 * - 좋아요·댓글·구독·별점·댓글 문장처럼 수집되지 않은 지표는 숫자를
 *   지어내지 않고 "미수집" 목록으로 분리해 보여 준다.
 * - prop(episodeMetrics)이 없으면 아무것도 그리지 않는다 — 비트 보드·
 *   커버리지 맵의 선택 prop 규약과 같다.
 */
import { useMemo } from "react";
import type { EpisodeMetricsLoad } from "./studio-episode-metrics-overlay";
import { buildReaderReactionQuoteCard } from "./studio-reader-reaction-quote";

export interface StudioReaderReactionQuoteCardProps {
  /** 회차 성과(실집계) 입력. 호스트가 resolveEpisodeMetricsLoad 로 접어서 넘긴다. */
  readonly episodeMetrics?: EpisodeMetricsLoad | null;
  /** 메모 저장 대상 회차의 표시 이름 (예: "4화"). 없으면 저장 버튼을 숨긴다. */
  readonly memoTargetLabel?: string | null;
  /** 대상 회차에 이미 저장된 기획 메모. 없으면 null. */
  readonly savedMemo?: string | null;
  /** 인용 본문을 대상 회차의 기획 메모로 저장하는 콜백. */
  readonly onSaveMemo?: (memo: string) => void;
}

export function StudioReaderReactionQuoteCard({
  episodeMetrics,
  memoTargetLabel,
  savedMemo,
  onSaveMemo,
}: StudioReaderReactionQuoteCardProps) {
  const model = useMemo(
    () => (episodeMetrics ? buildReaderReactionQuoteCard(episodeMetrics) : null),
    [episodeMetrics],
  );

  if (!model) return null;

  const alreadySaved =
    model.memoText !== null && savedMemo !== null && savedMemo !== undefined &&
    savedMemo === model.memoText;
  const canSave = model.memoText !== null && Boolean(onSaveMemo) && Boolean(memoTargetLabel);

  return (
    <section aria-label="독자 반응 인용 카드">
      <h2>이전 회차 독자 반응</h2>
      <p>다음 회차를 짜기 전에, 이미 발행한 회차에 독자가 어떻게 반응했는지 실집계로만 인용해요.</p>

      {model.quotes.length === 0 ? (
        <>
          <p role="status">{model.emptyLine}</p>
          <p>
            좋아요·댓글·구독·별점·댓글 문장은 수집 저장소가 없어, 데이터가 쌓여도
            지어내지 않고 미수집으로 표시해요.
          </p>
        </>
      ) : (
        <>
          <ul aria-label="독자 반응 인용">
            {model.quotes.map((quote) => (
              <li key={quote.id}>
                <blockquote>
                  <strong>{quote.label}</strong>
                  {" — "}
                  {quote.text}
                </blockquote>
              </li>
            ))}
          </ul>

          <section aria-label="미수집 지표">
            <h3>아직 수집되지 않은 지표</h3>
            <ul>
              {model.uncollected.map((item) => (
                <li key={item.key}>
                  {item.label} — 미수집 ({item.reason})
                </li>
              ))}
            </ul>
          </section>

          {savedMemo ? (
            <section aria-label="저장된 독자 반응 기획 메모">
              <h3>{memoTargetLabel ? `${memoTargetLabel} 기획 메모에 저장된 인용` : "기획 메모에 저장된 인용"}</h3>
              <p style={{ whiteSpace: "pre-line" }}>{savedMemo}</p>
            </section>
          ) : null}

          {canSave &&
            (alreadySaved ? (
              <p role="status">
                이 반응은 이미 {memoTargetLabel} 기획 메모에 저장돼 있어요.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (model.memoText) onSaveMemo?.(model.memoText);
                }}
              >
                이 반응을 {memoTargetLabel} 기획 메모로 저장
              </button>
            ))}
        </>
      )}
    </section>
  );
}
