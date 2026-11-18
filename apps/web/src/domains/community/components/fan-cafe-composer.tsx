import { BookOpenText, Eye, ImagePlus, MessageCircle, Send, Sparkles, UsersRound, X } from "lucide-react";
import { useRef } from "react";

import { isComposerDraftKind, type FanCafeComposerDraft } from "./fan-cafe-composer-draft";
import {
  FAN_CAFE_POST_TAGS_MAX_LENGTH,
  FAN_CAFE_POST_TEXT_MAX_LENGTH,
  FAN_CAFE_POST_TITLE_MAX_LENGTH,
  KIND_ITEMS,
  type FanCafeComposeLock,
} from "./fan-cafe-constants";
import { FanPostImages as FanPostImagesView } from "./fan-cafe-images";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  translateCurrentStaticSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { ATTACHMENT_MAX_COUNT } from "@/shared/lib/image-attach";
import type { FanCafePostKind } from "@/shared/lib/types";
import Link from "@/shared/navigation/router-link";

const bi = (ko: string, en: string) => translateBilingualValueForActiveLocale("FanCafePanel", ko, en);

interface FanCafeComposerColumnProps {
  readonly userId: string | null;
  readonly composeLock?: FanCafeComposeLock | null;
  readonly composeKind: FanCafePostKind;
  readonly onComposeKindChange: (kind: FanCafePostKind) => void;
  readonly title: string;
  readonly onTitleChange: (value: string) => void;
  readonly text: string;
  readonly onTextChange: (value: string) => void;
  readonly tags: string;
  readonly onTagsChange: (value: string) => void;
  readonly images: string[];
  readonly onRemoveImage: (index: number) => void;
  readonly onAttachFiles: (files: FileList | null) => void;
  readonly attachBusy: boolean;
  readonly previewing: boolean;
  readonly onTogglePreview: () => void;
  readonly isSubmittingPost: boolean;
  readonly onSubmit: (sourceEl: HTMLElement) => void;
  readonly draftSavedAt: string | null;
  readonly pendingDraft: FanCafeComposerDraft | null;
  readonly onApplyDraft: () => void;
  readonly onDiscardDraft: () => void;
  readonly error: string | null;
}

/** 작성 데이터·업로드·게시 권한은 부모가 소유하고 여기서는 입력과 안내만 표시한다. */
export function FanCafeComposerColumn({
  userId, composeLock, composeKind, onComposeKindChange,
  title, onTitleChange, text, onTextChange, tags, onTagsChange,
  images, onRemoveImage, onAttachFiles, attachBusy,
  previewing, onTogglePreview, isSubmittingPost, onSubmit,
  draftSavedAt, pendingDraft, onApplyDraft, onDiscardDraft, error,
}: FanCafeComposerColumnProps) {
  useBilingualI18nRevision();
  const attachInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3">
      {composeLock ? (
              <div className="rounded-lg border border-dashed border-line bg-canvas/45 px-4 py-8 text-center">
                <UsersRound className="mx-auto mb-2 text-accent" size={20} />
                <p className="text-sm font-medium text-fg">{composeLock.message}</p>
                <p className="mt-1 text-xs text-fg-3">{translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "읽기는 누구에게나 열려 있습니다.")}</p>
                {composeLock.actionLabel && composeLock.onAction ? (
                  <button
                    type="button"
                    onClick={composeLock.onAction}
                    className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-2"
                  >
                    {composeLock.actionLabel}
                  </button>
                ) : null}
              </div>
            ) : userId ? (
            <div className="flex flex-col gap-3" id="fan-cafe-composer">
                {pendingDraft ? (
                  <div role="status" className="rounded-xl border border-accent/35 bg-accent-soft p-3">
                    <p className="text-xs font-semibold text-accent">
                      {translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "이어서 쓸 임시 글이 있어요")}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-fg-2">
                      {pendingDraft.title || pendingDraft.text.slice(0, 80) || pendingDraft.tags}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={onApplyDraft}
                        className="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-2"
                      >
                        {translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "이어쓰기")}
                      </button>
                      <button
                        type="button"
                        onClick={onDiscardDraft}
                        className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-xs text-fg-2 transition-colors hover:text-fg"
                      >
                        {translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "버리기")}
                      </button>
                    </div>
                  </div>
                ) : null}
                <label className="flex items-center gap-2 text-xs text-fg-2">
                  <span>{translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "카테고리")}</span>
                  <select
                    value={composeKind}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (value !== "all" && isComposerDraftKind(value)) onComposeKindChange(value);
                    }}
                    className="min-h-11 rounded-md border border-line bg-canvas px-2 text-sm text-fg outline-none focus:border-accent/60"
                  >
                    {KIND_ITEMS.filter((item) => item.value !== "all").map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                {previewing ? (
                  <div
                    className="rounded-xl border border-line bg-card p-4"
                    aria-label={translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "글 미리보기")}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-accent/35 bg-accent-soft px-1.5 py-0.5 text-xs font-semibold text-accent">
                        {KIND_ITEMS.find((item) => item.value === composeKind)?.label ?? composeKind}
                      </span>
                      <span className="text-xs text-fg-2">
                        {translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "미리보기 · 아직 등록되지 않았어요")}
                      </span>
                    </div>
                    <h3 className="mt-2 whitespace-pre-wrap break-words text-sm font-bold leading-snug text-fg">
                      {title || translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "제목 없음")}
                    </h3>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-2">{text}</p>
                    <FanPostImagesView title={title || "미리보기"} images={images} />
                    {tags.trim() ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {tags.split(/[,\s#]+/).map((tag) => tag.trim().toLowerCase()).filter(Boolean).map((tag) => (
                          <span key={tag} className="rounded-md border border-line bg-raised/70 px-1.5 py-0.5 text-xs text-fg-2">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                <input
                  value={title}
                  onChange={(event) => onTitleChange(event.target.value.slice(0, FAN_CAFE_POST_TITLE_MAX_LENGTH))}
                  maxLength={FAN_CAFE_POST_TITLE_MAX_LENGTH}
                  aria-label={translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "팬카페 글 제목")}
                  placeholder={translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "팬카페 글 제목")}
                  className="min-h-11 rounded-lg border border-line bg-canvas px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent/60"
                />
                <div className="text-right text-xs text-fg-2">
                  {title.length}/{FAN_CAFE_POST_TITLE_MAX_LENGTH}
                </div>
                <textarea
                  value={text}
                  onChange={(event) => onTextChange(event.target.value.slice(0, FAN_CAFE_POST_TEXT_MAX_LENGTH))}
                  maxLength={FAN_CAFE_POST_TEXT_MAX_LENGTH}
                  rows={5}
                  aria-label={translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "팬카페 글 본문")}
                  placeholder={translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "해석, 질문, 응원, 팬아트 메모를 남겨보세요.")}
                  className="resize-none rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm leading-relaxed text-fg outline-none placeholder:text-fg-3 focus:border-accent/60"
                />
                <div className="text-right text-xs text-fg-2">
                  {text.length}/{FAN_CAFE_POST_TEXT_MAX_LENGTH}
                </div>
                <input
                  value={tags}
                  onChange={(event) => onTagsChange(event.target.value.slice(0, FAN_CAFE_POST_TAGS_MAX_LENGTH))}
                  maxLength={FAN_CAFE_POST_TAGS_MAX_LENGTH}
                  aria-label={translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "팬카페 글 태그 (선택)")}
                  placeholder={translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "#정주행 #해석 처럼 태그 추가")}
                  className="min-h-11 rounded-lg border border-line bg-canvas px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent/60"
                />
                <input
                  ref={attachInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(event) => {
                    onAttachFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => attachInputRef.current?.click()}
                    disabled={attachBusy || images.length >= ATTACHMENT_MAX_COUNT}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-raised/55 px-2.5 text-xs font-medium text-fg-2 transition-colors hover:bg-canvas/55 hover:text-fg disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ImagePlus size={14} />
                    {attachBusy ? translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "이미지 처리 중...") : formatI18nTemplate(translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "이미지 첨부 {v0}/{v1}"), { v0: String(images.length), v1: String(ATTACHMENT_MAX_COUNT) })}
                  </button>
                  <span className="text-xs text-fg-2">{translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "긴 변 1600px·장당 2MB로 자동 축소")}</span>
                </div>
                {images.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {images.map((src, index) => (
                      <li key={`${index}-${src.slice(-24)}`} className="relative">
                        <img
                          src={src}
                          alt={formatI18nTemplate(translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "첨부 미리보기 {v0}"), { v0: String(index + 1) })}
                          className="size-16 rounded-lg border border-line object-cover"
                        />
                        <button
                          type="button"
                          aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "첨부 이미지 {v0} 제거"), { v0: String(index + 1) })}
                          onClick={() => onRemoveImage(index)}
                          className="absolute -right-1.5 -top-1.5 grid min-h-11 min-w-11 place-items-center rounded-full border border-line bg-canvas text-fg-3 transition-colors hover:text-bad"
                        >
                          <X size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                  </>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onTogglePreview}
                    aria-pressed={previewing}
                    disabled={previewing ? false : !title.trim() && !text.trim()}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-raised/55 px-3 text-xs font-medium text-fg-2 transition-colors hover:bg-canvas/55 hover:text-fg disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Eye size={14} />
                    {previewing
                      ? translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "작성으로 돌아가기")
                      : translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "미리보기")}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => onSubmit(event.currentTarget)}
                    disabled={!title.trim() || !text.trim() || isSubmittingPost || attachBusy}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Send size={15} />
                    {isSubmittingPost ? translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "등록 중...") : translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "팬카페에 올리기")}
                  </button>
                </div>
                <p role="status" aria-live="polite" className="text-right text-xs text-fg-2">
                  {draftSavedAt
                    ? formatI18nTemplate(translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "임시저장됨 · {v0}"), { v0: new Date(draftSavedAt).toLocaleTimeString("ko-KR") })
                    : null}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-line bg-canvas/45 px-4 py-8 text-center">
                <Sparkles className="mx-auto mb-2 text-accent" size={20} />
                <p className="text-sm font-medium text-fg">{translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "로그인하면 팬카페에 글을 쓸 수 있습니다.")}</p>
                <p className="mt-1 text-xs text-fg-3">{translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "읽기는 누구에게나 열려 있습니다.")}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "community-compose", mode: "login" })}
                    className="min-h-11 rounded-lg border border-line bg-raised px-3 py-2 text-xs font-semibold text-fg-2 transition-colors hover:border-accent/45 hover:text-fg"
                  >
                    {bi("로그인하고 글 쓰기", "Sign in to post")}</button>
                  <a className="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-on-accent" href="/terms">
                    {translateCurrentStaticSourceText("domains.community.components.fan.cafe.panel", "ko", "약관 보기")}</a>
                </div>
              </div>
            )}
      {error ? <p role="alert" className="mt-3 text-xs text-bad">{error}</p> : null}
    </div>
  );
}

export function FanCafeSpaceGuide() {
  useBilingualI18nRevision();
  return (
    <div className="rounded-2xl border border-dashed border-line bg-gradient-to-br from-card/70 to-panel/45 px-4 py-5 text-left">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent-soft text-accent">
                  <Sparkles size={18} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-black text-fg">{bi("주제에 맞는 대화 공간을 고르세요", "Choose a conversation space")}</p>
                  <p className="mt-1 text-xs leading-5 text-fg-3">{bi("통합 피드에서 대화를 둘러보고, 글을 남길 공간을 선택하세요.", "Browse the shared feed, then choose a space to start your conversation.")}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {[
                  { href: "/community/title", icon: BookOpenText, title: bi("작품 대화", "Titles"), body: bi("장면과 해석을 함께 나누기", "Discuss scenes and interpretations") },
                  { href: "/community/author", icon: UsersRound, title: bi("작가 대화", "Authors"), body: bi("좋아하는 작가의 이야기", "Talk about your favorite creators") },
                  { href: "/community/pencafe", icon: MessageCircle, title: bi("펜카페", "Pen cafés"), body: bi("창작자의 작업과 소식", "Creative work and studio updates") },
                  { href: "/community/cafes", icon: Sparkles, title: bi("회원 카페", "Member cafés"), body: bi("취향이 맞는 사람들과 나누기", "Find people with shared tastes") },
                ].map(({ href, icon: Icon, title, body }) => (
                  <Link key={href} href={href} className="rounded-xl border border-line bg-panel/75 p-3 transition-colors hover:border-accent/35 hover:bg-raised">
                    <Icon size={15} className="text-accent" aria-hidden="true" />
                    <strong className="mt-2 block text-xs font-black text-fg">{title}</strong>
                    <span className="mt-0.5 block text-xs text-fg-2">{body}</span>
                  </Link>
                ))}
              </div>
            </div>
  );
}

export function FanCafeStarterEmpty() {
  useBilingualI18nRevision();
  return (
    <div className="rounded-2xl border border-dashed border-line bg-gradient-to-br from-card/70 to-panel/45 px-5 py-7">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-accent/25 bg-accent-soft text-accent">
                    <MessageCircle size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-black text-fg">첫 대화를 기다리고 있습니다</p>
                    <p className="mt-1 text-xs leading-5 text-fg-3">사용자 글을 꾸며 채우지 않습니다. 운영 주제에서 시작하거나 원하는 보드로 이동해 첫 기록을 남기세요.</p>
                  </div>
                </div>
                <p className="mt-5 text-xs font-black uppercase tracking-[0.14em] text-accent">STARTER TOPICS</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {[
                    { href: "/community/cafes?topic=work-checkin", icon: BookOpenText, title: "오늘 작업 인증", body: "막힌 컷과 다음 한 걸음을 나눠요." },
                    { href: "/showcase/challenges", icon: ImagePlus, title: "3컷 챌린지", body: "작은 결과물로 첫 작품을 공개해요." },
                    { href: "/collaborate", icon: UsersRound, title: "피드백 파트너", body: "구도·대사·배경을 함께 검토할 사람을 찾아요." },
                  ].map(({ href, icon: Icon, title, body }) => (
                    <Link key={href} href={href} className="group rounded-xl border border-line bg-panel/75 p-3 transition-colors hover:border-accent/35 hover:bg-raised">
                      <Icon size={16} className="text-accent" aria-hidden="true" />
                      <strong className="mt-3 block text-xs font-black text-fg">{title}</strong>
                      <span className="mt-1 block text-xs leading-5 text-fg-2">{body}</span>
                    </Link>
                  ))}
                </div>
              </div>
  );
}
