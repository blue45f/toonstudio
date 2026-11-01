/**
 * THESIS: 실제 편집 메시를 한눈에 읽는 정밀 검사대이며, 버튼 로그가 3D 결과를 대신하지 않는다.
 * OWN-WORLD: warm-ink 캔버스, 절제된 persimmon 선택선, 계측 그리드와 단단한 세그먼트 컨트롤.
 * STORY: 작가는 권위 메시를 회전·이동·확대하고, 에셋과 투영·표현 모드를 즉시 확인한다.
 * FIRST VIEWPORT: 실제 PBR 장면이 화면을 차지하고 상태·통계는 가장자리의 얇은 도구층에 머문다.
 * FORM: 기존 Studio 편집기 세계를 잇는 Operate형 로컬 확장; 파생 렌더 자원은 문서 권위를 갖지 않는다.
 */

import { ContactShadows } from "@react-three/drei/core/ContactShadows.js";
import { StudioHybridDccOrbitControls as OrbitControls } from "./StudioHybridDccOrbitControls";
import { OrthographicCamera } from "@react-three/drei/core/OrthographicCamera.js";
import { PerspectiveCamera } from "@react-three/drei/core/PerspectiveCamera.js";
import { Canvas, useThree } from "@react-three/fiber";
import {
  AlertTriangle,
  Boxes,
  Camera,
  CircleDashed,
  Cuboid,
  Expand,
  Layers,
  Move3d,
  Rotate3d,
  School,
  Triangle,
  Upload,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type {
  StudioHybridDccComponentMode,
  StudioHybridDccComponentSelection,
  StudioHybridDccSelectionMode,
  StudioHybridDccSelectionOperation,
} from "./studio-hybrid-dcc-component-selection";
import {
  STUDIO_HYBRID_DCC_OBJECT_TRANSFORM_REVISION,
  type StudioHybridDccObjectTransform,
} from "./studio-hybrid-dcc-object-transform";
import { frozenStatus2Text } from "../status-i18n/studio-frozen2-status-i18n";
import { createStudioHybridDccBoundaryOrbitGate, handleStudioHybridDccViewportMeshClick, type StudioHybridDccBoundaryEndpointPickHandler } from "./studio-hybrid-dcc-viewport-mesh-click";
import { createStudioHybridDccViewportPointerEvents } from "./studio-hybrid-dcc-viewport-pointer-events";
import { StudioHybridDccBoundaryEndpointMarkers } from "./StudioHybridDccBoundaryEndpointMarkers";
import type { StudioBoundaryEndpointLease } from "./studio-hybrid-dcc-boundary-endpoint";
import { createStudioHybridDccSelectionGate } from "./studio-hybrid-dcc-selection-gate";
import { selectStudioHybridDccComponentFaceOverlayIndices } from "./studio-hybrid-dcc-component-face-overlay";
import { detectStudioHybridDccWebglCapability } from "./studio-hybrid-dcc-webgl-probe";
import {
  resolveStudioHybridDccViewportShortcut,
  type StudioHybridDccStandardView,
  type StudioHybridDccViewportPreferences,
} from "./studio-hybrid-dcc-viewport-interaction";
import { StudioHybridDccCameraRig } from "./StudioHybridDccCameraRig";
import { StudioHybridDccTransformGizmo } from "./StudioHybridDccTransformGizmo";
import {
  SegmentedButton,
  StudioHybridDccCanvasBoundary,
  StudioHybridDccLocalEnvironment,
} from "./StudioHybridDccViewportParts";
import { StudioHybridDccViewportInteractionBar } from "./StudioHybridDccViewportInteractionBar";
import { useStudioHybridDccViewportPreferences } from "./useStudioHybridDccViewportPreferences";
import { DEFAULT_STUDIO_HYBRID_DCC_VIEWPORT_DESCRIPTION } from "./studio-hybrid-dcc-viewport-description";
import { StudioHybridDccSurfaceMaterial } from "./materials/StudioHybridDccSurfaceMaterial";
import type { StudioHybridDccToonMaterialPreview } from "./materials/studio-hybrid-dcc-toon-projection";
import { deriveStudioHybridDccViewportSnapshot, type StudioHybridDccViewportAssetSnapshot } from "./studio-hybrid-dcc-viewport-snapshot";
import { useStudioHybridDccSculptPointer } from "./useStudioHybridDccSculptPointer";
import type { StudioSculptGestureController } from "./studio-hybrid-dcc-sculpt-gesture";
import type { StudioSculptGeometryPreview } from "./studio-hybrid-dcc-sculpt-stroke-session";

import { createStudioHybridDccGeometryResource, type StudioHybridDccGeometryResource } from "./studio-hybrid-dcc-geometry-resource";
import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
// eslint-disable-next-line react-refresh/only-export-components -- 기존 순수 snapshot 공개 API를 유지한다.
export { deriveStudioHybridDccViewportSnapshot } from "./studio-hybrid-dcc-viewport-snapshot";
export type { StudioHybridDccViewportAssetSnapshot, StudioHybridDccViewportSnapshot, StudioHybridDccViewportRenderSource } from "./studio-hybrid-dcc-viewport-snapshot";

export type { StudioHybridDccGeometryResource } from "./studio-hybrid-dcc-geometry-resource";
export type { StudioHybridDccBoundaryEndpointPick, StudioHybridDccBoundaryEndpointPickHandler } from "./studio-hybrid-dcc-viewport-mesh-click";

export type StudioHybridDccViewportProjection = "perspective" | "orthographic";
export type StudioHybridDccViewportOverlay = "material" | "material-wire" | "wireframe";
export type StudioHybridDccTransformMode = "translate" | "rotate" | "scale";
export type StudioHybridDccTransformSpace = "world" | "local";
export type StudioHybridDccViewportView = StudioHybridDccStandardView;

export interface StudioHybridDccViewportProps {
  readonly workspace: StudioHybridDccWorkspace;
  readonly onSelectAsset: (assetId: string | null) => void;
  readonly projection?: StudioHybridDccViewportProjection;
  readonly defaultProjection?: StudioHybridDccViewportProjection;
  readonly onProjectionChange?: (projection: StudioHybridDccViewportProjection) => void;
  readonly overlay?: StudioHybridDccViewportOverlay;
  readonly defaultOverlay?: StudioHybridDccViewportOverlay;
  readonly onOverlayChange?: (overlay: StudioHybridDccViewportOverlay) => void;
  readonly reducedMotion?: boolean;
  readonly onCommitAssetTransform?: (
    assetId: string,
    transform: StudioHybridDccObjectTransform,
  ) => void;
  /** Reversible object commands supplied by the workspace shell. */
  readonly onDuplicateSelected?: () => void;
  readonly onDeleteSelected?: () => void;
  readonly componentSelection?: StudioHybridDccComponentSelection;
  readonly onComponentSelectionModeChange?: (mode: StudioHybridDccSelectionMode) => void;
  readonly onSelectComponent?: (
    assetId: string,
    mode: StudioHybridDccComponentMode,
    elementId: number,
    operation: StudioHybridDccSelectionOperation,
  ) => void;
  readonly onClearComponentSelection?: () => void;
  readonly onBoundaryEndpointPick?: StudioHybridDccBoundaryEndpointPickHandler;
  readonly boundaryEndpointMarkers?: readonly StudioBoundaryEndpointLease[];
  readonly onComponentSelectionError?: (message: string) => void;
  /** Keeps camera inspection available while preventing stale edits during async engine work. */
  readonly editingDisabled?: boolean;
  readonly interactionDescription?: string;
  /** UV 작업은 원본 코너를 검사하므로 수정자 캐시 대신 편집 메시를 표시한다. */
  readonly uvChecker?: boolean;
  readonly toonPreview?: StudioHybridDccToonMaterialPreview;
  readonly sculptPreview?: StudioSculptGeometryPreview;
  /** 새 gesture가 있으면 구 point callback을 중복 호출하지 않는다. */
  readonly sculptGesture?: StudioSculptGestureController;
  /**
   * 활성 조형 브러시. 주어지면 선택 오브젝트 위에서의 포인터 드래그가 로컬 좌표 스트로크로 전달된다.
   */
  readonly onSculptStroke?: (assetId: string, localPoint: {
    x: number;
    y: number;
    z: number;
  }) => void;
  readonly defaultTransformMode?: StudioHybridDccTransformMode;
  readonly defaultTransformSpace?: StudioHybridDccTransformSpace;
  /** Test/embedding override. `undefined` performs a browser WebGL capability probe after mount. */
  readonly webglAvailable?: boolean;
  readonly className?: string;
  /**
   * 첫 화면 무대 모드(빈 장면 안내가 함께 보일 때). 뷰포트를 더 크고 넓게 잡아
   * 조작 패널보다 3D 프리뷰가 첫 화면의 주인공이 되게 한다.
   */
  readonly stage?: boolean;
  /**
   * 빈 무대 오버레이의 시작 행동. 주어지면 비어 있는 3D 무대 위에서도 큐브·세트·가져오기를
   * 바로 실행할 수 있다(셀이 같은 핸들러를 안내 카드와 공유한다).
   */
  readonly onEmptyStart?: (kind: "cube" | "room" | "import") => void;
}


const STUDIO_HYBRID_DCC_RENDER_PROFILE = Object.freeze({
  colorSpace: THREE.SRGBColorSpace,
  toneMapping: THREE.ACESFilmicToneMapping,
  exposure: 1.08,
  shadowMapType: THREE.PCFShadowMap,
  minDpr: 1,
  maxDpr: 2,
  maxDetailedEdgeTriangles: 120_000,
});

export interface StudioHybridDccRendererProfileTarget {
  outputColorSpace: THREE.WebGLRenderer["outputColorSpace"];
  toneMapping: THREE.WebGLRenderer["toneMapping"];
  toneMappingExposure: number;
  readonly shadowMap: {
    enabled: boolean;
    type: THREE.WebGLRenderer["shadowMap"]["type"];
  };
}


const VIEWPORT_COLORS = Object.freeze({
  background: new THREE.Color().setHSL(0.105, 0.08, 0.105, THREE.SRGBColorSpace),
  gridMajor: new THREE.Color().setHSL(0.105, 0.08, 0.34, THREE.SRGBColorSpace),
  gridMinor: new THREE.Color().setHSL(0.105, 0.06, 0.23, THREE.SRGBColorSpace),
  material: new THREE.Color().setHSL(0.095, 0.24, 0.64, THREE.SRGBColorSpace),
  materialSelected: new THREE.Color().setHSL(0.065, 0.76, 0.57, THREE.SRGBColorSpace),
  wire: new THREE.Color().setHSL(0.105, 0.08, 0.72, THREE.SRGBColorSpace),
  wireSelected: new THREE.Color().setHSL(0.065, 0.92, 0.62, THREE.SRGBColorSpace),
  key: new THREE.Color().setHSL(0.10, 0.30, 0.88, THREE.SRGBColorSpace),
  fill: new THREE.Color().setHSL(0.58, 0.32, 0.72, THREE.SRGBColorSpace),
  rim: new THREE.Color().setHSL(0.065, 0.72, 0.65, THREE.SRGBColorSpace),
});

/** Surface의 문자열 계약에 맞추되 getStyle/getHex의 8비트 반올림 없이 같은 sRGB 색을 전달한다. */
function viewportPaletteCssColor(color: THREE.Color): string {
  const { h, s, l } = color.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
  return `hsl(${h * 360},${s * 100}%,${l * 100}%)`;
}

const OVERLAY_OPTIONS = Object.freeze([
  { id: "material", label: "재질" },
  { id: "material-wire", label: "재질+선" },
  { id: "wireframe", label: "와이어" },
] as const satisfies readonly {
  readonly id: StudioHybridDccViewportOverlay;
  readonly label: string;
}[]);

function classes(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}


function applyStudioHybridDccRendererProfile(
  renderer: StudioHybridDccRendererProfileTarget,
): void {
  renderer.outputColorSpace = STUDIO_HYBRID_DCC_RENDER_PROFILE.colorSpace;
  renderer.toneMapping = STUDIO_HYBRID_DCC_RENDER_PROFILE.toneMapping;
  renderer.toneMappingExposure = STUDIO_HYBRID_DCC_RENDER_PROFILE.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = STUDIO_HYBRID_DCC_RENDER_PROFILE.shadowMapType;
}

function resolveStudioHybridDccDpr(
  devicePixelRatio: number,
  qualityFactor: number,
): number {
  const device = Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1;
  const factor = Number.isFinite(qualityFactor) ? qualityFactor : 1;
  return Math.min(
    STUDIO_HYBRID_DCC_RENDER_PROFILE.maxDpr,
    Math.max(STUDIO_HYBRID_DCC_RENDER_PROFILE.minDpr, device * factor),
  );
}

interface StudioHybridDccComponentOverlayResource {
  readonly geometry: THREE.BufferGeometry;
  readonly mode: StudioHybridDccComponentMode;
  dispose(): void;
}

function createStudioHybridDccComponentOverlayResource(
  asset: StudioHybridDccViewportAssetSnapshot,
  mode: StudioHybridDccComponentMode,
  elementIds: readonly number[],
): StudioHybridDccComponentOverlayResource | null {
  if (elementIds.length === 0) return null;
  const verticesById = new Map(asset.mesh.vertices.map((vertex) => [vertex.id, vertex]));
  const geometry = new THREE.BufferGeometry();

  if (mode === "face") {
    const selectedIndices = selectStudioHybridDccComponentFaceOverlayIndices(asset, elementIds);
    if (!selectedIndices) {
      geometry.dispose();
      return null;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(asset.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(selectedIndices, 1));
  } else if (mode === "edge") {
    const halfEdgesById = new Map(asset.mesh.halfEdges.map((halfEdge) => [halfEdge.id, halfEdge]));
    const positions: number[] = [];
    for (const edgeId of elementIds) {
      const halfEdge = halfEdgesById.get(edgeId);
      const previous = halfEdge ? halfEdgesById.get(halfEdge.prev) : undefined;
      const start = previous ? verticesById.get(previous.vertex) : undefined;
      const end = halfEdge ? verticesById.get(halfEdge.vertex) : undefined;
      if (!start || !end) continue;
      positions.push(
        start.position.x,
        start.position.y,
        start.position.z,
        end.position.x,
        end.position.y,
        end.position.z,
      );
    }
    if (positions.length === 0) {
      geometry.dispose();
      return null;
    }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  } else {
    const positions: number[] = [];
    for (const vertexId of elementIds) {
      const vertex = verticesById.get(vertexId);
      if (!vertex) continue;
      positions.push(vertex.position.x, vertex.position.y, vertex.position.z);
    }
    if (positions.length === 0) {
      geometry.dispose();
      return null;
    }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  }

  geometry.computeBoundingSphere();
  return {
    geometry,
    mode,
    dispose: () => geometry.dispose(),
  };
}

function StudioHybridDccComponentOverlay({
  asset,
  elementIds,
  mode,
}: {
  readonly asset: StudioHybridDccViewportAssetSnapshot;
  readonly elementIds: readonly number[];
  readonly mode: StudioHybridDccComponentMode;
}) {
  const [resource, setResource] = useState<StudioHybridDccComponentOverlayResource | null>(null);
  const elementSignature = elementIds.join(",");

  useEffect(() => {
    const next = createStudioHybridDccComponentOverlayResource(asset, mode, elementIds);
    setResource(next);
    return () => next?.dispose();
  }, [asset, elementIds, elementSignature, mode]);

  if (!resource) return null;
  if (resource.mode === "face") {
    return (
      <mesh geometry={resource.geometry} renderOrder={2}>
        <meshBasicMaterial
          color={VIEWPORT_COLORS.wireSelected}
          depthTest depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-4}
          polygonOffsetUnits={-4}
          transparent
          opacity={0.42}
          side={THREE.DoubleSide}
        />
      </mesh>
    );
  }
  if (resource.mode === "edge") {
    return (
      <lineSegments geometry={resource.geometry} renderOrder={7}>
        <lineBasicMaterial
          color={VIEWPORT_COLORS.wireSelected}
          depthTest={false}
          transparent
          opacity={1}
        />
      </lineSegments>
    );
  }
  return (
    <points geometry={resource.geometry} renderOrder={8}>
      <pointsMaterial
        color={VIEWPORT_COLORS.wireSelected}
        depthTest={false}
        size={8}
        sizeAttenuation={false}
      />
    </points>
  );
}

function StudioHybridDccAssetMesh({
  asset,
  onCommitTransform,
  overlay,
  selected,
  onSelect,
  onSelectComponent,
  onBoundaryEndpointPick,
  boundaryEndpointMarkers,
  componentSelection,
  canSelect,
  onSelectionError,
  selectionElementIds,
  selectionMode,
  editingDisabled,
  transformMode,
  transformSpace,
  preferences,
  uvChecker,
  onDraggingChange,
  onNotice,
  sculptStroke,
  sculptGesture,
}: {
  readonly asset: StudioHybridDccViewportAssetSnapshot;
  readonly onCommitTransform?: (
    assetId: string,
    transform: StudioHybridDccObjectTransform,
  ) => void;
  readonly overlay: StudioHybridDccViewportOverlay;
  readonly selected: boolean;
  readonly onSelect: (assetId: string) => void;
  readonly onSelectComponent?: (
    assetId: string,
    mode: StudioHybridDccComponentMode,
    elementId: number,
    operation: StudioHybridDccSelectionOperation,
  ) => void;
  readonly onSelectionError?: (message: string) => void;
  readonly onBoundaryEndpointPick?: StudioHybridDccBoundaryEndpointPickHandler;
  readonly boundaryEndpointMarkers?: readonly StudioBoundaryEndpointLease[];
  readonly componentSelection?: StudioHybridDccComponentSelection;
  readonly canSelect: () => boolean;
  readonly selectionElementIds: readonly number[];
  readonly selectionMode: StudioHybridDccSelectionMode;
  readonly editingDisabled: boolean;
  readonly transformMode: StudioHybridDccTransformMode;
  readonly transformSpace: StudioHybridDccTransformSpace;
  readonly preferences: StudioHybridDccViewportPreferences;
  readonly uvChecker: boolean;
  readonly onDraggingChange: (dragging: boolean) => void;
  readonly onNotice: (message: string) => void;
  /** 활성화되면 포인터 드래그가 오브젝트 로컬 좌표로 조형 스트로크를 보낸다. */
  readonly sculptStroke?: (localPoint: { x: number; y: number; z: number }) => void;
  readonly sculptGesture?: StudioSculptGestureController;
}) {
  const [resource, setResource] = useState<StudioHybridDccGeometryResource | null>(null);
  const objectRef = useRef<THREE.Group>(null);
  const viewportSize = useThree((state) => state.size);
  const { indices, normalMode, positions, cornerUvs, cornerNormals, triangleMaterialSlots } = asset;
  const sculptPointer = useStudioHybridDccSculptPointer({ assetId: asset.assetId, sourceMesh: asset.mesh,
    sourceMeshHash: asset.meshHash, sourceMeshRevision: asset.meshRevision, objectRef,
    controller: sculptGesture, legacyStroke: sculptStroke, onDraggingChange });

  useEffect(() => {
    const next = createStudioHybridDccGeometryResource({ indices, normalMode, positions, cornerUvs, cornerNormals, triangleMaterialSlots }, STUDIO_HYBRID_DCC_RENDER_PROFILE.maxDetailedEdgeTriangles);
    setResource(next);
    return () => next.dispose();
  }, [indices, normalMode, positions, cornerUvs, cornerNormals, triangleMaterialSlots]);

  if (!resource) return null;
  const componentCage = selectionMode !== "object";
  const showMaterial = overlay !== "wireframe";
  const showWireOverlay = overlay === "material-wire" || componentCage || (uvChecker && selected);

  const object = (
    <group
      ref={objectRef}
      position={asset.position}
      rotation={asset.rotationEulerRad}
      scale={asset.scale}
    >
      <mesh
        geometry={resource.geometry}
        castShadow
        receiveShadow
        {...sculptPointer}
        onClick={(event) => handleStudioHybridDccViewportMeshClick(event, { asset, selectionMode, editingDisabled,
          sculpting: Boolean(sculptGesture || sculptStroke), canSelect, viewportSize, onSelect, onSelectComponent,
          onSelectionError, onBoundaryEndpointPick })}
      >
        <StudioHybridDccSurfaceMaterial geometry={resource.geometry} slots={resource.materialSlots} bindings={asset.toonMaterials}
          color={asset.materialColor ?? viewportPaletteCssColor(selected ? VIEWPORT_COLORS.materialSelected : VIEWPORT_COLORS.material)}
          wireColor={viewportPaletteCssColor(selected ? VIEWPORT_COLORS.wireSelected : VIEWPORT_COLORS.wire)} showMaterial={showMaterial} uvChecker={uvChecker} hasUv={Boolean(cornerUvs)} />
      </mesh>
      {showWireOverlay ? (
        <mesh geometry={resource.geometry} renderOrder={3}>
          <meshBasicMaterial
            color={selected ? VIEWPORT_COLORS.wireSelected : VIEWPORT_COLORS.wire}
            depthTest
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
            transparent
            opacity={selected ? 0.84 : componentCage ? 0.58 : 0.42} toneMapped={false}
            wireframe
          />
        </mesh>
      ) : null}
      {selected ? (
        <lineSegments geometry={resource.edges} renderOrder={4}>
          <lineBasicMaterial
            color={VIEWPORT_COLORS.wireSelected}
            depthTest={false}
            transparent
            opacity={1}
          />
        </lineSegments>
      ) : null}
      {selected && selectionMode !== "object" && selectionElementIds.length > 0 ? (
        <StudioHybridDccComponentOverlay
          asset={asset}
          elementIds={selectionElementIds}
          mode={selectionMode}
        />
      ) : null}
      {boundaryEndpointMarkers?.length ? <StudioHybridDccBoundaryEndpointMarkers asset={asset} selection={componentSelection} leases={boundaryEndpointMarkers} color={VIEWPORT_COLORS.wireSelected} /> : null}
    </group>
  );
  if (editingDisabled || sculptGesture || sculptStroke || !selected || !onCommitTransform || selectionMode !== "object") {
    return object;
  }
  return (
    <StudioHybridDccTransformGizmo
      objectRef={objectRef}
      source={{
        assetId: asset.assetId,
        geometryStamp: `${asset.meshHash}:${asset.meshRevision}:${asset.renderHash}`,
        transform: {
          revision: STUDIO_HYBRID_DCC_OBJECT_TRANSFORM_REVISION,
          position: asset.position, rotationEulerRad: asset.rotationEulerRad, scale: asset.scale,
        },
      }}
      mode={transformMode}
      space={transformSpace}
      preferences={preferences}
      onCommit={onCommitTransform}
      onDraggingChange={onDraggingChange}
      onNotice={onNotice}
    >
      {object}
    </StudioHybridDccTransformGizmo>
  );
}


function StudioHybridDccWebglLifecycle({
  onContextLostChange,
}: {
  readonly onContextLostChange: (lost: boolean) => void;
}) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (event: Event) => {
      event.preventDefault();
      onContextLostChange(true);
    };
    const onRestored = () => {
      applyStudioHybridDccRendererProfile(gl);
      onContextLostChange(false);
      invalidate();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [gl, invalidate, onContextLostChange]);

  return null;
}

function StudioHybridDccLightRig({ radius }: { readonly radius: number }) {
  const reach = Math.max(4, radius * 2.6);
  const shadowSpan = Math.max(8, radius * 1.8);
  return (
    <>
      <hemisphereLight args={[VIEWPORT_COLORS.key, VIEWPORT_COLORS.background, 0.72]} />
      <directionalLight
        castShadow
        color={VIEWPORT_COLORS.key}
        intensity={3.6}
        position={[reach, reach * 1.35, reach * 0.72]}
        shadow-bias={-0.00018}
        shadow-camera-bottom={-shadowSpan}
        shadow-camera-far={reach * 5}
        shadow-camera-left={-shadowSpan}
        shadow-camera-near={0.1}
        shadow-camera-right={shadowSpan}
        shadow-camera-top={shadowSpan}
        shadow-mapSize-height={1024}
        shadow-mapSize-width={1024}
        shadow-radius={2}
      />
      <directionalLight
        color={VIEWPORT_COLORS.fill}
        intensity={1.35}
        position={[-reach, reach * 0.58, reach * 0.4]}
      />
      <directionalLight
        color={VIEWPORT_COLORS.rim}
        intensity={2.1}
        position={[0, reach, -reach]}
      />
    </>
  );
}

function usePrefersReducedMotion(explicit: boolean | undefined): boolean {
  const [systemPreference, setSystemPreference] = useState(false);
  useEffect(() => {
    if (explicit !== undefined || typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemPreference(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, [explicit]);
  return explicit ?? systemPreference;
}

export function StudioHybridDccViewport({
  workspace,
  onSelectAsset,
  projection,
  defaultProjection = "perspective",
  onProjectionChange,
  overlay,
  defaultOverlay = "material",
  onOverlayChange,
  reducedMotion,
  onCommitAssetTransform,
  componentSelection,
  onClearComponentSelection,
  onComponentSelectionError,
  onComponentSelectionModeChange,
  onDeleteSelected,
  onDuplicateSelected,
  onSelectComponent,
  onBoundaryEndpointPick,
  boundaryEndpointMarkers,
  editingDisabled = false,
  interactionDescription = DEFAULT_STUDIO_HYBRID_DCC_VIEWPORT_DESCRIPTION,
  uvChecker = false,
  toonPreview,
  sculptPreview,
  sculptGesture,
  onSculptStroke,
  defaultTransformMode = "translate",
  defaultTransformSpace = "world",
  webglAvailable,
  className,
  stage = false,
  onEmptyStart,
}: StudioHybridDccViewportProps) {
  const bt = useBilingual("StudioHybridDccViewport");
  const [uncontrolledProjection, setUncontrolledProjection] =
    useState<StudioHybridDccViewportProjection>(defaultProjection);
  const [uncontrolledOverlay, setUncontrolledOverlay] =
    useState<StudioHybridDccViewportOverlay>(defaultOverlay);
  const [contextLost, setContextLost] = useState(false);
  const [transformMode, setTransformMode] =
    useState<StudioHybridDccTransformMode>(defaultTransformMode);
  const [transformSpace, setTransformSpace] =
    useState<StudioHybridDccTransformSpace>(defaultTransformSpace);
  const [viewPreset, setViewPreset] = useState<StudioHybridDccViewportView>("isometric");
  const [frameTarget, setFrameTarget] = useState<"scene" | "selection">("scene");
  const [frameRevision, setFrameRevision] = useState(0);
  const [orientationRevision, setOrientationRevision] = useState(0);
  const [isolatedAssetId, setIsolatedAssetId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [interactionNotice, setInteractionNotice] = useState("");
  const draggingRef = useRef(false);
  const selectionGateRef = useRef<ReturnType<typeof createStudioHybridDccSelectionGate<ReturnType<typeof setTimeout>>> | null>(null);
  const [orbitGate] = useState(() => createStudioHybridDccBoundaryOrbitGate(() => selectionGateRef.current?.suppress()));
  useEffect(() => {
    const gate = createStudioHybridDccSelectionGate(setTimeout, clearTimeout);
    selectionGateRef.current = gate;
    return () => { gate.dispose(); };
  }, []);
  const { preferences, patchPreferences, setPreferences } = useStudioHybridDccViewportPreferences();
  const [detectedWebgl, setDetectedWebgl] = useState<boolean | null>(webglAvailable ?? null);
  const viewportRef = useRef<HTMLElement>(null);
  const descriptionId = useId();
  const effectiveProjection = projection ?? uncontrolledProjection;
  const effectiveOverlay = overlay ?? uncontrolledOverlay;
  const effectiveTransformSpace = transformMode === "scale" ? "local" : transformSpace;
  const prefersReducedMotion = usePrefersReducedMotion(reducedMotion);
  const effectiveSelectionMode = componentSelection?.mode ?? "object";
  const snapshot = useMemo(
    () => deriveStudioHybridDccViewportSnapshot(workspace, effectiveSelectionMode, uvChecker || Boolean(sculptGesture || onSculptStroke), toonPreview, sculptPreview),
    [workspace, effectiveSelectionMode, uvChecker, toonPreview, sculptPreview, sculptGesture, onSculptStroke],
  );
  const isolationMatchesSelection = !workspace.activeAssetId || workspace.activeAssetId === isolatedAssetId;
  const isolatedAsset = isolationMatchesSelection
    ? snapshot.assets.find((asset) => asset.assetId === isolatedAssetId) ?? null : null;
  const renderedAssets = isolatedAsset ? [isolatedAsset] : snapshot.assets;
  const selectedAssetId = snapshot.assets.some((asset) => asset.assetId === workspace.activeAssetId)
    ? workspace.activeAssetId
    : null;
  const selectedAsset = selectedAssetId
    ? snapshot.assets.find((asset) => asset.assetId === selectedAssetId) ?? null
    : null;
  const selectedElementIds = componentSelection
    && componentSelection.mode !== "object"
    && componentSelection.provenance?.assetId === selectedAssetId
    && componentSelection.provenance.meshRevision === selectedAsset?.meshRevision
    && componentSelection.provenance.sourceHash === selectedAsset?.meshHash
      ? componentSelection.elementIds
      : [];
  useEffect(() => {
    if (isolatedAssetId && !isolatedAsset) {
      setIsolatedAssetId(null);
      setInteractionNotice("격리 대상이나 선택이 바뀌어 전체 보기로 돌아왔습니다.");
    }
  }, [isolatedAssetId, isolatedAsset]);
  const effectiveFrameTarget = frameTarget === "selection" && selectedAsset ? "selection" : "scene";
  const framedCenter: readonly [number, number, number] = effectiveFrameTarget === "selection"
    ? [
        (selectedAsset!.worldMin[0] + selectedAsset!.worldMax[0]) / 2,
        (selectedAsset!.worldMin[1] + selectedAsset!.worldMax[1]) / 2,
        (selectedAsset!.worldMin[2] + selectedAsset!.worldMax[2]) / 2,
      ]
    : snapshot.center;
  const framedRadius = effectiveFrameTarget === "selection"
    ? Math.max(0.25, Math.hypot(
        selectedAsset!.worldMax[0] - selectedAsset!.worldMin[0],
        selectedAsset!.worldMax[1] - selectedAsset!.worldMin[1],
        selectedAsset!.worldMax[2] - selectedAsset!.worldMin[2],
      ) / 2)
    : snapshot.radius;
  const renderSources = new Set(snapshot.assets.map((asset) => asset.renderSource));
  const viewportRenderSource = snapshot.assets.length === 0
    ? "empty"
    : renderSources.size === 1
      ? snapshot.assets[0]!.renderSource
      : "mixed";
  const leadingDiagnostic = snapshot.errors[0] ?? snapshot.warnings[0] ?? null;
  const devicePixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  const maxDpr = resolveStudioHybridDccDpr(devicePixelRatio, 1);

  useEffect(() => {
    if (webglAvailable !== undefined) {
      setDetectedWebgl(webglAvailable);
      return;
    }
    setDetectedWebgl(detectStudioHybridDccWebglCapability());
  }, [webglAvailable]);

  const changeProjection = (next: StudioHybridDccViewportProjection) => {
    if (projection === undefined) setUncontrolledProjection(next);
    onProjectionChange?.(next);
  };
  const changeOverlay = (next: StudioHybridDccViewportOverlay) => {
    if (overlay === undefined) setUncontrolledOverlay(next);
    onOverlayChange?.(next);
  };
  const changeView = (next: StudioHybridDccViewportView) => {
    setViewPreset(next);
    setOrientationRevision((current) => current + 1);
    setFrameRevision((current) => current + 1);
    if (next !== "isometric") changeProjection("orthographic");
  };
  const frameScene = () => {
    setFrameTarget("scene");
    setFrameRevision((current) => current + 1);
  };
  const frameSelection = () => {
    if (!selectedAsset) return;
    setFrameTarget("selection");
    setFrameRevision((current) => current + 1);
  };

  const toggleIsolation = () => {
    if (draggingRef.current) return;
    if (isolatedAssetId) {
      setIsolatedAssetId(null);
      setFrameTarget("scene");
      setInteractionNotice("전체 보기 · 문서의 숨김 상태는 변경하지 않았습니다.");
    } else if (selectedAsset) {
      setIsolatedAssetId(selectedAsset.assetId);
      setFrameTarget("selection");
      setInteractionNotice(`${selectedAsset.assetId}만 보기 · / 키로 전체 보기`);
    } else return;
    setFrameRevision((current) => current + 1);
  };
  const changeDragging = (active: boolean) => {
    draggingRef.current = active;
    setDragging(active);
    if (!active) selectionGateRef.current?.suppress();
  };
  const selectionAllowed = () => !editingDisabled && !draggingRef.current && orbitGate.allows()
    && (selectionGateRef.current?.allows() ?? true);
  const pickingBoundary = Boolean(onBoundaryEndpointPick);
  useEffect(() => () => orbitGate.end(), [orbitGate, effectiveProjection, contextLost, pickingBoundary]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const handleViewportShortcut = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !viewport.contains(target)) return;
      // Shift+Tab remains normal backwards focus navigation on toolbar controls.
      if (event.shiftKey && event.key === "Tab" && !(target instanceof HTMLCanvasElement)
        && !target.closest('[role="application"]')) return;
      const action = resolveStudioHybridDccViewportShortcut(event, {
        textEntry: Boolean(target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"]')),
        selected: Boolean(selectedAsset), editingDisabled: editingDisabled || Boolean(sculptGesture || onSculptStroke),
        objectMode: effectiveSelectionMode === "object", canTransform: Boolean(onCommitAssetTransform),
        canSelectComponents: Boolean(onComponentSelectionModeChange) && !onBoundaryEndpointPick, canDuplicate: Boolean(onDuplicateSelected) && !onBoundaryEndpointPick,
        canDelete: Boolean(onDeleteSelected) && !onBoundaryEndpointPick, dragging: draggingRef.current,
      });
      if (!action) return;
      if (action.kind === "toggle-isolation" && !isolatedAssetId && !selectedAsset) return;
      event.preventDefault();
      switch (action.kind) {
        case "view":
          setViewPreset(action.view);
          setOrientationRevision((current) => current + 1);
          setFrameRevision((current) => current + 1);
          if (projection === undefined) setUncontrolledProjection("orthographic");
          onProjectionChange?.("orthographic");
          break;
        case "frame":
          setFrameTarget(action.target);
          setFrameRevision((current) => current + 1);
          break;
        case "toggle-projection": {
          const next = effectiveProjection === "perspective" ? "orthographic" : "perspective";
          if (projection === undefined) setUncontrolledProjection(next);
          onProjectionChange?.(next);
          break;
        }
        case "toggle-snap": setPreferences((current) => ({ ...current, snapping: !current.snapping })); break;
        case "toggle-isolation":
          setIsolatedAssetId(isolatedAssetId ? null : selectedAsset!.assetId);
          setFrameTarget(isolatedAssetId ? "scene" : "selection");
          setFrameRevision((current) => current + 1);
          break;
        case "transform": setTransformMode(action.mode); break;
        case "selection": onComponentSelectionModeChange?.(action.mode); break;
        case "duplicate": onDuplicateSelected?.(); break;
        case "delete": onDeleteSelected?.(); break;
      }
    };
    viewport.addEventListener("keydown", handleViewportShortcut);
    return () => viewport.removeEventListener("keydown", handleViewportShortcut);
  }, [onCommitAssetTransform, onDeleteSelected, onDuplicateSelected,
    onComponentSelectionModeChange, onBoundaryEndpointPick, onProjectionChange, projection, effectiveProjection,
    selectedAsset, editingDisabled, effectiveSelectionMode, onSculptStroke, sculptGesture, isolatedAssetId, setPreferences]);

  return (
    <>
    <section
      ref={viewportRef}
      aria-label="Hybrid DCC 3D 작업 뷰포트"
      aria-describedby={descriptionId}
      className={classes(
        stage
          ? "relative isolate h-[clamp(26rem,64dvh,46rem)] min-h-80 w-full overflow-hidden rounded-2xl border border-line bg-canvas text-fg"
          : "relative isolate h-[clamp(20rem,58dvh,42rem)] min-h-80 w-full overflow-hidden rounded-2xl border border-line bg-canvas text-fg",
        "shadow-[0_18px_48px_oklch(0.08_0.008_70/0.34)]",
        className,
      )}
      data-studio-hybrid-dcc-viewport="true"
      data-stage={stage ? "true" : undefined}
      data-projection={effectiveProjection}
      data-overlay={effectiveOverlay}
      data-context-lost={contextLost ? "true" : "false"}
      data-transform-mode={transformMode}
      data-transform-space={effectiveTransformSpace}
      data-selection-mode={effectiveSelectionMode}
      data-selected-elements={selectedElementIds.length}
      data-editing-disabled={editingDisabled ? "true" : "false"}
      data-view-preset={viewPreset}
      data-frame-target={effectiveFrameTarget}
      data-render-source={viewportRenderSource}
      data-render-signature={snapshot.signature}
      data-isolated-asset={isolatedAsset?.assetId ?? ""}
      data-visible-assets={renderedAssets.length}
      data-snapping={preferences.snapping ? "true" : "false"}
      data-dragging={dragging ? "true" : "false"}
      data-frame-revision={frameRevision}
    >
      <p id={descriptionId} className="sr-only">
        {interactionDescription}
      </p>

      {detectedWebgl === true && (snapshot.assets.length > 0 || snapshot.errors.length === 0) ? (
        <StudioHybridDccCanvasBoundary>
          <Canvas
            role="group"
            aria-label="편집 메시 3D 렌더"
            aria-describedby={descriptionId}
            tabIndex={0}
            dpr={[STUDIO_HYBRID_DCC_RENDER_PROFILE.minDpr, maxDpr]}
            frameloop="demand"
            events={createStudioHybridDccViewportPointerEvents}
            gl={{
              alpha: false,
              antialias: true,
              powerPreference: "high-performance",
            }}
            shadows={{ enabled: true, type: STUDIO_HYBRID_DCC_RENDER_PROFILE.shadowMapType }}
            onCreated={({ gl }) => {
              applyStudioHybridDccRendererProfile(gl);
              // 실제 WebGL Canvas가 포인터·키보드 편집과 접근성 이름을 소유한다.
              gl.domElement.setAttribute("role", "application");
              gl.domElement.setAttribute("aria-label", "편집 메시 3D 렌더");
              gl.domElement.setAttribute("aria-describedby", descriptionId);
              gl.domElement.tabIndex = 0;
            }}
            onPointerMissed={() => {
              if (onBoundaryEndpointPick || !selectionAllowed()) return;
              if (effectiveSelectionMode === "object") onSelectAsset(null);
              else onClearComponentSelection?.();
            }}
          >
            <color attach="background" args={[VIEWPORT_COLORS.background]} />
            {effectiveProjection === "orthographic" ? (
              <OrthographicCamera makeDefault near={0.001} far={10_000} position={[5, 4, 6]} />
            ) : (
              <PerspectiveCamera makeDefault fov={42} near={0.001} far={10_000} position={[5, 4, 6]} />
            )}
            <OrbitControls
              makeDefault
              enabled={!dragging}
              enableDamping={!prefersReducedMotion}
              dampingFactor={0.08}
              enablePan
              enableRotate
              enableZoom
              minDistance={0.05}
              maxDistance={Math.max(120, snapshot.radius * 24)}
              regress
              onStart={() => orbitGate.start(Boolean(onBoundaryEndpointPick))} onChange={() => orbitGate.change()} onEnd={() => orbitGate.end()}
            />
            <StudioHybridDccCameraRig
              center={framedCenter}
              radius={framedRadius}
              intent={{ revision: frameRevision, orientationRevision, view: viewPreset }}
              sceneCenter={snapshot.center}
              sceneRadius={snapshot.radius}
            />
            <StudioHybridDccLocalEnvironment />
            <StudioHybridDccWebglLifecycle onContextLostChange={setContextLost} />
            <StudioHybridDccLightRig radius={snapshot.radius} />

            <group>
              {preferences.showGrid ? <gridHelper
                args={[
                  snapshot.gridSize,
                  Math.min(96, Math.max(12, snapshot.gridSize * 2)),
                  VIEWPORT_COLORS.gridMajor,
                  VIEWPORT_COLORS.gridMinor,
                ]}
                position={[0, -0.002, 0]}
              /> : null}
              {preferences.showAxes ? <axesHelper args={[Math.max(1.2, snapshot.radius * 0.22)]} position={[0, 0.012, 0]} /> : null}
              {preferences.showGround ? <mesh
                receiveShadow
                rotation-x={-Math.PI / 2}
                position={[0, -0.006, 0]}
              >
                <planeGeometry args={[snapshot.gridSize, snapshot.gridSize]} />
                <shadowMaterial transparent opacity={0.2} depthWrite={false} />
              </mesh> : null}
            </group>

            {renderedAssets.map((asset) => (
              <StudioHybridDccAssetMesh
                key={(sculptGesture || onSculptStroke) && asset.assetId === selectedAssetId
                  ? `${asset.assetId}:sculpt` : `${asset.assetId}:${asset.renderHash}:${asset.renderSource}`}
                asset={asset}
                overlay={effectiveOverlay}
                uvChecker={uvChecker}
                selected={asset.assetId === selectedAssetId}
                canSelect={selectionAllowed}
                onBoundaryEndpointPick={onBoundaryEndpointPick}
                boundaryEndpointMarkers={boundaryEndpointMarkers}
                componentSelection={componentSelection}
                onSelect={(assetId) => { if (selectionAllowed()) onSelectAsset(assetId); }}
                onSelectComponent={onSelectComponent
                  ? (...args) => { if (selectionAllowed()) onSelectComponent(...args); }
                  : undefined}
                onSelectionError={onComponentSelectionError}
                selectionElementIds={selectedElementIds}
                selectionMode={effectiveSelectionMode}
                editingDisabled={editingDisabled}
                onCommitTransform={onCommitAssetTransform}
                transformMode={transformMode}
                transformSpace={effectiveTransformSpace}
                preferences={preferences}
                onDraggingChange={changeDragging}
                onNotice={setInteractionNotice}
                sculptGesture={asset.assetId === selectedAssetId ? sculptGesture : undefined}
                sculptStroke={onSculptStroke && asset.assetId === selectedAssetId
                  ? (localPoint) => onSculptStroke(asset.assetId, localPoint)
                  : undefined}
              />
            ))}
            {preferences.showGround ? <ContactShadows
              key={snapshot.signature}
              position={[snapshot.center[0], 0.004, snapshot.center[2]]}
              color={VIEWPORT_COLORS.background}
              opacity={0.38}
              scale={snapshot.gridSize * 0.82}
              blur={2.4}
              far={Math.max(4, snapshot.radius * 3)}
              resolution={prefersReducedMotion ? 256 : 512}
              frames={1}
              depthWrite={false}
            /> : null}
          </Canvas>
        </StudioHybridDccCanvasBoundary>
      ) : detectedWebgl === null ? (
        <div className="absolute inset-0 grid place-items-center px-5 text-center" role="status">
          <div className="max-w-sm">
            <CircleDashed className="mx-auto mb-3 animate-spin text-fg-3 motion-reduce:animate-none" size={26} aria-hidden="true" />
            <p className="text-sm font-semibold text-fg">{frozenStatus2Text("studio.frozenStatus2.hybrid.rendererChecking", "3D 렌더러를 확인하는 중입니다.")}</p>
          </div>
        </div>
      ) : detectedWebgl === false ? (
        // 장면이 비어 있어도 알린다: 미지원 브라우저에서 큐브를 만든 뒤에야 알게 되면 헛수고가 된다.
        <div className="absolute inset-0 grid place-items-center px-5 text-center" role="alert">
          <div className="max-w-sm">
            <AlertTriangle className="mx-auto mb-3 text-warn" size={26} aria-hidden="true" />
            <p className="text-sm font-semibold text-fg">{frozenStatus2Text("studio.frozenStatus2.hybrid.webglUnavailable", "WebGL 3D 렌더링을 사용할 수 없습니다.")}</p>
            <p className="mt-1 text-xs leading-relaxed text-fg-2">
              {frozenStatus2Text("studio.frozenStatus2.hybrid.webglUnavailableDetail", "브라우저의 하드웨어 가속을 켠 뒤 뷰포트를 다시 열어 주세요. 편집 메시 원본은 변경되지 않았습니다.")}
            </p>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center px-5 text-center">
          <div className="max-w-sm">
            <AlertTriangle className="mx-auto mb-3 text-bad" size={26} aria-hidden="true" />
            <p className="text-sm font-semibold text-fg">{frozenStatus2Text("studio.frozenStatus2.hybrid.noDisplayableMesh", "표시할 수 있는 메시가 없습니다.")}</p>
            <p className="mt-1 text-xs leading-relaxed text-fg-2">
              {snapshot.errors[0]?.message
                ?? frozenStatus2Text("studio.frozenStatus2.hybrid.meshDiagnosticFallback", "메시 진단을 실행해 잘못된 정점 또는 면을 복구해 주세요.")}
            </p>
          </div>
        </div>
      )}

      {/* 빈 무대 오버레이(웨이브 18 셸 재설계): 비어 있어도 그리드 무대(Canvas)는 그대로 보이고,
          안내는 무대 위에 겹친 카드로만 알린다. 이전에는 빈 장면에서 Canvas 자체를 띄우지 않아
          첫 화면에서 3D 공간의 주제(그리드·축)가 전혀 읽히지 않았다. 오류가 있는 장면은
          지금까지처럼 캔버스 없는 오류 안내가 우선한다(위 분기). */}
      {snapshot.assets.length === 0 && snapshot.errors.length === 0 && detectedWebgl === true ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-5 text-center"
          data-studio-hybrid-dcc-empty-stage="true"
        >
          <div className="pointer-events-auto max-w-sm rounded-2xl border border-line bg-panel/90 px-5 py-4 shadow-[0_18px_48px_oklch(0.08_0.008_70/0.34)] backdrop-blur">
            <CircleDashed className="mx-auto mb-3 text-fg-3" size={26} aria-hidden="true" />
            <p className="text-sm font-semibold text-fg">{frozenStatus2Text("studio.frozenStatus2.hybrid.emptyStage", "3D 작업대가 비어 있습니다.")}</p>
            <p className="mt-1 text-xs leading-relaxed text-fg-2">{frozenStatus2Text("studio.frozenStatus2.hybrid.emptyStageDesc", "큐브를 추가하거나 모델을 가져오면 실제 편집 메시가 여기에 나타납니다.")}</p>
            {onEmptyStart ? (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  disabled={editingDisabled}
                  data-studio-hybrid-dcc-empty-start="cube"
                  onClick={() => onEmptyStart("cube")}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent shadow-sm transition-colors hover:bg-accent-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Cuboid size={16} aria-hidden="true" />
                  큐브로 시작
                </button>
                <button
                  type="button"
                  disabled={editingDisabled}
                  data-studio-hybrid-dcc-empty-start="room"
                  onClick={() => onEmptyStart("room")}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 text-sm font-semibold text-fg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <School size={16} aria-hidden="true" />
                  교실 세트로 시작
                </button>
                <button
                  type="button"
                  disabled={editingDisabled}
                  data-studio-hybrid-dcc-empty-start="import"
                  onClick={() => onEmptyStart("import")}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-card px-4 text-sm font-semibold text-fg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Upload size={16} aria-hidden="true" />
                  3D 파일 가져오기
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-2 p-2 sm:p-3">
        <div className="pointer-events-auto rounded-xl border border-line bg-panel/95 px-3 py-2 shadow-[0_8px_22px_oklch(0.08_0.008_70/0.28)]">
          <div className="flex items-center gap-2">
            <Boxes size={15} className="text-accent" aria-hidden="true" />
            <span className="text-xs font-semibold text-fg">3D 작업 뷰</span>
          </div>
          <p className="mt-0.5 font-[var(--font-display)] text-[0.66rem] tabular-nums text-fg-2" aria-live="polite">
            V {snapshot.totalVertices.toLocaleString("ko-KR")} · △ {snapshot.totalTriangles.toLocaleString("ko-KR")}
          </p>
          <p className="mt-0.5 text-[0.62rem] text-fg-3">
            {effectiveSelectionMode === "object"
              ? snapshot.assets.some(({ renderSource }) => renderSource === "modifier-cache")
                ? "검증된 변형 결과 표시"
                : "편집 원본 표시"
              : "안정 ID 원본 케이지"}
          </p>
        </div>

        <div className="pointer-events-auto flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-panel/95 p-1 shadow-[0_8px_22px_oklch(0.08_0.008_70/0.28)]">
          {onComponentSelectionModeChange ? (
            <>
              <div className="flex shrink-0 gap-1" role="group" aria-label="메시 선택 모드">
                {([
                  { id: "object", label: "오브젝트", accessible: "오브젝트 선택 모드 (4)" },
                  { id: "vertex", label: "점", accessible: "꼭짓점 선택 모드 (1)" },
                  { id: "edge", label: "선", accessible: "모서리 선택 모드 (2)" },
                  { id: "face", label: "면", accessible: "면 선택 모드 (3)" },
                ] as const).map((option) => (
                  <SegmentedButton
                    key={option.id}
                    active={effectiveSelectionMode === option.id}
                    disabled={editingDisabled || Boolean(onBoundaryEndpointPick) || (option.id !== "object" && !selectedAsset)}
                    label={option.accessible}
                    onClick={() => { if (!onBoundaryEndpointPick) onComponentSelectionModeChange(option.id); }}
                  >
                    {option.label}
                  </SegmentedButton>
                ))}
              </div>
              <span className="my-1 w-px shrink-0 bg-line" aria-hidden="true" />
            </>
          ) : null}
          {onCommitAssetTransform && effectiveSelectionMode === "object" ? (
            <>
              <div className="flex shrink-0 gap-1" role="group" aria-label="오브젝트 변환 도구">
                <SegmentedButton
                  active={transformMode === "translate"}
                  disabled={editingDisabled}
                  label="이동 도구 (G)"
                  onClick={() => setTransformMode("translate")}
                >
                  <Move3d size={14} aria-hidden="true" /> 이동
                </SegmentedButton>
                <SegmentedButton
                  active={transformMode === "rotate"}
                  disabled={editingDisabled}
                  label="회전 도구 (R)"
                  onClick={() => setTransformMode("rotate")}
                >
                  <Rotate3d size={14} aria-hidden="true" /> 회전
                </SegmentedButton>
                <SegmentedButton
                  active={transformMode === "scale"}
                  disabled={editingDisabled}
                  label="크기 조절 도구 (S)"
                  onClick={() => setTransformMode("scale")}
                >
                  <Expand size={14} aria-hidden="true" /> 크기
                </SegmentedButton>
                <SegmentedButton
                  active={effectiveTransformSpace === "local"}
                  disabled={editingDisabled || transformMode === "scale"}
                  label={effectiveTransformSpace === "local" ? "로컬 좌표계" : "월드 좌표계"}
                  onClick={() => setTransformSpace((current) => current === "world" ? "local" : "world")}
                >
                  {effectiveTransformSpace === "local" ? "Local" : "World"}
                </SegmentedButton>
              </div>
              <span className="my-1 w-px shrink-0 bg-line" aria-hidden="true" />
            </>
          ) : null}
          <div className="flex shrink-0 gap-1" role="group" aria-label="투영 방식">
            <SegmentedButton
              active={effectiveProjection === "perspective"}
              label="원근 투영"
              onClick={() => changeProjection("perspective")}
            >
              <Camera size={14} aria-hidden="true" /> 원근
            </SegmentedButton>
            <SegmentedButton
              active={effectiveProjection === "orthographic"}
              label="직교 투영"
              onClick={() => changeProjection("orthographic")}
            >
              <Layers size={14} aria-hidden="true" /> 직교
            </SegmentedButton>
          </div>
          <span className="my-1 w-px shrink-0 bg-line" aria-hidden="true" />
          <div className="flex shrink-0 gap-1" role="group" aria-label="표준 보기와 화면 맞춤">
            {([
              { id: "isometric", label: "등각", accessible: "등각 보기" },
              { id: "front", label: "앞", accessible: "정면 보기 (숫자 키패드 1)" },
              { id: "right", label: "오른쪽", accessible: "우측 보기 (숫자 키패드 3)" },
              { id: "top", label: "위", accessible: "상단 보기 (숫자 키패드 7)" },
              { id: "back", label: "뒤", accessible: "후면 보기 (Ctrl+숫자 키패드 1)" },
              { id: "left", label: "왼쪽", accessible: "좌측 보기 (Ctrl+숫자 키패드 3)" },
              { id: "bottom", label: "아래", accessible: "하단 보기 (Ctrl+숫자 키패드 7)" },
            ] as const).map((option) => (
              <SegmentedButton
                key={option.id}
                active={viewPreset === option.id}
                label={option.accessible}
                onClick={() => changeView(option.id)}
              >
                {option.label}
              </SegmentedButton>
            ))}
            <SegmentedButton
              active={effectiveFrameTarget === "scene"}
              label="전체 장면 화면 맞춤 (Home)"
              onClick={frameScene}
            >
              전체 맞춤
            </SegmentedButton>
            <SegmentedButton
              active={effectiveFrameTarget === "selection"}
              disabled={!selectedAsset}
              label="선택 오브젝트 화면 맞춤 (마침표)"
              onClick={frameSelection}
            >
              선택 맞춤
            </SegmentedButton>
          </div>
          <span className="my-1 w-px shrink-0 bg-line" aria-hidden="true" />
          <div className="flex shrink-0 gap-1" role="group" aria-label="표현 모드">
            {OVERLAY_OPTIONS.map((option) => (
              <SegmentedButton
                key={option.id}
                active={effectiveOverlay === option.id}
                label={`${option.label} 표현`}
                onClick={() => changeOverlay(option.id)}
              >
                {option.id === "material" ? (
                  <Boxes size={14} aria-hidden="true" />
                ) : option.id === "material-wire" ? (
                  <Layers size={14} aria-hidden="true" />
                ) : (
                  <Triangle size={14} aria-hidden="true" />
                )}
                {option.label}
              </SegmentedButton>
            ))}
          </div>
        </div>
      </div>

      {snapshot.assets.length > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 p-2 sm:p-3">
          <div role="group" className="pointer-events-auto flex max-w-[min(72%,34rem)] gap-1 overflow-x-auto rounded-xl border border-line bg-panel/95 p-1 shadow-[0_8px_22px_oklch(0.08_0.008_70/0.28)]" aria-label="뷰포트 에셋">
            {renderedAssets.map((asset) => {
              const selected = asset.assetId === selectedAssetId;
              return (
                <button
                  key={asset.assetId}
                  type="button"
                  aria-pressed={selected}
                  data-material-id={asset.materialId}
                  data-render-hash={asset.renderHash}
                  data-render-source={asset.renderSource}
                  disabled={editingDisabled || Boolean(onBoundaryEndpointPick)}
                  onClick={() => { if (!onBoundaryEndpointPick && selectionAllowed()) onSelectAsset(asset.assetId); }}
                  className={classes(
                    "min-h-11 max-w-40 shrink-0 rounded-lg border px-2.5 text-left transition-colors motion-reduce:transition-none sm:pointer-fine:min-h-9",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    selected
                      ? "border-accent/55 bg-accent-soft text-accent"
                      : "border-transparent text-fg-2 hover:border-line hover:bg-raised hover:text-fg",
                  )}
                >
                  <span className="block truncate text-[0.7rem] font-semibold">{asset.assetId}</span>
                  <span className="block font-[var(--font-display)] text-[0.62rem] tabular-nums opacity-75">
                    {asset.triangleCount.toLocaleString("ko-KR")} tris · {
                      asset.renderSource === "sculpt-preview"
                        ? bt("조형 미리보기", "Sculpt preview")
                        : asset.renderSource === "modifier-cache"
                        ? "변형 결과"
                        : asset.renderSource === "authority-edit-cage"
                          ? "원본 케이지"
                          : asset.renderSource === "authority-cache-fallback"
                            ? "원본 대체"
                            : "편집 원본"
                    }
                  </span>
                </button>
              );
            })}
          </div>
          <div className="hidden rounded-lg border border-line bg-panel/95 px-2.5 py-1.5 text-[0.64rem] text-fg-2 min-[390px]:block">
            {effectiveSelectionMode === "object"
              ? "G 이동 · R 회전 · S 크기 · Shift+D 복제 · Delete 삭제"
              : `${effectiveSelectionMode === "vertex" ? "꼭짓점" : effectiveSelectionMode === "edge" ? "모서리" : "면"} ${selectedElementIds.length}개 선택 · Shift 추가 · Ctrl 전환 · Alt 빼기`}
          </div>
        </div>
      ) : null}

      <p className="sr-only" aria-live="polite" data-studio-hybrid-dcc-selection-announcement="true">
        {effectiveSelectionMode === "object"
          ? selectedAssetId
            ? `${selectedAssetId} 오브젝트 선택됨`
            : "선택한 오브젝트 없음"
          : `${effectiveSelectionMode === "vertex" ? "꼭짓점" : effectiveSelectionMode === "edge" ? "모서리" : "면"} ${selectedElementIds.length}개 선택됨`}
      </p>

      {(snapshot.errors.length > 0 || snapshot.warnings.length > 0)
        && snapshot.assets.length > 0 ? (
        <div className="absolute bottom-16 right-2 z-20 max-w-[min(calc(100%-1rem),24rem)] rounded-lg border border-warn/45 bg-panel px-3 py-2 text-xs text-warn sm:bottom-16 sm:right-3" role="status">
          <span className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle size={14} aria-hidden="true" />
            {snapshot.errors.length > 0
              ? `${snapshot.errors.length}개 메시를 제외했습니다.`
              : `${snapshot.warnings.length}개 변형 미리보기를 원본으로 대체했습니다.`}
            {snapshot.errors.length > 0 && snapshot.warnings.length > 0
              ? ` · 원본 대체 ${snapshot.warnings.length}개`
              : null}
          </span>
          <span className="mt-0.5 block truncate text-[0.66rem] text-fg-2">
            {leadingDiagnostic?.assetId}: {leadingDiagnostic?.message}
          </span>
        </div>
      ) : null}

      {contextLost ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-canvas/95 px-5 text-center" role="alert">
          <div className="max-w-sm">
            <AlertTriangle className="mx-auto mb-3 text-warn" size={26} aria-hidden="true" />
            <p className="text-sm font-semibold text-fg">{frozenStatus2Text("studio.frozenStatus2.hybrid.contextLost", "그래픽 컨텍스트가 중단되었습니다.")}</p>
            <p className="mt-1 text-xs leading-relaxed text-fg-2">
              {frozenStatus2Text("studio.frozenStatus2.hybrid.contextLostDetail", "브라우저가 WebGL을 복구할 때까지 3D 미리보기를 잠시 멈췄습니다.")}
            </p>
          </div>
        </div>
      ) : null}
    </section>
    <StudioHybridDccViewportInteractionBar
      preferences={preferences}
      onChange={patchPreferences}
      isolatedAssetId={isolatedAsset?.assetId ?? null}
      hasSelection={Boolean(selectedAsset)}
      dragging={dragging}
      onToggleIsolation={toggleIsolation}
      notice={interactionNotice}
    />
    </>
  );
}
