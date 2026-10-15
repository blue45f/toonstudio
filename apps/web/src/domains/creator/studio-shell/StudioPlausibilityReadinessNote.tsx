/**
 * 프로젝트 준비도 패널의 "개연성 점검" 권장 안내 한 줄.
 *
 * 마지막 점검 시각·오류·경고·커버리지를 보여 주고 점검 허브로 연결한다. 준비도의 막힘·확인 필요 건수에는
 * 더하지 않는 비차단 안내다. 패널은 이 컴포넌트를 한 줄로 장착만 하므로, 준비도 항목 목록 쪽의 변경을
 * 작게 유지한다. 읽는 값은 건수와 시각뿐이며 원고나 근거 문장은 담기지 않는다.
 *
 * 요약은 공용 SQLite 저장소에서 비동기로 읽는다. 읽는 중이거나 읽지 못했으면 "아직 점검하지 않았어요"로
 * 단정하지 않고 점검 허브로 가는 중립 문구만 보여 준다.
 */
import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { useEffect, useState } from "react";

import Link from "@/shared/navigation/router-link";

import {
  STUDIO_PLAUSIBILITY_SUMMARY_UPDATED_EVENT,
  acquireProductPlausibilitySummaryStore,
  describePlausibilitySummary,
  parsePlausibilitySummaryEvent,
  plausibilityHubHref,
  readPlausibilitySummary,
  type PlausibilitySummarySnapshot,
} from "../storyworld/plausibility/studio-story-plausibility-summary";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioPlausibilityReadinessNote", ko, en);

/** undefined = 읽는 중이거나 읽지 못함, null = 점검한 적 없음, 값 = 마지막 점검 요약. */
type SummaryState = PlausibilitySummarySnapshot | null | undefined;

export function StudioPlausibilityReadinessNote({ projectId }: { readonly projectId: string }) {
  useBilingualI18nRevision();
  const [summary, setSummary] = useState<SummaryState>(undefined);
  useEffect(() => {
    let active = true;
    const load = () => {
      void acquireProductPlausibilitySummaryStore()
        .then((store) => readPlausibilitySummary(store, projectId))
        .then((snapshot) => { if (active) setSummary(snapshot); })
        .catch(() => undefined); // 읽지 못하면 이전 상태를 그대로 둔다(처음이면 중립 문구).
    };
    load();
    const onUpdated = (event: Event) => {
      const detail = parsePlausibilitySummaryEvent(event);
      if (detail !== null && detail.projectId === projectId && active) setSummary(detail.snapshot);
    };
    // 다른 탭에서 점검했을 수 있으므로 이 탭으로 돌아올 때 다시 읽는다.
    const onFocus = () => load();
    window.addEventListener(STUDIO_PLAUSIBILITY_SUMMARY_UPDATED_EVENT, onUpdated);
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener(STUDIO_PLAUSIBILITY_SUMMARY_UPDATED_EVENT, onUpdated);
      window.removeEventListener("focus", onFocus);
    };
  }, [projectId]);
  const text = describePlausibilitySummary(summary, (iso, language) =>
    new Date(iso).toLocaleString(language === "ko" ? "ko-KR" : "en-US"));
  return (
    <Link
      href={plausibilityHubHref(projectId)}
      className="mt-3 flex min-h-11 items-center gap-3 rounded-xl border border-dashed border-line bg-panel/40 px-3 py-2.5 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/40 hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
      data-studio-plausibility-note=""
    >
      <span className="size-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <span>{bi(text.ko, text.en)}</span>
    </Link>
  );
}
