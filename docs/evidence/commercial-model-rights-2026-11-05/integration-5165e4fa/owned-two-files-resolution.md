# 두 법률 문서 충돌 해소 초안 — main 5165e4fa 통합

- feature: `abd691ee218a49a92b6ef170c152fa7415d23cf0`
- 공통 base: `63dcf937ca8658fbae52396595416daa1a796043`
- 통합할 main: `5165e4faf796cebe255460ab38d1c13fde8972c4`
- 원래 가상 merge tree: `48f46a795c052d8ecefee1ae46d7134d55555313`
- 목적은 main을 feature로 통합할 검토용 초안이며 main 병합·게시·배포를 수행한 것이 아니다. 저장소 소스·HEAD·index·worktree를 쓰지 않았다.

## 충돌 선택

- `engineering-atlas-open-data-oss.ts` 구간 1: main의 외부 Mixbox 제거·자체 안료 전환·실행 프로필/산출물 검사 분리를 그대로 보존하고, feature의 자체 JavaScript Lanczos3 전환·내장 고지 수집 수정과 배포 의무 구분을 결합했다. 117/22/95는 과거 스냅샷 검토로 명시했다.
- `engineering-atlas-open-data-oss.ts` 구간 2: main의 Mixbox 제거 변경과 실제 운영 배포 여부의 구분을 그대로 보존한다. feature의 Remotion 4.0.536 개인 무료 상업 사용 전제·조직 전체 인원 미검증·수정된 내장 고지 설명도 보존한다.
- `engineering-seminar-prep-content.ts` 구간 1: main의 외부 Mixbox 제거·자체 잠재 안료 및 새 혼색 결과 동일성 미확인을 그대로 보존한다. feature의 Remotion 개인 무료 자격·전체 인원 미검증, 과거 wasm-vips와 현재 자체 JavaScript Lanczos3, 내장 고지 수정, Hokusai 조건을 결합한다.

## 충돌 밖 실제 내용 정정

- 두 외부 의존성 제거를 결합하면 2026-10-07의 기존 117개 스냅샷 잔존 기록은 115개다. atlas의 자동 통합 116개 설명과 fact를 115개로 맞추고 정본 source를 정적 인벤토리로 지정했다.
- 117/22/95 고지 포함·누락 수치는 기존 검토 기록임을 날짜로 명시했다. 현재 수기 고지 또는 현재 전체 설치 집합을 새로 집계한 수치로 쓰지 않는다.
- 범위 밖 `engineering-license-inventory.ts`의 자동 통합 header는 아직 Mixbox만 제외한 116개라 적고 별도 줄에서 wasm-vips 제거를 적는다. 부모에게 최종 115개 설명으로 정리할 필요를 전달했다. 이 초안에서 그 파일은 수정하지 않았다.
- main의 Mixbox 제거·자체 안료·새 혼색 결과 동등성 미확인·실행 프로필과 산출물 검사 분리·실제 운영 반영 상태의 구분을 보존했다. 외부 Mixbox 의존성/예외/예제 호출을 복원하지 않았다.
- Remotion의 설명된 개인 무료 상업 사용 전제와 실제 전체 인원 미검증, 자체 JavaScript Lanczos3와 과거 LGPL, 고지 수집 수정과 배포 의무의 구분을 유지했다. 다른 문단의 LT/worker/math 관련 자동 통합 내용을 손대지 않았다.

## 검토용 해결본 및 SHA-256

- `/tmp/toonstudio-license-conflict-resolution-5165/apps/web/src/domains/legal/technology/engineering-atlas-open-data-oss.ts`
  - `7548209a7c029436e3b3b97e9fcb32ef3b482144f79397faf9c32b15426dcc56`
- `/tmp/toonstudio-license-conflict-resolution-5165/apps/web/src/domains/legal/technology/engineering-seminar-prep-content.ts`
  - `f91bfef9714e4e84bd43a6d895541e1259c44d0c9d68dee0d3c937ef06407b40`

## 차이·근거

- `owned-two-files-vs-ours.patch`: 현재 feature 대비 두 해결본 diff.
- `owned-two-files-vs-theirs.patch`: 새 main 대비 두 해결본 diff.
- `owned-two-files-vs-virtual.patch`: 원래 conflict marker가 포함된 가상 tree 대비 diff.
- `owned-two-files-inputs.json` 및 `inputs/`: base/feature/main/virtual 고정 입력과 hash.
- `owned-two-files-resolution.json`: 원문·채택 문장·추가 정정·결과 hash와 보존 확인.

## 확인 범위

- 두 초안의 충돌 표시 제거와 main의 지정 문구 보존을 텍스트로 대조했다.
- 현재 작업 트리의 두 소스가 feature 입력과 바이트 동일하고, HEAD가 여전히 abd691ee이며 index/worktree가 깨끗함을 읽기 전용으로 확인했다.
- 테스트·TypeScript Program·lint·빌드·branch 변경·source 적용은 실행하지 않았다. 부모가 초안을 적용한 뒤 새 base에서 검증해야 한다.
