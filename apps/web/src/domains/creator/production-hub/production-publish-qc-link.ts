/**
 * 검수 → 게시 인계 브리지 — 순수 모델.
 *
 * 검수 표면(회차 룸·QC 체크리스트)은 aggregate를 갖고 있어
 * `deriveEpisodeQcChecklist`로 게시 가능 판정을 계산할 수 있지만,
 * 게시 센터(StudioPublishingCommandCenter)는 작품(work) 단위 화면이라
 * aggregate를 읽지 않는다. 그래서 판정 결과를 회차 맥락과 함께
 * 링크 쿼리에 스냅샷으로 실어 보낸다 — 게시 센터는 이 스냅샷만으로
 * 사전검사에 검수 결과를 반영한다(통과=통과로 표시, 막힘=게시 차단 오류).
 *
 * 신뢰 규칙: ready는 쿼리로 받지 않고 blocked 목록에서 다시 계산한다.
 * 모르는 항목 id·통과/막힘 중복·맥락 누락이 있으면 스냅샷 전체를
 * 버린다(null) — 잘못된 통과 표시로 오판하느니 "인계 없음"이 정직하다.
 */
import type { EpisodeQcChecklist, EpisodeQcItemId } from "./production-episode-qc";
import { productionEpisodeRoomPath } from "./production-project-surfaces";

/** 게시 센터 라우트(작품 없는 신규 게시). 작품 편집 경로는 /studio/work/<id>/publish. */
export const STUDIO_PUBLISH_PATH = "/studio/publish";

export const EPISODE_QC_ITEM_IDS: readonly EpisodeQcItemId[] = Object.freeze([
  "story-lock",
  "storyboard-lock",
  "final-art",
  "integrated-art",
  "processes",
  "review-gate",
  "joint-proof",
  "dialogue-spellcheck",
  "rights-preflight",
  "release-schedule",
  "blockers",
  "publication-package",
]);

const KNOWN_QC_ITEM_IDS: ReadonlySet<string> = new Set(EPISODE_QC_ITEM_IDS);

/** QC 항목의 한국어 이름 — production-episode-qc의 label.ko와 같은 문구. */
export const EPISODE_QC_ITEM_LABELS_KO: Readonly<Record<EpisodeQcItemId, string>> = Object.freeze({
  "story-lock": "스토리 확정",
  "storyboard-lock": "콘티 확정",
  "final-art": "최종 원고 고정",
  "integrated-art": "식자 통합본 고정",
  processes: "전 공정 완료",
  "review-gate": "검수 승인 (공개 전 필수)",
  "joint-proof": "통합 교정 승인",
  "dialogue-spellcheck": "대사 맞춤법 검사",
  "rights-preflight": "권리·크레딧 사전 점검",
  "release-schedule": "게시 마감 설정",
  blockers: "막힌 질문 해결",
  "publication-package": "게시 패키지 작업",
});

export interface EpisodePublishQcSnapshot {
  readonly projectId: string;
  readonly episodeId: string;
  readonly published: boolean;
  /** blocked가 하나도 없을 때만 true — 항상 blockedIds에서 재계산한 값이다. */
  readonly ready: boolean;
  readonly passedIds: readonly EpisodeQcItemId[];
  readonly blockedIds: readonly EpisodeQcItemId[];
  readonly skippedIds: readonly EpisodeQcItemId[];
}

export function buildEpisodePublishQcSnapshot(
  projectId: string,
  checklist: EpisodeQcChecklist,
): EpisodePublishQcSnapshot {
  const passedIds = checklist.items.filter((item) => item.status === "pass").map((item) => item.id);
  const blockedIds = checklist.items.filter((item) => item.status === "blocked").map((item) => item.id);
  const skippedIds = checklist.items.filter((item) => item.status === "skipped").map((item) => item.id);
  return {
    projectId,
    episodeId: checklist.episodeId,
    published: checklist.published,
    ready: blockedIds.length === 0,
    passedIds,
    blockedIds,
    skippedIds,
  };
}

/** 검수 → 게시 센터 링크. 회차 맥락(projectId·episodeId)과 QC 스냅샷을 함께 싣는다. */
export function buildStudioPublishHref(snapshot: EpisodePublishQcSnapshot): string {
  const search = new URLSearchParams();
  search.set("projectId", snapshot.projectId);
  search.set("episodeId", snapshot.episodeId);
  if (snapshot.passedIds.length > 0) search.set("qcPassed", snapshot.passedIds.join(","));
  if (snapshot.blockedIds.length > 0) search.set("qcBlocked", snapshot.blockedIds.join(","));
  if (snapshot.skippedIds.length > 0) search.set("qcSkipped", snapshot.skippedIds.join(","));
  if (snapshot.published) search.set("qcPublished", "1");
  return `${STUDIO_PUBLISH_PATH}?${search.toString()}`;
}

export function buildStudioPublishHrefFromChecklist(
  projectId: string,
  checklist: EpisodeQcChecklist,
): string {
  return buildStudioPublishHref(buildEpisodePublishQcSnapshot(projectId, checklist));
}

function parseQcIdList(raw: string | null): readonly EpisodeQcItemId[] | null {
  if (raw === null || raw.trim() === "") return [];
  const ids: EpisodeQcItemId[] = [];
  for (const token of raw.split(",")) {
    const id = token.trim();
    if (!KNOWN_QC_ITEM_IDS.has(id)) return null;
    if (!ids.includes(id as EpisodeQcItemId)) ids.push(id as EpisodeQcItemId);
  }
  return ids;
}

/**
 * 게시 센터가 쿼리에서 인계 스냅샷을 복원한다.
 * 맥락이 없거나(직접 진입) 값이 손상됐으면 null — 검수 인계 없이 기존 흐름으로 동작한다.
 */
export function parseEpisodePublishQcSnapshot(
  params: { get(name: string): string | null },
): EpisodePublishQcSnapshot | null {
  const projectId = params.get("projectId")?.trim() ?? "";
  const episodeId = params.get("episodeId")?.trim() ?? "";
  if (!projectId || !episodeId) return null;
  const passedIds = parseQcIdList(params.get("qcPassed"));
  const blockedIds = parseQcIdList(params.get("qcBlocked"));
  const skippedIds = parseQcIdList(params.get("qcSkipped"));
  if (passedIds === null || blockedIds === null || skippedIds === null) return null;
  const seen = new Set<string>();
  for (const id of [...passedIds, ...blockedIds, ...skippedIds]) {
    if (seen.has(id)) return null;
    seen.add(id);
  }
  if (seen.size === 0) return null;
  return {
    projectId,
    episodeId,
    published: params.get("qcPublished") === "1",
    ready: blockedIds.length === 0,
    passedIds,
    blockedIds,
    skippedIds,
  };
}

/** 게시 사전검사에 넘길 막힌 항목(라벨 포함). 통과 항목은 issues가 아니라 표시용으로 따로 쓴다. */
export function episodeQcBlockedForPreflight(
  snapshot: EpisodePublishQcSnapshot,
): readonly { readonly id: EpisodeQcItemId; readonly label: string }[] {
  return snapshot.blockedIds.map((id) => ({ id, label: EPISODE_QC_ITEM_LABELS_KO[id] }));
}

export function episodeQcPassedLabels(
  snapshot: EpisodePublishQcSnapshot,
): readonly { readonly id: EpisodeQcItemId; readonly label: string }[] {
  return snapshot.passedIds.map((id) => ({ id, label: EPISODE_QC_ITEM_LABELS_KO[id] }));
}

/** 막힌 항목을 풀러 돌아갈 회차 룸(검수 표면) 경로. */
export function episodePublishQcReviewHref(snapshot: EpisodePublishQcSnapshot): string {
  return productionEpisodeRoomPath(snapshot.projectId, snapshot.episodeId);
}
