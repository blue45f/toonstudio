"""키트 출처(`provenance`)와 사람용 고지(`NOTICE.md`) 작성 — `kit_manifest`가 이 모듈의 이름을 그대로 다시 내보낸다(호환).

2026-10-23 `kit_manifest.py`에서 옮기면서 두 가지를 고쳤다.

1. **원본 파츠 설명을 키트 내용에서 만든다.** `toonstudio-original` 출처의 이름·가공 내용과 `NOTICE.md` 원천 2는 고정 문장이었다
   (초커가 빠져 있었고 헤어를 넣을 자리가 없었다). 이제 키트에 **등록된** 원본 파츠(Hyper3D 출처 표에 없는 것)를 만든 도구별로 묶어 적는다.
2. **손으로 남긴 기록을 지킨다.** 공개 키트의 `kit.json`·`NOTICE.md`에는 생성기가 만들지 않는 기록(2026-10-14·15 Hyper3D 파생 파츠 제외 경위,
   미제공 사유, 제외한 변형 수)이 있다. `PreservedRecords`로 이전 기록을 받아 `summaryKo`·NOTICE의 "원천 3 … 제외" 절·"제외한 …" 줄을 그대로 옮긴다.
   `NOTICE.md`의 "들어 있는 파일" 절은 `kit.json`에서 다시 센다(이전에는 "남성 베이스는 만들지 않았다"는 고정 문장이 남아 있었다).

Hyper3D 출처 표(`hyper3d_sources.json`) 형식과 출처 항목 규칙은 `kit_manifest` 모듈 설명에 있다. 등록된 파츠의 레지스트리가 `license: original`인데
출처 표에도 같은 키가 있으면 어느 쪽이 맞는지 알 수 없으므로 `ManifestError`로 멈춘다(원본을 Hyper3D로, 또는 그 반대로 잘못 적지 않는다).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from . import contract as contract_mod

KIT_NOTICE_FILE = "NOTICE.md"

#: 계약 `KIT_ALLOWED_LICENSES`·`KIT_HYPER3D_EVIDENCE_PREFIX`(`src/contracts/kit-provenance.ts`)의 사본이다(`contract.json` 덤프에는 들어 있지 않다).
#: 어긋나면 `tests/test_kit_manifest.py`가 TS 원본을 읽어 잡아낸다.
HYPER3D_LICENSE = "hyper3d-rodin-output"
HYPER3D_EVIDENCE_PREFIX = "apps/character-lab/docs/"
HYPER3D_SOURCES_SCHEMA = "toonstudio.hyper3d-sources/1"
HYPER3D_SOURCE_NAME = "Hyper3D(Rodin Gen-2.5) 생성물"
HYPER3D_SOURCES_FILE = Path(__file__).resolve().parent / "hyper3d_sources.json"
_UUID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
_HANGUL_PATTERN = re.compile(r"[가-힣]")

#: 원본 파츠를 만든 도구(프리셋 id → 도구). 표에 없으면 슬롯 기본 도구다.
ORIGINAL_PRESET_TOOLS: dict[str, str] = {}
ORIGINAL_SLOT_TOOLS = {
    "irises": "build_irises",
    "accessory": "proc_accessories",
    "hair": "forge_hair",
    "top": "forge_garments",
    "bottom": "forge_garments",
    "shoes": "forge_shoes",
}
#: 도구별 설명(가공 내용·NOTICE 원천 2). `forge_*` 도구의 파츠는 예전에 같은 프리셋 id의 Hyper3D 파생물이 있었으므로 "Hyper3D 생성물이 아님"을 밝힌다.
ORIGINAL_TOOL_NOTES_KO = {
    "build_irises": "베이스 눈 크기·위치에 맞춰 홍채 디스크·동공·캐치라이트를 절차 생성",
    "proc_accessories": "베이스의 눈·귀·목 위치에서 테·고리·띠를 계산해 절차 생성",
    "forge_hair": "베이스 머리 형상에서 가닥 청크(띠 그룹 스윕·두피 덮개·UV 램프)를 절차 생성(2026-10-23, Hyper3D 생성물 아님)",
    "forge_garments": "베이스 몸 표면에서 의상 셸을 절차 생성(Hyper3D 생성물 아님)",
    "forge_shoes": "베이스 발 형상에서 신발을 절차 생성(Hyper3D 생성물 아님)",
}
ORIGINAL_SLOT_LABELS_KO = {"irises": "홍채", "accessory": "소품", "hair": "헤어", "top": "상의", "bottom": "하의", "shoes": "신발"}
#: summaryKo에 덧붙이는 원본 파츠 기록 문장의 머리말(다시 만들 때 이전 문장을 지우는 표지)
ORIGINAL_SUMMARY_MARKER = "원본 파츠 기록:"
_ORIGINAL_SUMMARY_PATTERN = re.compile(rf" ?{re.escape(ORIGINAL_SUMMARY_MARKER)}[^\n]*?(?=$| 원본 파츠 기록:)")


class ManifestError(ValueError):
    """키트 파일이 계약에 어긋나 manifest를 만들 수 없을 때(한글 사유)."""


@dataclass(frozen=True)
class PreservedRecords:
    """이전 `kit.json`·`NOTICE.md`에서 옮길 손 기록. `unavailable`은 `프리셋@베이스` → 사유, `hides`는 프리셋 → 베이스 → 영역 목록."""

    summary_ko: str | None = None
    notice: str | None = None
    unavailable: dict[str, str] = field(default_factory=dict)
    hides: dict[str, dict[str, list[str]]] = field(default_factory=dict)

    @staticmethod
    def from_kit(kit: dict[str, Any] | None, notice: str | None = None) -> "PreservedRecords":
        """기존 manifest(dict)와 NOTICE 본문에서 지킬 기록을 꺼낸다(없으면 빈 기록)."""
        if not kit:
            return PreservedRecords(notice=notice)
        unavailable = {f"{part['id']}@{base_id}": reason for part in kit.get("parts", []) for base_id, reason in part.get("unavailable", {}).items()}
        hides: dict[str, dict[str, list[str]]] = {}
        for part in kit.get("parts", []):
            for base_id, variant in part.get("variants", {}).items():
                hides.setdefault(part["id"], {})[base_id] = list(variant.get("hides", []))
        return PreservedRecords(summary_ko=kit.get("provenance", {}).get("summaryKo"), notice=notice, unavailable=unavailable, hides=hides)


# ---------------------------------------------------------------- Hyper3D 출처 표


@dataclass(frozen=True)
class Hyper3dSources:
    """`hyper3d_sources.json`의 내용(형식 검사를 마친 것). `sources`의 키는 프리셋 id다."""

    record_doc: str
    sources: dict[str, dict[str, Any]]


def load_hyper3d_sources(path: Path, repo_root: Path) -> Hyper3dSources:
    """Hyper3D 출처 표를 읽어 형식과 반입 기록 문서의 존재를 검사한다(항목별 값 검사는 파츠가 등록될 때 `hyper3d_source_entry`가 한다)."""
    try:
        document = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise ManifestError(f"Hyper3D 출처 표를 읽지 못했습니다({path}): {error}") from error
    if not isinstance(document, dict) or document.get("schema") != HYPER3D_SOURCES_SCHEMA:
        raise ManifestError(f"Hyper3D 출처 표의 schema가 {HYPER3D_SOURCES_SCHEMA}가 아닙니다({path}).")
    record_doc = document.get("recordDoc")
    if not isinstance(record_doc, str) or not record_doc.startswith(HYPER3D_EVIDENCE_PREFIX) or ".." in record_doc or "\\" in record_doc:
        raise ManifestError(f"Hyper3D 출처 표의 recordDoc는 {HYPER3D_EVIDENCE_PREFIX} 아래의 상대 경로여야 합니다: {record_doc!r}")
    if not (Path(repo_root) / record_doc).is_file():
        raise ManifestError(f"Hyper3D 반입 기록 문서가 저장소에 없습니다: {record_doc}")
    sources = document.get("sources")
    if not isinstance(sources, dict):
        raise ManifestError("Hyper3D 출처 표에 sources 객체가 없습니다.")
    return Hyper3dSources(record_doc=record_doc, sources=sources)


def hyper3d_source_entry(preset_id: str, record: dict[str, Any], record_doc: str) -> dict[str, Any]:
    """파츠 하나의 `provenance.sources[]` 항목을 만든다. 계약(`manifestIssues`)·검증기 V4가 요구하는 값이 모자라면 ManifestError."""
    base_key, _, base_id = preset_id.partition("@")  # `슬롯/이름@베이스`: 그 베이스만 다른 생성물을 쓸 때(남성 전용 헤어·의상)
    if "/" not in base_key or ("@" in preset_id and not base_id):
        raise ManifestError(f"Hyper3D 출처 표의 키가 슬롯/이름[@베이스] 형식이 아닙니다: {preset_id}")
    if not isinstance(record, dict):
        raise ManifestError(f"{preset_id}: Hyper3D 출처 표 항목이 객체가 아닙니다.")

    def text(key: str, valid: Any, expectation: str) -> str:
        value = record.get(key)
        if not isinstance(value, str) or not valid(value):
            raise ManifestError(f"{preset_id}: Hyper3D 출처 표의 {key}가 올바르지 않습니다({expectation}): {value!r}")
        return value

    slot, name = base_key.split("/", 1)
    return {
        "id": f"hyper3d-{slot}-{name}" + (f"-{base_id}" if base_id else ""),
        "name": f"{HYPER3D_SOURCE_NAME} {preset_id}",
        "version": text("tier", bool, "비어 있지 않은 문자열"),
        "url": text("displayUrl", lambda value: value.startswith("https://"), "https URL"),
        "zipSha256": text("rawSha256", _SHA256_PATTERN.match, "원본 GLB의 SHA-256, 소문자 64자리 hex"),
        "license": HYPER3D_LICENSE,
        "derivative": True,
        "changesKo": text("changesKo", _HANGUL_PATTERN.search, "한글 변경 내용"),
        "generationId": text("generationId", _UUID_PATTERN.match, "소문자 uuid"),
        "evidenceDoc": record_doc,
    }


def hyper3d_provenance_sources(
    hyper3d: Hyper3dSources | None,
    registered_ids: Iterable[str],
    registry_licenses: dict[str, str] | None = None,
) -> list[tuple[str, dict[str, Any]]]:
    """키트에 **등록된** 파츠 중 출처 표에 키가 있는 것의 (프리셋 id, 출처 항목). 등록되지 않은 파츠는 넣지 않는다.

    `registry_licenses`(레지스트리가 밝힌 프리셋별 license)가 `original`인 파츠가 출처 표에도 있으면 ManifestError다.
    """
    if hyper3d is None:
        return []
    registered = list(registered_ids)
    keys = [key for key in registered if key in hyper3d.sources]
    # `슬롯/이름@베이스` 항목은 기본 파츠가 등록돼 있을 때만 넣는다(그 베이스 변형이 키트에 있다는 뜻)
    keys += [key for key in hyper3d.sources if "@" in key and key.partition("@")[0] in registered]
    conflicts = sorted({key.partition("@")[0] for key in keys if (registry_licenses or {}).get(key.partition("@")[0]) == "original"})
    if conflicts:
        raise ManifestError(
            f"출처가 충돌합니다: {', '.join(conflicts)}의 레지스트리는 license original인데 Hyper3D 출처 표에도 같은 키가 있습니다. "
            "원본으로 다시 만든 파츠면 hyper3d_sources.json에서 그 키를 지우고, Hyper3D 파생물이면 레지스트리 license를 고치세요."
        )
    return [(key, hyper3d_source_entry(key, hyper3d.sources[key], hyper3d.record_doc)) for key in keys]


# ---------------------------------------------------------------- 원본 파츠


def original_tool_of(preset_id: str) -> str:
    return ORIGINAL_PRESET_TOOLS.get(preset_id) or ORIGINAL_SLOT_TOOLS.get(preset_id.split("/", 1)[0], "tools/blender/character_kit")


def original_parts_by_tool(original_ids: Iterable[str]) -> dict[str, list[str]]:
    """원본 파츠 id를 만든 도구별로 묶는다(도구 순서는 `ORIGINAL_SLOT_TOOLS` 순, 안은 id 순)."""
    order = list(dict.fromkeys([*ORIGINAL_SLOT_TOOLS.values(), *ORIGINAL_PRESET_TOOLS.values()]))
    grouped: dict[str, list[str]] = {}
    for preset_id in sorted(set(original_ids)):
        grouped.setdefault(original_tool_of(preset_id), []).append(preset_id)
    return {tool: grouped[tool] for tool in sorted(grouped, key=lambda tool: order.index(tool) if tool in order else len(order))}


def _slot_counts_ko(ids: list[str]) -> str:
    counts: dict[str, int] = {}
    for preset_id in ids:
        slot = preset_id.split("/", 1)[0]
        counts[slot] = counts.get(slot, 0) + 1
    return "·".join(f"{ORIGINAL_SLOT_LABELS_KO.get(slot, slot)} {count}종" for slot, count in counts.items())


def original_source_entry(original_ids: Iterable[str]) -> dict[str, Any]:
    """`toonstudio-original` 출처 항목. 이름·가공 내용은 키트에 등록된 원본 파츠에서 만든다."""
    grouped = original_parts_by_tool(original_ids)
    ordered = [preset_id for ids in grouped.values() for preset_id in ids]
    parts_label = _slot_counts_ko(ordered)
    name = f"ToonStudio 원본 디자인(속옷·구강 내부·속눈썹·눈썹{'·' + parts_label if parts_label else ''}·텍스처)"
    details = "; ".join(f"{tool} — {_slot_counts_ko(ids)}({', '.join(ids)}): {ORIGINAL_TOOL_NOTES_KO.get(tool, '절차 생성')}" for tool, ids in grouped.items())
    changes = "tools/blender/character_kit 로 절차 생성한 원본 지오메트리와 텍스처입니다. 외부 에셋·생성 AI를 쓰지 않았습니다."
    if details:
        changes += f" 파츠: {details}."
    return {"id": "toonstudio-original", "name": name, "license": "original", "derivative": False, "changesKo": changes}


def original_summary_note(original_ids: Iterable[str]) -> str:
    """summaryKo에 덧붙일 원본 파츠 기록(포지 도구 파츠만 — 예전에 같은 id의 Hyper3D 파생물이 있었던 슬롯). 없으면 빈 문자열."""
    forge = {tool: ids for tool, ids in original_parts_by_tool(original_ids).items() if tool.startswith("forge_")}
    if not forge:
        return ""
    listed = ", ".join(f"{_slot_counts_ko(ids)}({', '.join(ids)})은 tools/blender/character_kit/{tool}가" for tool, ids in forge.items())
    return f"{ORIGINAL_SUMMARY_MARKER} {listed} 이 저장소에서 절차 생성한 원본(license original)이며 Hyper3D 생성물이 아닙니다."


# ---------------------------------------------------------------- provenance


def provenance_summary_ko(derived: list[tuple[str, dict[str, Any]]], original_ids: Iterable[str] = (), preserved_summary: str | None = None) -> str:
    """`provenance.summaryKo`. Hyper3D 파생 파츠가 있으면 그 사실과 한계를 적는다. 손으로 남긴 이전 요약이 있으면 그것을 지키고 원본 파츠 기록만 새로 단다."""
    note = original_summary_note(original_ids)
    if preserved_summary:
        kept = _ORIGINAL_SUMMARY_PATTERN.sub("", preserved_summary).strip()
        return f"{kept} {note}".strip() if note else kept
    base = "Blender Foundation Human Base Meshes Bundle v1.4.1(CC0)을 가공한 파생물과 이 저장소에서 절차 생성한 원본 디자인"
    if not derived:
        return f"{base}입니다." + (f" {note}" if note else "")
    record_docs = sorted({entry["evidenceDoc"] for _, entry in derived})
    return (
        f"{base}, 그리고 Hyper3D(Rodin Gen-2.5) 생성물을 리타깃·재베이크한 파생 파츠 {len(derived)}종({', '.join(preset_id for preset_id, _ in derived)})입니다. "
        f"Hyper3D 파츠의 license 값({HYPER3D_LICENSE})은 법적 허용을 뜻하지 않습니다. 약관상 닫히지 않은 점은 {', '.join(record_docs)}에 있고 "
        "파츠별 생성 id는 provenance.sources[].generationId에 있습니다. Hyper3D 원본 GLB는 저장소에 없습니다." + (f" {note}" if note else "")
    )


HBM_SOURCE = {
    "id": "hbm-1.4.1",
    "name": "Blender Foundation Human Base Meshes Bundle",
    "version": "1.4.1",
    "url": "https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip",
    "zipSha256": "811f43accbb31a88266d932f8f5563b2d13586fca0ba2693aad1f5fe582b3515",
    "license": "CC0-1.0",
    "derivative": True,
    "changesKo": (
        "GEO-body_female_realistic 사용. 멀티레스 레벨 1 적용, 목에서 몸/머리 분할, A-포즈에서 T-포즈로 변환, 68 joint 리깅과 스킨 웨이트, "
        "UV 재전개와 텍스처 새로 제작, 체형·얼굴·표정 morph 추가, 속옷·구강 내부(치아·혀)·속눈썹·눈썹 추가, 눈 메시 재구성(공막과 홍채 분리)."
    ),
}


def provenance_block(
    contract: contract_mod.Contract,
    hyper3d: Hyper3dSources | None = None,
    registered_ids: Iterable[str] = (),
    *,
    preserved: PreservedRecords | None = None,
    registry_licenses: dict[str, str] | None = None,
) -> dict[str, Any]:
    """출처·라이선스: Human Base Meshes(CC0), 이 저장소의 절차 생성 원본(등록된 원본 파츠로 설명), 키트에 등록된 Hyper3D 파생 파츠(출처 표에 있는 것만)."""
    del contract
    registered = list(registered_ids)
    derived = hyper3d_provenance_sources(hyper3d, registered, registry_licenses)
    derived_ids = {preset_id.partition("@")[0] for preset_id, _ in derived}
    original_ids = [preset_id for preset_id in registered if preset_id not in derived_ids]
    return {
        "summaryKo": provenance_summary_ko(derived, original_ids, preserved.summary_ko if preserved else None),
        "noticeFile": KIT_NOTICE_FILE,
        "sources": [dict(HBM_SOURCE), original_source_entry(original_ids), *(entry for _, entry in derived)],
    }


# ---------------------------------------------------------------- NOTICE.md


def hyper3d_notice_section(entries: list[dict[str, Any]]) -> str:
    """`NOTICE.md`의 Hyper3D 파생 파츠 절. `kit.json`의 출처 항목에서만 만든다(없으면 빈 문자열)."""
    if not entries:
        return ""
    record_docs = ", ".join(f"`{doc}`" for doc in sorted({entry["evidenceDoc"] for entry in entries}))
    lines = [
        "## 원천 3 — Hyper3D(Rodin Gen-2.5) 생성물의 파생 파츠 (license: hyper3d-rodin-output)",
        "",
        f"- 이 파츠 {len(entries)}종은 Hyper3D(Rodin) 구독 플랜으로 생성한 결과물을 이 저장소에서 리타깃·재베이크한 **파생물**이다.",
        f"- **`{HYPER3D_LICENSE}` 값은 법적 허용을 뜻하지 않는다.** 구독 약관의 상업 이용·소유권·수정·공개 호스팅 조항과 약관상 닫히지 않은 점은",
        f"  반입 기록 {record_docs}에 있다. 이 값은 그 기록과 생성 id 없이는 반입하지 못하게 하는 장치일 뿐이다(계약 `KIT_ALLOWED_LICENSES`).",
        "- Hyper3D가 돌려준 **원본 GLB는 저장소에 없다**(커밋하지 않았다). 아래 SHA-256은 그 원본 파일의 해시이고, 결과 페이지가 계속 열리는지는 확인하지 않았다.",
        "",
    ]
    for entry in entries:
        lines += [
            f"### {entry['name'].removeprefix(HYPER3D_SOURCE_NAME + ' ')} (`{entry['id']}`)",
            "",
            f"- 생성 id: `{entry['generationId']}`",
            f"- 결과 페이지: {entry['url']}",
            f"- 등급: {entry.get('version', '미기재')}",
            f"- 원본 GLB SHA-256: `{entry['zipSha256']}`",
            f"- 가공 내용: {entry['changesKo']}",
            "",
        ]
    return "\n".join(lines) + "\n"


def split_sections(text: str) -> list[tuple[str, str]]:
    """마크다운을 (`## ` 머리줄, 본문) 조각으로 나눈다. 첫 조각의 머리줄은 빈 문자열(머리말)."""
    out: list[tuple[str, str]] = []
    for chunk in re.split(r"(?m)^(?=## )", text):
        if chunk.startswith("## "):
            head, _, body = chunk.partition("\n")
            out.append((head, body))
        elif chunk:
            out.append(("", chunk))
    return out


def preserved_exclusion_history(notice: str | None) -> tuple[list[str], list[str]]:
    """이전 NOTICE에서 지킬 것: "## 원천 3 … 제외" 역사 절(머리줄 포함 전문)과 "들어 있는 파일"의 "- 제외한 …" 줄(뒤의 공통 안내 문장은 뗀다)."""
    sections = split_sections(notice or "")
    history = [head + "\n" + body for head, body in sections if head.startswith("## 원천 3") and "제외" in head]
    files_body = next((body for head, body in sections if head.startswith("## 들어 있는 파일")), "")
    excluded = [line.split(" 아직 없는 프리셋은", 1)[0].rstrip() for line in files_body.splitlines() if line.startswith("- 제외한 ")]
    return history, excluded


_REPRO_TOOL_LINES = {
    "build_irises": "<venv>/bin/python -I tools/blender/character_kit/build_irises.py --base <female|male> ...",
    "proc_accessories": "<venv>/bin/python -I tools/blender/character_kit/build_parts.py --base <female|male> ...   # 절차 소품(proc_accessories)",
    "forge_hair": "<venv>/bin/python -I tools/blender/character_kit/forge_build_hair.py --base <female|male> --base-model <base_model_<base>.npz> --out <포지 산출물>",
    "forge_garments": "<venv>/bin/python -I tools/blender/character_kit/forge_build_garments.py ...",
    "forge_shoes": "<venv>/bin/python -I tools/blender/character_kit/forge_build_shoes.py build --base all --out <포지 산출물>",
}


def notice_text(contract: contract_mod.Contract, manifest: dict[str, Any], preserved: PreservedRecords | None = None) -> str:
    """`NOTICE.md`(사람용 출처·라이선스 요약). 기준은 `kit.json`의 provenance·bases·parts다. `preserved.notice`의 제외 역사 절은 그대로 옮긴다."""
    del contract
    sources = manifest["provenance"]["sources"]
    hbm = next(source for source in sources if source["id"] == "hbm-1.4.1")
    hyper3d_entries = [source for source in sources if source["license"] == HYPER3D_LICENSE]
    derived_ids = {entry["name"].removeprefix(HYPER3D_SOURCE_NAME + " ").partition("@")[0] for entry in hyper3d_entries}
    present = sorted(part["id"] for part in manifest["parts"] if part.get("variants"))
    original_ids = [preset_id for preset_id in present if preset_id not in derived_ids]
    grouped = original_parts_by_tool(original_ids)
    history, excluded_lines = preserved_exclusion_history(preserved.notice if preserved else None)
    order = ["CC0-1.0", "original", HYPER3D_LICENSE]
    licenses = sorted({source["license"] for source in sources}, key=lambda value: order.index(value) if value in order else len(order))

    original_lines = [
        "- 속옷·구강 내부(치아·잇몸·혀)·속눈썹·눈썹·캐치라이트의 지오메트리와 몸 쪽 텍스처(피부·눈·치아·혀·속옷·속눈썹·눈썹)는",
        "  `tools/blender/character_kit`가 절차 생성했다. 이 항목들에는 외부 이미지·스캔·사진을 쓰지 않았다.",
        *(f"- `{tool}`: {_slot_counts_ko(ids)}({', '.join(ids)}) — {ORIGINAL_TOOL_NOTES_KO.get(tool, '절차 생성')}." for tool, ids in grouped.items()),
    ]
    if hyper3d_entries:
        not_used = (
            "- 상용 제품 에셋과 라이선스가 불명확한 에셋은 이 키트에 들어 있지 않다. Hyper3D(Rodin) 생성물은 위 원천 3에 적은 파생 파츠만 들어 있다.\n"
            f"  이 키트에 쓰인 라이선스 값은 {', '.join(f'`{value}`' for value in licenses)}이다(마지막 값은 법적 허용을 뜻하지 않는다)."
        )
    elif history:
        not_used = (
            f"- 상용 제품 에셋과 라이선스가 불명확한 에셋은 이 키트에 들어 있지 않다. 이 키트에 쓰인 라이선스 값은 {', '.join(f'`{value}`' for value in licenses)}이다.\n"
            f"  `{HYPER3D_LICENSE}` 파생 파츠는 위 원천 3 기록의 경위로 제외해 현재 키트에는 없다."
        )
    else:
        not_used = (
            "- Hyper3D(Rodin) 생성물, 상용 제품 에셋, 라이선스가 불명확한 에셋은 이 키트에 들어 있지 않다. 이 키트에 쓰인 라이선스 값은\n"
            f"  {', '.join(f'`{value}`' for value in licenses)}뿐이다(계약은 `{HYPER3D_LICENSE}`도 허용하지만 이 키트에는 그 출처의 파츠가 없다)."
        )
    bases = sorted(manifest.get("bases", {}))
    variant_files = sum(len(part.get("variants", {})) for part in manifest["parts"])
    files_lines = [
        f"- 베이스: {', '.join(f'`bases/{base}.glb`' for base in bases) if bases else '없음'}",
        f"- 파츠(현재 제공 {len(present)}종, 변형 파일 {variant_files}개): {', '.join(present) if present else '없음'}",
        *excluded_lines,
        "- 아직 없는 프리셋은 `kit.json`의 `parts[].unavailable`에 한글 사유가 있다. 이 절은 생성기(`kit_provenance.notice_text`)가 `kit.json`에서 다시 센다.",
    ]
    repro = [
        "pnpm exec tsx scripts/blender/dump-kit-contract.mjs --out <contract.json>",
        "<venv>/bin/python -I tools/blender/character_kit/build_base.py --contract <contract.json> ...",
        *(_REPRO_TOOL_LINES[tool] for tool in grouped if tool in _REPRO_TOOL_LINES),
        "<venv>/bin/python -I tools/blender/character_kit/build_kit_json.py --kit-dir <키트 폴더> --meta <base_meta_female.json> --extra-meta <base_meta_male.json> --contract <contract.json> --parts-json <레지스트리>",
        "pnpm exec tsx scripts/verify-character-kit.mjs --root <키트 폴더> --base all",
    ]
    history_text = "".join(section if section.endswith("\n\n") else section.rstrip("\n") + "\n\n" for section in history)
    return f"""# ToonStudio 캐릭터 키트 v1 — 출처와 라이선스 고지

이 파일은 `tools/blender/character_kit`가 `kit.json`과 함께 만든 사람용 요약입니다. 기준은 `kit.json`의 `provenance`입니다.
생성일 {manifest["generatedAt"]}, 도구 `{manifest["generator"]["tool"]}`, Blender(bpy) {manifest["generator"]["blender"]}.

## 원천 1 — Blender Foundation Human Base Meshes Bundle v{hbm["version"]} (CC0 1.0)

- 사용한 에셋: `GEO-body_female_realistic`(몸, 저자 Dan Ulrich)와 그 눈 구(`.eye.L/.eye.R`). 번들 `human_base_meshes_bundle.blend`에서 추출했다.
- 내려받기: {hbm["url"]}
- 번들 zip SHA-256: `{hbm["zipSha256"]}` (내려받은 파일과 일치함을 확인했다)
- 라이선스: CC0 1.0. 근거 — 번들 README("All provided assets are public domain under the CC0 license"), 번들 안 에셋 메타데이터
  25개 전부 `license = CC0`, Blender 공식 데모 파일 페이지의 라이선스 표기.
- **번들 안의 불일치 1건(그대로 적는다)**: 번들의 `License` 텍스트 데이터블록에는 "The Rain Rig is released under the Creative Commons
  Attribution 4.0 license"라는 문장이 있다. 번들에는 아마추어(리그) 오브젝트가 없고(오브젝트는 메시 382개와 카메라 25개뿐) 이름에
  `rain`/`rig`가 들어간 오브젝트도 없다. 그래서 이 문장은 이 번들에 들어 있지 않은 다른 배포물의 문구가 남은 것으로 **추정**한다
  (추정이며 확인하지 못했다). 이 키트는 Rain Rig를 쓰지 않는다 — 스켈레톤은 이 저장소에서 새로 만든 68 joint다.
- 가공 내용: {hbm["changesKo"]}

## 원천 2 — ToonStudio 원본 (license: original)

{chr(10).join(original_lines)}

{hyper3d_notice_section(hyper3d_entries)}{history_text}## 쓰지 않은 것

{not_used}

## 들어 있는 파일

{chr(10).join(files_lines)}

## 재현

```text
{chr(10).join(repro)}
```
"""
