/** GPU 재질의 생성·부착·폐기를 소유한다. 선택 강조가 작성한 툰 색을 덮지 않는다. */
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import { StudioHybridDccUvCheckerMaterial } from "../StudioHybridDccUvCheckerMaterial";

import type { StudioHybridDccToonBindings } from "./studio-hybrid-dcc-toon-projection";
import type { StudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";

interface SurfaceResources {
  readonly disposed: boolean;
  readonly body: readonly THREE.Material[];
  readonly outline: readonly THREE.Material[];
  readonly hasOutline: boolean;
  dispose(): void;
}
async function createResources(slots: readonly number[], bindings: StudioHybridDccToonBindings, color: string): Promise<SurfaceResources> {
  const { createStudioHybridDccToonMaterialRuntime } = await import("./studio-hybrid-dcc-toon-material-runtime");
  const body: THREE.Material[] = [], outline: THREE.Material[] = [], disposers: Array<() => void> = [];
  let hasOutline = false;
  try {
    for (const slot of slots) {
      const definition = bindings[String(slot)];
      if (definition) {
        const toon = createStudioHybridDccToonMaterialRuntime(definition); disposers.push(toon.dispose);
        body.push(toon.body);
        if (toon.outline) { outline.push(toon.outline); hasOutline = true; }
        else { const hidden = new THREE.MeshBasicMaterial({ visible: false }); outline.push(hidden); disposers.push(() => hidden.dispose()); }
      } else {
        const fallback = new THREE.MeshPhysicalMaterial({ color, roughness: 0.62, metalness: 0.08, clearcoat: 0.12, clearcoatRoughness: 0.78, side: THREE.DoubleSide });
        const hidden = new THREE.MeshBasicMaterial({ visible: false });
        body.push(fallback); outline.push(hidden); disposers.push(() => fallback.dispose(), () => hidden.dispose());
      }
    }
  } catch (cause) { disposers.forEach((dispose) => dispose()); throw cause; }
  let disposed = false;
  return { body, outline, hasOutline, get disposed() { return disposed; }, dispose: () => { if (!disposed) { disposed = true; disposers.forEach((dispose) => dispose()); } } };
}
const NO_RAYCAST = () => {};
function captureSurfaceRequest(json: string) {
  // 이 컴포넌트가 직접 생성한 JSON만 복원해 effect의 key와 실제 입력을 같은 불변 스냅샷으로 묶는다.
  const [color, entries] = JSON.parse(json) as [string, Array<[number, StudioHybridDccToonMaterial | null]>];
  return { color, slots: entries.map(([slot]) => slot), bindings: Object.fromEntries(entries.filter((entry): entry is [number, StudioHybridDccToonMaterial] => entry[1] !== null).map(([slot, material]) => [String(slot), material] as const)) };
}

export function StudioHybridDccSurfaceMaterial({ geometry, slots = [0], bindings = {}, color, wireColor, showMaterial, uvChecker, hasUv }: {
  readonly geometry: THREE.BufferGeometry; readonly slots?: readonly number[]; readonly bindings?: StudioHybridDccToonBindings;
  readonly color: string; readonly wireColor: string; readonly showMaterial: boolean; readonly uvChecker: boolean; readonly hasUv: boolean;
}) {
  const active = showMaterial && !(uvChecker && hasUv) && slots.some((slot) => Object.hasOwn(bindings, String(slot)));
  const json = JSON.stringify([color, slots.map((slot) => [slot, bindings[String(slot)] ?? null])]);
  const request = useMemo(() => captureSurfaceRequest(json), [json]);
  const key = `${active}:${json}`;
  const [state, setState] = useState<{ key: string; resources?: SurfaceResources; error?: string } | null>(null);
  useEffect(() => {
    if (!active) return;
    let disposed = false; let owned: SurfaceResources | undefined;
    void createResources(request.slots, request.bindings, request.color).then((resources) => {
      if (disposed) resources.dispose();
      else { owned = resources; setState({ key, resources }); }
    }).catch((cause: unknown) => {
      if (!disposed) setState({ key, error: cause instanceof Error ? cause.message : "툰 재질을 만들지 못했습니다." });
    });
    return () => { disposed = true; owned?.dispose(); };
  }, [active, key, request]);
  if (active && state?.key === key && state.error) throw new Error(state.error);
  const resources = active && state?.key === key && !state.resources?.disposed ? state.resources : undefined;
  if (!showMaterial) return <meshStandardMaterial color={wireColor} roughness={0.72} metalness={0.02} wireframe />;
  if (uvChecker && hasUv) return <StudioHybridDccUvCheckerMaterial />;
  if (!resources) return <meshPhysicalMaterial color={color} roughness={0.62} metalness={0.08} clearcoat={0.12} clearcoatRoughness={0.78} side={THREE.DoubleSide} />;
  return <>
    {resources.body.map((material, index) => <primitive key={material.uuid} object={material} attach={`material-${index}`} dispose={null} />)}
    {resources.hasOutline ? <mesh geometry={geometry} material={resources.outline.slice()} renderOrder={1} raycast={NO_RAYCAST} dispose={null} /> : null}
  </>;
}
