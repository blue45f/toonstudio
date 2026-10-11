"""키트 파츠 일괄 빌드: Hyper3D 원본 → 정리 → 축소 → 리타깃 → 파츠 GLB (bpy venv python으로 실행).

사용(저장소 루트)::

    <venv>/bin/python -I tools/blender/character_kit/build_parts.py \\
        [--base female|male] --base-model ~/.cache/toonstudio-kit/out/base_model_female.npz \\
        --kit-dir ~/.cache/toonstudio-kit/out/kit/toonstudio-kit-v1 \\
        --work ~/.cache/toonstudio-kit/work/parts \\
        [--only top/tee,bottom/jeans] [--jobs 3] [--write-sources]

단계(프리셋마다, `garment_presets.PRESETS` 표대로):
1. `clean_rodin_garment.py` — 마네킹 조각 제거 또는(BANG 산출물) 메시 고르기·합치기.
2. `decimate_garment.py`   — LOD별 목표 삼각형 수로 축소.
3. `retarget_garment.py`   — 베이스에 맞춰 파츠 GLB를 `<kit-dir>/parts/female/<슬롯>/<이름>.glb`로 쓴다. `hides`는 `--parts-json`(키트 폴더 밖)에 모은다.

원본 GLB는 `hyper3d_generations.json`의 `rawFile`(캐시 `~/.cache/toonstudio-kit/hyper3d-raw/`)이고 저장소에는 없다.
`--write-sources`면 빌드에 성공한 프리셋의 출처를 `hyper3d_sources.json`에 다시 쓴다(kit.json provenance 입력).
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from character_kit.garment_presets import PRESETS, effective_spec  # noqa: E402

CACHE = Path.home() / ".cache" / "toonstudio-kit"
RAW_DIR = CACHE / "hyper3d-raw"
LEDGER = HERE / "hyper3d_generations.json"
SOURCES = HERE / "hyper3d_sources.json"


def ledger_entries() -> dict[str, dict]:
    data = json.loads(LEDGER.read_text(encoding="utf-8"))
    return {entry["name"]: entry for entry in data["entries"]}


def run(script: str, args: list[str], env: dict[str, str], log: Path) -> str:
    command = [sys.executable, "-I", str(HERE / script), "--", *args]
    with log.open("a", encoding="utf-8") as handle:
        handle.write("$ " + " ".join(command) + "\n")
        result = subprocess.run(command, env=env, capture_output=True, text=True)
        handle.write(result.stdout)
        handle.write(result.stderr)
    if result.returncode != 0:
        tail = "\n".join((result.stdout + result.stderr).strip().splitlines()[-12:])
        raise RuntimeError(f"{script} 실패(종료 {result.returncode}):\n{tail}")
    return result.stdout


def is_procedural(spec: dict) -> bool:
    """원본이 Hyper3D 생성물이 아니라 `proc_accessories.py`가 베이스 좌표로 만드는 소품인가."""
    return bool(spec["source"].get("proc"))


def build_one(preset_id: str, spec: dict, args: argparse.Namespace, env: dict[str, str], entries: dict[str, dict]) -> dict:
    source = spec["source"]
    slug = preset_id.replace("/", "__")
    work = Path(args.work) / slug
    work.mkdir(parents=True, exist_ok=True)
    log = work / "build.log"
    log.write_text("", encoding="utf-8")

    clean_out = work / "clean.glb"
    clean_report = work / "clean-report.json"
    if is_procedural(spec):
        entry = {"id": f"proc:{source['proc']}", "name": f"proc-{source['proc']}", "rawSha256": None, "parent": None}
        run("proc_accessories.py", ["--base-model", str(args.base_model), "--name", source["proc"], "--out", str(clean_out)], env, log)
        clean_report.write_text(json.dumps({"preset": "procedural", "source": source["proc"]}) + "\n", encoding="utf-8")
    else:
        entry = entries[source["raw"]]
        raw = RAW_DIR / entry["rawFile"]
        clean_args = [str(raw), str(clean_out), "--preset", source["clean"], "--report", str(clean_report)]
        if source.get("pick"):
            clean_args += ["--pick-object", source["pick"]]
        if source.get("ref"):
            clean_args += ["--ref-object", source["ref"]]
        run("clean_rodin_garment.py", clean_args, env, log)

    lods: list[str] = []
    for index, target in enumerate(spec["decimate"]):
        out = work / f"decimated_lod{index}.glb"
        run("decimate_garment.py", [str(clean_out), str(out), "--target-tris", str(target)], env, log)
        lods.append(str(out))

    report_path = work / "report.json"
    retarget_args = ["--preset", preset_id, "--base", args.base, "--base-model", str(args.base_model), "--kit-dir", str(args.kit_dir), "--parts-json", str(args.parts_json), "--report", str(report_path), "--debug-apose", str(work / "debug_fit.glb")]
    for item in args.override:
        retarget_args += ["--override", item]
    for lod in lods:
        retarget_args += ["--garment", lod]
    if spec["align"] in ("frame", "head_ref"):
        retarget_args += ["--frame-from", str(clean_report)]
    run("retarget_garment.py", retarget_args, env, log)
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["clean"] = json.loads(clean_report.read_text(encoding="utf-8"))
    report["ledger"] = {"generationId": entry["id"], "name": entry["name"], "rawSha256": entry.get("rawSha256"), "parent": entry.get("parent")}
    return report


def provenance_key(preset_id: str, base_id: str) -> str:
    """출처 표의 키: 그 베이스만 다른 생성물(`base_overrides.<base>.source`)을 쓰면 `슬롯/이름@베이스`, 아니면 프리셋 id."""
    override = PRESETS[preset_id].get("base_overrides", {}).get(base_id, {})
    return f"{preset_id}@{base_id}" if "source" in override else preset_id


def source_entry(preset_id: str, spec: dict, entries: dict[str, dict]) -> dict:
    entry = entries[spec["source"]["raw"]]
    out = {
        "generationId": entry["id"],
        "displayUrl": f"https://hyper3d.ai/workspace/rodin/{entry['id']}",
        "tier": entry.get("tier") or next((e["tier"] for e in entries.values() if e["id"] == entry.get("parent") and "tier" in e), "Gen-2.5-High"),
        "rawSha256": entry["rawSha256"],
        "rawBytes": entry["rawBytes"],
        "intent": entry.get("intent"),
        "changesKo": spec["changesKo"],
    }
    if entry.get("parent"):
        out["parentGenerationId"] = entry["parent"]
    if "qualityOverride" in entry:
        out["qualityOverride"] = entry["qualityOverride"]
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default="female", help="베이스 id(female | male). 파츠는 <kit-dir>/parts/<base>/ 에 쓴다")
    parser.add_argument("--base-model", type=Path, default=None, help="리타깃용 npz(기본: ~/.cache/toonstudio-kit/out/base_model_<base>.npz)")
    parser.add_argument("--kit-dir", type=Path, default=CACHE / "out" / "kit" / "toonstudio-kit-v1")
    parser.add_argument("--work", type=Path, default=CACHE / "work" / "parts")
    parser.add_argument("--parts-json", type=Path, default=None, help="hides 레지스트리(키트 폴더 밖). 기본: <work>/parts-registry.json")
    parser.add_argument("--only", default="", help="쉼표로 구분한 프리셋 id 목록(기본: 표 전체)")
    parser.add_argument("--jobs", type=int, default=2)
    parser.add_argument("--write-sources", action="store_true")
    parser.add_argument("--override", action="append", default=[], help="실험용: 프리셋 필드를 이번 실행에만 바꾼다(키=JSON값, 반복 가능). 예: --override sleeve_chain=false")
    args = parser.parse_args()
    if args.base_model is None:
        args.base_model = CACHE / "out" / f"base_model_{args.base}.npz"
    args.work.mkdir(parents=True, exist_ok=True)
    if args.parts_json is None:
        args.parts_json = args.work / "parts-registry.json"
    wanted = [item for item in args.only.split(",") if item] or list(PRESETS)
    unknown = [item for item in wanted if item not in PRESETS]
    if unknown:
        raise SystemExit(f"표에 없는 프리셋: {unknown}")

    env = dict(os.environ)
    env["HOME"] = str(CACHE / "home")
    Path(env["HOME"]).mkdir(parents=True, exist_ok=True)
    entries = ledger_entries()
    for preset_id in wanted:
        effective = effective_spec(preset_id, args.base)
        if is_procedural(effective):
            continue
        raw = entries[effective["source"]["raw"]].get("rawFile")
        if not raw or not (RAW_DIR / raw).exists():
            raise SystemExit(f"{preset_id}: 원본이 캐시에 없다({raw}). hyper3d_generations.json의 rawFile을 확인한다.")

    results: dict[str, dict | str] = {}

    def task(preset_id: str):
        try:
            return preset_id, build_one(preset_id, effective_spec(preset_id, args.base), args, env, entries)
        except Exception as error:  # noqa: BLE001 — 한 프리셋의 실패가 나머지를 막지 않게 한다
            return preset_id, str(error)

    with ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        for preset_id, result in pool.map(task, wanted):
            results[preset_id] = result

    failures = {key: value for key, value in results.items() if isinstance(value, str)}
    print(f"{'프리셋':24s} {'바이트':>9s} {'삼각형':>16s} {'hides':28s} {'V9 최악(mm)':>12s} {'침투%':>6s}")
    for preset_id, report in results.items():
        if isinstance(report, str):
            print(f"{preset_id:24s} 실패")
            continue
        tris = "/".join(str(lod["triangles"]) for lod in report["lods"])
        pen = max((piece["penetratingAfter"] for lod in report["lods"] for piece in lod["pieces"]), default=0.0)
        worst = round(report["follow"]["worst"]["statistic"] * 1000, 1) if report.get("follow") else "-"
        print(f"{preset_id:24s} {report['bytes']:9d} {tris:>16s} {','.join(report['hides']) or '-':28s} {worst!s:>12s} {pen:6.2f}")
    for preset_id, message in failures.items():
        print(f"\n[실패] {preset_id}\n{message}")

    if args.write_sources:
        existing = json.loads(SOURCES.read_text(encoding="utf-8")) if SOURCES.exists() else {"schema": "toonstudio.hyper3d-sources/1", "recordDoc": "apps/character-lab/docs/hyper3d-terms-record.md", "summaryKo": "", "common": {}, "sources": {}}
        failed_keys = {provenance_key(preset_id, args.base) for preset_id in failures}
        existing["sources"] = {key: value for key, value in existing.get("sources", {}).items() if key not in failed_keys}
        for preset_id, report in results.items():
            effective = effective_spec(preset_id, args.base)
            if not isinstance(report, str) and not is_procedural(effective):
                existing["sources"][provenance_key(preset_id, args.base)] = source_entry(preset_id, effective, entries)
        existing["summaryKo"] = "Hyper3D(Rodin Gen-2.5) 생성물과 그 파생물. 약관·소유권·수정·공개 호스팅 조항과 닫히지 않은 점은 recordDoc에 있고, 생성 기록 전체는 hyper3d_generations.json에 있다. 원본 GLB는 저장소에 커밋하지 않는다."
        SOURCES.write_text(json.dumps(existing, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\n출처 {len(existing['sources'])}건을 {SOURCES}에 썼다")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
