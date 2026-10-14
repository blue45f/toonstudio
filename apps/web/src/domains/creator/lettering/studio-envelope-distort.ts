/**
 * Studio Envelope Distort — 제목 로고·효과음(SFX) 레터링용 엔벨로프 왜곡 순수 모델.
 *
 * 근거: artcraft-features REPORT §1.1(VectorCraft Envelope Distort) + §2 대조 판정
 * "엔벨로프 왜곡·블렌드 — 없음, 제목 로고·효과음 레터링 연출에 한정, 설계 단계로 분리".
 * 설계 정본: studio-envelope-distort-design.md (이 파일과 같은 폴더).
 *
 * 기존 왜곡 계열과의 경계 (전부 main 실측, 이 파일이 대체하지 않는다):
 * - studio-distort.ts: 래스터 역매핑 필터(twirl/ripple/pinch/wave) — 픽셀 파괴 편집, 이미지용.
 * - studio-puppet-warp.ts: Delaunay 핀 메시 — 래스터 이미지 전용, 정규화 핀.
 * - studio-mesh-warp-liquify.ts: 절대 px 격자(StudioMeshWarpGrid) + 리퀴파이 브러시 —
 *   bounds 종속이라 요소 리사이즈에 깨지고, 프리셋·텍스트/패스 적용 개념이 없다.
 * - lettering/studio-text-path.ts: 1차원 베이스라인 경로(아치/물결/원) — 글자를 "선"에 얹을 뿐
 *   면(面) 왜곡이 아니다. lettering/studio-text-effects.ts: 채움/외곽선/그림자 평면 효과뿐.
 *
 * 이 모델의 확정 사항 (설계 문서 §2~§4):
 * - 적용 대상은 2종만: (1) 라이브 텍스트 TextEl (SFX 포함 — SFX는 TextEl로 생성된다),
 *   (2) 벡터 패스 데이터(SVG path 문자열 — studio-text-vector-bake.ts 출력 규약 M/L/Q/C/Z).
 *   이미지·그룹·말풍선은 대상이 아니다(이미지는 퍼펫/메시 워프, 말풍선은 형상 시스템 소관).
 * - 메시는 요소 로컬 박스 기준 정규화 좌표(0..1)의 규칙 격자. 노드는 rest 위치를 저장하지
 *   않고 오프셋(dx,dy)만 저장한다 — 리사이즈·폰트 크기 변경에도 왜곡 모양이 비율로 유지된다.
 * - 평가는 쌍삼차(bicubic) Catmull-Rom 곡면 — 노드를 정확히 통과하고 C1 연속이라
 *   쌍선형(bilinear)의 격자 꺾임이 글자 윤곽에 남지 않는다.
 * - 비파괴: 원본 텍스트/패스는 그대로 두고 EnvelopeDistort만 요소에 붙인다.
 *   확정(expand)은 호출자가 bake(텍스트→패스) 후 warpEnvelopePathData를 적용한다.
 * - 전부 순수·결정적(Math.random/Date/DOM/Konva 없음). 정규화·항등 판정·프리셋 패턴은
 *   studio-distort.ts / studio-text-path.ts의 기존 관례를 따른다.
 */

// ---------------------------------------------------------------------------
// 타입·상수
// ---------------------------------------------------------------------------

/** 엔벨로프 적용 대상 — text: 라이브 TextEl, path: 베이크된 벡터 패스 데이터. */
export type EnvelopeTargetKind = "text" | "path";

/** 편집 모드 — preset: 파라미터가 노드를 재생성, mesh: 노드를 직접 드래그(파라미터 동결). */
export type EnvelopeMode = "preset" | "mesh";

/** 격자 노드 1개의 오프셋(정규화 단위). rest 위치는 (col/cols, row/rows)로 유도된다. */
export type EnvelopeNodeOffset = { dx: number; dy: number };

/**
 * 엔벨로프 왜곡 1건 — 요소에 붙는 비파괴 필드(TextEl.envelope 등)의 값.
 * nodes는 행 우선(row-major), 길이는 (cols+1)*(rows+1)로 고정된다.
 * preset 모드에서 nodes는 항상 presetId+bend+hDistort/vDistort에서 재생성된 값과 같고,
 * mesh 모드에서는 사용자가 드래그한 자유 오프셋이다(presetId는 "custom"으로 바뀐다).
 */
export type EnvelopeDistort = {
  version: 1;
  mode: EnvelopeMode;
  presetId: string;
  /** 휘어짐 세기 -100..100 (부호 = 방향 반전). */
  bend: number;
  /** 가로 왜곡 -100..100 — 프리셋 오프셋에 곱해지는 추가 가로 배율(설계 §3.3). */
  hDistort: number;
  /** 세로 왜곡 -100..100 — 프리셋 오프셋에 곱해지는 추가 세로 배율. */
  vDistort: number;
  /** 가로 분할 수 1..4 (노드 열 = cols+1). */
  cols: number;
  /** 세로 분할 수 1..4 (노드 행 = rows+1). */
  rows: number;
  nodes: EnvelopeNodeOffset[];
};

/** 프리셋 정의 — offset(u,v,a)가 노드 오프셋을 만든다. a = bend/100 (-1..1). */
export type EnvelopePreset = {
  id: string;
  label: string;
  tip: string;
  offset: (u: number, v: number, a: number) => EnvelopeNodeOffset;
};

export const ENVELOPE_BEND_RANGE = { min: -100, max: 100, step: 1 } as const;
export const ENVELOPE_DISTORT_RANGE = { min: -100, max: 100, step: 1 } as const;
export const ENVELOPE_GRID_RANGE = { min: 1, max: 4, step: 1 } as const;
/** 노드 오프셋 클램프(정규화) — 박스 절반을 넘겨 드래그하면 접힘이 거의 확실해 제한한다. */
export const ENVELOPE_OFFSET_LIMIT = 0.6;
/** 이 값 이하의 최대 오프셋은 항등(왜곡 없음)으로 본다. */
export const ENVELOPE_IDENTITY_EPSILON = 1e-4;

const clamp = (n: number, min: number, max: number, fallback: number): number => {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
const clampBend = (n: unknown): number =>
  clamp(n as number, ENVELOPE_BEND_RANGE.min, ENVELOPE_BEND_RANGE.max, 0);
const clampDistort = (n: unknown): number =>
  clamp(n as number, ENVELOPE_DISTORT_RANGE.min, ENVELOPE_DISTORT_RANGE.max, 0);
const clampGrid = (n: unknown, fallback: number): number =>
  Math.round(clamp(n as number, ENVELOPE_GRID_RANGE.min, ENVELOPE_GRID_RANGE.max, fallback));
const clampOffset = (n: unknown): number => {
  const v = clamp(n as number, -ENVELOPE_OFFSET_LIMIT, ENVELOPE_OFFSET_LIMIT, 0);
  // -0 및 sin(π) 잔여 같은 극소값 정규화 — 0이어야 할 모서리가 -4.6e-17로 남는 것을 막는다.
  return Math.abs(v) < 1e-12 ? 0 : v;
};

// ---------------------------------------------------------------------------
// 프리셋 10종 — 제목 로고·SFX 레터링 연출 중심 (일러스트레이터 Warp 옵션의
// 웹툰 부분집합을 자체 공식으로 재구현; 코드·문구 복사 없음)
// ---------------------------------------------------------------------------

const SIN_PI = (t: number): number => Math.sin(Math.PI * t);

export const ENVELOPE_PRESETS: EnvelopePreset[] = [
  {
    id: "arch",
    label: "아치",
    tip: "가운데가 위로 볼록하게 솟아 제목 로고의 기본 아치를 만듭니다.",
    offset: (u, _v, a) => ({ dx: 0, dy: -SIN_PI(u) * 0.38 * a }),
  },
  {
    id: "arc-upper",
    label: "윗아치",
    tip: "윗변만 아치로 휘고 아랫변은 덜 따라와 글자가 위로 쏠린 느낌을 줍니다.",
    offset: (u, v, a) => ({ dx: 0, dy: -SIN_PI(u) * 0.38 * a * (1 - v * 0.7) }),
  },
  {
    id: "arc-lower",
    label: "아랫아치",
    tip: "아랫변이 더 휘어 글자가 아래로 처지듯 늘어나는 아치를 만듭니다.",
    offset: (u, v, a) => ({ dx: 0, dy: -SIN_PI(u) * 0.38 * a * (0.3 + v * 0.7) }),
  },
  {
    id: "bulge",
    label: "볼록",
    tip: "가운데가 상하좌우로 부풀어 터질 듯한 충격 효과음에 어울립니다.",
    offset: (u, v, a) => ({
      dx: (u - 0.5) * SIN_PI(v) * 0.3 * a,
      dy: -SIN_PI(u) * 0.18 * a + (v - 0.5) * SIN_PI(u) * 0.22 * a,
    }),
  },
  {
    id: "wave",
    label: "물결",
    tip: "글자가 물결처럼 출렁여 이동·떨림 효과음을 표현합니다.",
    offset: (u, _v, a) => ({ dx: 0, dy: Math.sin(2 * Math.PI * u) * 0.16 * a }),
  },
  {
    id: "flag",
    label: "깃발",
    tip: "행마다 위상이 어긋난 물결로 바람에 펄럭이는 깃발처럼 흔들립니다.",
    offset: (u, v, a) => ({ dx: 0, dy: Math.sin(2 * Math.PI * (u * 0.9 + v * 0.25)) * 0.15 * a }),
  },
  {
    id: "rise",
    label: "상승",
    tip: "오른쪽으로 갈수록 솟아올라 도약·상승 연출의 효과음에 맞습니다.",
    offset: (u, _v, a) => ({ dx: 0, dy: -u * 0.35 * a }),
  },
  {
    id: "squeeze",
    label: "쥐어짜기",
    tip: "가로 중간 높이가 안으로 오므라들어 압박·긴장감을 줍니다.",
    offset: (u, v, a) => ({ dx: (u - 0.5) * -SIN_PI(v) * 0.35 * a, dy: 0 }),
  },
  {
    id: "fisheye",
    label: "어안 볼록",
    tip: "중심이 밖으로 밀려나 돋보기로 본 듯 가운데 글자가 커 보입니다.",
    offset: (u, v, a) => {
      const dx = u - 0.5;
      const dy = v - 0.5;
      const r2 = dx * dx + dy * dy;
      const f = Math.max(0, 1 - r2 * 2) * 0.4 * a;
      return { dx: dx * f, dy: dy * f };
    },
  },
  {
    id: "perspective",
    label: "원근",
    tip: "오른쪽으로 갈수록 세로가 벌어져 소실점으로 빨려드는 원근감을 줍니다.",
    offset: (u, v, a) => ({ dx: 0, dy: (v - 0.5) * u * 0.45 * a }),
  },
  {
    id: "custom",
    label: "직접 편집",
    tip: "메시 노드를 직접 드래그한 자유 왜곡입니다.",
    offset: () => ({ dx: 0, dy: 0 }),
  },
];

const PRESET_BY_ID = new Map(ENVELOPE_PRESETS.map((p) => [p.id, p]));

/** 프리셋 id 조회 — 미상 id는 undefined (custom 포함, custom의 offset은 항등). */
export function envelopePresetById(id: string): EnvelopePreset | undefined {
  return PRESET_BY_ID.get(id);
}

// ---------------------------------------------------------------------------
// 생성·정규화·항등 판정
// ---------------------------------------------------------------------------

/** (cols,rows) 격자의 노드 rest 위치 — 행 우선 인덱스 i = row*(cols+1)+col. */
export function envelopeNodeRest(cols: number, rows: number, index: number): { u: number; v: number } {
  const perRow = cols + 1;
  const col = index % perRow;
  const row = Math.floor(index / perRow);
  return { u: cols === 0 ? 0 : col / cols, v: rows === 0 ? 0 : row / rows };
}

/** 프리셋 파라미터 → 노드 오프셋 배열. h/vDistort는 오프셋 축별 배율(1 + d/200, -50%..+50%). */
export function envelopePresetNodes(
  presetId: string,
  bend: number,
  hDistort: number,
  vDistort: number,
  cols: number,
  rows: number,
): EnvelopeNodeOffset[] {
  const preset = PRESET_BY_ID.get(presetId) ?? PRESET_BY_ID.get("arch")!;
  const a = clampBend(bend) / 100;
  const hScale = 1 + clampDistort(hDistort) / 200;
  const vScale = 1 + clampDistort(vDistort) / 200;
  const nodes: EnvelopeNodeOffset[] = [];
  const count = (cols + 1) * (rows + 1);
  for (let i = 0; i < count; i += 1) {
    const { u, v } = envelopeNodeRest(cols, rows, i);
    const o = preset.offset(u, v, a);
    nodes.push({ dx: clampOffset(o.dx * hScale), dy: clampOffset(o.dy * vScale) });
  }
  return nodes;
}

/** 기본 엔벨로프 — 아치 프리셋(bend 40), 3×2 격자. 패널을 열면 바로 보이는 시작값. */
export const DEFAULT_ENVELOPE: EnvelopeDistort = {
  version: 1,
  mode: "preset",
  presetId: "arch",
  bend: 40,
  hDistort: 0,
  vDistort: 0,
  cols: 3,
  rows: 2,
  nodes: envelopePresetNodes("arch", 40, 0, 0, 3, 2),
};

/**
 * 외부 입력/과거 저장본 안전장치 — 범위 클램프, 미상 프리셋은 arch,
 * 노드 수가 격자와 안 맞으면 프리셋으로 재생성(preset 모드)하거나 0으로 채운다(mesh 모드).
 */
export function normalizeEnvelope(e?: Partial<EnvelopeDistort> | null): EnvelopeDistort {
  const src = e && typeof e === "object" ? e : {};
  const cols = clampGrid(src.cols, DEFAULT_ENVELOPE.cols);
  const rows = clampGrid(src.rows, DEFAULT_ENVELOPE.rows);
  const presetId =
    typeof src.presetId === "string" && PRESET_BY_ID.has(src.presetId) ? src.presetId : "arch";
  const mode: EnvelopeMode = src.mode === "mesh" ? "mesh" : "preset";
  const bend = clampBend(src.bend ?? DEFAULT_ENVELOPE.bend);
  const hDistort = clampDistort(src.hDistort);
  const vDistort = clampDistort(src.vDistort);
  const count = (cols + 1) * (rows + 1);
  let nodes: EnvelopeNodeOffset[];
  if (Array.isArray(src.nodes) && src.nodes.length === count) {
    nodes = src.nodes.map((n) => ({
      dx: clampOffset((n as EnvelopeNodeOffset)?.dx),
      dy: clampOffset((n as EnvelopeNodeOffset)?.dy),
    }));
    // preset 모드인데 저장된 노드가 파라미터 재생성값과 다르면 파라미터가 정본이다.
    if (mode === "preset") nodes = envelopePresetNodes(presetId, bend, hDistort, vDistort, cols, rows);
  } else if (mode === "mesh") {
    nodes = Array.from({ length: count }, () => ({ dx: 0, dy: 0 }));
  } else {
    nodes = envelopePresetNodes(presetId, bend, hDistort, vDistort, cols, rows);
  }
  return { version: 1, mode, presetId, bend, hDistort, vDistort, cols, rows, nodes };
}

/** 왜곡이 사실상 없는지 — 전 노드 오프셋이 epsilon 이하. 렌더 생략·뱃지 판정에 쓴다. */
export function isIdentityEnvelope(e: EnvelopeDistort): boolean {
  return e.nodes.every(
    (n) => Math.abs(n.dx) <= ENVELOPE_IDENTITY_EPSILON && Math.abs(n.dy) <= ENVELOPE_IDENTITY_EPSILON,
  );
}

// ---------------------------------------------------------------------------
// 평가 — 쌍삼차 Catmull-Rom 곡면
// ---------------------------------------------------------------------------

/** Catmull-Rom 1차원 보간 — p1..p2 구간을 지나고 양끝 기울기는 이웃으로 결정된다. */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/**
 * 격자 밖 팬텀 노드의 오프셋 — 가장자리 두 노드의 기울기로 선형 외삽한다.
 * 가장자리 노드를 복제(클램프)하면 접선 기울기가 절반으로 꺾여 항등 격자에서도
 * 가장자리 셀이 0.1% 단위로 어긋난다(실측: u=0.3에서 0.2985). 외삽이면 선형 장(field)이
 * 정확히 재현되어 항등·균일 오프셋에서 왜곡이 0으로 떨어진다.
 */
function nodeOffsetAt(e: EnvelopeDistort, col: number, row: number): EnvelopeNodeOffset {
  const raw = (c: number, r: number): EnvelopeNodeOffset =>
    e.nodes[r * (e.cols + 1) + c] ?? { dx: 0, dy: 0 };
  // col 방향 외삽 (row는 범위 안이어야 한다)
  const exCol = (r: number): EnvelopeNodeOffset => {
    const cc = Math.min(e.cols, Math.max(0, col));
    const base = raw(cc, r);
    if (col === cc) return base;
    const d = Math.sign(col - cc);
    const nb = cc + d >= 0 && cc + d <= e.cols ? raw(cc + d, r) : null;
    const slope = nb
      ? { dx: nb.dx - base.dx, dy: nb.dy - base.dy }
      : { dx: base.dx - raw(cc - d, r).dx, dy: base.dy - raw(cc - d, r).dy };
    return { dx: base.dx + slope.dx * (col - cc), dy: base.dy + slope.dy * (col - cc) };
  };
  const rr = Math.min(e.rows, Math.max(0, row));
  const base = exCol(rr);
  if (row === rr) return base;
  const d = Math.sign(row - rr);
  const nb = rr + d >= 0 && rr + d <= e.rows ? exCol(rr + d) : null;
  const slope = nb
    ? { dx: nb.dx - base.dx, dy: nb.dy - base.dy }
    : { dx: base.dx - exCol(rr - d).dx, dy: base.dy - exCol(rr - d).dy };
  return { dx: base.dx + slope.dx * (row - rr), dy: base.dy + slope.dy * (row - rr) };
}

/** 격자 노드의 절대 위치(정규화) — rest(범위 밖이면 선형 연장) + 오프셋(외삽). */
function nodePosition(e: EnvelopeDistort, col: number, row: number): { x: number; y: number } {
  const n = nodeOffsetAt(e, col, row);
  return { x: col / e.cols + n.dx, y: row / e.rows + n.dy };
}

/**
 * 정규화 좌표 (u,v) ∈ [0,1]² 를 왜곡된 위치로 보낸다.
 * 셀을 찾고, 행 4개에 대해 u 방향 Catmull-Rom → 그 결과 4개를 v 방향으로 다시 보간한다.
 * 노드 위치에서는 정확히 노드 절대 위치를 반환한다(보간이 노드를 통과).
 */
export function sampleEnvelopePoint(e: EnvelopeDistort, u: number, v: number): { x: number; y: number } {
  const cu = clamp(u, 0, 1, 0);
  const cv = clamp(v, 0, 1, 0);
  const colFloat = cu * e.cols;
  const rowFloat = cv * e.rows;
  const c0 = Math.min(e.cols - 1, Math.floor(colFloat));
  const r0 = Math.min(e.rows - 1, Math.floor(rowFloat));
  const fu = colFloat - c0;
  const fv = rowFloat - r0;
  // 행 r0-1..r0+2 각각에서 u 방향 보간 → 중간점 4개 → v 방향 보간.
  const mid: { x: number; y: number }[] = [];
  for (let dr = -1; dr <= 2; dr += 1) {
    const row = r0 + dr;
    const p0 = nodePosition(e, c0 - 1, row);
    const p1 = nodePosition(e, c0, row);
    const p2 = nodePosition(e, c0 + 1, row);
    const p3 = nodePosition(e, c0 + 2, row);
    mid.push({
      x: catmullRom(p0.x, p1.x, p2.x, p3.x, fu),
      y: catmullRom(p0.y, p1.y, p2.y, p3.y, fu),
    });
  }
  return {
    x: catmullRom(mid[0]!.x, mid[1]!.x, mid[2]!.x, mid[3]!.x, fv),
    y: catmullRom(mid[0]!.y, mid[1]!.y, mid[2]!.y, mid[3]!.y, fv),
  };
}

/** 요소 로컬 px 점 (x,y) ∈ [0,width]×[0,height] 를 왜곡한다. width/height ≤ 0이면 원점 반환. */
export function warpEnvelopePoint(
  e: EnvelopeDistort,
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  if (!(width > 0) || !(height > 0)) return { x: 0, y: 0 };
  const p = sampleEnvelopePoint(e, x / width, y / height);
  return { x: p.x * width, y: p.y * height };
}

/**
 * 접힘(fold-over) 검사 — 샘플 격자(8×8)의 각 셀에서 연속 변 벡터의 외적 부호가 뒤집히면
 * 곡면이 스스로 접힌 것이다. 차단은 하지 않고 패널 경고 뱃지용으로만 쓴다(설계 §5).
 */
export function envelopeHasFold(e: EnvelopeDistort): boolean {
  const N = 8;
  const pts: { x: number; y: number }[][] = [];
  for (let r = 0; r <= N; r += 1) {
    const row: { x: number; y: number }[] = [];
    for (let c = 0; c <= N; c += 1) row.push(sampleEnvelopePoint(e, c / N, r / N));
    pts.push(row);
  }
  for (let r = 0; r < N; r += 1) {
    for (let c = 0; c < N; c += 1) {
      const a = pts[r]![c]!;
      const b = pts[r]![c + 1]!;
      const d = pts[r + 1]![c]!;
      const cross = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
      if (cross <= 0) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 편집 연산 — 전부 불변(새 객체 반환), 참조 안정성 관례는 puppet-warp와 동일
// ---------------------------------------------------------------------------

/** 프리셋/파라미터 적용 — 노드를 재생성하고 mode를 preset으로 되돌린다. */
export function applyEnvelopePreset(
  e: EnvelopeDistort,
  patch: Partial<Pick<EnvelopeDistort, "presetId" | "bend" | "hDistort" | "vDistort">>,
): EnvelopeDistort {
  const next = normalizeEnvelope({ ...e, ...patch, mode: "preset" });
  return { ...next, nodes: envelopePresetNodes(next.presetId, next.bend, next.hDistort, next.vDistort, next.cols, next.rows) };
}

/**
 * 노드 1개 드래그 — 오프셋을 (dx,dy)로 설정(절대값, 정규화)하고 mode를 mesh로 전환한다.
 * preset 모드에서 드래그하면 현재 노드를 동결한 채 mesh가 되는 일러스트레이터 동작과 같다.
 * 없는 인덱스·무변화면 기존 객체를 그대로 반환한다.
 */
export function moveEnvelopeNode(
  e: EnvelopeDistort,
  index: number,
  dx: number,
  dy: number,
): EnvelopeDistort {
  if (!Number.isInteger(index) || index < 0 || index >= e.nodes.length) return e;
  const ndx = clampOffset(dx);
  const ndy = clampOffset(dy);
  const cur = e.nodes[index]!;
  if (cur.dx === ndx && cur.dy === ndy && e.mode === "mesh") return e;
  const nodes = e.nodes.map((n, i) => (i === index ? { dx: ndx, dy: ndy } : n));
  return { ...e, mode: "mesh", presetId: "custom", nodes };
}

/** 노드 1개 초기화 — 오프셋만 0으로(위치·개수는 유지). */
export function resetEnvelopeNode(e: EnvelopeDistort, index: number): EnvelopeDistort {
  return moveEnvelopeNode({ ...e, mode: "mesh", presetId: "custom" }, index, 0, 0);
}

/** 전체 초기화 — 파라미터는 유지하고 노드를 항등으로. preset 모드면 bend 0과 같다. */
export function resetEnvelope(e: EnvelopeDistort): EnvelopeDistort {
  return {
    ...e,
    mode: "mesh",
    presetId: "custom",
    nodes: e.nodes.map(() => ({ dx: 0, dy: 0 })),
  };
}

/**
 * 격자 해상도 변경 — 기존 곡면을 새 노드 위치에서 샘플해 오프셋을 재유도하므로
 * 해상도를 바꿔도 눈에 보이는 모양이 (보간 오차 내에서) 유지된다.
 */
export function resampleEnvelopeGrid(e: EnvelopeDistort, cols: number, rows: number): EnvelopeDistort {
  const nc = clampGrid(cols, e.cols);
  const nr = clampGrid(rows, e.rows);
  if (nc === e.cols && nr === e.rows) return e;
  const nodes: EnvelopeNodeOffset[] = [];
  const count = (nc + 1) * (nr + 1);
  for (let i = 0; i < count; i += 1) {
    const { u, v } = envelopeNodeRest(nc, nr, i);
    const p = sampleEnvelopePoint(e, u, v);
    nodes.push({ dx: clampOffset(p.x - u), dy: clampOffset(p.y - v) });
  }
  return { ...e, mode: "mesh", presetId: "custom", cols: nc, rows: nr, nodes };
}

// ---------------------------------------------------------------------------
// 패스 적용 — SVG path data (M/L/Q/C/Z, 절대 좌표) 전용
// 입력 규약은 studio-text-vector-bake.ts의 출력과 같다. 곡선은 구간을 나눠
// 왜곡한 폴리라인(L)으로 근사한다 — 셀 크기 기준 분할이라 오차가 셀 안에 갇힌다.
// ---------------------------------------------------------------------------

type PathCmd =
  | { t: "M" | "L"; x: number; y: number }
  | { t: "Q"; x1: number; y1: number; x: number; y: number }
  | { t: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { t: "Z" };

const fmt = (n: number): string => {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 100) / 100 + 0;
  return rounded.toFixed(2).replace(/\.?0+$/, "");
};

/** path data 토큰화·파싱 — 지원하지 않는 커맨드/상대 좌표가 있으면 throw (호출자가 폴백). */
export function parseEnvelopePathData(data: string): PathCmd[] {
  const tokens = data.match(/[MLQCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const cmds: PathCmd[] = [];
  let i = 0;
  const num = (): number => {
    const v = Number(tokens[i]);
    i += 1;
    if (!Number.isFinite(v)) throw new Error("envelope: invalid path number");
    return v;
  };
  while (i < tokens.length) {
    const t = tokens[i]!;
    i += 1;
    if (t === "M" || t === "L") {
      const x = num();
      const y = num();
      cmds.push({ t, x, y });
    } else if (t === "Q") {
      const x1 = num();
      const y1 = num();
      const x = num();
      const y = num();
      cmds.push({ t, x1, y1, x, y });
    } else if (t === "C") {
      const x1 = num();
      const y1 = num();
      const x2 = num();
      const y2 = num();
      const x = num();
      const y = num();
      cmds.push({ t, x1, y1, x2, y2, x, y });
    } else if (t === "Z" || t === "z") {
      cmds.push({ t: "Z" });
    } else {
      throw new Error(`envelope: unsupported path command "${t}"`);
    }
  }
  return cmds;
}

const quadAt = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  t: number,
): { x: number; y: number } => {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
};

const cubicAt = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
): { x: number; y: number } => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};

/**
 * 패스 전체를 엔벨로프로 왜곡한다. bounds는 패스가 사는 로컬 박스(텍스트 베이크 bounds 또는
 * 요소 박스) — 정규화 기준이다. 항등 엔벨로프면 입력을 그대로 반환한다(문자열 보존).
 * 구간 분할 수: ceil(구간 길이 / 셀 크기), 직선 1..16, 곡선 4..24로 클램프.
 */
export function warpEnvelopePathData(
  e: EnvelopeDistort,
  data: string,
  bounds: { width: number; height: number },
): string {
  if (isIdentityEnvelope(e)) return data;
  if (!(bounds.width > 0) || !(bounds.height > 0)) return data;
  const cell = Math.max(1, Math.min(bounds.width / e.cols, bounds.height / e.rows));
  const cmds = parseEnvelopePathData(data);
  const out: string[] = [];
  let cur = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  const W = (p: { x: number; y: number }): { x: number; y: number } =>
    warpEnvelopePoint(e, p.x, p.y, bounds.width, bounds.height);
  const emitLineToWarped = (p: { x: number; y: number }): void => {
    const w = W(p);
    out.push(`L${fmt(w.x)} ${fmt(w.y)}`);
  };
  for (const cmd of cmds) {
    if (cmd.t === "M") {
      const w = W(cmd);
      out.push(`M${fmt(w.x)} ${fmt(w.y)}`);
      cur = { x: cmd.x, y: cmd.y };
      start = cur;
    } else if (cmd.t === "L") {
      const end = { x: cmd.x, y: cmd.y };
      const len = Math.hypot(end.x - cur.x, end.y - cur.y);
      const steps = Math.min(16, Math.max(1, Math.ceil(len / cell)));
      for (let s = 1; s <= steps; s += 1) {
        const t = s / steps;
        emitLineToWarped({ x: cur.x + (end.x - cur.x) * t, y: cur.y + (end.y - cur.y) * t });
      }
      cur = end;
    } else if (cmd.t === "Q") {
      const p1 = { x: cmd.x1, y: cmd.y1 };
      const end = { x: cmd.x, y: cmd.y };
      const approxLen = Math.hypot(p1.x - cur.x, p1.y - cur.y) + Math.hypot(end.x - p1.x, end.y - p1.y);
      const steps = Math.min(24, Math.max(4, Math.ceil(approxLen / cell)));
      for (let s = 1; s <= steps; s += 1) emitLineToWarped(quadAt(cur, p1, end, s / steps));
      cur = end;
    } else if (cmd.t === "C") {
      const p1 = { x: cmd.x1, y: cmd.y1 };
      const p2 = { x: cmd.x2, y: cmd.y2 };
      const end = { x: cmd.x, y: cmd.y };
      const approxLen =
        Math.hypot(p1.x - cur.x, p1.y - cur.y) +
        Math.hypot(p2.x - p1.x, p2.y - p1.y) +
        Math.hypot(end.x - p2.x, end.y - p2.y);
      const steps = Math.min(24, Math.max(4, Math.ceil(approxLen / cell)));
      for (let s = 1; s <= steps; s += 1) emitLineToWarped(cubicAt(cur, p1, p2, end, s / steps));
      cur = end;
    } else {
      out.push("Z");
      cur = start;
    }
  }
  return out.join("");
}
