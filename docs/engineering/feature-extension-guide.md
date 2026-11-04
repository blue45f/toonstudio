# ToonStudio 기능 확장 실무 가이드

- 상태: **current** — 2026-11-04 소스 탐색·작업 절차. 후속 구조 개선 제안은 **target**으로 구분한다.
- 소스 대조 기준: `ac09b2353986eacd13e7e30f6f7d7469337d8dba`와 해당 기준 위의 문서 정리 변경.
- 시작: [공통 하네스](../operations/agent-harness.md) → [현재 아키텍처](../../ARCHITECTURE.md) → 수정 대상의 AGENTS. 이 가이드는 기존 정책·수치·엔진 원장을 복제하지 않고 기능을 추가할 때 연결해야 할 경계를 안내한다.

## 1. 변경 소유자부터 정한다

| 추가할 것 | 실제 위치·시작 파일 | 의존성·소유권 |
| --- | --- | --- |
| 사용자 화면·기능 | `apps/web/src/domains/<기존 도메인>/`, `apps/web/src/app/routes/` | `@/*`는 Web 소스. 앱 조립 → 도메인 → 공용 UI·플랫폼. 다른 앱 소스 직접 import 금지 |
| 관리자 기능 | `apps/admin-web/src/{app,domains,platform,shared}/` | 독립 앱·빌드. Web의 남은 admin 영역과 한 번에 합치지 않고 기능별 이관 |
| 서버 유스케이스 | `apps/api/src/modules/<기능>/`, `app.module.ts` | controller 입력 검증 → service → repository·adapter. `server/`는 레거시 전환 영역 |
| HTTP·외부 서비스·DB | `apps/api/src/platform/{http,adapters,database}/` | 요청 보안·외부 I/O·DB 연결을 UI나 순수 모델에 넣지 않음 |
| 교차 앱 DTO·schema | `packages/contracts/`, focused Studio package의 `package.json` exports | 실제 두 번째 소비자와 실행 환경 중립성이 있을 때 승격. Web/API 내부 구현을 공용 패키지로 포장하지 않음 |
| Studio 명령·문서 | `packages/studio-command-registry/src/index.ts`, `packages/studio-project-model/src/index.ts` | 메뉴·단축키·HUD의 같은 명령 ID, 직렬화 가능한 모델·journal 계약 재사용 |
| 로컬 저장·동기화 | `apps/web/src/domains/creator/studio-local-database*.ts`, `apps/desktop-sync/src/` | SQLite WASM·OPFS의 문서 내구성과 클라우드 동기화·충돌 해결을 구분 |
| 실험·추론 | `apps/character-lab/`, `apps/brush-lab/`, `services/creator-inference/` | 실험 앱·CPU 시험을 제품 승격·GPU 운영 배포로 간주하지 않음 |

[프런트 계층](../architecture/frontend-layered-architecture.md), [API 경계](../architecture/api-current-boundaries.md), [목표 모노레포](../architecture/modular-monorepo-target.md)를 현재 경로와 대조한다. `packages/domains/*`나 새로운 병렬 Studio 앱을 선제적으로 만들지 않는다. 직접 import하는 의존성은 소비 workspace에 선언한다.

## 2. 구현 전에 작성할 작은 계약

한 기능을 한 번에 검토할 수 있게 아래 항목을 PR 설명이나 기능 문서에 적는다.

1. 사용자가 시작하는 동작, 성공 결과, 취소·실패·오프라인·재시도 결과.
2. UI 임시 상태, 저장 문서, 서버 상태의 소유자와 전환 시점. 무엇이 복원·동기화되는지.
3. 입력·출력 schema와 기존 클라이언트·저장 문서 호환성. 기본값·알 수 없는 버전·누락 필드 처리.
4. 인증된 주체, 읽기·쓰기·공유·관리 권한, 서버에서 확인하는 범위. UI의 버튼 숨김이나 presence는 권한 증거가 아님.
5. 취득하는 자원과 해제 주체: Worker·GPU·이미지·object URL·구독·소켓·요청·타이머.
6. 변경할 파일·영향받는 계약·실패를 재현하는 시험·필수 검증 명령·릴리스와 복구 순서.

신규 모듈은 순수 계산·검증, 상태 훅, 표시 UI, 지연 로더로 책임을 나눈다. 자세한 추출·순환 참조·번들 패턴은 [기존 구조 가이드](code-structure-and-bundle-patterns.md)를 참조한다. 그 문서의 날짜가 있는 수치를 현재 측정값으로 복사하지 않는다.

## 3. Studio 상태와 저장을 확장한다

[현재 Studio 경계](../architecture/studio-current-boundaries.md)와 [제스처 계약](../architecture/studio-live-canvas-gesture.md)이 시작점이다.

- hover·드래그·렌더 preview는 임시 상태다. 사용자 확정 경계에서 문서 명령을 한 번 커밋하고 history·autosave·CRDT에 일관되게 연결한다. 렌더러 객체를 직접 바꾼 결과를 저장 성공으로 취급하지 않는다.
- `studio-local-database-runtime.ts`, `studio-local-database-worker-client.ts`, `studio-local-database-worker-protocol.ts`를 따라 런타임·Worker·저장 프로토콜을 함께 확인한다. OPFS 저장, 서버 저장 확인, Desktop Sync 완료는 서로 다른 결과다.
- 저장 구조가 달라지면 구 문서 읽기·새 문서 저장·재열기·Undo/Redo·실패 후 복구를 시험한다. 기본값 없이 기존 필드를 바꾸거나 예전 문서를 조용히 초기화하지 않는다.
- 가져오기·내보내기는 `packages/studio-format-gateway/src/`와 `compatibility-report` export를 확인한다. 지원하지 않는 속성은 사용자에게 손실·호환성 결과로 알리고 성공 결과로 숨기지 않는다.

예제 회귀 경로: `live/studio-pages-history-command-journal.test.ts`, `live/studio-pages-history-sqlite-recovery.test.ts`, `studio-local-database-runtime.test.ts`(모두 Web creator 영역).

## 4. 테마와 3D는 다른 상태를 가진다

### UI 테마와 가상 공간 테마

UI 색상은 `apps/web/src/shared/lib/theme.ts`·`theme-presets.ts`와 [디자인 테마 계약](../design-themes.md)을 따른다. `data-theme` 밝기와 `data-design-theme` 팔레트, 사이트·Studio 설정 범위를 유지한다. 원고 색상·내보내기 데이터를 UI 테마와 함께 바꾸지 않는다.

가상 공간의 그림은 `virtual-space/studio-virtual-space-theme-artwork.ts`, 선택 UI는 `StudioVirtualSpaceThemePicker.tsx`, 2D 배경 소비자는 `office2d/office2d-backdrop-art.ts`다. 새 테마는 기존 키·설정 호환성과 선택 카드·실제 공간의 자산 일치를 함께 검사한다. 배경 한 장 추가가 NPC·가구·충돌·음향·독립 월드 전체 구현을 의미하지 않는다. 원본·라이선스·정적 자산 또는 R2 전달 경로를 기록한다.

### 3D 문서·실행 자원

렌더러의 역할은 `packages/studio-engine-registry/src/renderer-roles.ts`와 [생성 문서](../engines/renderer-roles.md)가 정본이다. Three.js·three-vrm 기본 장면과 Babylon 전문 capture pass를 임의로 뒤바꾸지 않는다.

- 직렬화 가능한 3D 모델은 `packages/studio-project-model/src/ir/scene-3d-v3.ts`와 앱의 문서 변환·명령 경로를 확인한다. 렌더 객체·GPU 포인터·캐시 핸들은 저장하지 않는다.
- 무거운 기능은 기존 loader 경계에서 사용자 의도 시점에 로드한다. 타입 import 때문에 구현까지 정적 의존성으로 끌어들이지 않는다. 드로잉 입력 핫패스를 번들 크기만으로 지연시키지 않는다.
- 공유 GPU는 `creator/render/studio-gpu-fabric.ts`의 lease를 사용한다. lease 반환은 공유 디바이스 파괴와 다르다. `device.lost`·명시적 종료·획득 도중 취소를 구분한다.
- Scene3D는 `scene3d/studio-scene3d-resource-owner.ts`·`studio-scene3d-resource-pool.ts`의 owner·예산·멱등 해제를 재사용한다. 실패한 자원은 재사용하지 않고 GPU 작업이 끝난 뒤 반환한다. `bg3d/studio-bg3d-model-cache-residency.ts`의 캐시 수명도 함께 확인한다.
- 파일 업로드·GLB/VRM·texture는 크기·형식·외부 참조·권리와 소유권을 검증한다. 공유 자산은 마지막 소비자 이전에 dispose하지 않는다. unmount·문서 교체·재열기·취소·실패 경로에서 Worker·구독·object URL도 회수한다.

권리·품질·공개 기준은 [3D 에셋 거버넌스](../architecture/studio-3d-asset-governance-v1.md)를 따른다. owner/pool의 기존 `*.test.ts`는 수명 확장의 출발점이며 실제 GPU 품질 검증을 대신하지 않는다.

## 5. 실시간 협업·권한·DB 경계

- Web의 `creator/live/`와 API `modules/creator/studio-live-gateway-*.ts`, `studio-crdt.service.ts`·`studio-crdt.repository.ts`를 함께 읽는다. 문서 편집·presence·음성·화면 공유는 권한과 수명이 다르다.
- 영속 프로젝트·작업실 계약은 API `modules/studio-project-graph/`와 `packages/studio-project-model/src/graph/`를 확인한다. 세션 주체·프로젝트 ACL·방 입장 권한을 서버에서 검증하고 클라이언트 헤더나 DTO의 owner ID를 신뢰하지 않는다.
- 로컬 반영, 송신 성공, 서버 영속 ACK, 상대 재생을 따로 관측한다. 재연결·중복·역순·권한 회수·방 변경·삭제 이후 늦게 도착한 응답을 시험한다. 음성은 사용자 동의·장치 해제·권한 거부를 포함한다.
- Cloudflare Durable Objects의 방 조정 상태와 API/PostgreSQL의 문서·CRDT 저장 권위를 구분한다. DO도 ACL·nonce·receipt·presence 등을 SQLite에 영속 저장한다([조정자 계약](../../deploy/cloudflare-realtime/README.md)). P2P signaling 교환 성공도 ICE·원격 미디어 성공을 증명하지 않는다.
- DB schema·migration은 `apps/api/src/platform/database/`, 적용 순서는 `scripts/production-database-migrations.manifest`가 소유한다. controller·시작 명령에서 DDL을 실행하지 않는다. schema·DTO·event·저장 모델을 별개로 검토한다.
- 호환 확장은 구 runtime에서도 동작하는 추가형 변경부터 적용하고, 필드 삭제·이름 변경·제약 강화는 별도 contract 단계로 분리한다. 기존 migration의 체크섬을 바꾸지 않는다. 현재 onpod의 단일 역할·TLS 예외와 공식 migration workflow의 차이는 [인프라 지도](../operations/infrastructure-map.md) 7·8절을 먼저 확인한다.

## 6. 작은 기능 하나를 납품하는 순서

1. 관련 모듈·상태·권한·문서·테스트를 검색하고 위 계약을 정한다. 기존 동작의 실패를 재현한다.
2. 순수 모델·schema·명령을 먼저 추가한 뒤 UI와 API를 얇게 연결한다. 임의 공용 계층을 만들기 전에 소비자를 확인한다.
3. 성공·잘못된 입력·권한 없음·저장 실패·취소·복구 시험을 추가한다. 클라이언트/서버 또는 탭/사용자 둘이 필요한 의미는 실제 경계 시험으로 확인한다.
4. 문서·기계 원장·번역·권리·환경변수 예제·캐시 버전을 실제 영향 범위만 갱신한다. 비밀값 대신 이름·저장 위치를 기록한다.
5. 아래 검증을 수행하고 실패는 원인과 함께 남긴다. PR 생성·병합·배포를 구분한다.

실행 위치는 저장소 루트다. `package.json`의 명령을 먼저 확인하고 관련 범위의 검사를 선택한다.

```sh
pnpm harness:doctor
pnpm harness:verify
pnpm validate:architecture
pnpm validate:documentation
pnpm typecheck
# 아래는 예제: 변경한 계약의 기존 시험 경로를 골라 실행한다.
pnpm exec vitest run apps/web/src/shared/lib/theme.test.ts apps/web/src/shared/lib/theme-presets.test.ts
pnpm exec vitest run apps/web/src/domains/creator/scene3d/studio-scene3d-resource-owner.test.ts apps/web/src/domains/creator/scene3d/studio-scene3d-resource-pool.test.ts
```

| 영향 | 추가 검증·증거 |
| --- | --- |
| 문서·예제·정책 | `pnpm harness:check`, 변경 파일 Secretlint, 문서 검사 |
| UI·테마 | 관련 Vitest, 실제 브라우저의 키보드·focus·모바일·밝기/대비. UI 테마는 `node scripts/verify-design-themes.mjs`의 로컬 서버 전제 확인 |
| Studio 문서·3D | 저장·재열기·Undo/Redo·내보내기와 실제 렌더 비교. 영향에 따라 `pnpm verify:studio-lifecycle`, `pnpm verify:studio-renderer-roles`, `pnpm verify:studio-scene3d-capture-resources` |
| 인증·API·DB | 입력·비인가·권한 회수·repository 오류 시험. `pnpm local:test:check`로 로컬 의존성을 확인하고 `pnpm test:postgres:integration`의 환경 전제를 충족한 뒤 실행 |
| 실시간 | 두 클라이언트·재접속·중복·ACK·서버 영속성. Cloudflare 변경은 `pnpm test:cloudflare-realtime` |
| 번들·CSP·자산 | `pnpm check:studio-eager-graph`, 실제 빌드 후 `pnpm check:studio-bundle`, `pnpm verify:csp`. 에셋 ID·권리·소스/결과·캐시 재사용과 폐기 확인 |

이 목록은 새 명령을 모두 실행했다는 보고가 아니다. 부분 타입 진단·CPU 시험·로컬 미디어 시험을 전체 타입 검사·GPU 검증·원격 협업 성공으로 보고하지 않는다. 로컬 파일 수·전역 타입·compilerOptions를 줄인 타입 검사로 정식 gate를 대신하지 않는다.

## 7. 배포·용량 신호를 해석한다

현재 배포 기록은 [인프라 지도](../operations/infrastructure-map.md), 승인·SHA·롤백은 [DEPLOY.md](../../DEPLOY.md)가 정본이다. 기록상 Core API·DB는 onpod 서울, 웹·gateway·R2·실시간·분석은 Cloudflare다. 2026-10-29 공급자 조회를 2026-11-04 실시간 상태로 확대하지 않는다. GPU 공급자는 미확인이다.

사용자 전달 알림은 **지난 24시간 중 21분 동안 onpod 동시 처리 한도 도달**이다. 이 가이드에서는 공급자 원문·분모 정의·요청 로그를 재조회하지 않았다. 이를 오류 시간 21분, 장애율, 실제 사용자 피해, OOM, GPU 부족이나 유료 승급 필요로 해석할 근거는 없다. 이 클라우드 타입 검사의 메모리 OOM과도 별개다.

영향 확인은 알림의 정확한 시간대·한도 정의와 같은 시간의 요청량·동시 처리·응답 코드·지연·콜드 스타트·API readiness·DB 풀 상태를 대조한다. 엣지 liveness 200만으로 API·DB 정상성을 단정하지 않는다. 재시도 증폭·장기 요청·중복 polling 여부를 먼저 구분하고, 실제 오류와 원인이 확인된 기능만 수정한다. 조사를 위해 무한 polling·인증 완화·무조건 성공 응답·유료 플랜 전환을 추가하지 않는다.

## 8. 별도 범위의 작은 구조 개선 후보

아래는 **target 제안**이며 이 문서 변경에서 구현하지 않았다. 기존 기능·보호 계약을 유지하는 작은 PR로 각각 검증한다.

| 근거 | 다음 작은 변경 | 완료 증거 |
| --- | --- | --- |
| `StudioCuttoonEditorHost.tsx`가 기존 크기 래칫의 대형 파일이고 runtime 훅 경계가 존재 | 상태·포인터 핫패스가 아닌 순수 정책 하나만 기존 runtime/순수 모듈로 추출. 이동과 동작 변경을 분리 | 관련 회귀 동일, 순환 참조·정적 도달 증가 없음, 실제 감소분만 기준선 하향 |
| 가상 공간 테마 그림이 공통 원장을 통해 선택기·2D 소비자에 연결됨 | 새 테마를 추가할 때만 소비자 누락·키 일치 계약을 보강. 기존 main의 원장 도입을 다시 구현하지 않음 | 새 키의 선택 카드·월드 이미지 일치, 이전 저장 키 유지, 소스 자산 존재 |
| Scene3D owner·pool·GPU lease가 이미 분리됨 | 새 capture 기능 하나를 기존 owner·pool에 연결하고 취소·device loss·재사용 회귀 추가 | 해제 멱등성, 공유 디바이스 유지, 실패 자원 폐기, 실제 renderer 종료 시 자원 회수 |

전면 디렉터리 이동, 전체 renderer 교체, 새 전역 store, 전 도메인 공용 패키지 신설은 이 후보의 범위가 아니다. 기존 문서에서 같은 사실을 재서술하기보다 이 진입 안내와 각 계약의 정본 링크를 갱신한다.
