/**
 * ToonOffice 2D 스프라이트 카탈로그.
 *
 * 생성 원화(scripts/build-virtual-studio-toon-office-v1.py가 크로마키·트림·정규화)를 키로 묶는다. 오브젝트 스프라이트는
 * 바닥 중앙(base)이 기준점이며, 표시 높이는 이미지 비율에서 계산한다. 캐릭터 시트는 4행(아래·왼쪽·오른쪽·위) × 3열(정지·왼발·오른발)
 * 고정 셀이다. 이미지가 없거나 불러오지 못하면 렌더러가 절차형 폴백으로 같은 자리를 그린다.
 */

export const OFFICE2D_ASSET_ROOT = "/assets/virtual-studio/toon-office-v1";

export const OFFICE2D_OBJECT_SPRITES = [
  "desk-artist", "desk-inking", "desk-colorist", "desk-3d", "desk-lettering", "desk-producer", "desk-writer", "reception-desk",
  "storyboard-wall", "review-screen", "kanban-board", "bookshelf", "table-round", "table-conference", "printer-station", "focus-booth",
  "coffee-machine", "vending-machine", "sofa", "filing-cabinet", "comic-box", "supply-cart", "side-table", "partition",
  "rug-rect", "rug-round", "poster", "wall-clock", "window", "neon-balloon", "pinboard", "wall-tv",
  "water-cooler", "beanbag", "plant-monstera", "floor-lamp",
  "chair-back", "chair-front", "exercise-ball", "paper-bin", "plant-olive",
] as const;

export type Office2dSpriteKey = typeof OFFICE2D_OBJECT_SPRITES[number];

export const OFFICE2D_CHARACTERS = ["artist", "pd", "writer", "colorist", "bgartist"] as const;
export type Office2dCharacterKey = typeof OFFICE2D_CHARACTERS[number];

/** 캐릭터 시트 셀 크기(px), 보행 프레임 수(1~8열), 행 순서. 0열은 정지/착석 기준 자세다. */
export const OFFICE2D_CHARACTER_CELL = Object.freeze({ width: 128, height: 192 });
export const OFFICE2D_CHARACTER_WALK_FRAMES = 8;
export const OFFICE2D_CHARACTER_ROWS = Object.freeze({ down: 0, left: 1, right: 2, up: 3 } as const);

export type Office2dSpriteFamily = "desk" | "board" | "table" | "storage" | "seat" | "appliance" | "plant" | "lamp" | "rug" | "wall" | "small";

export interface Office2dSpriteSpec {
  readonly key: Office2dSpriteKey;
  readonly family: Office2dSpriteFamily;
  /** 생성 원화가 없을 때 쓸 근사 비율(높이 / 너비). */
  readonly fallbackAspect: number;
  /** 절차형 폴백 주색. */
  readonly tone: string;
  /** 접지 그림자 타원 너비 비율(표시 너비 대비). 0이면 그림자 없음. */
  readonly shadow: number;
}

const spec = (key: Office2dSpriteKey, family: Office2dSpriteFamily, fallbackAspect: number, tone: string, shadow = 0.82): Office2dSpriteSpec =>
  Object.freeze({ key, family, fallbackAspect, tone, shadow });

export const OFFICE2D_SPRITE_SPECS: Readonly<Record<Office2dSpriteKey, Office2dSpriteSpec>> = Object.freeze({
  "desk-artist": spec("desk-artist", "desk", 0.86, "#c99a6b"),
  "desk-inking": spec("desk-inking", "desk", 0.86, "#c99a6b"),
  "desk-colorist": spec("desk-colorist", "desk", 0.86, "#c99a6b"),
  "desk-3d": spec("desk-3d", "desk", 0.86, "#b88a5e"),
  "desk-lettering": spec("desk-lettering", "desk", 0.86, "#c99a6b"),
  "desk-producer": spec("desk-producer", "desk", 0.8, "#a8774f"),
  "desk-writer": spec("desk-writer", "desk", 0.8, "#c99a6b"),
  "reception-desk": spec("reception-desk", "desk", 0.7, "#8a5a3a"),
  "storyboard-wall": spec("storyboard-wall", "board", 0.82, "#b9895a", 0.7),
  "review-screen": spec("review-screen", "board", 0.78, "#333a48", 0.6),
  "kanban-board": spec("kanban-board", "board", 0.86, "#f3f1ea", 0.6),
  bookshelf: spec("bookshelf", "storage", 1.45, "#9a6a43", 0.9),
  "table-round": spec("table-round", "table", 0.66, "#b98a5e"),
  "table-conference": spec("table-conference", "table", 0.48, "#b98a5e"),
  "printer-station": spec("printer-station", "appliance", 0.8, "#cfd3da"),
  "focus-booth": spec("focus-booth", "storage", 1.55, "#ece3d4", 0.9),
  "coffee-machine": spec("coffee-machine", "appliance", 0.95, "#7a5236"),
  "vending-machine": spec("vending-machine", "appliance", 1.6, "#8aa784", 0.85),
  sofa: spec("sofa", "seat", 0.62, "#8fae8b"),
  "filing-cabinet": spec("filing-cabinet", "storage", 1.5, "#ece4cf", 0.85),
  "comic-box": spec("comic-box", "small", 0.8, "#c9a06e"),
  "supply-cart": spec("supply-cart", "small", 1.15, "#9aa1a8", 0.7),
  "side-table": spec("side-table", "table", 0.95, "#9a6a43", 0.7),
  partition: spec("partition", "wall", 1.3, "#8fae8b", 0.8),
  "rug-rect": spec("rug-rect", "rug", 0.55, "#c9d3b4", 0),
  "rug-round": spec("rug-round", "rug", 0.6, "#d79a91", 0),
  poster: spec("poster", "wall", 1.35, "#f0e6d0", 0),
  "wall-clock": spec("wall-clock", "wall", 1, "#d9b483", 0),
  window: spec("window", "wall", 0.82, "#bfe3ff", 0),
  "neon-balloon": spec("neon-balloon", "wall", 0.9, "#ffe066", 0),
  pinboard: spec("pinboard", "wall", 0.72, "#c99a6b", 0),
  "wall-tv": spec("wall-tv", "wall", 0.62, "#2b3140", 0),
  "water-cooler": spec("water-cooler", "appliance", 1.85, "#eef0ea", 0.8),
  beanbag: spec("beanbag", "seat", 0.82, "#e2ad3e", 0.9),
  "plant-monstera": spec("plant-monstera", "plant", 1.3, "#4f8a52", 0.6),
  "floor-lamp": spec("floor-lamp", "lamp", 2.1, "#e9c27e", 0.5),
  "chair-back": spec("chair-back", "seat", 1.3, "#3b3f46", 0.7),
  "chair-front": spec("chair-front", "seat", 1.3, "#3b3f46", 0.7),
  "exercise-ball": spec("exercise-ball", "small", 1, "#8fc3e6", 0.85),
  "paper-bin": spec("paper-bin", "small", 1.2, "#4f7fd0", 0.8),
  "plant-olive": spec("plant-olive", "plant", 1.45, "#7c9a6a", 0.55),
});

/** 좌석 쪽. 책상 화면이 관람자를 향하므로 작업자는 책상 남쪽에 앉아 위(북쪽)를 본다. */
export const OFFICE2D_DESK_SEAT_OFFSET = Object.freeze({ anchorY: 26, attachY: 8, approachX: 34 });

export function office2dObjectUrl(key: Office2dSpriteKey): string {
  return `${OFFICE2D_ASSET_ROOT}/objects/${key}.webp`;
}

export function office2dCharacterUrl(key: Office2dCharacterKey): string {
  return `${OFFICE2D_ASSET_ROOT}/characters/${key}.webp`;
}

export function isOffice2dSpriteKey(value: unknown): value is Office2dSpriteKey {
  return typeof value === "string" && (OFFICE2D_OBJECT_SPRITES as readonly string[]).includes(value);
}

/** NPC 스킨 키 → 캐릭터 시트. 모르는 키는 해시로 고르게 나눈다. */
const NPC_CHARACTER: Readonly<Record<string, Office2dCharacterKey>> = Object.freeze({
  "npc-concierge": "writer",
  "npc-producer": "pd",
  "npc-editor": "pd",
  "npc-artist": "artist",
  "npc-archivist": "bgartist",
  "npc-cafe": "colorist",
  "npc-host": "writer",
  "npc-security": "bgartist",
});

export function office2dHashIndex(value: string, modulo: number): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % Math.max(1, modulo);
}

export function office2dCharacterForNpc(skinKey: string): Office2dCharacterKey {
  return NPC_CHARACTER[skinKey] ?? OFFICE2D_CHARACTERS[office2dHashIndex(skinKey, OFFICE2D_CHARACTERS.length)] ?? "artist";
}

/** 참가자 아바타 번호(-1은 자동) + 신원 → 캐릭터 시트. 같은 사람은 어느 기기에서도 같은 캐릭터로 보인다. */
export function office2dCharacterForAvatar(avatarIndex: number, identity: string): Office2dCharacterKey {
  const index = Number.isInteger(avatarIndex) && avatarIndex >= 0 ? avatarIndex : office2dHashIndex(identity, 997);
  return OFFICE2D_CHARACTERS[index % OFFICE2D_CHARACTERS.length] ?? "artist";
}

/** 이름표 강조색(참가자별 고정). */
const ACCENTS = ["#f08a7e", "#5b8def", "#f2b84b", "#5cc3c9", "#9b7bea", "#6cbf73", "#ef7fb8", "#f59f4c"] as const;
export function office2dAccentFor(identity: string): string {
  return ACCENTS[office2dHashIndex(identity, ACCENTS.length)] ?? "#5b8def";
}

export interface Office2dImageSource {
  readonly width: number;
  readonly height: number;
}

/**
 * 이미지 로더. 브라우저에서는 HTMLImageElement로 불러오고, 실패·시간 초과는 null로 남겨 절차형 폴백을 쓰게 한다.
 * 테스트는 loadImage를 주입한다.
 */
export class Office2dSpriteStore<TImage extends Office2dImageSource = HTMLImageElement> {
  private readonly images = new Map<string, TImage | null>();
  private readonly pending = new Map<string, Promise<TImage | null>>();

  constructor(private readonly loadImage: (url: string) => Promise<TImage>) {}

  get(url: string): TImage | null {
    return this.images.get(url) ?? null;
  }

  has(url: string): boolean {
    return this.images.has(url);
  }

  load(url: string): Promise<TImage | null> {
    const loaded = this.images.get(url);
    if (loaded !== undefined) return Promise.resolve(loaded);
    const inflight = this.pending.get(url);
    if (inflight) return inflight;
    const promise = this.loadImage(url)
      .then((image) => (image.width > 0 && image.height > 0 ? image : null))
      .catch(() => null)
      .then((image) => {
        this.images.set(url, image);
        this.pending.delete(url);
        return image;
      });
    this.pending.set(url, promise);
    return promise;
  }

  /** 여러 이미지를 병렬로 불러온다. 제한 시간이 지나면 불러온 것만으로 진행한다. 성공 개수를 돌려준다. */
  async loadAll(urls: readonly string[], timeoutMs: number): Promise<number> {
    const unique = [...new Set(urls)];
    const all = Promise.all(unique.map((url) => this.load(url)));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, Math.max(0, timeoutMs)); });
    await Promise.race([all, timeout]);
    if (timer !== undefined) clearTimeout(timer);
    return unique.filter((url) => this.get(url) !== null).length;
  }
}

export function office2dBrowserImageLoader(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`office2d sprite failed: ${url}`));
    image.src = url;
  });
}
