/**
 * 모션 웹툰 페이지 (`/studio/motion-webtoon`).
 *
 * MotionWebtoonEditor를 호스팅하고 회차를 localStorage에 자동 저장한다.
 * 공유 링크(#motion-episode=<id>)로 들어오면 저장된 회차를 복원한다.
 */

import type { JSX } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import { MotionWebtoonAnimeToonWizard } from "./MotionWebtoonAnimeToonWizard";
import { MotionWebtoonEditor } from "./MotionWebtoonEditor";
import { MOTION_WEBTOON_UI_LABELS } from "./motion-webtoon-labels";
import {
  createMotionId,
  type MotionEpisode,
} from "./motion-webtoon-model";
import {
  loadLastEpisodeId,
  loadMotionEpisode,
  parseShareHashId,
  saveMotionEpisode,
} from "./motion-webtoon-storage";
import "./motion-webtoon.css";

const L = MOTION_WEBTOON_UI_LABELS;

const SCROLL_RIGS = [
  { id: "zdepth-5layer-parallax", ko: "5레이어 Z-Depth 패럴랙스", en: "5-Layer Z-Depth Parallax" },
  { id: "spring-balloon-physics", ko: "스프링 말풍선 물리", en: "Spring Balloon Physics" },
  { id: "camera-shake-haptic", ko: "카메라 셰이크·햅틱 연출", en: "Camera Shake & Haptic Cue" },
] as const;

const SYNC_PACINGS = [
  { id: "scroll-velocity-1to1", ko: "스크롤 속도 1:1 동기화", en: "1:1 Scroll Velocity Sync" },
  { id: "viewport-dwell-trigger", ko: "뷰포트 체류 트리거", en: "Viewport Dwell Trigger" },
  { id: "reduced-motion-safe", ko: "모션 감소 안전 폴백", en: "Reduced-Motion Safe Fallback" },
] as const;

type PageNotice =
  | { readonly kind: "restored" }
  | { readonly kind: "share-not-found" }
  | { readonly kind: "resumed" }
  | null;

function createEmptyEpisode(): MotionEpisode {
  const characterId = createMotionId("char");
  return {
    id: createMotionId("episode"),
    titleKo: "새 회차",
    titleEn: "New episode",
    characters: [
      { id: characterId, nameKo: "주인공", nameEn: "Hero", presetId: "narrator" },
    ],
    cuts: [],
  };
}

interface InitialState {
  readonly episode: MotionEpisode;
  readonly notice: PageNotice;
  /** 공유 회차 복원 저장이 실패했으면 처음부터 저장 실패 안내를 띄운다. */
  readonly saveFailed: boolean;
}

/** 첫 렌더에서 한 번만 초기 상태를 계산한다 (해시 파싱·복원). */
function resolveInitialState(): InitialState {
  if (typeof window === "undefined") {
    return { episode: createEmptyEpisode(), notice: null, saveFailed: false };
  }
  const shareId = parseShareHashId(window.location.hash);
  if (shareId) {
    const shared = loadMotionEpisode(shareId);
    // 해시는 한 번 소비하고 지운다 — 새로고침해도 복원 공지가 반복되지 않는다.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    if (shared) {
      const saved = saveMotionEpisode(shared);
      return { episode: shared, notice: { kind: "restored" }, saveFailed: !saved };
    }
    const lastId = loadLastEpisodeId();
    const last = lastId ? loadMotionEpisode(lastId) : null;
    return { episode: last ?? createEmptyEpisode(), notice: { kind: "share-not-found" }, saveFailed: false };
  }
  const lastId = loadLastEpisodeId();
  const last = lastId ? loadMotionEpisode(lastId) : null;
  if (last) {
    return { episode: last, notice: { kind: "resumed" }, saveFailed: false };
  }
  return { episode: createEmptyEpisode(), notice: null, saveFailed: false };
}

export function MotionWebtoonPage(): JSX.Element {
  const t = useBilingual("motion-webtoon");
  const lang = useI18n((state) => state.lang);
  const isKo = lang.startsWith("ko");
  const pickLang = (ko: string, en: string) => (isKo ? ko : en);
  const [scrollRig, setScrollRig] = useState<(typeof SCROLL_RIGS)[number]["id"]>("zdepth-5layer-parallax");
  const [syncPacing, setSyncPacing] = useState<(typeof SYNC_PACINGS)[number]["id"]>("scroll-velocity-1to1");
  const activeRig = SCROLL_RIGS.find((item) => item.id === scrollRig) ?? SCROLL_RIGS[0];
  const activePacing = SYNC_PACINGS.find((item) => item.id === syncPacing) ?? SYNC_PACINGS[0];
  useDocumentTitle(t("모션 웹툰", "Motion webtoon"));
  const [initial] = useState<InitialState>(resolveInitialState);
  const [notice, setNotice] = useState<PageNotice>(initial.notice);
  // 애니툰 위저드가 만든 초안 — 에디터는 초기값으로만 회차를 읽으므로 key로 다시 마운트해 교체한다.
  const [openedDraft, setOpenedDraft] = useState<MotionEpisode | null>(null);
  // 자동 저장이 실패하면(저장 공간 부족·비공개 모드) 사라지지 않는 안내로 알린다.
  const [saveFailed, setSaveFailed] = useState(initial.saveFailed);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!notice) return;
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 8000);
    return () => {
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    };
  }, [notice]);

  const pendingEpisodeRef = useRef<MotionEpisode | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const flushPendingSave = useCallback((): void => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingEpisodeRef.current;
    if (!pending) return;
    pendingEpisodeRef.current = null;
    setSaveFailed(!saveMotionEpisode(pending));
  }, []);

  // 탭을 닫거나 화면을 떠나면 대기 중인 자동 저장을 즉시 확정한다.
  useEffect(() => flushPendingSave, [flushPendingSave]);

  const handleChange = (episode: MotionEpisode): void => {
    // 키 입력마다 전체 회차를 직렬화해 동기 저장하면 긴 회차에서 입력이 버벅이고,
    // 저장 공간이 찬 뒤에는 입력마다 예외가 반복된다. 마지막 변경만 모아 저장한다.
    pendingEpisodeRef.current = episode;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(flushPendingSave, 600);
  };

  const noticeText = (current: Exclude<PageNotice, null>): string => {
    switch (current.kind) {
      case "restored":
        return t(L.pageRestoredNotice.titleKo, L.pageRestoredNotice.titleEn);
      case "share-not-found":
        return t(L.pageShareNotFound.titleKo, L.pageShareNotFound.titleEn);
      case "resumed":
        return t(L.pageResumeNotice.titleKo, L.pageResumeNotice.titleEn);
    }
  };

  return (
    <div className="mw-page">
      {notice && (
        <p className="mw-page-notice" role="status">
          {noticeText(notice)}
        </p>
      )}
      {saveFailed && (
        <p className="mw-page-notice mw-page-notice-warn" role="alert">
          {t(
            "이 브라우저에 자동 저장하지 못했어요. 작업은 이 탭을 닫기 전까지만 유지됩니다. 저장 공간이나 비공개 모드 설정을 확인해 주세요.",
            "Couldn't autosave in this browser. Your work stays only until this tab closes — check storage space or private-mode settings.",
          )}
        </p>
      )}
      <section
        data-testid="motion-webtoon-rea-parallax-bar"
        data-own-control-size=""
        aria-label={pickLang("모션 웹툰 패럴랙스 및 스크롤 리그 워크벤치", "Motion Webtoon Parallax & Scroll Rig Workbench")}
        className="mb-5 rounded-2xl border border-line bg-card p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-mono text-xs font-semibold text-accent">
              {pickLang("모션 웹툰 · 스크롤 패럴랙스 리그", "MOTION WEBTOON · SCROLL PARALLAX RIG")}
            </p>
            <p className="mt-2 text-xs font-semibold text-fg">
              {pickLang(
                "Z-Depth 다층 패럴랙스와 스크롤 속도·체류 시간 동기화 페이싱을 실시간으로 조합합니다.",
                "Compose multi-layer Z-depth parallax rigs with scroll velocity and viewport dwell pacing.",
              )}
            </p>
          </div>
          <span className="rounded-lg border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg-2">
            Rive · Spine 2D · Live2D Cubism · Naver Smartoon/Effectoon
          </span>
        </div>
        <div
          role="group"
          aria-label={pickLang("스크롤 리그 프리셋", "Scroll Rig Presets")}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <span className="text-xs font-semibold text-fg-2">
            {pickLang("스크롤 리그:", "Scroll Rig:")}
          </span>
          {SCROLL_RIGS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`motion-rea-rig-${item.id}`}
              aria-pressed={scrollRig === item.id}
              onClick={() => setScrollRig(item.id)}
              className={
                scrollRig === item.id
                  ? "min-h-11 min-w-11 rounded-xl border border-accent bg-accent-soft px-3.5 py-2 text-xs font-semibold text-accent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  : "min-h-11 min-w-11 rounded-xl border border-line bg-panel px-3.5 py-2 text-xs font-semibold text-fg-2 transition-colors hover:bg-accent-soft/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              }
            >
              {pickLang(item.ko, item.en)}
            </button>
          ))}
        </div>
        <div
          role="group"
          aria-label={pickLang("동기화 페이싱 프리셋", "Sync Pacing Presets")}
          className="mt-2 flex flex-wrap items-center gap-2"
        >
          <span className="text-xs font-semibold text-fg-2">
            {pickLang("동기화 페이싱:", "Sync Pacing:")}
          </span>
          {SYNC_PACINGS.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`motion-rea-pacing-${item.id}`}
              aria-pressed={syncPacing === item.id}
              onClick={() => setSyncPacing(item.id)}
              className={
                syncPacing === item.id
                  ? "min-h-11 min-w-11 rounded-xl border border-accent bg-accent-soft px-3.5 py-2 text-xs font-semibold text-accent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  : "min-h-11 min-w-11 rounded-xl border border-line bg-panel px-3.5 py-2 text-xs font-semibold text-fg-2 transition-colors hover:bg-accent-soft/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              }
            >
              {pickLang(item.ko, item.en)}
            </button>
          ))}
        </div>
        <p
          data-testid="motion-webtoon-rea-status"
          aria-live="polite"
          className="mt-3 rounded-xl border border-line bg-panel px-3 py-1.5 font-mono text-xs text-fg-2"
        >
          {pickLang(
            `리그: ${activeRig.ko} (${scrollRig}) · 페이싱: ${activePacing.ko} (${syncPacing})`,
            `Rig: ${activeRig.en} (${scrollRig}) · Pacing: ${activePacing.en} (${syncPacing})`,
          )}
        </p>
      </section>
      <MotionWebtoonAnimeToonWizard
        onOpenDraft={(draft) => {
          setOpenedDraft(draft);
          setNotice(null);
        }}
      />
      <MotionWebtoonEditor
        key={openedDraft?.id ?? initial.episode.id}
        initialEpisode={openedDraft ?? initial.episode}
        onChange={handleChange}
      />
    </div>
  );
}
