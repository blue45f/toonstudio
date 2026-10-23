/**
 * WebGL2 비동기 텍스처 readback(순수: 전달받은 GL 객체만 쓴다). Babylon `RenderTargetTexture.readPixels()`는 WebGL에서 `gl.readPixels`를
 * **동기로** 불러, GPU가 앞서 제출된 명령(그림자 맵·RTT·뷰포트 프레임)을 끝낼 때까지 메인 스레드를 세운다.
 * 실측(2026-10-23, Apple M2 Max·ANGLE Metal·Chrome 156): 128² 썸네일 1장 평균 29 ms, 슬라이더 1회(58장) 1.7 초가 이 대기였다.
 *
 * 여기서는 PBO(PIXEL_PACK_BUFFER)로 읽기 명령만 제출하고 fence(`SYNC_GPU_COMMANDS_COMPLETE`)가 신호될 때까지 타이머로 폴링한 뒤
 * `getBufferSubData`로 꺼낸다. 결과 바이트는 동기 `readPixels`와 같은 배치(RGBA8, 아래 행부터)라 `readback.ts`의 flipY 상수를 그대로 쓴다.
 * 바인딩 상태는 Babylon `_readTexturePixelsSync`와 같은 방식으로 되돌린다(FRAMEBUFFER는 엔진이 기억하는 현재 프레임버퍼로, PIXEL_PACK_BUFFER는 null로).
 * 실패(컨텍스트 손실·fence 실패·시간 초과)는 LabFailure로 reject한다(빈 래스터를 조용히 돌려주지 않는다).
 */
import { failVisible } from "../contracts";

/** fence 폴링 간격(ms). 128² 썸네일은 보통 첫 폴링 안에 끝난다. */
export const GL_READBACK_POLL_MS = 4;
/** fence가 이 시간 안에 신호되지 않으면 실패로 끝낸다(무한 대기 금지). */
export const GL_READBACK_TIMEOUT_MS = 10_000;

/** 이 모듈이 쓰는 WebGL2 표면(실제 `WebGL2RenderingContext`가 구조적으로 만족한다). 테스트는 가짜 객체를 넣는다. */
export interface GlReadbackContext {
  readonly FRAMEBUFFER: number;
  readonly COLOR_ATTACHMENT0: number;
  readonly TEXTURE_2D: number;
  readonly PIXEL_PACK_BUFFER: number;
  readonly STREAM_READ: number;
  readonly RGBA: number;
  readonly UNSIGNED_BYTE: number;
  readonly SYNC_GPU_COMMANDS_COMPLETE: number;
  readonly ALREADY_SIGNALED: number;
  readonly CONDITION_SATISFIED: number;
  readonly WAIT_FAILED: number;
  createFramebuffer(): WebGLFramebuffer | null;
  deleteFramebuffer(framebuffer: WebGLFramebuffer | null): void;
  bindFramebuffer(target: number, framebuffer: WebGLFramebuffer | null): void;
  framebufferTexture2D(target: number, attachment: number, textarget: number, texture: WebGLTexture | null, level: number): void;
  createBuffer(): WebGLBuffer | null;
  deleteBuffer(buffer: WebGLBuffer | null): void;
  bindBuffer(target: number, buffer: WebGLBuffer | null): void;
  bufferData(target: number, size: number, usage: number): void;
  readPixels(x: number, y: number, width: number, height: number, format: number, type: number, offset: number): void;
  getBufferSubData(target: number, srcByteOffset: number, dstBuffer: ArrayBufferView): void;
  fenceSync(condition: number, flags: number): WebGLSync | null;
  clientWaitSync(sync: WebGLSync, flags: number, timeout: number): number;
  deleteSync(sync: WebGLSync | null): void;
  flush(): void;
  isContextLost(): boolean;
}

export interface GlReadbackRequest {
  readonly gl: GlReadbackContext;
  /** 읽을 텍스처(MSAA RTT라면 해석(resolve)된 텍스처) */
  readonly texture: WebGLTexture;
  readonly width: number;
  readonly height: number;
  /** 읽은 뒤 되돌릴 FRAMEBUFFER 바인딩(Babylon `engine._currentFramebuffer`) */
  readonly restoreFramebuffer: WebGLFramebuffer | null;
  readonly pollMs?: number;
  readonly timeoutMs?: number;
  readonly now?: () => number;
  /** 다음 폴링까지 기다리기(기본 setTimeout). 테스트가 주입한다. */
  readonly wait?: (ms: number) => Promise<void>;
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readbackFailure(code: string, reasonKo: string): never {
  throw failVisible(code, reasonKo);
}

/**
 * 읽기 명령을 **지금 동기로** 제출하고(호출 순서상 앞서 제출된 렌더 결과를 읽는다) 데이터는 fence 신호 뒤에 돌려준다.
 * 자원을 만들 수 없으면 null을 돌려준다(호출자는 기존 동기 경로를 쓴다). 이 경우 GL 상태는 바뀌지 않는다.
 */
export function submitTextureReadback(request: GlReadbackRequest): Promise<Uint8Array> | null {
  const { gl, width, height } = request;
  const byteLength = width * height * 4;
  const framebuffer = gl.createFramebuffer();
  const buffer = gl.createBuffer();
  if (!framebuffer || !buffer) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteBuffer(buffer);
    return null;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, request.texture, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
  gl.bufferData(gl.PIXEL_PACK_BUFFER, byteLength, gl.STREAM_READ);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, request.restoreFramebuffer);
  gl.deleteFramebuffer(framebuffer);
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  const out = new Uint8Array(byteLength);
  const collect = (): Uint8Array => {
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    return out;
  };
  const release = (): void => {
    gl.deleteBuffer(buffer);
    gl.deleteSync(sync);
  };
  if (!sync) {
    // fence를 만들 수 없으면(드라이버 제한) 읽기 명령은 이미 제출됐으므로 지금 꺼낸다(동기 대기 — 기존 경로와 같은 비용).
    try {
      return Promise.resolve(collect());
    } finally {
      release();
    }
  }
  const now = request.now ?? (() => Date.now());
  const wait = request.wait ?? defaultWait;
  const pollMs = request.pollMs ?? GL_READBACK_POLL_MS;
  const timeoutMs = request.timeoutMs ?? GL_READBACK_TIMEOUT_MS;
  const started = now();
  const poll = async (): Promise<Uint8Array> => {
    try {
      for (;;) {
        if (gl.isContextLost()) readbackFailure("capture-readback-context-lost", "GPU readback을 기다리는 동안 WebGL 컨텍스트가 손실됐습니다. 엔진을 다시 선택하세요.");
        const status = gl.clientWaitSync(sync, 0, 0);
        if (status === gl.WAIT_FAILED) readbackFailure("capture-readback-fence-failed", "GPU readback fence 대기가 실패했습니다(clientWaitSync WAIT_FAILED).");
        if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) return collect();
        if (now() - started >= timeoutMs) readbackFailure("capture-readback-timeout", `GPU readback이 ${Math.round(timeoutMs / 1000)}초 안에 끝나지 않았습니다.`);
        await wait(pollMs);
      }
    } finally {
      release();
    }
  };
  return poll();
}
