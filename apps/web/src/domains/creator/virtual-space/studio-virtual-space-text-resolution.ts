/**
 * Phaser Text는 해상도 1짜리 캔버스에 글자를 그려서, 고해상도 화면(DPR 2)이나 확대된 카메라에서는 이름표·구역 이름이
 * 늘어난 비트맵처럼 흐려진다. 화면에서 실제로 그려지는 배율에 맞춰 장면의 모든 Text 해상도를 올린다.
 * 표시 크기는 그대로다(Phaser WebGL 렌더러가 style.resolution으로 나눠서 그린다).
 */
export const STUDIO_TEXT_RESOLUTION_MAX = 3;
/** 정수 해상도보다 이만큼(배율 기준) 더 크게 그려져도 다음 단계로 올리지 않는다. */
const UPSCALE_TOLERANCE = 0.1;
/** 해상도를 낮출 때만 쓰는 여유. 줌이 정수 경계 근처에서 떨어도 모든 글자를 매 프레임 다시 그리지 않게 한다. */
const SHRINK_MARGIN = 0.2;
/** Phaser.Scenes.Events.ADDED_TO_SCENE. 이 모듈은 Phaser 본체를 불러오지 않으려고 문자열로 둔다. */
const ADDED_TO_SCENE = "addedtoscene";

/** 글자 한 칸이 화면에서 차지하는 장치 픽셀 배율(카메라 줌 × 기기 배율)에 맞는 정수 해상도. */
export function studioTextResolutionForScale(screenScale: number): number {
  if (!Number.isFinite(screenScale) || screenScale <= 1) return 1;
  // 2.07배처럼 정수보다 조금 큰 배율은 한 단계 위(3배)로 올리지 않는다. 0.1배 안쪽의 늘어남은 눈에 띄지 않고, 글자 캔버스는 해상도의 제곱으로 커진다.
  return Math.min(STUDIO_TEXT_RESOLUTION_MAX, Math.max(1, Math.ceil(screenScale - UPSCALE_TOLERANCE)));
}

/** 이 런타임이 만지는 Phaser.GameObjects.Text의 최소 모양. */
interface ResolutionText {
  readonly type: string;
  readonly style: { readonly resolution: number };
  readonly frame?: { readonly source?: { resolution: number } } | null;
  setResolution(value: number): unknown;
  once(event: string, listener: () => void): unknown;
}

interface ResolutionEvents {
  on(event: string, listener: (object: ResolutionText) => void): unknown;
  off(event: string, listener: (object: ResolutionText) => void): unknown;
}

/**
 * 장면에 들어오는 모든 Text를 붙잡아 같은 해상도로 맞춘다. 만든 쪽이 더 높은 해상도를 골랐다면 그 값을 바닥으로 지킨다.
 * 픽셀 아트처럼 글자도 거칠게 두려는 화풍에서는 만들지 않는다.
 */
export class StudioTextResolutionRuntime {
  /** 글자 → 만들어질 때 고른 해상도(바닥값). */
  private readonly texts = new Map<ResolutionText, number>();
  private resolution = 1;
  private readonly onAdded = (object: ResolutionText): void => {
    if (object.type !== "Text" || this.texts.has(object)) return;
    const floor = Math.max(1, object.style.resolution);
    this.texts.set(object, floor);
    object.once("destroy", () => { this.texts.delete(object); });
    this.apply(object, floor);
  };

  constructor(private readonly events: ResolutionEvents) {
    events.on(ADDED_TO_SCENE, this.onAdded);
  }

  /** 지금 적용 중인 해상도. */
  get current(): number { return this.resolution; }

  /** 붙잡고 있는 글자 수(진단·테스트용). */
  get size(): number { return this.texts.size; }

  /** 화면 배율이 바뀌면 부른다. 정수 단계가 바뀔 때만 글자를 다시 그린다. */
  sync(screenScale: number): void {
    const wanted = studioTextResolutionForScale(screenScale);
    if (wanted === this.resolution) return;
    // 경계 근처에서 줄이는 것은 늦춘다. 올리는 것은 곧바로 해서 확대 중에도 흐려지지 않게 한다.
    if (wanted < this.resolution && studioTextResolutionForScale(screenScale + SHRINK_MARGIN) >= this.resolution) return;
    this.resolution = wanted;
    for (const [text, floor] of this.texts) this.apply(text, floor);
  }

  dispose(): void {
    this.events.off(ADDED_TO_SCENE, this.onAdded);
    this.texts.clear();
  }

  private apply(text: ResolutionText, floor: number): void {
    const target = Math.max(floor, this.resolution);
    if (text.style.resolution === target) return;
    text.setResolution(target);
    // WebGL은 style.resolution으로 나누지만 캔버스 렌더러는 텍스처 소스의 해상도로 나눈다. 둘을 함께 맞춘다.
    const source = text.frame?.source;
    if (source) source.resolution = target;
  }
}
