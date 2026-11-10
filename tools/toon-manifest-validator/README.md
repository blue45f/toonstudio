# ToonStudio 프로젝트 JSON 검증기 및 안전한 내보내기 Manifest 생성기 (`tools/toon-manifest-validator`)

외부 패키지 의존성 없이 순수 Node.js 내장 표준 라이브러리(`node:fs`, `node:path`, `node:crypto`, `node:test`, `node:assert`)만으로 동작하는 독립형 ToonStudio 프로젝트 JSON 검증기 및 결정론적 Export Manifest 생성기입니다.

## 1. 실제 ToonStudio 앱 스키마 대응 근거 및 안전 계약

1. **`packages/studio-project-model/src/graph/project-graph.ts` (`StudioProjectGraphV1`)**
   - `version: 1`, `projectId`, `title`, `nodes: StudioProjectNodeV1[]` (`kind`: `"series" | "season" | "episode" | "sequence" | "scene" | "panel" | "element"`), `assetUsages: StudioAssetUsageV1[]`
   - 엔티티 식별자 정규식: `STUDIO_SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u`
   - 부모 노드 참조(`parentId`) 존재 여부(`REF_NODE_PARENT_MISSING`) 및 프로젝트 ID 일치 검증(`REF_EPISODE_PROJECT_MISMATCH`)
2. **`packages/studio-project-model/src/graph/scope-ref.ts` (`StudioScopeRefV1`)**
   - `version: 1`, `projectId`, `episodeId`, `sequenceId`, `sceneId`, `panelId`, `elementId`
   - 계층 제약: `sequence`·`scene`·`panel` 범위는 반드시 상위 `episodeId`를 포함해야 함(`REF_SCOPE_HIERARCHY_INVALID`)
3. **`packages/studio-project-model/src/assets/asset-lockfile.ts` (`StudioAssetLockfileV1`)**
   - 콘텐츠 해시 포맷: `^sha256:[0-9a-f]{64}$` 및 순수 64자리 16진수 SHA-256 동시 지원
4. **`apps/web/src/domains/creator/studio-archive-manifest.ts` & `studio-publishing-package.ts` (`StudioArchiveManifest`)**
   - 안전한 상대경로 규칙: Windows 드라이브(`C:\`, `C:/`, `C:rel`, `C:`)·UNC(`\\server\share`, `//server/share`)·Win32 장치 네임스페이스(`\\?\`, `\\.\`)·선행 `/`·URI 스킴(`file:/...`, `data:...`) 차단, 역슬래시(`\`)·퍼센트 인코딩된 구분자(`%2f`, `%5c`)·콜론(NTFS ADS)·제어문자/NUL(`\0`, `%00`, `%2500`)·Windows 예약 장치명(`NUL`, `CON`, `PRN`, `AUX`, `COM1`~`9`, `LPT1`~`9`)·빈 세그먼트·`.`/`..` 세그먼트 차단
   - **OS 커널과 일치하는 홉 단위(hop-by-hop) 심볼릭 링크 경계 검증**: 절대/상대 심볼릭 링크 타깃 문자열의 `.`·`..`를 사전 문자열 정규화(`path.resolve`)로 접지 않고 세그먼트 단위로 실제 디렉터리/심볼릭 링크 여부를 `lstatSync`+`readlinkSync`로 확인하여 `${root}/escape-dir/../same.png`(중간 탈출 링크 경유) 및 `${root}/missing/../same.png`(미존재 중간 경로) 오류를 원천 차단
   - **3단계 배리어(파일 읽기 0회 보장 계약)**: `validateProject`·`generateExportManifest`·`verifyExportManifest` 모두 ① 전체 에셋의 정적 경로 검증 및 고정점 유니코드 대소문자 폴딩(`foldPathCase`: `ß`/`ẞ`/`SS`, `ᾼ`/`ᾳ` 등 멱등 일치) 충돌 검사 → ② 전체 에셋의 `fixtureDir` 경계·심볼릭 링크 `lstatSync` 검증이 **전 항목 무오류로 완료된 이후에만** ③ 물리 파일 내용(`fs.readFileSync`)을 읽어 SHA-256을 계산함(동일 경로 2개 입력 시 첫 번째 파일도 읽지 않음)
   - **결정성 및 타임스탬프 호환 계약**:
     - `createdAt` 생략(`undefined`/`null`) 시 고정 기본값 `'2026-11-10T00:00:00.000Z'`을 사용하고, 값이 주어질 때는 반드시 명시적 타임존(`Z` 또는 `±HH:MM`)을 포함한 유효한 ISO-8601 문자열만 허용함. 타임존이 없는 문자열(예: `'2026-11-10T09:00:00'`)은 실행 환경의 `TZ`(`UTC` 대 `Asia/Seoul`)에 따라 해시가 달라지는 비결정성을 유발하므로 `INVALID_PROJECT_TIMESTAMP`로 명시 거절함
     - 로케일 무관 유니코드 코드포인트 정렬(`compareStringsCodePoint`), `StudioProjectGraphV1` `assetUsages` 결정론적 정렬, 텍스트 NFC 정준화 적용
5. **`apps/web/src/domains/creator/studio-export-preflight.ts` (`STUDIO_EXPORT_TARGET_PROFILES`)**
   - 타깃별 허용 포맷 매핑

## 2. 실행 명령 (`tools/toon-manifest-validator`)

```bash
# 1. 기존 45개 + 경로 안전성·호환성·결정성 집중 회귀 19개 (총 64개) 자동 테스트 실행
/opt/homebrew/bin/node --test test/validator.test.mjs test/path-safety-determinism.test.mjs

# 2. 관계형 프로젝트 JSON 검증 및 Export Manifest 생성 (Exit Code: 0)
/opt/homebrew/bin/node ./bin/toon-validator.mjs \
  --project ./fixtures/valid-basic/project.json \
  --fixture-dir ./fixtures/valid-basic \
  --format both

# 3. 생성된 Export Manifest의 SHA-256 및 경로 무결성 재검증 (Exit Code: 0)
/opt/homebrew/bin/node ./bin/toon-validator.mjs \
  --verify-manifest ./reports/valid-manifest.json \
  --fixture-dir ./fixtures/valid-basic
```
