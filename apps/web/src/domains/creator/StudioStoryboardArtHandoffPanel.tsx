/**
 * 콘티 → 작화 샷 인계 패널 (흐름 F-3).
 *
 * 회차가 확정된 콘티 비트를 planStudioStoryboard 계획으로 바꿔, 작화를
 * 시작하기 전에 샷 규격(샷 사이즈·카메라·구도·예상 높이)을 그대로 보여
 * 주고, 같은 계획에서 만든 작화 시작 링크를 건넨다. 비트는 이미 회차로
 * 나뉜 출처(beatsByEpisodeId)에서 오므로, 회차 연결이 없는 기존 비트는
 * bindBeatsToEpisode 로 이 회차에 묶고, 다른 회차 비트가 섞여 있으면
 * 링크를 만들지 않고 그 사실을 알린다 — 엉뚱한 회차의 샷 계획으로
 * 작화가 열리는 일을 막는 것이 이 패널의 계약이다.
 */
import {
  bindBeatsToEpisode,
  deriveStoryboardArtHandoff,
  planStudioStoryboard,
  type StudioShotSize,
  type StudioStoryBeat,
} from "./studio-storyboard-planner";

import { r4CreatorStatusText } from "./r4-cat1-status-i18n";
import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface StudioStoryboardArtHandoffPanelProps {
  readonly episodeId: string;
  /** 이 회차의 콘티 비트. 비어 있으면 패널 자체를 그리지 않는다. */
  readonly beats: readonly StudioStoryBeat[];
  /** 동일 프로젝트·문서로 검증된 목적지만 받는다. 새 작품 생성으로 우회하지 않는다. */
  readonly artHref: string | null;
}

const SHOT_SIZE_LABELS: Readonly<Record<StudioShotSize, string>> = {
  "extreme-wide": "아주 넓은 샷",
  wide: "넓은 샷",
  medium: "중간 샷",
  "close-up": "클로즈업",
  "extreme-close-up": "아주 가까운 클로즈업",
};

export function StudioStoryboardArtHandoffPanel({
  episodeId,
  beats,
  artHref,
}: StudioStoryboardArtHandoffPanelProps) {
  const bt = useBilingual("StudioStoryboardArtHandoffPanel");
  if (beats.length === 0) return null;

  let handoff: ReturnType<typeof deriveStoryboardArtHandoff> | null;
  try {
    const bound = bindBeatsToEpisode(beats, episodeId);
    const plan = planStudioStoryboard(bound);
    handoff = deriveStoryboardArtHandoff(plan, bound);
  } catch {
    handoff = null;
  }

  if (!handoff) {
    return (
      <section aria-label="작화 샷 계획">
        <h3>작화 샷 계획</h3>
        <p>
          {r4CreatorStatusText("r4cat1.creator.artHandoff.blocked", "이 회차 비트에 다른 회차 표시가 섞여 있어 작화 계획을 만들 수 없어요. 비트의 회차 연결을 먼저 확인해 주세요.")}
        </p>
      </section>
    );
  }

  return (
    <section aria-label="작화 샷 계획" className="space-y-2">
      <h3 className="font-semibold">{bt("작화 샷 계획 — 저장된 회차 기준", "Artwork shot plan — saved episode")}</h3>
      <p>
        샷 {handoff.shots.length}개 · 예상 캔버스 높이 약{" "}
        {handoff.estimatedCanvasHeightPx}px
        {handoff.status === "review"
          ? " · 작화를 시작하기 전에 확인할 샷이 있어요."
          : " · 그대로 작화를 시작할 수 있어요."}
      </p>
      <ol className="list-decimal space-y-2 pl-5">
        {handoff.shots.map((shot) => (
          <li key={shot.shotId}>
            {shot.summary} ({SHOT_SIZE_LABELS[shot.shotSize]} · {shot.camera} ·{" "}
            {shot.composition} · 약 {shot.estimatedHeightPx}px)
          </li>
        ))}
      </ol>
      {artHref ? <Link href={artHref}>{bt("이 회차 작화 시작하기", "Open this episode artwork")}</Link> : null}
    </section>
  );
}
