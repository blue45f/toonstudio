import { StrokeBudgetExceededError } from "../core/errors";

/**
 * 저널(타일 단위 copy-on-write 스냅샷). `beginJournal` 시점의 풀 상태로 되돌리기 위해, 그 뒤 `view`로 처음 접근한 슬롯의
 * 내용만 복사해 둔다(접근하지 않은 타일은 복사하지 않는다). 저널 시작 뒤 새로 할당된 슬롯은 시작 시점에 0이었으므로 복사할 것이 없다.
 */
interface PoolJournal {
  /** 저널 시작 시점의 할당 슬롯 수. */
  readonly cursor: number;
  /** 슬롯 → 처음 접근 직전 내용(복사본). */
  readonly saved: Map<number, Float32Array>;
  /** `clear()`가 슬롯 배치를 바꿔 놓은 경우 시작 시점의 타일 → 슬롯 대응. */
  slotsAtStart: Map<number, number> | null;
}

/**
 * 희소 타일 풀. 타일 번호 → 슬롯을 처음 접근 순서로 할당하며 용량 초과는 던진다.
 * GPU `TileTable.slots`/`pool_cursor`와 같은 의미(슬롯 번호는 결과에 영향 없음).
 *
 * 불변식: 슬롯 `cursor` 이상의 데이터는 항상 0이다(`clear`·`rollbackJournal`이 지킨다).
 */
export class TilePool {
  readonly capacityTiles: number;
  readonly floatsPerTile: number;
  private readonly data: Float32Array;
  private slots = new Map<number, number>();
  private cursor = 0;
  private journal: PoolJournal | null = null;

  constructor(capacityTiles: number, floatsPerTile: number) {
    if (!Number.isInteger(capacityTiles) || capacityTiles <= 0) {
      throw new RangeError(`TilePool capacityTiles must be positive, got ${capacityTiles}`);
    }
    this.capacityTiles = capacityTiles;
    this.floatsPerTile = floatsPerTile;
    this.data = new Float32Array(capacityTiles * floatsPerTile);
  }

  slotOf(tile: number): number | undefined {
    return this.slots.get(tile);
  }

  /** 슬롯 할당(이미 있으면 기존 슬롯). 용량 초과 → StrokeBudgetExceededError. */
  alloc(tile: number): number {
    const existing = this.slots.get(tile);
    if (existing !== undefined) return existing;
    if (this.cursor >= this.capacityTiles) {
      throw new StrokeBudgetExceededError(this.cursor + 1, this.capacityTiles, { tile });
    }
    const slot = this.cursor;
    this.cursor += 1;
    this.slots.set(tile, slot);
    return slot;
  }

  /**
   * 슬롯 데이터의 쓰기 가능한 뷰. 저널이 열려 있으면 처음 접근하는 슬롯의 내용을 먼저 복사해 둔다
   * (뷰로 읽기만 해도 복사된다 — 읽기 전용 접근은 `peek`을 쓴다).
   */
  view(slot: number): Float32Array {
    if (slot < 0 || slot >= this.cursor) {
      throw new RangeError(`TilePool slot ${slot} is not allocated`);
    }
    const base = slot * this.floatsPerTile;
    const journal = this.journal;
    if (journal && slot < journal.cursor && !journal.saved.has(slot)) {
      journal.saved.set(slot, this.data.slice(base, base + this.floatsPerTile));
    }
    return this.data.subarray(base, base + this.floatsPerTile);
  }

  /** 읽기 전용 뷰(저널에 복사하지 않는다). 호출자는 이 뷰에 쓰면 안 된다. */
  peek(slot: number): Float32Array {
    if (slot < 0 || slot >= this.cursor) {
      throw new RangeError(`TilePool slot ${slot} is not allocated`);
    }
    const base = slot * this.floatsPerTile;
    return this.data.subarray(base, base + this.floatsPerTile);
  }

  /**
   * 저널을 연다: 지금 상태를 되돌림 기준점으로 삼는다. 이미 열린 저널은 확정(commit)된 것으로 보고 새로 시작한다.
   * 복사는 이후 `view`로 처음 접근하는 슬롯에서만 일어난다.
   */
  beginJournal(): void {
    this.journal = { cursor: this.cursor, saved: new Map<number, Float32Array>(), slotsAtStart: null };
  }

  /** 저널이 열려 있는가. */
  hasJournal(): boolean {
    return this.journal !== null;
  }

  /** 저널이 지금까지 복사해 둔 타일(슬롯) 수. 저널이 없으면 0. */
  journalTiles(): number {
    return this.journal ? this.journal.saved.size : 0;
  }

  /** 변경을 확정한다: 복사본을 버린다. 저널이 없으면 아무 일도 하지 않는다. */
  commitJournal(): void {
    this.journal = null;
  }

  /**
   * `beginJournal` 시점으로 되돌린다(내용·할당 슬롯·커서). 되돌린 타일 수를 돌려준다. 저널이 없으면 0.
   * 되돌린 뒤 저널은 닫힌다.
   */
  rollbackJournal(): number {
    const journal = this.journal;
    if (!journal) return 0;
    this.journal = null;
    let restored = 0;
    for (const [slot, copy] of journal.saved) {
      this.data.set(copy, slot * this.floatsPerTile);
      restored += 1;
    }
    // 저널 시작 뒤 새로 할당된 슬롯은 시작 시점에 0이었다 → 다시 0으로.
    if (this.cursor > journal.cursor) {
      this.data.fill(0, journal.cursor * this.floatsPerTile, this.cursor * this.floatsPerTile);
    }
    if (journal.slotsAtStart) {
      this.slots = new Map(journal.slotsAtStart);
    } else {
      for (const [tile, slot] of this.slots) {
        if (slot >= journal.cursor) this.slots.delete(tile);
      }
    }
    this.cursor = journal.cursor;
    return restored;
  }

  used(): number {
    return this.cursor;
  }

  /** 할당된 (tile, slot) 목록을 타일 번호 오름차순으로. */
  entries(): [tile: number, slot: number][] {
    return Array.from(this.slots.entries()).sort((a, b) => a[0] - b[0]);
  }

  clear(): void {
    const journal = this.journal;
    if (journal) {
      // 저널이 열린 채 비우면 시작 시점 내용·슬롯 배치를 먼저 보존한다(되돌리기가 가능하도록).
      const upTo = Math.min(this.cursor, journal.cursor);
      for (let slot = 0; slot < upTo; slot += 1) {
        if (!journal.saved.has(slot)) {
          const base = slot * this.floatsPerTile;
          journal.saved.set(slot, this.data.slice(base, base + this.floatsPerTile));
        }
      }
      if (!journal.slotsAtStart) {
        const atStart = new Map<number, number>();
        for (const [tile, slot] of this.slots) if (slot < journal.cursor) atStart.set(tile, slot);
        journal.slotsAtStart = atStart;
      }
    }
    this.slots.clear();
    // 불변식에 따라 할당된 구간만 0으로 만들면 된다.
    this.data.fill(0, 0, this.cursor * this.floatsPerTile);
    this.cursor = 0;
  }
}
