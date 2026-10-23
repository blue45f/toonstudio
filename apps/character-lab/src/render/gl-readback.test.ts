/**
 * WebGL2 비동기 readback(PBO + fence) 배선 시험. 가짜 GL 객체로 명령 순서·상태 복원·자원 해제·실패 경로를 본다.
 * 실제 GPU readback 바이트(행 순서·premultiply)는 브라우저 검증이다(fix-LAB1 측정: 썸네일이 동기 경로와 같은 그림).
 */
import { describe, expect, it } from "vitest";

import { submitTextureReadback } from "./gl-readback";

import type { GlReadbackContext } from "./gl-readback";

const SIGNALED = 0x911c;
const SATISFIED = 0x911d;
const TIMEOUT = 0x911b;
const FAILED = 0x911e;

interface FakeGl extends GlReadbackContext {
  readonly log: string[];
  /** clientWaitSync가 차례로 돌려줄 상태 */
  statuses: number[];
  lost: boolean;
  noSync: boolean;
  noFramebuffer: boolean;
  readonly deleted: { framebuffers: number; buffers: number; syncs: number };
}

function fakeGl(fill = 7): FakeGl {
  const log: string[] = [];
  const deleted = { framebuffers: 0, buffers: 0, syncs: 0 };
  const framebuffer = {} as WebGLFramebuffer;
  const buffer = {} as WebGLBuffer;
  const sync = {} as WebGLSync;
  const gl: FakeGl = {
    log,
    statuses: [SIGNALED],
    lost: false,
    noSync: false,
    noFramebuffer: false,
    deleted,
    FRAMEBUFFER: 1,
    COLOR_ATTACHMENT0: 2,
    TEXTURE_2D: 3,
    PIXEL_PACK_BUFFER: 4,
    STREAM_READ: 5,
    RGBA: 6,
    UNSIGNED_BYTE: 7,
    SYNC_GPU_COMMANDS_COMPLETE: 8,
    ALREADY_SIGNALED: SIGNALED,
    CONDITION_SATISFIED: SATISFIED,
    WAIT_FAILED: FAILED,
    createFramebuffer: () => (gl.noFramebuffer ? null : framebuffer),
    deleteFramebuffer: (value) => {
      if (value) deleted.framebuffers += 1;
    },
    bindFramebuffer: (_target, value) => log.push(value === framebuffer ? "bindFramebuffer(readback)" : value === null ? "bindFramebuffer(null)" : "bindFramebuffer(restore)"),
    framebufferTexture2D: () => log.push("framebufferTexture2D"),
    createBuffer: () => buffer,
    deleteBuffer: (value) => {
      if (value) deleted.buffers += 1;
    },
    bindBuffer: (_target, value) => log.push(value === null ? "bindBuffer(null)" : "bindBuffer(pbo)"),
    bufferData: (_target, size) => log.push(`bufferData(${size})`),
    readPixels: (_x, _y, width, height) => log.push(`readPixels(${width}x${height}→pbo)`),
    getBufferSubData: (_target, _offset, dst) => {
      log.push("getBufferSubData");
      (dst as Uint8Array).fill(fill);
    },
    fenceSync: () => (gl.noSync ? null : sync),
    clientWaitSync: () => gl.statuses.shift() ?? SIGNALED,
    deleteSync: (value) => {
      if (value) deleted.syncs += 1;
    },
    flush: () => log.push("flush"),
    isContextLost: () => gl.lost,
  };
  return gl;
}

const restore = { restored: true } as unknown as WebGLFramebuffer;
const texture = {} as WebGLTexture;

describe("render/gl-readback", () => {
  it("읽기 명령은 호출 안에서 동기로 제출하고 프레임버퍼 바인딩을 엔진이 기억하는 값으로 되돌린다", async () => {
    const gl = fakeGl(42);
    gl.statuses = [TIMEOUT, TIMEOUT, SATISFIED];
    const waits: number[] = [];
    const pending = submitTextureReadback({ gl, texture, width: 4, height: 2, restoreFramebuffer: restore, wait: async (ms) => void waits.push(ms) });
    if (!pending) throw new Error("readback을 제출하지 못했습니다.");
    // 동기 구간에서 이미 PBO로 읽기·fence·flush까지 제출됐다(GPU 완료는 기다리지 않는다)
    expect(gl.log).toEqual([
      "bindFramebuffer(readback)",
      "framebufferTexture2D",
      "bindBuffer(pbo)",
      "bufferData(32)",
      "readPixels(4x2→pbo)",
      "bindBuffer(null)",
      "bindFramebuffer(restore)",
      "flush",
    ]);
    const bytes = await pending;
    expect(bytes).toHaveLength(32);
    expect(Array.from(bytes).every((value) => value === 42)).toBe(true);
    expect(waits).toEqual([4, 4]);
    expect(gl.deleted).toEqual({ framebuffers: 1, buffers: 1, syncs: 1 });
    expect(gl.log.slice(-3)).toEqual(["bindBuffer(pbo)", "getBufferSubData", "bindBuffer(null)"]);
  });

  it("fence 실패·컨텍스트 손실·시간 초과는 LabFailure로 거부하고 자원을 해제한다(빈 래스터를 조용히 돌려주지 않는다)", async () => {
    const failed = fakeGl();
    failed.statuses = [FAILED];
    await expect(submitTextureReadback({ gl: failed, texture, width: 1, height: 1, restoreFramebuffer: null, wait: async () => undefined })).rejects.toMatchObject({ code: "capture-readback-fence-failed" });
    expect(failed.deleted.buffers).toBe(1);

    const lost = fakeGl();
    lost.statuses = [TIMEOUT];
    lost.lost = true;
    await expect(submitTextureReadback({ gl: lost, texture, width: 1, height: 1, restoreFramebuffer: null, wait: async () => undefined })).rejects.toMatchObject({ code: "capture-readback-context-lost" });

    const slow = fakeGl();
    slow.statuses = Array.from({ length: 10 }, () => TIMEOUT);
    let clock = 0;
    await expect(
      submitTextureReadback({ gl: slow, texture, width: 1, height: 1, restoreFramebuffer: null, timeoutMs: 20, now: () => clock, wait: async (ms) => void (clock += ms) }),
    ).rejects.toMatchObject({ code: "capture-readback-timeout" });
    expect(slow.deleted).toEqual({ framebuffers: 1, buffers: 1, syncs: 1 });
  });

  it("fence를 만들 수 없으면 제출한 읽기를 바로 꺼내고, 자원을 만들 수 없으면 null(호출자는 기존 동기 경로)", async () => {
    const noSync = fakeGl(9);
    noSync.noSync = true;
    const submitted = submitTextureReadback({ gl: noSync, texture, width: 2, height: 1, restoreFramebuffer: null });
    if (!submitted) throw new Error("readback을 제출하지 못했습니다.");
    expect(Array.from(await submitted)).toEqual([9, 9, 9, 9, 9, 9, 9, 9]);
    expect(noSync.deleted.buffers).toBe(1);

    const noFramebuffer = fakeGl();
    noFramebuffer.noFramebuffer = true;
    expect(submitTextureReadback({ gl: noFramebuffer, texture, width: 2, height: 1, restoreFramebuffer: null })).toBeNull();
    // GL 상태를 건드리지 않았다
    expect(noFramebuffer.log).toEqual([]);
  });
});
