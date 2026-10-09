/**
 * 월드 부팅의 진행 신호 묶음 (캔버스에서 분리).
 *
 * 부팅 제한(진행이 멈추면 실패)과 로딩 화면의 진행 막대·느린 연결 안내를 한곳에서 다룬다.
 * 내려받기 진행(로더 이벤트)과 타일 청크·텍스처 증가가 제한을 늘리고, 캔버스는 결과 콜백만 받는다.
 */
import { STUDIO_BOOT_MAX_MS, STUDIO_BOOT_STALL_MS, studioVisibleBootDeadline } from "./experience/studio-visible-boot-deadline";

/** 월드가 이 시간 안에 열리지 않으면 로딩 화면에 느린 연결 안내를 보인다(준비되면 로딩 화면과 함께 사라진다). */
export const STUDIO_SLOW_LOAD_NOTICE_MS = 8_000;

/** Phaser 로더에서 진행 막대 계산에 쓰는 부분. 구조만 맞으면 되도록 좁혀 두어 테스트에서 가짜로 바꾼다. */
export interface StudioBootLoaderLike {
  readonly totalToLoad: number;
  readonly totalComplete: number;
  readonly totalFailed: number;
  readonly inflight: { readonly entries: readonly { readonly percentComplete?: number }[] };
  on(event: string, listener: () => void): unknown;
}

export interface StudioBootProgressOptions {
  readonly visibility: Parameters<typeof studioVisibleBootDeadline>[0];
  /** 진행이 멈춘 채 제한을 넘었을 때(보이는 시간 기준). */
  readonly onTimeout: () => void;
  /** 로딩 진행률(0~100). */
  readonly onProgress: (percent: number) => void;
  /** 느린 연결 안내를 보일 때가 됐다. */
  readonly onSlow: () => void;
}

export interface StudioBootProgress {
  /** 로더의 진행 이벤트를 부팅 제한 연장과 진행 막대에 연결한다. */
  readonly watchLoader: (loader: StudioBootLoaderLike) => void;
  /** 타일 청크·텍스처가 늘었으면 부팅 제한을 연장한다. 월드가 열리기 전에만 부른다. */
  readonly noteTiles: (metrics: { readonly chunks: number; readonly textures: number }) => void;
  /** 월드가 열렸다. 부팅 제한만 끝낸다(안내 타이머는 dispose가 정리한다). */
  readonly settle: () => void;
  /** 부팅 제한과 안내 타이머를 모두 끝낸다. */
  readonly dispose: () => void;
}

export function createStudioBootProgress(options: StudioBootProgressOptions): StudioBootProgress {
  const { visibility, onTimeout, onProgress, onSlow } = options;
  const slowTimer = globalThis.setTimeout(onSlow, STUDIO_SLOW_LOAD_NOTICE_MS);
  // 고정 25초 대신 "진행이 45초(STUDIO_BOOT_STALL_MS) 멈추면" 실패로 본다. 느린 회선(약 3Mbps 이하)에서는 정상적으로 내려받는 중에도 총 시간이 25초를 넘어
  // 월드가 영영 열리지 않았다. 내려받기가 진행되는 동안은 touch로 예산을 되돌리고, 전체 상한(5분)은 그대로 둔다.
  const deadline = studioVisibleBootDeadline(visibility, onTimeout, STUDIO_BOOT_STALL_MS, STUDIO_BOOT_MAX_MS);
  let lastTiles = { chunks: -1, textures: -1 };
  return {
    watchLoader(loader) {
      // 내려받기가 조금이라도 진행되면 부팅 제한을 늘리고, 로딩 화면의 진행 막대를 갱신한다. 막대는 끝난 파일 수에 내려받는 중인
      // 파일의 진행률을 더해 큰 파일이 받아지는 동안에도 움직인다(파일 수만 세면 3MB 파일 하나에 막대가 수십 초 멈춰 보인다).
      const noteLoadProgress = () => {
        deadline.touch();
        const total = loader.totalToLoad;
        if (total <= 0) return;
        let partial = 0;
        for (const file of loader.inflight.entries) partial += Math.min(1, Math.max(0, file.percentComplete || 0));
        onProgress(Math.round(Math.min(1, (loader.totalComplete + loader.totalFailed + partial) / total) * 100));
      };
      loader.on("fileprogress", noteLoadProgress);
      loader.on("filecomplete", noteLoadProgress);
      loader.on("progress", noteLoadProgress);
    },
    noteTiles(metrics) {
      if (metrics.chunks === lastTiles.chunks && metrics.textures === lastTiles.textures) return;
      lastTiles = { chunks: metrics.chunks, textures: metrics.textures };
      deadline.touch();
    },
    settle: () => deadline(),
    dispose() {
      globalThis.clearTimeout(slowTimer);
      deadline();
    },
  };
}
