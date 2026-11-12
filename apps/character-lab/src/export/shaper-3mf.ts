import type { Vec3 } from "../contracts";

export type Shaper3mfModelUnit = "micron" | "millimeter" | "centimeter" | "inch" | "foot" | "meter";

export interface Shaper3mfMeshObject {
  readonly id: number;
  readonly name: string;
  readonly vertices: readonly Vec3[];
  readonly triangles: readonly (readonly [number, number, number])[];
}

export interface Shaper3mfModelDocument {
  readonly unit: Shaper3mfModelUnit;
  readonly objects: readonly Shaper3mfMeshObject[];
}

/**
 * SHAPER IxMilia.ThreeMf.dll (ThreeMfModel::ToXElement 0x060000de & ThreeMfMesh 0x060000b1) 역공학 내재화:
 * 3D 프린팅·외부 CAD 호환을 위한 3MF(`3D/3dmodel.model`) XML 문서를 생성한다.
 */
export function buildShaper3mfModelXml(doc: Shaper3mfModelDocument): string {
  const unit = doc.unit || "millimeter";
  const objectNodes = doc.objects
    .map((obj) => {
      const verts = obj.vertices.map((v) => `          <vertex x="${v[0]}" y="${v[1]}" z="${v[2]}" />`).join("\n");
      const tris = obj.triangles.map((t) => `          <triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}" />`).join("\n");
      return `    <object id="${obj.id}" name="${obj.name}" type="model">\n      <mesh>\n        <vertices>\n${verts}\n        </vertices>\n        <triangles>\n${tris}\n        </triangles>\n      </mesh>\n    </object>`;
    })
    .join("\n");
  const buildItems = doc.objects.map((obj) => `    <item objectid="${obj.id}" />`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>\n<model unit="${unit}" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n  <resources>\n${objectNodes}\n  </resources>\n  <build>\n${buildItems}\n  </build>\n</model>`;
}

/**
 * SHAPER IxMilia.ThreeMf.dll (ThreeMfModel::LoadXml 0x060000e1) 역공학 내재화:
 * 3MF(`3D/3dmodel.model`) XML 문자열에서 단위(`unit`) 및 메시 오브젝트(`vertices`, `triangles`)를 파싱한다.
 * 동일 `id`를 가진 `<object>`가 중복 선언되면 최신 오브젝트로 병합해 중복 ID를 막는다.
 */
export function parseShaper3mfModelXml(xml: string): Shaper3mfModelDocument {
  const unitMatch = /<model\b[^>]*\bunit="([^"]+)"/u.exec(xml);
  const unit = (unitMatch?.[1] as Shaper3mfModelUnit | undefined) ?? "millimeter";
  const objects: Shaper3mfMeshObject[] = [];
  const objectIndexById = new Map<number, number>();
  const objRegex = /<object\b[^>]*\bid="(\d+)"[^>]*\bname="([^"]*)"[^>]*>([\s\S]*?)<\/object>/gu;
  for (let objMatch = objRegex.exec(xml); objMatch !== null; objMatch = objRegex.exec(xml)) {
    const id = Number.parseInt(objMatch[1] ?? "1", 10);
    const name = objMatch[2] ?? "";
    const body = objMatch[3] ?? "";
    const vertices: Vec3[] = [];
    const vertRegex = /<vertex\b[^>]*\bx="([^"]+)"[^>]*\by="([^"]+)"[^>]*\bz="([^"]+)"/gu;
    for (let vMatch = vertRegex.exec(body); vMatch !== null; vMatch = vertRegex.exec(body)) {
      vertices.push([Number.parseFloat(vMatch[1] ?? "0"), Number.parseFloat(vMatch[2] ?? "0"), Number.parseFloat(vMatch[3] ?? "0")]);
    }
    const triangles: (readonly [number, number, number])[] = [];
    const triRegex = /<triangle\b[^>]*\bv1="(\d+)"[^>]*\bv2="(\d+)"[^>]*\bv3="(\d+)"/gu;
    for (let tMatch = triRegex.exec(body); tMatch !== null; tMatch = triRegex.exec(body)) {
      triangles.push([Number.parseInt(tMatch[1] ?? "0", 10), Number.parseInt(tMatch[2] ?? "0", 10), Number.parseInt(tMatch[3] ?? "0", 10)]);
    }
    const parsedObj: Shaper3mfMeshObject = { id, name, vertices, triangles };
    const prevIdx = objectIndexById.get(id);
    if (prevIdx !== undefined) {
      objects[prevIdx] = parsedObj;
    } else {
      objectIndexById.set(id, objects.length);
      objects.push(parsedObj);
    }
  }
  return { unit, objects };
}
