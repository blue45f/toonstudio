import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { StudioNpcDirector, type StudioNpcView } from "./studio-virtual-space-npc-director";
import {
  dampStudioDisplayPoint,
  studioDisplayDampTauSeconds,
  STUDIO_DISPLAY_DAMP_TAU_SECONDS,
  type StudioDisplayPoint,
} from "./studio-virtual-space-sprite-smoothing";
import { DEFAULT_STUDIO_WORLD_MANIFEST, type StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

const world: StudioVirtualSpaceWorldManifest = {
  ...DEFAULT_STUDIO_WORLD_MANIFEST,
  width: 400,
  height: 300,
  colliders: [],
  props: [],
  interactions: [],
  portals: [],
  occlusionLayers: [],
  rooms: [{ id: "writers", labelKo: "작가실", labelEn: "Writers", x: 0, y: 0, width: 400, height: 300 }],
  spawns: [{ id: "main", point: { x: 40, y: 200 } }],
  npcs: [{
    id: "damping-writer", skinKey: "npc-editor", roomId: "writers", point: { x: 50, y: 100 },
    facing: "right", speed: 62, behavior: "patrol", patrol: [{ x: 330, y: 100 }],
  }],
};
const environment = { people: [], atmosphere: "balanced" as const };

function first(views: readonly StudioNpcView[]): StudioNpcView {
  const view = views[0];
  if (!view) throw new Error("감쇠 검증에 사용할 NPC가 없습니다.");
  return view;
}

/** 순찰 NPC를 걷기 시작부터 도착까지 몰고, 이동 중 관측한 최대 속도와 도착 직후 뷰를 돌려준다. */
function walkUntilArrival(director: StudioNpcDirector): { cruiseSpeed: number; arrived: StudioNpcView } {
  let cruiseSpeed = 0;
  let sawMoving = false;
  for (let index = 0; index < 60 * 45; index += 1) {
    const view = first(director.advance(1 / 60, environment));
    if (view.moving) {
      sawMoving = true;
      expect(view.speed).toBeGreaterThan(0);
      cruiseSpeed = Math.max(cruiseSpeed, view.speed);
    } else if (sawMoving) {
      return { cruiseSpeed, arrived: view };
    }
  }
  throw new Error("NPC가 제한 시간 안에 순찰을 마치지 못했습니다.");
}

describe("NPC 디렉터 뷰의 속도 노출", () => {
  it("정지 상태에서는 속도가 0이다", () => {
    const director = new StudioNpcDirector(world);
    const view = first(director.views);
    expect(view.moving).toBe(false);
    expect(view.speed).toBe(0);
  });

  it("이동 중에는 정의 속도에 닿는 양의 속도를 노출하고, 도착해 멈추면 0으로 돌아온다", () => {
    const director = new StudioNpcDirector(world);
    const { cruiseSpeed, arrived } = walkUntilArrival(director);
    // 정의 속도 62px/s가 순항 속도이고, NPC 속도 상한(90px/s)을 넘지 않는다(변위/시간 나눗셈 오차 허용).
    expect(cruiseSpeed).toBeGreaterThan(50);
    expect(cruiseSpeed).toBeLessThanOrEqual(62.001);
    expect(arrived.moving).toBe(false);
    expect(arrived.speed).toBe(0);
  });
});

describe("NPC 표시 감쇠 — 정지·저속과 이동 중의 차이", () => {
  it("노출 속도를 공유 적응 규칙에 넣으면 정지 시 잔차가 사라지고 이동 중에는 정상 뒤처짐이 유지된다", () => {
    const director = new StudioNpcDirector(world);
    const { cruiseSpeed } = walkUntilArrival(director);
    const dt = 1 / 60;

    // 이동 중: 목표가 순항 속도로 계속 멀어지면 표시점은 속도×τ 근처의 뒤처짐에서 균형을 잡는다.
    const movingTau = studioDisplayDampTauSeconds(cruiseSpeed);
    let target: StudioDisplayPoint = { x: 0, y: 0 };
    let display: StudioDisplayPoint | null = null;
    for (let index = 0; index < 60 * 3; index += 1) {
      target = { x: target.x + cruiseSpeed * dt, y: 0 };
      display = dampStudioDisplayPoint(display, target, dt, { tauSeconds: movingTau });
    }
    const movingLag = Math.hypot(target.x - display!.x, target.y - display!.y);
    expect(movingLag).toBeGreaterThan(2);
    expect(movingLag).toBeGreaterThan(cruiseSpeed * movingTau * 0.7);
    expect(movingLag).toBeLessThan(cruiseSpeed * movingTau * 1.6);

    // 정지: 노출 속도 0 → 같은 규칙의 τ로 감쇠하면 표시점 잔차가 0으로 수렴한다 (이동 중 뒤처짐과 대비).
    const restTau = studioDisplayDampTauSeconds(0);
    const restTarget: StudioDisplayPoint = { x: 100, y: 0 };
    let restDisplay: StudioDisplayPoint | null = { x: 40, y: 0 };
    for (let index = 0; index < 60 / 2; index += 1) {
      restDisplay = dampStudioDisplayPoint(restDisplay, restTarget, dt, { tauSeconds: restTau });
    }
    const restResidual = Math.hypot(restTarget.x - restDisplay.x, restTarget.y - restDisplay.y);
    expect(restResidual).toBeLessThan(0.5);
    expect(restResidual).toBeLessThan(movingLag);
  });

  it("NPC 순항 속도 대역에서는 공유 규칙이 기본 τ를 돌려준다 — NPC 전용 상수를 만들지 않는다", () => {
    // 공유 계약의 기준 속도(160px/s) 아래에서는 기본 τ가 유지된다. NPC 속도가 그 위로
    // 오르는 콘텐츠가 생기면 이 단언이 먼저 깨져, 적응 규칙 편입 여부를 의식적으로 재검토하게 한다.
    expect(studioDisplayDampTauSeconds(62)).toBe(STUDIO_DISPLAY_DAMP_TAU_SECONDS);
    expect(studioDisplayDampTauSeconds(90)).toBe(STUDIO_DISPLAY_DAMP_TAU_SECONDS);
    expect(studioDisplayDampTauSeconds(0)).toBe(STUDIO_DISPLAY_DAMP_TAU_SECONDS);
  });
});

describe("캔버스 NPC 감쇠 배선", () => {
  it("NPC 표시 감쇠가 디렉터 뷰의 속도로 구한 적응형 τ를 쓴다", () => {
    const canvasSource = readFileSync(new URL("./StudioVirtualSpacePhaserCanvas.tsx", import.meta.url), "utf8");
    expect(canvasSource).toContain("tauSeconds: studioDisplayDampTauSeconds(view.speed)");
  });
});
