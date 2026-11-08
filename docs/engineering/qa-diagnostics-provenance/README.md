# 선택형 Studio QA 진단과 원본 보존

- 상태: **current**(공통 helper), **legacy exception**(재구성용 patch)
- 기록일: 2026-11-08

## 현재 기능

저장소 루트에서 기존 의존성과 Playwright Chromium을 사용한다. 기본값은 진단 비활성이다.
`TOONSTUDIO_QA_DIAGNOSTICS=1`을 기존 character/groups 검증 명령 앞에 붙일 때만 수집한다.

- Character: 기존 `character-shaper-evidence.json`의 `layoutDiagnostics`에 canvas의 실제·CSS 크기,
  top, dock 높이, 상태 영역의 변경 횟수를 저장한다. 상태 문자열은 읽거나 저장하지 않는다.
- Groups: 기존 scratch 디렉터리의 `diagnostic-events.json`에 파일 개수, 최대 16개의 크기와
  고정 MIME 분류만 저장한다. 파일명, accept, 본문, 쿠키, 오류 원문, URL은 수집하지 않는다.
- 연속 중복을 제거하고 layout 200개/input 64개, 페이지 4개로 제한한다. 최장 수집 시간은
  문서당 120초이며 종료·pagehide·상한 도달 시 timer/listener/observer를 정리한다.
- 문서 이동 시 새 문서부터 수집한다. 앞선 문서의 기록을 누적하지 않는다.
- 수집은 페이지당 1.5초 후 중단해서 원래 실패를 가리지 않는다. renderer가 멈춘 경우
  브라우저 context 종료가 남은 자원을 해제한다. 설치·수집 실패는 고정 상태만 남긴다.
- 새 trace, body text, screenshot을 만들지 않는다. 기존 canonical 검증기의 별도 이미지·evidence
  정책은 그대로이므로 기존 산출물 전체가 익명화되었다는 뜻은 아니다. 산출물은 Git에 넣지 않는다.

실행 검증:

```sh
pnpm exec vitest run scripts/lib/studio-qa-diagnostics.test.mjs
node --import tsx scripts/verify-studio-qa-diagnostics.browser-check.mjs
pnpm harness:verify
node scripts/check-source-file-size.mjs
```

브라우저 검증은 외부 서버나 실제 사용자 자료 없이 합성 data URL과 파일로 실패 경로를 재현한다.
임시 출력은 검증 후 제거한다. 기존 앱 전체 UI 검증의 대체물이 아니다.

## 고유 내용의 대응

| 원본 추가분 | 현재 처리 |
| --- | --- |
| Character 100ms layout 관측 | 공통 observer의 수치 샘플과 엄격한 상한·정리로 통합 |
| Character status text | 문자열 저장을 없애고 상태 영역 변경 횟수로 대체 |
| Groups file change | 파일명·임의 MIME·accept를 제외한 제한된 메타데이터로 통합 |
| Groups 전체 trace·body·최종 screenshot | 민감 자료 노출 및 중복 때문에 추가하지 않음 |
| finally의 실패 evidence | 제한 시간과 수집/저장 오류 처리를 거쳐 기존 검증 실패를 보존 |

## 원본 재구성

`manifest.json`은 원본의 base SHA, canonical 경로, 원본 바이트 수/SHA256, patch SHA256,
로컬 비실행 보존 이름을 기록한다. 두 patch는 그 base의 canonical 파일에 적용하면 원본의
모든 바이트를 재구성하는 보존 자료다. 현재 기능으로 실행하거나 import하지 않는다.

예를 들어 임시 디렉터리에 base 파일 하나를 만들고 patch를 적용한다. 저장소 파일을 덮지 않는다.

```sh
TEMP_DIR=$(mktemp -d)
git show d823079b2f3d9daa0fc5c241e09d64f533ee8ea0:scripts/verify-studio-groups.mts > "$TEMP_DIR/groups.mts"
patch "$TEMP_DIR/groups.mts" docs/engineering/qa-diagnostics-provenance/groups.patch
shasum -a 256 "$TEMP_DIR/groups.mts"
```

결과 해시와 크기는 manifest의 originalSha256/originalBytes와 같아야 한다. 원본 거대 복제본은
활성 소스가 아니다. 로컬 `.mts.original` 보존 파일과 별도 원본 보존 자료는 이 PR에 포함하지 않는다.
source-size 상한·기준선·검사 범위를 변경하지 않았다. 그룹 context 생성/종료만 공통 helper로 옮겨
canonical의 설정을 유지하면서 중복과 크기를 줄였다.
