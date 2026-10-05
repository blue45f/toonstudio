/**
 * 작가 공지 관리 — 시리즈 상세(소유자 화면)에서 공지를 쓰고 게시한다.
 *
 * 작성 폼(범위·유형·제목·본문)과 내 공지 목록(초안/게시 상태, 게시·게시 취소·
 * 수정·삭제)을 한곳에 둔다. 상태 전환으로 자동 생성된 초안도 이 목록에 나타난다.
 * 빈 목록은 "아직 쓴 공지가 없어요"로, 저장 실패는 오류 문구로 구분해 표시한다.
 */

import { Megaphone, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { validateAuthorNoticeDraft } from "./author-notice-model";
import { useAuthorNoticeStore, useAuthorNoticesHydrated } from "./author-notice-store";
import type { AuthorNotice, AuthorNoticeKind, AuthorNoticeScope } from "./author-notice-types";

export interface AuthorNoticeManagerWork {
  readonly id: string;
  readonly title: string;
}

export interface AuthorNoticeManagerProps {
  readonly authorName: string;
  readonly actorId: string;
  readonly works: readonly AuthorNoticeManagerWork[];
  readonly className?: string;
}

type ManagerNotice = { kind: "success" | "error"; text: string } | null;

const AUTHOR_SCOPE_VALUE = "author";

export function AuthorNoticeManager({
  authorName,
  actorId,
  works,
  className,
}: AuthorNoticeManagerProps) {
  const t = useBilingual("author-notices");
  const hydrated = useAuthorNoticesHydrated();
  const notices = useAuthorNoticeStore((state) => state.notices);
  const createNotice = useAuthorNoticeStore((state) => state.createNotice);
  const updateNotice = useAuthorNoticeStore((state) => state.updateNotice);
  const deleteNotice = useAuthorNoticeStore((state) => state.deleteNotice);
  const setNoticeStatus = useAuthorNoticeStore((state) => state.setNoticeStatus);

  const [scopeValue, setScopeValue] = useState<string>(AUTHOR_SCOPE_VALUE);
  const [kind, setKind] = useState<AuthorNoticeKind>("general");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ManagerNotice>(null);

  const myNotices = notices.filter(
    (item) => item.ownerId === actorId && item.authorName.trim() === authorName.trim(),
  );

  const kindLabel = (value: AuthorNoticeKind): string => {
    switch (value) {
      case "hiatus":
        return t("휴재 안내", "Hiatus notice");
      case "resume":
        return t("연재 재개", "Resumption notice");
      case "schedule":
        return t("일정 변경", "Schedule change");
      default:
        return t("일반 공지", "General notice");
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setScopeValue(AUTHOR_SCOPE_VALUE);
    setKind("general");
    setTitle("");
    setBody("");
  };

  const resolveScope = (): AuthorNoticeScope => {
    if (scopeValue === AUTHOR_SCOPE_VALUE) return { kind: "author" };
    const work = works.find((item) => item.id === scopeValue);
    if (!work) return { kind: "author" };
    return { kind: "work", workId: work.id, workTitle: work.title };
  };

  const handleSubmit = () => {
    const validation = validateAuthorNoticeDraft({ title, body });
    if (!validation.ok) {
      setNotice({
        kind: "error",
        text:
          validation.reason === "empty-title"
            ? t("제목을 입력해 주세요.", "Please enter a title.")
            : t("본문을 입력해 주세요.", "Please enter the notice body."),
      });
      return;
    }
    if (editingId) {
      const updated = updateNotice(editingId, { kind, title, body }, actorId);
      if (!updated) {
        setNotice({
          kind: "error",
          text: t("공지를 수정하지 못했어요.", "Could not update the notice."),
        });
        return;
      }
      setNotice({ kind: "success", text: t("공지를 수정했어요.", "Notice updated.") });
    } else {
      const created = createNotice(authorName, { scope: resolveScope(), kind, title, body }, actorId);
      if (!created) {
        setNotice({
          kind: "error",
          text: t("공지를 저장하지 못했어요. 로그인 상태를 확인해 주세요.", "Could not save the notice. Please check that you are signed in."),
        });
        return;
      }
      setNotice({
        kind: "success",
        text: t("초안을 저장했어요. 게시하면 독자 페이지에 보입니다.", "Draft saved. Publish it to show it on reader pages."),
      });
    }
    resetForm();
  };

  const handleEdit = (item: AuthorNotice) => {
    setEditingId(item.id);
    setScopeValue(item.scope.kind === "work" ? item.scope.workId : AUTHOR_SCOPE_VALUE);
    setKind(item.kind);
    setTitle(item.title);
    setBody(item.body);
    setNotice(null);
  };

  const handleToggleStatus = (item: AuthorNotice) => {
    const next = item.status === "published" ? "draft" : "published";
    const done = setNoticeStatus(item.id, next, actorId);
    if (!done) {
      setNotice({
        kind: "error",
        text: t(
          "상태를 바꾸지 못했어요. 제목과 본문이 비어 있지 않은지 확인해 주세요.",
          "Could not change the status. Check that the title and body are not empty.",
        ),
      });
      return;
    }
    setNotice({
      kind: "success",
      text:
        next === "published"
          ? t("공지를 게시했어요.", "Notice published.")
          : t("게시 취소했어요. 초안으로 돌아갔습니다.", "Notice unpublished and back to draft."),
    });
  };

  const handleDelete = (item: AuthorNotice) => {
    if (!deleteNotice(item.id, actorId)) {
      setNotice({ kind: "error", text: t("공지를 삭제하지 못했어요.", "Could not delete the notice.") });
      return;
    }
    if (editingId === item.id) resetForm();
    setNotice({ kind: "success", text: t("공지를 삭제했어요.", "Notice deleted.") });
  };

  const inputClass =
    "w-full rounded-xl border border-line bg-panel-2 px-3 py-2.5 text-sm text-fg outline-none transition placeholder:text-fg-4 focus:border-accent focus:ring-2 focus:ring-accent/25";

  return (
    <section aria-label={t("작가 공지 관리", "Manage author notices")} className={className}>
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-fg">
        <Megaphone size={15} className="text-accent" aria-hidden />
        {t("작가 공지", "Author notices")}
      </h2>

      {!hydrated ? (
        <p className="mt-3 text-sm text-fg-3">{t("공지를 불러오는 중이에요…", "Loading notices…")}</p>
      ) : (
        <>
          <div className="mt-3 rounded-2xl border border-line bg-card p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-2">
                {t("공지 범위", "Scope")}
                <select
                  value={scopeValue}
                  onChange={(event) => setScopeValue(event.target.value)}
                  disabled={editingId !== null}
                  className={inputClass}
                >
                  <option value={AUTHOR_SCOPE_VALUE}>{t("작가 전체", "Whole author")}</option>
                  {works.map((work) => (
                    <option key={work.id} value={work.id}>
                      {work.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-2">
                {t("공지 유형", "Type")}
                <select
                  value={kind}
                  onChange={(event) => setKind(event.target.value as AuthorNoticeKind)}
                  className={inputClass}
                >
                  <option value="general">{kindLabel("general")}</option>
                  <option value="hiatus">{kindLabel("hiatus")}</option>
                  <option value="resume">{kindLabel("resume")}</option>
                  <option value="schedule">{kindLabel("schedule")}</option>
                </select>
              </label>
            </div>
            {editingId !== null && (
              <p className="mt-2 text-xs text-fg-3">
                {t("공지 범위는 만든 뒤에는 바꿀 수 없어요.", "The scope cannot be changed after creation.")}
              </p>
            )}
            <label className="mt-3 flex flex-col gap-1.5 text-xs font-medium text-fg-2">
              {t("제목", "Title")}
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("공지 제목", "Notice title")}
                className={inputClass}
              />
            </label>
            <label className="mt-3 flex flex-col gap-1.5 text-xs font-medium text-fg-2">
              {t("본문", "Body")}
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={5}
                placeholder={t("독자에게 전할 내용을 적어 주세요.", "Write what readers should know.")}
                className={inputClass}
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong"
              >
                <Plus size={14} aria-hidden />
                {editingId
                  ? t("수정 저장", "Save changes")
                  : t("초안 저장", "Save draft")}
              </button>
              {editingId !== null && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-fg-2 transition hover:bg-panel-2"
                >
                  {t("수정 취소", "Cancel editing")}
                </button>
              )}
            </div>
            {notice && (
              <p
                role={notice.kind === "error" ? "alert" : "status"}
                className={`mt-3 text-sm ${notice.kind === "error" ? "text-danger" : "text-success"}`}
              >
                {notice.text}
              </p>
            )}
          </div>

          {myNotices.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-line bg-card/40 p-6 text-center text-sm text-fg-3">
              {t(
                "아직 쓴 공지가 없어요. 휴재·일정 변경처럼 독자가 알아야 할 소식을 위에서 적어 보세요.",
                "No notices yet. Write news readers should know, like a hiatus or a schedule change.",
              )}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {myNotices.map((item) => (
                <li
                  key={item.id}
                  className="rounded-2xl border border-line bg-card p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        item.status === "published"
                          ? "bg-success/12 text-success"
                          : "bg-panel-2 text-fg-3"
                      }`}
                    >
                      {item.status === "published"
                        ? t("게시 중", "Published")
                        : t("초안", "Draft")}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-fg-2">
                      {kindLabel(item.kind)}
                    </span>
                    <span className="text-xs text-fg-3">
                      {item.scope.kind === "work"
                        ? item.scope.workTitle
                        : t("작가 전체", "Whole author")}
                    </span>
                    <span className="ml-auto flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(item)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/10"
                      >
                        {item.status === "published" ? (
                          <>
                            <Undo2 size={12} aria-hidden />
                            {t("게시 취소", "Unpublish")}
                          </>
                        ) : (
                          <>
                            <Send size={12} aria-hidden />
                            {t("게시", "Publish")}
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(item)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-fg-2 transition hover:bg-panel-2"
                      >
                        <Pencil size={12} aria-hidden />
                        {t("수정", "Edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-danger transition hover:bg-danger/10"
                      >
                        <Trash2 size={12} aria-hidden />
                        {t("삭제", "Delete")}
                      </button>
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-fg">{item.title}</p>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-fg-2">{item.body}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
