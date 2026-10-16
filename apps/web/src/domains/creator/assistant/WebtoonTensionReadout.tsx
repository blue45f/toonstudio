/**
 * WebtoonTensionReadout — 텐션 맵의 글·표 쪽 화면 조각.
 *
 *  - TensionCutDetail    선택한 컷의 긴장도와 계산 근거(감정·샷·템포)를 식 그대로 보여 준다.
 *  - TensionSegmentList  늘어짐·급함·절정 후보 구간 목록. 항목을 누르면 그 구간의 첫 컷을 고른다.
 *  - TensionTable        곡선의 표 대안(스크린 리더·키보드·복사용). 곡선과 같은 숫자다.
 *  - TensionMethodNotes  계산식·계수 표·출처 구분·한계. 수치는 휴리스틱이라는 고지의 본문이다.
 *
 * 숫자·코드를 문장으로 잇는 함수(사유 설명·곡선 요약)는 `webtoon-tension-text.ts` 에 있다 —
 * 컴포넌트 파일에서 함수를 내보내면 빠른 새로고침이 깨진다.
 * 계수와 임계값은 전부 `TENSION_MAP_CONFIG` / `TENSION_MAP_PARAMETERS` 에서 읽는다 —
 * 이 화면의 설명이 코드와 따로 낡지 않는다.
 *
 * 접이식(표·계산 방법)은 네이티브 `<details>` 다. summary 는 터치 44px 이상이고, 모달 안에서도 Tab 으로
 * 닿는다(공용 포커스 트랩 `useStudioModalSheet` 가 summary 를 순환에 넣는다). 표는 좁은 화면에서
 * 가로로 스크롤되므로 래퍼가 키보드로 닿는 이름 있는 영역(`role="region"`, `tabIndex=0`)이다.
 */

import { ChevronDown } from "lucide-react";
import { useId, type ReactNode } from "react";

import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { STUDIO_EASE, STUDIO_FOCUS_RING, STUDIO_TOUCH_TARGET } from "../studio-panel-ui";

import {
  CUT_EMOTION_LABELS,
  CUT_EMOTION_ORDER,
  CUT_SHOT_SCALE_LABELS,
  CUT_SHOT_SCALE_ORDER,
} from "./webtoon-cut-vocabulary";
import {
  TENSION_KIND_GLYPHS,
  TENSION_KIND_LABELS,
  TENSION_PARAMETER_LABELS,
  TENSION_SOURCE_LABELS,
  type TensionCopyPair,
} from "./webtoon-tension-copy";
import {
  TENSION_EMOTION_WEIGHT,
  TENSION_MAP_CONFIG,
  TENSION_MAP_PARAMETERS,
  TENSION_SHOT_WEIGHT,
  type TensionCut,
  type TensionSegment,
  type TensionSegmentKind,
} from "./webtoon-tension-map";
import { describeSegmentReason, rangeText } from "./webtoon-tension-text";

const bi = (ko: string, en: string): string =>
  translateBilingualValueForActiveLocale("WebtoonTensionReadout", ko, en);

const t = (pair: TensionCopyPair): string => bi(pair.ko, pair.en);

const KIND_TEXT_CLASS: Readonly<Record<TensionSegmentKind, string>> = {
  climax: "text-accent",
  rush: "text-warn",
  drag: "text-cool",
};

const CARD_CLASS = "rounded-xl border border-line bg-card/60 p-3";

/** 접이식 summary — 터치 44px, 기본 마커 대신 화살표(스튜디오의 다른 접이식과 같은 관례). */
const SUMMARY_CLASS = cn(
  "flex cursor-pointer list-none items-center justify-between gap-2 text-[0.75rem] font-bold text-fg [&::-webkit-details-marker]:hidden",
  STUDIO_TOUCH_TARGET,
  STUDIO_FOCUS_RING,
);

const SCROLL_REGION_CLASS = cn("overflow-x-auto", STUDIO_FOCUS_RING);

/**
 * 가로로 스크롤되는 표의 래퍼 — 키보드로 닿아야 방향키로 스크롤할 수 있다(axe scrollable-region-focusable).
 * 이름은 눈에 보이는 표 캡션이 준다(`aria-labelledby`).
 */
function ScrollRegion({
  captionId,
  className,
  children,
}: {
  readonly captionId: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- 가로로 넘치는 표를 키보드만으로 읽을 수 있어야 하므로 스크롤 영역에 포커스가 필요하다(WCAG 2.1.1). 이름 있는 region 이며 저장소의 다른 스크롤 영역과 같은 관례다.
    <div role="region" tabIndex={0} aria-labelledby={captionId} className={cn(SCROLL_REGION_CLASS, className)}>
      {children}
    </div>
  );
}

function DisclosureSummary({ children }: { readonly children: ReactNode }) {
  return (
    <summary className={SUMMARY_CLASS}>
      <span className="min-w-0">{children}</span>
      <ChevronDown
        aria-hidden="true"
        className="size-4 shrink-0 text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none"
      />
    </summary>
  );
}

// ── 선택한 컷 상세 ───────────────────────────────────────────────────────

export interface TensionCutDetailProps {
  readonly cut: TensionCut;
  readonly cuts: readonly TensionCut[];
  readonly segments: readonly TensionSegment[];
}

export function TensionCutDetail({ cut, cuts, segments }: TensionCutDetailProps) {
  useBilingualI18nRevision();
  const { weights } = TENSION_MAP_CONFIG;
  const covering = segments.filter(
    (segment) => cut.index >= segment.startIndex && cut.index <= segment.endIndex,
  );
  const rows = [
    {
      id: "emotion",
      label: bi("감정", "Emotion"),
      value: cut.emotion === null ? null : t(CUT_EMOTION_LABELS[cut.emotion]),
      score: cut.components.emotion,
      weight: weights.emotion,
    },
    {
      id: "shot",
      label: bi("샷 크기", "Shot size"),
      value: cut.shotScale === null ? null : t(CUT_SHOT_SCALE_LABELS[cut.shotScale]),
      score: cut.components.shot,
      weight: weights.shot,
    },
    {
      id: "tempo",
      label: bi("체류 시간(템포)", "Dwell time (tempo)"),
      value: cut.dwellSec === null ? null : `${cut.dwellSec.toFixed(1)}${bi("초", "s")}`,
      score: cut.components.tempo,
      weight: weights.tempo,
    },
  ];
  const missing = rows.some((row) => row.score === null);

  return (
    <section
      aria-label={formatI18nTemplate(bi("컷 {n} 긴장도 근거", "Tension basis for cut {n}"), {
        n: cut.index + 1,
      })}
      data-testid="tension-cut-detail"
      className={cn(CARD_CLASS, "flex flex-col gap-2")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="min-w-0 text-[0.75rem] font-bold text-fg">
          {formatI18nTemplate(bi("컷 {n}", "Cut {n}"), { n: cut.index + 1 })}
          {cut.summary === "" ? null : (
            <span className="ml-1.5 font-normal text-fg-2">{cut.summary}</span>
          )}
        </h4>
        <p className="font-mono text-2xl font-black leading-none text-accent">
          <span className="sr-only">{bi("긴장도", "Tension")} </span>
          {cut.tension.toFixed(2)}
        </p>
      </div>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded bg-line">
        <div className="h-full rounded bg-accent" style={{ width: `${cut.tension * 100}%` }} />
      </div>

      <dl className="grid grid-cols-1 gap-1.5 text-[0.68rem] sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-line bg-card p-2">
            <dt className="text-fg-3">{row.label}</dt>
            <dd className="mt-0.5 text-fg">
              {row.score === null ? (
                <span className="text-fg-3">
                  {bi("알 수 없음 — 계산에서 뺐어요", "Unknown — left out of the sum")}
                </span>
              ) : (
                <>
                  <span className="font-bold">{row.value}</span>
                  <span className="ml-1 font-mono text-fg-3">
                    {formatI18nTemplate(bi("점수 {score} × 비중 {weight}", "score {score} × weight {weight}"), {
                      score: row.score.toFixed(2),
                      weight: row.weight,
                    })}
                  </span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {missing ? (
        <p className="text-[0.62rem] text-fg-3">
          {bi(
            "알 수 없는 근거는 0이나 중립값으로 채우지 않고 합에서 빼요. 남은 근거의 비중을 다시 맞춰 계산합니다.",
            "Unknown bases are not filled with zero or a neutral value; they are dropped, and the remaining weights are renormalised.",
          )}
        </p>
      ) : null}

      {covering.length > 0 ? (
        <ul className="flex flex-col gap-1 text-[0.68rem]">
          {covering.map((segment) => (
            <li
              key={`${segment.kind}-${segment.reason}-${segment.startIndex}`}
              className="flex items-start gap-1.5"
            >
              <span aria-hidden="true" className={cn("font-bold", KIND_TEXT_CLASS[segment.kind])}>
                {TENSION_KIND_GLYPHS[segment.kind]}
              </span>
              <span className="text-fg-2">
                <span className="font-semibold text-fg">{t(TENSION_KIND_LABELS[segment.kind])}</span>
                {" — "}
                {describeSegmentReason(segment, cuts)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// ── 후보 구간 목록 ───────────────────────────────────────────────────────

export interface TensionSegmentListProps {
  readonly cuts: readonly TensionCut[];
  readonly segments: readonly TensionSegment[];
  readonly onSelect: (index: number) => void;
}

export function TensionSegmentList({ cuts, segments, onSelect }: TensionSegmentListProps) {
  useBilingualI18nRevision();
  return (
    <section
      aria-label={bi("후보 구간", "Candidate segments")}
      data-testid="tension-segment-list"
      className={cn(CARD_CLASS, "flex flex-col gap-2")}
    >
      <h4 className="text-[0.75rem] font-bold text-fg">{bi("후보 구간", "Candidate segments")}</h4>
      <p className="text-[0.62rem] text-fg-3">
        {bi(
          "판정이 아니라 훑어볼 곳이에요. 일상 장면의 느슨함이나 반전의 급전개는 의도일 수 있어요.",
          "These are places to look, not verdicts. A relaxed everyday scene or a sudden twist may be intentional.",
        )}
      </p>
      {segments.length === 0 ? (
        <p className="text-[0.68rem] text-fg-2">
          {bi("기준에 걸린 후보 구간이 없어요.", "No candidate segment crossed the thresholds.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {segments.map((segment) => (
            <li key={`${segment.kind}-${segment.reason}-${segment.startIndex}-${segment.endIndex}`}>
              <button
                type="button"
                onClick={() => onSelect(segment.startIndex)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-lg border border-line bg-card p-2 text-left text-[0.68rem] hover:bg-raised",
                  STUDIO_EASE,
                  STUDIO_FOCUS_RING,
                  STUDIO_TOUCH_TARGET,
                )}
              >
                <span className="flex items-center gap-1.5 font-bold text-fg">
                  <span aria-hidden="true" className={KIND_TEXT_CLASS[segment.kind]}>
                    {TENSION_KIND_GLYPHS[segment.kind]}
                  </span>
                  {t(TENSION_KIND_LABELS[segment.kind])}
                  <span className="font-mono font-normal text-fg-3">
                    {formatI18nTemplate(bi("컷 {range}", "cuts {range}"), { range: rangeText(segment) })}
                  </span>
                </span>
                <span className="text-fg-3">{describeSegmentReason(segment, cuts)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── 표 대안 ──────────────────────────────────────────────────────────────

export interface TensionTableProps {
  readonly cuts: readonly TensionCut[];
  readonly selectedIndex: number;
}

export function TensionTable({ cuts, selectedIndex }: TensionTableProps) {
  useBilingualI18nRevision();
  const captionId = useId();
  const unknown = (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{bi("모름", "unknown")}</span>
    </>
  );
  return (
    <details className={cn(CARD_CLASS, "group")} data-testid="tension-table-details">
      <DisclosureSummary>
        {bi("표로 보기 (곡선의 텍스트 대안)", "View as a table (text alternative to the curve)")}
      </DisclosureSummary>
      <ScrollRegion captionId={captionId} className="mt-2">
        <table className="w-full min-w-[34rem] border-collapse text-left text-[0.68rem]">
          <caption id={captionId} className="pb-1 text-left text-[0.62rem] text-fg-3">
            {bi("컷별 긴장도와 계산 근거", "Per-cut tension and the basis it was computed from")}
          </caption>
          <thead>
            <tr className="border-b border-line text-fg-3">
              <th scope="col" className="py-1 pr-2 font-semibold">{bi("컷", "Cut")}</th>
              <th scope="col" className="py-1 pr-2 font-semibold">{bi("내용", "Content")}</th>
              <th scope="col" className="py-1 pr-2 font-semibold">{bi("감정", "Emotion")}</th>
              <th scope="col" className="py-1 pr-2 font-semibold">{bi("샷 크기", "Shot size")}</th>
              <th scope="col" className="py-1 pr-2 text-right font-semibold">{bi("체류(초)", "Dwell (s)")}</th>
              <th scope="col" className="py-1 pr-2 text-right font-semibold">{bi("긴장도", "Tension")}</th>
              <th scope="col" className="py-1 font-semibold">{bi("후보", "Flags")}</th>
            </tr>
          </thead>
          <tbody>
            {cuts.map((cut) => (
              <tr
                key={cut.id}
                data-selected={cut.index === selectedIndex ? "true" : undefined}
                className={cn("border-b border-line/60", cut.index === selectedIndex && "bg-accent-soft")}
              >
                <th scope="row" className="py-1 pr-2 font-mono font-semibold text-fg">{cut.index + 1}</th>
                <td className="max-w-[16rem] truncate py-1 pr-2 text-fg-2" title={cut.summary || undefined}>
                  {cut.summary === "" ? unknown : cut.summary}
                </td>
                <td className="py-1 pr-2 text-fg-2">
                  {cut.emotion === null ? unknown : t(CUT_EMOTION_LABELS[cut.emotion])}
                </td>
                <td className="py-1 pr-2 text-fg-2">
                  {cut.shotScale === null ? unknown : t(CUT_SHOT_SCALE_LABELS[cut.shotScale])}
                </td>
                <td className="py-1 pr-2 text-right font-mono tabular-nums text-fg-2">
                  {cut.dwellSec === null ? unknown : cut.dwellSec.toFixed(1)}
                </td>
                <td className="py-1 pr-2 text-right font-mono font-bold tabular-nums text-fg">
                  {cut.tension.toFixed(2)}
                </td>
                <td className="py-1 text-fg-2">
                  {cut.flags.length === 0
                    ? unknown
                    : cut.flags.map((kind) => t(TENSION_KIND_LABELS[kind])).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
    </details>
  );
}

// ── 계산 방법·한계 ───────────────────────────────────────────────────────

export function TensionMethodNotes() {
  useBilingualI18nRevision();
  const captionId = useId();
  const { weights, dwell } = TENSION_MAP_CONFIG;
  return (
    <details className={cn(CARD_CLASS, "group")} data-testid="tension-method-notes">
      <DisclosureSummary>
        {bi("계산 방법과 한계 (모두 휴리스틱)", "How it is computed, and its limits (all heuristics)")}
      </DisclosureSummary>
      <div className="mt-2 flex flex-col gap-3 text-[0.68rem] text-fg-2">
        <p className="rounded-lg border border-warn/35 bg-warn/10 p-2 text-warn">
          {bi(
            "아래 계수와 임계값은 이 저장소가 정한 값이에요. 공식 가이드·독자 실험·논문으로 검증하지 않았고, 긴장도는 독자 반응을 예측하지 않는 상대 지표예요. 출처가 있는 값은 표에서 따로 표시해요.",
            "These coefficients and thresholds are this repository's own choices. They are not verified by an official guide, reader testing or research, and tension is a relative indicator, not a prediction of reader response. Values with a source are marked in the table.",
          )}
        </p>

        <div className="flex flex-col gap-1">
          <p className="font-bold text-fg">{bi("계산식", "Formula")}</p>
          <p className="font-mono text-[0.65rem] leading-relaxed text-fg-2">
            {formatI18nTemplate(
              bi(
                "체류 시간(초) = (이전 컷과의 여백 + 컷 높이) ÷ {speed}px/s + 말풍선 수 × {bubble}초",
                "dwell (s) = (gap before + panel height) ÷ {speed} px/s + bubbles × {bubble} s",
              ),
              { speed: dwell.speedPxPerSec, bubble: dwell.dialogueSec },
            )}
          </p>
          <p className="font-mono text-[0.65rem] leading-relaxed text-fg-2">
            {formatI18nTemplate(
              bi(
                "템포 = 1 − ({dwell} − {fast}) ÷ ({slow} − {fast}), 0~1 로 자름",
                "tempo = 1 − ({dwell} − {fast}) ÷ ({slow} − {fast}), clamped to 0–1",
              ),
              { dwell: bi("체류 시간", "dwell"), fast: dwell.fastSec, slow: dwell.slowSec },
            )}
          </p>
          <p className="font-mono text-[0.65rem] leading-relaxed text-fg-2">
            {formatI18nTemplate(
              bi(
                "긴장도 = (감정 × {e} + 샷 × {s} + 템포 × {t}) ÷ 아는 근거의 비중 합",
                "tension = (emotion × {e} + shot × {s} + tempo × {t}) ÷ sum of known weights",
              ),
              { e: weights.emotion, s: weights.shot, t: weights.tempo },
            )}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <p className="font-bold text-fg">{bi("감정 점수", "Emotion scores")}</p>
          <p className="font-mono text-[0.65rem] text-fg-2">
            {CUT_EMOTION_ORDER.map(
              (emotion) => `${t(CUT_EMOTION_LABELS[emotion])} ${TENSION_EMOTION_WEIGHT[emotion].toFixed(2)}`,
            ).join(" · ")}
          </p>
          <p className="font-bold text-fg">{bi("샷 크기 점수", "Shot-size scores")}</p>
          <p className="font-mono text-[0.65rem] text-fg-2">
            {CUT_SHOT_SCALE_ORDER.map(
              (shot) => `${t(CUT_SHOT_SCALE_LABELS[shot])} ${TENSION_SHOT_WEIGHT[shot].toFixed(2)}`,
            ).join(" · ")}
          </p>
        </div>

        <ScrollRegion captionId={captionId}>
          <table className="w-full min-w-[26rem] border-collapse text-left">
            <caption id={captionId} className="pb-1 text-left text-[0.62rem] text-fg-3">
              {bi("계수와 임계값, 그리고 출처", "Coefficients, thresholds and where each comes from")}
            </caption>
            <thead>
              <tr className="border-b border-line text-fg-3">
                <th scope="col" className="py-1 pr-2 font-semibold">{bi("항목", "Item")}</th>
                <th scope="col" className="py-1 pr-2 font-semibold">{bi("값", "Value")}</th>
                <th scope="col" className="py-1 font-semibold">{bi("출처", "Source")}</th>
              </tr>
            </thead>
            <tbody>
              {TENSION_MAP_PARAMETERS.map((row) => (
                <tr key={row.id} className="border-b border-line/60">
                  <th scope="row" className="py-1 pr-2 font-normal text-fg-2">
                    {t(TENSION_PARAMETER_LABELS[row.id] ?? { ko: row.id, en: row.id })}
                  </th>
                  <td className="py-1 pr-2 font-mono tabular-nums text-fg">{row.value}</td>
                  <td
                    className={cn(
                      "py-1",
                      row.source === "canvas-guide" ? "font-semibold text-good" : "text-fg-3",
                    )}
                  >
                    {t(TENSION_SOURCE_LABELS[row.source])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>

        <ul className="list-disc space-y-0.5 pl-4 text-fg-3">
          <li>
            {bi(
              "큰 컷(스플래시)의 강조 효과, 대사 내용, 그림의 밀도는 반영하지 않아요.",
              "The emphasis of a big splash panel, what the dialogue says and how dense the art is are not reflected.",
            )}
          </li>
          <li>
            {bi(
              "현재 원고의 컷에는 감정·샷 정보가 없어 체류 시간만으로 계산하고, 절정 후보는 표시하지 않아요.",
              "Panels in the current manuscript carry no emotion or shot data, so only dwell time is used and no climax candidates are shown.",
            )}
          </li>
          <li>
            {bi(
              "콘티 대본은 실제 높이·간격이 없어 가정값으로 체류 시간을 계산해요(위 표의 '대본 가정').",
              "A script has no real heights or gaps, so dwell time uses assumed values (the 'Script assumption' rows above).",
            )}
          </li>
        </ul>
      </div>
    </details>
  );
}
