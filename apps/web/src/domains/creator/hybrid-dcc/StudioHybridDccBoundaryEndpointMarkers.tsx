import { useMemo } from "react";
import {
  studioHybridDccBoundaryEndpointMarkerPositions, studioHybridDccBoundaryEndpointMarkerRaycast,
  type StudioBoundaryEndpointLease,
} from "./studio-hybrid-dcc-boundary-endpoint";

import type { ColorRepresentation } from "three";
import type { StudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import type { StudioHybridDccViewportAssetSnapshot } from "./studio-hybrid-dcc-viewport-snapshot";

type SourceAsset = Pick<StudioHybridDccViewportAssetSnapshot, "assetId" | "mesh" | "meshHash" | "meshRevision">;

/** 실제 AssetMesh의 TRS group 안에 놓는다. 원점 한 점을 옮겨 f64 anchor를 보관하고 화면 크기는 일정하게 한다. */
export function StudioHybridDccBoundaryEndpointMarkers({ asset, selection, leases, color }: {
  readonly asset: SourceAsset;
  readonly selection: StudioHybridDccComponentSelection | undefined;
  readonly leases: readonly StudioBoundaryEndpointLease[];
  readonly color: ColorRepresentation;
}) {
  const markers = useMemo(() => studioHybridDccBoundaryEndpointMarkerPositions(asset, selection, leases), [asset, selection, leases]);
  return <>{markers.map((marker) => <points key={marker.key} position={marker.position} renderOrder={12} raycast={studioHybridDccBoundaryEndpointMarkerRaycast}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[new Float32Array(3), 3]} /></bufferGeometry>
    <pointsMaterial color={color} size={10} sizeAttenuation={false} depthTest={false} depthWrite={false} toneMapped={false} />
  </points>)}</>;
}
