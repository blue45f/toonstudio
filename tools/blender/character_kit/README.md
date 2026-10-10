# 캐릭터 키트 빌더 (character_kit)

상태: **작업 중 (2026-10-10)**. 이 문서는 구현이 늘 때마다 갱신한다. 계약은 `apps/character-lab/docs/authored-kit-spec.md`가 정본이다.

기존 `tools/blender/toonstudio_blender_kit`(헤어·얼굴 shape key·품질 보고서용 Blender 확장)과는 별개이며, 이 패키지는
**모듈식 키트 에셋**(베이스 바디 GLB + 파츠 GLB + `kit.json`)을 만든다.
