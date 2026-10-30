/** 원본 GLB metadata만 원래 index와 함께 보관한다. 현재 scene의 편집 메시 권위로 승격하지 않는다. */
import { readStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";
import { STUDIO_BG3D_GLB_MAX_BYTES, STUDIO_BG3D_GLB_MAX_JSON_BYTES } from "./studio-bg3d-glb-validation";
import { assertSceneGlbActive, StudioBg3dSceneGlbGraphError } from "./studio-bg3d-scene-glb-errors";

export interface StudioBg3dSceneGlbOriginalMetadata {
  readonly format: "toonstudio.original-glb-metadata";
  readonly version: 1;
  readonly sourceRoot: Readonly<Record<string, unknown>>;
  readonly indexed: Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>;
}
export interface StudioBg3dSceneGlbSourceMetadata {
  readonly attachmentHash: string;
  readonly metadata: StudioBg3dSceneGlbOriginalMetadata;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function metadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return { ...(Object.hasOwn(value, "extras") ? { extras: value.extras } : {}),
    ...(Object.hasOwn(value, "extensions") ? { extensions: value.extensions } : {}) };
}
export async function readStudioBg3dSceneGlbSourceMetadata(
  input: Uint8Array, expectedHash: string, expectedBytes: number, nodeId: string, signal?: AbortSignal,
): Promise<StudioBg3dSceneGlbSourceMetadata> {
  assertSceneGlbActive(signal);
  const fail = () => new StudioBg3dSceneGlbGraphError("asset-mismatch", [nodeId]);
  if (!(input instanceof Uint8Array) || input.byteLength < 20 || input.byteLength !== expectedBytes
    || input.byteLength > STUDIO_BG3D_GLB_MAX_BYTES) throw fail();
  const bytes = Uint8Array.from(input);
  if (new DataView(bytes.buffer).getUint32(12, true) > STUDIO_BG3D_GLB_MAX_JSON_BYTES) throw fail();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  assertSceneGlbActive(signal);
  const hash = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  if (hash !== expectedHash) throw fail();
  let root: Record<string, unknown>;
  try { root = readStudioVrmExportGlb(bytes).json; } catch { throw fail(); }
  const sourceRoot = { ...metadata(root), ...(isRecord(root.asset) ? { asset: root.asset } : {}),
    ...(root.extensionsUsed ? { extensionsUsed: root.extensionsUsed } : {}), ...(root.extensionsRequired ? { extensionsRequired: root.extensionsRequired } : {}) };
  const indexed: Record<string, Record<string, unknown>[]> = {};
  for (const key of ["scenes", "nodes", "meshes", "materials", "textures", "images", "animations", "cameras", "skins", "accessors", "bufferViews", "buffers"]) {
    const entries: unknown = root[key];
    if (!Array.isArray(entries)) continue;
    const values = entries.flatMap((entry: unknown, index: number) => {
      const primitiveMetadata = isRecord(entry) && Array.isArray(entry.primitives) ? entry.primitives.flatMap((primitive: unknown, primitiveIndex: number) => {
        const data = metadata(primitive); return Object.keys(data).length ? [{ index: primitiveIndex, ...data }] : [];
      }) : [];
      const data = metadata(entry);
      return Object.keys(data).length || primitiveMetadata.length ? [{ index, ...data, ...(primitiveMetadata.length ? { primitives: primitiveMetadata } : {}) }] : [];
    });
    if (values.length) indexed[key] = values;
  }
  return { attachmentHash: hash, metadata: { format: "toonstudio.original-glb-metadata", version: 1, sourceRoot, indexed } };
}
