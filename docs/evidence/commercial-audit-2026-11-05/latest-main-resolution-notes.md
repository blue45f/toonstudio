# 최신 main 법률 문서 충돌 해소 미리보기

- 기준 HEAD: `8d315c85d6fde4a3a30255612c756d3e299a95b0`
- 원격 main: `2c626df4000fcfc32318faa793a61bea3ef0901b`
- `/tmp/toonstudio-main-resolution` 출력만 작성. 작업 트리·index·ref 변경, commit·merge·push·배포 없음.

## 산출물

- `automatic/`: 깨끗한 자동 병합 3개 + diff3 충돌 미리보기 3개(총 6개).
- `resolved/`: 전체 6개 충돌 해소 미리보기.
- `base/`, `working/`, `upstream/`: 원본 입력 스냅샷.
- `resolution-manifest.json`: 해시·정확한 충돌 구간 원문과 채택 내용·보존 검증.
- `resolved-six-files-against-main.patch`: 최신 main 기준 이 6개 파일 대상 검토용 부분 패치.

## 충돌별 선택

- `engineering-atlas-open-data-oss.ts` 충돌 1 (자동 미리보기 줄 688): 한국어 FAQ에 원격에 남은 57개 대신 현재 설정과 일치하는 61개를 유지. 영어 61개도 유지.
- `engineering-library-guide-areas-b-build.ts` 충돌 1 (자동 미리보기 줄 46): 원격 대표 포크 2개 표현 + 현재 작업의 2026-11-05 THIRD-PARTY-NOTICES.md 수집 수정 설명을 결합. 61개 유지.
- `engineering-library-guide-areas-b-build.ts` 충돌 2 (자동 미리보기 줄 75): 양쪽 61개 정정을 유지하고 현재 자체 Lanczos3 런타임 설명을 채택. 과거 wasm-vips 현재형 설명을 재도입하지 않음.
- `engineering-map-open-source-rows-more.ts` 충돌 1 (자동 미리보기 줄 225): 원격의 보안 권고 대응·도구 버전 통일·저장소 보안 대체본 지정 설명 채택. 비충돌 openskp 패치·minimatch 보안 백포트 경로도 보존.

## 자동 병합 보존

- platform safety: 양쪽 동일한 override 61개 정정 보존.
- areas-b test: 원격 대표 포크 경로·실제 상수 검증(MAX_DEPTH 100, toon-fabric)과 현재 Lanczos3·과거 vips 측정 구분 검증 모두 보존.
- seminar prep: 원격 기본 LT/6패스 설명과 현재 자체 Lanczos3·고지 수집 수정 설명 모두 보존.
- map rows: 원격 openskp 출력 보존 패치, minimatch 3/10 보안 백포트 근거 경로 및 현재 자체 Lanczos3 행을 보존.
- 모든 현재 Mixbox 포함 줄이 해결본과 정확히 동일. 원격은 해당 줄을 변경하지 않았음. 기존 혼합 문장 내 Mixbox 절도 기준·원격·현재·해결본 간 정확히 보존.
- 비충돌 모델 권리/UI 인벤토리 수정은 작업 트리에 그대로 있으며 이 미리보기 범위 밖.

## 검증 및 한계

- 원본 6개 현재 파일 SHA-256과 HEAD/origin/main ref가 생성 전후 동일.
- 해결본 6개에 충돌 표시 없음.
- 전체 테스트·빌드는 요청대로 실행하지 않음. 미리보기 TypeScript 문법과 부분 패치 적용성은 validation-results.json 참조.

## 해결본 경로

- `/tmp/toonstudio-main-resolution/resolved/apps/web/src/domains/legal/technology/engineering-atlas-open-data-oss.ts`
- `/tmp/toonstudio-main-resolution/resolved/apps/web/src/domains/legal/technology/engineering-atlas-platform-ops-safety.ts`
- `/tmp/toonstudio-main-resolution/resolved/apps/web/src/domains/legal/technology/engineering-library-guide-areas-b-build.ts`
- `/tmp/toonstudio-main-resolution/resolved/apps/web/src/domains/legal/technology/engineering-library-guide-areas-b.test.ts`
- `/tmp/toonstudio-main-resolution/resolved/apps/web/src/domains/legal/technology/engineering-map-open-source-rows-more.ts`
- `/tmp/toonstudio-main-resolution/resolved/apps/web/src/domains/legal/technology/engineering-seminar-prep-content.ts`
