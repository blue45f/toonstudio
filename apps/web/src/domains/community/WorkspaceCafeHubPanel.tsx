import * as Dialog from "@radix-ui/react-dialog";
import { Coffee, EyeOff, ImagePlus, Lock, MessageSquare, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { studioEcosystemClient } from "@/platform/studio-ecosystem-client";
import { useStudioEcosystemStream } from "@/platform/use-studio-ecosystem-stream";

import {
  CAFE_CHANNEL_LABELS,
  WORKSPACE_CAFE_SCOPE_LABELS,
  createDefaultWorkspaceCafes,
  createWorkspaceCafePost,
  validateCafeImageAttachment,
  type CafeBoardChannel,
  type CafeImageAttachment,
  type WorkspaceCafePost,
  type WorkspaceCafeScope,
  type WorkspaceCafeSpace,
} from "./workspace-cafe-hub";

export interface WorkspaceCafeHubPanelProps {
  readonly cafes?: readonly WorkspaceCafeSpace[];
  readonly currentUserName?: string;
  readonly onPostCreated?: (post: WorkspaceCafePost) => void;
}

const SCOPES: readonly WorkspaceCafeScope[] = ["work", "team", "studio", "project"];

export function WorkspaceCafeHubPanel({
  cafes = createDefaultWorkspaceCafes(),
  currentUserName = "메인 작가",
  onPostCreated,
}: WorkspaceCafeHubPanelProps) {
  const [activeScope, setActiveScope] = useState<WorkspaceCafeScope>("work");
  const scopedCafes = useMemo(
    () => cafes.filter((c) => c.scope === activeScope),
    [cafes, activeScope],
  );
  const activeCafe = scopedCafes[0] ?? cafes[0];
  const [channel, setChannel] = useState<CafeBoardChannel>(activeCafe.channels[0]);
  const [channelFilter, setChannelFilter] = useState<CafeBoardChannel | "all">("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<CafeImageAttachment[]>([]);
  const [lightboxImage, setLightboxImage] = useState<CafeImageAttachment | null>(null);
  const lightboxTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<WorkspaceCafePost[]>([]);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, readonly { id: string; author: string; text: string }[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const stream = useStudioEcosystemStream(true);
  const latestCafeEventId = useMemo(
    () => stream.events.find((e) => e.type === "cafe.post_created")?.id ?? null,
    [stream.events],
  );

  useEffect(() => {
    let active = true;
    void studioEcosystemClient
      .listCafePosts(activeScope)
      .then((res) => {
        if (!active || !Array.isArray(res?.items) || res.items.length === 0) return;
        const remotePosts = (res.items as Partial<WorkspaceCafePost>[])
          .filter((item): item is WorkspaceCafePost => Boolean(item?.id && item?.title && item?.cafeId))
          .map((item) => ({
            ...item,
            authorRoleBadge: item.authorRoleBadge ?? WORKSPACE_CAFE_SCOPE_LABELS[activeScope],
            attachments: Array.isArray(item.attachments) ? item.attachments : [],
          }));
        if (remotePosts.length === 0) return;
        setPosts((prev) => {
          const remoteIds = new Set(remotePosts.map((p) => p.id));
          return [...remotePosts, ...prev.filter((p) => !remoteIds.has(p.id))];
        });
      })
      .catch(() => {
        // 오프라인/로컬 미리보기 환경에서는 낙관적 게시글 목록을 유지한다.
      });
    return () => {
      active = false;
    };
  }, [activeScope, latestCafeEventId]);

  const handleScopeChange = (scope: WorkspaceCafeScope) => {
    setActiveScope(scope);
    const nextCafe = cafes.find((c) => c.scope === scope) ?? cafes[0];
    setChannel(nextCafe.channels[0]);
    setChannelFilter("all");
    setError(null);
  };

  const handleAddComment = (postId: string) => {
    const draft = (commentDrafts[postId] ?? "").trim();
    if (!draft) return;
    setCommentsByPost((prev) => ({
      ...prev,
      [postId]: [...(prev[postId] ?? []), { id: `cmt-${Date.now().toString(36)}`, author: currentUserName, text: draft }],
    }));
    setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
  };

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const res = validateCafeImageAttachment({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        dataUrl,
        existingCount: attachments.length,
      });
      if (!res.ok) {
        setError(res.errorKo);
        return;
      }
      setError(null);
      setAttachments((prev) => [...prev, res.attachment]);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const resolvedChannel = activeCafe.channels.includes(channel) ? channel : activeCafe.channels[0];
    const result = createWorkspaceCafePost({
      cafe: activeCafe,
      channel: resolvedChannel,
      authorName: currentUserName,
      authorRoleBadge: WORKSPACE_CAFE_SCOPE_LABELS[activeCafe.scope],
      title,
      body,
      attachments,
    });
    if (!result.ok) {
      setError(result.errorKo);
      return;
    }
    setError(null);
    setPosts((prev) => [result.post, ...prev]);
    onPostCreated?.(result.post);
    void studioEcosystemClient
      .createCafePost(activeCafe.id, {
        scope: activeCafe.scope,
        channel: resolvedChannel,
        authorName: currentUserName,
        title: result.post.title,
        body: result.post.body,
        attachments: result.post.attachments,
      })
      .catch(() => {
        // 오프라인/로컬 환경에서는 낙관적 게시글 상태를 유지한다.
      });
    setTitle("");
    setBody("");
    setAttachments([]);
  };

  const visiblePosts = posts.filter(
    (p) => p.cafeId === activeCafe.id && (channelFilter === "all" || p.channel === channelFilter),
  );

  return (
    <section
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-panel p-4 text-fg [overflow-wrap:break-word] [word-break:keep-all] sm:p-5"
      aria-label="작품·팀·스튜디오·프로젝트별 카페 허브"
    >
      <header className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Coffee className="size-4 shrink-0 text-fg-2" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="text-sm font-medium leading-[1.4] tracking-[-0.01em] text-fg">
            작품 · 팀 · 스튜디오 · 프로젝트 카페 허브
          </h3>
        </div>
        <div
          className="flex snap-x gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0"
          role="tablist"
          aria-label="카페 단위 선택"
        >
          {SCOPES.map((scope) => (
            <button
              key={scope}
              type="button"
              role="tab"
              aria-selected={activeScope === scope}
              onClick={() => handleScopeChange(scope)}
              className={`min-h-11 shrink-0 snap-start rounded-lg border px-3 text-xs transition-colors duration-150 sm:min-h-8 ${
                activeScope === scope
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              }`}
            >
              {WORKSPACE_CAFE_SCOPE_LABELS[scope]}
            </button>
          ))}
        </div>
      </header>

      <div className="rounded-lg border border-line bg-card p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h4 className="flex items-center gap-1.5 text-sm font-medium leading-[1.45] text-fg">
              <span className="truncate">{activeCafe.name}</span>
              {activeCafe.visibility !== "public" && (
                <Lock className="size-3.5 shrink-0 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
              )}
            </h4>
            <p className="mt-0.5 text-xs leading-[1.5] text-fg-3">{activeCafe.descriptionKo}</p>
          </div>
          <span className="text-xs tabular-nums text-fg-3">
            멤버 {activeCafe.memberCount.toLocaleString("ko-KR")}명 ·{" "}
            {stream.status === "connected" ? "실시간" : "로컬"}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2.5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              aria-label="게시판 채널"
              value={channel}
              onChange={(e) => setChannel(e.target.value as CafeBoardChannel)}
              className="min-h-11 rounded-lg border border-line bg-panel px-3 text-xs text-fg sm:min-h-9"
            >
              {activeCafe.channels.map((ch) => (
                <option key={ch} value={ch}>
                  {CAFE_CHANNEL_LABELS[ch]}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="게시글 제목을 입력하세요"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-xs text-fg sm:min-h-9"
            />
          </div>
          <textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="원고 피드백, 레퍼런스, 공지 내용을 작성하고 이미지를 첨부해 보세요"
            className="rounded-lg border border-line bg-panel px-3 py-2.5 text-xs leading-[1.6] text-fg"
          />

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex min-h-10 items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 text-xs sm:min-h-8"
                >
                  <span className="max-w-32 truncate">{att.fileName}</span>
                  <button
                    type="button"
                    aria-label={`${att.fileName} 스포일러 블러 토글`}
                    onClick={() =>
                      setAttachments((prev) =>
                        prev.map((item) =>
                          item.id === att.id ? { ...item, spoilerBlur: !item.spoilerBlur } : item,
                        ),
                      )
                    }
                    className={`grid min-h-8 min-w-8 place-items-center ${att.spoilerBlur ? "text-warn" : "text-fg-3"}`}
                  >
                    <EyeOff className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`${att.fileName} 삭제`}
                    onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== att.id))}
                    className="grid min-h-8 min-w-8 place-items-center text-fg-3 hover:text-bad"
                  >
                    <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs leading-[1.45] text-bad">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs tabular-nums text-fg-2 transition-colors duration-150 hover:bg-raised sm:min-h-9 sm:w-auto">
              <ImagePlus className="size-3.5 shrink-0 text-fg-2" strokeWidth={1.5} aria-hidden="true" />
              <span>이미지 첨부 ({attachments.length}/8)</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={handleImageUpload}
              />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-medium text-on-accent transition-opacity duration-150 hover:opacity-90 sm:min-h-9 sm:w-auto"
            >
              <Send className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              게시하기
            </button>
          </div>
        </form>
      </div>

      {posts.some((p) => p.cafeId === activeCafe.id) && (
        <div
          className="flex snap-x gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0"
          aria-label="게시판 채널 필터"
        >
          <button
            type="button"
            onClick={() => setChannelFilter("all")}
            className={`min-h-11 shrink-0 snap-start rounded-lg border px-3 text-xs transition-colors duration-150 sm:min-h-8 ${
              channelFilter === "all"
                ? "border-accent bg-accent-soft font-medium text-accent"
                : "border-line bg-card text-fg-2 hover:text-fg"
            }`}
          >
            전체 채널
          </button>
          {activeCafe.channels.map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannelFilter(ch)}
              className={`min-h-11 shrink-0 snap-start rounded-lg border px-3 text-xs transition-colors duration-150 sm:min-h-8 ${
                channelFilter === ch
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-line bg-card text-fg-2 hover:text-fg"
              }`}
            >
              {CAFE_CHANNEL_LABELS[ch]}
            </button>
          ))}
        </div>
      )}

      {visiblePosts.length > 0 && (
        <ul className="space-y-2">
          {visiblePosts.map((post) => {
            const postComments = commentsByPost[post.id] ?? [];
            return (
              <li key={post.id} className="rounded-lg border border-line bg-card p-3.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium leading-[1.45] text-fg">{post.title}</span>
                  <span className="text-fg-3">{CAFE_CHANNEL_LABELS[post.channel]}</span>
                </div>
                {post.body && (
                  <p className="mt-1.5 whitespace-pre-wrap leading-[1.6] text-fg-2">{post.body}</p>
                )}
                {post.attachments.length > 0 && (
                  <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {post.attachments.map((att) => (
                      <button
                        key={att.id}
                        type="button"
                        onClick={(event) => {
                          lightboxTriggerRef.current = event.currentTarget;
                          setLightboxImage(att);
                        }}
                        className="overflow-hidden rounded-md border border-line text-left transition-colors duration-150 hover:border-accent"
                        aria-label={`${att.fileName} 크게 보기`}
                      >
                        <img
                          src={att.dataUrl}
                          alt={att.caption || att.fileName}
                          className={`h-24 w-full object-cover ${
                            att.spoilerBlur ? "blur-sm" : ""
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-col gap-2 border-t border-line pt-2.5">
                  {postComments.length > 0 && (
                    <ul className="space-y-1 text-fg-2">
                      {postComments.map((cmt) => (
                        <li key={cmt.id} className="flex items-baseline gap-1.5">
                          <MessageSquare className="size-3 shrink-0 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
                          <span className="font-medium text-fg">{cmt.author}:</span>
                          <span>{cmt.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={commentDrafts[post.id] ?? ""}
                      onChange={(e) =>
                        setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))
                      }
                      placeholder="댓글 피드백 남기기"
                      className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 text-xs text-fg sm:min-h-8"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddComment(post.id)}
                      className="min-h-11 shrink-0 rounded-lg border border-line bg-panel px-3 text-xs font-medium text-fg-2 transition-colors duration-150 hover:bg-raised sm:min-h-8"
                    >
                      댓글
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {lightboxImage && (
        <Dialog.Root open onOpenChange={(open) => { if (!open) setLightboxImage(null); }}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-3 backdrop-blur-xs sm:p-6">
              <Dialog.Content
                aria-modal="true"
                aria-describedby={undefined}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  if (lightboxTriggerRef.current?.isConnected) {
                    lightboxTriggerRef.current.focus({ preventScroll: true });
                  }
                }}
                className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl border border-line bg-panel p-4"
              >
                <Dialog.Title className="sr-only">{lightboxImage.fileName} 이미지 미리보기</Dialog.Title>
                <div className="mb-2 flex items-center justify-between gap-4 text-xs">
                  <span className="truncate font-medium text-fg">{lightboxImage.fileName}</span>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="inline-flex min-h-[var(--site-control-size)] items-center gap-1 rounded-lg border border-line px-3 text-fg-2 hover:bg-raised"
                    >
                      <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                      닫기
                    </button>
                  </Dialog.Close>
                </div>
                <img
                  src={lightboxImage.dataUrl}
                  alt={lightboxImage.caption || lightboxImage.fileName}
                  className="mx-auto max-h-[72vh] w-auto rounded-lg object-contain"
                />
              </Dialog.Content>
            </Dialog.Overlay>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </section>
  );
}
