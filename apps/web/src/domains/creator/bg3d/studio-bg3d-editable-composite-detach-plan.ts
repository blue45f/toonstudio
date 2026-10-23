/**
 * Non-destructive 3D LT bundle detachment planner.
 *
 * The input is the complete success snapshot produced by `planStudioBg3dLtLayers`. This module
 * still revalidates the snapshot before replacing its dedicated LT bundle with the scene anchor
 * image. A successful detach keeps `bg3dScene`, so the ordinary image can be reopened in the 3D
 * editor; only the LT bundle/group association is removed. Every failure returns no partial state.
 */

import {
  isStudioBg3dLtPngDataUrl,
  STUDIO_BG3D_LT_LAYER_NAMES,
  STUDIO_BG3D_LT_LAYER_ROLES,
  type StudioBg3dLtImageElementLike,
  type StudioBg3dLtLayerPlanSuccess,
  type StudioBg3dLtPlannedLayer,
  type StudioBg3dLtLayerRole,
  type StudioBg3dLtPageElementLike,
} from "./studio-bg3d-lt-layer-plan";

import type { LayerGroup } from "../studio-layers";

const ID_PATTERN = /^\S{1,256}$/u;
const ROLE_SET = new Set<string>(STUDIO_BG3D_LT_LAYER_ROLES);

export interface StudioBg3dEditableCompositeDetachExpectation {
  /** Optional caller receipt used to reject a plan created for a different render generation. */
  readonly bundleId: string;
  readonly groupId: string;
  readonly anchorElementId: string;
}

export interface PlanStudioBg3dEditableCompositeDetachInput<
  TElement extends StudioBg3dLtPageElementLike,
> {
  /** An exact, successful LT layer plan. Its proposed arrays are never mutated. */
  readonly plan: StudioBg3dLtLayerPlanSuccess<TElement>;
  /** Flattened PNG captured from the same render generation as `plan`. */
  readonly compositePngDataUrl: string;
  readonly pageLocked?: boolean;
  /** When present, all three values must still identify this exact plan. */
  readonly expected?: StudioBg3dEditableCompositeDetachExpectation;
}

export type StudioBg3dEditableCompositeDetachErrorCode =
  | "page-locked.pageLocked"
  | "invalid-composite-png.compositePng"
  | "invalid-plan.detachPlanInvalid"
  | "invalid-plan.layerPlanInvalid"
  | "invalid-plan.duplicateLayerEntry"
  | "duplicate-element-id.duplicateElementId"
  | "duplicate-group-id.duplicateGroupId"
  | "stale-plan.backgroundChanged"
  | "stale-plan.anchorLayerChanged"
  | "stale-plan.anchorUnconfirmed"
  | "stale-plan.bundleChanged"
  | "invalid-bundle-element.nonImageElement"
  | "invalid-bundle-metadata.metadataMismatch"
  | "noncontiguous-bundle.noncontiguous"
  | "inconsistent-bundle-geometry.invalidGeometry"
  | "inconsistent-bundle-geometry.geometryMismatch"
  | "inconsistent-bundle-group.groupMismatch"
  | "missing-bundle-group.groupNotFound"
  | "mixed-bundle-group.otherLayer"
  | "mixed-bundle-group.unrelatedLayer"
  | "target-locked.layerLocked"
  | "bundle-group-locked.groupLocked"
  | "missing-scene.sceneUnconfirmed";

export interface StudioBg3dEditableCompositeDetachFailure {
  readonly ok: false;
  readonly code: StudioBg3dEditableCompositeDetachErrorCode;
  readonly params?: Readonly<Record<string, string>>;
}

export interface StudioBg3dEditableCompositeDetachSuccess<
  TElement extends StudioBg3dLtPageElementLike,
> {
  readonly ok: true;
  readonly anchorElementId: string;
  readonly detachedBundleId: string;
  readonly removedGroupId: string;
  readonly removedElementIds: readonly string[];
  readonly nextElements: TElement[];
  readonly nextGroups: LayerGroup[];
}

export type StudioBg3dEditableCompositeDetachResult<
  TElement extends StudioBg3dLtPageElementLike,
> =
  | StudioBg3dEditableCompositeDetachFailure
  | StudioBg3dEditableCompositeDetachSuccess<TElement>;

interface NormalizedGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly flipped: boolean;
  readonly flippedY: boolean;
  readonly skewX: number;
  readonly skewY: number;
}

function failure(
  code: StudioBg3dEditableCompositeDetachErrorCode
): StudioBg3dEditableCompositeDetachFailure {
  return { ok: false, code };
}

function isValidId(value: unknown): value is string {
  return (
    typeof value === "string"
    && ID_PATTERN.test(value)
    && ![...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127;
    })
  );
}

function isRole(value: unknown): value is StudioBg3dLtLayerRole {
  return typeof value === "string" && ROLE_SET.has(value);
}

function firstDuplicateId(values: readonly unknown[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (!isValidId(value)) return typeof value === "string" ? value : "";
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

function isImageElement<TScene>(
  value: StudioBg3dLtPageElementLike
): value is StudioBg3dLtImageElementLike<TScene> {
  const image = value as Partial<StudioBg3dLtImageElementLike<TScene>>;
  return (
    image.type === "image"
    && typeof image.src === "string"
    && typeof image.x === "number"
    && typeof image.y === "number"
    && typeof image.width === "number"
    && typeof image.height === "number"
  );
}

function finiteOptionalNumber(value: unknown, fallback = 0): number | null {
  if (value === undefined) return fallback;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function geometryOf<TScene>(
  image: StudioBg3dLtImageElementLike<TScene>
): NormalizedGeometry | null {
  const rotation = finiteOptionalNumber(image.rotation);
  const skewX = finiteOptionalNumber(image.skewX);
  const skewY = finiteOptionalNumber(image.skewY);
  if (
    !Number.isFinite(image.x)
    || !Number.isFinite(image.y)
    || !Number.isFinite(image.width)
    || !Number.isFinite(image.height)
    || image.width <= 0
    || image.height <= 0
    || rotation === null
    || skewX === null
    || skewY === null
    || (image.flipped !== undefined && typeof image.flipped !== "boolean")
    || (image.flippedY !== undefined && typeof image.flippedY !== "boolean")
  ) {
    return null;
  }
  return {
    x: image.x,
    y: image.y,
    width: image.width,
    height: image.height,
    rotation,
    flipped: image.flipped ?? false,
    flippedY: image.flippedY ?? false,
    skewX,
    skewY,
  };
}

function sameGeometry(left: NormalizedGeometry, right: NormalizedGeometry): boolean {
  return (
    left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height
    && left.rotation === right.rotation
    && left.flipped === right.flipped
    && left.flippedY === right.flippedY
    && left.skewX === right.skewX
    && left.skewY === right.skewY
  );
}

function withoutLtBundleMetadata<
  TElement extends StudioBg3dLtPageElementLike,
  TScene,
>(
  anchor: TElement & StudioBg3dLtImageElementLike<TScene>,
  compositePngDataUrl: string
): TElement {
  const next = { ...anchor, src: compositePngDataUrl } as unknown as Record<string, unknown>;
  for (const key of Object.keys(next)) {
    if (key === "groupId" || key.startsWith("bg3dLt")) Reflect.deleteProperty(next, key);
  }
  return next as unknown as TElement;
}

/**
 * Replaces one exact LT bundle with its flattened image while retaining the editable 3D scene.
 *
 * Sibling objects and their order are retained by reference. The anchor keeps its id, geometry,
 * name, custom image fields, and `bg3dScene`; only `src`, `groupId`, and all `bg3dLt*` fields change.
 */
export function planStudioBg3dEditableCompositeDetach<
  TElement extends StudioBg3dLtPageElementLike,
  TScene,
>(
  input: PlanStudioBg3dEditableCompositeDetachInput<TElement>
): StudioBg3dEditableCompositeDetachResult<TElement> {
  if (input.pageLocked) {
    return failure("page-locked.pageLocked");
  }
  if (!isStudioBg3dLtPngDataUrl(input.compositePngDataUrl)) {
    return failure("invalid-composite-png.compositePng");
  }

  const plan = input.plan;
  if (
    !plan
    || plan.ok !== true
    || !isValidId(plan.bundleId)
    || !isValidId(plan.groupId)
    || !isValidId(plan.anchorElementId)
    || !Number.isSafeInteger(plan.insertionIndex)
    || plan.insertionIndex < 0
    || (plan.renderMode !== "combined" && plan.renderMode !== "separated")
    || (plan.operation !== "insert"
      && plan.operation !== "update"
      && plan.operation !== "upgrade-legacy")
    || !Array.isArray(plan.layers)
    || plan.layers.length === 0
    || plan.layers.length > STUDIO_BG3D_LT_LAYER_ROLES.length
    || !Array.isArray(plan.nextElements)
    || !Array.isArray(plan.nextGroups)
  ) {
    return failure("invalid-plan.detachPlanInvalid");
  }

  const expected = input.expected;
  if (
    expected
    && (
      expected.bundleId !== plan.bundleId
      || expected.groupId !== plan.groupId
      || expected.anchorElementId !== plan.anchorElementId
    )
  ) {
    return failure("stale-plan.backgroundChanged");
  }

  if (firstDuplicateId(plan.nextElements.map((element) => element.id)) !== null) {
    return failure("duplicate-element-id.duplicateElementId");
  }
  if (firstDuplicateId(plan.nextGroups.map((group) => group.id)) !== null) {
    return failure("duplicate-group-id.duplicateGroupId");
  }

  const group = plan.nextGroups.find((candidate) => candidate.id === plan.groupId);
  if (!group) {
    return failure("missing-bundle-group.groupNotFound");
  }
  if (group.locked) {
    return failure("bundle-group-locked.groupLocked");
  }

  const plannedElementIds = new Set<string>();
  const plannedRoles = new Set<StudioBg3dLtLayerRole>();
  let plannedAnchorCount = 0;
  for (const layer of plan.layers as readonly StudioBg3dLtPlannedLayer[]) {
    if (
      !layer
      || !isRole(layer.role)
      || !isValidId(layer.elementId)
      || typeof layer.created !== "boolean"
      || typeof layer.sceneAnchor !== "boolean"
      || layer.name !== STUDIO_BG3D_LT_LAYER_NAMES[layer.role]
      || !isStudioBg3dLtPngDataUrl(layer.pngDataUrl)
    ) {
      return failure("invalid-plan.layerPlanInvalid");
    }
    if (plannedElementIds.has(layer.elementId) || plannedRoles.has(layer.role)) {
      return failure("invalid-plan.duplicateLayerEntry");
    }
    plannedElementIds.add(layer.elementId);
    plannedRoles.add(layer.role);
    if (layer.sceneAnchor) {
      plannedAnchorCount += 1;
      if (layer.elementId !== plan.anchorElementId) {
        return failure("stale-plan.anchorLayerChanged");
      }
    }
  }
  if (plannedAnchorCount !== 1 || !plannedElementIds.has(plan.anchorElementId)) {
    return failure("stale-plan.anchorUnconfirmed");
  }

  const bundleEntries = plan.nextElements
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => (
      element as TElement & Partial<StudioBg3dLtImageElementLike<TScene>>
    ).bg3dLtBundleId === plan.bundleId);
  const groupEntries = plan.nextElements.filter((element) => element.groupId === plan.groupId);

  if (groupEntries.some((element) => !plannedElementIds.has(element.id))) {
    return failure("mixed-bundle-group.otherLayer");
  }
  if (
    bundleEntries.length !== plannedElementIds.size
    || bundleEntries.some(({ element }) => !plannedElementIds.has(element.id))
    || [...plannedElementIds].some(
      (elementId) => !bundleEntries.some(({ element }) => element.id === elementId)
    )
  ) {
    return failure("stale-plan.bundleChanged");
  }
  if (bundleEntries.some(({ element }) => element.groupId !== plan.groupId)) {
    return failure("inconsistent-bundle-group.groupMismatch");
  }
  if (groupEntries.length !== bundleEntries.length) {
    return failure("mixed-bundle-group.unrelatedLayer");
  }

  const firstBundleIndex = bundleEntries[0]?.index;
  if (
    firstBundleIndex === undefined
    || firstBundleIndex !== plan.insertionIndex
    || bundleEntries.some(({ index }, offset) => index !== firstBundleIndex + offset)
  ) {
    return failure("noncontiguous-bundle.noncontiguous");
  }

  const layerByElementId = new Map(plan.layers.map((layer) => [layer.elementId, layer] as const));
  let commonGeometry: NormalizedGeometry | null = null;
  let anchor: (TElement & StudioBg3dLtImageElementLike<TScene>) | null = null;
  let sceneAnchorCount = 0;
  for (const { element } of bundleEntries) {
    if (!isImageElement<TScene>(element)) {
      return failure("invalid-bundle-element.nonImageElement");
    }
    if (element.locked) {
      return failure("target-locked.layerLocked");
    }
    const layer = layerByElementId.get(element.id);
    if (
      !layer
      || element.bg3dLtRole !== layer.role
      || element.bg3dLtRenderMode !== plan.renderMode
      || element.groupId !== plan.groupId
      || element.bg3dLtBundleId !== plan.bundleId
      || element.src !== layer.pngDataUrl
      || element.name !== layer.name
    ) {
      return failure("invalid-bundle-metadata.metadataMismatch");
    }

    const geometry = geometryOf(element);
    if (!geometry) {
      return failure("inconsistent-bundle-geometry.invalidGeometry");
    }
    if (commonGeometry && !sameGeometry(commonGeometry, geometry)) {
      return failure("inconsistent-bundle-geometry.geometryMismatch");
    }
    commonGeometry = geometry;

    if (element.bg3dScene !== undefined) {
      sceneAnchorCount += 1;
      if (element.id !== plan.anchorElementId || element.bg3dScene === null) {
        return failure("missing-scene.sceneUnconfirmed");
      }
      anchor = element as TElement & StudioBg3dLtImageElementLike<TScene>;
    }
  }
  if (!anchor || sceneAnchorCount !== 1) {
    return failure("missing-scene.sceneUnconfirmed");
  }

  const composite = withoutLtBundleMetadata(anchor, input.compositePngDataUrl);
  const removedElementIds = bundleEntries
    .map(({ element }) => element.id)
    .filter((elementId) => elementId !== plan.anchorElementId);
  const nextElements = plan.nextElements.flatMap((element) => {
    if (element.id === plan.anchorElementId) return [composite];
    return plannedElementIds.has(element.id) ? [] : [element];
  });
  const nextGroups = plan.nextGroups.filter((candidate) => candidate.id !== plan.groupId);

  return {
    ok: true,
    anchorElementId: plan.anchorElementId,
    detachedBundleId: plan.bundleId,
    removedGroupId: plan.groupId,
    removedElementIds,
    nextElements,
    nextGroups,
  };
}
