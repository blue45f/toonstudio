import { useEffect, useRef, useState } from "react";

/**
 * Godot 에디션 놀이터 임베드 셸.
 *
 * /play 허브 단위 Godot 빌드(게임 12종 단일 빌드)를 iframe으로 띄운다.
 * 엔진 wasm(약 9.5MB gzip)은 같은 오리진 정적 자산이라 첫 로드 한 번만 받고,
 * 이후 게임 전환은 엔진 내부에서 일어나 추가 다운로드가 없다.
 * 준비 완료 신호는 Godot 허브가 부모 창의 `__tsPlayGodotReady`를 호출하는
 * 브리지 콜백으로 받는다 (가상스튜디오 Godot 임베드와 같은 패턴).
 * 기존 웹판 놀이터는 그대로 두고, 이 화면은 대체 진입(engine=godot)일 때만 뜬다.
 */

export const PLAY_GODOT_EMBED_PATH = "/play-godot/index.html";

/** 브리지 콜백이 끝내 오지 않는 환경을 위한 오버레이 상한 (엔진 기동 실패 시 무한 대기 방지). */
const READY_FALLBACK_MS = 20_000;

declare global {
  interface Window {
    __tsPlayGodotReady?: () => void;
  }
}

export interface PlayGodotEmbedProps {
  /** 웹 버전 놀이터로 돌아가기. */
  readonly onExitToWeb: () => void;
}

export function PlayGodotEmbed({ onExitToWeb }: PlayGodotEmbedProps) {
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);

  useEffect(() => {
    const markReady = () => {
      readyRef.current = true;
      setReady(true);
    };
    window.__tsPlayGodotReady = markReady;
    const fallback = setTimeout(() => {
      if (!readyRef.current) setReady(true);
    }, READY_FALLBACK_MS);
    return () => {
      if (window.__tsPlayGodotReady === markReady) {
        delete window.__tsPlayGodotReady;
      }
      clearTimeout(fallback);
    };
  }, []);

  return (
    <section aria-label="Godot 에디션 놀이터" className="mx-auto w-full max-w-[1152px] px-4 py-4">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-card">
        <iframe
          src={PLAY_GODOT_EMBED_PATH}
          title="툰스튜디오 아케이드 (Godot 에디션)"
          className="block aspect-[3/2] w-full border-0"
          allow="autoplay; fullscreen"
        />
        {!ready ? (
          <div className="absolute inset-0 grid place-items-center bg-card/80" role="status">
            <p className="text-sm font-semibold text-fg-2">
              게임 엔진을 불러오는 중이에요… 첫 로드만 약 10MB를 받아요.
            </p>
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p role="status" className="text-sm font-semibold">
          {ready ? "Godot 에디션으로 플레이 중" : "엔진 준비 중"}
        </p>
        <button
          type="button"
          className="text-sm font-bold underline underline-offset-4"
          onClick={onExitToWeb}
        >
          웹 버전 놀이터로 돌아가기
        </button>
      </div>
    </section>
  );
}

export default PlayGodotEmbed;
