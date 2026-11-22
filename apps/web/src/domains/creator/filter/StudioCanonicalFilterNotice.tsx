/**
 * 개별 레거시 필터 패널 하단에 정본 비파괴 필터 진입점을 안내하는 단일 1줄 배지.
 */
import { studioLegacyFilterPanelGuidance } from "./studio-canonical-filter-registry";

export function StudioCanonicalFilterNotice({
  panelId,
}: {
  readonly panelId: string;
}): React.ReactElement | null {
  const spec = studioLegacyFilterPanelGuidance(panelId);
  if (!spec) return null;
  return (
    <p
      data-studio-canonical-filter-notice={panelId}
      className="rounded-lg border border-line/70 bg-card/55 px-2.5 py-1.5 text-[0.65rem] leading-relaxed text-fg-3"
    >
      <span className="font-semibold text-fg-2">정본 안내 · {spec.canonicalTargetLabelKo}</span>
      {" — "}
      {spec.guidanceKo}
    </p>
  );
}
