/**
 * 결정론적 캔버스 상태 퍼저·불변식 검증기(Deterministic Canvas State Fuzzer & Invariant Checker) 및
 * 무손실 색각 이상(CVD) 이중 목적 달토나이저(Bi-Objective Daltonizer).
 *
 * - 시드 고정 PRNG(`xoshiro128**` / `mulberry32`)로 수천 단계의 드로잉·지우기·레이어 순서 변경·
 *   실행 취소/다시 실행·오프라인 단절/재연결·CRDT 병합 시퀀스를 생성하고 4대 불변식(레이어 ID 무손실,
 *   리비전 단조 증가, Undo-Redo 멱등성, CRDT 수렴) 검증 및 최소 반례 축소(Shrinking)를 수행한다.
 * - 적색맹(Protanopia)·녹색맹(Deuteranopia)·청색맹(Tritanopia) 시뮬레이션과 OKLCH 명도/색상 최적화를
 *   결합해 최소 지각 대비(`ΔE_OK >= threshold`) 확보와 원작 색감 보존(`min ΔE_orig`)을 동시에 달성한다.
 */

export type PrngAlgorithm = "xoshiro128**" | "mulberry32";
export type ReplicaRole = "local" | "peer";
export type InvariantKind = "no-lost-layer-ids" | "monotonic-revision" | "undo-redo-idempotency" | "crdt-state-convergence";
export type CvdDeficiencyKind = "protanopia" | "deuteranopia" | "tritanopia";
export type CvdTargetMode = CvdDeficiencyKind | "all-dichromats";
export type SrgbColor8 = readonly [number, number, number];

export interface SeededPrng {
  readonly algorithm: PrngAlgorithm;
  nextUint32(): number;
  nextFloat01(): number;
  nextInt(minInclusive: number, maxInclusive: number): number;
}

export type CanvasFuzzCommand =
  | { readonly kind: "add-layer"; readonly replica: ReplicaRole; readonly layerId: string; readonly orderKey: number }
  | { readonly kind: "draw-stroke"; readonly replica: ReplicaRole; readonly layerId: string; readonly strokeId: string; readonly checksum: number }
  | { readonly kind: "erase-stroke"; readonly replica: ReplicaRole; readonly layerId: string; readonly strokeId: string }
  | { readonly kind: "reorder-layer"; readonly replica: ReplicaRole; readonly layerId: string; readonly orderKey: number }
  | { readonly kind: "undo"; readonly replica: "local" }
  | { readonly kind: "redo"; readonly replica: "local" }
  | { readonly kind: "offline-partition" }
  | { readonly kind: "offline-reconnect" }
  | { readonly kind: "crdt-merge" };

export interface CrdtStrokeRecord {
  readonly strokeId: string; readonly layerId: string; readonly checksum: number;
  readonly active: boolean; readonly lamport: number; readonly author: ReplicaRole;
}
export interface CrdtLayerRecord {
  readonly layerId: string; readonly orderKey: number;
  readonly orderLamport: number; readonly orderAuthor: ReplicaRole;
  readonly strokes: ReadonlyMap<string, CrdtStrokeRecord>;
}
export interface CanvasReplicaSnapshot {
  readonly replica: ReplicaRole; readonly revision: number; readonly lamportClock: number;
  readonly layers: ReadonlyMap<string, CrdtLayerRecord>;
  readonly activeLayerOrder: readonly string[]; readonly contentDigest: string;
}
export interface FuzzHarnessSnapshot {
  readonly local: CanvasReplicaSnapshot; readonly peer: CanvasReplicaSnapshot;
  readonly online: boolean; readonly syncedSinceLastMutation: boolean;
  readonly createdLayerIdsByReplica: Readonly<Record<ReplicaRole, ReadonlySet<string>>>;
}
export interface InvariantViolation {
  readonly invariant: InvariantKind; readonly stepIndex: number; readonly detailKo: string;
}
export type FuzzFaultInjector = (snapshot: FuzzHarnessSnapshot, command: CanvasFuzzCommand, stepIndex: number) => FuzzHarnessSnapshot;

export interface CanvasFuzzCampaignOptions {
  readonly seed: number; readonly prngAlgorithm?: PrngAlgorithm;
  readonly sequenceCount?: number; readonly operationsPerSequence?: number;
  readonly faultInjector?: FuzzFaultInjector;
}
export interface CanvasFuzzCampaignReport {
  readonly seed: number; readonly prngAlgorithm: PrngAlgorithm;
  readonly totalSequencesRun: number; readonly totalOperationsExecuted: number;
  readonly allInvariantsPassed: boolean; readonly violation: InvariantViolation | null;
  readonly failingSequence: readonly CanvasFuzzCommand[] | null;
  readonly shrunkCounterexample: readonly CanvasFuzzCommand[] | null;
  readonly serverCostKrw: 0;
}

export interface OklabColor { readonly l: number; readonly a: number; readonly b: number }
export interface OklchColor { readonly l: number; readonly c: number; readonly hDeg: number }
export interface DaltonizePaletteOptions {
  readonly palette: readonly SrgbColor8[]; readonly targetMode?: CvdTargetMode;
  readonly severity?: number; readonly minCvdDeltaE?: number;
  readonly maxIterations?: number; readonly preserveAchromaticExtremes?: boolean;
}
export interface DaltonizePaletteResult {
  readonly originalPalette: readonly SrgbColor8[]; readonly daltonizedPalette: readonly SrgbColor8[];
  readonly simulatedBeforeMinDeltaE: number; readonly simulatedAfterMinDeltaE: number;
  readonly meanOriginalDriftDeltaE: number; readonly maxOriginalDriftDeltaE: number;
  readonly contrastSatisfied: boolean; readonly losslessSidecar: Uint8Array;
  readonly serverCostKrw: 0;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const rotl32 = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

function splitMix32Next(stateObj: { s: number }): number {
  stateObj.s = (stateObj.s + 0x9e3779b9) >>> 0;
  let z = Math.imul(stateObj.s ^ (stateObj.s >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

/** `mulberry32` 시드 고정 결정론적 난수 생성기를 생성한다. */
export function createMulberry32Prng(seed: number): SeededPrng {
  let state = seed >>> 0;
  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  };
  return {
    algorithm: "mulberry32",
    nextUint32,
    nextFloat01: () => nextUint32() / 4294967296,
    nextInt: (lo, hi) => lo + (nextUint32() % Math.max(1, hi - lo + 1)),
  };
}

/** `xoshiro128**` 시드 고정 결정론적 난수 생성기를 생성한다. */
export function createXoshiro128StarStarPrng(seed: number): SeededPrng {
  const sm = { s: seed >>> 0 };
  let s0 = splitMix32Next(sm); let s1 = splitMix32Next(sm);
  let s2 = splitMix32Next(sm); let s3 = splitMix32Next(sm);
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1;
  const nextUint32 = (): number => {
    const result = Math.imul(rotl32(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0; s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0; s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0; s3 = rotl32(s3, 11);
    return result;
  };
  return {
    algorithm: "xoshiro128**",
    nextUint32,
    nextFloat01: () => nextUint32() / 4294967296,
    nextInt: (lo, hi) => lo + (nextUint32() % Math.max(1, hi - lo + 1)),
  };
}

const lwwWins = (lamA: number, authA: ReplicaRole, lamB: number, authB: ReplicaRole): boolean =>
  lamA !== lamB ? lamA > lamB : authA === "peer" && authB === "local";

function computeReplicaDigest(layers: ReadonlyMap<string, CrdtLayerRecord>): { readonly order: readonly string[]; readonly digest: string } {
  const sorted = [...layers.values()].sort((a, b) => (a.orderKey !== b.orderKey ? a.orderKey - b.orderKey : a.layerId.localeCompare(b.layerId)));
  const parts = sorted.map((layer) => {
    const strokes = [...layer.strokes.values()].filter((s) => s.active).sort((a, b) => a.strokeId.localeCompare(b.strokeId)).map((s) => `${s.strokeId}=${s.checksum}`);
    return `${layer.layerId}@${layer.orderKey.toFixed(4)}[${strokes.join(",")}]`;
  });
  return { order: sorted.map((l) => l.layerId), digest: parts.join("|") };
}

function buildSnapshot(replica: ReplicaRole, revision: number, lamportClock: number, layers: ReadonlyMap<string, CrdtLayerRecord>): CanvasReplicaSnapshot {
  const { order, digest } = computeReplicaDigest(layers);
  return { replica, revision, lamportClock, layers, activeLayerOrder: order, contentDigest: digest };
}

/** 두 레플리카의 LWW-Element-Set CRDT 상태를 교환·결합·멱등이 보장되도록 병합한다. */
export function mergeCanvasReplicaPair(
  a: CanvasReplicaSnapshot, b: CanvasReplicaSnapshot,
): { readonly local: CanvasReplicaSnapshot; readonly peer: CanvasReplicaSnapshot } {
  const allIds = new Set<string>([...a.layers.keys(), ...b.layers.keys()]);
  const merged = new Map<string, CrdtLayerRecord>();
  for (const layerId of allIds) {
    const la = a.layers.get(layerId);
    const lb = b.layers.get(layerId);
    if (la && !lb) { merged.set(layerId, la); continue; }
    if (!la && lb) { merged.set(layerId, lb); continue; }
    const left = la!; const right = lb!;
    const leftWin = lwwWins(left.orderLamport, left.orderAuthor, right.orderLamport, right.orderAuthor);
    const strokes = new Map<string, CrdtStrokeRecord>(left.strokes);
    for (const [sId, rS] of right.strokes) {
      const lS = strokes.get(sId);
      if (!lS || lwwWins(rS.lamport, rS.author, lS.lamport, lS.author)) strokes.set(sId, rS);
    }
    merged.set(layerId, {
      layerId,
      orderKey: leftWin ? left.orderKey : right.orderKey,
      orderLamport: leftWin ? left.orderLamport : right.orderLamport,
      orderAuthor: leftWin ? left.orderAuthor : right.orderAuthor,
      strokes,
    });
  }
  const lam = Math.max(a.lamportClock, b.lamportClock) + 1;
  const rev = a.contentDigest === computeReplicaDigest(merged).digest ? Math.max(a.revision, b.revision) : Math.max(a.revision, b.revision) + 1;
  return { local: buildSnapshot("local", rev, lam, merged), peer: buildSnapshot("peer", rev, lam, merged) };
}

interface ReversibleAction {
  readonly runUndo: (liveSnap: CanvasReplicaSnapshot) => {
    readonly undone: CanvasReplicaSnapshot;
    readonly redoFn: (snap: CanvasReplicaSnapshot) => CanvasReplicaSnapshot;
    readonly undoFn: (snap: CanvasReplicaSnapshot) => CanvasReplicaSnapshot;
  };
  redoFn: (snap: CanvasReplicaSnapshot) => CanvasReplicaSnapshot;
}

/** 주어진 명령 시퀀스를 결정론적으로 실행하고 모든 스텝에서 4대 불변식을 검사한다. */
export function executeAndVerifyCanvasSequence(
  commands: readonly CanvasFuzzCommand[], faultInjector?: FuzzFaultInjector,
): { readonly violation: InvariantViolation | null; readonly finalState: FuzzHarnessSnapshot } {
  const baseLayers = new Map<string, CrdtLayerRecord>([
    ["layer-0", { layerId: "layer-0", orderKey: 10, orderLamport: 1, orderAuthor: "local", strokes: new Map() }],
    ["layer-1", { layerId: "layer-1", orderKey: 20, orderLamport: 1, orderAuthor: "local", strokes: new Map() }],
  ]);
  let state: FuzzHarnessSnapshot = {
    local: buildSnapshot("local", 1, 2, baseLayers),
    peer: buildSnapshot("peer", 1, 2, new Map(baseLayers)),
    online: true, syncedSinceLastMutation: true,
    createdLayerIdsByReplica: { local: new Set(["layer-0", "layer-1"]), peer: new Set(["layer-0", "layer-1"]) },
  };
  const undoStack: ReversibleAction[] = [];
  const redoStack: ReversibleAction[] = [];
  const mutateLayers = (
    snap: CanvasReplicaSnapshot, updater: (layers: Map<string, CrdtLayerRecord>, nextLam: number) => void,
  ): CanvasReplicaSnapshot => {
    const nextLam = snap.lamportClock + 1;
    const layers = new Map(snap.layers);
    updater(layers, nextLam);
    return buildSnapshot(snap.replica, snap.revision + 1, nextLam, layers);
  };

  for (let i = 0; i < commands.length; i += 1) {
    const cmd = commands[i]!;
    const prevLocalRev = state.local.revision;
    const prevPeerRev = state.peer.revision;

    if (cmd.kind === "offline-partition") {
      state = { ...state, online: false };
    } else if (cmd.kind === "offline-reconnect" || cmd.kind === "crdt-merge") {
      if (cmd.kind === "offline-reconnect" || state.online) {
        const m = mergeCanvasReplicaPair(state.local, state.peer);
        const union = new Set([...state.createdLayerIdsByReplica.local, ...state.createdLayerIdsByReplica.peer]);
        state = { local: m.local, peer: m.peer, online: true, syncedSinceLastMutation: true, createdLayerIdsByReplica: { local: new Set(union), peer: new Set(union) } };
      }
    } else if (cmd.kind === "undo") {
      const action = undoStack.pop();
      if (action) {
        const beforeDigest = state.local.contentDigest;
        const { undone, redoFn, undoFn } = action.runUndo(state.local);
        const redoneCheck = redoFn(undone);
        const undoneCheck = undoFn(redoneCheck);
        if (redoneCheck.contentDigest !== beforeDigest || undoneCheck.contentDigest !== undone.contentDigest) {
          return { violation: { invariant: "undo-redo-idempotency", stepIndex: i, detailKo: "Undo-Redo 왕복 다이제스트 불일치" }, finalState: state };
        }
        action.redoFn = redoFn;
        redoStack.push(action);
        state = { ...state, local: undone, syncedSinceLastMutation: false };
      }
    } else if (cmd.kind === "redo") {
      const action = redoStack.pop();
      if (action) {
        undoStack.push(action);
        state = { ...state, local: action.redoFn(state.local), syncedSinceLastMutation: false };
      }
    } else {
      const target = cmd.replica === "local" ? state.local : state.peer;
      let updated = target;
      const cLocal = new Set(state.createdLayerIdsByReplica.local);
      const cPeer = new Set(state.createdLayerIdsByReplica.peer);

      if (cmd.kind === "add-layer" && !target.layers.has(cmd.layerId)) {
        updated = mutateLayers(target, (layers, lam) => {
          layers.set(cmd.layerId, { layerId: cmd.layerId, orderKey: cmd.orderKey, orderLamport: lam, orderAuthor: cmd.replica, strokes: new Map() });
        });
        if (cmd.replica === "local") cLocal.add(cmd.layerId); else cPeer.add(cmd.layerId);
      } else if (cmd.kind === "reorder-layer") {
        const ex = target.layers.get(cmd.layerId);
        if (ex) {
          const prevOrderKey = ex.orderKey;
          const applyOrder = (key: number) => (s: CanvasReplicaSnapshot): CanvasReplicaSnapshot =>
            mutateLayers(s, (layers, lam) => {
              const cur = layers.get(cmd.layerId);
              if (cur) layers.set(cmd.layerId, { ...cur, orderKey: key, orderLamport: lam, orderAuthor: s.replica });
            });
          updated = applyOrder(cmd.orderKey)(target);
          if (cmd.replica === "local") {
            const undoFn = applyOrder(prevOrderKey);
            undoStack.push({
              redoFn: applyOrder(cmd.orderKey),
              runUndo: (liveSnap) => {
                const liveKey = liveSnap.layers.get(cmd.layerId)?.orderKey ?? cmd.orderKey;
                return { undone: undoFn(liveSnap), redoFn: applyOrder(liveKey), undoFn };
              },
            });
            redoStack.length = 0;
          }
        }
      } else if (cmd.kind === "draw-stroke") {
        const ex = target.layers.get(cmd.layerId);
        if (ex) {
          const prevActive = ex.strokes.get(cmd.strokeId)?.active ?? false;
          const prevChecksum = ex.strokes.get(cmd.strokeId)?.checksum ?? cmd.checksum;
          const applyStroke = (active: boolean, cs: number) => (s: CanvasReplicaSnapshot): CanvasReplicaSnapshot =>
            mutateLayers(s, (layers, lam) => {
              const cur = layers.get(cmd.layerId);
              if (!cur) return;
              const strokes = new Map(cur.strokes);
              strokes.set(cmd.strokeId, { strokeId: cmd.strokeId, layerId: cmd.layerId, checksum: cs, active, lamport: lam, author: s.replica });
              layers.set(cmd.layerId, { ...cur, strokes });
            });
          updated = applyStroke(true, cmd.checksum)(target);
          if (cmd.replica === "local") {
            const undoFn = applyStroke(prevActive, prevChecksum);
            undoStack.push({
              redoFn: applyStroke(true, cmd.checksum),
              runUndo: (liveSnap) => {
                const liveSt = liveSnap.layers.get(cmd.layerId)?.strokes.get(cmd.strokeId);
                return {
                  undone: undoFn(liveSnap),
                  redoFn: applyStroke(liveSt?.active ?? true, liveSt?.checksum ?? cmd.checksum),
                  undoFn,
                };
              },
            });
            redoStack.length = 0;
          }
        }
      } else if (cmd.kind === "erase-stroke") {
        const prevS = target.layers.get(cmd.layerId)?.strokes.get(cmd.strokeId);
        if (prevS?.active) {
          const restoredChecksum = prevS.checksum;
          const applyStroke = (active: boolean, cs: number) => (s: CanvasReplicaSnapshot): CanvasReplicaSnapshot =>
            mutateLayers(s, (layers, lam) => {
              const cur = layers.get(cmd.layerId);
              if (!cur) return;
              const strokes = new Map(cur.strokes);
              strokes.set(cmd.strokeId, { strokeId: cmd.strokeId, layerId: cmd.layerId, checksum: cs, active, lamport: lam, author: s.replica });
              layers.set(cmd.layerId, { ...cur, strokes });
            });
          updated = applyStroke(false, restoredChecksum)(target);
          if (cmd.replica === "local") {
            const undoFn = applyStroke(true, restoredChecksum);
            undoStack.push({
              redoFn: applyStroke(false, restoredChecksum),
              runUndo: (liveSnap) => {
                const liveSt = liveSnap.layers.get(cmd.layerId)?.strokes.get(cmd.strokeId);
                return {
                  undone: undoFn(liveSnap),
                  redoFn: applyStroke(liveSt?.active ?? false, liveSt?.checksum ?? restoredChecksum),
                  undoFn,
                };
              },
            });
            redoStack.length = 0;
          }
        }
      }
      state = {
        ...state,
        local: cmd.replica === "local" ? updated : state.local,
        peer: cmd.replica === "peer" ? updated : state.peer,
        syncedSinceLastMutation: false,
        createdLayerIdsByReplica: { local: cLocal, peer: cPeer },
      };
    }

    if (faultInjector) state = faultInjector(state, cmd, i);

    for (const role of ["local", "peer"] as const) {
      const snap = role === "local" ? state.local : state.peer;
      const orderSet = new Set(snap.activeLayerOrder);
      if (orderSet.size !== snap.activeLayerOrder.length) {
        return { violation: { invariant: "no-lost-layer-ids", stepIndex: i, detailKo: `${role} 레이어 순서 중복 ID 발생` }, finalState: state };
      }
      for (const id of state.createdLayerIdsByReplica[role]) {
        if (!orderSet.has(id) || !snap.layers.has(id)) {
          return { violation: { invariant: "no-lost-layer-ids", stepIndex: i, detailKo: `${role}에서 레이어 ${id} 유실` }, finalState: state };
        }
      }
    }
    if (state.local.revision < prevLocalRev || state.peer.revision < prevPeerRev) {
      return { violation: { invariant: "monotonic-revision", stepIndex: i, detailKo: "레플리카 리비전 역행 감지" }, finalState: state };
    }
    if (state.online && state.syncedSinceLastMutation) {
      const revMerge = mergeCanvasReplicaPair(state.peer, state.local);
      if (state.local.contentDigest !== state.peer.contentDigest || revMerge.local.contentDigest !== state.local.contentDigest) {
        return { violation: { invariant: "crdt-state-convergence", stepIndex: i, detailKo: "CRDT 병합 후 상태 다이제스트 불일치" }, finalState: state };
      }
    }
  }
  return { violation: null, finalState: state };
}

/** 델타 디버깅(`ddmin`)으로 불변식 위반을 재현하는 최소 길이 명령 반례로 축소한다. */
export function shrinkFuzzCounterexample(
  failingSequence: readonly CanvasFuzzCommand[], faultInjector?: FuzzFaultInjector,
): readonly CanvasFuzzCommand[] {
  let current = [...failingSequence];
  let granularity = 2;
  while (current.length >= 2) {
    const chunkLen = Math.max(1, Math.floor(current.length / granularity));
    let reduced = false;
    for (let start = 0; start < current.length; start += chunkLen) {
      const candidate = [...current.slice(0, start), ...current.slice(start + chunkLen)];
      if (candidate.length > 0 && executeAndVerifyCanvasSequence(candidate, faultInjector).violation !== null) {
        current = candidate;
        granularity = Math.max(2, granularity - 1);
        reduced = true;
        break;
      }
    }
    if (!reduced) {
      if (granularity >= current.length) break;
      granularity = Math.min(current.length, granularity * 2);
    }
  }
  return current;
}

/** 시드 고정 결정론적 캔버스 상태 퍼징 캠페인을 실행하고 결과를 반환한다. */
export function runDeterministicCanvasFuzzCampaign(options: CanvasFuzzCampaignOptions): CanvasFuzzCampaignReport {
  const algo = options.prngAlgorithm ?? "xoshiro128**";
  const prng = algo === "mulberry32" ? createMulberry32Prng(options.seed) : createXoshiro128StarStarPrng(options.seed);
  const seqCount = Math.max(1, options.sequenceCount ?? 32);
  const opsPerSeq = Math.max(4, options.operationsPerSequence ?? 64);
  let totalOps = 0;

  for (let seq = 0; seq < seqCount; seq += 1) {
    const knownLayers = ["layer-0", "layer-1"];
    const knownStrokes = ["s-0", "s-1", "s-2"];
    const commands: CanvasFuzzCommand[] = [];
    for (let step = 0; step < opsPerSeq; step += 1) {
      const roll = prng.nextInt(0, 99);
      const role: ReplicaRole = prng.nextInt(0, 1) === 0 ? "local" : "peer";
      if (roll < 12) {
        const layerId = `layer-${knownLayers.length}`;
        knownLayers.push(layerId);
        commands.push({ kind: "add-layer", replica: role, layerId, orderKey: prng.nextInt(1, 200) + prng.nextFloat01() });
      } else if (roll < 40) {
        const layerId = knownLayers[prng.nextInt(0, knownLayers.length - 1)]!;
        const strokeId = `s-${prng.nextInt(0, knownStrokes.length + 3)}`;
        if (!knownStrokes.includes(strokeId)) knownStrokes.push(strokeId);
        commands.push({ kind: "draw-stroke", replica: role, layerId, strokeId, checksum: prng.nextInt(100, 999999) });
      } else if (roll < 54) {
        commands.push({ kind: "erase-stroke", replica: role, layerId: knownLayers[prng.nextInt(0, knownLayers.length - 1)]!, strokeId: knownStrokes[prng.nextInt(0, knownStrokes.length - 1)]! });
      } else if (roll < 68) {
        commands.push({ kind: "reorder-layer", replica: role, layerId: knownLayers[prng.nextInt(0, knownLayers.length - 1)]!, orderKey: prng.nextInt(0, 300) + prng.nextFloat01() });
      } else if (roll < 78) commands.push({ kind: "undo", replica: "local" });
      else if (roll < 86) commands.push({ kind: "redo", replica: "local" });
      else if (roll < 91) commands.push({ kind: "offline-partition" });
      else if (roll < 95) commands.push({ kind: "offline-reconnect" });
      else commands.push({ kind: "crdt-merge" });
    }
    commands.push({ kind: "offline-reconnect" }, { kind: "crdt-merge" });
    totalOps += commands.length;
    const outcome = executeAndVerifyCanvasSequence(commands, options.faultInjector);
    if (outcome.violation !== null) {
      return {
        seed: options.seed, prngAlgorithm: algo, totalSequencesRun: seq + 1, totalOperationsExecuted: totalOps,
        allInvariantsPassed: false, violation: outcome.violation, failingSequence: commands,
        shrunkCounterexample: shrinkFuzzCounterexample(commands, options.faultInjector), serverCostKrw: 0,
      };
    }
  }
  return {
    seed: options.seed, prngAlgorithm: algo, totalSequencesRun: seqCount, totalOperationsExecuted: totalOps,
    allInvariantsPassed: true, violation: null, failingSequence: null, shrunkCounterexample: null, serverCostKrw: 0,
  };
}

const CVD_MATRICES: Readonly<Record<CvdDeficiencyKind, readonly [number, number, number, number, number, number, number, number, number]>> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

const srgbChanToLinear = (u8: number): number => {
  const c = clamp(u8 / 255, 0, 1);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const linearChanToSrgb8 = (lin: number): number => {
  const c = clamp(lin, 0, 1);
  return Math.round(clamp((c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255, 0, 255));
};

/** 8비트 sRGB 색상을 지각 균일 Oklab 색 공간으로 변환한다. */
export function srgb8ToOklab(rgb: SrgbColor8): OklabColor {
  const r = srgbChanToLinear(rgb[0]); const g = srgbChanToLinear(rgb[1]); const b = srgbChanToLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** Oklab 색상을 sRGB 영역 내로 클리핑하여 8비트 sRGB 튜플로 변환한다. */
export function oklabToSrgb8(lab: OklabColor): SrgbColor8 {
  const l_ = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = l_ * l_ * l_; const m = m_ * m_ * m_; const s = s_ * s_ * s_;
  return [
    linearChanToSrgb8(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearChanToSrgb8(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearChanToSrgb8(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Oklab 색상을 원통형 OKLCH(명도·채도·색상각)로 변환한다. */
export function oklabToOklch(lab: OklabColor): OklchColor {
  return { l: lab.l, c: Math.hypot(lab.a, lab.b), hDeg: ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360 };
}

/** OKLCH 색상을 Oklab으로 변환한다. */
export function oklchToOklab(lch: OklchColor): OklabColor {
  const rad = (lch.hDeg * Math.PI) / 180;
  return { l: clamp(lch.l, 0, 1), a: lch.c * Math.cos(rad), b: lch.c * Math.sin(rad) };
}

/** 두 sRGB 색상 사이의 Oklab 유클리드 지각 색차(`ΔE_OK`)를 계산한다. */
export function computeDeltaEOklab(c1: SrgbColor8, c2: SrgbColor8): number {
  const p1 = srgb8ToOklab(c1); const p2 = srgb8ToOklab(c2);
  return Math.hypot(p1.l - p2.l, p1.a - p2.a, p1.b - p2.b);
}

/** 지정한 색각 이상 유형과 중증도(`[0..1]`)에 따른 인지 색상을 시뮬레이션한다. */
export function simulateCvdSrgb8(rgb: SrgbColor8, deficiency: CvdDeficiencyKind, severity: number = 1.0): SrgbColor8 {
  const s = clamp(severity, 0, 1);
  const r = srgbChanToLinear(rgb[0]); const g = srgbChanToLinear(rgb[1]); const b = srgbChanToLinear(rgb[2]);
  const m = CVD_MATRICES[deficiency];
  const sr = m[0] * r + m[1] * g + m[2] * b;
  const sg = m[3] * r + m[4] * g + m[5] * b;
  const sb = m[6] * r + m[7] * g + m[8] * b;
  return [linearChanToSrgb8(r + (sr - r) * s), linearChanToSrgb8(g + (sg - g) * s), linearChanToSrgb8(b + (sb - b) * s)];
}

function minPairwiseCvdDeltaE(palette: readonly SrgbColor8[], modes: readonly CvdDeficiencyKind[], severity: number): number {
  if (palette.length < 2) return 1;
  let minVal = Infinity;
  for (const mode of modes) {
    const sim = palette.map((c) => simulateCvdSrgb8(c, mode, severity));
    for (let i = 0; i < sim.length; i += 1) {
      for (let j = i + 1; j < sim.length; j += 1) {
        const d = computeDeltaEOklab(sim[i]!, sim[j]!);
        if (d < minVal) minVal = d;
      }
    }
  }
  return minVal;
}

/** 원본 팔레트와 보정 팔레트를 무손실 바이트 사이드카로 직렬화한다. */
export function encodeLosslessDaltonSidecar(original: readonly SrgbColor8[], daltonized: readonly SrgbColor8[]): Uint8Array {
  const count = Math.min(original.length, daltonized.length);
  const out = new Uint8Array(8 + count * 6);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x444c544e, true);
  view.setUint32(4, count, true);
  for (let i = 0; i < count; i += 1) {
    const o = original[i]!; const d = daltonized[i]!; const base = 8 + i * 6;
    out[base] = o[0]; out[base + 1] = o[1]; out[base + 2] = o[2];
    out[base + 3] = d[0]; out[base + 4] = d[1]; out[base + 5] = d[2];
  }
  return out;
}

/** 무손실 달토나이저 사이드카에서 작가의 원본 sRGB 팔레트를 비트 단위로 복원한다. */
export function restoreOriginalPaletteFromSidecar(sidecar: Uint8Array): SrgbColor8[] {
  if (sidecar.byteLength < 8) throw new RangeError("사이드카 헤더가 손상되었습니다.");
  const view = new DataView(sidecar.buffer, sidecar.byteOffset, sidecar.byteLength);
  if (view.getUint32(0, true) !== 0x444c544e) throw new RangeError("유효하지 않은 달토나이저 사이드카 시그니처입니다.");
  const count = view.getUint32(4, true);
  if (sidecar.byteLength < 8 + count * 6) throw new RangeError("사이드카 페이로드 길이가 부족합니다.");
  const restored: SrgbColor8[] = [];
  for (let i = 0; i < count; i += 1) {
    const base = 8 + i * 6;
    restored.push([sidecar[base]!, sidecar[base + 1]!, sidecar[base + 2]!]);
  }
  return restored;
}

/**
 * OKLCH 명도·색상각 변위 최적화를 통해 색각 이상 독자의 최소 지각 대비(`ΔE_OK >= minCvdDeltaE`)를
 * 보장하면서 원작 팔레트 색차 변위(`ΔE_orig`)를 최소화한다.
 */
export function daltonizePaletteBiObjective(options: DaltonizePaletteOptions): DaltonizePaletteResult {
  const orig = options.palette.map((c): SrgbColor8 => [Math.round(clamp(c[0], 0, 255)), Math.round(clamp(c[1], 0, 255)), Math.round(clamp(c[2], 0, 255))]);
  const severity = clamp(options.severity ?? 1.0, 0, 1);
  const minTarget = Math.max(0.01, options.minCvdDeltaE ?? 0.09);
  const maxIter = Math.max(1, options.maxIterations ?? 90);
  const preserveExtremes = options.preserveAchromaticExtremes ?? true;
  const modes: readonly CvdDeficiencyKind[] = options.targetMode === "all-dichromats"
    ? ["protanopia", "deuteranopia", "tritanopia"]
    : [options.targetMode ?? "deuteranopia"];

  const beforeMin = minPairwiseCvdDeltaE(orig, modes, severity);
  if (orig.length < 2 || beforeMin >= minTarget) {
    return {
      originalPalette: orig, daltonizedPalette: orig,
      simulatedBeforeMinDeltaE: beforeMin, simulatedAfterMinDeltaE: beforeMin,
      meanOriginalDriftDeltaE: 0, maxOriginalDriftDeltaE: 0, contrastSatisfied: true,
      losslessSidecar: encodeLosslessDaltonSidecar(orig, orig), serverCostKrw: 0,
    };
  }

  const origLch = orig.map((c) => oklabToOklch(srgb8ToOklab(c)));
  const locked = origLch.map((lch) => preserveExtremes && lch.c < 0.015 && (lch.l < 0.08 || lch.l > 0.96));
  const curL = origLch.map((v) => v.l);
  const curC = origLch.map((v) => v.c);
  const curH = origLch.map((v) => v.hDeg);
  const materialize = (): SrgbColor8[] => curL.map((l, idx) => oklabToSrgb8(oklchToOklab({ l, c: curC[idx]!, hDeg: curH[idx]! })));
  const targetWithMargin = minTarget + 0.008;
  const meanDrift = (pal: readonly SrgbColor8[]): number => {
    let sum = 0;
    for (let k = 0; k < orig.length; k += 1) sum += computeDeltaEOklab(orig[k]!, pal[k]!);
    return sum / orig.length;
  };
  const worstPairIndices = (pal: readonly SrgbColor8[]): readonly [number, number, number] => {
    let bestD = Infinity; let bi = 0; let bj = 1;
    for (const mode of modes) {
      const sim = pal.map((c) => simulateCvdSrgb8(c, mode, severity));
      for (let i = 0; i < sim.length; i += 1) {
        for (let j = i + 1; j < sim.length; j += 1) {
          const d = computeDeltaEOklab(sim[i]!, sim[j]!);
          if (d < bestD) { bestD = d; bi = i; bj = j; }
        }
      }
    }
    return [bi, bj, bestD];
  };

  // 1단계: 다중 스케일 병목 쌍(bottleneck pair) 좌표 탐색으로 최소 지각 대비 달성
  const scales: ReadonlyArray<readonly [number, number]> = [
    [0.08, 28], [0.045, 16], [0.022, 8], [0.01, 3.5],
  ];
  for (let iter = 0; iter < maxIter; iter += 1) {
    const palNow = materialize();
    const [wi, wj, curMinD] = worstPairIndices(palNow);
    if (curMinD >= targetWithMargin) break;
    const [stepL, stepH] = scales[Math.min(scales.length - 1, Math.floor((iter / maxIter) * scales.length))]!;
    let improved = false;
    for (const idx of [wi, wj]) {
      if (locked[idx]) continue;
      const baseL = curL[idx]!; const baseH = curH[idx]!;
      let bestScore = curMinD - 0.04 * meanDrift(palNow);
      let bestL = baseL; let bestH = baseH;
      for (const [dl, dh] of [[stepL, 0], [-stepL, 0], [0, stepH], [0, -stepH], [stepL, stepH], [-stepL, -stepH], [stepL, -stepH], [-stepL, stepH]] as const) {
        curL[idx] = clamp(baseL + dl, 0.06, 0.95);
        curH[idx] = (baseH + dh + 360) % 360;
        const candPal = materialize();
        const candMin = minPairwiseCvdDeltaE(candPal, modes, severity);
        const score = Math.min(candMin, targetWithMargin) - 0.04 * meanDrift(candPal);
        if (score > bestScore + 1e-6) { bestScore = score; bestL = curL[idx]!; bestH = curH[idx]!; improved = true; }
      }
      curL[idx] = bestL; curH[idx] = bestH;
    }
    if (!improved && iter > 12) continue;
  }

  // 2단계: 대비 제약(>= minTarget)을 유지한 채 원작 팔레트 방향으로 드리프트 수축
  for (let pass = 0; pass < 24; pass += 1) {
    for (let i = 0; i < orig.length; i += 1) {
      if (locked[i]) continue;
      const pL = curL[i]!; const pH = curH[i]!;
      let hd = origLch[i]!.hDeg - pH;
      if (hd > 180) hd -= 360;
      if (hd < -180) hd += 360;
      curL[i] = pL + 0.2 * (origLch[i]!.l - pL);
      curH[i] = (pH + 0.2 * hd + 360) % 360;
      if (minPairwiseCvdDeltaE(materialize(), modes, severity) < minTarget) {
        curL[i] = pL; curH[i] = pH;
      }
    }
  }

  const finalPalette = materialize();
  const afterMin = minPairwiseCvdDeltaE(finalPalette, modes, severity);
  let driftSum = 0; let maxDrift = 0;
  for (let i = 0; i < orig.length; i += 1) {
    const d = computeDeltaEOklab(orig[i]!, finalPalette[i]!);
    driftSum += d;
    if (d > maxDrift) maxDrift = d;
  }
  return {
    originalPalette: orig, daltonizedPalette: finalPalette,
    simulatedBeforeMinDeltaE: beforeMin, simulatedAfterMinDeltaE: afterMin,
    meanOriginalDriftDeltaE: driftSum / orig.length, maxOriginalDriftDeltaE: maxDrift,
    contrastSatisfied: afterMin >= minTarget,
    losslessSidecar: encodeLosslessDaltonSidecar(orig, finalPalette), serverCostKrw: 0,
  };
}
