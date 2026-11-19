import { studioRigJoints, type StudioRigFile } from "./studio-asset3d-rig-file";
import {
  applyRigWeightChanges,
  readRigStream,
  rigRecord,
  rigRecords,
  type RigStream,
  type RigWeightWriter,
} from "./studio-asset3d-rig-weight-stream";

export interface StudioRigRegion {
  readonly key: string;
  readonly name: string;
  readonly mesh: number;
  readonly primitive: number;
}
export function studioRigWeightRegions(model: StudioRigFile, skin: number): StudioRigRegion[] {
  const meshes = rigRecords(model.json.meshes),
    regions: StudioRigRegion[] = [];
  const seen = new Set<number>();
  for (const node of rigRecords(model.json.nodes)) {
    if (node.skin !== skin || typeof node.mesh !== "number" || seen.has(node.mesh)) continue;
    const meshId = node.mesh;
    seen.add(meshId);
    const mesh = rigRecord(meshes[meshId]);
    const primitives = rigRecords(mesh.primitives);
    primitives.forEach((p, i) => {
      const attributes = rigRecord(p.attributes);
      if (attributes.WEIGHTS_0 === undefined) return;
      const label =
        typeof mesh.name === "string" && mesh.name
          ? mesh.name
          : typeof node.name === "string"
            ? node.name
            : `메시 ${meshId + 1}`;
      regions.push({
        key: `${meshId}:${i}`,
        name: primitives.length > 1 ? `${label} · 표면 ${i + 1}` : label,
        mesh: meshId,
        primitive: i,
      });
    });
  }
  return regions;
}
export function readStudioRigWeightRegion(model: StudioRigFile, skin: number, region: StudioRigRegion) {
  const nodes = rigRecords(model.json.nodes);
  if (
    !nodes.some((n) => n.mesh === region.mesh && n.skin === skin) ||
    nodes.some((n) => n.mesh === region.mesh && n.skin !== skin)
  )
    throw new Error("서로 다른 골격이 공유하는 메시예요. 제작 도구에서 메시를 분리해 주세요.");
  const mesh = rigRecord(rigRecords(model.json.meshes)[region.mesh]),
    primitive = rigRecord(rigRecords(mesh.primitives)[region.primitive]);
  if (primitive.extensions && "KHR_draco_mesh_compression" in rigRecord(primitive.extensions))
    throw new Error("압축된 웨이트는 원본 제작 도구에서 편집해 주세요.");
  const attributes = rigRecord(primitive.attributes),
    joints = studioRigJoints(model, skin);
  const sets = Object.keys(attributes).filter((k) => /^WEIGHTS_\d+$/.test(k));
  if (!sets.length || sets.length !== Object.keys(attributes).filter((k) => /^JOINTS_\d+$/.test(k)).length)
    throw new Error("조인트와 웨이트 속성이 짝을 이루지 않아요.");
  const streams = sets.map((_, i) => ({
    j: readRigStream(model, attributes, `JOINTS_${i}`),
    w: readRigStream(model, attributes, `WEIGHTS_${i}`),
  }));
  const pos = rigRecord(rigRecords(model.json.accessors)[Number(attributes.POSITION)]);
  const first = streams[0];
  if (!first) throw new Error("메시에 웨이트가 없어요.");
  const { count, scale } = first.w;
  if (pos.count !== count || streams.some((s) => s.w.count !== count || s.j.count !== count || s.w.scale !== scale))
    throw new Error("정점 수나 웨이트 정밀도가 섞인 표면은 원본 제작 도구에서 편집해 주세요.");
  const influenced = new Uint32Array(joints.length);
  const seen = new Int32Array(joints.length).fill(-1);
  for (let v = 0; v < count; v++) {
    let sum = 0;
    for (const { j, w } of streams)
      for (let l = 0; l < 4; l++) {
        const slot = j.get(v, l),
          weight = w.get(v, l);
        if (slot >= joints.length || !Number.isFinite(weight) || weight < 0 || weight > scale)
          throw new Error("메시에 올바르지 않은 본 번호나 웨이트가 있어요.");
        if (weight > 0) {
          if (seen[slot] === v) throw new Error("한 정점에 같은 관절의 웨이트가 두 번 연결돼 있어요.");
          seen[slot] = v;
          influenced[slot] = (influenced[slot] ?? 0) + 1;
          sum += weight;
        }
      }
    if (Math.abs(sum - scale) > (scale === 1 ? 0.00001 : 0))
      throw new Error("기존 웨이트의 합이 1이 아닌 정점이 있어요. 원본 제작 도구에서 정규화해 주세요.");
  }
  return { model, skin, region, streams, count, joints, influenced, scale };
}
export type StudioRigWeightRegion = ReturnType<typeof readStudioRigWeightRegion>;
export function planStudioRigWeightTransfer(
  surface: StudioRigWeightRegion,
  sourceId: number,
  targetId: number,
  percent: number,
) {
  const { streams, joints, count, scale } = surface;
  const donor = joints.findIndex((j) => j.id === sourceId),
    target = joints.findIndex((j) => j.id === targetId);
  if (donor < 0 || target < 0 || donor === target) throw new Error("서로 다른 두 관절을 선택해 주세요.");
  if (target > 65535) throw new Error("GLB 조인트 번호는 65535까지 저장할 수 있어요.");
  if (!Number.isInteger(percent) || percent < 1 || percent > 100)
    throw new Error("옮길 비율은 1~100%로 입력해 주세요.");
  const changedStreams = new Set<RigStream>();
  const slots = streams.flatMap(({ j, w }) => Array.from({ length: 4 }, (_, lane) => ({ j, w, lane })));
  function scan(write: RigWeightWriter) {
    let affected = 0,
      blocked = 0,
      belowPrecision = 0;
    for (let v = 0; v < count; v++) {
      let from = -1,
        to = -1,
        empty = -1,
        weight = 0,
        available = 0,
        sum = 0;
      for (let k = 0; k < slots.length; k++) {
        const s = slots[k]!;
        const id = s.j.get(v, s.lane),
          w = s.w.get(v, s.lane);
        sum += w;
        if (id === donor && w > 0) {
          from = k;
          weight = w;
        }
        if (id === target && w > 0) {
          to = k;
          available = w;
        }
        if (!w && empty < 0) empty = k;
      }
      if (from < 0) continue;
      const take = scale === 1 ? weight * (percent / 100) : Math.round((weight * percent) / 100);
      if (!(take > 0)) {
        belowPrecision++;
        continue;
      }
      const src = slots[from]!;
      const destIndex = to >= 0 ? to : take === weight ? from : empty;
      if (destIndex < 0) {
        blocked++;
        continue;
      }
      const dest = slots[destIndex]!;
      if (destIndex !== from) write(src.w, v, src.lane, weight - take);
      if (to < 0) write(dest.j, v, dest.lane, target);
      const recipient = available + take + (scale === 1 ? scale - sum : 0);
      if (recipient < 0 || recipient > scale + 1e-6)
        throw new Error("이 정점의 웨이트를 원래 정밀도로 정규화할 수 없어요.");
      write(dest.w, v, dest.lane, Math.min(scale, recipient));
      affected++;
    }
    return { affected, blocked, belowPrecision };
  }
  const { affected, blocked, belowPrecision } = scan((stream) => changedStreams.add(stream));
  return {
    affected,
    blocked,
    belowPrecision,
    apply() {
      if (blocked)
        throw new Error(
          `정점 ${blocked}개에 빈 본 슬롯이 없어요. 기존 영향을 유지하려면 100%를 옮기거나 다른 관절을 선택해 주세요.`,
        );
      if (!affected) throw new Error("현재 비율로 옮길 웨이트가 없어요.");
      return applyRigWeightChanges(
        surface.model,
        surface.region.mesh,
        surface.region.primitive,
        changedStreams,
        target,
        scan,
      );
    },
  };
}
