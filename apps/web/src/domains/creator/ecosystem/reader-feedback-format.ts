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

/** 묶음 이름: 제목 + 회차. 제목·회차가 같은 다른 대상이 있으면 id 끝자리로 구분한다. */
export function groupLabel(bt: Localize, group: Pick<ReaderFeedbackGroup, "title" | "episode" | "id" | "needsDisambiguation">): string {
  const episode = group.episode === null ? "" : formatI18nTemplate(bt(" {n}화", " · Ep. {n}"), { n: group.episode });
  const suffix = group.needsDisambiguation && group.id ? ` · …${group.id.slice(-4)}` : "";
  return `${group.title}${episode}${suffix}`;
}

export function cutRangeText(bt: Localize, bin: Pick<DropOffBin, "from" | "to">): string {
  return bin.from === bin.to
    ? formatI18nTemplate(bt("{n}컷", "Cut {n}"), { n: bin.from })
    : formatI18nTemplate(bt("{from}~{to}컷", "Cuts {from}–{to}"), { from: bin.from, to: bin.to });
}

export function scrollRangeText(bt: Localize, bin: Pick<DropOffBin, "from" | "to">): string {
  return formatI18nTemplate(bt("{from}~{to}%", "{from}–{to}%"), { from: bin.from, to: bin.to });
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
