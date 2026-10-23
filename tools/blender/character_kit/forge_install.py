"""포지(forge) 파츠 통합 도구 — 여러 포지 산출물을 키트 **임시 복사본**에 넣고 `kit.json`·`NOTICE.md`를 다시 만든 뒤 검증기 V1~V20을 돌린다.

기본은 dry-run이다: 키트 폴더를 작업 폴더로 복사해 그 안에서만 바꾸고 원래 키트는 건드리지 않는다. `--apply --target <키트 폴더>`를 줄 때만
검증기 오류 0을 확인한 뒤 대상 폴더를 갱신한다. 갱신 전에 대상 전체를 백업하고, 요약 JSON에 되돌리는 명령(`--restore`)을 적는다.

사용(저장소 루트, 표준 라이브러리만 — node·tsx는 계약 덤프·슬롯 능력 계산·검증기에 쓴다. pnpm으로 설치하지 않는다)::

    python3 -I tools/blender/character_kit/forge_install.py                         # dry-run: out5/{hair,garments,shoes} → 작업 키트 → 검증
    python3 -I tools/blender/character_kit/forge_install.py --source ~/.cache/toonstudio-kit/out5/shoes --only shoes/
    python3 -I tools/blender/character_kit/forge_install.py --profile ext             # 확장(키트 v2) 제안: 역할·채널·형태·앵커 메타 + v2 파츠 미리보기
    python3 -I tools/blender/character_kit/forge_install.py --apply --target apps/character-lab/public/assets/characters/toonstudio-kit-v1
    python3 -I tools/blender/character_kit/forge_install.py --restore <백업 폴더> --target <키트 폴더>

포지 산출물 폴더 규약(`--source`, 여러 번)
- 파츠 GLB: `<source>[/<profile>]/**/<base>/<slot>/<name>.glb` (`base` ∈ female·male, `slot` ∈ hair·top·bottom·shoes·accessory·irises).
  `<source>/<profile>/`가 있으면 그 아래만 본다(`forge_build_shoes.py`는 `v1/`·`ext/`, 헤어 포지는 `v1/`·`v2/`를 나눠 쓴다 — ext와 v2는 같은 프로필).
  규약 밖 경로의 GLB(디버그 산출물·헤어 부속 미리보기 등)는 무시한다. 반복 폴더가 여럿인 포지(헤어 iterN)는 `--source`로 한 폴더를 고른다.
- 레지스트리: 프로필 폴더 아래의 모든 `parts-registry.json` + `<source>`에서 프로필 폴더까지 거치는 폴더의 `parts-registry.json`(헤어 포지는
  `final/parts-registry.json` 옆에 `final/v1/parts/…`를 둔다). 꼴은 `{프리셋: {베이스: {"hides": [...], ...}}}`(`build_kit_json.py --parts-json`과 같다).
  선택 메타: `license`(없으면 original로 보고 경고), `changesKo`, `meshRole`, `node`, `channels`, `materials`(재질 → {role, channel}; 옛 꼴 역할 → 재질도 읽는다),
  `primitiveRoles`, `shapes`([{name, labelKo}]), `shapeKeys`, `anchor`(키트 v2 기본 앵커 하나), `anchors`(포지 앵커 목록), `layer`, `conflicts`, `stacking`,
  `groundOffsetM`.

검사(프로필별, 통과 못 한 GLB는 복사하지 않고 사유를 남긴다)
- 공통: GLB 컨테이너, `skin.joints` = 계약 68 joint(같은 순서), 스킨 결합, 슬롯 삼각형 예산, 파츠 GLB 크기 한도, license.
- v1(현재 계약): 프리셋 id가 계약 어휘 안, 메시 이름 `<접두>_<이름>`, 메시마다 재질 하나, morph 이름이 계약 어휘 안(형태 키 금지).
- ext(키트 v2 `toonstudio.character-kit/2` 규칙의 사본 — `apps/character-lab/src/contracts`): 메시 역할은 슬롯 허용 역할(`V2_SLOT_ROLES`: 신발 shoes,
  액세서리 accessory·hair-accessory), 재질 채널은 역할 허용 채널(`V2_ROLE_CHANNELS`: shoes-sole·shoes-lace·accessory-accent 등), (파일, 역할, 채널)당
  재질 하나, 노드 이름 `<접두>_<이름>`(+ 채널 접미 `_Accent` 등, 헤어 부속은 `TS_HairAccessory`), 역할별 필수 morph, 형태 `shape:<이름>:±`(이름 규칙·변형당
  8개·선언 = GLB), 앵커는 계약 14종(`ACCESSORY_ANCHORS`) 안이고 액세서리만, `conflicts` 대상 실재(없으면 경고 — 의상·헤어 부속 포지는 따로 들어온다).
  어휘 밖 프리셋 id는 받되 `vocabularyAdditions`로 모은다(어휘 확장은 계약 소유자 결정). 사본 표는 `tests/test_forge_install.py`가 TS 원본과 대조한다.
  kit.json(v1 꼴에 확장 블록)과 별도로 작업 폴더에 `v2-parts-preview.json`(키트 v2 엄격 스키마 꼴 파츠·재질 + 포지 메타 + 규칙 위반 목록)을 쓴다.

`kit.json` 재생성은 `kit_manifest.build_manifest`를 쓴다. 지금 키트에 손으로 남긴 기록은 지킨다: 미제공 파츠의 한글 사유(`unavailable`),
`provenance.summaryKo`(Hyper3D 제외 경위), `NOTICE.md`의 "원천 3 … 제외" 절과 제외 변형 안내. 베이스 메타(높이·경계·영역 범위·관절 오프셋)는 기존
`kit.json`에서 읽는다(베이스 GLB를 바꾸지 않으므로 그 값이 정본이다). **파츠를 다시 빌드하면 SHA-256이 바뀌므로 이 도구로 kit.json을 다시 만들어야
검증기 V2가 통과한다.**
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from character_kit import contract as contract_mod  # noqa: E402
from character_kit import kit_manifest as km  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]
CACHE = Path.home() / ".cache" / "toonstudio-kit"
DEFAULT_KIT = REPO_ROOT / "apps" / "character-lab" / "public" / "assets" / "characters" / "toonstudio-kit-v1"
DEFAULT_SOURCES = [CACHE / "out5" / name for name in ("hair", "garments", "shoes")]
WORK_ROOT = CACHE / "forge-install"
BASES = ("female", "male")
SLOTS = ("hair", "top", "bottom", "shoes", "accessory", "irises")
PRESET_NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
#: 프로필 → `<source>` 아래에서 찾을 하위 폴더(앞이 우선). ext와 v2는 같은 확장 프로필이다(헤어 포지는 v2/로 쓴다)
PROFILE_DIRS = {"v1": ("v1",), "ext": ("ext", "v2"), "v2": ("v2", "ext")}

# ---------------------------------------------------------------- 키트 v2 계약 사본(apps/character-lab/src/contracts — 시험이 TS 원본과 대조)

#: 슬롯별 허용 메시 역할(`KIT_V2_PART_SLOT_ROLES`)
V2_SLOT_ROLES: dict[str, tuple[str, ...]] = {
    "hair": ("hair",),
    "top": ("top",),
    "bottom": ("bottom",),
    "shoes": ("shoes",),
    "accessory": ("accessory", "hair-accessory"),
    "irises": ("iris", "eye-highlight", "pupil"),
}
#: 역할별 칠할 수 있는 색 채널(`PART_ROLE_CHANNELS`, 역할 20개 전부) — 빈 튜플은 고정색 역할
V2_ROLE_CHANNELS: dict[str, tuple[str, ...]] = {
    "skin": ("skin",),
    "head": ("skin",),
    "eyeball": ("sclera",),
    "iris": ("iris",),
    "pupil": ("iris",),
    "eye-highlight": (),
    "brow": ("brow",),
    "lash": ("brow",),
    "teeth": (),
    "tongue": (),
    "hair": ("hair", "hair-tip", "hair-accent"),
    "top": ("top", "top-trim", "top-accent"),
    "bottom": ("bottom", "bottom-trim"),
    "shoes": ("shoes", "shoes-sole", "shoes-lace"),
    "accessory": ("accessory", "accessory-accent"),
    "underwear": (),
    "inner": ("inner", "inner-trim", "top-accent"),
    "outer": ("outer", "outer-trim", "outer-accent"),
    "legwear": ("legwear",),
    "hair-accessory": ("hair-accessory", "hair-accessory-accent"),
}
V2_SCHEMA_ID = "toonstudio.character-kit/2"
#: 키트 v2 검사용 매니페스트의 베이스 머리 높이 자리값(m) — 베이스를 다시 굽기 전에는 kit.json v1에 없는 값이라 파츠 검사에만 쓴다
V2_CHECK_HEAD_HEIGHT_M = 0.22
V2_CONTRACT_MODULE = Path("apps") / "character-lab" / "src" / "contracts" / "character-kit-v2.ts"
V2_CHECK_SCRIPT = """import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// forge_install.py가 쓰는 임시 검사기: 키트 v2 스키마(계약 TS 원본)로 매니페스트를 파싱해 이슈를 JSON으로 낸다
const [manifestPath, contractFile] = process.argv.slice(2);
const contract = await import(pathToFileURL(contractFile).href);
const result = contract.kitManifestV2Schema.safeParse(JSON.parse(readFileSync(manifestPath, "utf8")));
const issues = result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path.map(String).join("."), message: issue.message }));
process.stdout.write(JSON.stringify({ ok: result.success, issues }));
"""
#: 메시 노드 접두(`NODE_PREFIX`) — 접두 뒤 `_<프리셋 이름>`, 그 뒤 선택 채널 접미(`NODE_SUFFIX`)
V2_NODE_PREFIX = {"top": "TS_Top", "bottom": "TS_Bottom", "shoes": "TS_Shoes", "accessory": "TS_Accessory", "hair-accessory": "TS_HairAccessory"}
V2_NODE_SUFFIX = re.compile(r"^(?:_[A-Z][A-Za-z0-9]*)?$")
#: 소품 앵커 14종(`ACCESSORY_ANCHORS`)
ACCESSORY_ANCHORS = ("head-top", "hair", "face", "ear-l", "ear-r", "neck", "wrist-l", "wrist-r", "waist", "back", "hand-l", "hand-r", "foot-l", "foot-r")
#: 형태 이름(`SHAPE_NAME_PATTERN`·`SHAPE_NAME_MAX_LENGTH`)과 변형당 형태 수(`KIT_V2_BUDGET.maxShapesPerVariant`)
SHAPE_NAME_PATTERN = re.compile(r"^[a-z][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)*$")
SHAPE_NAME_MAX_LENGTH = 24
MAX_SHAPES_PER_VARIANT = 8
#: v2 역할 → v1 계약 덤프의 morph 커버리지 역할(헤어 부속은 머리를 따라가는 accessory와 같다 — `KIT_MORPH_COVERAGE`)
COVERAGE_ROLE = {"hair-accessory": "accessory"}

SHAPE_KEY_PATTERN = re.compile(r"^shape:(?P<name>[^:]+):[+-]$")
#: 확장 프로필이 kit.json 변형에 그대로 옮기는 레지스트리 메타(계약이 확정되면 이 표만 맞춘다)
EXT_VARIANT_FIELDS = ("meshRole", "channels", "shapes", "shapeKeys", "anchor", "anchors", "layer", "conflicts", "stacking", "groundOffsetM")
FORGE_SOURCE_NOTE_KO = "forge 원본 파츠"


# ---------------------------------------------------------------- 자료형


@dataclass
class FoundPart:
    preset_id: str
    base: str
    path: str
    source: str
    sha256: str
    bytes: int
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def slot(self) -> str:
        return self.preset_id.split("/", 1)[0]

    @property
    def name(self) -> str:
        return self.preset_id.split("/", 1)[1]

    @property
    def kit_relative(self) -> str:
        return f"parts/{self.base}/{self.slot}/{self.name}.glb"


@dataclass
class Verdict:
    part: FoundPart
    accepted: bool
    problems: list[str]
    warnings: list[str]
    info: dict[str, Any] = field(default_factory=dict)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def tree_digest(root: Path) -> str:
    """폴더 안 모든 파일의 (상대 경로, SHA-256) 해시. 복사 뒤 대상이 바뀌었는지 `--apply` 직전에 대조한다."""
    digest = hashlib.sha256()
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        digest.update(path.relative_to(root).as_posix().encode("utf-8") + b"\0" + sha256_file(path).encode("ascii") + b"\n")
    return digest.hexdigest()


# ---------------------------------------------------------------- 산출물 찾기


def scan_root(source: Path, profile: str) -> Path:
    """`<source>/<프로필 폴더>`가 있으면 그 아래만 본다(프로필별로 나눠 쓴 포지). ext·v2는 서로의 폴더 이름도 받는다."""
    for name in PROFILE_DIRS.get(profile, (profile,)):
        nested = source / name
        if nested.is_dir():
            return nested
    return source


def part_key_from_path(path: Path) -> tuple[str, str] | None:
    """`…/<base>/<slot>/<name>.glb` → (프리셋 id, 베이스). 규약 밖 경로면 None."""
    if path.suffix != ".glb":
        return None
    slot, base = path.parent.name, path.parent.parent.name
    if base not in BASES or slot not in SLOTS or not PRESET_NAME_PATTERN.match(path.stem):
        return None
    return f"{slot}/{path.stem}", base


def registry_files(source: Path, root: Path) -> list[Path]:
    """읽을 레지스트리: `<source>`에서 `root`까지 거치는 폴더의 것(위에서 아래 순, 하위 폴더는 보지 않는다) + `root` 아래 전부(경로 순).
    헤어 포지는 `final/parts-registry.json` 옆에 `final/v1/parts/…`를 두어, `root` 아래만 보면 hides 등을 놓쳤다(2026-10-23)."""
    chain: list[Path] = []
    if root != source and source in root.parents:
        folder = source
        for part in root.relative_to(source).parts:
            candidate = folder / "parts-registry.json"
            if candidate.is_file():
                chain.append(candidate)
            folder = folder / part
    return chain + sorted(root.rglob("parts-registry.json"))


def load_registries(paths: list[Path]) -> dict[str, dict[str, dict[str, Any]]]:
    """레지스트리들을 순서대로 합친다(같은 프리셋·베이스면 나중 파일의 키가 덮는다 — 프로필 폴더 안의 것이 바깥 것보다 나중)."""
    merged: dict[str, dict[str, dict[str, Any]]] = {}
    for path in paths:
        try:
            table = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise SystemExit(f"레지스트리를 읽지 못했습니다({path}): {error}") from error
        if not isinstance(table, dict):
            raise SystemExit(f"레지스트리가 객체가 아닙니다: {path}")
        for preset_id, by_base in table.items():
            if not isinstance(by_base, dict):
                continue
            for base, entry in by_base.items():
                if isinstance(entry, dict):
                    merged.setdefault(preset_id, {}).setdefault(base, {}).update(entry)
    return merged


def discover(sources: list[Path], profile: str, only: list[str]) -> tuple[list[FoundPart], list[dict[str, Any]], list[str]]:
    """소스 폴더들에서 파츠 GLB와 레지스트리 메타를 모은다. 반환: 파츠, 충돌(같은 프리셋·베이스가 여러 곳에 다른 내용으로), 없는 소스."""
    found: list[FoundPart] = []
    missing: list[str] = []
    for source in sources:
        if not source.is_dir():
            missing.append(str(source))
            continue
        root = scan_root(source, profile)
        registry = load_registries(registry_files(source, root))
        for path in sorted(root.rglob("*.glb")):
            key = part_key_from_path(path)
            if key is None:
                continue
            preset_id, base = key
            if only and not any(preset_id.startswith(prefix) for prefix in only):
                continue
            found.append(FoundPart(preset_id, base, str(path), str(source), sha256_file(path), path.stat().st_size, dict(registry.get(preset_id, {}).get(base, {}))))
    by_key: dict[tuple[str, str], list[FoundPart]] = {}
    for part in found:
        by_key.setdefault((part.preset_id, part.base), []).append(part)
    conflicts = [{"preset": k[0], "base": k[1], "paths": [p.path for p in v]} for k, v in by_key.items() if len({p.sha256 for p in v}) > 1]
    return found, conflicts, missing


def resolve_conflicts(found: list[FoundPart], policy: str) -> list[FoundPart]:
    """같은 프리셋·베이스: 내용이 같으면 하나만, 다르면 `last`는 마지막 소스, `error`는 중단(경로를 모두 보여 준다)."""
    chosen: dict[tuple[str, str], FoundPart] = {}
    paths: dict[tuple[str, str], list[str]] = {}
    for part in found:
        key = (part.preset_id, part.base)
        paths.setdefault(key, []).append(part.path)
        if key in chosen and chosen[key].sha256 != part.sha256 and policy == "error":
            listing = "\n  ".join(paths[key])
            raise SystemExit(
                f"같은 파츠가 다른 내용으로 여러 곳에 있습니다: {part.preset_id}@{part.base}\n  {listing}\n"
                "반복 폴더(iterN·final 등)가 여럿인 포지면 --source로 한 폴더(예: out5/hair/final)를 고르거나, --on-conflict last로 마지막 경로를 씁니다."
            )
        chosen[key] = part
    return list(chosen.values())


# ---------------------------------------------------------------- 검사(v2 규칙 사본)


def is_shape_name(name: str) -> bool:
    return len(name) <= SHAPE_NAME_MAX_LENGTH and SHAPE_NAME_PATTERN.match(name) is not None


def channel_role(channel: str, slot: str) -> str | None:
    """옛 레지스트리 꼴(역할 → 재질)의 '역할'은 실제로 채널이었다(shoes-sole 등): 그 채널을 칠할 수 있는 슬롯 허용 역할."""
    for role in V2_SLOT_ROLES.get(slot, ()):
        if channel == role or channel in V2_ROLE_CHANNELS.get(role, ()):
            return role
    return None


def material_slots(meta: dict[str, Any], slot: str) -> dict[str, tuple[str, str]]:
    """레지스트리 `materials` → {재질 이름: (메시 역할, 채널)}. 새 꼴 {재질: {role, channel}}, 옛 꼴 {역할(채널): 재질} 둘 다 읽는다."""
    out: dict[str, tuple[str, str]] = {}
    for key, value in (meta.get("materials") or {}).items():
        if isinstance(value, dict):
            role = str(value.get("role", ""))
            out[str(key)] = (role, str(value.get("channel", role)))
        else:
            role = channel_role(str(key), slot) or str(key)
            out[str(value)] = (role, str(key))
    return out


def primitive_slots(mesh: km.MeshInfo, part: FoundPart) -> tuple[list[tuple[str, str]] | None, str | None]:
    """프리미티브마다 (메시 역할, 채널). `primitiveRoles`가 있으면 역할은 그것(채널 = 역할 기본), 없으면 `materials` 표, 표도 없고 재질이 하나면 슬롯 기본."""
    explicit = part.meta.get("primitiveRoles")
    if isinstance(explicit, list):
        if len(explicit) != len(mesh.prims):
            return None, f"primitiveRoles {len(explicit)}개가 프리미티브 {len(mesh.prims)}개와 다릅니다."
        return [(str(role), str(role)) for role in explicit], None
    table = material_slots(part.meta, part.slot)
    if not table:
        if len(mesh.prims) > 1:
            return None, "재질이 여럿인데 레지스트리에 materials(재질 → 역할·채널)가 없습니다."
        role = str(part.meta.get("meshRole") or V2_SLOT_ROLES.get(part.slot, (part.slot,))[0])
        return [(role, role)], None
    slots = [table.get(str(prim.material)) for prim in mesh.prims]
    if any(s is None for s in slots):
        unmapped = sorted({str(prim.material) for prim, s in zip(mesh.prims, slots, strict=True) if s is None})
        return None, f"레지스트리 materials에 없는 재질: {', '.join(unmapped)}"
    return [s for s in slots if s is not None], None


def declared_shapes(meta: dict[str, Any], glb_shape_keys: set[str]) -> list[str]:
    """변형 형태 이름: 레지스트리 `shapes`([{name}] 또는 [이름])가 정본, 없으면 GLB 형태 키에서 센다."""
    shapes = meta.get("shapes")
    if isinstance(shapes, list):
        return [str(s["name"]) if isinstance(s, dict) else str(s) for s in shapes]
    return sorted({SHAPE_KEY_PATTERN.match(k).group("name") for k in glb_shape_keys if SHAPE_KEY_PATTERN.match(k)})  # type: ignore[union-attr]


def v2_node_issue(slot: str, name: str, node: str, roles: list[str]) -> str | None:
    """키트 v2 노드 이름 규칙(`nodeNameIssues`, 헤어·홍채 제외): `<접두>_<이름>` + 선택 채널 접미. 헤어 부속 역할이면 접두가 TS_HairAccessory."""
    if slot not in V2_NODE_PREFIX:
        return None
    prefix = V2_NODE_PREFIX["hair-accessory"] if slot == "accessory" and "hair-accessory" in roles else V2_NODE_PREFIX[slot]
    head = f"{prefix}_{name}"
    if not node.startswith(head) or not V2_NODE_SUFFIX.match(node[len(head) :]):
        return f"{node}: 메시 이름은 {head}(+ 선택 채널 접미 _Accent 등)이어야 합니다(키트 v2)."
    return None


def inspect_part(part: FoundPart, contract: contract_mod.Contract, profile: str) -> Verdict:
    problems: list[str] = []
    warnings: list[str] = []
    try:
        info = km.inspect_glb(Path(part.path).read_bytes(), part.path)
    except km.ManifestError as error:
        return Verdict(part, False, [f"GLB를 읽지 못했습니다: {error}"], [])
    ext = profile != "v1"
    slot, name = part.slot, part.name
    in_vocabulary = name in contract.raw["presetVocabulary"].get(slot, [])
    if not in_vocabulary:
        if ext:
            warnings.append(f"프리셋 id가 계약 어휘 밖입니다(어휘 확장 필요 — vocabularyAdditions): {part.preset_id}")
        else:
            problems.append(f"프리셋 id가 계약 어휘 밖입니다(v1에는 넣을 수 없고 ext에서만 제안합니다): {part.preset_id}")
    if info.joints != contract.joints:
        problems.append("skin.joints가 계약 68 joint와 같은 순서로 같지 않습니다.")
    if info.transformed_mesh_nodes:
        problems.append(f"스킨 메시 노드에 변환이 있습니다: {', '.join(info.transformed_mesh_nodes)}")
    if not info.meshes:
        problems.append("메시가 없습니다.")
    budget = contract.budget["triangles"].get({"hair": "hairLod0", "irises": "faceParts"}.get(slot, slot))
    coverage = contract.raw["morph"]["coverageByRole"]
    glb_shape_keys: set[str] = set()
    roles_seen: set[str] = set()
    material_of_slot: dict[tuple[str, str], str] = {}
    triangles = 0
    for mesh in info.meshes:
        if not mesh.skinned:
            problems.append(f"{mesh.node}: 스킨에 결합되지 않았습니다.")
        if slot == "hair":
            match = km.HAIR_PATTERN.match(mesh.node)
            if match is None or match.group("style") != name:
                problems.append(f"헤어 메시 이름 규칙 위반: {mesh.node}")
            elif match.group("lod") == "0":
                triangles += mesh.triangles
        else:
            triangles += mesh.triangles
            if not ext and slot in km.GARMENT_PREFIX and mesh.node != f"{km.GARMENT_PREFIX[slot]}_{name}":
                problems.append(f"{slot} 메시 이름은 {km.GARMENT_PREFIX[slot]}_{name}여야 합니다: {mesh.node}")
        materials = {prim.material for prim in mesh.prims}
        if None in materials:
            problems.append(f"{mesh.node}: 재질이 없는 프리미티브가 있습니다.")
        if len(materials) > 1 and not ext:
            problems.append(f"{mesh.node}: 재질이 {len(materials)}개입니다(v1은 메시마다 재질 하나).")
        names = set(mesh.morphs)
        shape_keys = {n for n in names if SHAPE_KEY_PATTERN.match(n)}
        outside = sorted(n for n in names - shape_keys if n not in contract.morph_names)
        if outside:
            problems.append(f"{mesh.node}: 계약 어휘·형태 키 규칙 밖 morph: {', '.join(outside[:5])}")
        bad_names = sorted(k for k in shape_keys if not is_shape_name(SHAPE_KEY_PATTERN.match(k).group("name")))  # type: ignore[union-attr]
        if bad_names:
            problems.append(f"{mesh.node}: 형태 이름 규칙(소문자로 시작하는 {SHAPE_NAME_MAX_LENGTH}자 이하 식별자) 밖: {', '.join(bad_names)}")
        glb_shape_keys |= shape_keys
        if shape_keys and not ext:
            problems.append(f"{mesh.node}: 형태 키 {len(shape_keys)}개는 v1 계약 어휘 밖입니다.")
        if not ext or slot == "irises":
            continue
        slots, error = primitive_slots(mesh, part)
        if error or slots is None:
            problems.append(f"{mesh.node}: {error}")
            continue
        roles = [role for role, _ in slots]
        roles_seen |= set(roles)
        allowed = V2_SLOT_ROLES.get(slot, (slot,))
        for (role, channel), prim in zip(slots, mesh.prims, strict=True):
            if role not in allowed:
                problems.append(f"{mesh.node}: 슬롯 {slot}에 허용되지 않는 역할 {role}입니다(허용: {', '.join(allowed)}).")
                continue
            if channel not in V2_ROLE_CHANNELS.get(role, ()):
                problems.append(f"{mesh.node}: 역할 {role}은 채널 {channel}을 쓸 수 없습니다(허용: {', '.join(V2_ROLE_CHANNELS.get(role, ())) or '없음'}).")
            previous = material_of_slot.setdefault((role, channel), str(prim.material))
            if previous != str(prim.material):
                problems.append(f"{mesh.node}: 역할 {role}·채널 {channel}에 재질이 둘 이상입니다({previous}, {prim.material}).")
        node_issue = v2_node_issue(slot, name, mesh.node, roles)
        if node_issue:
            problems.append(node_issue)
        if mesh.skinned:
            missing = sorted({m for role in set(roles) for m in coverage.get(COVERAGE_ROLE.get(role, role), [])} - names)
            if missing:
                problems.append(f"{mesh.node}: 역할 {'/'.join(sorted(set(roles)))}의 필수 morph {len(missing)}개가 없습니다: {', '.join(missing[:5])}")
    if ext and slot != "irises" and roles_seen:
        if slot == "accessory" and not roles_seen & {"accessory", "hair-accessory"}:
            problems.append("액세서리 변형에는 accessory 또는 hair-accessory 역할 메시가 있어야 합니다.")
        elif slot != "accessory" and V2_SLOT_ROLES.get(slot, (slot,))[0] not in roles_seen:
            problems.append(f"필수 역할 {V2_SLOT_ROLES[slot][0]} 메시가 없습니다.")
    declared_keys = part.meta.get("shapeKeys")
    if isinstance(declared_keys, list) and set(declared_keys) != glb_shape_keys:
        problems.append(f"레지스트리 shapeKeys와 GLB 형태 키가 다릅니다(레지스트리 {sorted(declared_keys)} · GLB {sorted(glb_shape_keys)}).")
    shapes = declared_shapes(part.meta, glb_shape_keys)
    if ext:
        used = {SHAPE_KEY_PATTERN.match(k).group("name") for k in glb_shape_keys}  # type: ignore[union-attr]
        if len(shapes) > MAX_SHAPES_PER_VARIANT:
            problems.append(f"형태 {len(shapes)}개가 변형당 한도 {MAX_SHAPES_PER_VARIANT}개를 넘습니다.")
        if len(set(shapes)) != len(shapes):
            problems.append("shapes에 같은 이름이 두 번 있습니다.")
        if set(shapes) != used:
            problems.append(f"shapes 선언과 GLB shape:* morph가 다릅니다(선언 {sorted(shapes)} · GLB {sorted(used)}).")
        unpaired = sorted(key for key in glb_shape_keys if key[:-1] + ("-" if key.endswith("+") else "+") not in glb_shape_keys)
        if unpaired:
            warnings.append(f"짝이 없는 형태 키(한쪽 방향만 있음): {', '.join(unpaired)}")
        anchor = part.meta.get("anchor")
        if anchor is not None and (slot != "accessory" or anchor not in ACCESSORY_ANCHORS):
            problems.append(f"anchor {anchor!r}: 액세서리 슬롯에서 계약 앵커 14종({', '.join(ACCESSORY_ANCHORS)}) 중 하나여야 합니다.")
        unknown_anchors = sorted(set(part.meta.get("anchors") or []) - set(ACCESSORY_ANCHORS))
        if unknown_anchors:
            problems.append(f"anchors에 계약 앵커가 아닌 이름: {', '.join(unknown_anchors)}")
    if budget is not None and triangles > budget:
        problems.append(f"삼각형 {triangles}개가 슬롯 예산 {budget}개를 넘습니다.")
    license_value = part.meta.get("license")
    if license_value is None:
        warnings.append("레지스트리에 license가 없어 original로 간주했습니다.")
    elif license_value != "original":
        problems.append(f"license {license_value!r}는 이 도구가 출처를 만들 수 없습니다(original만 받습니다).")
    if part.bytes > contract.budget["partGlbMaxBytes"]:
        problems.append(f"파츠 GLB {part.bytes} B가 한도 {contract.budget['partGlbMaxBytes']} B를 넘습니다.")
    return Verdict(part, not problems, problems, warnings, {"meshes": [m.node for m in info.meshes], "triangles": triangles, "inVocabulary": in_vocabulary, "shapeKeys": sorted(glb_shape_keys), "shapes": shapes})


def check_conflict_targets(accepted: list[FoundPart], kit_ids: set[str]) -> list[str]:
    """`conflicts`·`stacking.with`가 가리키는 프리셋이 키트(또는 이번에 넣는 파츠)에 있는지. 의상·헤어 부속 포지는 따로 들어오므로 경고로만 쓴다."""
    known = kit_ids | {part.preset_id for part in accepted}
    out = []
    for part in accepted:
        targets = list(part.meta.get("conflicts") or [])
        for rule in part.meta.get("stacking") or []:
            targets += list(rule.get("with", []))
        out += [f"{part.preset_id}@{part.base}: {target}가 키트·이번 파츠에 없습니다(다른 포지가 넣을 예정이면 무시)." for target in sorted(set(targets)) if target not in known]
    return out


# ---------------------------------------------------------------- 기존 키트에서 지킬 값


def base_metas_from_kit(kit: dict[str, Any]) -> list[dict[str, Any]]:
    """기존 kit.json의 베이스 블록에서 `build_manifest`가 읽는 메타(높이·경계·영역 범위·관절 오프셋)를 되살린다(기본 베이스가 먼저)."""
    metas = []
    for base_id in BASES:
        block = kit["bases"].get(base_id)
        if block is not None:
            metas.append({"baseId": base_id, "heightM": block["heightM"], "boundsM": block["boundsM"], "bodyRegions": block["bodyRegions"], "jointOffsets": kit["jointOffsets"]})
    if not metas:
        raise SystemExit("기존 kit.json에 베이스가 없습니다.")
    default = kit.get("defaults", {}).get("base")
    metas.sort(key=lambda meta: meta["baseId"] != default)
    return metas


def existing_hides(kit: dict[str, Any]) -> dict[str, dict[str, dict[str, Any]]]:
    table: dict[str, dict[str, dict[str, Any]]] = {}
    for part in kit.get("parts", []):
        for base_id, variant in part.get("variants", {}).items():
            table.setdefault(part["id"], {})[base_id] = {"hides": list(variant.get("hides", []))}
    return table


def existing_unavailable(kit: dict[str, Any]) -> dict[str, str]:
    """`build_manifest`의 `unavailable_reasons` 형식(`프리셋@베이스` → 사유)으로 기존 사유를 옮긴다."""
    return {f"{part['id']}@{base_id}": reason for part in kit.get("parts", []) for base_id, reason in part.get("unavailable", {}).items()}


# ---------------------------------------------------------------- 매니페스트·고지


def forge_note_ko(installed: list[FoundPart]) -> str:
    ids = sorted({p.preset_id for p in installed})
    return f"{FORGE_SOURCE_NOTE_KO} {len(ids)}종({', '.join(ids)})은 tools/blender/character_kit의 forge 도구가 베이스 정점에서 계산해 절차 생성한 원본이다(외부 에셋·생성 AI 없음)."


_FORGE_NOTE_PATTERN = re.compile(rf" ?{FORGE_SOURCE_NOTE_KO} \d+종\([^)]*\)은 [^.]*?\(외부 에셋·생성 AI 없음\)\.")


def patch_provenance(manifest: dict[str, Any], old_kit: dict[str, Any], installed: list[FoundPart]) -> None:
    """손으로 남긴 `summaryKo`(Hyper3D 제외 경위)를 지키고, 이번에 넣은 포지 파츠를 원본 출처 설명에 더한다(다시 돌려도 한 번만 들어간다)."""
    note = forge_note_ko(installed) if installed else ""
    old_summary = old_kit.get("provenance", {}).get("summaryKo")
    if old_summary:
        manifest["provenance"]["summaryKo"] = (_FORGE_NOTE_PATTERN.sub("", old_summary) + (" " + note if note else "")).strip()
    old_sources = {source["id"]: source for source in old_kit.get("provenance", {}).get("sources", [])}
    for source in manifest["provenance"]["sources"]:
        if source["id"] != "toonstudio-original":
            continue
        previous = old_sources.get("toonstudio-original", source)
        source["name"] = "ToonStudio 원본 디자인(속옷·구강 내부·속눈썹·눈썹·홍채 5종·소품·forge 파츠·텍스처)" if note else previous["name"]
        source["changesKo"] = (_FORGE_NOTE_PATTERN.sub("", previous["changesKo"]).rstrip() + (" " + note if note else "")).strip()


def v2_material(role: str, channel: str, double_sided: bool) -> dict[str, Any]:
    """키트 v2 재질: 칠할 채널이 있는 역할은 recolor + 채널, 없는 역할은 고정색(`materialIssues`)."""
    if V2_ROLE_CHANNELS.get(role):
        return {"role": role, "channel": channel, "tint": {"mode": "recolor"}, "doubleSided": double_sided}
    return {"role": role, "tint": {"mode": "fixed", "hex": km.FIXED_TINT_HEX}, "doubleSided": double_sided}


def ext_declarations(info: km.GlbInfo, part: FoundPart, materials: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """확장(키트 v2) 메시 선언: 프리미티브가 여럿이면 `primitiveRoles`·`primitiveMaterials`, 하나면 `role`·`material`. 재질은 `materials`에 v2 꼴로 더한다."""
    declarations = []
    for mesh in info.meshes:
        prim_materials = [str(prim.material) for prim in mesh.prims]
        slots, error = primitive_slots(mesh, part)
        if error or slots is None:
            raise SystemExit(f"{part.preset_id}: {error}")
        roles = [role for role, _ in slots]
        if len(mesh.prims) > 1:
            declaration: dict[str, Any] = {"node": mesh.node, "primitiveRoles": roles, "primitiveMaterials": prim_materials}
        else:
            declaration = {"node": mesh.node, "role": roles[0], "material": prim_materials[0]}
        declaration.update({"triangles": mesh.triangles, "vertices": mesh.vertices, "skinned": True, "morphs": list(mesh.morphs)})
        declarations.append(declaration)
        for (role, channel), material in zip(slots, prim_materials, strict=True):
            materials[material] = v2_material(role, channel, info.materials[material].double_sided)
    return declarations


def is_v1_compatible(info: km.GlbInfo, part: FoundPart, contract: contract_mod.Contract) -> bool:
    return part.name in contract.raw["presetVocabulary"].get(part.slot, []) and all(len({p.material for p in m.prims}) == 1 and not any(SHAPE_KEY_PATTERN.match(n) for n in m.morphs) for m in info.meshes)


def build_manifest(work_kit: Path, contract: contract_mod.Contract, old_kit: dict[str, Any], installed: list[FoundPart], profile: str, repo_root: Path) -> tuple[dict[str, Any], list[str]]:
    """작업 키트 폴더의 GLB로 kit.json을 만든다. 반환: manifest, 메모(한글)."""
    notes: list[str] = []
    metas = base_metas_from_kit(old_kit)
    hides = existing_hides(old_kit)
    for part in installed:
        hides.setdefault(part.preset_id, {})[part.base] = {"hides": list(part.meta.get("hides", []))}
    ext_only = [part for part in installed if profile != "v1" and not is_v1_compatible(km.inspect_glb((work_kit / part.kit_relative).read_bytes()), part, contract)]
    # kit_manifest는 v1 규칙으로만 읽으므로 확장 전용 GLB는 잠시 치워 두고 v1 매니페스트를 만든 뒤 덧붙인다
    park_dir = work_kit.parent / "parked-ext"
    parked: list[tuple[Path, Path]] = []
    for part in ext_only:
        src, dst = work_kit / part.kit_relative, park_dir / part.kit_relative
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(src, dst)
        parked.append((dst, src))
    old_command = list(old_kit.get("generator", {}).get("command", []))
    try:
        manifest = km.build_manifest(
            kit_dir=work_kit,
            contract=contract,
            base_id=metas[0]["baseId"],
            base_path=f"bases/{metas[0]['baseId']}.glb",
            base_meta=metas[0],
            parts=km.discover_parts(work_kit, [m["baseId"] for m in metas], hides),
            repo_root=repo_root,
            generator_command=old_command + [c for c in ("forge_install.py",) if c not in old_command],
            blender_version=old_kit.get("generator", {}).get("blender", "unknown"),
            hyper3d_sources=None,
            extra_bases=[{"base_id": m["baseId"], "base_path": f"bases/{m['baseId']}.glb", "base_meta": m} for m in metas[1:]],
            unavailable_reasons=existing_unavailable(old_kit),
        )
    finally:
        for dst, src in parked:
            src.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(dst, src)
        shutil.rmtree(park_dir, ignore_errors=True)
    for key in ("displayName", "physics"):
        if key in old_kit:
            manifest[key] = old_kit[key]
    patch_provenance(manifest, old_kit, installed)
    if profile != "v1":
        blocks = {block["id"]: block for block in manifest["parts"]}
        ext_ids = {p.preset_id for p in ext_only}
        for part in ext_only:
            data = (work_kit / part.kit_relative).read_bytes()
            info = km.inspect_glb(data, part.kit_relative)
            block = blocks.get(part.preset_id)
            if block is None:
                block = {"id": part.preset_id, "slot": part.slot, "variants": {}, "unavailable": {}}
                manifest["parts"].append(block)
                blocks[part.preset_id] = block
                notes.append(f"{part.preset_id}: 계약 어휘 밖 프리셋을 확장 파츠로 더했다(계약 어휘 확장 필요).")
            block["variants"][part.base] = {"file": {"path": part.kit_relative, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}, "meshes": ext_declarations(info, part, manifest["materials"]), "hides": list(part.meta.get("hides", []))}
            block["unavailable"].pop(part.base, None)
        for block in manifest["parts"]:
            if block["id"] in ext_ids:
                for base_id in manifest["bases"]:
                    if base_id not in block["variants"] and base_id not in block["unavailable"]:
                        block["unavailable"][base_id] = "이 베이스용 forge 확장 파츠를 아직 만들지 않았습니다."
        for part in installed:
            variant = blocks[part.preset_id]["variants"].get(part.base)
            if variant is not None:
                for key in EXT_VARIANT_FIELDS:
                    if key in part.meta:
                        variant[key] = part.meta[key]
        try:
            manifest["slotCapabilities"] = km.derive_capabilities(manifest, repo_root)
        except km.ManifestError as error:
            notes.append(f"확장 매니페스트의 슬롯 능력 재계산 실패(v1 값을 유지): {error}")
    return manifest, notes


def anchor_table(installed: list[FoundPart]) -> dict[str, list[str]]:
    """앵커 → 프리셋 목록(레지스트리 `anchors`, 없으면 `anchor`). 같은 앵커의 동시 착용 규칙(layer·conflicts·stacking)을 정할 때 본다."""
    table: dict[str, set[str]] = {}
    for part in installed:
        for anchor in part.meta.get("anchors") or ([part.meta["anchor"]] if part.meta.get("anchor") else []):
            table.setdefault(str(anchor), set()).add(part.preset_id)
    return {anchor: sorted(ids) for anchor, ids in sorted(table.items())}


def v2_parts_preview(manifest: dict[str, Any], installed: list[FoundPart], verdicts: list[Verdict], contract: contract_mod.Contract) -> dict[str, Any]:
    """포지 파츠를 키트 v2 엄격 스키마 꼴(`kitV2PartSchema` 변형: file·meshes·hides·shapes·anchor)로 옮긴 미리보기 + 포지 메타 + 어휘 밖 프리셋.

    v2 변형은 엄격(strict)이라 역할·채널·라벨·앵커 목록·겹쳐 쓰기 규칙은 `forgeMeta`로 따로 둔다(계약 소유자가 어디에 둘지 정한다)."""
    ids = sorted({p.preset_id for p in installed})
    blocks = {block["id"]: block for block in manifest["parts"]}
    used_materials: set[str] = set()
    parts, forge_meta = [], {}
    for preset_id in ids:
        block = blocks.get(preset_id)
        if block is None:
            continue
        entry: dict[str, Any] = {"id": preset_id, "slot": block["slot"], "variants": {}, "unavailable": dict(block.get("unavailable", {}))}
        for part in (p for p in installed if p.preset_id == preset_id):
            variant = block["variants"].get(part.base)
            if variant is None or "meshes" not in variant:
                continue
            meshes = [{k: v for k, v in mesh.items() if k in ("node", "role", "material", "primitiveRoles", "primitiveMaterials", "triangles", "vertices", "skinned", "morphs")} for mesh in variant["meshes"]]
            for mesh in meshes:
                used_materials.update(mesh.get("primitiveMaterials") or [mesh.get("material")])
            verdict = next((v for v in verdicts if v.part is part), None)
            v2: dict[str, Any] = {"file": variant["file"], "meshes": meshes, "hides": list(variant.get("hides", [])), "shapes": list(verdict.info.get("shapes", [])) if verdict else []}
            if part.meta.get("anchor"):
                v2["anchor"] = part.meta["anchor"]
            entry["variants"][part.base] = v2
            entry["unavailable"].pop(part.base, None)
            meta = {k: part.meta[k] for k in ("meshRole", "channels", "anchors", "layer", "conflicts", "stacking", "groundOffsetM") if k in part.meta}
            labels = {str(s["name"]): s.get("labelKo") for s in part.meta.get("shapes") or [] if isinstance(s, dict)}
            if labels:
                meta["shapeLabelsKo"] = labels
            forge_meta.setdefault(preset_id, {})[part.base] = meta
        parts.append(entry)
    vocabulary = contract.raw["presetVocabulary"]
    additions: dict[str, list[str]] = {}
    for preset_id in ids:
        slot, name = preset_id.split("/", 1)
        if name not in vocabulary.get(slot, []):
            additions.setdefault(slot, []).append(name)
    return {
        "schema": "toonstudio.forge-v2-parts-preview/1",
        "noteKo": "키트 v2(toonstudio.character-kit/2) 파츠 항목 미리보기. 재질은 v2 꼴(role·channel·tint·doubleSided). 어휘 밖 프리셋은 SLOT_PRESET_IDS 확장 뒤에만 넣을 수 있다.",
        "materials": {name: manifest["materials"][name] for name in sorted(used_materials) if name in manifest["materials"]},
        "parts": parts,
        "forgeMeta": forge_meta,
        "vocabularyAdditions": additions,
    }


def v2_check_manifest(old_kit: dict[str, Any], preview: dict[str, Any], include_outside_vocabulary: bool, vocabulary: dict[str, list[str]]) -> dict[str, Any]:
    """키트 v2 스키마 검사용 매니페스트: 현재 키트(v1)를 v2 꼴로 옮기고(재질 → role·channel·tint, 변형 shapes [], 베이스 headHeightM 자리값·anchors {})
    포지 미리보기 파츠·재질을 덮는다. `include_outside_vocabulary`가 거짓이면 어휘 밖 프리셋은 빼고 검사한다(어휘 실패와 나머지 규칙을 나눠 본다)."""
    manifest = json.loads(json.dumps(old_kit))
    manifest["schema"] = V2_SCHEMA_ID
    manifest["budgets"] = {**manifest["budgets"], "maxShapesPerVariant": MAX_SHAPES_PER_VARIANT}
    materials: dict[str, Any] = {}
    for name, material in manifest["materials"].items():
        role = material["role"]
        channels = V2_ROLE_CHANNELS.get(role, ())
        if channels:
            materials[name] = {"role": role, "channel": channels[0], "tint": {"mode": "recolor"}, "doubleSided": material["doubleSided"]}
        else:
            materials[name] = {"role": role, "tint": {"mode": "fixed", "hex": material["tint"].get("hex", km.FIXED_TINT_HEX)}, "doubleSided": material["doubleSided"]}
    materials.update(preview["materials"])
    manifest["materials"] = materials
    for base in manifest["bases"].values():
        base.setdefault("headHeightM", V2_CHECK_HEAD_HEIGHT_M)
        base.setdefault("anchors", {})
    for part in manifest["parts"]:
        for variant in part["variants"].values():
            variant.setdefault("shapes", [])
    by_id = {part["id"]: part for part in manifest["parts"]}
    for part in preview["parts"]:
        slot, name = part["id"].split("/", 1)
        if not include_outside_vocabulary and name not in vocabulary.get(slot, []):
            continue
        block = by_id.setdefault(part["id"], {"id": part["id"], "slot": part["slot"], "variants": {}, "unavailable": {}})
        if block not in manifest["parts"]:
            manifest["parts"].append(block)
        for base_id, variant in part["variants"].items():
            block["variants"][base_id] = variant
            block["unavailable"].pop(base_id, None)
    return manifest


def run_v2_check(repo_root: Path, tsx: Path, work: Path, manifest: dict[str, Any], label: str) -> dict[str, Any]:
    """계약 TS 원본(`kitManifestV2Schema`)으로 매니페스트를 파싱한다. 계약 모듈이 없으면 건너뛴다."""
    contract_file = repo_root / V2_CONTRACT_MODULE
    if not contract_file.is_file():
        return {"skipped": True, "reasonKo": f"계약 모듈이 없다: {contract_file}"}
    manifest_path = work / f"v2-check-{label}.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    script = work / "v2-check.mts"
    script.write_text(V2_CHECK_SCRIPT, encoding="utf-8")
    result = subprocess.run([str(tsx), str(script), str(manifest_path), str(contract_file)], cwd=repo_root, capture_output=True, text=True, check=False)
    try:
        data = json.loads(result.stdout)
    except ValueError:
        return {"ok": False, "exitCode": result.returncode, "stderr": result.stderr[-1500:]}
    issues = data.get("issues", [])
    return {"ok": data.get("ok"), "manifest": str(manifest_path), "issueCount": len(issues), "issues": issues[:80]}


def split_sections(text: str) -> list[tuple[str, str]]:
    """마크다운을 (`## ` 머리줄, 본문) 조각으로 나눈다. 첫 조각의 머리줄은 빈 문자열(머리말)."""
    out = []
    for chunk in re.split(r"(?m)^(?=## )", text):
        if chunk.startswith("## "):
            head, _, body = chunk.partition("\n")
            out.append((head, body))
        elif chunk:
            out.append(("", chunk))
    return out


REPRO_FORGE_LINES = (
    "<venv>/bin/python -I tools/blender/character_kit/forge_build_shoes.py build --base all --out ~/.cache/toonstudio-kit/out5/shoes\n"
    "python3 -I tools/blender/character_kit/forge_install.py --source <포지 산출물 폴더> ... [--apply --target <키트 폴더>]\n"
)


def notice_text(contract: contract_mod.Contract, manifest: dict[str, Any], old_notice: str | None, installed: list[FoundPart]) -> str:
    """`kit_manifest.notice_text` 고지에 ① 포지 파츠 줄(원천 2), ② 기존 고지의 "원천 3 … 제외" 역사 절, ③ kit.json에서 센 실제 파일 목록을 넣는다."""
    old_sections = split_sections(old_notice or "")
    preserved = [s for s in old_sections if s[0].startswith("## 원천 3") and "제외" in s[0]]
    old_files_body = next((body for head, body in old_sections if head.startswith("## 들어 있는 파일")), "")
    excluded_lines = [line.split(" 아직 없는 프리셋은", 1)[0].rstrip() for line in old_files_body.splitlines() if line.startswith("- 제외한 ")]
    bases = list(manifest["bases"])
    present = sorted(p["id"] for p in manifest["parts"] if p["variants"])
    files = sum(len(p["variants"]) for p in manifest["parts"])
    out: list[str] = []
    for head, body in split_sections(km.notice_text(contract, manifest)):
        if head.startswith("## 원천 2") and installed:
            body = body.rstrip("\n") + "\n- " + forge_note_ko(installed) + " 생성 기록·검사 수치는 각 포지의 build-report.json에 있다.\n\n"
        if head.startswith("## 원천 3"):
            continue
        if head.startswith("## 쓰지 않은 것"):
            out.extend(p_head + "\n" + p_body for p_head, p_body in preserved)
            if preserved:
                body = body.rstrip("\n") + "\n  `hyper3d-rodin-output` 파생 파츠의 제외 경위는 위 원천 3의 기록에 있다.\n\n"
        if head.startswith("## 들어 있는 파일"):
            body = (
                "\n"
                + f"- 베이스: {', '.join(f'`bases/{b}.glb`' for b in bases)}\n"
                + f"- 파츠(현재 제공 {len(present)}종, 변형 파일 {files}개): {', '.join(present) if present else '없음'}\n"
                + "".join(line + "\n" for line in excluded_lines)
                + "- 아직 없는 프리셋은 `kit.json`의 `parts[].unavailable`에 한글 사유가 있다. 이 절은 `forge_install.py`가 `kit.json`에서 다시 센다.\n\n"
            )
        if head.startswith("## 재현"):
            body = body.replace("--base female", "--base all")
            body = body.replace("<venv>/bin/python -I tools/blender/character_kit/build_kit_json.py ...\n", "<venv>/bin/python -I tools/blender/character_kit/build_kit_json.py ...\n" + REPRO_FORGE_LINES, 1)
        out.append((head + "\n" if head else "") + body)
    return "".join(out)


# ---------------------------------------------------------------- 검증기·적용


def run_verifier(repo_root: Path, kit_dir: Path, json_out: Path, tsx: Path) -> dict[str, Any]:
    command = [str(tsx), "scripts/verify-character-kit.mjs", "--root", str(kit_dir), "--base", "all", "--json", str(json_out)]
    result = subprocess.run(command, cwd=repo_root, capture_output=True, text=True, check=False)
    summary: dict[str, Any] = {"command": " ".join(command), "exitCode": result.returncode, "json": str(json_out)}
    if json_out.is_file():
        data = json.loads(json_out.read_text(encoding="utf-8"))
        summary.update({"ok": data.get("ok"), "errors": data.get("errors"), "warnings": data.get("warnings"), "checks": {k: v.get("status") for k, v in data.get("checks", {}).items()}})
        summary["errorFindings"] = [f for f in data.get("findings", []) if f.get("level") == "error"][:60]
        summary["warningFindings"] = [f for f in data.get("findings", []) if f.get("level") == "warning"][:60]
    else:
        summary["stderr"] = result.stderr[-2000:]
    return summary


def dump_contract(repo_root: Path, tsx: Path, out: Path) -> contract_mod.Contract:
    result = subprocess.run([str(tsx), "scripts/blender/dump-kit-contract.mjs", "--out", str(out)], cwd=repo_root, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise SystemExit(f"계약 덤프 실패: {result.stderr.strip()[-600:]}")
    return contract_mod.load(out)


def apply_to_target(work_kit: Path, target: Path, backup_root: Path) -> dict[str, Any]:
    """대상 키트를 백업하고 작업 키트로 바꾼다. 대상에만 있던 파일은 지운다(백업에 남는다)."""
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = backup_root / f"{target.name}-{stamp}"
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(target, backup)
    new_files = {p.relative_to(work_kit) for p in work_kit.rglob("*") if p.is_file()}
    removed = []
    for path in sorted(target.rglob("*"), reverse=True):
        rel = path.relative_to(target)
        if path.is_file() and rel not in new_files:
            path.unlink()
            removed.append(rel.as_posix())
        elif path.is_dir() and not any(path.iterdir()):
            path.rmdir()
    changed = []
    for rel in sorted(new_files):
        dst = target / rel
        if not dst.is_file() or sha256_file(dst) != sha256_file(work_kit / rel):
            changed.append(rel.as_posix())
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(work_kit / rel, dst)
    return {"backup": str(backup), "changed": changed, "removed": removed, "restore": f"python3 -I tools/blender/character_kit/forge_install.py --restore {backup} --target {target}"}


def restore(backup: Path, target: Path) -> int:
    if not (backup / km.MANIFEST_FILE).is_file():
        raise SystemExit(f"백업 폴더에 kit.json이 없습니다: {backup}")
    shutil.rmtree(target)
    shutil.copytree(backup, target)
    print(json.dumps({"restored": str(target), "from": str(backup)}, ensure_ascii=False))
    return 0


# ---------------------------------------------------------------- 진입


def run(args: argparse.Namespace) -> dict[str, Any]:
    repo_root = Path(args.repo_root).resolve()
    tsx = Path(args.tsx) if args.tsx else repo_root / "node_modules" / ".bin" / "tsx"
    kit_dir = Path(args.kit).resolve()
    target = Path(args.target).resolve() if args.target else None
    if args.apply and target != kit_dir:
        raise SystemExit(f"--target({target})이 복사 원본 --kit({kit_dir})과 다릅니다. 대상 키트를 --kit으로도 주어야 대상의 다른 파일을 잃지 않습니다.")
    sources = [Path(s).expanduser().resolve() for s in (args.source or [str(s) for s in DEFAULT_SOURCES])]
    if args.work:
        work = Path(args.work).expanduser().resolve()
        if work.exists() and any(work.iterdir()):
            raise SystemExit(f"작업 폴더가 비어 있지 않습니다: {work}")
        work.mkdir(parents=True, exist_ok=True)
    else:
        WORK_ROOT.mkdir(parents=True, exist_ok=True)
        work = Path(tempfile.mkdtemp(prefix=f"{args.profile}-{datetime.datetime.now():%Y%m%d-%H%M%S}-", dir=WORK_ROOT))
    kit_digest = tree_digest(kit_dir)
    work_kit = work / kit_dir.name
    shutil.copytree(kit_dir, work_kit)
    old_kit = json.loads((kit_dir / km.MANIFEST_FILE).read_text(encoding="utf-8"))
    old_notice_path = kit_dir / km.KIT_NOTICE_FILE
    old_notice = old_notice_path.read_text(encoding="utf-8") if old_notice_path.is_file() else None
    contract = dump_contract(repo_root, tsx, work / "contract.json")
    found, conflicts, missing = discover(sources, args.profile, args.only or [])
    chosen = resolve_conflicts(found, args.on_conflict)
    verdicts = [inspect_part(part, contract, args.profile) for part in chosen]
    accepted = [v.part for v in verdicts if v.accepted]
    conflict_warnings = check_conflict_targets(accepted, {p["id"] for p in old_kit.get("parts", [])}) if args.profile != "v1" else []
    added, replaced = [], []
    for part in accepted:
        dst = work_kit / part.kit_relative
        if dst.is_file():
            replaced.append({"preset": part.preset_id, "base": part.base, "oldSha256": sha256_file(dst), "newSha256": part.sha256})
        else:
            added.append({"preset": part.preset_id, "base": part.base, "sha256": part.sha256})
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(part.path, dst)
    manifest, notes = build_manifest(work_kit, contract, old_kit, accepted, args.profile, repo_root)
    km.write_manifest(manifest, work_kit / km.MANIFEST_FILE)
    (work_kit / km.KIT_NOTICE_FILE).write_text(notice_text(contract, manifest, old_notice, accepted), encoding="utf-8")
    verify = {"skipped": True} if args.skip_verify else run_verifier(repo_root, work_kit, work / "verify.json", tsx)
    summary: dict[str, Any] = {
        "schema": "toonstudio.forge-install/1",
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "profile": args.profile,
        "mode": "apply" if args.apply else "dry-run",
        "kit": str(kit_dir),
        "kitTreeSha256": kit_digest,
        "work": str(work),
        "workKit": str(work_kit),
        "sources": [str(s) for s in sources],
        "missingSources": missing,
        "only": args.only or [],
        "found": len(found),
        "conflicts": conflicts,
        "accepted": [{"preset": v.part.preset_id, "base": v.part.base, "path": v.part.path, "bytes": v.part.bytes, "triangles": v.info.get("triangles"), "shapeKeys": v.info.get("shapeKeys"), "warnings": v.warnings} for v in verdicts if v.accepted],
        "rejected": [{"preset": v.part.preset_id, "base": v.part.base, "path": v.part.path, "problems": v.problems} for v in verdicts if not v.accepted],
        "conflictTargetWarnings": conflict_warnings,
        "added": added,
        "replaced": replaced,
        "notes": notes,
        "verify": verify,
    }
    if args.profile != "v1":
        summary["expectedContractFailuresKo"] = (
            "확장 프로필의 kit.json은 v1 꼴에 키트 v2 파츠 블록을 덧붙인 것이라 v1 검증기(V1 등)가 새 필드·다중 재질·shape:* 이름·hair-accessory 역할·어휘 밖 "
            "프리셋에서 실패하는 것이 정상이다. 키트 v2로 옮길 항목은 v2-parts-preview.json(이 도구가 v2 규칙 사본으로 미리 검사한 것)에 있다."
        )
        summary["anchorTable"] = anchor_table(accepted)
        preview = v2_parts_preview(manifest, accepted, verdicts, contract)
        preview_path = work / "v2-parts-preview.json"
        preview_path.write_text(json.dumps(preview, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        summary["v2Preview"] = {"path": str(preview_path), "parts": len(preview["parts"]), "materials": len(preview["materials"]), "vocabularyAdditions": preview["vocabularyAdditions"]}
        if not args.skip_verify:
            # 계약 TS 원본으로 두 번 검사: 어휘 안 파츠만(나머지 규칙이 통과해야 한다), 전부(어휘 밖 프리셋만 실패해야 한다)
            vocabulary = contract.raw["presetVocabulary"]
            summary["v2Check"] = {
                "inVocabulary": run_v2_check(repo_root, tsx, work, v2_check_manifest(old_kit, preview, False, vocabulary), "in-vocabulary"),
                "all": run_v2_check(repo_root, tsx, work, v2_check_manifest(old_kit, preview, True, vocabulary), "all"),
                "noteKo": f"베이스 headHeightM은 검사용 자리값 {V2_CHECK_HEAD_HEIGHT_M} m, 베이스 anchors는 빈 표(베이스 v2 값은 베이스 빌더가 채운다).",
            }
    if args.apply:
        assert target is not None
        passed = verify.get("exitCode") == 0 and not summary["rejected"]
        if tree_digest(target) != kit_digest:
            summary["applied"] = False
            summary["applyBlockedKo"] = "복사한 뒤 대상 키트가 바뀌었다(다른 작업이 고쳤을 수 있다). dry-run부터 다시 돌린다."
        elif not passed and not args.allow_verify_errors:
            summary["applied"] = False
            summary["applyBlockedKo"] = "검증기 오류나 거부된 파츠가 있어 대상 키트를 바꾸지 않았다(--allow-verify-errors로 강제할 수 있다)."
        else:
            summary["applied"] = True
            summary["apply"] = apply_to_target(work_kit, target, Path(args.backup_root).expanduser())
    report = Path(args.report).expanduser() if args.report else work / "forge-install-report.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary["report"] = str(report)
    if args.discard_work and not args.apply:
        shutil.rmtree(work_kit, ignore_errors=True)
    return summary


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--kit", default=str(DEFAULT_KIT), help="복사해 쓸 키트 폴더(읽기만 한다)")
    parser.add_argument("--source", action="append", help="포지 산출물 폴더(반복). 기본: ~/.cache/toonstudio-kit/out5/{hair,garments,shoes}")
    parser.add_argument("--only", action="append", help="프리셋 id 접두어(반복, 예: shoes/ 또는 accessory/cap)")
    parser.add_argument("--profile", choices=("v1", "ext", "v2"), default="v1", help="v1(현재 계약) | ext·v2(키트 v2 확장 제안 — 같은 프로필, 폴더 이름만 다르다)")
    parser.add_argument("--work", default=None, help="작업 폴더(비어 있어야 한다). 기본: ~/.cache/toonstudio-kit/forge-install/<profile>-<시각>-*")
    parser.add_argument("--report", default=None, help="요약 JSON 경로(기본: <work>/forge-install-report.json)")
    parser.add_argument("--on-conflict", choices=("error", "last"), default="error")
    parser.add_argument("--apply", action="store_true", help="검증 통과 시 --target 키트를 갱신한다(먼저 백업한다)")
    parser.add_argument("--target", default=None)
    parser.add_argument("--allow-verify-errors", action="store_true")
    parser.add_argument("--backup-root", default=str(WORK_ROOT / "backups"))
    parser.add_argument("--restore", default=None, help="백업 폴더로 --target을 되돌린다")
    parser.add_argument("--skip-verify", action="store_true", help="검증기를 돌리지 않는다(시험용)")
    parser.add_argument("--discard-work", action="store_true", help="dry-run 뒤 작업 키트 사본을 지운다(요약·검증 JSON은 남긴다)")
    parser.add_argument("--repo-root", default=str(REPO_ROOT))
    parser.add_argument("--tsx", default=None, help="tsx 실행 파일(기본: <repo>/node_modules/.bin/tsx)")
    args = parser.parse_args(argv)
    if (args.apply or args.restore) and not args.target:
        parser.error("--apply·--restore에는 --target이 필요합니다")
    return args


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if args.restore:
        return restore(Path(args.restore).resolve(), Path(args.target).resolve())
    summary = run(args)
    printable: dict[str, Any] = {k: summary[k] for k in ("profile", "mode", "workKit", "found", "missingSources", "notes", "report") if k in summary}
    printable["added"] = [f"{a['preset']}@{a['base']}" for a in summary["added"]]
    printable["replaced"] = [f"{r['preset']}@{r['base']}" for r in summary["replaced"]]
    printable["rejected"] = [{"part": f"{r['preset']}@{r['base']}", "problems": r["problems"][:3]} for r in summary["rejected"]]
    printable["verify"] = {k: summary["verify"].get(k) for k in ("exitCode", "errors", "warnings") if k in summary["verify"]}
    printable["verify"]["failedChecks"] = sorted(k for k, v in (summary["verify"].get("checks") or {}).items() if v == "fail")
    if "applied" in summary:
        printable["applied"] = summary["applied"]
        printable["apply"] = summary.get("apply") or summary.get("applyBlockedKo")
    print(json.dumps(printable, ensure_ascii=False, indent=2))
    verify_failed = summary["verify"].get("exitCode") not in (0, None)
    if args.apply:
        return 0 if summary.get("applied") else 1
    return 1 if (summary["rejected"] or (verify_failed and args.profile == "v1")) else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
