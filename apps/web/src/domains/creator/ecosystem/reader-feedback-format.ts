/**
 * 요약 화면의 문구 조립 — 숫자·구간·읽은 정도를 현재 언어의 짧은 말로 바꾼다.
 *
 * 동적 값(숫자·제목)은 문구 쌍 자체에 끼워 넣지 않고 `{이름}` 자리표시자로 두었다가 `formatI18nTemplate`로 채운다.
 * 그래야 값마다 새 번역 키가 생기지 않고, 같은 문구가 한 번만 번역 대상이 된다.
 */
import { formatI18nTemplate } from "@/shared/lib/i18n-bilingual-copy";

import type { ReaderFeedbackReading } from "./reader-feedback-schema";
import type { DropOffBin, ReaderFeedbackGroup } from "./reader-feedback-summary";

/** `useBilingual`이 돌려주는 함수와 같은 모양. */
export type Localize = (ko: string, en: string) => string;

export function countText(bt: Localize, count: number): string {
  return formatI18nTemplate(bt("{n}명", "{n}"), { n: count });
}

/** 평균 점수. 답한 사람이 없으면 줄표. */
export function meanText(mean: number | null): string {
  return mean === null ? "—" : mean.toFixed(1);
}

/**
 * 묶음 이름의 두 부분: 제목(독자가 쓴 글이라 화면이 `<bdi>`로 격리해 그린다)과 그 뒤에 붙는 회차·구분 표시.
 * 제목·회차가 같은 다른 대상이 있으면 id 끝자리로 구분한다.
 */
export function groupLabelParts(bt: Localize, group: Pick<ReaderFeedbackGroup, "title" | "episode" | "id" | "needsDisambiguation">): { readonly title: string; readonly suffix: string } {
  const episode = group.episode === null ? "" : formatI18nTemplate(bt(" {n}화", " · Ep. {n}"), { n: group.episode });
  const idSuffix = group.needsDisambiguation && group.id ? ` · …${group.id.slice(-4)}` : "";
  return { title: group.title, suffix: `${episode}${idSuffix}` };
}

export function cutRangeText(bt: Localize, bin: Pick<DropOffBin, "from" | "to">): string {
  return bin.from === bin.to
    ? formatI18nTemplate(bt("{n}컷", "Cut {n}"), { n: bin.from })
    : formatI18nTemplate(bt("{from}~{to}컷", "Cuts {from}–{to}"), { from: bin.from, to: bin.to });
}

export function scrollRangeText(bt: Localize, bin: Pick<DropOffBin, "from" | "to">): string {
  return formatI18nTemplate(bt("{from}~{to}%", "{from}–{to}%"), { from: bin.from, to: bin.to });
}

/**
 * 가장 많이 멈춘 구간을 짧게. 동률이면 첫 구간 뒤에 나머지 곳 수와 각각의 인원을 밝혀(첫 구간만 있는 것처럼 보이지 않게) 줄이고,
 * 없으면 줄표다. 동률인 구간 전체는 자세한 요약이 나열한다.
 */
export function peakSummaryText(bt: Localize, peaks: readonly DropOffBin[], rangeLabel: (bin: DropOffBin) => string): string {
  const [first] = peaks;
  if (!first) return "—";
  const count = countText(bt, first.count);
  if (peaks.length === 1) return `${rangeLabel(first)} (${count})`;
  return formatI18nTemplate(bt("{range} 외 {more}곳 동률 (각 {count})", "{range} and {more} more tied ({count} each)"), { range: rangeLabel(first), more: peaks.length - 1, count });
}

/** 한 응답이 읽은 정도를 말로. */
export function readingText(bt: Localize, reading: ReaderFeedbackReading): string {
  if (reading.status === "unmarked") return bt("읽은 정도 표시 없음", "Didn't say how far");
  if (reading.status === "finished") return bt("끝까지 읽음", "Finished");
  const point = reading.point;
  return point.mode === "cut"
    ? formatI18nTemplate(bt("{n}컷에서 멈춤", "Stopped at cut {n}"), { n: point.cut })
    : formatI18nTemplate(bt("스크롤 {n}% 지점에서 멈춤", "Stopped at {n}% scroll"), { n: point.percent });
}
