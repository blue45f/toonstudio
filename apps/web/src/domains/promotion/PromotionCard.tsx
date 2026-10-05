import { Clapperboard } from "lucide-react";
import { Link } from "react-router-dom";

import { PROMOTION_KINDS, PROMOTION_STAGES } from "../../../../../packages/core/src/promotion";
import type { PromotionPost } from "../../../../../packages/core/src/promotion";
import { GENRE_EN, KIND_EN, STAGE_EN } from "./promotion-labels";

import { introItemProps } from "@/shared/components/page-intro/page-intro-utils";
import { TypographicCover } from "@/shared/components/typographic-cover";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const SCOPE = "domains.promotion.PromotionCard";

/**
 * 홍보 보드 카드. 보드 그리드와 작성 화면 미리보기가 같은 컴포넌트를 쓴다 —
 * 미리보기가 실제 게시 카드와 어긋나지 않게 하려는 것이다.
 * `interactive={false}`는 아직 게시되지 않아 이동할 상세 주소가 없는 미리보기 전용으로,
 * 링크만 걷어내고 표시 내용은 보드와 동일하게 유지한다.
 */
export function PromotionCard({ post, index, interactive = true }: {
  post: PromotionPost;
  index?: number;
  interactive?: boolean;
}) {
  const bt = useBilingual(SCOPE);
  const detailHref = `/community/promote/${encodeURIComponent(post.id)}`;
  const cover = post.cover ? (
    <img src={post.cover} alt={bt(`${post.seriesTitle} 표지`, `${post.seriesTitle} cover`)} loading="lazy" decoding="async" width={640} height={800} />
  ) : (
    <TypographicCover
      title={post.seriesTitle}
      seed={post.id}
      eyebrow={bt(post.genre, GENRE_EN[post.genre] ?? post.genre)}
      className="h-full w-full"
    />
  );
  const videoBadge = post.videoUrl ? (
    <span className="pc-video-badge"><Clapperboard size={14} aria-hidden="true" />{bt("영상", "Video")}</span>
  ) : null;
  return (
    <article className="pc-card" {...(index !== undefined ? introItemProps(index) : {})}>
      {interactive ? (
        <Link
          className="pc-card-cover"
          to={detailHref}
          aria-label={bt(`${post.seriesTitle} 소개 보기`, `View the introduction of ${post.seriesTitle}`)}
        >
          {cover}
          {videoBadge}
        </Link>
      ) : (
        <div className="pc-card-cover">
          {cover}
          {videoBadge}
        </div>
      )}
      <div className="pc-card-body">
        <div className="pc-tags">
          <span>{bt(PROMOTION_STAGES[post.stage], STAGE_EN[post.stage] ?? PROMOTION_STAGES[post.stage])}</span>
          <span>{bt(PROMOTION_KINDS[post.kind], KIND_EN[post.kind] ?? PROMOTION_KINDS[post.kind])}</span>
          {post.archived && <span>{bt("보관됨", "Archived")}</span>}
          {post.hidden && <span>{bt("운영 비공개", "Hidden by moderators")}</span>}
        </div>
        <h3>{interactive ? <Link to={detailHref}>{post.title}</Link> : post.title}</h3>
        <p>{post.description}</p>
        <div className="pc-card-footer">
          {interactive
            ? <Link to={`/u/${encodeURIComponent(post.author.id)}`}>{post.author.name}</Link>
            : <span>{post.author.name}</span>}
          <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString("ko-KR")}</time>
        </div>
      </div>
    </article>
  );
}
