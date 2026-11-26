/**
 * 자동 3D 메시 토폴로지·법선 치유기, 온디바이스 1줄 시맨틱 씬 컴포저,
 * 그리고 컨텍스트 인식 우선순위 CRDT (₩0 로컬 실행).
 *
 * - `healMeshTopologyAndNormals` / `inspectMeshTopologyDefects`(`./mesh-topology-healer` 재수출)
 * - `composeSemanticSceneOffline`: 한국어·영어 1줄 프롬프트를 AI 토큰 0개로 해석해
 *   3D 스테이지·조명 리그·카메라 구도·바닥 접지(Y=0) 에셋 배치를 구조화한다.
 * - `ContextAwarePriorityCrdt`: `active-ink-stroke > dialogue-balloon > camera-rail >
 *   background-prop` 동적 우선순위 레인으로 병합·스케줄링하며, 교환·결합·멱등 전순서
 *   조인 반격자(join-semilattice)로 모든 피어의 결정론적 동일 수렴을 보장한다.
 */

export {
  healMeshTopologyAndNormals,
  inspectMeshTopologyDefects,
  type HealedTriangleMesh,
  type MeshDefectMetrics,
  type MeshHealOptions,
  type MeshHealResult,
  type MeshHealSummary,
  type RawTriangleMesh,
} from "./mesh-topology-healer";

export type SemanticStageId =
  | "alley-cyberpunk"
  | "rooftop-school"
  | "cafe-atelier"
  | "forest-shrine"
  | "palace-fantasy"
  | "city-street"
  | "minimal-stage";

export type SemanticWeatherKind = "clear" | "rain" | "snow" | "fog";
export type SemanticTimeOfDay = "dawn" | "daylight" | "sunset" | "night";
export type SemanticCameraAngle = "eye-level" | "low-angle" | "high-angle" | "dutch-tilt";
export type SemanticShotScale = "extreme-closeup" | "medium-shot" | "wide-shot";

export interface SemanticLightSpec {
  readonly role: "key" | "fill" | "rim" | "neon-accent";
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly intensity: number;
  readonly colorTemperatureK: number;
  readonly oklchCss: string;
}

export interface SemanticCameraSpec {
  readonly shotScale: SemanticShotScale;
  readonly angle: SemanticCameraAngle;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fovDeg: number;
  readonly rollDeg: number;
  readonly dofAperture: number;
}

export interface SemanticSceneAsset {
  readonly id: string;
  readonly category: "actor" | "architecture" | "prop" | "vfx";
  readonly assetType: string;
  readonly labelKo: string;
  readonly position: readonly [number, number, number];
  readonly rotationYDeg: number;
  readonly scaleMeters: readonly [number, number, number];
}

export interface ComposedSemanticScene {
  readonly prompt: string;
  readonly localeDetected: "ko" | "en" | "mixed";
  readonly stageId: SemanticStageId;
  readonly weather: SemanticWeatherKind;
  readonly timeOfDay: SemanticTimeOfDay;
  readonly camera: SemanticCameraSpec;
  readonly lights: readonly SemanticLightSpec[];
  readonly fogDensity: number;
  readonly exposureEv: number;
  readonly assets: readonly SemanticSceneAsset[];
  readonly screentoneHintKo: string;
  readonly tokenCost: 0;
  readonly parseDurationMs: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function includesAny(text: string, terms: readonly string[]): boolean {
  for (let i = 0; i < terms.length; i += 1) {
    if (text.includes(terms[i])) return true;
  }
  return false;
}

/** 한국어·영어 1줄 프롬프트를 오프라인(0 토큰)으로 해석해 3D 스테이지·조명·카메라·에셋을 구성한다. */
export function composeSemanticSceneOffline(prompt: string): ComposedSemanticScene {
  const startMs = nowMs();
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  const hasKo = /[\uac00-\ud7a3]/.test(trimmed);
  const hasEn = /[a-z]/i.test(trimmed);
  const localeDetected: "ko" | "en" | "mixed" = hasKo && hasEn ? "mixed" : hasKo ? "ko" : "en";

  let stageId: SemanticStageId = "minimal-stage";
  if (includesAny(lower, ["골목", "네온", "뒷골목", "사이버펑크", "alley", "cyberpunk", "neon"])) {
    stageId = "alley-cyberpunk";
  } else if (includesAny(lower, ["옥상", "학교", "교실", "복도", "rooftop", "school", "classroom"])) {
    stageId = "rooftop-school";
  } else if (includesAny(lower, ["카페", "작업실", "아틀리에", "실내", "cafe", "studio", "atelier"])) {
    stageId = "cafe-atelier";
  } else if (includesAny(lower, ["숲", "신사", "고목", "산길", "forest", "shrine", "woods"])) {
    stageId = "forest-shrine";
  } else if (includesAny(lower, ["궁전", "성", "판타지", "던전", "왕좌", "palace", "castle", "dungeon"])) {
    stageId = "palace-fantasy";
  } else if (includesAny(lower, ["거리", "도심", "횡단보도", "역", "street", "downtown", "station"])) {
    stageId = "city-street";
  }

  let weather: SemanticWeatherKind = "clear";
  if (includesAny(lower, ["비", "빗속", "폭우", "장마", "우산", "rain", "rainy", "storm", "wet"])) {
    weather = "rain";
  } else if (includesAny(lower, ["눈", "설원", "함박눈", "snow", "blizzard"])) {
    weather = "snow";
  } else if (includesAny(lower, ["안개", "해무", "fog", "mist", "haze"])) {
    weather = "fog";
  }

  let timeOfDay: SemanticTimeOfDay = "daylight";
  if (includesAny(lower, ["밤", "야경", "심야", "느와르", "네온", "night", "noir", "midnight"])) {
    timeOfDay = "night";
  } else if (includesAny(lower, ["해질녘", "노을", "석양", "황혼", "sunset", "dusk", "golden hour"])) {
    timeOfDay = "sunset";
  } else if (includesAny(lower, ["새벽", "여명", "이른 아침", "dawn", "sunrise"])) {
    timeOfDay = "dawn";
  }

  let angle: SemanticCameraAngle = "eye-level";
  if (includesAny(lower, ["로우앵글", "로우 앵글", "앙각", "올려다보", "low-angle", "low angle"])) {
    angle = "low-angle";
  } else if (includesAny(lower, ["하이앵글", "하이 앵글", "부감", "내려다보", "high-angle", "high angle"])) {
    angle = "high-angle";
  } else if (includesAny(lower, ["더치", "기울어진", "사선 구도", "dutch", "tilted"])) {
    angle = "dutch-tilt";
  }

  let shotScale: SemanticShotScale = "medium-shot";
  if (includesAny(lower, ["클로즈업", "표정", "얼굴", "closeup", "close-up"])) {
    shotScale = "extreme-closeup";
  } else if (includesAny(lower, ["와이드", "전경", "풀샷", "광각", "wide", "establishing", "full shot"])) {
    shotScale = "wide-shot";
  }

  const distZ = shotScale === "extreme-closeup" ? 1.7 : shotScale === "wide-shot" ? 6.8 : 3.6;
  const camY = angle === "low-angle" ? 0.65 : angle === "high-angle" ? 3.8 : 1.55;
  const camera: SemanticCameraSpec = {
    shotScale,
    angle,
    position: [angle === "dutch-tilt" ? 0.9 : 0, camY, distZ],
    target: [0, shotScale === "extreme-closeup" ? 1.55 : 1.25, 0],
    fovDeg: shotScale === "wide-shot" ? 54 : shotScale === "extreme-closeup" ? 32 : 42,
    rollDeg: angle === "dutch-tilt" ? 12 : 0,
    dofAperture: shotScale === "extreme-closeup" ? 2.0 : shotScale === "wide-shot" ? 8.0 : 4.0,
  };

  const lights: SemanticLightSpec[] = [];
  if (timeOfDay === "night") {
    lights.push(
      { role: "key", azimuthDeg: 128, elevationDeg: 28, intensity: 1.45, colorTemperatureK: 4200, oklchCss: "oklch(0.760 0.085 238.0)" },
      { role: "fill", azimuthDeg: -52, elevationDeg: 18, intensity: 0.35, colorTemperatureK: 6800, oklchCss: "oklch(0.420 0.065 255.0)" },
      { role: "rim", azimuthDeg: -145, elevationDeg: 34, intensity: 1.85, colorTemperatureK: 5400, oklchCss: "oklch(0.820 0.145 198.0)" },
    );
    if (stageId === "alley-cyberpunk" || includesAny(lower, ["네온", "neon"])) {
      lights.push({
        role: "neon-accent", azimuthDeg: 74, elevationDeg: 16, intensity: 1.65,
        colorTemperatureK: 3100, oklchCss: "oklch(0.680 0.210 345.0)",
      });
    }
  } else if (timeOfDay === "sunset") {
    lights.push(
      { role: "key", azimuthDeg: 155, elevationDeg: 16, intensity: 2.1, colorTemperatureK: 3000, oklchCss: "oklch(0.780 0.165 52.0)" },
      { role: "fill", azimuthDeg: -35, elevationDeg: 40, intensity: 0.55, colorTemperatureK: 5800, oklchCss: "oklch(0.620 0.065 268.0)" },
      { role: "rim", azimuthDeg: -165, elevationDeg: 14, intensity: 1.9, colorTemperatureK: 2700, oklchCss: "oklch(0.810 0.175 44.0)" },
    );
  } else if (timeOfDay === "dawn") {
    lights.push(
      { role: "key", azimuthDeg: 68, elevationDeg: 20, intensity: 1.5, colorTemperatureK: 4600, oklchCss: "oklch(0.840 0.075 78.0)" },
      { role: "fill", azimuthDeg: -110, elevationDeg: 45, intensity: 0.6, colorTemperatureK: 7200, oklchCss: "oklch(0.720 0.055 232.0)" },
      { role: "rim", azimuthDeg: 160, elevationDeg: 24, intensity: 0.9, colorTemperatureK: 5200, oklchCss: "oklch(0.880 0.050 92.0)" },
    );
  } else {
    lights.push(
      { role: "key", azimuthDeg: 45, elevationDeg: 55, intensity: 2.2, colorTemperatureK: 5600, oklchCss: "oklch(0.950 0.025 95.0)" },
      { role: "fill", azimuthDeg: -65, elevationDeg: 35, intensity: 0.85, colorTemperatureK: 6500, oklchCss: "oklch(0.850 0.030 235.0)" },
      { role: "rim", azimuthDeg: -150, elevationDeg: 40, intensity: 0.75, colorTemperatureK: 6000, oklchCss: "oklch(0.930 0.020 210.0)" },
    );
  }

  const stageLabels: Record<SemanticStageId, string> = {
    "alley-cyberpunk": "네온 뒷골목 아키텍처 모듈",
    "rooftop-school": "학교 옥상 난간·바닥 모듈",
    "cafe-atelier": "실내 아틀리에·카페 구조 모듈",
    "forest-shrine": "고목 숲길·석등 스테이지",
    "palace-fantasy": "석조 아치·궁전 회랑 스테이지",
    "city-street": "도심 횡단보도·보도블록 스테이지",
    "minimal-stage": "기본 스튜디오 무대 바닥",
  };
  const assets: SemanticSceneAsset[] = [
    {
      id: `stage-${stageId}`, category: "architecture", assetType: stageId,
      labelKo: stageLabels[stageId], position: [0, 0, 0], rotationYDeg: 0, scaleMeters: [12, 6, 16],
    },
  ];

  if (includesAny(lower, ["두 사람", "두 인물", "마주 선", "대치", "duo", "two characters"])) {
    assets.push(
      { id: "actor-lead-a", category: "actor", assetType: "humanoid-character", labelKo: "주인공 캐릭터 A", position: [-0.95, 0, 0], rotationYDeg: 78, scaleMeters: [0.55, 1.72, 0.4] },
      { id: "actor-lead-b", category: "actor", assetType: "humanoid-character", labelKo: "상대 캐릭터 B", position: [0.95, 0, 0], rotationYDeg: -78, scaleMeters: [0.55, 1.72, 0.4] },
    );
  } else if (includesAny(lower, ["주인공", "인물", "캐릭터", "빌런", "소녀", "소년", "hero", "character"])) {
    assets.push({
      id: "actor-hero", category: "actor", assetType: "humanoid-character", labelKo: "주인공 캐릭터",
      position: [0, 0, 0], rotationYDeg: 8, scaleMeters: [0.55, 1.72, 0.4],
    });
  }

  if (includesAny(lower, ["우산", "umbrella"])) {
    assets.push({
      id: "prop-umbrella", category: "prop", assetType: "umbrella-open", labelKo: "펼친 우산 소품",
      position: [0.15, 0, 0.08], rotationYDeg: -14, scaleMeters: [1.05, 1.95, 1.05],
    });
  }
  if (stageId === "alley-cyberpunk" || includesAny(lower, ["간판", "네온", "sign", "neon"])) {
    assets.push({
      id: "prop-neon-sign", category: "prop", assetType: "vertical-neon-signboard", labelKo: "세로형 네온 간판",
      position: [-2.8, 0, -3.2], rotationYDeg: 18, scaleMeters: [0.9, 3.6, 0.35],
    });
  }
  if (includesAny(lower, ["가로등", "벤치", "streetlamp", "bench"]) || stageId === "city-street") {
    assets.push({
      id: "prop-streetlamp", category: "prop", assetType: "urban-streetlamp", labelKo: "도시 가로등",
      position: [2.6, 0, -2.4], rotationYDeg: -22, scaleMeters: [0.45, 4.4, 0.45],
    });
  }
  if (weather === "rain") {
    assets.push({
      id: "vfx-rain-sheets", category: "vfx", assetType: "rain-streak-sheet",
      labelKo: "빗줄기·바닥 물웅덩이 반사 레이어", position: [0, 0, -1.0], rotationYDeg: 0, scaleMeters: [10, 6, 10],
    });
  } else if (weather === "snow") {
    assets.push({
      id: "vfx-snow-particles", category: "vfx", assetType: "snow-drift-volume",
      labelKo: "눈발 파티클 볼륨", position: [0, 0, -1.0], rotationYDeg: 0, scaleMeters: [10, 6, 10],
    });
  }

  return {
    prompt: trimmed,
    localeDetected,
    stageId,
    weather,
    timeOfDay,
    camera,
    lights,
    fogDensity: weather === "fog" ? 0.065 : weather === "rain" ? 0.028 : timeOfDay === "night" ? 0.018 : 0.004,
    exposureEv: timeOfDay === "night" ? -0.6 : timeOfDay === "sunset" ? -0.15 : 0.25,
    assets,
    screentoneHintKo:
      timeOfDay === "night" && weather === "rain"
        ? "짙은 먹그림자 + 사선 빗줄기 화이트 라인 + 65LPI 그라데이션 톤 권장"
        : timeOfDay === "sunset"
          ? "따뜻한 역광 림 하이라이트 + 55LPI 부드러운 그림자 톤 권장"
          : "깔끔한 윤곽선(LT) + 중간 대비 60LPI 기본 톤 권장",
    tokenCost: 0,
    parseDurationMs: nowMs() - startMs,
  };
}

/* -------------------------------------------------------------------------- */
/*  Context-Aware Priority CRDT (Dynamic Priority Lanes + ACI Convergence)    */
/* -------------------------------------------------------------------------- */

export type CrdtPriorityLane =
  | "active-ink-stroke"
  | "dialogue-balloon"
  | "camera-rail"
  | "background-prop";

export const CRDT_LANE_BASE_PRIORITY: Record<CrdtPriorityLane, number> = {
  "active-ink-stroke": 400,
  "dialogue-balloon": 300,
  "camera-rail": 200,
  "background-prop": 100,
};

export type CrdtScalar = string | number | boolean | null;
export type CrdtValue = CrdtScalar | readonly CrdtScalar[] | Readonly<Record<string, CrdtScalar>>;

export interface PriorityCrdtOp {
  readonly opId: string;
  readonly entityId: string;
  readonly field: string;
  readonly lane: CrdtPriorityLane;
  readonly priorityBoost: number;
  readonly effectivePriority: number;
  readonly epoch: number;
  readonly lamport: number;
  readonly peerId: string;
  readonly value: CrdtValue;
}

export interface CreateCrdtOpInput {
  readonly entityId: string;
  readonly field: string;
  readonly lane: CrdtPriorityLane;
  readonly value: CrdtValue;
  readonly priorityBoost?: number;
  readonly epoch?: number;
}

export interface CrdtApplyOutcome {
  readonly opId: string;
  readonly accepted: boolean;
  readonly deduplicated: boolean;
  readonly conflicted: boolean;
  readonly preemptedByPriority: boolean;
  readonly winnerOpId: string;
}

export interface CrdtTelemetry {
  readonly peerId: string;
  readonly lamportClock: number;
  readonly registerCount: number;
  readonly pendingQueueLength: number;
  readonly totalAppliedOps: number;
  readonly deduplicatedOps: number;
  readonly conflictCount: number;
  readonly priorityPreemptions: number;
  readonly perLaneAppliedCounts: Readonly<Record<CrdtPriorityLane, number>>;
  readonly perLaneConflictWins: Readonly<Record<CrdtPriorityLane, number>>;
  readonly stateDigest: string;
}

function registerKey(entityId: string, field: string): string {
  return `${entityId}\u0000${field}`;
}

/** 교환·결합·멱등 전순서 비교(`epoch → effectivePriority → lamport → peerId → opId`). */
export function comparePriorityCrdtOps(a: PriorityCrdtOp, b: PriorityCrdtOp): number {
  if (a.epoch !== b.epoch) return a.epoch - b.epoch;
  if (a.effectivePriority !== b.effectivePriority) return a.effectivePriority - b.effectivePriority;
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  if (a.peerId !== b.peerId) return a.peerId < b.peerId ? -1 : 1;
  if (a.opId !== b.opId) return a.opId < b.opId ? -1 : 1;
  return 0;
}

function fnv1aHex(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul((h ^ (text.charCodeAt(i) & 0xff)) >>> 0, 0x01000193) >>> 0;
    h = Math.imul((h ^ ((text.charCodeAt(i) >>> 8) & 0xff)) >>> 0, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function createZeroLaneCounter(): Record<CrdtPriorityLane, number> {
  return { "active-ink-stroke": 0, "dialogue-balloon": 0, "camera-rail": 0, "background-prop": 0 };
}

/** 컨텍스트 인식 동적 우선순위 CRDT 레플리카. */
export class ContextAwarePriorityCrdt {
  public readonly peerId: string;
  private lamportClock = 0;
  private localSeq = 0;

  private readonly registers = new Map<string, PriorityCrdtOp>();
  private readonly seenOpIds = new Set<string>();
  private readonly pendingQueue: PriorityCrdtOp[] = [];

  private totalAppliedOps = 0;
  private deduplicatedOps = 0;
  private conflictCount = 0;
  private priorityPreemptions = 0;
  private readonly perLaneAppliedCounts = createZeroLaneCounter();
  private readonly perLaneConflictWins = createZeroLaneCounter();

  public constructor(peerId: string) {
    if (peerId.trim().length === 0) throw new Error("CRDT 피어 ID는 비어 있을 수 없습니다.");
    this.peerId = peerId;
  }

  public createLocalOp(input: CreateCrdtOpInput): PriorityCrdtOp {
    this.lamportClock += 1;
    this.localSeq += 1;
    const priorityBoost = clamp(Math.round(input.priorityBoost ?? 0), 0, 49);
    return {
      opId: `${this.peerId}:${this.lamportClock}:${this.localSeq}`,
      entityId: input.entityId,
      field: input.field,
      lane: input.lane,
      priorityBoost,
      effectivePriority: CRDT_LANE_BASE_PRIORITY[input.lane] + priorityBoost,
      epoch: Math.max(0, Math.round(input.epoch ?? 0)),
      lamport: this.lamportClock,
      peerId: this.peerId,
      value: input.value,
    };
  }

  public enqueueOp(op: PriorityCrdtOp): void {
    this.pendingQueue.push(op);
  }

  /** 대기 중인 연산을 우선순위 레인 내림차순(`active-ink-stroke` 최우선)으로 실행·병합한다. */
  public drainPriorityQueue(maxOps?: number): readonly PriorityCrdtOp[] {
    if (this.pendingQueue.length === 0) return [];
    this.pendingQueue.sort((a, b) => {
      if (b.effectivePriority !== a.effectivePriority) return b.effectivePriority - a.effectivePriority;
      if (a.lamport !== b.lamport) return a.lamport - b.lamport;
      if (a.peerId !== b.peerId) return a.peerId < b.peerId ? -1 : 1;
      return a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0;
    });
    const limit = maxOps === undefined ? this.pendingQueue.length : Math.min(maxOps, this.pendingQueue.length);
    const batch = this.pendingQueue.splice(0, limit);
    for (let i = 0; i < batch.length; i += 1) this.applyOp(batch[i]);
    return batch;
  }

  /** 단일 연산을 레지스터에 멱등·결정론적으로 적용한다. */
  public applyOp(op: PriorityCrdtOp): CrdtApplyOutcome {
    if (this.seenOpIds.has(op.opId)) {
      this.deduplicatedOps += 1;
      const existing = this.registers.get(registerKey(op.entityId, op.field));
      return {
        opId: op.opId, accepted: false, deduplicated: true, conflicted: false,
        preemptedByPriority: false, winnerOpId: existing?.opId ?? op.opId,
      };
    }

    this.seenOpIds.add(op.opId);
    if (op.lamport > this.lamportClock) this.lamportClock = op.lamport;
    this.totalAppliedOps += 1;
    this.perLaneAppliedCounts[op.lane] += 1;

    const key = registerKey(op.entityId, op.field);
    const current = this.registers.get(key);
    if (!current) {
      this.registers.set(key, op);
      return {
        opId: op.opId, accepted: true, deduplicated: false, conflicted: false,
        preemptedByPriority: false, winnerOpId: op.opId,
      };
    }

    const cmp = comparePriorityCrdtOps(op, current);
    const conflicted = current.peerId !== op.peerId || current.lane !== op.lane;
    let preemptedByPriority = false;

    if (cmp > 0) {
      if (conflicted) {
        this.conflictCount += 1;
        this.perLaneConflictWins[op.lane] += 1;
        if (op.effectivePriority > current.effectivePriority && op.lamport <= current.lamport) {
          this.priorityPreemptions += 1;
          preemptedByPriority = true;
        }
      }
      this.registers.set(key, op);
      return {
        opId: op.opId, accepted: true, deduplicated: false, conflicted,
        preemptedByPriority, winnerOpId: op.opId,
      };
    }

    if (conflicted) {
      this.conflictCount += 1;
      this.perLaneConflictWins[current.lane] += 1;
      if (current.effectivePriority > op.effectivePriority && current.lamport <= op.lamport) {
        this.priorityPreemptions += 1;
        preemptedByPriority = true;
      }
    }
    return {
      opId: op.opId, accepted: false, deduplicated: false, conflicted,
      preemptedByPriority, winnerOpId: current.opId,
    };
  }

  public mergeRemoteOps(ops: readonly PriorityCrdtOp[]): readonly CrdtApplyOutcome[] {
    const outcomes: CrdtApplyOutcome[] = [];
    for (let i = 0; i < ops.length; i += 1) outcomes.push(this.applyOp(ops[i]));
    return outcomes;
  }

  public mergeFromPeer(other: ContextAwarePriorityCrdt): readonly CrdtApplyOutcome[] {
    return this.mergeRemoteOps(other.exportStateOps());
  }

  public getRegister(entityId: string, field: string): PriorityCrdtOp | undefined {
    return this.registers.get(registerKey(entityId, field));
  }

  public exportStateOps(): readonly PriorityCrdtOp[] {
    const entries: PriorityCrdtOp[] = [];
    this.registers.forEach((op) => entries.push(op));
    entries.sort((a, b) => {
      if (a.entityId !== b.entityId) return a.entityId < b.entityId ? -1 : 1;
      if (a.field !== b.field) return a.field < b.field ? -1 : 1;
      return comparePriorityCrdtOps(a, b);
    });
    return entries;
  }

  public computeStateDigest(): string {
    const ops = this.exportStateOps();
    const parts: string[] = [];
    for (let i = 0; i < ops.length; i += 1) {
      const o = ops[i];
      parts.push(
        `${o.entityId}|${o.field}|${o.opId}|${o.lane}|${o.effectivePriority}|${o.epoch}|${JSON.stringify(o.value)}`,
      );
    }
    return fnv1aHex(parts.join("\n"));
  }

  public getTelemetry(): CrdtTelemetry {
    return {
      peerId: this.peerId,
      lamportClock: this.lamportClock,
      registerCount: this.registers.size,
      pendingQueueLength: this.pendingQueue.length,
      totalAppliedOps: this.totalAppliedOps,
      deduplicatedOps: this.deduplicatedOps,
      conflictCount: this.conflictCount,
      priorityPreemptions: this.priorityPreemptions,
      perLaneAppliedCounts: { ...this.perLaneAppliedCounts },
      perLaneConflictWins: { ...this.perLaneConflictWins },
      stateDigest: this.computeStateDigest(),
    };
  }
}
