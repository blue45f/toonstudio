import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { Heart } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { api } from "@/platform/api";

import "../community-kinetic-fx.css";

interface PostLikeButtonProps {
  postId: string;
  userId: string | null;
  sessionToken: string | null;
  initialLiked: boolean;
  initialCount: number;
}

interface LikeResponse {
  liked: boolean;
  likeCount: number;
}

const LIKE_SPARKS: readonly { readonly sx: string; readonly sy: string; readonly tone: string }[] = [
  { sx: "-18px", sy: "-18px", tone: "var(--color-accent)" },
  { sx: "0px", sy: "-24px", tone: "var(--color-accent-2)" },
  { sx: "18px", sy: "-18px", tone: "var(--color-cool)" },
  { sx: "-20px", sy: "6px", tone: "var(--color-good)" },
  { sx: "20px", sy: "6px", tone: "var(--color-accent)" },
];

// 글 좋아요 토글 — 서버 응답을 정본으로 확정하고, 실패하면 낙관적 갱신을 되돌린다.
// 게스트는 카운트만 보고 클릭하면 기존 인증 모달 유도로 이어진다.
export function PostLikeButton({
  postId,
  userId,
  sessionToken,
  initialLiked,
  initialCount,
}: PostLikeButtonProps) {
  const [state, setState] = useState({ liked: initialLiked, count: initialCount });
  const [burstNonce, setBurstNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);

  async function toggleLike() {
    if (!userId) {
      requestAuthModalOpen({ reason: "protected-action", source: "community-post-like" });
      return;
    }
    if (pendingRef.current) return;
    pendingRef.current = true;
    const previous = state;
    const optimistic = {
      liked: !previous.liked,
      count: Math.max(0, previous.count + (previous.liked ? -1 : 1)),
    };
    setState(optimistic);
    if (optimistic.liked) setBurstNonce((prev) => prev + 1);
    setError(null);
    try {
      const result = await api.post<LikeResponse>(
        `/community/posts/${encodeURIComponent(postId)}/like`,
        {},
        { headers: sessionToken ? { "x-user-id": sessionToken } : undefined },
      );
      setState({ liked: result.liked, count: result.likeCount });
    } catch {
      setState(previous);
      setError(
        translateCurrentStaticSourceText(
          "domains.community.CommunityPostPage",
          "ko",
          "좋아요를 반영하지 못했습니다. 다시 시도해 주세요.",
        ),
      );
    } finally {
      pendingRef.current = false;
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void toggleLike()}
        aria-pressed={state.liked}
        aria-label={translateCurrentStaticSourceText(
          "domains.community.CommunityPostPage",
          "ko",
          "좋아요",
        )}
        className={`community-like-btn inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          state.liked
            ? "border-accent/45 bg-accent-soft text-accent"
            : "border-line text-fg-3 hover:border-accent/35 hover:text-fg"
        }`}
      >
        <Heart
          size={15}
          strokeWidth={1.5}
          fill={state.liked ? "currentColor" : "none"}
          className={burstNonce > 0 && state.liked ? "community-like-heart--pop" : undefined}
          aria-hidden
        />
        <span>{state.count}</span>
        {burstNonce > 0 && state.liked ? (
          <span key={burstNonce} className="community-burst-layer" aria-hidden="true">
            {LIKE_SPARKS.map((spark, index) => (
              <span
                key={index}
                className="community-burst-dot"
                style={{
                  "--burst-tone": spark.tone,
                  "--sx": spark.sx,
                  "--sy": spark.sy,
                } as CSSProperties}
              />
            ))}
          </span>
        ) : null}
      </button>
      {error && (
        <span role="alert" className="text-xs text-bad">
          {error}
        </span>
      )}
    </span>
  );
}
