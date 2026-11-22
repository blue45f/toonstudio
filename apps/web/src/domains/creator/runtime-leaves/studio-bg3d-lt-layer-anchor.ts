/**
 * 3D LT 분리 레이어의 역할 열거와 장면 앵커 승계 헬퍼.
 *
 * 편집기의 레이어 삭제·연결 3D 문서 메타데이터가 `creator/bg3d` 전체 플래너를 정적으로
 * 끌어오지 않도록 최소 순수 계약을 분리한다.
 */

export const STUDIO_BG3D_LT_LAYER_ROLES = ["color", "tone", "shadow", "depth", "texture-line", "main-line"] as const;

/** Back-to-front order. The last available role is the editable-scene anchor. */
export type StudioBg3dLtLayerRole = (typeof STUDIO_BG3D_LT_LAYER_ROLES)[number];

export type StudioBg3dLtRenderMode = "separated" | "combined";

/** The smallest shape shared by every StudioPage element. */
export interface StudioBg3dLtPageElementLike {
  readonly id: string;
  readonly type: string;
  readonly groupId?: string;
  readonly locked?: boolean;
}

/**
 * Image fields owned by this planner. StudioPage's ImageEl is structurally compatible after it
 * declares the three bg3dLt* metadata fields used for subsequent bundle discovery.
 */
export interface StudioBg3dLtImageElementLike<TScene = unknown>
  extends StudioBg3dLtPageElementLike {
  readonly type: "image";
  readonly src: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation?: number;
  readonly flipped?: boolean;
  readonly flippedY?: boolean;
  readonly skewX?: number;
  readonly skewY?: number;
  readonly name?: string;
  readonly layerRole?: string;
  readonly bg3dScene?: TScene;
  readonly bg3dLtBundleId?: string;
  readonly bg3dLtRole?: StudioBg3dLtLayerRole;
  readonly bg3dLtRenderMode?: StudioBg3dLtRenderMode;
}

const ROLE_SET = new Set<string>(STUDIO_BG3D_LT_LAYER_ROLES);
const ID_PATTERN = /^\S{1,256}$/u;

function isValidAnchorId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ID_PATTERN.test(value) &&
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127;
    })
  );
}

function isBg3dLtRole(value: unknown): value is StudioBg3dLtLayerRole {
  return typeof value === "string" && ROLE_SET.has(value);
}

function isBg3dLtImageElement<TScene>(
  value: StudioBg3dLtPageElementLike,
): value is StudioBg3dLtImageElementLike<TScene> {
  const image = value as Partial<StudioBg3dLtImageElementLike<TScene>>;
  return (
    image.type === "image" &&
    typeof image.src === "string" &&
    typeof image.x === "number" &&
    typeof image.y === "number" &&
    typeof image.width === "number" &&
    typeof image.height === "number"
  );
}

/**
 * Keeps a separated bundle editable when its sole scene-anchor layer is deleted but other bundle
 * layers remain. The highest remaining paint role is promoted without mutating either input.
 * Corrupt bundles with zero or multiple source anchors are deliberately left untouched.
 */
export function preserveStudioBg3dLtSceneAnchorAfterRemoval<
  TElement extends StudioBg3dLtPageElementLike,
  TScene,
>(before: readonly TElement[], after: TElement[]): TElement[] {
  const sourceAnchors = new Map<
    string,
    Array<TElement & StudioBg3dLtImageElementLike<TScene>>
  >();
  for (const element of before) {
    if (!isBg3dLtImageElement<TScene>(element) || !isValidAnchorId(element.bg3dLtBundleId)) continue;
    if (element.bg3dScene === undefined) continue;
    const anchors = sourceAnchors.get(element.bg3dLtBundleId) ?? [];
    anchors.push(element as TElement & StudioBg3dLtImageElementLike<TScene>);
    sourceAnchors.set(element.bg3dLtBundleId, anchors);
  }

  let next = after;
  for (const [bundleId, anchors] of sourceAnchors) {
    if (anchors.length !== 1) continue;
    const remaining = after
      .map((element, index) => ({ element, index }))
      .filter(
        (entry): entry is {
          element: TElement & StudioBg3dLtImageElementLike<TScene>;
          index: number;
        } =>
          isBg3dLtImageElement<TScene>(entry.element) &&
          entry.element.bg3dLtBundleId === bundleId &&
          isBg3dLtRole(entry.element.bg3dLtRole),
      );
    if (remaining.length === 0 || remaining.some(({ element }) => element.bg3dScene !== undefined)) {
      continue;
    }
    const promoted = remaining.reduce((best, candidate) => {
      const bestPriority = STUDIO_BG3D_LT_LAYER_ROLES.indexOf(best.element.bg3dLtRole!);
      const candidatePriority = STUDIO_BG3D_LT_LAYER_ROLES.indexOf(candidate.element.bg3dLtRole!);
      return candidatePriority >= bestPriority ? candidate : best;
    });
    if (next === after) next = [...after];
    next[promoted.index] = {
      ...promoted.element,
      bg3dScene: anchors[0]!.bg3dScene,
    } as TElement;
  }
  return next;
}
