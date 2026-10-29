/**
 * 젖은 종이 베이크의 격자 계획과 상태 버퍼.
 *
 * 격자는 획 경계 상자(dab 원 + 번짐 여유)를 덮는 조밀(dense) 배열이지만 계산은 "깨어난" 4×4 타일만 한다.
 * 타일은 한 번 깨면 끝까지 깨어 있다(단조). 그래서 한 번도 깨지 않은 타일의 모든 필드는 두 버퍼 모두 0으로
 * 남고, 깬 타일은 매 스텝 두 버퍼를 모두 갱신하므로 이중 버퍼에 낡은 값이 남지 않는다. 물·안료는 스텝당
 * 최대 한 셀만 움직이므로 "물이 있는 타일의 8이웃을 스텝 시작 전에 깨운다"는 규칙이면 깨지 않은 타일을
 * 건너뛰어도 결과가 전부 계산한 것과 비트 단위로 같다(빈 셀의 스텝은 항등).
 *
 * 격자의 바깥 타일 한 겹은 영구 벽이다(깨우지 않고, 그 셀로 가는 흐름은 bounce-back, 모세관·안료 링크는 0).
 * 그래서 처리 대상 셀의 8이웃은 항상 격자 안에 있어 핫 루프에 경계 검사가 없다.
 *
 * 상한(명시적): 셀 수·변 길이·추정 활성 셀 수·dab 침착 작업량. 넘으면 셀 크기(px)를 키워 해상도를 낮춘다.
 * 모든 상태는 Float32Array이고 스텝 안에서는 할당하지 않는다.
 */

import { clampNumber } from "./studio-wet-paper-math";

export const WET_PAPER_TILE = 4;
export const WET_PAPER_LINK_CLASSES = 4;
export const WET_PAPER_SPECIES = 2;

export const STUDIO_WET_PAPER_GRID_LIMITS = Object.freeze({
  /** 조밀 격자 셀 상한(메모리 상한: 셀당 약 250 B → 약 16 MiB, 베이크 중에만 존재). */
  maxCells: 65_536,
  /** 한 변 상한(셀). */
  maxSide: 512,
  /** 추정 활성(깨어날) 셀 상한 — 스텝당 비용의 상한. */
  maxActiveCells: 16_384,
  /** dab 침착 작업량 상한(Σ 이벤트 원이 덮는 셀). */
  maxDepositWork: 3_000_000,
  /** 셀 크기 하한(문서 px). 이보다 촘촘하게 풀어도 보이는 차이가 없다. */
  minCellPx: 1,
  /** core dab 평균 지름을 가로지르는 목표 셀 수의 상한(프로그램 `cellsAcross`를 이 범위로 묶는다). */
  maxCellsAcross: 24,
  minCellsAcross: 6,
  /** 물이 퍼질 여유(셀). 경계 벽에 닿기 전에 마르도록 둔다. */
  padCells: 10,
});

export interface WetPaperGrid {
  readonly width: number;
  readonly height: number;
  readonly cells: number;
  readonly tilesX: number;
  readonly tilesY: number;
  /** 셀 (0, 0)의 왼쪽 위 모서리 문서 좌표. */
  readonly originXPx: number;
  readonly originYPx: number;
  /** 셀 한 변의 문서 px. */
  readonly cellPx: number;
}

export interface WetPaperGridExtent {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  /** core dab 평균 반지름(px). */
  readonly meanCoreRadius: number;
  /** 가장 큰 dab 반지름(px). */
  readonly maxRadius: number;
  /** 획 중심선 길이(px). */
  readonly strokeLength: number;
  /** Σ π r² (px²) — 침착 작업량 추정. */
  readonly depositAreaPx: number;
  readonly eventCount: number;
}

function roundUpToTile(value: number): number {
  return Math.ceil(value / WET_PAPER_TILE) * WET_PAPER_TILE;
}

/**
 * 획 범위와 프로그램 해상도(`cellsAcross`)에서 격자를 정한다. 순수·결정적 함수이며 상한을 넘으면 cellPx를
 * 키운다(최대 12회 반복).
 */
export function planWetPaperGrid(extent: WetPaperGridExtent, cellsAcross: number): WetPaperGrid {
  const limits = STUDIO_WET_PAPER_GRID_LIMITS;
  const meanCore = Math.max(0.25, extent.meanCoreRadius);
  const across = clampNumber(cellsAcross, limits.minCellsAcross, limits.maxCellsAcross);
  let cellPx = Math.max(limits.minCellPx, (meanCore * 2) / across);
  const wetRadius = Math.max(meanCore, extent.maxRadius);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    // 바깥 타일 한 겹은 영구 벽(bounce-back)이라 여유에 더한다.
    const padPx = wetRadius * 0.6 + (limits.padCells + WET_PAPER_TILE) * cellPx;
    const spanX = Math.max(1e-3, extent.maxX - extent.minX) + padPx * 2;
    const spanY = Math.max(1e-3, extent.maxY - extent.minY) + padPx * 2;
    const width = roundUpToTile(Math.max(WET_PAPER_TILE * 4, Math.ceil(spanX / cellPx)));
    const height = roundUpToTile(Math.max(WET_PAPER_TILE * 4, Math.ceil(spanY / cellPx)));
    const cellArea = cellPx * cellPx;
    const reach = wetRadius + padPx;
    const activeAreaPx = Math.min(
      spanX * spanY,
      extent.strokeLength * reach * 2 + Math.PI * reach * reach,
    );
    const activeCells = activeAreaPx / cellArea;
    const depositWork = extent.depositAreaPx / cellArea + extent.eventCount * 4;
    let growth = 1;
    if (width > limits.maxSide) growth = Math.max(growth, width / limits.maxSide);
    if (height > limits.maxSide) growth = Math.max(growth, height / limits.maxSide);
    if (width * height > limits.maxCells) {
      growth = Math.max(growth, Math.sqrt((width * height) / limits.maxCells));
    }
    if (activeCells > limits.maxActiveCells) {
      growth = Math.max(growth, Math.sqrt(activeCells / limits.maxActiveCells));
    }
    if (depositWork > limits.maxDepositWork) {
      growth = Math.max(growth, Math.sqrt(depositWork / limits.maxDepositWork));
    }
    if (growth <= 1) {
      return Object.freeze({
        width,
        height,
        cells: width * height,
        tilesX: width / WET_PAPER_TILE,
        tilesY: height / WET_PAPER_TILE,
        originXPx: (extent.minX + extent.maxX) * 0.5 - (width * cellPx) * 0.5,
        originYPx: (extent.minY + extent.maxY) * 0.5 - (height * cellPx) * 0.5,
        cellPx,
      });
    }
    // 반올림 여유를 조금 더 줘서 반복이 짧게 수렴하게 한다.
    cellPx *= growth * 1.02;
  }
  // 12회 안에 수렴하지 못할 입력(극단 좌표)은 최대 격자에 강제로 맞춘다.
  const side = limits.maxSide / 2;
  const span = Math.max(extent.maxX - extent.minX, extent.maxY - extent.minY, 1);
  const forcedCellPx = clampNumber(span / (side - limits.padCells * 2), limits.minCellPx, Number.MAX_VALUE);
  return Object.freeze({
    width: side,
    height: side,
    cells: side * side,
    tilesX: side / WET_PAPER_TILE,
    tilesY: side / WET_PAPER_TILE,
    originXPx: (extent.minX + extent.maxX) * 0.5 - (side * forcedCellPx) * 0.5,
    originYPx: (extent.minY + extent.maxY) * 0.5 - (side * forcedCellPx) * 0.5,
    cellPx: forcedCellPx,
  });
}

export interface WetPaperState {
  readonly grid: WetPaperGrid;
  /** LBM 흐름층 분포(면 배치 f[q·cells + i]). 이중 버퍼. */
  fCur: Float32Array;
  fNext: Float32Array;
  /** 흐름층 밀도 ρ = Σf. */
  rhoCur: Float32Array;
  rhoNext: Float32Array;
  /** 표면층 물. */
  wsCur: Float32Array;
  wsNext: Float32Array;
  /** 모세관층 물(종이 섬유 포화). */
  sCur: Float32Array;
  sNext: Float32Array;
  /** 이번 스텝 흐름층 속도(격자 단위/스텝). 안료 이류가 읽는다. */
  readonly ux: Float32Array;
  readonly uy: Float32Array;
  /** 이번 스텝 끝 젖음(표면 + 흐름층 물). 안료 패스가 링크마다 다시 더하지 않게 물 패스가 쓴다. */
  readonly wetNext: Float32Array;
  /** 베이크 동안 셀이 가장 젖었던 양(젖음 전선의 최종 위치 — 합성의 선명한 가장자리 기준). */
  readonly wetMax: Float32Array;
  /**
   * 이번 스텝 3×3 이웃 중 젖은 셀의 비율(0..1, 안료 패스가 처리 대상 셀에만 쓴다). 가장자리 이동이 이 거시
   * 장의 기울기만 따르게 해서, 고르게 마르는 워시 안쪽의 미세한 물 두께 차이가 줄무늬를 만들지 않는다.
   */
  readonly wetFraction: Float32Array;
  /** 부유 안료(종 우선 배치 g[s·cells + i]). 이중 버퍼. */
  gCur: Float32Array;
  gNext: Float32Array;
  /** 침착 안료(다시 들릴 수 있음)와 고정 안료(착색·경화). */
  readonly dep: Float32Array;
  readonly fix: Float32Array;
  /**
   * 안료 링크 유출 비율(링크 소유 셀 기준, [종·클래스·셀] 배치). F는 소유 셀 → 이웃, B는 이웃 → 소유 셀.
   * 한 링크를 한 번만 계산해 양 끝이 같은 값을 읽게 한다(안료 질량 보존).
   */
  readonly linkOutF: Float32Array;
  readonly linkOutB: Float32Array;
  /**
   * 모세관 링크 물 플럭스(링크 소유 셀 기준, 클래스 우선 배치): 이웃(소유 셀 + c_q) → 소유 셀이 양수.
   * 물 패스와 안료 패스(모세관 운반)가 같은 값을 읽는다.
   */
  readonly capillaryFlux: Float32Array;
  /** 마른 시점 스텝(−1 = 젖어 있음). 경화는 다시 젖을 때 지연 적용한다. */
  readonly dryStep: Int32Array;
  /** 종이: 요철 높이 0..1, 섬유 밀도 0..1, 모세관 용량, 흡수율. */
  readonly height: Float32Array;
  readonly fiber: Float32Array;
  readonly capacity: Float32Array;
  /** 1 / 모세관 용량(핫 루프 나눗셈 제거). */
  readonly invCapacity: Float32Array;
  readonly absorb: Float32Array;
  /** 링크 소유 셀 기준 종이 차단 계수 κ(클래스 우선 배치 kappa[c·cells + i], 0..1). */
  readonly kappa: Float32Array;
  /** 영구 벽 셀(바깥 타일 한 겹) = 1. */
  readonly wall: Uint8Array;
  readonly tileAwake: Uint8Array;
  /** 타일에 물(표면·흐름·모세관)이나 부유 안료가 남았는가(이전 스텝 끝 + 이번 스텝 침착). */
  readonly tileWet: Uint8Array;
  readonly tilePaper: Uint8Array;
  /** 3×3 타일 이웃에 활동이 없던 연속 스텝 수(0..2). 2면 그 타일의 스텝은 항등이라 건너뛴다. */
  readonly tileQuiet: Uint8Array;
  /** 이번 스텝 처리할 타일((ty, tx) 오름차순). */
  readonly processList: Int32Array;
  processCount: number;
  /** 후보 목록 작업 버퍼. */
  readonly scratchTiles: Int32Array;
  stepIndex: number;
  /** 장부(float64): 넣은 물, 증발한 물, 넣은 안료. */
  waterIn: number;
  waterEvaporated: number;
  pigmentIn: number;
}

export function createWetPaperState(grid: WetPaperGrid): WetPaperState {
  const cells = grid.cells;
  const tiles = grid.tilesX * grid.tilesY;
  // 깨지 않은 타일의 종이 기본값(중립). 물이 닿기 전에 반드시 깨어 실제 종이로 덮이지만, 경계 셀이
  // 이웃 값을 읽을 때 0 나눗셈이 생기지 않게 중립 값을 둔다.
  const height = new Float32Array(cells).fill(0.5);
  const capacity = new Float32Array(cells).fill(1);
  const invCapacity = new Float32Array(cells).fill(1);
  const absorb = new Float32Array(cells).fill(0.5);
  const wall = new Uint8Array(cells);
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (
        x < WET_PAPER_TILE || y < WET_PAPER_TILE
        || x >= grid.width - WET_PAPER_TILE || y >= grid.height - WET_PAPER_TILE
      ) {
        wall[y * grid.width + x] = 1;
      }
    }
  }
  return {
    grid,
    fCur: new Float32Array(cells * 9),
    fNext: new Float32Array(cells * 9),
    rhoCur: new Float32Array(cells),
    rhoNext: new Float32Array(cells),
    wsCur: new Float32Array(cells),
    wsNext: new Float32Array(cells),
    sCur: new Float32Array(cells),
    sNext: new Float32Array(cells),
    ux: new Float32Array(cells),
    uy: new Float32Array(cells),
    wetNext: new Float32Array(cells),
    wetMax: new Float32Array(cells),
    wetFraction: new Float32Array(cells),
    gCur: new Float32Array(cells * WET_PAPER_SPECIES),
    gNext: new Float32Array(cells * WET_PAPER_SPECIES),
    dep: new Float32Array(cells * WET_PAPER_SPECIES),
    fix: new Float32Array(cells * WET_PAPER_SPECIES),
    linkOutF: new Float32Array(cells * WET_PAPER_LINK_CLASSES * WET_PAPER_SPECIES),
    linkOutB: new Float32Array(cells * WET_PAPER_LINK_CLASSES * WET_PAPER_SPECIES),
    capillaryFlux: new Float32Array(cells * WET_PAPER_LINK_CLASSES),
    dryStep: new Int32Array(cells).fill(-1),
    height,
    fiber: new Float32Array(cells),
    capacity,
    invCapacity,
    absorb,
    kappa: new Float32Array(cells * WET_PAPER_LINK_CLASSES),
    wall,
    tileAwake: new Uint8Array(tiles),
    tileWet: new Uint8Array(tiles),
    tilePaper: new Uint8Array(tiles),
    tileQuiet: new Uint8Array(tiles),
    processList: new Int32Array(tiles),
    processCount: 0,
    scratchTiles: new Int32Array(tiles),
    stepIndex: 0,
    waterIn: 0,
    waterEvaporated: 0,
    pigmentIn: 0,
  };
}

/** 이중 버퍼를 맞바꾼다(스텝 끝). */
export function swapWetPaperBuffers(state: WetPaperState): void {
  let swap = state.fCur;
  state.fCur = state.fNext;
  state.fNext = swap;
  swap = state.rhoCur;
  state.rhoCur = state.rhoNext;
  state.rhoNext = swap;
  swap = state.wsCur;
  state.wsCur = state.wsNext;
  state.wsNext = swap;
  swap = state.sCur;
  state.sCur = state.sNext;
  state.sNext = swap;
  swap = state.gCur;
  state.gCur = state.gNext;
  state.gNext = swap;
}

/**
 * 타일 하나를 깨운다(이미 깼으면, 또는 바깥 벽 타일이면 아무것도 하지 않는다). 종이 필드는 처음 깰 때
 * `fillPaper`가 채운다.
 */
export function wakeWetPaperTile(
  state: WetPaperState,
  tileX: number,
  tileY: number,
  fillPaper: (state: WetPaperState, tileX: number, tileY: number) => void,
): void {
  const { tilesX, tilesY } = state.grid;
  // 바깥 한 겹 타일은 벽이라 절대 깨우지 않는다.
  if (tileX < 1 || tileY < 1 || tileX >= tilesX - 1 || tileY >= tilesY - 1) return;
  const tile = tileY * tilesX + tileX;
  if (state.tileAwake[tile] === 1) return;
  state.tileAwake[tile] = 1;
  if (state.tilePaper[tile] !== 1) {
    fillPaper(state, tileX, tileY);
    state.tilePaper[tile] = 1;
  }
}

function tileNeighborhoodActive(state: WetPaperState, tileX: number, tileY: number): boolean {
  const { tilesX, tilesY } = state.grid;
  for (let dy = -1; dy <= 1; dy += 1) {
    const ny = tileY + dy;
    if (ny < 0 || ny >= tilesY) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = tileX + dx;
      if (nx < 0 || nx >= tilesX) continue;
      if (state.tileWet[ny * tilesX + nx] === 1) return true;
    }
  }
  return false;
}

/**
 * 스텝 시작 준비: (1) 물·부유 안료가 있는 타일의 8이웃을 깨우고, (2) 처리할 타일 목록을 만든다.
 *
 * 처리 규칙(정확한 생략): 3×3 타일 이웃에 활동이 없는 타일은 물·안료가 들어올 수 없어 그 스텝이 항등이다.
 * 다만 이중 버퍼 두 장이 같은 값이 되도록 활동이 끊긴 "첫" 스텝은 한 번 더 처리하고, 둘째 스텝부터 건너뛴다.
 * 그래서 건너뛰어도 전부 처리한 것과 비트 단위로 같다.
 */
export function prepareWetPaperStep(
  state: WetPaperState,
  fillPaper: (state: WetPaperState, tileX: number, tileY: number) => void,
): void {
  const { tilesX, tilesY } = state.grid;
  const total = tilesX * tilesY;
  // 새로 깬 타일이 같은 호출 안에서 다시 이웃을 깨우지 않도록 후보를 먼저 모은다(결정적 순서).
  let wetCount = 0;
  for (let tile = 0; tile < total; tile += 1) {
    if (state.tileWet[tile] === 1) {
      state.scratchTiles[wetCount] = tile;
      wetCount += 1;
    }
  }
  for (let index = 0; index < wetCount; index += 1) {
    const tile = state.scratchTiles[index] as number;
    const tileX = tile % tilesX;
    const tileY = (tile - tileX) / tilesX;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) wakeWetPaperTile(state, tileX + dx, tileY + dy, fillPaper);
    }
  }
  let count = 0;
  for (let tile = 0; tile < total; tile += 1) {
    if (state.tileAwake[tile] !== 1) continue;
    const tileX = tile % tilesX;
    const tileY = (tile - tileX) / tilesX;
    if (tileNeighborhoodActive(state, tileX, tileY)) {
      state.tileQuiet[tile] = 0;
    } else if ((state.tileQuiet[tile] as number) < 2) {
      state.tileQuiet[tile] = (state.tileQuiet[tile] as number) + 1;
    }
    if ((state.tileQuiet[tile] as number) < 2) {
      state.processList[count] = tile;
      count += 1;
    }
  }
  state.processCount = count;
}
