import { useCallback, useEffect, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { buildGodotClipPayload } from "./cuts-godot-bridge";
import type { CutsClip } from "./cuts-types";
import { useCutsNarration } from "./use-cuts-narration";

/**
 * 컷츠 Godot 플레이어 임베드 셸.
 *
 * 재생 전용 Godot 빌드(apps/web/public/cuts-godot)를 iframe으로 띄우고,
 * 클립 명세(CutsClip의 재생 부분)를 브리지로 주입한다. 시간축·렌더는 Godot가
 * 맡고(오디오 클록 구동), 내레이션(TTS)은 Web Speech를 가진 셸이 소유한다 —
 * Godot가 샷 전환을 `shotChanged`로 알리면 셸이 해당 샷 대본을 읽는다.
 * 기존 웹 플레이어(CutsPlayer)는 그대로 두고, 이 화면은 대체 진입
 * (?engine=godot)일 때만 뜬다.
 */

export const CUTS_GODOT_EMBED_PATH = "/cuts-godot/index.html";

/** 엔진이 끝내 응답하지 않는 환경을 위한 실패 판정 상한. */
const READY_TIMEOUT_MS = 20_000;

declare global {
  interface Window {
    __tsMotionEvent?: (json: string) => void;
  }
}

/** iframe 쪽 창에 Godot가 등록하는 클립 주입 콜백. */
type MotionIframeWindow = Window & {
  __tsMotionSetClip?: (json: string) => void;
};

interface MotionBridgeEvent {
  readonly type?: string;
  readonly index?: number;
}

export interface CutsGodotEmbedProps {
  readonly clip: CutsClip;
  /** 웹 플레이어(피드)로 돌아가기. */
  readonly onExitToWeb: () => void;
}

type EmbedPhase = "loading" | "ready" | "failed";

export function CutsGodotEmbed({ clip, onExitToWeb }: CutsGodotEmbedProps) {
  const t = useBilingual("cuts");
  const [phase, setPhase] = useState<EmbedPhase>("loading");
  const [attempt, setAttempt] = useState(0);
  const [muted, setMuted] = useState(true);
  const [shotIndex, setShotIndex] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const narration = useCutsNarration();

  const pushClip = useCallback(() => {
    const win = iframeRef.current?.contentWindow as MotionIframeWindow | null;
    if (win && typeof win.__tsMotionSetClip === "function") {
      win.__tsMotionSetClip(buildGodotClipPayload(clip));
    }
  }, [clip]);

  useEffect(() => {
    setPhase("loading");
    setShotIndex(0);
    const handler = (json: string) => {
      let event: MotionBridgeEvent;
      try {
        event = JSON.parse(json) as MotionBridgeEvent;
      } catch {
        return;
      }
      if (event.type === "ready-waiting-clip") {
        pushClip();
      } else if (event.type === "ready") {
        setPhase("ready");
      } else if (event.type === "shotChanged" && typeof event.index === "number") {
        setShotIndex(event.index);
      } else if (event.type === "ended") {
        narration.stop();
      } else if (event.type === "error") {
        setPhase("failed");
      }
    };
    window.__tsMotionEvent = handler;
    const timeout = window.setTimeout(() => {
      if (phaseRef.current === "loading") setPhase("failed");
    }, READY_TIMEOUT_MS);
    return () => {
      if (window.__tsMotionEvent === handler) {
        delete window.__tsMotionEvent;
      }
      window.clearTimeout(timeout);
      narration.stop();
    };
  }, [clip, attempt, pushClip, narration]);

  // 샷이 바뀌면(내레이션이 켜져 있을 때만) 셸이 대본을 읽는다.
  useEffect(() => {
    if (phase !== "ready" || muted) return;
    const shot = clip.shots[shotIndex];
    if (shot) narration.speakShot(shot);
  }, [phase, muted, shotIndex, clip, narration]);

  const toggleNarration = useCallback(() => {
    if (!mutedRef.current) narration.stop();
    setMuted((value) => !value);
  }, [narration]);

  return (
    <section
      aria-label={t("Godot 플레이어", "Godot player")}
      className="mx-auto w-full max-w-[430px] px-4 py-4"
    >
      <div className="relative overflow-hidden rounded-3xl border border-line bg-card">
        <iframe
          key={attempt}
          ref={iframeRef}
          src={CUTS_GODOT_EMBED_PATH}
          title={t("컷츠 Godot 플레이어", "Cuts Godot player")}
          className="block aspect-[9/16] w-full border-0"
          allow="autoplay; fullscreen"
        />
        {phase === "loading" ? (
          <div className="absolute inset-0 grid place-items-center bg-card/80" role="status">
            <p className="px-6 text-center text-sm font-semibold text-fg-2">
              {t(
                "플레이어 엔진을 불러오는 중이에요… 첫 로드만 약 10MB를 받아요.",
                "Loading the player engine… The first load downloads about 10 MB.",
              )}
            </p>
          </div>
        ) : null}
        {phase === "failed" ? (
          <div className="absolute inset-0 grid place-items-center bg-card/90" role="alert">
            <div className="px-6 text-center">
              <p className="text-sm font-semibold text-fg-2">
                {t(
                  "Godot 플레이어를 불러오지 못했어요.",
                  "Couldn't load the Godot player.",
                )}
              </p>
              <button
                type="button"
                className="mt-3 text-sm font-bold underline underline-offset-4"
                onClick={() => setAttempt((value) => value + 1)}
              >
                {t("다시 시도", "Try again")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p role="status" className="text-sm font-semibold">
          {phase === "ready"
            ? t("Godot 플레이어로 재생 중", "Playing in the Godot player")
            : phase === "failed"
              ? t("플레이어 로드 실패", "Player failed to load")
              : t("엔진 준비 중", "Preparing the engine")}
        </p>
        <button
          type="button"
          className="text-sm font-bold underline underline-offset-4"
          aria-pressed={!muted}
          onClick={toggleNarration}
        >
          {muted ? t("내레이션 켜기", "Turn narration on") : t("내레이션 끄기", "Turn narration off")}
        </button>
        <button
          type="button"
          className="text-sm font-bold underline underline-offset-4"
          onClick={onExitToWeb}
        >
          {t("웹 플레이어로 돌아가기", "Back to the web player")}
        </button>
      </div>
    </section>
  );
}

export default CutsGodotEmbed;
