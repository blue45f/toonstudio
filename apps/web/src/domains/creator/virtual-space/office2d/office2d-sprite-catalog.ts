/**
 * ToonOffice 2D 스프라이트 카탈로그.
 *
 * 생성 원화(scripts/build-virtual-studio-toon-office-v1.py가 크로마키·트림·정규화)를 키로 묶는다. 오브젝트 스프라이트는
 * 바닥 중앙(base)이 기준점이며, 표시 높이는 이미지 비율에서 계산한다. 캐릭터 보행 시트는 4행(아래·왼쪽·오른쪽·위) × 9열(정지 + 8프레임 보행)
 * 고정 셀이고, 작업 자세 시트(characters/work/*.webp, scripts/build-virtual-studio-toon-office-cast.py)는 3행(뒤 착석 작업 · 앞 착석 · 제스처)
 * × 4열이다. 이미지가 없거나 불러오지 못하면 렌더러가 절차형 폴백(보행 시트 0열 등)으로 같은 자리를 그린다.
 */

import { office2dGeneratedAtlas } from "./office2d-generated-atlases";
import { office2dExpressionAssetUrls } from "./office2d-expression-catalog";

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

/** 웹툰 제작 직군 8종: 작화 · PD · 콘티(글) · 채색 · 배경 · 식자 · 3D 배경 · 편집(검수). */
export const OFFICE2D_CHARACTERS = ["artist", "pd", "writer", "colorist", "bgartist", "letterer", "modeler", "editor"] as const;
export type Office2dCharacterKey = typeof OFFICE2D_CHARACTERS[number];

/** 캐릭터 시트 셀 크기(px), 보행 프레임 수(1~8열), 행 순서. 0열은 정지/착석 기준 자세다. */
export const OFFICE2D_CHARACTER_CELL = Object.freeze({ width: 128, height: 192 });
export const OFFICE2D_CHARACTER_WALK_FRAMES = 8;
export const OFFICE2D_CHARACTER_ROWS = Object.freeze({ down: 0, left: 1, right: 2, up: 3 } as const);

/** 작업 자세 시트: 셀은 보행 시트와 같고(발끝 y=188), 행은 뒤 착석 작업 루프 · 앞 착석 · 선 자세 제스처다. */
export const OFFICE2D_WORK_COLS = 4;
export const OFFICE2D_WORK_ROWS = Object.freeze({ sitBack: 0, sitFront: 1, gesture: 2 } as const);
/** 앞 착석 행의 열: 기본 · 대화 · 웃음 · 커피. */
export const OFFICE2D_SIT_FRONT_FRAMES = Object.freeze({ idle: 0, talk: 1, laugh: 2, coffee: 3 } as const);
/** 제스처 행의 열: 손 흔들기 · 만세 · 엄지 척 · 생각. */
export const OFFICE2D_GESTURE_FRAMES = Object.freeze({ wave: 0, cheer: 1, thumbs: 2, think: 3 } as const);
export type Office2dGesture = keyof typeof OFFICE2D_GESTURE_FRAMES;

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
  return office2dGeneratedAtlas(key, "walk")?.url ?? office2dLegacyCharacterUrl(key);
}

export function office2dWorkSheetUrl(key: Office2dCharacterKey): string {
  return office2dGeneratedAtlas(key, "work")?.url ?? office2dLegacyWorkSheetUrl(key);
}

export function office2dLegacyCharacterUrl(key: Office2dCharacterKey): string {
  return `${OFFICE2D_ASSET_ROOT}/characters/${key}.webp`;
}

export function office2dLegacyWorkSheetUrl(key: Office2dCharacterKey): string {
  return `${OFFICE2D_ASSET_ROOT}/characters/work/${key}.webp`;
}

/** 첫 화면은 기존 시트로 열고 고해상도 시트는 자기 직군부터 이어 받는다. */
export function office2dActorAssetPlan(preferred: Office2dCharacterKey): { readonly critical: readonly string[]; readonly deferred: readonly string[] } {
  const critical = OFFICE2D_CHARACTERS.map(office2dLegacyCharacterUrl);
  const order = [preferred, ...OFFICE2D_CHARACTERS.filter((key) => key !== preferred)];
  const deferred = [...order.flatMap((key) => [office2dCharacterUrl(key), office2dWorkSheetUrl(key)]),
    ...OFFICE2D_CHARACTERS.map(office2dLegacyWorkSheetUrl), ...office2dExpressionAssetUrls(preferred)];
  return { critical, deferred: [...new Set(deferred)].filter((url) => !critical.includes(url)) };
}

/** 이모트 → 몸짓. 몸짓이 없는 이모트(수면·전신 웃음 등)는 null이라 말풍선·전신 표정만 쓴다. */
const EMOTE_GESTURE: Readonly<Record<string, Office2dGesture>> = Object.freeze({
  wave: "wave", "raise-hand": "wave", moonwalk: "wave",
  party: "cheer", cheer: "cheer", clap: "cheer", dance: "cheer", fire: "cheer",
  cheers: "cheer", fireworks: "cheer", sparkles: "cheer", wow: "cheer",
  "kpop-dance": "cheer", shuffle: "cheer", calisthenics: "cheer",
  "thumbs-up": "thumbs", check: "thumbs", heart: "thumbs", coffee: "thumbs", exclaim: "thumbs",
  think: "think", question: "think", idea: "think", eyes: "think",
  yoga: "think", "tai-chi": "think", "neck-stretch": "think", music: "think",
});

export function office2dGestureForEmote(kind: string | null | undefined): Office2dGesture | null {
  return kind ? EMOTE_GESTURE[kind] ?? null : null;
}

/**
 * 캐릭터 이름·직함 문구 → 직군 시트. 더 구체적인 직군을 먼저 본다("편집 PD"는 편집, "스토리 PD"는 PD, "3D 아티스트"는 3D).
 * 알 수 없으면 null(호출자가 해시로 고른다).
 */
const ROLE_KEYWORDS: readonly (readonly [Office2dCharacterKey, RegExp])[] = Object.freeze([
  ["letterer", /식자|타이포|letter|typesett/iu],
  ["modeler", /3d|모델러|모델링|model/iu],
  ["editor", /편집|에디터|검수|리뷰|editor|review/iu],
  ["pd", /\bpd\b|프로듀서|디렉터|매니저|기획|producer|director|manager/iu],
  ["colorist", /채색|컬러|color/iu],
  ["bgartist", /배경|background|아키비스트|archiv/iu],
  ["writer", /콘티|스토리|시나리오|각본|story|script|writer/iu],
  ["artist", /작가|작화|아티스트|일러스트|디자이너|선화|artist|illustrat|designer/iu],
]);

export function office2dCharacterForRoleText(text: string | null | undefined): Office2dCharacterKey | null {
  if (!text) return null;
  for (const [key, pattern] of ROLE_KEYWORDS) if (pattern.test(text)) return key;
  return null;
}

export function isOffice2dSpriteKey(value: unknown): value is Office2dSpriteKey {
  return typeof value === "string" && (OFFICE2D_OBJECT_SPRITES as readonly string[]).includes(value);
}

/** NPC 스킨 키 → 캐릭터 시트. 모르는 키는 해시로 고르게 나눈다. */
const NPC_CHARACTER: Readonly<Record<string, Office2dCharacterKey>> = Object.freeze({
  "npc-concierge": "writer",
  "npc-producer": "pd",
  "npc-editor": "editor",
  "npc-artist": "artist",
  "npc-archivist": "letterer",
  "npc-cafe": "colorist",
  "npc-host": "modeler",
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
    // 실패 표시는 폴백용으로 남기되 명시적으로 다시 불러오면 재시도한다. 성공 캐시와 진행 중 요청은 재사용한다.
    if (loaded !== undefined && loaded !== null) return Promise.resolve(loaded);
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

  /** 제한 시간 뒤에도 개별 도착 알림은 이어져 늦게 받은 배경의 캐시를 갱신할 수 있다. */
  async loadAll(urls: readonly string[], timeoutMs: number, onImageLoaded?: (url: string, image: TImage) => void): Promise<number> {
    const unique = [...new Set(urls)];
    const all = Promise.all(unique.map((url) => this.load(url).then((image) => {
      if (image) onImageLoaded?.(url, image);
      return image;
    })));
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
