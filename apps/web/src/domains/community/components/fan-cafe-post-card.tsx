import { apiFetch } from "@/platform/api";
import { MessageCircle, Trash2 } from "lucide-react";
import { useState } from "react";

import { FanPostCardArt } from "./fan-cafe-images";
import { FanPostReplySection } from "./fan-cafe-reply-section";
import { countReplies } from "./fan-cafe-tree-utils";
import { KIND_LABEL } from "./fan-cafe-utils";

import type { FanCafePost } from "@/shared/lib/types";

import { COMMUNITY_SCOPE_LABEL } from "@/shared/lib/community-ui";
import { withCsrfProtection } from "@/shared/lib/csrf";
import { useApp } from "@/shared/lib/store";
import { cn, relativeDate } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

export default function FanPostCard({
  post,
  compact,
  onReplyCreated,
  onDeleted,
}: {
  post: FanCafePost;
  compact?: boolean;
  onReplyCreated?: (post: FanCafePost, delta: number) => void;
  onDeleted?: (id: string) => void;
}) {
  const userId = useApp((s) => s.userId);
  const sessionToken = useApp((s) => s.sessionToken);
  const isOwner = !!userId && post.author?.id === userId;
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!userId || deleting) return;
    if (!globalThis.confirm("이 글을 삭제할까요? 답글도 함께 삭제됩니다.")) return;
    setDeleting(true);
    try {
      const res = await apiFetch(
        `/api/community/posts/${encodeURIComponent(post.id)}`,
        withCsrfProtection({
          method: "DELETE",
          headers: sessionToken ? { "x-user-id": sessionToken } : undefined,
        }),
      );
      if (res.ok) onDeleted?.(post.id);
      else setDeleting(false);
    } catch {
      setDeleting(false);
    }
  }

  const [open, setOpen] = useState(false);
  const [loadedCount, setLoadedCount] = useState<number | null>(
    post.replies ? countReplies(post.replies) : null,
  );
  const displayReplyCount = loadedCount ?? post.replyCount;

  return (
    <article className="ink-frame group rounded-xl border border-line bg-card/75 p-4 transition-colors duration-150 hover:bg-card motion-reduce:transition-none sm:p-5">
      <header className="mb-3 flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-raised text-xs font-semibold text-fg"
        >
          {post.author.name.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-3">
            <span className="rounded-md border border-accent/35 bg-accent-soft px-1.5 py-0.5 font-medium text-accent">
              {KIND_LABEL[post.kind]}
            </span>
            {compact ? (
              <span className="truncate text-fg-2">
                {COMMUNITY_SCOPE_LABEL[post.scope]} · {post.targetLabel}
              </span>
            ) : null}
            <span>{relativeDate(post.createdAt)}</span>
          </div>
          <h3 className="mt-1 line-clamp-2 [overflow-wrap:anywhere] text-sm font-semibold leading-snug text-fg">
            <Link
              href={`/community/post/${encodeURIComponent(post.id)}`}
              className="rounded-sm transition-colors duration-150 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
            >
              {post.title}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-fg-3">{post.author.name}</p>
        </div>
        {isOwner ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            aria-label="내 글 삭제"
            title="삭제"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg p-1.5 text-fg-3 transition-colors duration-150 hover:bg-raised hover:text-bad focus-visible:opacity-100 disabled:opacity-40 motion-reduce:transition-none md:opacity-0 md:group-hover:opacity-100"
          >
            <Trash2 size={15} />
          </button>
        ) : null}
      </header>

      <FanPostCardArt title={post.title} images={post.images} />
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-2">{post.text}</p>

      {post.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <span key={tag} className="rounded-md border border-line bg-raised/55 px-1.5 py-0.5 text-xs text-fg-3">
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3.5 border-t border-line pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none",
              open
                ? "border-accent/45 bg-accent-soft text-accent"
                : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
            )}
          >
            <MessageCircle size={14} aria-hidden="true" />
            댓글 {displayReplyCount}
          </button>
          {loadedCount !== null && displayReplyCount > 0 ? (
            <span className="text-xs tabular-nums text-fg-3">대화 {displayReplyCount}개</span>
          ) : null}
        </div>
        {open ? (
          <FanPostReplySection
            postId={post.id}
            initialReplies={post.replies}
            onCountChange={setLoadedCount}
            onReplyDelta={(delta) => onReplyCreated?.(post, delta)}
            className="mt-4"
          />
        ) : null}
      </div>
    </article>
  );
}
