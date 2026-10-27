import { Layers, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  creatorProfileHref,
  showcaseGalleryHref,
} from "./publishing/showcase-links";
import { STUDIO_RASTER_ASSETS } from "./render/studio-raster-assets";
import { BUBBLE_VARIANTS } from "./studio-assets";
import { frozenStatus3Text } from "./studio-frozen3-status-i18n";

import {
  deleteComment,
  listChallenges,
  listComments,
  listSeries,
  postComment,
  toggleCommentLike,
  updateComment,
  updateWork,
  type ChallengeSummary,
  type SeriesSummary,
  type WorkComment,
  type WorkDetail,
} from "@/platform/creator-client";
import { ThreadedCommentSection } from "@/shared/components/comments/threaded-comment-section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const MAX_COMMENT_LENGTH = 700;
const BUBBLE_LABEL_BY_ID: ReadonlyMap<string, string> = new Map(
  BUBBLE_VARIANTS.map((variant) => [variant.id, variant.label] as const),
);
const RASTER_ASSET_LABEL_BY_ID: ReadonlyMap<string, string> = new Map(
  STUDIO_RASTER_ASSETS.map((asset) => [asset.id, asset.label] as const),
);

// ── 연재·챌린지 설정(작성자 전용) — StudioPage를 건드리지 않는 추가 게시 설정 패널 ──
export function WorkCommunityPanel({
  work,
  onUpdated,
}: {
  work: WorkDetail;
  onUpdated: (patch: Partial<WorkDetail>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mySeries, setMySeries] = useState<SeriesSummary[]>([]);
  const [challenges, setChallenges] = useState<ChallengeSummary[]>([]);
  const [seriesId, setSeriesId] = useState(work.seriesId ?? "");
  const [challengeId, setChallengeId] = useState(work.challengeId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = useApp((s) => s.userId);

  // 패널을 열 때 내 시리즈 + 진행중 챌린지 목록 로드.
  useEffect(() => {
    if (!open || !userId) return;
    let alive = true;
    const controller = new AbortController();
    listSeries({ userId }, controller.signal)
      .then((result) => {
        if (alive) setMySeries(result.filter((s) => s.isOwner));
      })
      .catch(() => {
        if (alive) setMySeries([]);
      });
    listChallenges(controller.signal)
      .then((result) => {
        if (alive) setChallenges(result.filter((c) => c.state === "ongoing"));
      })
      .catch(() => {
        if (alive) setChallenges([]);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [open, userId]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await updateWork(work.id, {
        seriesId: seriesId || null,
        challengeId: challengeId || null,
        ...(work.revision ? { baseRevision: work.revision } : {}),
      });
      onUpdated({
        seriesId: saved.seriesId ?? null,
        episodeNo: saved.episodeNo ?? null,
        seriesTitle: saved.seriesTitle ?? null,
        challengeId: saved.challengeId ?? null,
        challengeTitle: saved.challengeTitle ?? null,
        revision: saved.revision ?? work.revision,
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : frozenStatus3Text("studio.frozenStatus3.work.settingsSaveFailed", "설정을 저장하지 못했습니다."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-fg-2 transition-colors hover:text-fg"
      >
        <Settings2 size={13} className="text-accent" />
        {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "연재·챌린지 설정")}<span className="ml-auto text-xs text-fg-3">
          {work.seriesTitle ? formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "시리즈: {v0}"), { v0: String(work.seriesTitle) }) : translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "시리즈 미연결")}
          {" · "}
          {work.challengeTitle ? formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "챌린지: {v0}"), { v0: String(work.challengeTitle) }) : translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "챌린지 미참여")}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2.5 border-t border-line px-3.5 py-3">
          <label className="flex flex-col gap-1 text-xs text-fg-2">
            {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "연재 시리즈 (선택 시 회차 번호 자동 부여)")}<select
              value={seriesId}
              onChange={(event) => setSeriesId(event.target.value)}
              className="h-9 rounded-lg border border-line bg-canvas px-2 text-sm text-fg focus:border-accent/50"
            >
              <option value="">{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "시리즈에 연결하지 않음")}</option>
              {mySeries.map((series) => (
                <option key={series.id} value={series.id}>
                  {series.title} ({series.episodes}{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "화)")}</option>
              ))}
            </select>
          </label>
          {mySeries.length === 0 && (
            <p className="text-xs text-fg-3">
              {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "아직 만든 시리즈가 없어요.")}{" "}
              <Link href={showcaseGalleryHref({ tab: "series" })} className="text-accent hover:underline">
                {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "창작 갤러리 시리즈 탭")}</Link>
              {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "에서 새 시리즈를 만들 수 있습니다.")}</p>
          )}
          <label className="flex flex-col gap-1 text-xs text-fg-2">
            {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "창작 챌린지 참여")}<select
              value={challengeId}
              onChange={(event) => setChallengeId(event.target.value)}
              className="h-9 rounded-lg border border-line bg-canvas px-2 text-sm text-fg focus:border-accent/50"
            >
              <option value="">{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "챌린지에 참여하지 않음")}</option>
              {/* 이미 연결된(종료됐을 수도 있는) 챌린지는 유지 옵션으로 노출 */}
              {work.challengeId && !challenges.some((c) => c.id === work.challengeId) && (
                <option value={work.challengeId}>{work.challengeTitle ?? translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "현재 참여 중인 챌린지")}</option>
              )}
              {challenges.map((challenge) => (
                <option key={challenge.id} value={challenge.id}>
                  {challenge.title}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="text-xs text-bad">{error}</p>}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className={buttonClass({ size: "sm", variant: "solid" })}
            >
              {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "설정 저장")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkComments({
  workId,
  anonymous = false,
}: {
  workId: string;
  anonymous?: boolean;
}) {
  const sessionUserId = useApp((state) => state.userId);
  const userId = anonymous ? null : sessionUserId;
  const [comments, setComments] = useState<WorkComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listComments(workId, controller.signal)
      .then((result) => {
        if (alive) setComments(result);
      })
      .catch((cause: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : frozenStatus3Text("studio.frozenStatus3.work.commentsLoadFailed", "댓글을 불러오지 못했습니다."));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [workId, userId]);

  return (
    <div className="ux-deferred-section">
      {error ? (
        <p className="mb-3 rounded-xl border border-bad/35 bg-bad/10 px-3 py-2 text-xs text-bad" role="alert">
          {error}
        </p>
      ) : null}
      <ThreadedCommentSection
        comments={comments}
        setComments={setComments}
        viewerId={userId}
        loading={loading}
        maxLength={MAX_COMMENT_LENGTH}
        maxDepth={4}
        title={translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "댓글")}
        description={translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "작품 감상과 응원을 나누고, 다른 독자의 댓글에도 답해 보세요.")}
        placeholder={translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "응원의 한마디를 남겨 보세요.")}
        draftStorageKey={`creator-work-comment-drafts:${workId}:${userId ?? "guest"}`}
        authorHref={(comment) => comment.author.id ? creatorProfileHref(comment.author.id) : null}
        onCreate={(text, parentId) => postComment(workId, text, parentId)}
        onUpdate={(commentId, text) => updateComment(workId, commentId, text)}
        onDelete={(commentId) => deleteComment(workId, commentId)}
        onToggleLike={(commentId) => toggleCommentLike(workId, commentId)}
      />
    </div>
  );
}

interface ElNode {
  id: string;
  type: string;
  name: string;
  details?: string;
  opacity?: number;
  hidden?: boolean;
  builtinRasterAssetId?: string;
}

interface StudioElement {
  id: string;
  type: string;
  variant?: string;
  text?: string;
  src?: string;
  points?: number[];
  stroke?: string;
  width?: number;
  height?: number;
  bg?: string;
  bgColor?: string;
  lineCount?: number;
  opacity?: number;
  hidden?: boolean;
  builtinRasterAssetId?: string;
}

interface StudioDoc {
  pagesList?: { elements?: StudioElement[] }[];
  elements?: StudioElement[];
}

function parseLayersFromDoc(doc: unknown): { pageIndex: number; layers: ElNode[] }[] {
  if (!doc || typeof doc !== "object") return [];
  const studioDoc = doc as StudioDoc;
  const pagesList = studioDoc.pagesList;
  if (!pagesList || !Array.isArray(pagesList)) {
    if (studioDoc.elements && Array.isArray(studioDoc.elements)) {
      return [{ pageIndex: 1, layers: mapElementsToNodes(studioDoc.elements) }];
    }
    return [];
  }
  return pagesList.map((page, index: number) => ({
    pageIndex: index + 1,
    layers: mapElementsToNodes(page?.elements ?? []),
  }));
}

function mapElementsToNodes(elements: StudioElement[]): ElNode[] {
  return elements.map((el) => {
    let name = "레이어";
    let details = "";
    if (el.type === "bubble") {
      name = `${BUBBLE_LABEL_BY_ID.get(el.variant ?? "") ?? "대사"} 말풍선`;
      details = el.text ? `"${el.text.slice(0, 30)}${el.text.length > 30 ? "..." : ""}"` : "(비어 있음)";
    } else if (el.type === "text") {
      name = "텍스트 레이어";
      details = el.text ? `"${el.text.slice(0, 30)}${el.text.length > 30 ? "..." : ""}"` : "(비어 있음)";
    } else if (el.type === "image") {
      name = el.builtinRasterAssetId
        ? RASTER_ASSET_LABEL_BY_ID.get(el.builtinRasterAssetId) ?? "번들 장면 소품"
        : el.src && el.src.startsWith("data:")
          ? "3D 캐릭터 렌더"
          : "배경 / 스튜디오 이미지";
      details = el.src && !el.src.startsWith("data:") ? el.src.split("/").pop() || "" : "";
    } else if (el.type === "sticker") {
      name = "소품 / 스티커";
      details = el.text || "";
    } else if (el.type === "draw") {
      name = `자유 드로잉 (${el.points ? Math.floor(el.points.length / 2) : 0} 획)`;
      details = el.stroke || "";
    } else if (el.type === "frame") {
      name = `컷 프레임 (${el.width}x${el.height})`;
      details = el.bg || el.bgColor || "투명";
    } else if (el.type === "focusLines") {
      name = "효과선 (집중선)";
      details = `${el.lineCount}개 선`;
    } else if (el.type === "speedLines") {
      name = "효과선 (속도선)";
      details = `${el.lineCount}개 선`;
    }

    return {
      id: el.id,
      type: el.type,
      name,
      details,
      opacity: el.opacity,
      hidden: el.hidden,
    };
  });
}

export function WorkInspector({ doc }: { doc: unknown }) {
  const [open, setOpen] = useState(false);
  const pages = parseLayersFromDoc(doc);
  const totalLayers = pages.reduce((sum, p) => sum + p.layers.length, 0);

  if (totalLayers === 0) return null;

  return (
    <section className="ux-deferred-section mt-6 rounded-2xl border border-line bg-panel/30 p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between font-bold text-sm text-fg"
      >
        <span className="flex items-center gap-1.5">
          <Layers size={15} className="text-accent" />
          {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "개체/레이어 탐색기 (Inspector)")}<span className="numeral text-fg-3">{totalLayers}{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "개 요소")}</span>
        </span>
        <span className="text-xs text-accent hover:underline">
          {open ? translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "닫기") : translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "레이어 트리 열기")}
        </span>
      </button>

      {open && (
        <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border border-line bg-card/60 p-3 space-y-4 font-mono text-xs leading-relaxed">
          {pages.map((p) => (
            <div key={p.pageIndex} className="space-y-1.5">
              <h4 className="font-semibold text-fg-2 border-b border-line pb-1 mb-2 border-solid">
                {translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "en", "Page ")}{p.pageIndex}
              </h4>
              {p.layers.length === 0 ? (
                <p className="text-fg-3 italic pl-3">{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "이 페이지에는 개체가 없습니다.")}</p>
              ) : (
                <div className="pl-2 space-y-1">
                  {p.layers.map((layer) => (
                    <div
                      key={layer.id}
                      className={cn(
                        "flex items-center justify-between rounded px-2.5 py-1.5 bg-canvas/30 hover:bg-canvas/60 border border-transparent hover:border-line border-solid transition-colors",
                        layer.hidden && "opacity-50",
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-accent font-bold">[{layer.type.toUpperCase()}]</span>
                        <span className="text-fg font-medium truncate">{layer.name}</span>
                        {layer.details && (
                          <span className="text-fg-3 truncate italic">{layer.details}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 text-fg-3">
                        {layer.opacity !== undefined && <span>op:{Math.round(layer.opacity * 100)}%</span>}
                        {layer.hidden && <span className="text-bad">{translateCurrentStaticSourceText("domains.creator.CreateWorkPage", "ko", "[숨김]")}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
