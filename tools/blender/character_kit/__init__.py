"""ToonStudio 캐릭터 키트 빌더 (Blender `bpy` + numpy).

계약 정본은 `apps/character-lab/docs/authored-kit-spec.md`이고 검증기는 `scripts/verify-character-kit.mjs`다.
상수(joint 68개, morph 64개, 예산 등)는 이 패키지에 복제하지 않고 `scripts/blender/dump-kit-contract.mts`가
덤프한 `contract.json`을 읽는다.

실행 환경: Python 3.13 + `bpy==5.2.2` + `numpy` + `pillow` (README 참조). 저장소 `tools/blender`를 `sys.path`에 올려
`import character_kit`으로 쓴다.
"""

__all__ = []
