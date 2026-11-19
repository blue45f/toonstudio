export type StudioBg3dEnvironmentTheme =
  | "home"
  | "nature"
  | "hospitality"
  | "urban"
  | "education"
  | "healthcare"
  | "heritage"
  | "retail"
  | "transit"
  | "fantasy"
  | "science-fiction";

export interface StudioBg3dEnvironmentProvenance {
  readonly origin:
    | "original-procedural"
    | "original-procedural-with-cc0-sources"
    | "ai-generated-free-wallet";
  readonly author: "ToonStudio";
  readonly generator:
    | "scripts/blender/generate_environment_pack_v3.py"
    | "scripts/blender/generate_environment_pack_v4.py"
    | "scripts/blender/generate_environment_pack_v5.py"
    | "scripts/blender/generate_botanical_glasshouse.py"
    | "scripts/blender/generate_coastal_signal_station.py"
    | "scripts/blender/generate_botanical_specimen_room.py"
    | "scripts/blender/generate_harbor_boat_repair_shed.py"
    | "scripts/blender/refine_studio_environments_v6.py"
    | "scripts/blender/generate_studio_environment_expansion_v1.py"
    | "scripts/blender/refine_studio_environment_expansion_v2.py"
    | "scripts/blender/generate_environment_pack_v7.py"
    | "scripts/generate_self_authored_environment_pack_v1.py"
    | "official-tripo-mcp";
  readonly blenderVersion: "5.2" | "5.3";
  readonly license: "CC0-1.0" | "Tripo Terms of Service - Free User Output";
  readonly licenseUrl:
    | "https://creativecommons.org/publicdomain/zero/1.0/"
    | "https://www.tripo3d.ai/terms";
  readonly attributionRequired: false;
  readonly commercialUse: true;
  readonly externalResources: 0;
  readonly sources?: readonly string[];
  readonly provider?: "Tripo";
  readonly providerModelVersion?: "v3.0-20250812";
  readonly providerTaskId?: string;
  readonly promptSha256?: `sha256:${string}`;
  readonly nonExclusive?: true;
  readonly providerRetainsRights?: true;
  readonly billingMode?: "free-api-wallet";
  readonly paymentMethodUsed?: false;
  readonly creditCost?: number;
}

export interface StudioBg3dEnvironmentCamera {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fovDegrees: number;
}

export interface StudioBg3dEnvironmentAsset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly theme: StudioBg3dEnvironmentTheme;
  readonly tags: readonly string[];
  readonly fileName: `${string}.glb`;
  readonly url: `/assets/3d/environments/${string}.glb`;
  readonly thumbnailUrl: `/assets/3d/environments/${string}.png`;
  readonly byteSize: number;
  readonly sha256: `sha256:${string}`;
  /** Width, height, and depth in the glTF Y-up metre convention. */
  readonly bounds: readonly [number, number, number];
  readonly camera: StudioBg3dEnvironmentCamera;
  readonly detailCamera?: StudioBg3dEnvironmentCamera & {
    readonly subject: Readonly<{ ko: string; en: string }>;
  };
  readonly normalization: "authored-metres";
  readonly provenance: StudioBg3dEnvironmentProvenance;
}

// V6 개방형 세트는 열린 정면에서 가까운 옆벽 너머로 실내가 드러난다.
const REFINED_INTERIOR_POSITIONS = new Map<string, StudioBg3dEnvironmentCamera["position"]>([
  ["compact_apartment_interior.glb", [4.4, 6.8, 12.257243]],
  ["stylized_cafe_interior.glb", [5.7, 8.1, 16.250237]],
  ["classroom_art_studio.glb", [6.4, 9.4, 18.014439]],
]);

export function getRefinedEnvironmentCamera(asset: StudioBg3dEnvironmentAsset): StudioBg3dEnvironmentCamera {
  const position = REFINED_INTERIOR_POSITIONS.get(asset.fileName);
  return position ? { ...asset.camera, position } : asset.camera;
}

export const V3_PROVENANCE = Object.freeze({
  origin: "original-procedural",
  author: "ToonStudio",
  generator: "scripts/blender/generate_environment_pack_v3.py",
  blenderVersion: "5.2",
  license: "CC0-1.0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  attributionRequired: false,
  commercialUse: true,
  externalResources: 0,
} as const);

export function defineEnvironment(
  input: Omit<StudioBg3dEnvironmentAsset, "normalization" | "provenance">,
  provenance: StudioBg3dEnvironmentProvenance = V3_PROVENANCE,
): StudioBg3dEnvironmentAsset {
  return Object.freeze({
    ...input,
    tags: Object.freeze([...input.tags]),
    bounds: Object.freeze([...input.bounds]) as readonly [number, number, number],
    camera: freezeCamera(input.camera),
    ...(input.detailCamera && { detailCamera: Object.freeze({
      ...freezeCamera(input.detailCamera), subject: Object.freeze({ ...input.detailCamera.subject }),
    }) }),
    normalization: "authored-metres",
    provenance,
  });
}

function freezeCamera(camera: StudioBg3dEnvironmentCamera): StudioBg3dEnvironmentCamera {
  return Object.freeze({
    position: Object.freeze([...camera.position]) as readonly [number, number, number],
    target: Object.freeze([...camera.target]) as readonly [number, number, number],
    fovDegrees: camera.fovDegrees,
  });
}
