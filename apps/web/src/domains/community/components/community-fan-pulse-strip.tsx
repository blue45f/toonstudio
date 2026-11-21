/**
 * community-fan-pulse-strip.tsx — 커뮤니티 참여형 창작 응원 & 감상 펄스 보드.
 *
 * 처음 방문한 독자도 1초 만에 응원 칩을 눌러 OKLCH 마이크로 버스트와 스펙트럼 분포를
 * 확인하고, 한 줄 응원 스티커를 브라우저에 저장해 둘 수 있다.
 */

import { Flame, HeartHandshake, Palette, Send, Sparkles, X } from "lucide-react";
import { useState, type CSSProperties, type FormEvent } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  addFanCheerNote,
  FAN_PULSE_OPTIONS,
  loadFanPulseState,
  removeFanCheerNote,
  saveFanPulseState,
  toggleFanPulseMood,
  totalFanPulseVotes,
  type FanPulseMoodId,
  type FanPulseState,
} from "./community-fan-pulse-model";

import "../community-kinetic-fx.css";

const MOOD_ICONS = {
  "art-peak": Palette,
  "next-episode": Sparkles,
  goosebumps: Flame,
  "deadline-cheer": HeartHandshake,
} as const;

const SPARK_VECTORS: readonly { readonly sx: string; readonly sy: string }[] = [
  { sx: "-24px", sy: "-20px" },
  { sx: "-6px", sy: "-28px" },
  { sx: "14px", sy: "-26px" },
  { sx: "26px", sy: "-12px" },
  { sx: "-22px", sy: "10px" },
  { sx: "20px", sy: "12px" },
];

export function CommunityFanPulseStrip() {
  const t = useBilingual("domains.community.FanPulseStrip");
  const [state, setState] = useState<FanPulseState>(() => loadFanPulseState());
  const [selectedNoteMood, setSelectedNoteMood] = useState<FanPulseMoodId>("deadline-cheer");
  const [draft, setDraft] = useState("");
  const [burst, setBurst] = useState<{ readonly id: FanPulseMoodId; readonly nonce: number } | null>(null);
  const [liveEvent, setLiveEvent] = useState<
    | { readonly kind: "mood"; readonly moodId: FanPulseMoodId; readonly added: boolean }
    | { readonly kind: "note" }
    | null
  >(null);

  const persist = (next: FanPulseState) => {
    setState(next);
    saveFanPulseState(next);
  };

  const handleToggleMood = (moodId: FanPulseMoodId) => {
    const { state: next, added } = toggleFanPulseMood(state, moodId);
    persist(next);
    setSelectedNoteMood(moodId);
    if (added) {
      setBurst((prev) => ({ id: moodId, nonce: (prev?.nonce ?? 0) + 1 }));
    }
    setLiveEvent({ kind: "mood", moodId, added });
  };

  const handleSubmitNote = (event: FormEvent) => {
    event.preventDefault();
    const next = addFanCheerNote(state, selectedNoteMood, draft);
    if (!next) return;
    persist(next);
    setDraft("");
    setLiveEvent({ kind: "note" });
  };

  const liveStatus = (() => {
    if (!liveEvent) return "";
    if (liveEvent.kind === "note") {
      return t("한 줄 응원 스티커를 남겼어요", "Posted your one-line cheer sticker");
    }
    const opt = FAN_PULSE_OPTIONS.find((item) => item.id === liveEvent.moodId);
    if (!opt) return "";
    return liveEvent.added
      ? t(`"${opt.labelKo}" 응원을 보냈어요`, `Sent "${opt.labelEn}" cheer`)
      : t(`"${opt.labelKo}" 응원을 취소했어요`, `Removed "${opt.labelEn}" cheer`);
  })();

  const totalVotes = totalFanPulseVotes(state);

  return (
    <section
      data-testid="community-fan-pulse-strip"
      aria-label={t("오늘의 창작 응원 펄스", "Today's creator cheer pulse")}
      className="community-kinetic-card break-keep p-4 sm:p-5"
    >
      <span className="community-kinetic-ribbon" aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-fg sm:text-base">
            <HeartHandshake size={17} strokeWidth={1.5} className="shrink-0 text-accent" aria-hidden="true" />
            {t("오늘의 창작 응원 · 감상 펄스", "Today's creator cheer & impression pulse")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {t(
              "글쓰기가 부담스러울 때 버튼 한 번으로 응원해 보세요. 내 응원과 스티커는 이 브라우저에 저장돼요.",
              "Tap a reaction when you want to cheer in one second. Your picks and stickers stay saved in this browser.",
            )}
          </p>
        </div>
        <span
          data-testid="community-fan-pulse-total"
          className="rounded-lg border border-line bg-card px-2.5 py-1 text-xs font-medium tabular-nums text-fg-2"
        >
          {totalVotes > 0
            ? t(`내 기기 응원 ${totalVotes}회`, `${totalVotes} local cheers`)
            : t("첫 응원을 눌러 보세요", "Tap to send first cheer")}
        </span>
      </div>

      {/* 4종 1탭 응원 칩 + 실시간 스펙트럼 분포 */}
      <div
        role="group"
        aria-label={t("응원 반응 선택", "Pick a cheer reaction")}
        className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4"
      >
        {FAN_PULSE_OPTIONS.map((option) => {
          const Icon = MOOD_ICONS[option.id];
          const label = t(option.labelKo, option.labelEn);
          const hint = t(option.hintKo, option.hintEn);
          const picked = state.myPicks.includes(option.id);
          const count = state.counts[option.id];
          const ratio = totalVotes > 0 ? count / totalVotes : 0;
          const isBursting = burst?.id === option.id;

          return (
            <button
              key={option.id}
              type="button"
              data-testid={`community-pulse-btn-${option.id}`}
              aria-pressed={picked}
              onClick={() => handleToggleMood(option.id)}
              style={{ "--pulse-tone": option.toneVar } as CSSProperties}
              className="community-pulse-chip flex min-h-11 flex-col items-start justify-between gap-2 rounded-xl p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                  <Icon size={15} strokeWidth={1.5} style={{ color: option.toneVar }} aria-hidden="true" />
                  {label}
                </span>
                <span className="text-xs font-semibold tabular-nums text-fg-2">
                  {count}
                </span>
              </div>
              <span className="text-xs leading-4 text-fg-3">{hint}</span>
              <span className="block h-1.5 w-full overflow-hidden rounded-full bg-raised" aria-hidden="true">
                <span
                  className="community-pulse-bar-fill"
                  style={{
                    "--pulse-tone": option.toneVar,
                    transform: `scaleX(${ratio})`,
                  } as CSSProperties}
                />
              </span>
              {isBursting ? (
                <span key={burst.nonce} className="community-burst-layer" aria-hidden="true">
                  {SPARK_VECTORS.map((spark, index) => (
                    <span
                      key={index}
                      className="community-burst-dot"
                      style={{
                        "--burst-tone": option.toneVar,
                        "--sx": spark.sx,
                        "--sy": spark.sy,
                      } as CSSProperties}
                    />
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* 한 줄 응원 스티커 입력 */}
      <form onSubmit={handleSubmitNote} className="mt-3 flex flex-col gap-2 border-t border-line/70 pt-3 sm:flex-row">
        <label htmlFor="community-fan-pulse-input" className="sr-only">
          {t("한 줄 응원 스티커 입력", "Write a one-line cheer sticker")}
        </label>
        <input
          id="community-fan-pulse-input"
          data-testid="community-pulse-note-input"
          type="text"
          maxLength={80}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("작가님께 한 줄 응원을 남겨 보세요 (최대 80자)", "Leave a quick cheer note (max 80 chars)")}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-canvas px-3 text-xs text-fg outline-none placeholder:text-fg-3 focus:border-accent focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button
          type="submit"
          data-testid="community-pulse-note-submit"
          disabled={draft.trim().length === 0}
          aria-describedby={draft.trim().length === 0 ? "community-pulse-submit-hint" : undefined}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-semibold text-on-accent transition-[opacity,background-color] duration-150 hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          <Send size={14} strokeWidth={1.5} aria-hidden="true" />
          {t("응원 붙이기", "Pin cheer")}
        </button>
      </form>
      {draft.trim().length === 0 ? (
        <p id="community-pulse-submit-hint" className="mt-1 text-xs text-fg-3">
          {t("응원 문구를 입력하면 붙이기 버튼이 켜져요.", "Enter a short note to enable pinning.")}
        </p>
      ) : null}

      {state.notes.length > 0 ? (
        <ul
          data-testid="community-pulse-notes-list"
          className="mt-3 flex flex-wrap gap-2"
          aria-label={t("남긴 응원 스티커 목록", "Pinned cheer stickers")}
        >
          {state.notes.map((note) => {
            const option = FAN_PULSE_OPTIONS.find((entry) => entry.id === note.moodId) ?? FAN_PULSE_OPTIONS[0]!;
            return (
              <li
                key={note.id}
                className="community-pop-badge inline-flex max-w-full items-center gap-2 rounded-xl border border-line bg-card px-3 py-1.5 text-xs text-fg"
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: option.toneVar }}
                />
                <span className="break-keep [overflow-wrap:anywhere]">{note.text}</span>
                <button
                  type="button"
                  onClick={() => persist(removeFanCheerNote(state, note.id))}
                  aria-label={t(`"${note.text}" 응원 지우기`, `Remove cheer "${note.text}"`)}
                  className="inline-flex size-11 -my-2 -mr-2 shrink-0 items-center justify-center rounded-lg text-fg-3 transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <X size={13} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="sr-only" aria-live="polite">
        {liveStatus}
      </p>
    </section>
  );
}
