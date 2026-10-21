import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { useDocumentTitle } from "@/shared/seo/use-document-title";

import "./ir-present-page.css";

import { SCENE_NODES_A } from "./ir-present-scenes-a";
import { SCENE_NODES_B } from "./ir-present-scenes-b";

/**
 * IR 발표 플레이어 (/ir/present).
 *
 * 발표용 웹 아티팩트로 먼저 만든 24씬 풀스크린 슬라이드 플레이어를 실제 사이트에 이식한 페이지다.
 * 씬 구성·문안·내레이션·배경음은 아티팩트 검증 완료본 그대로이며, 제품 화면 이미지는
 * 제품 투어가 이미 쓰는 /brand/product-tour/ 자산을 재사용한다(중복 업로드 없음).
 * 내레이션 오디오(n01–n24)와 배경음은 아티팩트 제작 때 생성한 AI 음성·음악 파일로,
 * /brand/ir-present/audio/ 아래에 둔다.
 *
 * 조작은 아티팩트와 같다: ←/→ 이동, Space 자동 발표 재생·정지, F 전체화면, M 소리, C 목차,
 * 터치 스와이프. 자동재생 정책 때문에 소리는 첫 상호작용 뒤에 시작한다.
 * 자동 발표 중에는 씬 내레이션이 끝나면 다음 씬으로 넘어가고, 내레이션이 없으면
 * 씬별 체류 시간(dwell)을 쓴다.
 */

const AUDIO_DIR = "/brand/ir-present/audio";
const BGM_BASE_VOLUME = 0.14;
const BGM_DUCK_VOLUME = 0.045;

interface SceneMeta {
  title: string;
  /** 목차에 함께 보이는 씬의 작은 제목(아티팩트의 .kicker 문구). 없으면 null. */
  kicker: string | null;
  audio: string;
  /** 내레이션을 못 쓸 때의 자동 진행 체류 시간(초). */
  dwell: number;
}

const SCENE_META: SceneMeta[] = [
  { title: "표지", kicker: null, audio: "n01.mp3", dwell: 18 },
  { title: "예비 창업 도전자 소개", kicker: "예비 창업 도전자 — 만든 사람부터 소개할게요", audio: "n02.mp3", dwell: 27 },
  { title: "문제 — 끊기는 제작 흐름", kicker: "Problem", audio: "n03.mp3", dwell: 25 },
  { title: "솔루션 — 이어지는 파이프라인", kicker: "Pipeline", audio: "n04.mp3", dwell: 19 },
  { title: "제품 수치", kicker: "Proof in Numbers", audio: "n05.mp3", dwell: 22 },
  { title: "역할별 UX", kicker: "Roles", audio: "n06.mp3", dwell: 20 },
  { title: "시장 — 국내 웹툰 산업", kicker: "Market", audio: "n07.mp3", dwell: 22 },
  { title: "시장 — 글로벌 전망", kicker: "Global Market", audio: "n08.mp3", dwell: 23 },
  { title: "외산 독과점 실태", kicker: "Foreign Monopoly", audio: "n09.mp3", dwell: 25 },
  { title: "파편화 지도", kicker: "Fragmentation Map", audio: "n10.mp3", dwell: 20 },
  { title: "전환 비용", kicker: "Switching Cost", audio: "n11.mp3", dwell: 27 },
  { title: "공정 커버리지 비교", kicker: "Coverage", audio: "n12.mp3", dwell: 20 },
  { title: "크레코와 비교", kicker: "Versus", audio: "n13.mp3", dwell: 24 },
  { title: "차별화", kicker: "Differentiation", audio: "n14.mp3", dwell: 18 },
  { title: "규모별 커버", kicker: "Scale", audio: "n15.mp3", dwell: 22 },
  { title: "제품 심층 ① 무대와 엔진", kicker: "Product Deep Dive · 1/2", audio: "n16.mp3", dwell: 25 },
  { title: "제품 심층 ② 3D와 협업", kicker: "Product Deep Dive · 2/2", audio: "n17.mp3", dwell: 22 },
  { title: "홍보영상 — 제품 투어", kicker: "Product Tour Film", audio: "n18.mp3", dwell: 19 },
  { title: "기술 구조", kicker: "Technology", audio: "n19.mp3", dwell: 24 },
  { title: "Responsible AI", kicker: "Responsible AI", audio: "n20.mp3", dwell: 21 },
  { title: "비즈니스 모델", kicker: "Business Model", audio: "n21.mp3", dwell: 24 },
  { title: "검증 로드맵", kicker: "Roadmap", audio: "n22.mp3", dwell: 38 },
  { title: "팀 · Ask", kicker: "Team & Ask", audio: "n23.mp3", dwell: 22 },
  { title: "마무리", kicker: null, audio: "n24.mp3", dwell: 32 },
];

const TOTAL = SCENE_META.length;

const SCENE_NODES: ReactNode[] = [...SCENE_NODES_A, ...SCENE_NODES_B];

export function IrPresentPage() {
  useDocumentTitle("툰스튜디오 IR · 발표 플레이어");

  const [idx, setIdx] = useState(() => {
    const match = (window.location.hash || "").match(/s=(\d+)/);
    if (match) return Math.max(0, Math.min(TOTAL - 1, parseInt(match[1], 10) - 1));
    return 0;
  });
  const [playing, setPlaying] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [soundMode, setSoundMode] = useState<"on" | "narr" | "off">("on");
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [toastState, setToastState] = useState<{ id: number; msg: string } | null>(null);
  const [backward, setBackward] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const narrRef = useRef<HTMLAudioElement>(null);
  const bgmRef = useRef<HTMLAudioElement>(null);
  const idxRef = useRef(idx);
  const playingRef = useRef(false);
  const soundOnRef = useRef(true);
  const unlockedRef = useRef(false);
  const gapTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const narrFailedRef = useRef<Set<number>>(new Set());
  const narrSrcRef = useRef("");
  const countedRef = useRef(new WeakSet<Element>());
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const dwellMs = (i: number) => (SCENE_META[i]?.dwell ?? 15) * 1000;

  const showToast = (msg: string, ms = 2600) => {
    setToastState({ id: Date.now(), msg });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastState(null), ms);
  };

  const duck = (on: boolean) => {
    if (bgmRef.current) bgmRef.current.volume = on ? BGM_DUCK_VOLUME : BGM_BASE_VOLUME;
  };

  const unlockAudio = () => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    if (soundOnRef.current) {
      const p = bgmRef.current?.play();
      if (p) p.catch(() => {});
    }
  };

  const clearGap = () => {
    if (gapTimerRef.current) {
      window.clearTimeout(gapTimerRef.current);
      gapTimerRef.current = null;
    }
  };

  const scheduleAdvance = (ms: number) => {
    clearGap();
    gapTimerRef.current = window.setTimeout(() => {
      if (!playingRef.current) return;
      if (idxRef.current < TOTAL - 1) {
        setIdx(idxRef.current + 1);
      } else {
        playingRef.current = false;
        setPlaying(false);
        duck(false);
        if (soundOnRef.current) setSoundMode("on");
        showToast("발표가 끝났습니다 — 수고하셨습니다");
      }
    }, ms);
  };

  const playSceneAudio = () => {
    clearGap();
    const i = idxRef.current;
    const narr = narrRef.current;
    if (!soundOnRef.current || !narr || narrFailedRef.current.has(i)) {
      scheduleAdvance(dwellMs(i));
      return;
    }
    const src = `${AUDIO_DIR}/${SCENE_META[i].audio}`;
    if (narrSrcRef.current !== src) {
      narr.src = src;
      narrSrcRef.current = src;
    }
    narr.currentTime = 0;
    const p = narr.play();
    if (p) p.catch(() => { if (playingRef.current) scheduleAdvance(dwellMs(idxRef.current)); });
  };

  const applyPlaying = (on: boolean) => {
    playingRef.current = on;
    setPlaying(on);
    if (on) {
      unlockAudio();
      playSceneAudio();
    } else {
      narrRef.current?.pause();
      clearGap();
      duck(false);
      if (soundOnRef.current) setSoundMode("on");
    }
  };

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(TOTAL - 1, next));
    setBackward(clamped < idxRef.current);
    setIdx(clamped);
  };

  const step = (d: number) => {
    const target = idxRef.current + d;
    if (target < 0 || target >= TOTAL) return;
    goTo(target);
  };

  const applySound = (on: boolean) => {
    soundOnRef.current = on;
    setSoundOn(on);
    if (!on) {
      narrRef.current?.pause();
      bgmRef.current?.pause();
      duck(false);
      setSoundMode("off");
      if (playingRef.current) scheduleAdvance(dwellMs(idxRef.current));
    } else {
      setSoundMode("on");
      if (unlockedRef.current) {
        const p = bgmRef.current?.play();
        if (p) p.catch(() => {});
      }
      if (playingRef.current) playSceneAudio();
    }
  };

  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else {
        const p = stageRef.current?.requestFullscreen();
        if (p) p.catch(() => showToast("이 브라우저에서는 전체화면이 제한됩니다"));
      }
    } catch {
      showToast("이 브라우저에서는 전체화면이 제한됩니다");
    }
  };

  /* 씬이 바뀔 때마다: 해시 동기화, 등장 애니메이션·카운터 실행, 오디오 후속 처리(아티팩트 goTo와 동일). */
  useEffect(() => {
    idxRef.current = idx;
    try {
      window.history.replaceState(null, "", `#s=${idx + 1}`);
    } catch {
      /* 해시를 쓸 수 없는 환경에서는 발표를 계속한다. */
    }
    const root = stageRef.current;
    const active = root?.querySelector(".scene.active");
    if (active) {
      active.scrollTop = 0;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const timers: number[] = [];
      active.querySelectorAll(".rv").forEach((el, i) => {
        if (el.classList.contains("in")) return;
        if (reduced) {
          el.classList.add("in");
          return;
        }
        timers.push(window.setTimeout(() => el.classList.add("in"), Math.min(i * 70, 840)));
      });
      active.querySelectorAll("[data-count]").forEach((el) => {
        if (countedRef.current.has(el)) return;
        countedRef.current.add(el);
        const target = parseInt(el.getAttribute("data-count") ?? "0", 10);
        const fmt = (n: number) => n.toLocaleString("en-US");
        if (reduced) {
          el.textContent = fmt(target);
          return;
        }
        el.textContent = "0";
        const dur = 1300;
        let t0: number | null = null;
        const tick = (ts: number) => {
          if (!t0) t0 = ts;
          const progress = Math.min((ts - t0) / dur, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = fmt(Math.round(target * eased));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      return () => timers.forEach((t) => window.clearTimeout(t));
    }
    return undefined;
  }, [idx]);

  /* 재생 중 씬 이동이면 새 씬 내레이션을 걸고, 아니면 내레이션을 멈춘다. */
  useEffect(() => {
    if (playingRef.current) playSceneAudio();
    else {
      narrRef.current?.pause();
      clearGap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  /* 배경음 초기 볼륨, 본문 스크롤 잠금, 오디오 잠금 해제(첫 상호작용), 시작 안내 토스트. */
  useEffect(() => {
    if (bgmRef.current) bgmRef.current.volume = BGM_BASE_VOLUME;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    const introTimer = window.setTimeout(() => {
      if (!playingRef.current && window.innerWidth > 720) {
        showToast("← → 이동 · Space 자동 발표 · F 전체화면 · M 소리 · C 목차", 4200);
      }
    }, 900);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.clearTimeout(introTimer);
      clearGap();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 단축키 — 아티팩트와 같은 키 배치. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const k = event.key;
      if (k === " " || k === "Spacebar") {
        event.preventDefault();
        if (!chaptersOpen) applyPlaying(!playingRef.current);
      } else if (k === "ArrowRight" || k === "PageDown") {
        event.preventDefault();
        unlockAudio();
        step(1);
      } else if (k === "ArrowLeft" || k === "PageUp") {
        event.preventDefault();
        unlockAudio();
        step(-1);
      } else if (k === "Home") {
        event.preventDefault();
        goTo(0);
      } else if (k === "End") {
        event.preventDefault();
        goTo(TOTAL - 1);
      } else if (k === "f" || k === "F") {
        toggleFullscreen();
      } else if (k === "m" || k === "M") {
        unlockAudio();
        const next = !soundOnRef.current;
        applySound(next);
        showToast(next ? "소리를 켰습니다" : "소리를 껐습니다 (M)");
      } else if (k === "c" || k === "C") {
        setChaptersOpen((open) => !open);
      } else if (k === "Escape" && chaptersOpen) {
        setChaptersOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaptersOpen]);

  const onStageClick = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).closest(".js-start")) {
      unlockAudio();
      applyPlaying(true);
      showToast("자동 발표를 시작합니다 — Space로 언제든 멈출 수 있어요");
    }
  };

  const onTouchStart = (event: React.TouchEvent) => {
    touchRef.current = { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      unlockAudio();
      step(dx < 0 ? 1 : -1);
    }
  };

  const meta = SCENE_META[idx];

  return (
    <div className="ir-present">
      <div className="stage" ref={stageRef} onClick={onStageClick} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="progress-top" aria-hidden="true">
          <div className="segments">
            {SCENE_META.map((sceneMeta, i) => (
              <button
                key={sceneMeta.title}
                type="button"
                aria-label={`${i + 1}번 씬 — ${sceneMeta.title}`}
                className={i < idx ? "done" : i === idx ? "now" : undefined}
                onClick={(event) => { unlockAudio(); goTo(i); event.currentTarget.blur(); }}
              />
            ))}
          </div>
        </div>

        <main className="scenes">
          {SCENE_NODES.map((node, i) => (
            <section key={SCENE_META[i].title} className={i === idx ? `scene active${backward ? " from-left" : ""}` : "scene"}>
              {node}
            </section>
          ))}
        </main>

        <button className="edge-nav edge-prev" type="button" aria-label="이전 씬" disabled={idx === 0} onClick={() => { unlockAudio(); step(-1); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <button className="edge-nav edge-next" type="button" aria-label="다음 씬" disabled={idx === TOTAL - 1} onClick={() => { unlockAudio(); step(1); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
        </button>

        <div className={toastState ? "toast show" : "toast"} role="status" aria-live="polite">{toastState?.msg ?? ""}</div>

        <footer className="hud">
          <span className="brand">Toon<b>Studio</b></span>
          <button className="hud-btn" type="button" aria-haspopup="dialog" onClick={(event) => { setChaptersOpen((open) => !open); event.currentTarget.blur(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
            목차
          </button>
          <span className="hud-counter"><b>{idx + 1}</b> / <span>{TOTAL}</span></span>
          <span className="hud-scene">{meta.title}</span>
          <div className="hud-center">
            <button className="hud-btn" type="button" aria-label="이전 씬" disabled={idx === 0} onClick={(event) => { unlockAudio(); step(-1); event.currentTarget.blur(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
              이전
            </button>
            <button className="hud-btn primary" type="button" aria-pressed={playing} onClick={(event) => { applyPlaying(!playingRef.current); event.currentTarget.blur(); }}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                {playing ? <path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" /> : <path d="M7 4.5v15l13-7.5z" />}
              </svg>
              <span>{playing ? "정지" : "재생"}</span>
            </button>
            <button className="hud-btn" type="button" aria-label="다음 씬" disabled={idx === TOTAL - 1} onClick={(event) => { unlockAudio(); step(1); event.currentTarget.blur(); }}>
              다음
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <span className={`sound-state ${soundMode}`}><span className="led" /><span className="txt">{soundMode === "narr" ? "내레이션 재생 중" : soundMode === "off" ? "소리 꺼짐" : "소리 켜짐"}</span></span>
          <button className="hud-btn" type="button" aria-pressed={soundOn} aria-label="소리 켜기/끄기 (M)" onClick={(event) => { unlockAudio(); const next = !soundOnRef.current; applySound(next); showToast(next ? "소리를 켰습니다" : "소리를 껐습니다 (M)"); event.currentTarget.blur(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none" /><path className="sw" style={{ display: soundOn ? undefined : "none" }} d="M15.5 8.5a5 5 0 0 1 0 7" /><path className="sw" style={{ display: soundOn ? undefined : "none" }} d="M18 6a8.5 8.5 0 0 1 0 12" /></svg>
            소리
          </button>
          <button className="hud-btn" type="button" aria-label="전체화면 (F)" onClick={(event) => { toggleFullscreen(); event.currentTarget.blur(); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
            전체화면
          </button>
          <span className="hud-keys"><b>←</b> <b>→</b> 이동 · <b>Space</b> 재생 · <b>F</b> 전체화면 · <b>M</b> 소리 · <b>C</b> 목차</span>
        </footer>

        <div
          className={chaptersOpen ? "chapters-overlay open" : "chapters-overlay"}
          role="dialog"
          aria-modal="true"
          aria-label="발표 목차"
          onClick={(event) => { if (event.target === event.currentTarget) setChaptersOpen(false); }}
        >
          <div className="chapters-panel">
            <h2>발표 목차</h2>
            <p className="sub">씬을 누르면 바로 그 장면으로 이동합니다. (단축키 C 또는 Esc로 닫기)</p>
            <div className="chapter-grid">
              {SCENE_META.map((sceneMeta, i) => (
                <button
                  key={sceneMeta.title}
                  type="button"
                  className={i === idx ? "chapter-item now" : "chapter-item"}
                  onClick={(event) => { unlockAudio(); setChaptersOpen(false); goTo(i); event.currentTarget.blur(); }}
                >
                  <span className="n">{String(i + 1).padStart(2, "0")}</span>
                  <span className="t">{sceneMeta.title}{sceneMeta.kicker ? <small>{sceneMeta.kicker}</small> : null}</span>
                  <span className="dur">약 {sceneMeta.dwell}초</span>
                </button>
              ))}
            </div>
            <div className="chapters-close">
              <button className="btn btn-ghost" type="button" onClick={() => setChaptersOpen(false)}>닫기</button>
            </div>
          </div>
        </div>

        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Scene narration for the presentation; the same content is shown as on-screen text in every scene. */}
        <audio
          ref={narrRef}
          preload="auto"
          onPlay={() => { duck(true); if (soundOnRef.current) setSoundMode("narr"); }}
          onPause={() => { duck(false); if (soundOnRef.current) setSoundMode("on"); }}
          onEnded={() => {
            duck(false);
            if (soundOnRef.current) setSoundMode("on");
            if (playingRef.current) scheduleAdvance(1700);
          }}
          onError={() => {
            narrFailedRef.current.add(idxRef.current);
            duck(false);
            if (playingRef.current) scheduleAdvance(dwellMs(idxRef.current));
          }}
        />
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- Background music only; there is no speech to caption. */}
        <audio ref={bgmRef} src={`${AUDIO_DIR}/bgm.mp3`} loop preload="auto" />
      </div>
    </div>
  );
}
