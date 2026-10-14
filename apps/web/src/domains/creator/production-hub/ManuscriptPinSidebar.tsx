/**
 * 원고 뷰어 핀 피드백 — 핀 목록 사이드바.
 *
 * 필터(전체/미해결/내 핀) + 상태순 정렬 + 클릭 시 뷰어 이동.
 * CSS는 manuscript-pin-feedback.css를 공유한다.
 */

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  hasManuscriptPinDrawing,
  isManuscriptPinUnread,
  type ManuscriptPin,
  type ManuscriptPinFeedbackPin,
  type ManuscriptPinFilter,
} from "./manuscript-pin-feedback-model";
import {
  formatManuscriptPinTime,
  manuscriptPinStatusLabel,
} from "./manuscript-pin-feedback-text";

/** 빈 목록 일러스트 — 기존 AI 생성 에셋(`/images/empty-*.webp`) 재활용. 장식용. */
const PIN_EMPTY_LIST_ART_SRC = "/images/empty-generic.webp";

interface ManuscriptPinSidebarProps {
  readonly pins: readonly ManuscriptPinFeedbackPin[];
  readonly openCount: number;
  readonly selectedId: string | null;
  readonly filter: ManuscriptPinFilter;
  readonly onFilterChange: (filter: ManuscriptPinFilter) => void;
  readonly onSelectPin: (pin: ManuscriptPin) => void;
  /** 미읽음 판정·배지의 기준 사용자. 없으면 미읽음 표시를 하지 않는다. */
  readonly currentActorId?: string | null;
  /** 전체 핀 기준 미읽음 수. 0보다 클 때만 머리말 배지로 보여 준다. */
  readonly unreadCount?: number;
}

const FILTER_OPTIONS = [
  { value: "all", ko: "전체", en: "All" },
  { value: "open", ko: "미해결", en: "Open" },
  { value: "unread", ko: "미읽음만", en: "Unread only" },
  { value: "urgent", ko: "필수 수정", en: "Required" },
  { value: "resolved", ko: "해결됨", en: "Resolved" },
  { value: "mine", ko: "내 핀", en: "Mine" },
  { value: "assigned", ko: "내 담당", en: "Assigned to me" },
] as const satisfies readonly { readonly value: ManuscriptPinFilter; readonly ko: string; readonly en: string }[];

/** 핀 목록 사이드바: 필터 + 상태순 정렬 + 클릭 시 뷰어 이동 */
export function ManuscriptPinSidebar({
  pins,
  openCount,
  selectedId,
  filter,
  onFilterChange,
  onSelectPin,
  currentActorId = null,
  unreadCount = 0,
}: ManuscriptPinSidebarProps) {
  const bt = useBilingual("ManuscriptPinFeedback");
  return (
    <aside className="manuscript-pin-sidebar" aria-label={bt("핀 목록", "Pin list")}>
      <div className="manuscript-pin-sidebar-head">
        <h3 className="manuscript-pin-sidebar-title">
          {bt("핀 피드백", "Pin feedback")}
          <span className="manuscript-pin-count">
            {bt(`미해결 ${openCount}개`, `${openCount} open`)}
          </span>
          {unreadCount > 0 ? (
            <span className="manuscript-pin-count" data-tone="unread">
              {bt(`미읽음 ${unreadCount}개`, `${unreadCount} unread`)}
            </span>
          ) : null}
        </h3>
        <div className="manuscript-pin-filters" role="group" aria-label={bt("필터", "Filter")}>
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="manuscript-pin-filter"
              data-active={filter === option.value || undefined}
              aria-pressed={filter === option.value}
              onClick={() => onFilterChange(option.value)}
            >
              {bt(option.ko, option.en)}
            </button>
          ))}
        </div>
      </div>
      {pins.length > 0 ? (
        <ul className="manuscript-pin-list">
          {pins.map((pin) => (
            <li key={pin.id}>
              <button
                type="button"
                className="manuscript-pin-item"
                data-selected={pin.id === selectedId || undefined}
                onClick={() => onSelectPin(pin)}
              >
                <span className="manuscript-pin-item-num" data-status={pin.status} aria-hidden="true">
                  {pin.number}
                </span>
                <span className="manuscript-pin-item-text">
                  <span className="manuscript-pin-item-preview">
                    {isManuscriptPinUnread(pin, currentActorId) ? (
                      <span className="manuscript-pin-item-unread-dot" role="img" aria-label={bt("미읽음", "Unread")} />
                    ) : null}
                    {pin.body}
                  </span>
                  <span className="manuscript-pin-item-sub">
                    {pin.authorName} · {formatManuscriptPinTime(bt, pin.createdAt)}
                    {pin.replyCount > 0 && bt(` · 답글 ${pin.replyCount}`, ` · ${pin.replyCount} replies`)}
                    {(pin.references?.length ?? 0) > 0 &&
                      bt(` · 레퍼런스 ${pin.references?.length ?? 0}`, ` · ${pin.references?.length ?? 0} ref`)}
                  </span>
                  {(pin.references?.length ?? 0) === 0 ? (
                    <span className="manuscript-pin-item-noref">
                      {bt("레퍼런스 없음", "No reference")}
                    </span>
                  ) : null}
                  {pin.assigneeName ? (
                    <span className="manuscript-pin-item-assignee">{bt(`담당 ${pin.assigneeName}`, `Assignee ${pin.assigneeName}`)}</span>
                  ) : null}
                  {hasManuscriptPinDrawing(pin) ? (
                    <span className="manuscript-pin-item-drawing">{bt("✎ 그림 표시", "✎ Drawing")}</span>
                  ) : null}
                </span>
                <span className="manuscript-pin-item-status" data-status={pin.status}>
                  {manuscriptPinStatusLabel(bt, pin.status)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="manuscript-pin-empty-list">
          <img
            src={PIN_EMPTY_LIST_ART_SRC}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="manuscript-pin-empty-list-art"
          />
          <p>
            {filter === "all"
              ? bt("아직 핀이 없어요. 핀 꽂기로 첫 피드백을 남겨보세요.", "No pins yet. Drop your first pin to leave feedback.")
              : filter === "unread"
                ? bt("미읽은 핀이 없어요. 다 확인했어요.", "No unread pins. You're all caught up.")
                : bt("해당하는 핀이 없어요.", "No matching pins.")}
          </p>
        </div>
      )}
    </aside>
  );
}
