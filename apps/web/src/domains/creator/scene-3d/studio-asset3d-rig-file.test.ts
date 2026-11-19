import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addStudioRigChild,
  readStudioRigFile,
  renameStudioRigJoint,
  studioRigJoints,
  writeStudioRigFile,
} from "./studio-asset3d-rig-file";

const source = readFileSync("apps/web/public/models/mannequin/toonstudio_ecorche_mannequin_v3.glb");

describe("데생인형 제작 GLB 골격 편집", () => {
  it("사용 중인 관절을 개명하고 보조 관절을 붙여도 모든 원본 정점·가중치·모션은 동일 노드를 가리킨다", () => {
    const original = readStudioRigFile(source),
      previous = studioRigJoints(original, 0);
    expect(previous).toHaveLength(51);
    const hand = previous.find((item) => item.name === "leftHand")!;
    const renamed = renameStudioRigJoint(original, 0, hand.id, "펜을 쥔 손");
    const reopened = readStudioRigFile(writeStudioRigFile(addStudioRigChild(renamed, 0, hand.id)));
    const joints = studioRigJoints(reopened, 0);
    expect(joints).toHaveLength(52);
    expect(joints[previous.indexOf(hand)]).toMatchObject({ id: hand.id, name: "펜을 쥔 손" });
    expect(joints.at(-1)?.parent).toBe("펜을 쥔 손");
    expect(reopened.json.meshes).toEqual(original.json.meshes);
    expect(reopened.json.animations).toEqual(original.json.animations);
    expect(Buffer.compare(reopened.binary.subarray(0, original.binary.length), original.binary)).toBe(0);
    const s0 = (original.json.skins as { joints: number[]; inverseBindMatrices: number }[])[0]!,
      s1 = (reopened.json.skins as (typeof s0)[])[0]!;
    expect(s1.joints.slice(0, -1)).toEqual(s0.joints);
    const readMatrices = (model: typeof reopened, skin: typeof s0) => {
      const a = (model.json.accessors as { bufferView: number; count: number }[])[skin.inverseBindMatrices]!;
      const v = (model.json.bufferViews as { byteOffset: number }[])[a.bufferView]!;
      return new Float32Array(model.binary.buffer, model.binary.byteOffset + v.byteOffset, a.count * 16);
    };
    const oldMatrices = readMatrices(original, s0),
      newMatrices = readMatrices(reopened, s1);
    expect([...newMatrices.slice(0, oldMatrices.length)]).toEqual([...oldMatrices]);
    const slot = s0.joints.indexOf(hand.id),
      child = newMatrices.slice(-16);
    for (let column = 0; column < 4; column++)
      expect(child[column * 4 + 1]).toBeCloseTo(
        oldMatrices[slot * 16 + column * 4 + 1]! - 0.12 * oldMatrices[slot * 16 + column * 4 + 3]!,
        5,
      );
  });
  it("같은 이름·빈 이름·다른 노드에서의 변경을 거절하고 원본을 보존한다", () => {
    const original = readStudioRigFile(source),
      initial = studioRigJoints(original, 0);
    expect(() => renameStudioRigJoint(original, 0, initial[0]!.id, initial[1]!.name)).toThrow("이미");
    expect(() => renameStudioRigJoint(original, 0, initial[0]!.id, " ")).toThrow();
    expect(() => addStudioRigChild(original, 0, -1)).toThrow();
    expect(studioRigJoints(original, 0)).toEqual(initial);
  });
});
