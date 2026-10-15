/**
 * webtoon-tension-text.ts
 *
 * 텐션 맵 화면이 쓰는 "숫자·코드 → 문장" 조립 함수. 곡선의 접근성 이름, 후보 구간의 사유 설명,
 * 곡선을 글로 요약한 문단이 모두 여기서 나온다. 컴포넌트 파일에서 내보내면 빠른 새로고침이 깨져서
 * (`react-refresh/only-export-components`) 별도 모듈로 뒀다. React 에 의존하지 않는다.
 *
 * 계산 모듈(`webtoon-tension-map.ts`)은 언어 중립 코드와 숫자만 돌려주므로, 사람이 읽는 문장은
 * 여기서 `webtoon-tension-copy.ts` 의 문구 표와 `TENSION_MAP_CONFIG` 의 기준값을 엮어 만든다 —
 * 설명에 적힌 임계값이 코드의 임계값과 따로 낡지 않는다.
 */

import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
} from "@/shared/lib/i18n-bilingual-copy";

import {
  TENSION_KIND_LABELS,
  TENSION_REASON_TEMPLATES,
  type TensionCopyPair,
} from "./webtoon-tension-copy";
import {
  TENSION_MAP_CONFIG,
  type TensionCut,
  type TensionMapResult,
  type TensionSegment,
  type TensionSegmentKind,
} from "./webtoon-tension-map";

const bi = (ko: string, en: string): string =>
  translateBilingualValueForActiveLocale("WebtoonTensionText", ko, en);

const t = (pair: TensionCopyPair): string => bi(pair.ko, pair.en);

const KIND_ORDER: readonly TensionSegmentKind[] = ["climax", "rush", "drag"];

/** 점의 접근성 이름: "컷 3, 긴장도 0.82, 절정 후보". */
export function describeTensionPoint(cut: TensionCut): string {
  const base = formatI18nTemplate(bi("컷 {n}, 긴장도 {value}", "Cut {n}, tension {value}"), {
    n: cut.index + 1,
    value: cut.tension.toFixed(2),
  });
  if (cut.flags.length === 0) return base;
  return `${base}, ${cut.flags.map((kind) => t(TENSION_KIND_LABELS[kind])).join(", ")}`;
}

/** 구간의 컷 범위: "5" 또는 "1–4". */
export function rangeText(segment: Pick<TensionSegment, "startIndex" | "endIndex">): string {
  return segment.startIndex === segment.endIndex
    ? String(segment.startIndex + 1)
    : `${segment.startIndex + 1}–${segment.endIndex + 1}`;
}

/** 후보 구간이 왜 표시됐는지 한 문장. 기준 숫자는 설정 객체에서 읽는다. */
export function describeSegmentReason(
  segment: TensionSegment,
  cuts: readonly TensionCut[],
): string {
  const { segments: rules, dwell } = TENSION_MAP_CONFIG;
  const template = TENSION_REASON_TEMPLATES[segment.reason];
  const peak = cuts[segment.startIndex];
  return formatI18nTemplate(t(template), {
    value: peak === undefined ? "" : peak.tension.toFixed(2),
    min: rules.climaxMinTension,
    rise: rules.abruptRise,
    count: segment.reason === "fast-dwell-run" ? rules.rushMinRun : rules.dragMinRun,
    seconds: dwell.fastSec,
    threshold: rules.dragMaxTension,
  });
}

/** 곡선을 글로 요약한다 — 곡선을 못 보는 사용자가 같은 정보를 얻는다. */
export function summarizeTensionMap(result: TensionMapResult): string {
  const { cuts, segments } = result;
  if (cuts.length === 0 || result.peakIndex === null) return "";
  const peak = cuts[result.peakIndex];
  const parts = [
    formatI18nTemplate(
      bi(
        "{count}컷 · 평균 긴장도 {average} · 최고 {peak}(컷 {peakCut})",
        "{count} cuts · average tension {average} · highest {peak} (cut {peakCut})",
      ),
      {
        count: cuts.length,
        average: result.averageTension.toFixed(2),
        peak: peak.tension.toFixed(2),
        peakCut: peak.index + 1,
      },
    ),
  ];
  let any = false;
  for (const kind of KIND_ORDER) {
    const ranges = segments.filter((segment) => segment.kind === kind);
    if (ranges.length === 0) continue;
    any = true;
    parts.push(
      formatI18nTemplate(bi("{kind}: 컷 {list}", "{kind}: cuts {list}"), {
        kind: t(TENSION_KIND_LABELS[kind]),
        list: ranges.map(rangeText).join(", "),
      }),
    );
  }
  if (!any) parts.push(bi("후보 구간 없음", "No candidate segments"));
  return parts.join(" · ");
}
