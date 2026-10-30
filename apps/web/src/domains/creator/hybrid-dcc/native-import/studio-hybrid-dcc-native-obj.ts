/** 외부 자원을 읽지 않고 OBJ polygon을 실제 편집 가능한 half-edge 자산으로 복원한다. */
import { createStudioEditableMeshFromPolygons, validateStudioEditableMeshSerializableAuthority, type StudioMeshVec3 } from "../../studio-editable-half-edge-mesh";
import { STUDIO_GEOMETRY_MAX_ABSOLUTE_COORDINATE } from "../../studio-geometry-authority";
import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../../mesh-uv/studio-mesh-uv-authority";
import { createStudioHybridDccIdentityTransform } from "../studio-hybrid-dcc-object-transform";

import { STUDIO_NATIVE_IMPORT_MAX_ASSETS, STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES, STUDIO_NATIVE_IMPORT_MAX_WORKING_BYTES, studioNativeImportFailure, type StudioNativeImportAsset, type StudioNativeImportIssue, type StudioNativeImportResult } from "./studio-hybrid-dcc-native-import-contracts";
import { estimateStudioNativeObjPartBytes, estimateStudioNativeObjWorkingBytes } from "./studio-hybrid-dcc-native-obj-budget";
import { studioNativeObjPolygonLoops } from "./studio-hybrid-dcc-native-obj-polygons";
import { assertStudioNativeUvPrecision, StudioNativeUvPrecisionError } from "./studio-hybrid-dcc-native-uv-precision";

export const STUDIO_NATIVE_OBJ_LIMITS = Object.freeze({ maxLineCharacters: 65_536, maxLines: 2_000_000, maxTokens: 6_000_000,
  maxPolygonWork: 10_000_000, maxSourceFaceCorners: 4096, maxMaterials: 4096, maxNameCharacters: 512 });
interface Corner { readonly vertex: number; readonly uv: number | null }
interface Face { readonly corners: readonly Corner[]; readonly material: number; readonly smooth: boolean; readonly line: number }
interface Part { readonly baseKey: string; readonly objectIndex: number; readonly name: string; readonly uv: boolean; readonly faces: Face[];
  readonly vertices: Set<number>; cornerCount: number; estimatedBytes: number }
class ObjError extends Error {
  constructor(readonly code: string, message: string, readonly line?: number) { super(message); }
}
function abort(code: string, detail: string, line?: number): never { throw new ObjError(code, detail, line); }
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;
function scalar(token: string | undefined, line: number): number {
  if (token === undefined || !NUMBER.test(token)) abort("obj-invalid-number", "OBJ에 올바르지 않은 숫자 표현이 있습니다.", line);
  const value = Number(token);
  if (!Number.isFinite(value)) abort("obj-invalid-number", "OBJ 좌표는 유한한 숫자여야 합니다.", line);
  return value === 0 ? 0 : value;
}
function index(token: string | undefined, count: number, line: number): number {
  if (!token || !/^[+-]?\d+$/u.test(token)) abort("obj-invalid-index", "OBJ 면의 색인은 0이 아닌 정수여야 합니다.", line);
  const parsed = Number(token);
  const value = parsed > 0 ? parsed - 1 : count + parsed;
  if (!Number.isSafeInteger(parsed) || parsed === 0 || value < 0 || value >= count) abort("obj-invalid-index", "OBJ 면이 아직 선언되지 않았거나 범위 밖인 정점·UV·법선을 참조합니다.", line);
  return value;
}
function name(tokens: readonly string[], fallback: string, line: number): string {
  const value = tokens.join(" ") || fallback;
  if (value.length > STUDIO_NATIVE_OBJ_LIMITS.maxNameCharacters) abort("obj-budget-exceeded", "OBJ 오브젝트·그룹·재질 이름이 길이 예산을 넘었습니다.", line);
  return value;
}

export function decodeStudioNativeObj(bytes: Uint8Array): StudioNativeImportResult {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > STUDIO_NATIVE_IMPORT_MAX_FILE_BYTES) return studioNativeImportFailure("obj-file-budget", "OBJ 파일이 비어 있거나 128 MiB 입력 한도를 넘었습니다.");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return studioNativeImportFailure("obj-invalid-utf8", "OBJ 파일을 올바른 UTF-8 텍스트로 읽을 수 없습니다."); }
  const issues = new Map<string, StudioNativeImportIssue>();
  const warn = (code: string, detail: string) => { if (!issues.has(code)) issues.set(code, { severity: "warning", code, detail }); };
  try {
    const positions: StudioMeshVec3[] = [];
    const texture: Array<readonly [number, number, number, number]> = [];
    let normals = 0; let material = 0; let smoothing = 0; let objectIndex = 0; let objectName = "OBJ"; let groups: readonly string[] = [];
    let tokensRead = 0; let lineCount = 0; let cornersRead = 0; let polygonWork = 0; let outputCorners = 0; let outputFaces = 0; let assetBytes = 0;
    const materialNames = new Map<string, number>(); const smoothingGroups = new Set<number>();
    const parts = new Map<string, Part>(); const uvKinds = new Map<string, Set<boolean>>();
    const checkWorkingBudget = (line?: number) => {
      const estimate = estimateStudioNativeObjWorkingBytes({ textCharacters: text.length, sourceVertices: positions.length,
        sourceUvs: texture.length, sourceCorners: cornersRead, outputCorners, outputFaces, assetBytes });
      if (estimate > STUDIO_NATIVE_IMPORT_MAX_WORKING_BYTES) abort("obj-working-budget", "OBJ 파싱과 편집 자산 생성의 예상 작업량이 256 MiB 예산을 넘었습니다.", line);
    };
    checkWorkingBudget();
    const budget = { spend(amount = 1) {
      polygonWork += amount;
      if (!Number.isSafeInteger(polygonWork) || polygonWork > STUDIO_NATIVE_OBJ_LIMITS.maxPolygonWork) abort("obj-budget-exceeded", "OBJ 다각형 검증·삼각화의 실행 예산을 넘었습니다.");
    } };
    const parseCorner = (token: string, line: number): Corner => {
      const fields = token.split("/");
      if (fields.length > 3 || (fields.length === 2 && !fields[1]) || (fields.length === 3 && !fields[2])) abort("obj-invalid-syntax", "OBJ 면 코너는 v, v/vt, v//vn 또는 v/vt/vn 형식이어야 합니다.", line);
      const vertex = index(fields[0], positions.length, line);
      const uv = fields.length >= 2 && fields[1] ? index(fields[1], texture.length, line) : null;
      if (fields.length === 3) index(fields[2], normals, line);
      return { vertex, uv };
    };
    const parseLine = (raw: string, line: number) => {
      if (raw.length > STUDIO_NATIVE_OBJ_LIMITS.maxLineCharacters) abort("obj-budget-exceeded", "OBJ 한 줄의 길이가 실행 예산을 넘었습니다.", line);
      for (const character of raw) {
        const code = character.charCodeAt(0);
        if (code < 32 && code !== 9) abort("obj-invalid-syntax", "OBJ 텍스트에 허용되지 않는 제어 문자가 있습니다.", line);
      }
      const clean = raw.trim(); if (!clean) return;
      const tokens = clean.split(/\s+/u); tokensRead += tokens.length;
      if (tokensRead > STUDIO_NATIVE_OBJ_LIMITS.maxTokens) abort("obj-budget-exceeded", "OBJ 토큰 처리 예산을 넘었습니다.", line);
      const kind = tokens[0]; const args = tokens.slice(1);
      if (kind === "v") {
        if (args.length !== 3 && args.length !== 4) abort("obj-invalid-syntax", "OBJ v는 x y z와 선택적인 동차 좌표 w만 지원합니다.", line);
        const w = args.length === 4 ? scalar(args[3], line) : 1;
        if (w === 0) abort("obj-invalid-number", "OBJ 동차 좌표 w는 0일 수 없습니다.", line);
        const p = { x: scalar(args[0], line) / w, y: scalar(args[1], line) / w, z: scalar(args[2], line) / w };
        if ([p.x, p.y, p.z].some((value) => !Number.isFinite(value) || Math.abs(value) > STUDIO_GEOMETRY_MAX_ABSOLUTE_COORDINATE || !Number.isFinite(Math.fround(value)))) abort("obj-coordinate-budget", "OBJ 정점이 웹 편집 좌표의 유한 범위를 벗어났습니다.", line);
        if (w !== 1) warn("obj-homogeneous-vertices", "동차 정점의 w를 적용한 3D 위치를 복원했습니다. 원본 w 속성은 따로 보존하지 않습니다.");
        positions.push(p); checkWorkingBudget(line);
      } else if (kind === "vt") {
        if (args.length < 1 || args.length > 3) abort("obj-invalid-syntax", "OBJ vt는 u와 선택적인 v·w 성분을 가져야 합니다.", line);
        const rawU = scalar(args[0], line); const rawV = args.length >= 2 ? scalar(args[1], line) : 0;
        const u = Math.fround(rawU); const v = Math.fround(rawV);
        if (!Number.isFinite(u) || !Number.isFinite(v)) abort("obj-invalid-number", "OBJ UV는 유한 Float32 범위여야 합니다.", line);
        if (args.length === 3 && scalar(args[2], line) !== 0) warn("obj-texture-coordinate-w", "OBJ의 3차원 텍스처 좌표 w는 보존하지 않고 u·v 코너 UV를 복원했습니다.");
        texture.push([u === 0 ? 0 : u, v === 0 ? 0 : v, rawU, rawV]); checkWorkingBudget(line);
      } else if (kind === "vn") {
        if (args.length !== 3) abort("obj-invalid-syntax", "OBJ vn은 세 개의 유한 법선 성분이어야 합니다.", line);
        args.forEach((token) => scalar(token, line)); normals += 1;
        warn("obj-custom-normals", "OBJ 커스텀 코너 법선 vn은 보존하지 않습니다. 면의 smooth 설정을 보존하고 메시 법선을 다시 계산합니다.");
      } else if (kind === "o") {
        objectIndex += 1; objectName = name(args, `OBJ ${objectIndex}`, line);
      } else if (kind === "g") {
        groups = [...new Set(args.filter((group) => group !== "off"))]; name(groups, "OBJ", line);
        if (groups.length) warn("obj-groups-split", "OBJ 그룹 조합을 별도의 편집 자산으로 나눴습니다. 여러 그룹에 속한 면은 중복 생성하지 않습니다.");
      } else if (kind === "usemtl") {
        if (!args.length) abort("obj-invalid-syntax", "OBJ usemtl에 재질 이름이 없습니다.", line);
        const materialName = name(args, "", line);
        let slot = materialNames.get(materialName);
        if (slot === undefined) {
          if (materialNames.size >= STUDIO_NATIVE_OBJ_LIMITS.maxMaterials) abort("obj-budget-exceeded", "OBJ 재질 슬롯 수가 처리 예산을 넘었습니다.", line);
          slot = materialNames.size + 1; materialNames.set(materialName, slot);
        }
        material = slot;
        warn("obj-external-material", "OBJ usemtl별 재질 슬롯을 보존했습니다. 외부 MTL·이미지와 재질 외형·이름 목록은 가져오지 않습니다.");
      } else if (kind === "mtllib") {
        if (!args.length) abort("obj-invalid-syntax", "OBJ mtllib에 참조 정보가 없습니다.", line);
        warn("obj-external-material", "OBJ의 외부 MTL·이미지는 읽거나 요청하지 않습니다. usemtl별 재질 슬롯만 보존합니다.");
      } else if (kind === "s") {
        if (args.length !== 1 || !/^(?:off|on|[0-9]+)$/u.test(args[0] ?? "")) abort("obj-invalid-syntax", "OBJ s는 off, on, 0 또는 양의 정수 그룹이어야 합니다.", line);
        smoothing = args[0] === "off" || args[0] === "0" ? 0 : args[0] === "on" ? 1 : Number(args[0]);
        if (!Number.isSafeInteger(smoothing)) abort("obj-invalid-number", "OBJ smoothing group 번호가 정수 범위를 넘었습니다.", line);
      } else if (kind === "f") {
        if (args.length < 3 || args.length > STUDIO_NATIVE_OBJ_LIMITS.maxSourceFaceCorners) abort("obj-budget-exceeded", "OBJ 면 코너 수는 3 이상 4096 이하여야 합니다.", line);
        cornersRead += args.length;
        checkWorkingBudget(line);
        const corners = args.map((token) => parseCorner(token, line));
        if (new Set(corners.map(({ vertex }) => vertex)).size !== corners.length) abort("obj-invalid-polygon", "OBJ 한 면에서 같은 정점 색인을 반복할 수 없습니다.", line);
        const hasUv = corners[0]!.uv !== null;
        if (corners.some(({ uv }) => (uv !== null) !== hasUv)) abort("obj-face-partial-uv", "OBJ 한 면 안에서 UV가 있는 코너와 없는 코너를 섞는 형식은 보존할 수 없습니다.", line);
        let loops: readonly (readonly number[])[];
        try { loops = studioNativeObjPolygonLoops(corners.map(({ vertex }) => { const p = positions[vertex]!; return [p.x, p.y, p.z]; }), budget); }
        catch (error) { if (error instanceof ObjError) throw error; abort("obj-invalid-polygon", error instanceof Error ? error.message : "OBJ 면을 검증할 수 없습니다.", line); }
        if (hasUv) {
          try {
            for (const loop of loops) {
              const uvs = loop.map((id) => { const uvId = corners[id]?.uv; const uv = uvId === null || uvId === undefined ? undefined : texture[uvId];
                if (!uv) abort("obj-invalid-index", "OBJ 코너 UV를 복원할 수 없습니다.", line); return uv; });
              assertStudioNativeUvPrecision(uvs.map((uv) => [uv[2], uv[3]]), uvs.map((uv) => [uv[0], uv[1]]), 1);
            }
          } catch (error) { if (error instanceof StudioNativeUvPrecisionError) abort("obj-uv-precision", error.message, line); throw error; }
        }
        outputFaces += loops.length; outputCorners += loops.reduce((count, loop) => count + loop.length, 0);
        if (loops.length > 1) warn("obj-triangulated-polygon", "오목하거나 fan으로 표시할 수 없는 OBJ 면을 모든 원본 UV 코너를 유지하는 검증된 삼각형으로 나눴습니다.");
        const baseKey = JSON.stringify([objectIndex, groups]); const key = `${baseKey}:${hasUv}`;
        const kinds = uvKinds.get(baseKey) ?? new Set<boolean>(); kinds.add(hasUv); uvKinds.set(baseKey, kinds);
        let part = parts.get(key);
        if (!part) {
          if (parts.size >= STUDIO_NATIVE_IMPORT_MAX_ASSETS) abort("obj-budget-exceeded", "OBJ 편집 자산 수가 256개 한도를 넘었습니다.", line);
          part = { baseKey, objectIndex, name: name([objectName, ...(groups.length ? ["/", ...groups] : [])], "OBJ", line), uv: hasUv, faces: [],
            vertices: new Set(), cornerCount: 0, estimatedBytes: 0 }; parts.set(key, part);
        }
        for (const { vertex } of corners) part.vertices.add(vertex);
        part.cornerCount += loops.reduce((count, loop) => count + loop.length, 0);
        const nextBytes = estimateStudioNativeObjPartBytes(part.vertices.size, part.cornerCount, part.faces.length + loops.length, part.uv);
        if (!Number.isFinite(nextBytes)) abort("obj-budget-exceeded", "개별 OBJ 자산의 참조 정점·면·코너 수가 편집 메시 예산을 넘었습니다.", line);
        assetBytes += nextBytes - part.estimatedBytes; part.estimatedBytes = nextBytes; checkWorkingBudget(line);
        for (const loop of loops) part.faces.push({ corners: loop.map((id) => corners[id]!), material, smooth: smoothing > 0, line });
        if (smoothing > 0) smoothingGroups.add(smoothing);
      } else if (kind === "l" || kind === "p") {
        if (args.length < (kind === "l" ? 2 : 1)) abort("obj-invalid-syntax", "OBJ 선·점 요소의 색인이 부족합니다.", line);
        for (const token of args) { if (kind === "l") parseCorner(token, line); else index(token, positions.length, line); }
        warn("obj-nonpolygon-geometry", "OBJ 선·점 요소는 현재 polygon 편집 자산으로 만들지 않습니다. 면 데이터만 복원했습니다.");
      } else abort("obj-unsupported-record", "지원하지 않는 OBJ 레코드가 있어 가져오기를 취소했습니다.", line);
    };
    const breaks = /\r\n|\n|\r/gu;
    let start = 0; let continuation = ""; let logicalLine = 1;
    while (start < text.length) {
      const match = breaks.exec(text); const end = match?.index ?? text.length;
      lineCount += 1;
      if (lineCount > STUDIO_NATIVE_OBJ_LIMITS.maxLines) abort("obj-budget-exceeded", "OBJ 줄 처리 예산을 넘었습니다.", lineCount);
      if (end - start > STUDIO_NATIVE_OBJ_LIMITS.maxLineCharacters) abort("obj-budget-exceeded", "OBJ 한 줄의 길이가 실행 예산을 넘었습니다.", lineCount);
      let physical = text.slice(start, end); const comment = physical.indexOf("#");
      if (comment >= 0) physical = physical.slice(0, comment);
      physical = physical.trimEnd();
      if (!continuation) logicalLine = lineCount;
      if (continuation.length + physical.length > STUDIO_NATIVE_OBJ_LIMITS.maxLineCharacters) abort("obj-budget-exceeded", "OBJ 연결 줄의 길이가 실행 예산을 넘었습니다.", logicalLine);
      if (physical.endsWith("\\")) continuation += `${physical.slice(0, -1)} `;
      else { parseLine(continuation + physical, logicalLine); continuation = ""; }
      start = match ? end + match[0].length : text.length;
    }
    if (continuation) abort("obj-invalid-syntax", "OBJ 연결 줄이 파일 끝에서 완료되지 않았습니다.", logicalLine);
    if (!parts.size) abort("obj-empty-geometry", "OBJ 파일에 편집 가능한 polygon 면이 없습니다.");
    if (smoothingGroups.size > 1) warn("obj-smoothing-groups", "서로 다른 양수 smoothing group의 경계는 현재 smooth 참·거짓만으로 보존할 수 없습니다. 면별 smooth는 유지하며 그룹별 코너 법선은 후속 범위입니다.");
    if ([...uvKinds.values()].some((kinds) => kinds.size > 1)) warn("obj-mixed-uv-parts", "UV가 있는 면과 없는 면을 각각 편집 자산으로 분리해 모두 보존했습니다. UV가 없는 코너의 좌표를 지어넣지 않았습니다.");
    const assets: StudioNativeImportAsset[] = [];
    for (const part of parts.values()) {
      const ids = [...part.vertices].sort((a, b) => a - b);
      const local = new Map(ids.map((id, index) => [id, index]));
      const base = createStudioEditableMeshFromPolygons(ids.map((id) => positions[id]!), part.faces.map((face) => face.corners.map(({ vertex }) => local.get(vertex)!)));
      let mesh = { ...base, faces: base.faces.map((face) => ({ ...face, materialSlot: part.faces[face.id]!.material, smooth: part.faces[face.id]!.smooth })) };
      if (part.uv) {
        const sourceUvs = part.faces.flatMap((face) => face.corners.map((corner) => {
          const uv = corner.uv === null ? undefined : texture[corner.uv];
          if (!uv) abort("obj-invalid-index", "OBJ 코너 UV를 복원할 수 없습니다.", face.line);
          return uv;
        }));
        const corners = sourceUvs.map((uv, halfEdgeId) => ({ halfEdgeId, u: uv[0], v: uv[1] }));
        for (const edge of base.halfEdges) {
          if (edge.twin < 0 || edge.id > edge.twin) continue;
          const twin = base.halfEdges[edge.twin]!;
          const a = sourceUvs[edge.id]!; const b = sourceUvs[edge.next]!;
          const c = sourceUvs[twin.next]!; const d = sourceUvs[twin.id]!;
          const same = (x: typeof a, y: typeof a, offset: number) => x[offset] === y[offset] && x[offset + 1] === y[offset + 1];
          if (same(a, c, 0) !== same(a, c, 2) || same(b, d, 0) !== same(b, d, 2)) abort("obj-uv-precision", "OBJ의 UV seam 끝점이 Float32 정밀도에서 합쳐져 보존할 수 없습니다.");
        }
        mesh = { ...mesh, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh), corners }, mesh) };
      }
      const valid = validateStudioEditableMeshSerializableAuthority(mesh);
      if (!valid.ok) abort("obj-invalid-geometry", "OBJ의 정본 메시·UV를 복원할 수 없습니다.");
      assets.push({ name: `${part.name}${uvKinds.get(part.baseKey)!.size > 1 ? part.uv ? " · UV" : " · UV 없음" : ""}`, mesh,
        initialTransform: createStudioHybridDccIdentityTransform(), sourceNodeIndex: part.objectIndex, sourceMeshIndex: assets.length });
    }
    return { ok: true, value: { format: "obj", assets, issues: [...issues.values()] } };
  } catch (error) {
    const failure: StudioNativeImportIssue = error instanceof ObjError
      ? { severity: "error", code: error.code, detail: error.message, ...(error.line === undefined ? {} : { path: `line:${error.line}` }) }
      : { severity: "error", code: "obj-invalid-geometry", detail: "OBJ를 안전한 편집 자산으로 복원하지 못했습니다." };
    return { ok: false, issues: [...issues.values(), failure] };
  }
}
