"""원본 의상(forge_garments) 전체 빌드 · 겹쳐 입기 · 레지스트리 · QA 렌더 · 키트 복사본 검증 진입점.

순서(베이스마다): 하의 5종 → 하의 바깥 경계 → 레이어 1 상의(tee·shirt·sailor) → 상의 표면 → 아우터(blazer·hoodie·cardigan·vest).
아우터는 레이어 1 상의들과 하의들 표면 바깥에 얹히고, 상의 밑단은 하의 허리 바깥에 얹힌다(`forge_garments.BuildContext`).

산출물(`--out`, 기본 ~/.cache/toonstudio-kit/out5/garments):
- `kit/parts/<base>/{top,bottom}/<name>.glb` — 현재 계약(compat: 메시 하나·재질 하나·체형 morph 18). 아우터 blazer·hoodie는 상의 슬롯.
- `layered/<base>/{top,bottom,outer}/<name>.glb` — 다역할(역할마다 메시·재질) + 형태 키 + TEXCOORD_1(월드 축척 UV) 제안 형식.
- `preview/<base>/outer/<name>.glb` — 레이어드 전용 아우터(cardigan·vest)의 compat 형식 미리보기(키트에 넣지 않는다).
- `shapes/<base>/<slot>/<name>__{plus,minus}.glb` — 형태 키 +끝값 전부·−끝값 전부를 구운 미리보기(QA 렌더용).
- `parts-registry.json` — `build_kit_json.py --parts-json` 입력(가림 `hides`, 키트 폴더 밖에 둔다).
- `layered/parts-meta.json` — 역할·제안 colorKey·레이어·hideRegions·형태 키 표(계약 변경 제안).
- `reports/<base>/<name>.json`, `qa/…`(렌더·시트), `kit-copy/…`(검증용 키트 복사본), `qa/metrics-<base>.json`(관통·겹침 수치).

사용(저장소 루트에서, bpy 모듈이 든 가상환경 python):
    ~/.cache/toonstudio-kit/venv/bin/python -I tools/blender/character_kit/forge_build_garments.py --bases female,male
    ~/.cache/toonstudio-kit/venv/bin/python -I tools/blender/character_kit/forge_build_garments.py --qa --qa-only tee,jeans --no-build
    ~/.cache/toonstudio-kit/venv/bin/python -I tools/blender/character_kit/forge_build_garments.py --verify --no-build
렌더(kit-preview)와 Blender는 한 번에 하나씩 차례로 돈다(머신 부하).
"""

from __future__ import annotations

import argparse
import copy
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
REPO_ROOT = HERE.parents[2]
CACHE = Path.home() / ".cache" / "toonstudio-kit"
KIT_SRC = REPO_ROOT / "apps" / "character-lab" / "public" / "assets" / "characters" / "toonstudio-kit-v1"

BOTTOMS = ["jeans", "shorts", "pleated-skirt", "long-skirt", "slacks"]
TOPS = ["tee", "shirt", "sailor"]
OUTERS = ["blazer", "hoodie", "cardigan", "vest"]
KIT_TOP_FROM_OUTER = ("blazer", "hoodie")  # 현재 계약(compat)에서는 상의 슬롯 프리셋
LAYERED_ONLY = ("cardigan", "vest")
COMBOS = [("blazer", "pleated-skirt"), ("sailor", "pleated-skirt"), ("shirt", "slacks"), ("hoodie", "jeans"), ("tee", "shorts")]
LAYERED_COMBOS = [("shirt", "blazer", "pleated-skirt"), ("tee", "hoodie", "jeans"), ("shirt", "vest", "slacks"), ("tee", "cardigan", "long-skirt")]
# 다역할 변형의 역할 → 제안 colorKey(계약 변경은 코디네이터 몫 — 여기서는 제안만 적는다)
PROPOSED_COLOR_KEY = {
    "top": "top",
    "top-trim": "topTrim",
    "top-accent": "topAccent",
    "bottom": "bottom",
    "bottom-trim": "bottomTrim",
    "bottom-accent": "bottomAccent",
    "outer": "outer",
    "outer-trim": "outerTrim",
    "outer-accent": "outerAccent",
}
QA_COLORS = {
    "tee": "#e8e8ee",
    "shirt": "#eef0f4",
    "sailor": "#f2f2f4",
    "blazer": "#2d3550",
    "hoodie": "#8a9aa8",
    "cardigan": "#c9b28f",
    "vest": "#3c4a63",
    "jeans": "#3b4a6b",
    "shorts": "#b9a57e",
    "pleated-skirt": "#4a5872",
    "long-skirt": "#7b5e57",
    "slacks": "#3a3f4a",
}


def log(message: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def slot_of(name: str) -> str:
    return "bottom" if name in BOTTOMS else ("outer" if name in OUTERS else "top")


def kit_slot_of(name: str) -> str | None:
    """현재 계약 키트에서의 슬롯(레이어드 전용이면 None)."""
    if name in LAYERED_ONLY:
        return None
    return "top" if name in TOPS or name in KIT_TOP_FROM_OUTER else "bottom"


# ---------------------------------------------------------------- 빌드


def variant_mesh(fg: Any, asm: Any, variant: str) -> Any:
    """조립 결과에서 변형(`compat`/`layered`)에 들어가는 조각만 모은 레스트 메시(쪼개기 전 정점)."""
    pieces = asm.report["_pieces"]
    keep = [i for i, p in enumerate(pieces) if variant in p.variants]
    tri_piece = asm.piece_of_vertex[asm.triangles[:, 0]]
    import numpy as np

    mask = np.isin(tri_piece, keep)
    mesh, _ = fg.compact(fg.Mesh(asm.positions, asm.triangles[mask]))
    return mesh


def hides_for(fg: Any, body: Any, mesh: Any) -> tuple[list[str], dict[str, float]]:
    """몸 영역별 가림 비율(법선 광선)과 숨길 영역(비율 ≥ 98.5 %, 숨길 수 있는 15개 영역 안)."""
    from character_kit.retarget_garment import HIDE_COVERAGE, covered_regions

    hideable = {"neck", "torso", "pelvis", "upperArm.L", "upperArm.R", "forearm.L", "forearm.R", "hand.L", "hand.R", "thigh.L", "thigh.R", "calf.L", "calf.R", "foot.L", "foot.R"}
    fractions = covered_regions(mesh.positions, mesh.triangles, body.model)
    hides = sorted(r for r, f in fractions.items() if f >= HIDE_COVERAGE and r in hideable)
    return hides, {k: round(v, 4) for k, v in fractions.items()}


def write_shape_previews(fg: Any, asm: Any, body: Any, out: Path, base: str, name: str) -> dict[str, str]:
    """형태 키 +끝값 전부·−끝값 전부를 한 번에 구운 compat 형식 미리보기 두 개."""
    import numpy as np

    paths = {}
    if not asm.shape_names:
        return paths
    for label, sign in (("plus", "+"), ("minus", "-")):
        idx = [k for k, n in enumerate(asm.shape_names) if n.endswith(":" + sign)]
        a2 = copy.copy(asm)
        a2.positions = asm.positions + asm.shape_deltas[:, idx].sum(axis=1)
        path = out / "shapes" / base / slot_of(name) / f"{name}__{label}.glb"
        fg.write_variant(a2, body, path, "compat", pieces_from="layered")  # 형태 키는 레이어드에만 실린다 — compat 전용 셔츠 앞판은 빼고 미리본다
        paths[label] = str(path)
    del np
    return paths


def build_base(fg: Any, base: str, names: list[str], out: Path, npz_dir: Path) -> dict[str, Any]:
    """한 베이스의 의상들을 순서대로 짓고 쓴다. 돌려주는 값: 의상별 요약."""
    import numpy as np

    body = fg.BaseBody(npz_dir / f"base_model_{base}.npz", base)
    rig = fg.BodyRig(body, fg.body_morph_names())
    lm = body.landmarks
    summary: dict[str, Any] = {}
    rest_meshes: dict[str, Any] = {}  # 의상별 compat 레스트 메시(상하 겹침 수치용)
    bottoms_meshes: list[Any] = []
    inner_tops: list[Any] = []
    lower_torso = None
    ordered = [n for n in BOTTOMS + TOPS + OUTERS if n in names]
    # 아우터·상의는 아래 레이어가 필요하다: 요청에 없어도 경계용으로 지은 하의·상의를 쓴다(쓰기는 요청한 것만)
    need_bottoms = any(n in TOPS + OUTERS for n in ordered)
    need_tops = any(n in OUTERS for n in ordered)
    build_list = [n for n in BOTTOMS if n in names or need_bottoms] + [n for n in TOPS if n in names or need_tops] + [n for n in OUTERS if n in names]
    for name in build_list:
        t0 = time.time()
        if name in TOPS:
            ctx = fg.BuildContext(body, lower_torso=lower_torso, rig=rig)
        elif name in OUTERS:
            ctx = fg.BuildContext(body, lower_torso=lower_torso, inner_tops=list(inner_tops), bottoms=list(bottoms_meshes), rig=rig)
        else:
            ctx = fg.BuildContext(body, rig=rig)
        plan = getattr(fg, f"build_{name.replace('-', '_')}")(ctx)
        asm = fg.assemble(body, rig, plan)
        t1 = time.time()
        compat_mesh = variant_mesh(fg, asm, "compat")
        layered_mesh = variant_mesh(fg, asm, "layered")
        rest_meshes[name] = layered_mesh
        if name in BOTTOMS:
            bottoms_meshes.append(layered_mesh)
            if all(b in build_list[: build_list.index(name) + 1] for b in BOTTOMS if b in build_list):
                pts = np.concatenate([m.positions for m in bottoms_meshes])
                lower_torso = fg.PolarEnvelope(fg.AxisFrame(body, "torso"), pts, (lm.crotch_y - 0.04, lm.waist_y + 0.08), dt=0.008, n_theta=120, grow=1)
        elif name in TOPS:
            inner_tops.append(layered_mesh)
        if name not in names:
            log(f"{base}/{name}: 아래 레이어 경계용으로만 지음 ({t1 - t0:.0f} s)")
            continue
        info: dict[str, Any] = {"slot": plan.slot, "layer": plan.layer, "buildSeconds": round(t1 - t0, 1)}
        kit_slot = kit_slot_of(name)
        if kit_slot is not None:
            path = out / "kit" / "parts" / base / kit_slot / f"{name}.glb"
            info["kit"] = fg.write_variant(asm, body, path, "compat")
            info["kit"]["slot"] = kit_slot
            info["hides"], info["coverage"] = hides_for(fg, body, compat_mesh)
        else:
            info["preview"] = fg.write_variant(asm, body, out / "preview" / base / plan.slot / f"{name}.glb", "compat")
        info["layered"] = fg.write_variant(asm, body, out / "layered" / base / plan.slot / f"{name}.glb", "layered")
        if plan.slot == "outer":
            # 현재 엔진(kit-preview)은 다역할 GLB를 못 올린다 → 레이어드 조각 집합을 한 재질로 액세서리 슬롯에 얹은 QA 전용 미리보기
            fg.write_variant(asm, body, out / "preview" / base / "outer-as-accessory" / f"{name}.glb", "compat", pieces_from="layered", slot_override="accessory")
        info["layeredHides"], info["layeredCoverage"] = hides_for(fg, body, layered_mesh)
        info["shapePreviews"] = write_shape_previews(fg, asm, body, out, base, name)
        info["shapeKeys"] = [{"name": k.name, "noteKo": k.note_ko} for k in plan.shape_keys]
        info["report"] = {k: v for k, v in asm.report.items() if not k.startswith("_")}
        info["notes"] = {k: (v if isinstance(v, (int, float, str, bool, list, dict, type(None))) else str(v)) for k, v in plan.notes.items() if k != "spec"}
        info["metrics"] = garment_metrics(fg, body, rig, asm)
        rep = out / "reports" / base / f"{name}.json"
        rep.parent.mkdir(parents=True, exist_ok=True)
        rep.write_text(json.dumps(info, ensure_ascii=False, indent=1, default=float), encoding="utf-8")
        summary[name] = info
        size = info.get("kit", info.get("preview", {})).get("bytes", 0)
        log(f"{base}/{name}: {asm.report['triangles']} tris, compat {size / 1048576:.2f} MiB, layered {info['layered']['bytes'] / 1048576:.2f} MiB, {t1 - t0:.0f} s")
    overlaps = top_bottom_overlaps(fg, body, rest_meshes)
    metrics_path = out / "qa" / f"overlap-{base}.json"
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.write_text(json.dumps(overlaps, ensure_ascii=False, indent=1), encoding="utf-8")
    log(f"{base}: 상하 겹침 최솟값(cm) " + ", ".join(f"{k} {v['minOverlapCm']}" for k, v in overlaps.items() if k != "underwear"))
    return summary


def top_bottom_overlaps(fg: Any, body: Any, meshes: dict[str, Any]) -> dict[str, Any]:
    """몸통 각도 칸(48)마다 상의 밑단(가장 낮은 정점)과 하의 허리 윗단(가장 높은 정점)의 높이 차 최솟값, 하의 허리 윗단과 속옷 윗선의 차 최솟값."""
    import numpy as np

    frame = fg.AxisFrame(body, "torso")
    lm = body.landmarks
    bins = np.linspace(-np.pi, np.pi, 49)

    def per_bin(mesh: Any, reduce: str) -> np.ndarray:
        pts = mesh.positions
        # T-포즈에서 겨드랑이 5 cm 아래로는 소매가 없다 — 높이로만 몸통을 고른다(옆으로 퍼진 밑단을 팔로 오인하지 않게)
        torso = (pts[:, 1] > lm.crotch_y) & (pts[:, 1] < lm.armpit_y - 0.05)
        _, _, theta, _ = frame.cyl(pts[torso])
        idx = np.clip(np.digitize(theta, bins) - 1, 0, 47)
        out = np.full(48, np.nan)
        for k in range(48):
            sel = pts[torso][idx == k, 1]
            if len(sel):
                out[k] = sel.min() if reduce == "min" else sel.max()
        return out

    centers = 0.5 * (bins[:-1] + bins[1:])
    result: dict[str, Any] = {}
    tops = [n for n in meshes if n in TOPS + OUTERS]
    bottoms = [n for n in meshes if n in BOTTOMS]
    bottom_tops = {b: per_bin(meshes[b], "max") for b in bottoms}
    underwear = body.underwear_top(centers)
    result["underwear"] = {b: round(float(np.nanmin(bottom_tops[b] - underwear)) * 100, 2) for b in bottoms}
    for t in tops:
        hem = per_bin(meshes[t], "min")
        for b in bottoms:
            diff = bottom_tops[b] - hem
            result[f"{t}/{b}"] = {"minOverlapCm": round(float(np.nanmin(diff)) * 100, 2), "meanOverlapCm": round(float(np.nanmean(diff)) * 100, 2)}
    return result


def garment_metrics(fg: Any, body: Any, rig: Any, asm: Any) -> dict[str, Any]:
    """관통 수치: 레스트와 체형 morph 18 끝값에서 의상 정점의 몸 표면 부호 거리 최솟값·안쪽 정점 수(형태 키 끝값 포함)."""
    import numpy as np

    from character_kit.surface import Surface

    bs = rig.bs
    out: dict[str, Any] = {}
    names = rig.names
    positions = asm.positions

    def signed(body_pos: np.ndarray, points: np.ndarray) -> np.ndarray:
        # 부호는 최근접점에서 보간한 정점 법선으로 잰다(오목한 겨드랑이에서 면 법선 부호가 뒤집히는 것을 피한다 — 셸 빌더의 몸 거리와 같은 방식)
        hits = Surface(body_pos, bs.triangles).closest(points)
        corners = bs.triangles[np.maximum(hits.triangle, 0)]
        n = np.einsum("mc,mck->mk", hits.bary, rig.normals[corners])
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
        return np.einsum("ij,ij->i", points - hits.point, n)

    # 최근접 삼각형 법선의 부호는 몸에서 멀리 떨어진 점(치마 위로 밀려난 아우터 밑단 등, 다리 사이)에서 뒤집힐 수 있다 → 레스트에서 같은 방식으로 잰 값이
    # 바깥(≥ −0.5 mm)인 정점만 관통 후보로 센다(레스트에서 이미 안쪽이면서 2 cm보다 얕은 정점은 레스트 관통으로 따로 센다)
    d_rest = signed(bs.tpose, positions)
    reliable = d_rest > -0.0005
    rest_inside = (d_rest < -0.0005) & (d_rest > -0.02)
    out["restInside"] = int(rest_inside.sum())
    if rest_inside.any():
        pieces = asm.report["_pieces"]
        by_piece: dict[str, list[float]] = {}
        for i in np.flatnonzero(rest_inside):
            by_piece.setdefault(pieces[asm.piece_of_vertex[i]].name, []).append(round(float(d_rest[i]) * 1000, 1))
        out["restInsidePieces"] = {k: {"count": len(v), "minMm": min(v)} for k, v in by_piece.items()}
    for k, morph in enumerate(names):
        body_pos = bs.tpose + bs.morphs[morph]
        moved = positions + asm.body_deltas[:, k]
        d = signed(body_pos, moved)
        d = np.where(reliable, d, np.inf)
        entry: dict[str, Any] = {"minM": round(float(d.min()), 5), "inside": int((d < -0.0005).sum())}
        if entry["inside"]:
            pieces = asm.report["_pieces"]
            bad = np.flatnonzero(d < -0.0005)
            by_piece: dict[str, int] = {}
            for i in bad:
                key = pieces[asm.piece_of_vertex[i]].name
                by_piece[key] = by_piece.get(key, 0) + 1
            entry["pieces"] = by_piece
        out[morph] = entry
    rest_hits = Surface(bs.tpose, bs.triangles).closest(positions)
    out["rest"] = {"minDistanceM": round(float(rest_hits.distance.min()), 5)}
    for j, shape in enumerate(asm.shape_names):
        moved = positions + asm.shape_deltas[:, j]
        d, _ = body.signed_distance(moved)
        entry = {"minM": round(float(d.min()), 5), "inside": int((d < -0.0005).sum())}
        if entry["inside"]:
            pieces = asm.report["_pieces"]
            by_piece: dict[str, int] = {}
            for i in np.flatnonzero(d < -0.0005):
                key = pieces[asm.piece_of_vertex[i]].name
                by_piece[key] = by_piece.get(key, 0) + 1
            entry["pieces"] = by_piece
        out[shape] = entry
    worst = min(v["minM"] for v in out.values() if isinstance(v, dict) and "minM" in v)
    out["worstMinM"] = worst
    out["insideTotal"] = int(sum(v.get("inside", 0) for v in out.values() if isinstance(v, dict))) + out["restInside"]
    return out


# ---------------------------------------------------------------- 레지스트리·메타


def write_registry(out: Path, summaries: dict[str, dict[str, Any]]) -> Path:
    """`build_kit_json.py --parts-json` 형식: {"top/tee": {"female": {"hides": [...]}}}."""
    registry: dict[str, dict[str, Any]] = {}
    for base, items in summaries.items():
        for name, info in items.items():
            if "kit" not in info:
                continue
            key = f"{info['kit']['slot']}/{name}"
            registry.setdefault(key, {})[base] = {"hides": info["hides"]}
    path = out / "parts-registry.json"
    previous = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    for key, value in registry.items():
        previous.setdefault(key, {}).update(value)
    path.write_text(json.dumps(previous, ensure_ascii=False, indent=1), encoding="utf-8")
    return path


def write_layered_meta(out: Path, summaries: dict[str, dict[str, Any]]) -> Path:
    """다역할·형태 키·레이어 제안 메타. 역할 이름 → 제안 colorKey, 레이어별 hideRegions(몸 숨김 규칙)."""
    path = out / "layered" / "parts-meta.json"
    meta = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {"schema": "toonstudio.garment-layered-proposal/1", "parts": {}}
    meta["layers"] = {"0": "이너(속옷·이너웨어)", "1": "상의·하의", "2": "아우터(상의 위에 얹힘, 상의를 숨기지 않는다)"}
    meta["proposedColorKeys"] = PROPOSED_COLOR_KEY
    meta["texcoord1"] = "TEXCOORD_1 = 월드 축척 UV(1 = 1 m, 3D 위쪽 = −v, 판·섬마다 늘어짐 최소) — 체크·스트라이프·도트 같은 셰이더 무늬 좌표"
    meta["hideRule"] = "몸 영역은 그 레이어의 의상이 법선 광선 기준 98.5 % 이상 덮을 때만 숨긴다(hideRegions). 아우터는 아래 레이어 의상을 숨기지 않고 그 바깥에 얹힌다."
    for base, items in summaries.items():
        for name, info in items.items():
            entry = meta["parts"].setdefault(f"{info['slot']}/{name}", {"slot": info["slot"], "layer": info["layer"], "bases": {}})
            entry["shapeKeys"] = info["shapeKeys"]
            entry["kitPreset"] = f"{info['kit']['slot']}/{name}" if "kit" in info else None
            entry["bases"][base] = {
                "file": str(Path(info["layered"]["path"]).relative_to(out)),
                "bytes": info["layered"]["bytes"],
                "roles": [{"role": m["role"], "node": m["node"], "material": m["material"], "proposedColorKey": PROPOSED_COLOR_KEY.get(m["role"], m["role"]), "triangles": m["triangles"]} for m in info["layered"]["meshes"]],
                "hideRegions": info["layeredHides"],
            }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    return path


# ---------------------------------------------------------------- QA 렌더(kit-preview, 하나씩 차례로)


def preview_name(name: str) -> str:
    """kit-preview가 출력 파일 이름에 쓰는 형태(영숫자 밖의 글자 묶음을 - 하나로)."""
    import re

    return re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-")


def kit_preview(base: str, glbs: list[Path], out_dir: Path, name: str, extra: list[str], attempts: int = 3) -> bool:
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = ["node", "apps/character-lab/scripts/kit-preview.mjs", "--glb", str(KIT_SRC / "bases" / f"{base}.glb"), "--glb", str(KIT_SRC / "parts" / base / "irises" / "round-large.glb")]
    for glb in glbs:
        cmd += ["--glb", str(glb)]
    cmd += ["--out", str(out_dir), "--name", name, "--shading", "toon", "--size", "640", "--no-sheet", "--quiet", *extra]
    for _ in range(attempts):
        result = subprocess.run(cmd, cwd=REPO_ROOT, capture_output=True, text=True)
        try:
            ok = json.loads(result.stdout).get("ok") is True
        except ValueError:
            ok = False
        if ok:
            return True
        time.sleep(3)
    log(f"렌더 실패: {name} {extra} — {result.stderr[-300:]}")
    return False


def contact_sheet(images: list[Path], path: Path, columns: int = 4, cell: int = 360, labels: list[str] | None = None) -> None:
    from PIL import Image, ImageDraw

    images = [p for p in images if p.is_file()]
    if not images:
        return
    rows = (len(images) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * cell, rows * cell), (30, 34, 44))
    draw = ImageDraw.Draw(sheet)
    for i, p in enumerate(images):
        im = Image.open(p).convert("RGB").resize((cell, cell))
        x, y = (i % columns) * cell, (i // columns) * cell
        sheet.paste(im, (x, y))
        label = labels[i] if labels and i < len(labels) else p.stem.split("__", 1)[-1]
        draw.text((x + 6, y + 6), label, fill=(240, 240, 240))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)


def part_glb(out: Path, base: str, name: str) -> Path:
    kit_slot = kit_slot_of(name)
    if kit_slot is not None:
        return out / "kit" / "parts" / base / kit_slot / f"{name}.glb"
    return out / "preview" / base / "outer" / f"{name}.glb"


def color_arg(name: str) -> str:
    role = "bottom" if name in BOTTOMS else "top"
    return f"{role}={QA_COLORS[name]}"


QA_TAGS = ("t", "a", "sit", "heavy", "slim", "tall", "shapeplus", "shapeminus")


def qa_garment(out: Path, base: str, name: str, tags: tuple[str, ...] = QA_TAGS) -> Path:
    """의상 하나의 QA 시트: T 4방향 · A 2방향 · 앉기 · 체형 극단(풍만/마름/큰 키) · 형태 키 ± 끝값.
    `tags`에 없는 장면은 다시 그리지 않고 이전 렌더(있으면)를 시트에 그대로 쓴다."""
    glb = part_glb(out, base, name)
    qd = out / "qa" / base / name
    color = ["--color", color_arg(name)]
    shots: list[tuple[Path, str]] = []
    plan = [
        ("t", ["--views", "front,side,back,q3"], ["front", "side", "back", "q3"]),
        ("a", ["--views", "front,q3", "--pose", "a-pose"], ["front", "q3"]),
        ("sit", ["--views", "q3,side", "--pose", "sit"], ["q3", "side"]),
        ("heavy", ["--views", "front,q3", "--pose", "a-pose", "--morph", "param:hip=1", "--morph", "param:waist=1", "--morph", "param:chestDepth=1", "--morph", "param:shoulderWidth=1"], ["front", "q3"]),
        ("slim", ["--views", "front,q3", "--pose", "a-pose", "--morph", "param:hip=-1", "--morph", "param:waist=-1", "--morph", "param:chestDepth=-1", "--morph", "param:shoulderWidth=-1"], ["front", "q3"]),
        ("tall", ["--views", "front", "--morph", "param:height=1", "--morph", "param:legLength=1", "--morph", "param:armLength=1", "--morph", "param:neckLength=1"], ["front"]),
    ]
    for tag, extra, views in plan:
        if tag not in tags or kit_preview(base, [glb], qd, f"{name}_{tag}", extra + color):
            shots += [(qd / f"{name}_{tag}__{v}__toon.png", f"{tag}-{v}") for v in views]
    for label in ("plus", "minus"):
        shape = out / "shapes" / base / slot_of(name) / f"{name}__{label}.glb"
        if f"shape{label}" not in tags or (shape.is_file() and kit_preview(base, [shape], qd, f"{name}_shape{label}", ["--views", "front,q3", "--pose", "a-pose"] + color)):
            shots += [(qd / f"{name}_shape{label}__{v}__toon.png", f"shape{'+' if label == 'plus' else '-'}-{v}") for v in ("front", "q3")]
    sheet = out / "qa" / base / f"{name}_sheet.png"
    contact_sheet([p for p, _ in shots], sheet, columns=5, labels=[l for _, l in shots])
    return sheet


def qa_combos(out: Path, base: str) -> list[Path]:
    """코디 시트: 현재 계약(compat) 상의 + 하의 5조합, 레이어드(상의 + 아우터 + 하의) 조합."""
    sheets = []
    for top, bottom in COMBOS:
        qd = out / "qa" / base / "combos"
        name = preview_name(f"{top}-{bottom}")  # kit-preview가 출력 이름의 기호를 - 하나로 바꾼다
        glbs = [part_glb(out, base, top), part_glb(out, base, bottom)]
        colors = ["--color", f"top={QA_COLORS[top]},bottom={QA_COLORS[bottom]}"]
        shots = []
        for tag, extra, views in (("t", ["--views", "front,back,q3"], ["front", "back", "q3"]), ("a", ["--views", "q3", "--pose", "a-pose"], ["q3"]), ("sit", ["--views", "q3", "--pose", "sit"], ["q3"])):
            if kit_preview(base, glbs, qd, f"{name}_{tag}", extra + colors):
                shots += [qd / f"{name}_{tag}__{v}__toon.png" for v in views]
        sheet = out / "qa" / base / f"combo_{name}_sheet.png"
        contact_sheet(shots, sheet, columns=5, labels=["T front", "T back", "T q3", "A-pose q3", "sit q3"])
        sheets.append(sheet)
    for top, outer, bottom in LAYERED_COMBOS:
        qd = out / "qa" / base / "combos"
        name = preview_name(f"{top}-{outer}-{bottom}")
        # 겹쳐 입기 확인: 레이어 1 상의(compat) + 아우터(레이어드 조각 집합, 액세서리 슬롯 미리보기) + 하의(compat)
        glbs = [part_glb(out, base, top), out / "preview" / base / "outer-as-accessory" / f"{outer}.glb", part_glb(out, base, bottom)]
        colors = ["--color", f"top={QA_COLORS[top]},bottom={QA_COLORS[bottom]},accessory={QA_COLORS[outer]}"]
        shots = []
        for tag, extra, views in (("t", ["--views", "front,back,q3"], ["front", "back", "q3"]), ("a", ["--views", "q3", "--pose", "a-pose"], ["q3"]), ("sit", ["--views", "q3", "--pose", "sit"], ["q3"])):
            if kit_preview(base, glbs, qd, f"{name}_{tag}", extra + colors):
                shots += [qd / f"{name}_{tag}__{v}__toon.png" for v in views]
        sheet = out / "qa" / base / f"layered_{name}_sheet.png"
        contact_sheet(shots, sheet, columns=5, labels=["T front", "T back", "T q3", "A-pose q3", "sit q3"])
        sheets.append(sheet)
    return sheets


# ---------------------------------------------------------------- 키트 복사본 검증


def verify_kit_copy(out: Path, npz_dir: Path, contract: Path) -> dict[str, Any]:
    """저장소 키트를 복사하고 새 상의·하의를 넣어 kit.json을 다시 만든 뒤 검증기(V1~V20)를 돌린다(저장소 키트는 건드리지 않는다)."""
    copy_root = out / "kit-copy"
    kit_dir = copy_root / "toonstudio-kit-v1"
    if kit_dir.exists():
        shutil.rmtree(kit_dir)
    shutil.copytree(KIT_SRC, kit_dir)
    for base_dir in sorted((out / "kit" / "parts").glob("*")):
        for slot_dir in sorted(base_dir.glob("*")):
            target = kit_dir / "parts" / base_dir.name / slot_dir.name
            target.mkdir(parents=True, exist_ok=True)
            for glb in sorted(slot_dir.glob("*.glb")):
                shutil.copy2(glb, target / glb.name)
    # 원본 파츠가 Hyper3D 출처로 잘못 묶이지 않게 빈 출처 표를 준다(저장소 표에는 top/tee 등 옛 Hyper3D 파츠 이름이 있다)
    empty_sources = copy_root / "hyper3d_sources.empty.json"
    repo_sources = json.loads((HERE / "hyper3d_sources.json").read_text(encoding="utf-8"))
    empty_sources.write_text(json.dumps({"schema": repo_sources["schema"], "recordDoc": repo_sources["recordDoc"], "sources": {}}, ensure_ascii=False), encoding="utf-8")
    python = sys.executable
    build = [
        python, "-I", str(HERE / "build_kit_json.py"),
        "--kit-dir", str(kit_dir),
        "--meta", str(npz_dir / "base_meta_female.json"),
        "--extra-meta", str(npz_dir / "base_meta_male.json"),
        "--contract", str(contract),
        "--parts-json", str(out / "parts-registry.json"),
        "--hyper3d-sources", str(empty_sources),
    ]
    result = subprocess.run(build, cwd=REPO_ROOT, capture_output=True, text=True)
    (copy_root / "build_kit_json.log").write_text(result.stdout + "\n" + result.stderr, encoding="utf-8")
    if result.returncode != 0:
        return {"ok": False, "stage": "build_kit_json", "log": result.stderr[-2000:]}
    report_json = copy_root / "verify.json"
    verify = ["node_modules/.bin/tsx", "scripts/verify-character-kit.mjs", "--root", str(kit_dir), "--json", str(report_json)]
    result = subprocess.run(verify, cwd=REPO_ROOT, capture_output=True, text=True)
    (copy_root / "verify.log").write_text(result.stdout + "\n" + result.stderr, encoding="utf-8")
    tail = "\n".join(result.stdout.strip().splitlines()[-30:])
    return {"ok": result.returncode == 0, "stage": "verify", "returncode": result.returncode, "tail": tail, "log": str(copy_root / "verify.log")}


# ---------------------------------------------------------------- CLI


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", type=Path, default=CACHE / "out5" / "garments")
    parser.add_argument("--npz-dir", type=Path, default=CACHE / "out4", help="base_model_<base>.npz·base_meta_<base>.json 폴더")
    parser.add_argument("--contract", type=Path, default=CACHE / "out5" / "garments" / "contract.json")
    parser.add_argument("--bases", default="female,male")
    parser.add_argument("--only", default="", help="쉼표로 구분한 의상 이름(기본 전부)")
    parser.add_argument("--no-build", action="store_true", help="이미 쓴 GLB로 QA·검증만")
    parser.add_argument("--qa", action="store_true", help="kit-preview QA 렌더·시트")
    parser.add_argument("--qa-only", default="", help="QA를 이 의상들로 제한")
    parser.add_argument("--qa-tags", default=",".join(QA_TAGS), help=f"다시 그릴 QA 장면(쉼표, 기본 전부: {','.join(QA_TAGS)})")
    parser.add_argument("--combos", action="store_true", help="코디 시트(현재 계약 5조합 + 레이어드 4조합)")
    parser.add_argument("--verify", action="store_true", help="키트 복사본 kit.json 재생성 + 검증기")
    args = parser.parse_args(argv)
    out: Path = args.out.expanduser()
    bases = [b for b in args.bases.split(",") if b]
    names = [n for n in (args.only.split(",") if args.only else BOTTOMS + TOPS + OUTERS) if n]
    unknown = [n for n in names if n not in BOTTOMS + TOPS + OUTERS]
    if unknown:
        print(f"모르는 의상: {unknown}", file=sys.stderr)
        return 2
    summaries: dict[str, dict[str, Any]] = {}
    if not args.no_build:
        from character_kit import forge_garments as fg

        for base in bases:
            log(f"== {base} 빌드: {', '.join(names)}")
            summaries[base] = build_base(fg, base, names, out, args.npz_dir.expanduser())
        write_registry(out, summaries)
        write_layered_meta(out, summaries)
        (out / "build-summary.json").write_text(json.dumps({b: {n: {k: v for k, v in i.items() if k in ("slot", "layer", "kit", "layered", "hides", "shapeKeys", "metrics", "buildSeconds")} for n, i in s.items()} for b, s in summaries.items()}, ensure_ascii=False, indent=1, default=float), encoding="utf-8")
    if args.qa:
        qa_names = [n for n in (args.qa_only.split(",") if args.qa_only else names) if n]
        for base in bases:
            for name in qa_names:
                sheet = qa_garment(out, base, name, tuple(t for t in args.qa_tags.split(",") if t))
                log(f"QA {base}/{name}: {sheet}")
    if args.combos:
        for base in bases:
            for sheet in qa_combos(out, base):
                log(f"코디 {base}: {sheet}")
    if args.verify:
        result = verify_kit_copy(out, args.npz_dir.expanduser(), args.contract.expanduser())
        (out / "verify-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
        log(f"검증: ok={result['ok']} ({result.get('stage')})\n{result.get('tail', result.get('log', ''))}")
        return 0 if result["ok"] else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
