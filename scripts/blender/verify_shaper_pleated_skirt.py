"""Blender 5.3에서 최종 GLB를 다시 열어 계단 보행 중 신체·치마의 교차를 검사한다."""

import argparse
import json
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from shaper_skirt_pose_clearance import rig_space_surface, set_step_pose  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    default_model = SCRIPT_DIR.parents[1] / (
        "apps/character-lab/public/assets/characters/shaper-atelier-protagonist/shaper-atelier-protagonist.glb"
    )
    parser.add_argument("--asset", type=Path, default=default_model)
    parser.add_argument("--report", type=Path)
    options = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(options.asset.resolve()))
    armature = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    body = bpy.data.objects["TS_Shaper_Body"]
    skirt = bpy.data.objects["TS_Bottom_pleated-skirt"]
    rest = [(b, b.matrix_basis.copy()) for b in armature.pose.bones]
    keyframes = [(0, 0), (20, 35), (45, 65), (60, 90), (75, 110), (85, 115)]
    angles = [(0, 0)]
    for (hip_a, knee_a), (hip_b, knee_b) in zip(keyframes, keyframes[1:]):
        for hip in range(hip_a + 1, hip_b + 1):
            knee = knee_a + (knee_b - knee_a) * (hip - hip_a) / (hip_b - hip_a)
            angles.append((-hip, knee))
    # 뒤로 디디는 동작도 양다리에서 따로 확인한다.
    angles.extend(((20, 15), (35, 35)))
    failures = []
    for side in ("Left", "Right"):
        for hip, knee in angles:
            for bone, basis in rest:
                bone.matrix_basis = basis.copy()
            bpy.context.view_layer.update()
            set_step_pose(armature, side, hip, knee)
            hits = rig_space_surface(body, armature).overlap(rig_space_surface(skirt, armature))
            if hits:
                failures.append({"side": side, "hip": hip, "knee": knee,
                                 "intersectingSkirtTriangles": len({j for _, j in hits})})
    report = {"asset": options.asset.name, "blender": bpy.app.version_string,
              "poses": len(angles) * 2, "forwardHipRangeDegrees": [0, 85], "failures": failures}
    output = json.dumps(report, indent=2, ensure_ascii=False)
    if options.report:
        options.report.write_text(output + "\n", encoding="utf-8")
    print(output, flush=True)
    if failures:
        raise ValueError("보행 자세에서 신체와 치마가 교차합니다.")


if __name__ == "__main__":
    main()
