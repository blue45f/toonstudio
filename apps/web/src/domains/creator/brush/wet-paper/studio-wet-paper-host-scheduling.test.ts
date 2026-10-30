/**
 * 젖은 종이 굽기 호스트의 스케줄링 시험(적대적 리뷰 확정 결함 회귀).
 *
 * - 같은 요청자(요소·변형)가 입력을 바꾸면 아무도 기다리지 않는 이전 풀이·합성을 버린다(두께 슬라이더·노드 끌기·
 *   색 미리보기가 중간 상태마다 전체 작업을 줄 세워 마지막 결과가 수십 초 늦던 문제).
 * - 최근 요청된 래스터는 소프트 상한 때문에 버리지 않는다(대칭 획이 버린 것을 다시 합성하고 또 버리는 무한 반복).
 *   하드 상한을 넘으면 보관하지 않고 알리지 않으며 잠시 다시 걸지 않는다.
 * - 합성과 풀이가 번갈아 진행된다(합성 대기열이 풀이를 굶기지 않는다).
 * - 대기 작업이 모두 끝나면 `waitForStudioWetPaperBakesIdle` 이 풀린다(캡처 준비).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  requestStudioWetPaperBake,
  resetStudioWetPaperBakeHostForTests,
  setStudioWetPaperBakeHostLimitsForTests,
  studioWetPaperBakeHostStatsForTests,
  waitForStudioWetPaperBakesIdle,
} from "./studio-wet-paper-host";

import type { WetPaperInputDab } from "./studio-wet-paper-deposit";

const REQUEST = { seed: 7, programId: "curtis-watercolor-backrun" as const };

/** x 로 옮긴 짧은 곧은 획(서로 다른 결과 키). */
function stroke(offset: number, length = 24): WetPaperInputDab[] {
  return Array.from({ length }, (_, index) => ({ x: 30 + offset + index * 3, y: 50, radius: 8, opacity: 0.6, role: "core" as const }));
}

/** 문서가 없는 Node 환경에 크기만 있는 최소 캔버스를 꽂는다(래스터 면적으로 상한을 잰다). */
function installFakeDocument(): void {
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
          putImageData: () => undefined,
        }),
      };
      return canvas;
    },
  });
}

const idle = (): Promise<void> => waitForStudioWetPaperBakesIdle();

beforeEach(() => {
  resetStudioWetPaperBakeHostForTests();
  installFakeDocument();
});
afterEach(() => {
  resetStudioWetPaperBakeHostForTests();
  setStudioWetPaperBakeHostLimitsForTests(null);
  vi.unstubAllGlobals();
});

describe("젖은 종이 호스트 · 대체된 요청", () => {
  it("같은 요청자가 입력을 바꾸면 아무도 기다리지 않는 이전 풀이를 버리고, 다른 요청자·익명 요청은 남긴다", async () => {
    const noop = (): void => undefined;
    for (let step = 0; step < 30; step += 1) requestStudioWetPaperBake(stroke(step), REQUEST, "#1f6feb", noop, 0, "stroke-a#0");
    expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(1);
    // 다른 요청자가 기다리는 결과는 버리지 않는다.
    requestStudioWetPaperBake(stroke(29), REQUEST, "#1f6feb", noop, 0, "stroke-b#0");
    requestStudioWetPaperBake(stroke(40), REQUEST, "#1f6feb", noop, 0, "stroke-a#0");
    expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(2);
    // 익명 요청(요청자 없음)은 버리지 않는다.
    requestStudioWetPaperBake(stroke(50), REQUEST, "#1f6feb", noop);
    requestStudioWetPaperBake(stroke(50), REQUEST, "#1f6feb", noop, 0, "stroke-c#0");
    requestStudioWetPaperBake(stroke(60), REQUEST, "#1f6feb", noop, 0, "stroke-c#0");
    expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(4);
    await idle();
    // 마지막 요청만 결과가 남는다(30, 40 → 40 / 29 / 50 / 60).
    expect(studioWetPaperBakeHostStatsForTests().entries).toBe(4);
    expect(requestStudioWetPaperBake(stroke(40), REQUEST, "#1f6feb", noop, 0, "stroke-a#0")).not.toBeNull();
  }, 60_000);

  it("색 미리보기는 요청자마다 마지막 색의 합성 하나만 남긴다", async () => {
    let ready = 0;
    requestStudioWetPaperBake(stroke(0), REQUEST, "#102030", () => { ready += 1; }, 0, "stroke-a#0");
    await idle();
    expect(requestStudioWetPaperBake(stroke(0), REQUEST, "#102030", () => undefined, 0, "stroke-a#0")).not.toBeNull();
    const colors = Array.from({ length: 40 }, (_, index) => `#20${(index + 16).toString(16).padStart(2, "0")}a0`);
    for (const color of colors) requestStudioWetPaperBake(stroke(0), REQUEST, color, () => undefined, 0, "stroke-a#0");
    expect(studioWetPaperBakeHostStatsForTests().pendingComposites).toBe(1);
    await idle();
    expect(requestStudioWetPaperBake(stroke(0), REQUEST, colors.at(-1)!, () => undefined, 0, "stroke-a#0")).not.toBeNull();
    expect(ready).toBe(1);
  }, 60_000);
});

describe("젖은 종이 호스트 · 핀과 상한", () => {
  async function rasterArea(): Promise<number> {
    requestStudioWetPaperBake(stroke(0), REQUEST, "#1f6feb", () => undefined, 0, "probe#0");
    await idle();
    const area = studioWetPaperBakeHostStatsForTests().rasterPixels;
    resetStudioWetPaperBakeHostForTests();
    return area;
  }

  it("한 화면이 함께 쓰는 래스터는 소프트 상한을 넘어도 버리지 않아 다시 합성을 되풀이하지 않는다", async () => {
    const area = await rasterArea();
    expect(area).toBeGreaterThan(0);
    // 소프트 상한 = 래스터 2.5개, 하드 상한 = 5개. 대칭 변형 4개가 함께 그려진다.
    setStudioWetPaperBakeHostLimitsForTests({ rasterSoftPixels: area * 2.5, rasterHardPixels: area * 5 });
    const requesters = ["sym#0", "sym#1", "sym#2", "sym#3"];
    let notifications = 0;
    const render = (): (object | null)[] => requesters.map((requester, index) =>
      requestStudioWetPaperBake(stroke(index * 7), REQUEST, "#1f6feb", () => { notifications += 1; }, 0, requester));
    render();
    await idle();
    expect(render().every((bake) => bake !== null)).toBe(true);
    const settled = notifications;
    // 다시 그려도 모두 캐시에서 나오고 새 작업이 생기지 않는다(예전에는 하나를 넣을 때마다 다른 것을 버렸다).
    for (let round = 0; round < 3; round += 1) {
      expect(render().every((bake) => bake !== null)).toBe(true);
      expect(studioWetPaperBakeHostStatsForTests()).toMatchObject({ pendingSolves: 0, pendingComposites: 0 });
    }
    expect(notifications).toBe(settled);
    expect(studioWetPaperBakeHostStatsForTests().rasterPixels).toBeLessThanOrEqual(area * 5);
  }, 60_000);

  it("하드 상한을 넘는 래스터는 보관하지 않고 알리지 않으며 잠시 다시 걸지 않는다", async () => {
    const area = await rasterArea();
    setStudioWetPaperBakeHostLimitsForTests({ rasterSoftPixels: area * 1.5, rasterHardPixels: area * 3.5 });
    const requesters = ["sym#0", "sym#1", "sym#2", "sym#3", "sym#4"];
    const notified = new Set<string>();
    const render = (): (object | null)[] => requesters.map((requester, index) =>
      requestStudioWetPaperBake(stroke(index * 7), REQUEST, "#1f6feb", () => { notified.add(requester); }, 0, requester));
    render();
    await idle();
    const baked = render();
    expect(baked.filter((bake) => bake !== null)).toHaveLength(3);
    expect(notified.size).toBe(3);
    // 거절된 변형은 다시 요청해도 작업을 걸지 않는다(헛도는 합성 방지).
    expect(studioWetPaperBakeHostStatsForTests()).toMatchObject({ pendingSolves: 0, pendingComposites: 0 });
    expect(studioWetPaperBakeHostStatsForTests().rasterPixels).toBeLessThanOrEqual(area * 3.5);
  }, 60_000);
});

describe("젖은 종이 호스트 · 공정성과 대기", () => {
  it("합성 대기열이 길어도 풀이가 함께 진행된다", async () => {
    requestStudioWetPaperBake(stroke(0, 60), REQUEST, "#000000", () => undefined);
    await idle();
    expect(studioWetPaperBakeHostStatsForTests().entries).toBe(1);
    // 익명 색 합성 60개(버려지지 않는다)와 다른 획의 풀이 하나. 합성이 끝날 때마다 풀이 결과가 이미 있는지 본다.
    // 합성 하나는 3단위(시작·행·마감), 풀이는 약 80단위라 번갈아 진행하면 합성 절반쯤에서 풀이가 끝난다.
    const solvedSeenByComposite: boolean[] = [];
    for (let index = 0; index < 60; index += 1) {
      const color = `#${(index * 4 + 16).toString(16).padStart(2, "0")}3060`;
      requestStudioWetPaperBake(stroke(0, 60), REQUEST, color, () => {
        solvedSeenByComposite.push(studioWetPaperBakeHostStatsForTests().entries === 2);
      });
    }
    requestStudioWetPaperBake(stroke(200), REQUEST, "#000000", () => undefined);
    await idle();
    expect(solvedSeenByComposite).toHaveLength(60);
    // 예전에는 합성이 늘 먼저라 60개가 모두 끝난 뒤에야 풀이가 시작했다.
    expect(solvedSeenByComposite.some(Boolean)).toBe(true);
  }, 60_000);

  it("대기 작업이 없으면 바로, 있으면 모두 끝난 뒤 풀리고, 중단 신호면 거부한다", async () => {
    await expect(idle()).resolves.toBeUndefined();
    requestStudioWetPaperBake(stroke(0), REQUEST, "#1f6feb", () => undefined, 0, "fence#0");
    let settled = false;
    const waiting = idle().then(() => { settled = true; });
    expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(1);
    await waiting;
    expect(settled).toBe(true);
    expect(studioWetPaperBakeHostStatsForTests()).toMatchObject({ pendingSolves: 0, pendingComposites: 0 });
    requestStudioWetPaperBake(stroke(9), REQUEST, "#1f6feb", () => undefined, 0, "fence#1");
    const controller = new AbortController();
    const aborted = waitForStudioWetPaperBakesIdle(controller.signal);
    controller.abort(new Error("stop"));
    await expect(aborted).rejects.toThrow("stop");
    await idle();
  }, 60_000);
});
