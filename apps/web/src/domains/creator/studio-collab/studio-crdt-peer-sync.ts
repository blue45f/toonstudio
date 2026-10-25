/**
 * 다계정 실시간 — 코드 측 동기화 경로 (2026-10-25, 3단계 협업 우위).
 *
 * 기존 래스터 CRDT 재생 런타임(StudioRasterCrdtCanvas 계열)은 화면 프레임을
 * 그리는 쪽이고, 이 모듈은 피어 간 연산 교환·수렴을 담당하는 동기화 경로다.
 * 전송 계층(WebSocket 등)은 이 모듈 밖에 있으며, receive()가 그 경계다.
 * 따라서 실제 다계정 라이브 검증은 계정·전송 경로가 없어 소유자 검증 항목으로
 * 남고, 여기서는 가상 피어 쌍으로 순서 뒤섞임·중복 전달에서도 수렴함을 증명한다.
 *
 * 수렴 규칙: 연산은 (lamport 시계, 피어 ID, 피어 내 일련번호) 전순서로 정렬한다.
 * 같은 연산을 두 번 받아도 한 번만 적용하고, 늦게 도착한 연산도 정렬 위치에
 * 꽂히므로 모든 피어는 같은 순서의 연산 로그, 같은 다이제스트에 도달한다.
 */

export type CollabOpKind = "stroke" | "comment" | "handoff";

export interface CollabOp {
  readonly id: string;
  readonly peerId: string;
  readonly lamport: number;
  readonly seq: number;
  readonly kind: CollabOpKind;
  readonly payload: string;
}

function compareOp(a: CollabOp, b: CollabOp): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  if (a.peerId !== b.peerId) return a.peerId < b.peerId ? -1 : 1;
  return a.seq - b.seq;
}

/** 다이제스트: 연산 로그 전체의 결정적 지문. 피어 간 수렴 비교용이다. */
export function collabDigest(ops: readonly CollabOp[]): string {
  const ordered = [...ops].sort(compareOp);
  let hash = 0x811c9dc5;
  const text = ordered.map((op) => `${op.peerId}:${op.lamport}:${op.seq}:${op.kind}:${op.payload}`).join("\n");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, "0")}`;
}

function isValidOp(value: unknown): value is CollabOp {
  if (typeof value !== "object" || value === null) return false;
  const op = value as Record<string, unknown>;
  return typeof op.id === "string" && op.id.length > 0
    && typeof op.peerId === "string" && op.peerId.length > 0
    && typeof op.lamport === "number" && Number.isSafeInteger(op.lamport) && op.lamport >= 1
    && typeof op.seq === "number" && Number.isSafeInteger(op.seq) && op.seq >= 1
    && (op.kind === "stroke" || op.kind === "comment" || op.kind === "handoff")
    && typeof op.payload === "string";
}

export class PeerSync {
  readonly peerId: string;
  private clock = 0;
  private seq = 0;
  private readonly seen = new Set<string>();
  private readonly ops: CollabOp[] = [];

  constructor(peerId: string) {
    this.peerId = peerId;
  }

  createOp(kind: CollabOpKind, payload: string): CollabOp {
    this.clock += 1;
    this.seq += 1;
    const op: CollabOp = { id: `${this.peerId}-${this.seq}`, peerId: this.peerId, lamport: this.clock, seq: this.seq, kind, payload };
    this.seen.add(op.id);
    this.ops.push(op);
    return op;
  }

  /** 전송 계층에서 도착한 연산. 잘못된 값은 무시하고, 중복은 한 번만 적용한다. */
  receive(value: unknown): boolean {
    if (!isValidOp(value)) return false;
    if (this.seen.has(value.id)) return false;
    this.seen.add(value.id);
    this.clock = Math.max(this.clock, value.lamport);
    this.ops.push(value);
    return true;
  }

  orderedOps(): readonly CollabOp[] {
    return [...this.ops].sort(compareOp);
  }

  digest(): string {
    return collabDigest(this.ops);
  }

  opCount(): number {
    return this.ops.length;
  }
}

export interface VirtualPeerPair {
  readonly a: PeerSync;
  readonly b: PeerSync;
  /** 양쪽의 미전달 연산을 순서 뒤섞어(역순) 교환한다. 중복 전달도 섞는다. */
  exchange(): void;
  converged(): boolean;
}

export function createVirtualPeerPair(): VirtualPeerPair {
  const a = new PeerSync("peer-a");
  const b = new PeerSync("peer-b");
  const deliveredToA = new Set<string>();
  const deliveredToB = new Set<string>();
  function exchange(): void {
    const toB = [...a.orderedOps()].reverse().filter((op) => !deliveredToB.has(op.id));
    const toA = [...b.orderedOps()].reverse().filter((op) => !deliveredToA.has(op.id));
    // 중복 전달을 일부러 섞는다: 이미 받은 연산도 다시 보내 수렴이 깨지지 않음을 보인다.
    const duplicates = [...a.orderedOps()].slice(0, 1);
    for (const op of [...toB, ...duplicates]) {
      b.receive(op);
      deliveredToB.add(op.id);
    }
    for (const op of toA) {
      a.receive(op);
      deliveredToA.add(op.id);
    }
  }
  return { a, b, exchange, converged: () => a.digest() === b.digest() && a.opCount() === b.opCount() };
}
