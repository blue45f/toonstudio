# 같은 6컷 원고의 저장·협업 검증 fixture

- 상태: **current — 2026-11-05 실제 UI 제작 원고의 고정 입력**
- 작품: `우산을 돌려주는 날`. 각 페이지가 한 컷인 단순 기능 검증 원고다.
- `short-comic-six-pages.json`은 원본 내보내기의 `payload.data`를 보존한다.
- `short-comic-cut-01.png`부터 `06.png`까지는 같은 원고에서 내보낸 1440×1440 PNG를
  편집·리사이즈 없이 복사한 픽셀 기준이다.

원본 envelope SHA-256은
`1fba0729a8bf1cb69b5a2c09505fa298c5a427ad7647270c59cdc475b31f633c`,
원본 `.toonproject.zip` SHA-256은
`baaded64ba05b8c5fa095c8a5349b9a77c352b7869892aa2c144f9749c848305`다.
전체 `pagesList`의 JSON SHA-256은
`e06fa6d22e86f9a6755832ed19df57fb918997d557da27ab30c7ab900bb37e10`이다.
페이지·요소 ID, 57개 요소의 입력 채널, 배경, 텍스트, 순서를 바꾸지 않는다.

원본에는 과거 Undo journal이 포함되지 않고 `aiProvenance.operations`도 빈 배열이다.
테스트는 없는 이력이나 AI 사용 기록을 추가하지 않는다. 새 포인터 한 개의 Undo/Redo/Undo와
서버 revision·검수본·공정 인계를 별도로 검사한다. 권리·등급·정책의 사람 확인은 미확인 상태를
그대로 유지한다.

## 검증 범위와 재실행

순수 fixture 검증은 외부 서비스와 DB 접속 없이 실행한다. 명시적인 loopback 미접속 주소를
지정해 공통 Vitest 설정이 운영자 dotenv를 읽지 않게 한다.

```sh
TEST_DATABASE_URL=postgresql://fixture@127.0.0.1:1/toonstudio_fixture_only \
node node_modules/vitest/vitest.mjs run \
  tests/integration/api-web/studio-six-page-lifecycle.integration.test.ts \
  -t '원본 페이지' --maxWorkers 1
```

실제 통합 검증에는 기존 [로컬 하네스 절차](../../../scripts/local-fullstack/README.md)에 따라
준비한 임시 loopback PostgreSQL과 분리된 migration/runtime 계정이 필요하다. 운영 DB나 실제
사용자 원고를 입력하지 않는다. API 하네스가 4111 포트를 직접 사용하므로 별도 API 프로세스는
띄우지 않는다. 별도 터미널의 Vite는 HTTP와 Socket 프록시를 모두 명시한다.

```sh
NEST_API_URL=http://127.0.0.1:4111 \
VITE_STUDIO_LIVE_DEV_PROXY_ENABLED=true \
node node_modules/vite/bin/vite.js --config apps/web/vite.config.ts \
  --host 127.0.0.1 --port 5511 --strictPort
```

테스트 실행기는 0600 로컬 env 파일에서 값을 읽어 다음 환경 변수에만 전달한다. URL·비밀번호를
명령 인자나 실행 로그에 출력하지 않는다. 구체적인 안전한 실행 예제는
[기존 실제 Canvas 재현 절차](../../../docs/reports/role-pipeline-rbac-canvas-regression-2026-11-05.md)의
env reader 실행기를 재사용하고 테스트 경로만 이 통합 테스트로 바꾼다.

| 환경 변수 | 경계 |
| --- | --- |
| `TEST_DATABASE_URL`, `STUDIO_LIVE_POSTGRES_INTEGRATION_URL` | 준비된 로컬 migration/fixture 정리 계정 |
| `TOONSTUDIO_RBAC_RUNTIME_DATABASE_URL` | 같은 임시 DB의 비소유자·비특권 runtime 계정 |
| `TOONSTUDIO_RBAC_BROWSER_ORIGIN` | 위 Vite의 명시 loopback origin |
| `API_LOCAL_ENV_FILE_ENABLED` | `false`; 기존 operator dotenv를 읽지 않음 |
| `TOONSTUDIO_SIX_PAGE_EVIDENCE_DIR` | `.qa` 하위 전용 폴더; 생략 시 기본 ignored 경로 사용 |

테스트는 공개 API로 새 서버 작품 ID를 발급받고 원본 6페이지 데이터를 등록한다. 원본 로컬
프로젝트와 서버 작품의 ID가 같다는 주장이 아니다. 최초 CRDT 상태도 실제 Web serializer로
페이지·요소별 증분을 만들고 기존 update byte budget 안에서 등록한다.

외부 메일은 시험 outbox, private object storage는 기존 하네스의 메모리 port를 사용한다.
검수 PNG는 2×1 대체 이미지가 아니라 실제 UI의 ‘저장된 원고로 검수본 만들기’가 생성·업로드한
6페이지다. 저장소 port의 readonly accessor는 그 실제 업로드 바이트를 반환한다. 현재 후보와
같은 브라우저에서 협업 전 실제 UI로 내보낸 6PNG를 별도 기준으로 저장하고, 검수·재로그인 뒤
캔버스 내보내기·기술 ZIP의 각 회차 이미지는 이 현재 기준과 허용 오차 없이 RGBA를 비교한다.

과거 `8d315c85d6fde4a3a30255612c756d3e299a95b0` 시점의 위 corpus PNG는 덮어쓰지 않는다.
최신 main을 반영한 후보와의 교차 버전 차이는 별도 관찰로 기록한다. 초기 비교에서 첫 컷은
5,955픽셀(0.28718%, 최대 채널 차이 48)이 달랐으므로 교차 버전 픽셀 동일을 주장하지 않는다.
현재 후보 안의 저장·검수·재로그인·ZIP 비교에 임의 허용 오차를 추가하는 근거로 쓰지 않는다.

정식 게시 패키지는 사람 확인이 없어 차단돼야 한다. 별도 `technical-review-draft.zip`은 같은
실제 PNG를 기존 renderer와 ZIP 생성기로 처리하는 기술 검증 산출물이며, 공개 허가나 사람의
검수 완료를 뜻하지 않는다. 이 구분은 `validation-report.json`과 실행 proof에도 기록한다.

실제 계정 password·session secret·raw 실패 진단은 ignored `.qa` 안에만 생성한다. 실행 결과를
공개 증거로 옮길 때 `accounts.json`, `server.env`, raw 로그와 디렉터리를 통째로 복사하지 않는다.
테스트 종료 시 신규 시험 user/work를 정리하고 기존 행 digest를 확인한다. 공유 blob 메타데이터는
임의 삭제하지 않고 잔존 개수를 기록하며 임시 cluster 종료는 실행자가 담당한다.
