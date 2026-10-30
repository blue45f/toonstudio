# 웹툰 분업·협업 REA 비교와 품질 기준

- 조사 기준일: **2026-10-28**
- 상태: **current** — 공개 배포물·공식 문서 관찰 결과. ToonStudio 변경 사항은 검증 중인 **migration**, 경쟁력 판정 조건은 **target**으로 구분한다.
- 목적: 크레코를 포함한 전문 제작 도구에서 분업·인계·검수의 계약을 추출하고, ToonStudio 구현의 합격 조건으로 연결한다.

## 1. 조사 범위와 사실의 강도

크레코의 공개 웹사이트와 로그인 화면을 REA로 실행 관찰하고, 로그인 전 브라우저가 받는 공개 JavaScript를 REA로 보존·추출했다. Kitsu, Magma, Frame.io 공식 페이지도 REA 브라우저 시나리오로 확인했다. CSP Teamwork는 공식 매뉴얼을 확인했고, 여러 도구를 연속 탐색한 REA 시나리오의 부분 관찰에도 포함됐다.

다음 세 종류를 혼동하지 않는다.

| 구분 | 이 조사에서 얻은 근거 | 입증하지 못하는 내용 |
| --- | --- | --- |
| 런타임 관찰 | 공개 페이지 DOM·접근성 트리, 실제 로그인 경계, 공개 JS 응답 바이트 | 로그인 뒤 작업 생성·협업·권한 거부의 실제 성공 여부 |
| 정적 관찰 | 배포 JS의 경로·타입·문구, locales의 제한된 REA 구문 분석 | 해당 경로의 접근 가능성, 서버 구현, 모든 모듈 실행 여부 |
| 설계 판단 | 여러 도구의 계약을 종합한 인계·검수·부하 분산 합격 조건 | 시장 전체 순위 또는 실제 제작팀의 생산성 향상률 |

경쟁 서비스의 계정을 만들거나 인증을 우회하지 않았다. 고객 원고·개인 데이터·인증 토큰을 수집하지 않았으며 유료 AI·유료 플랜·운영 데이터 변경을 실행하지 않았다. 외부 코드를 제품 소스로 복제하지 않았다.

## 2. REA 증거 원장

Evidence ID는 같은 REA 세션의 원장 및 내보낸 JSON에서 원문과 제한 사항을 찾는 식별자다. 아래 표는 성공과 제한을 함께 기록한다.

| 대상·작업 | Evidence ID | 확인 결과·제한 |
| --- | --- | --- |
| 크레코 공개 홈 | `ev_f6af1acedd6e76e88d2930ace2a4c58e18e0653ff5381f50500f22cc97208668` | DOM·접근성·네트워크 메타데이터 캡처 완료, 임시 브라우저 종료 확인 |
| 크레코 앱 로그인 | `ev_44ec16fc9f6a5926867cbbed87afac660645ad4ffa363711686284d526b14b70` | 이메일·비밀번호·로그인·가입 진입점 확인, 인증 뒤 기능 미관찰 |
| 크레코 공개 JS 응답 보존 | `ev_0f792ba8464c08ef03042e4a431bec8b7682d1d47bb1501c821b995cb250dda7` | 응답 본문 보존, 이벤트 일부 누락으로 전체 네트워크는 incomplete. 임시 브라우저 종료 확인 |
| 크레코 JS 내보내기 | `ev_e81d2b55f734d1db99be71ad983bd80a7201eca2d0c0a4f2c4b2b299b4ac2238` | 앱 origin의 JS 10개 추출. 별도 외부 origin 파일도 원장에 남아 있으나 제품 추론 대상으로 사용하지 않음 |
| 크레코 locales 정적 분석 | `ev_7efa87ae91320abf20b1563a20e801659444b07563bf7900a20de11b444fcb88` | 선택 파일 1개 구문 분석 완료, AST 노드 32,945개 방문. 다른 14개 파일 미분석, 의미 노드·미확인 항목 각 300개 보존 상한으로 의미 그래프 partial |
| 위 분석 요약 뷰 | `ev_5c5afcc4e8dd2f80ff618c6b813c325d3b6739b9181f1527a8aafc290132b2ae` | 완료된 구문 분석과 제한된 의미 분석을 구분해 보고 |
| Kitsu 공식 상태 매뉴얼 | `ev_507ad1914b7568628a8d576b75944f92c900c26d20a96618eb99a3e4897163f5` | 접근성 캡처 complete, 임시 브라우저 종료 확인 |
| Magma 공식 기능 페이지 | `ev_650a7139fa48f94bccd84a560f74a07f070907f62bb88208b0ac97ea85f53b47` | 접근성 캡처 complete, 임시 브라우저 종료 확인 |
| Magma 앱 로그인 | `ev_5d2c91261399fb8ab2155754687c201156bbcca77099faea708c96486dedaac0` | 공개 로그인·소셜 로그인·SSO와 앱 script URL 관찰. 인증 뒤 공동 캔버스 미관찰 |
| Magma 공개 진입 JS 보존 | `ev_e7a2096548f9f567b0b4ef2d2f4354daa18c692fcb57d4ccff615d51b1fb2ed4` | 로그인에서 관찰한 정확한 script URL의 946-byte 응답을 읽기 전용으로 보존, capture complete·브라우저 종료 확인 |
| Magma 진입 JS 정적 분석 | `ev_4b349a618d25bced69a7448208f6ba798eb7f676e8a6b2ed831f500ecaab6fd4` | 선택한 진입 파일 구문 분석 완료, 293 AST 노드 방문. import 대상 chunk와 source map 미수집, 의미 그래프 unknown |
| Frame.io 공식 기능 비교 | `ev_14b8cba5c303c26331a23b202c6bd3839cd8005a7c6de6cf15c8e4e6f6e088ad` | 접근성 캡처 complete, 임시 브라우저 종료 확인 |

공개 앱 번들 `static/index-BWQvWrG-.js`는 2,525,429 bytes, SHA-256은 `44c1542b26ba4db7b26bde274b80a0df78cc909c5abd05cb9c5bf9a5465e222b`다. `static/src-locales-a8u6H--S.js`는 485,908 bytes, SHA-256은 `dfa356d32c3f66c7d0c04ed060bf2144323aa0592348433d357b82ae21bc022b`다. 조사 뒤 서비스가 갱신되면 이 식별자와 재수집 결과를 비교해야 한다.

앱 주 번들의 전체 REA 의미 분석은 45초와 180초 서버 분석 예산에서 각각 중단됐다. 부분 Evidence는 `ev_c6daa7b67afb6ae7fbbfef5a6faf2355b8397167e720eb9e59a5d47e96b4d44f`, `ev_1dde26c253f38400f4603b168cc9053b95b491e8e71b8f344a2e48b7783f8bde`다. 이를 전체 정적 분석 성공으로 간주하지 않는다. 아래 주 번들 경로는 REA가 추출한 바이트에서 수행한 별도 문자열 점검 결과다.

여러 공식 페이지를 연속 탐색한 시나리오는 각 단계의 접근성 자료를 얻었지만 브라우저 정리 시간 초과로 canonical 성공 Evidence를 발행하지 않았다. 이후 Kitsu·Magma·Frame.io를 개별 시나리오로 다시 관찰했고, REA 세션의 `cleanup_pending: false`를 확인했다. CSP는 이 부분 시나리오를 성공한 제품 실행 근거로 쓰지 않는다.

Magma의 `main-c69v1jnu.js`는 946 bytes, SHA-256은 `7216a5e3fd89d21f05c4a48870cb917345a7a9aa5a957818d606f5c50119389e`다. REA 응답 본문을 digest 검증 후 파일로 저장해 정적 분석했다. 진입 코드에 import와 조건부 익명 인증 초기화 후보가 있다는 정도만 확인하며, 이 작은 파일로 실시간 캔버스나 권한 구현을 역공학했다고 주장하지 않는다.

완전한 원장은 `/private/tmp/webtoon-collaboration-rea-final-20261028.json`에 내보냈다. 조사 산출물과 외부 JS는 일회성 로컬 자료이며 저장소에 커밋하지 않는다. 해당 임시 파일의 영구 보존을 보장하지 않는다.

## 3. 도구별 작업 계약

| 도구 | 확인한 핵심 계약 | ToonStudio에 적용할 품질 기준 | 근거 |
| --- | --- | --- | --- |
| 크레코 | 회차·공정별 버전, 공정 간 비교, 뷰어 기반 피드백, 세부 권한, 활동 이력을 한 작업 흐름으로 제공한다고 설명 | 작업 목록에서 현재 버전·검수·인계·담당을 연결하고 원고 맥락으로 이동 | [공식 홈](https://creco.so/ko), 위 공개 홈·JS Evidence |
| CSP Teamwork | 편집 중인 페이지는 다른 멤버가 읽기 전용으로 열고, 저장·닫기 후 동기화. 구조 변경은 영향 범위에 따라 관리 파일·관련 페이지를 잠금 | 편집 소유권, 미전송 변경, 충돌과 재접속을 구분해 사용자 원고를 보호 | [Teamwork 매뉴얼](https://help.clip-studio.com/en-us/manual_en/570_pages/Teamwork.htm) |
| Kitsu | 준비·작업·검수 대기·완료·재작업 상태를 구분. 역할별 상태 변경 권한과 검수 요청의 버전 제출을 연결 | 후속 공정은 준비된 입력을 요구하고 검수 결정은 특정 제출본에 귀속 | [상태 설정](https://kitsu.cg-wire.com/guides/task-configuration/managing-task-statuses/), [버전 제출](https://kitsu.cg-wire.com/guides/review-publishing/publish/) |
| Kitsu | 개인 작업함, 담당자·추정 시간·마감·우선순위, 부서별 조회·업무량과 일정 | 담당 후보는 역할·범위·가용성을 지키고 개인의 여러 역할을 합산한 부하로 배정 | [개인 작업함](https://kitsu.cg-wire.com/guides/production/find-assignments/), [담당 배정](https://kitsu.cg-wire.com/assignation/) |
| Magma | 브라우저 공동 캔버스, 캔버스 피드백·채팅·통화, PSD 교환과 멀티보드 | 분업 관리에서 해당 회차·컷·캔버스로 이동할 때 맥락을 보존 | [기능](https://magma.com/features), [스튜디오](https://magma.com/studios) |
| Frame.io | 버전 스택·비교, 위치/범위 기반 코멘트, 주석·멘션·사용자 권한 | 검수자가 어떤 버전의 어느 위치에 의견을 남겼는지 유지하고 재작업과 연결 | [공식 V4 비교](https://help.frame.io/en/articles/9084073-frame-io-v4-legacy-feature-comparison) |

Magma의 공동 캔버스, CSP의 페이지 잠금, 크레코의 원고 검수, Kitsu의 제작 관리는 서로 다른 협업 축이다. 한 축의 기능 수만으로 전체 제품 우위를 판정할 수 없다.

## 4. 크레코 배포물에서 얻은 구체적 모델

다음은 배포 문자열의 존재와 문구 의미를 관찰한 결과다. 서버 동작은 미확인이다.

| 정적 관찰 | 해석 | ToonStudio 검증 시나리오 |
| --- | --- | --- |
| `episode-snapshots`, `finalize`, `status`, `visibility`, `hide` 경로군 | 회차의 작업 버전과 확정·공개 범위가 별도 축인 후보 | 최신 제출본만 승인 가능하며 숨김·구버전·재작업 상태를 완료와 혼동하지 않음 |
| `/episodes/:id/modes/comparison`, `/episodes/:id/modes/horizontal` | 비교와 가로 열람 진입점 후보 | 작업함에서 회차·산출물의 맥락으로 이동하고 비교 대상 버전을 명시 |
| 프로젝트의 공정 일괄 변경·회차 타임라인 경로 | 제작 관리의 최소 단위가 단일 카드 이상일 가능성 | 일괄 배정은 서버에서 원자적으로 처리하며 일부 실패로 반쪽 배정이 남지 않음 |
| 공정별 권한·일정 조회 권한 관련 locales | 관리·편집·의견·열람과 일정 접근의 분리 후보 | 편집·검수·담당 지정 권한을 각각 검사하고 제한된 범위의 작업만 노출 |
| 미완료 피드백 경고·피드백 공개 범위·상태 변경 문구 | 피드백의 상태와 공개 범위를 별도 관리하는 후보 | 미해결 blocker·조건부 승인·필수 검수 부족이 완료를 막음 |
| 기존/신규 구성원 기본 권한 적용·권한 유지 문구 | 멤버 변경 시 기존 권한을 보존하거나 명시적으로 재설정하는 후보 | 역할 변경이 기존 권한을 의도치 않게 확대하지 않음 |

좌표 피드백의 재앵커링 정확도, 서버 권한 enforcement, 대규모 동시 편집, 복구 품질과 실제 성능은 조사 범위 밖이다. 번들 내 문자열의 존재를 그 품질의 증거로 삼지 않는다.

## 5. ToonStudio 적용 범위

상태: **migration — 2026-10-28 작업트리 구현·검증 중**. 아래는 이 조사와 연결된 변경 영역이며, 병합·배포·제품 전체 품질 보증을 뜻하지 않는다.

| 영역 | 확인할 구현 위치 | 해결하려는 위험 |
| --- | --- | --- |
| 최신 승인 산출물에 근거한 작업 완료·인계 | `packages/core/src/production/workflow.ts`, `versioning.ts` | 출력 ID만 있는 미검수 작업이나 이전 제출본을 완료로 표시 |
| 서버의 제출본 승인·작업 전이 방어 | `apps/api/src/modules/production-collaboration/production-approval-command.ts`, `production-collaboration.service.ts` | 일반 저장 경로 우회, 구버전 승인 재사용, 잘못된 승인 주체 |
| 실제 작업 데이터 기반 분업·검수·인계 작업함 | `apps/web/src/domains/creator/production-hub/production-division-handoff-queue.ts`, `ProductionDivisionHandoffTriageSuite.tsx` | 데모 숫자·분산 화면으로 실제 우선 작업을 놓침 |
| 범위·역할·개인 업무량을 반영한 배정 | `apps/web/src/domains/creator/production-hub/production-role-dispatch.ts` 및 서버 일괄 처리 | 같은 사람의 역할 여러 개를 별개 인력으로 계산, 부분 배정 |
| 역할별 작업 상세와 승인 흐름 연결 | `apps/web/src/domains/creator/production-hub/ProductionRoleTaskInspector.tsx` | 카드 확인 후 실제 작업·검수 실행을 위해 맥락을 다시 찾음 |
| 팀 운영 예시와 실제 권한·공유 설정의 분리 | `apps/web/src/domains/creator/production-hub/ProductionTeamSurface.tsx`, `ProductionTeamFeaturePreview.tsx` | 로컬 예시의 승인·공유 차단·계약 변경 표시를 실제 서버 적용으로 오인 |

팀 운영 예시 4개는 실제 프로젝트에서 노출하지 않는다. 샘플에서도 명시적인 체험 진입점을 열 때만 불러오고 서버에 적용되지 않는다고 안내한다. 실제 표지 저장과 접근 권한 표시는 유지한다. 이 경계와 실제 표지 명령 유지에 관한 테스트 8개(2개 파일), 변경 파일 ESLint·Secretlint가 통과했다. 예시 기능을 실제 운영 기능으로 연결하는 작업은 여전히 별도 목표다.

## 6. 최상위권을 위한 합격 조건

상태: **target**. 구현 코드의 존재만으로 통과하지 않으며 단위·통합·브라우저·실제 팀 검증을 구분한다.

| 번호 | 사용자 관점의 합격 조건 | 필요한 검증 |
| --- | --- | --- |
| C1 | 작업자가 자신의 우선 작업·미배정·검수 대기·인계 장애를 실제 데이터로 바로 찾는다 | 실제 aggregate를 사용한 작업함 테스트, 빈 상태·오류·권한 제한·모바일 브라우저 |
| C2 | 역할·범위·기간이 맞는 담당자에게 배정되며 한 사람의 여러 역할은 업무량에 합산된다 | 기간 만료·범위 불일치·중복 역할·추정 시간·동률 순서·여러 작업 배정 테스트 |
| C3 | 일괄 배정은 모두 성공하거나 모두 실패하고, 오래된 revision으로 다른 변경을 덮어쓰지 않는다 | 서버 원자 처리, idempotency, revision 충돌 통합 테스트 |
| C4 | 선행 작업과 고정 입력이 준비돼야 작업을 시작하고, 모든 출력이 최신 승인본이어야 완료된다 | 선행 미완료·구버전·입력 digest 불일치·출력 누락·프로젝트 경계 테스트 |
| C5 | 필수 검수자·역할·범위·본인 승인 정책을 충족한 현재 제출본만 승인한다 | 검수 정책 부족·잘못된 lane·만료 역할·다른 제출본의 결정·동일 주체 검증 |
| C6 | 재작업·새 제출은 이전 승인 상태를 최신 원고에 잘못 재사용하지 않고 영향받는 후속 공정을 알린다 | 새 제출과 이전 검수 이력 보존, 재승인 요구, 후속 입력 stale 표시 |
| C7 | 코멘트·검수·인계에서 같은 회차·컷·버전으로 이동하며 근거를 추적할 수 있다 | 화면 간 이동, 새로고침·직접 URL·키보드·스크린리더 브라우저 검증 |
| C8 | 동시 편집·네트워크 단절·재접속·중복 요청에서도 원고와 검수 결정을 유실하지 않는다 | 2명 이상 독립 세션, 끊김·재시도·중복·충돌 복구 통합 시나리오 |
| C9 | 큰 회차·다수 인원에서도 작업함·뷰어·상호작용이 제작을 방해하지 않는다 | 고정 데이터 규모·기기·네트워크 조건의 응답 시간과 메모리 측정 |
| C10 | 실제 제작팀이 기획→콘티→선화→채색→식자→검수→납품을 완주한다 | 기준 작업과 비교한 사용자 검증, 오류·인계 누락·재작업 원인 기록 |

C1–C7의 특정 회귀 테스트 통과와 C8–C10의 현장 검증 완료는 다른 주장이다. 현재 조사로 시장 전체 최상위 또는 모든 경쟁 도구 대비 우위를 입증할 수 없다. 개별 합격 조건의 실패와 미확인을 계속 드러내는 것이 품질 기준이다.

## 7. 2026-10-28 구현과 검증 결과

상태: **migration — 로컬 구현, 병합·운영 배포 전**.

- 실제 프로젝트의 작업·산출물·현재 제출본·검수자를 읽는 분업 인계 작업함을 연결했다. 역할과 업무량에 따른 배정은 같은 사람의 여러 역할을 합산하고, 한 번의 조건부 묶음 명령으로 저장한다.
- 모든 대상 작업에 정확한 기존 스냅샷 또는 신규 부재 조건을 제공하는 묶음만 최신 프로젝트에 안전하게 재적용한다. 서로 다른 카드의 동시 저장은 보존하고 같은 카드 변경·부분 조건·미래 revision·권한 회수는 계속 거절한다. 검수·역할·정책 등 다른 명령은 기존 전역 revision 검사를 유지한다.
- 작업의 검수 링크는 정확한 회차와 현재 제출본으로 이동한다. 제출 → 검수 중 → 제출본 ID에 귀속된 결정 → 승인·수정 요청의 각 서버 응답을 확인한다. 제출본 승인·수정 요청과 연결 공정 상태는 같은 aggregate revision 안에서 반영한다.
- 새 제출본은 이전 승인 포인터를 초기화한다. 최신 승인 출력 없이 완료하거나, 선행 공정의 옛 버전을 고정한 채 시작하거나, 제출본 없이 검수에 진입하는 일반 저장 경로도 거절한다.
- 검수 정책 변경 권한, 현재 검수자·담당자의 기간·범위, 필수 lane·정족수와 열린 차단 질문을 검사한다. 이미 기록된 검수 결정 ID는 덮어쓸 수 없고, 결정 시각은 서버가 기록한다.
- 실제 운영 효과가 없는 합의 승인·공유 차단 등의 예시 화면은 운영 프로젝트에서 제외하고 명시적인 샘플 체험으로 옮겼다. 실제 권한·표지 저장·연동 설정은 유지했다.
- 제작 허브는 선택한 표면만 지연 로드하고, 회차 룸·원고·계약·운영 상세의 정적 유입을 분리했다. 로딩·복구 UI는 기존 경계를 유지하며 실제 비동기 진입과 선택하지 않은 loader 부재를 회귀 테스트로 확인한다.

### 실행 검증

| 검증 | 관찰한 결과 |
| --- | --- |
| 변경된 Vitest 회귀 | 17개 파일, 189개 테스트 통과 |
| 실제 PostgreSQL·HTTP | 24개 테스트 통과. 일반 가입·쿠키·CSRF·실제 repository transaction 사용 |
| 실제 검수 HTTP 시나리오 | 제출·승인과 연결 작업의 동일 revision 반영, 정책 변경 403, 결정 ID 덮어쓰기 409, 위조 승인·오래된 후속 입력 400 및 거절 시 revision 보존 |
| 실제 동시 저장 HTTP 시나리오 | 두 작업자의 서로 다른 카드 201/201, 같은 카드 201/409. 부재 조건·부분 조건·요청 재전송·요청 ID 내용 변경·권한 회수 검사 |
| Chromium 인계 시나리오 | 최신 지연 로딩 코드의 검색·시작 차단·정확한 작업 상세 연결, 정확한 회차·현재 제출본 검수 연결 등 3개 통과 |
| 테마·모바일·접근성 | light/dark/contrast 각각 1440·390·320px. 작업함 가로 넘침 없음, WCAG 2 A/AA·2.1 AA axe 위반 없음. 한국어·서울 시간대에서 같은 시각 검증도 통과 |
| 변경 범위 타입 검사 | Web 변경 소스·테스트 31개 파일과 실제 import graph를 루트 TypeScript 옵션으로 검사해 통과. API 전체 타입 검사도 통과 |
| 전체 하네스 | lint·Secretlint·아키텍처·문서·경계·크기·Studio eager graph 통과 후 최종 소스의 전체 타입 검사 진행 중. 하네스 전체 통과로 간주하지 않음 |

HTTP 테스트는 이 작업에서 만든 `127.0.0.1`의 임시 PostgreSQL과 테스트 전용 DB를 사용했고 테스트 스키마를 정리한 뒤 서버를 종료했다. 운영 DB·환경변수·도메인·운영 배포는 변경하지 않았다. 브라우저는 샘플 프로젝트와 로컬 개발 서버를 사용했으며, 서버 없는 UI 검증에서는 인증·상태 응답만 명시적인 fixture로 분리한다. 실제 인증·권한·저장은 별도 HTTP 통합 검증이 담당한다. 첫 진입의 반복 시간 초과를 확인한 뒤 선택하지 않은 표면의 지연 로딩을 보강했고, 기존 timeout을 유지한 새 서버 검사에서 3개 시나리오가 통과했다. 이 결과는 다중 사용자 실서비스 성능의 증거가 아니다.

### 규모 처리

같은 회차의 의존성 없는 합성 초안 작업으로 측정했다. 큐 구성과 표시 20행 검증은 각각 5회 중앙값이다. React 레이아웃·네트워크·이미지 디코딩은 포함하지 않는다.

| 작업 수 | 큐 구성 | 표시 20행 검증 | 같은 프로세스에서 전량 검증 |
| --- | ---: | ---: | ---: |
| 100 | 1.01ms | 0.36ms | 1.95ms |
| 1,000 | 10.02ms | 3.94ms | 182.63ms |
| 3,000 | 26.64ms | 13.54ms | 2,493.38ms |

미표시 작업의 실행 검증을 지연하고 같은 스냅샷에서 캐시해 3,000개 작업의 초기 모델 처리를 약 40.18ms로 줄였다. 회귀 테스트는 첫 20행의 정확한 검증 20회, 실제 클릭 시 최신 상태의 추가 검증 1회, 더 보기 후 40행과 누적 검증 41회를 확인한다. 전체 후보·누락 집계는 이동 허가를 뜻하지 않으며 실제 실행은 공통 계약을 다시 통과해야 한다.

2026-10-28 시점에는 C8의 네트워크 단절·CRDT 복구, C9의 실제 원고·복잡한 의존성·다중 기기 성능, C10의 실제 제작팀 완주가 미확인이었다. 다음 절은 2026-10-29에 추가한 검증이며 현장 검증과 구분한다.


## 8. 2026-10-29 추가 구현·검증

상태: **migration — 같은 협업 브랜치의 로컬 구현, 병합·운영 배포 전**.

### 고정 제출본의 실제 이미지 비교

- 작업의 선택 제출본에서 Studio 프로젝트의 artifact·revision ID·digest·lineage·작품·회차 범위를 대조한 실제 프리뷰를 연다. 더 최신 head가 있어도 대체하지 않는다.
- 나란히·겹쳐 보기는 저장된 이전 제출본·고정 입력본을 기준으로 사용한다. 페이지 커서를 끝까지 읽고 실제 이미지 순번을 보존하며 중복 순번·순환 커서·뒷 페이지 버전 불일치는 거절한다. 순번 비교는 자동 재앵커링이나 픽셀 차이 분석을 뜻하지 않는다.
- 승인·거부·취소된 과거 Studio 검수도 서버의 현재 작품 ACL 아래에서 읽는다. 열린 검수는 핀 의견 작성, 닫힌 검수는 같은 버전의 의견 기록 확인으로 연결한다.
- 의미가 같은 프로젝트 재조회는 이미지 요청과 비교 선택을 초기화하지 않는다. 필요한 revision을 찾으면 남은 artifact 검색을 중단하며, 해당 revision이 있는 artifact의 검수 목록만 읽는다. 무관 원고·기준본의 조회 실패는 선택 제출본과 분리한다.
- 서명 URL 만료·로드 오류는 같은 고정 원고의 읽기만 제한적으로 갱신한다. 동일 만료 URL이나 계속 실패하는 교체 URL 때문에 무한 요청하지 않는다.

### 응답 유실·재접속·탭 새로고침 복구

- POST 전 최초 `mutationId`·`expectedRevision`·명령 본문을 보관한다. 네트워크·408·5xx로 결과가 불명확하면 새 변경을 차단하고 같은 ID의 서버 영수증으로만 복구한다.
- 영수증에 들어 있는 과거 aggregate를 화면에 적용하지 않는다. 영수증 확인 후 최신 GET으로 조정하고, 확인된 저장보다 오래된 조회나 GET 실패에는 기존 화면과 복구 대기를 유지한다.
- 비밀값이 없는 작업·작업 묶음·공정 전이·제출·검수 결정·질문만 계정·프로젝트별 탭 `sessionStorage`에 보관한다. 형식 버전·UUID·revision·7일 유효기간·크기를 검증한다. 통합·초대·외부 검수·상업 기록 및 token·key·credential·서명 URL이 감지된 본문은 저장하지 않는다.
- 복원 시 먼저 현재 접근을 조회하며 첫 진입만으로 쓰기를 보내지 않는다. 사용자 새로고침·재접속에서는 최초 본문 그대로 요청하고, 확정 4xx 거부를 새 버전으로 바꿔 실행하지 않는다. 권한 회수·로그아웃은 관련 복구 기록을 폐기한다. 언어 변경·동일 계정 인증 갱신은 미확인 요청을 보존한다.
- 저장소 차단·용량 부족·제외 명령은 메모리에 유지하고 이탈 경고와 복구 제한을 표시한다. 브라우저 탭 종료·복구 기록 만료 후의 자동 복원은 보장하지 않는다.

### 실제 DB의 여덟 공정·재작업 흐름

일반 가입한 제작자와 독립된 편집 검수자의 실제 쿠키로 스토리 → 콘티 → 선화·배경 → 채색 → 식자 → 최종 교정 → 납품 준비를 실행한다. 모든 공정은 고정 입력·실제 제출본·제출본 ID에 귀속된 검수 결정·승인·완료를 거친다. 채색 수정 요청과 두 번째 제출을 추가하고, 식자가 이전 채색본을 고정한 채 시작하면 거절하며 정확한 새 입력으로 바꾸면 이어진다. 이전 제출본의 실제 승인 결정만으로 새 제출본을 승인하는 요청도 거절한다. 수정 요청 이력은 보존한다.

이 시나리오는 서버·원장 경계의 자동 검증이다. 실제 팀의 제작 시간·품질·납품 사용성 검증이나 외부 플랫폼 업로드를 완료했다는 뜻이 아니다.

### 의존성이 많은 회차의 성능

500컷 DAG에 작업 3,001개·의존선 3,500개·현재 승인 제출본 2,501개를 구성했다. 공통 스토리에서 컷별 콘티 → 선화·배경 분기 → 채색 병합 → 식자 → 검수 준비를 연결하고 후속 입력에 실제 선행 revision을 고정했다. 표준 studio 프로필과 WIP 6, 전체 canonical 검증을 유지한다.

같은 프로세스에서 이전 커밋의 원본 큐·계약·core와 현재 코드를 번갈아 5회 측정한 중앙값이다. 병렬 검사 부하로 절대 시간에는 변동이 있으며 React·네트워크·이미지 디코딩은 포함하지 않는다.

| 3,001개 작업 | 이전 커밋 | 개선 후 |
| --- | ---: | ---: |
| 큐 구성 | 385.67ms | 67.02ms |
| 표시 20행의 실행 조건 검증 | 4,487.96ms | 271.61ms |
| 제작 시작 후보 20행 검증 | 3,729.92ms | 178.22ms |

불변 스냅샷별 조회 인덱스와 동일 작업의 제출본 판정을 재사용한다. 중복 ID에서 기존 첫 일치·전체 일치 의미, 프로젝트·digest·입력 불일치 거절, 변경 전후 스냅샷의 캐시 분리를 회귀로 검사했다. 모든 A/B 측정의 현재 입력 3,001개·미완료 의존선 0개·허용된 표시/시작 후보 각 20개 결과는 같았다. 새 core 파일이나 ratchet 기준선 증가는 없다.

### 추가 경쟁 도구 근거

| 대상 | REA 직접 관찰 | 적용·후속 판단 | 한계 |
| --- | --- | --- | --- |
| [ftrack Review](https://www.ftrack.com/en/review) | 공개 DOM·접근성 트리에 버전 병렬·투명 중첩 비교, PDF, 프레임 주석 잔상, 버전·목록·접근권한 설명. `ev_5e85b000e68a2120ed7912bef86ec88fcd21a84f99ceb06324f9c414cc4178c7` | 고정 제출본·기준본 구분, 버전별 피드백 연결의 근거 | 실제 앱 비교·저장·PDF·권한 실행 미확인. 미완료 network로 전체 capture는 incomplete |
| [SyncSketch](https://syncsketch.com/) | 공개 DOM·접근성 트리에 주석, 동기 프레젠테이션, 파일 비교, PDF, 화이트보드, 3D·UV·텍스처 검토, Jira·Flow 연계 설명. `ev_18fef5e0f4856499b015fee8a39344ea1e43237059e54b6693be90b4987ac32c` | 동기 검토·제작 작업 연결·3D 검토를 후속 경쟁 축으로 추가 | 기능 실행·다중 계정·연동 저장·기기 동기화 미확인 |

[ftrack Web Player 공식 매뉴얼](https://help.ftrack-studio.backlight.co/hc/en-us/articles/13129964272791-Using-the-ftrack-Review-Web-Player)은 비교 중 피드백 대상과 현재/전체 버전 표시를 설명한다. 해당 매뉴얼의 내용은 공식 web 읽기 근거이며 REA에서는 보안 확인 화면을 관찰했다. SyncSketch 비교 매뉴얼도 보안 확인에 막혔고 Autodesk 경로 두 곳은 페이지 없음·Access Denied였다. 우회하거나 기능 성공으로 계산하지 않았다. 추가 Evidence 6개와 기존 19개를 합쳐 25개를 보존했으며, 공개 본문을 관찰한 도구는 총 7종이다. 외부 제품의 주장과 실제 앱에서 증명한 동작을 분리한다.

이 비교 단계에서 고정 Production 제출본의 댓글·의사결정 요약 PDF, 연속 진행자 동기 검토, 다중 계정의 3D 카메라/UV 주석 검토, 실제 팀 C10 검증은 완료하지 않았다. 기존 Studio에는 현재 페이지의 상태·메모·대사를 담는 `review.pdf` 내보내기, 작업 세션의 명시적 발표·10초 간격 따라보기, 자산의 Orbit·와이프·와이어프레임·표준 시점 미리보기가 있다. 이를 앞의 별도 경쟁 축을 완주한 증거로 확대하지 않는다. 원래 C1–C8 합격표의 필수 형식과 이 후속 경쟁 축은 구분한다.


### 85271d246 단계의 검증 기록

| 범위 | 결과 |
| --- | --- |
| 변경 회귀·공통 공정 | 23개 파일 284개 테스트 통과. 큐·권한·검수·복구·실제 ProjectPage 포함 |
| 실제 로컬 PostgreSQL·HTTP | 25개 통과. 독립 가입 계정·실제 쿠키/CSRF·repository transaction, 여덟 공정과 재작업·옛 승인 재사용 거절 |
| Chromium 통합 | 5개 통과(49.6초): 인계 검색·차단·정확한 작업/검수 링크, 실제 프리뷰 연결, ACK 유실 후 탭 새로고침 복구 |
| 브라우저 복구 근거 | 서버는 첫 질문을 저장하고 응답만 끊는 fixture. 새로고침 후 원래 mutation ID·revision·본문이 같은 요청 2회, 질문 기록은 1건 |
| 브라우저 시각·접근성 | 인계 3테마×3폭, 실제 프리뷰 패널 320·390·1440px 가로 넘침 없음 및 WCAG 2 A/AA·2.1 AA axe 위반 없음 |
| 변경 Web 타입 | 변경 소스·테스트 42개와 실제 import graph를 루트 strict 옵션으로 검사해 통과 |
| 전체 하네스 | 앞선 커밋 `c22da27766708e0ece48217b5ef73d6f301bc3b8`은 전체 통과. 이 단계의 정적 게이트 통과 후 전체 타입 검사를 실행했으나, 후속 실제 생성 경로 보강으로 중단했다. 최종 검증은 다음 절에 기록 |
| 추가 저장소 경계 검사 | 기존 AI prompt-library·virtual-space의 무관 7건으로 실패. 신규 sessionStorage 저널의 finding은 0건이며 검사·허용 목록은 변경하지 않음 |

브라우저 검증은 명시적인 프로젝트 API·이미지 fixture이며 실제 HTTP 저장 검증과 구분한다. 외부 서비스 연동·다중 기기 실서비스·사람이 참여한 제작 파일럿의 성공으로 해석하지 않는다. 임시 PostgreSQL은 최종 검증 후 종료했고 운영 자원을 변경하지 않았다.


## 9. 실제 검수 생성 경로의 제출 원본 연결

상태: **migration — 2026-10-29 로컬 보강, 병합·운영 배포 전**.

### 발견한 격차

실제 Studio capture producer는 작품 범위의 별도 `review-snapshot` artifact에 checkpoint → submission → snapshot과 StudioReview를 만든다. 기존 Production 제출 ref와 capture ID가 자동으로 같지 않으며, 기존 operation은 저장된 `CreatorWork.doc`만 고정하고 원본 artifact·revision·회차 관계는 기록하지 않았다. 같은 artifact에 원본·검수 revision이 이미 있는 앞선 UI fixture만으로는 이 경로를 증명할 수 없었다.

### 서버와 화면의 연결

- capture 입력에 선택적 원본 tuple `sourceRevision: { artifactId, revisionId, rootGraphHash }`을 추가했다. 원본 digest는 실제 저장된 `CreatorWork.doc`의 canonical SHA-256 및 실제 graph revision hash와 같아야 한다.
- prepare는 같은 작품·프로젝트의 실제 원본 행에서 범위를 읽어 서버 전용 `sourceRevisionScope`로 고정한다. upload·complete도 원본·hash·범위를 재검증하고 DB lock과 prepared intent 전체 비교를 유지한다. 원본에 관한 호출자 scope 주장은 받지 않는다.
- 완료 receipt·operation payload hash·저장 원고 digest·불변 parent chain과 실제 원본 행·scope가 모두 일치한 연결만 `listReviews.sourceRevision`으로 제공한다. legacy capture의 같은 hash만으로 원본을 추론하지 않는다.
- Production의 `Submission.revisionRef`와 승인 대상은 그대로 유지한다. 실제 이미지·핀 링크에는 서버가 연결한 별도 snapshot ID를 사용하고 두 ID를 구분해 표시한다. project 범위 capture가 episode 범위 원본을 대신하는 관계도 이 명시적 증명이 있어야 한다.
- 검수 이미지가 없으면 편집 가능한 사용자에게 정확한 원본 tuple을 가진 편집기 진입을 제공한다. 저장 원고·현재 편집 내용이 해당 정본 digest와 다르면 저장·prepare·캡처 전에 중단한다. 완료 후 원래 제출본 검수로 돌아온다.
- 이미지가 없는 generic exact review가 검증된 capture를 가리지 않게 했다. 실제 preview 참조가 있는 direct snapshot만 직접 선택하며, preview-unavailable은 해당 원본의 캡처 복구로 안내한다. version mismatch·closed·403은 캡처로 대체하지 않는다.

기존 capture·review 클라이언트는 선택 필드가 없어도 동작한다. migration과 새 core 파일은 추가하지 않았고, 800줄 초과 host와 graph repository의 크기를 늘리지 않았다.

### 최종 실행 결과

| 검증 | 결과 |
| --- | --- |
| 변경 회귀 | 27개 파일 327개 테스트 통과 |
| 원본 캡처의 보조 계약·runner | 4개 파일 68개 테스트 통과 |
| 실제 PostgreSQL·HTTP 통합 | 3개 파일 78개 테스트 통과: 가입·분업 HTTP 25개, capture producer 48개, 새 원본 연결 5개 |
| 원본 연결 DB 사례 | 다른 snapshot ID의 연결 성공, 원본 불변 update `55000`, scope 변조 차단·증명 제거, legacy 추론 금지, 다른 작품·없는 원본·틀린 hash·intent 재사용·권한 회수 거절 |
| 최종 Chromium | 실제 producer 형태의 별도 artifact와 검증된 원본 DTO를 사용한 이미지 비교·원본 보존, 새로고침 복구, 기존 인계 등 5개 통과 |
| 변경 Web 타입 | 변경 Web 52개 소스·테스트와 실제 import graph 및 신규 E2E 파일을 루트 strict 옵션으로 검사해 통과 |
| API 타입 | 최종 backend 원본 연결 소스에서 API 전체 `tsc --noEmit` 통과 |
| 전체 하네스 | 최종 소스의 lint·Secretlint·문서·아키텍처·경계·소스 크기·Studio eager graph 통과. 저장소 전역 타입 검사는 진행 중이며 하네스 전체 성공으로 간주하지 않음 |

실제 DB의 raster canonicalization·원본/receipt/operation/권한·조회 계약을 검증했다. 객체 저장소는 테스트 전용 adapter이며 운영 R2 업로드가 아니다. 브라우저의 API·이미지는 명시적 fixture이고 실제 DB 검증과 분리한다. 이미지 렌더링의 주관적 품질이나 실제 제작팀 파일럿을 이 결과로 대신하지 않는다. 검증용 PostgreSQL은 종료했다.


## 10. 독립 브라우저와 실제 로컬 API의 오프라인 복구

상태: **migration — 2026-10-29 격리 환경 검증, 병합·운영 배포 전**.

앞선 브라우저 API fixture와 별도 DB 검증 사이의 빈 구간을 추가 검사했다. 같은 BrowserContext의 복제 탭이 아니라 독립 Chromium context 두 개에서 실제 일반 로그인과 HttpOnly 쿠키를 사용했다. 새 loopback PostgreSQL cluster와 고유 schema에 실제 AuthController·세션·CSRF·Production controller/service/repository를 연결했다. 이메일 전송만 격리 outbox로 대체했고 주변 health/capabilities 응답은 명시적 QA 상태다. 제작·인증 API 응답을 브라우저 fixture로 대체하지 않았다.

### 실제 오프라인 전환에서 발견하고 고친 문제

오프라인 이벤트가 처음 PWA 설치 안내를 열면 아직 받지 않은 안내 청크를 React.lazy로 요청했다. 실패가 전역 오류 경계의 자동 새로고침으로 이어져, 저장 영수증은 정상이어도 제작 화면이 사라졌다. 이 경로를 실제 브라우저에서 재현했다.

설치 안내 호스트는 오프라인 최초 요청을 보류하고, 로드 실패를 현재 편집 화면과 분리된 작은 비모달 안내로 처리한다. 닫기·재시도, 온라인 복귀 후 안내 준비를 제공하며 사용자가 열기 전에는 설치 본문 모달을 띄우지 않는다. 설치·방문/수동 진입·이미 받은 안내의 오프라인 사용·발표 화면 차단은 유지한다. 전역 오류 복구와 원고 저장·이탈 보호 규칙은 변경하지 않았다.

### 추가 실행 결과

| 검사 | 실제 결과 |
| --- | --- |
| 독립 계정 진입 | 서로 다른 두 일반 계정·HttpOnly 세션·실제 제작 보드 확인 |
| commit 뒤 ACK 유실 | 실제 서버 201 뒤 응답만 끊음. 화면 재진입 시 자동 쓰기 없이 권한을 확인하고, 사용자 복구 확인으로 최초 요청 ID·revision·본문을 그대로 재전송. 영수증·해당 revision의 감사 이벤트 각각 1건 |
| 명시적 offline/online | navigator.onLine=false에서 초안과 미확인 명령 보존. 재접속 중 인증 세대 갱신 후 필요한 명시적 복구 확인까지 수행. 실패 요청을 포함한 같은 ID의 요청 3회, 실제 DB 변경·영수증·감사 이벤트 각각 1건 |
| 서로 다른 카드 | 독립 UI에서 같은 기준 revision으로 동시에 저장해 201/201. 두 변경 모두 보존, revision +2 |
| 같은 카드 | 독립 UI에서 같은 기준 revision으로 동시에 저장해 201/409. 승자 1건만 반영, 패자의 입력 초안 유지, revision +1 |
| 최종 조회 | 두 계정의 최신 aggregate가 일치, 해당 완주 실행은 r9→r14, 브라우저 미처리 오류 0건 |
| PWA 회귀 | 관련 6개 suite·42개 테스트 통과. 오프라인 import 보류·기존 입력 DOM/값/포커스·저장 동작·로컬 오류/재시도·늦은 완료·설치 상태와 기존 전역 오류 경계 검사 포함 |
| 실제 작은 화면·접근성 | 320·390·1440px에서 편집 저장 버튼의 실제 hit target과 초안 보존 확인. light/dark/contrast 각 3개 폭에서 안내 가로 넘침 없음, 안내 범위 WCAG 2 A/AA·2.1 AA axe 위반 0건, 이 검사 자체의 제작 저장 0건 |

완주 전의 하네스 시도에는 초기 개발 서버의 로딩 시간 제한과 실제 한국어 복구 문구 selector 불일치도 있었다. 인증 세대가 바뀌면 명시적 영수증 확인을 요구하는 현재 보안 계약을 따르도록 검증 절차를 맞췄다. 같은 요청의 본문·revision·영수증 1건 판정은 완화하지 않았다. PWA 전역 새로고침은 하네스 문제가 아닌 실제 구현 문제로 따로 수정했다.

검증한 PWA 호스트의 SHA-256은 ec0a86a38285763a0c0ee9b0e8fa029a357857640692382591df5bdba853aee3이다. 해당 파일과 회귀 테스트 외의 제품 동작은 이 보강에서 수정하지 않았다. 최종 게시 커밋의 전체 하네스·정상 푸시·원격 PR 상태는 해당 실행 로그와 PR 본문으로 별도 확인한다.

이 결과는 **로컬 제작 명령과 복구의 종단 검증**이다. 실제 캔버스의 두 계정 CRDT 수렴, 운영 R2 업로드, WAN·다중 기기, 대규모 뷰어 p95/메모리, 실제 제작팀의 납품 파일럿이나 경쟁 도구 대비 우위를 입증한 결과는 아니다. C7의 전체 원고 캡처 경로, C8의 캔버스·실네트워크, C9·C10의 남은 검증은 계속 미확인으로 유지한다.

## 11. 펜 첨삭의 서버 영속성과 초안 복구

상태: **migration — 2026-10-29 로컬 구현·검증 중, PR 준비 범위**.

### 재현과 보강

`9cb4e88d7452d727914dd5c5cc1101838bb113f8`의 실제 API DTO에 일반 의견은 통과하지만 같은 본문에 `strokes`를 추가하면 `unrecognized_keys`로 거절되는 것을 재현했다. 개인 초안함도 strict schema에 해당 필드가 없어 펜 첨삭을 보관하지 못했다. 화면의 로컬 획 보관은 다른 계정의 재조회나 새로고침을 보증하지 못했다.

- Web·API는 기존 Studio 공용 패키지의 펜 계약을 함께 사용한다. 50획·획당 500점·중복 없는 ID·유한한 원본 픽셀 좌표·색·굵기를 검사하고, 비어 있지 않은 획은 source가 검증된 region에만 저장한다. 실제 불변 capture mapping에서 페이지와 영역 안의 점 및 페이지 크기 안의 굵기를 검사한다.
- 댓글 생성·조회·동일 ID 재시도에 같은 획을 포함한다. 같은 작성자의 같은 획은 원장 행 1개로 확인하고, 다른 작성자·다른 획·다른 검수본의 ID 재사용은 충돌이다. 기존 무획 요청과 빈 배열은 동등하다.
- 화면은 실제 서버에서 다시 읽은 획을 사용한다. 생성 응답의 획·검수 ID·anchor가 요청과 다르면 저장 확인을 보류한다. 개인 초안은 획을 그대로 보관하고, 응답 유실 뒤 서버의 같은 작성자·내용·anchor·획을 확인해야 정리한다. 20개 초안 각각에서 API의 펜 계약을 보존할 수 있도록 유한한 보관 용량도 맞췄다.
- 실제 Chromium의 이미지 위 펜 입력에서 `dragstart → pointercancel`이 발생해 획이 사라지는 것을 관찰했다. 펜·점·영역을 배치하는 동안 기본 이미지 드래그를 막고, 일반 페이지 열람의 드래그는 유지한다. 회귀 테스트는 수정 전 3개 실패와 수정 후 관련 19개 통과를 확인했다.
- 유효한 25,000개 극소 좌표는 전송 JSON 약 503KB가 PostgreSQL JSONB 표현에서 약 8.6MB가 될 수 있다. 숫자를 반올림하거나 점을 줄이지 않고, 공유 계약에서 실제 JSONB 표현의 바이트 수를 계산해 기존 2MiB 예산과 맞춘다. 새 격리 PostgreSQL의 읽기 전용 SELECT 15건에서 예상값과 실제 값이 같았으며 정확히 2MiB는 허용하고 1바이트 초과는 거절했다. 이 검사는 저장 표현의 크기 대조이며 댓글 저장 성공 증거와 구분한다.

### DB 적용 순서와 복구

추가형 `0114_studio_review_comment_pen_strokes.sql`은 `strokes JSONB NOT NULL DEFAULT []`와 shape·25,000점·2MiB 예산을 추가한다. 기존 댓글은 빈 배열로 유지한다. 새 펜 댓글의 획과 source anchor는 삽입 후 변경하지 못하며, 무획 legacy 댓글의 기존 anchor 정책은 유지한다. 기존 검수·공간 anchor trigger는 교체하거나 비활성화하지 않는다.

운영 반영은 이 단계에서 실행하지 않는다. 추후 반영 시 **migration을 먼저 적용하고 새 API를 배포**해야 한다. 이전 API로 되돌려도 새 열·펜 원장은 보존하며, 복구를 위해 열·댓글·획을 삭제하지 않는다. migration 자체의 실패는 트랜잭션으로 복구하고 원인 확인 후 같은 파일을 재적용한다.

DB migration·schema의 정본 경로는 `platform/database`다. 불변 migration 이력 0114를 추가하면서 해당 경로의 파일 수는 165→166이 되었다. 이 정확한 한 파일을 `architecture-source-ratchet.json`에 반영했다. 이미 적용된 migration을 수정하거나 이력을 다른 폴더로 옮겨 수량을 맞추지 않는다. 파일 크기·Studio 진입 그래프·import 경계의 상한과 판정 코드는 그대로 적용한다.

### 실행한 검증과 남은 증거

- 공유 계약·Web 회귀: 최종 용량 계산·드래그 보강 소스에서 8개 파일 93개 통과. 원본 좌표, 부정확한 숫자·색·필드 거절, 전체 50×500점, 초안 저장과 응답 유실·서버 획 불일치 시 초안 보존, 생성 영수증의 버전 불일치를 포함한다.
- API DTO·source mapping·comment store·migration 단위 회귀: 최종 용량 계산·anchor 불변·float64 하한 보강 소스에서 4개 파일 72개 통과했다.
- 실제 PostgreSQL·HTTP: 최종 소스로 새 펜 suite 18개·기존 producer 48개·원본 연결 5개, 합계 3개 파일 71개 통과했다. 실제 PNG producer와 불변 mapping, 타계정 조회·새 repository 재조회, 동시 동일 ID 행 1개, 다른 획·작성자 충돌, 권한·정본 경계, SQL 획·anchor 불변, 빈/기존 상태 및 재적용을 검사했다. HTTP actor header는 DTO·인가 fixture이며 다음 일반 로그인·CSRF 검증과 구분한다.
- 정규 PostgreSQL runner 등록 회귀 11개 통과. 새 suite를 CI 목록에 등록했다.
- 실제 일반 인증 브라우저: 격리된 새 PostgreSQL·실제 Auth/CSRF/Creator/Graph API·바이트 로컬 HTTPS 저장소에서 owner/editor/viewer 세 계정을 각각 가입·확인·로그인하고 실제 초대·수락을 거쳤다. Chromium 6개 시나리오를 exit 0으로 완주했다. owner의 실제 Host 캡처 뒤 editor의 두 색 펜 2획을 201로 저장하고, DB·새로고침·독립 owner의 SVG에서 원본 좌표·색·굵기를 대조했다. 네 번의 실제 입력에서 기본 `dragstart`가 차단되고 `pointercancel`은 0건이었다.
- 서버 저장 201 뒤 응답만 끊은 경우에도 입력을 보존하고 동일 ID·anchor·획·본문을 재전송해 댓글 원장 1행만 확인했다. viewer의 실제 조회와 쓰기 403, 390px의 원본 좌표 및 주석 영역 넘침 없음, 최종 댓글 2개·원고 revision/hash 보존, 미처리 페이지 오류 0건을 확인했다. 이 작품은 앞서 실제 Canvas에서 만든 원고 A를 자료로 재사용했으며 이번 실행에서 새 작화를 완료했다는 뜻이 아니다.
- 로컬 HTTPS adapter의 CA·실제 업로드/GET hash·HMAC/Origin·오류·삭제 재시도 11건 통과. 서버 시작·준비·브라우저 시작·종료의 제품 31개 파일 바이트는 동일했다. 전체 manifest 차이는 지정한 자동 캐시 3개에서만 따로 기록했다. QA API·TLS·PostgreSQL 종료와 임시 config·키 삭제를 확인했다.

실제 브라우저의 기준은 `9cb4e88d7452d727914dd5c5cc1101838bb113f8`에 미커밋 변경 31개 파일을 더한 소스다. 제품 manifest SHA-256은 `7c99164db151247921e989dbd967a9c51bc52d15686da56d59a8b8bf28361c34`이며, 실행 뒤 문서에 결과를 추가했다. 검사 원문과 수정 전 재현을 분리한 `webtoon-collaboration-pen-evidence-20261029`에 보관했다. 전체 하네스·정상 push는 다른 작업과 조정한 검사 순서를 기다리고 있으며, 원격 CI 성공·main 병합·운영 migration·배포는 수행하지 않았다. 이번 펜 첨삭 보강을 실제 팀 납품 파일럿·production 성능·경쟁 도구 전체 대비 우위로 확대하지 않는다.

## 12. C7 실제 원고·제출·검수 경로의 추가 증거

상태: **migration — 2026-10-29 clean 9cb4e88d7의 로컬 실제 경로 검증**. 10절 마지막의 미확인 C7 경로 중 아래 구간을 별도로 확인했으며, 11절의 펜 검수 자료와 구분한다.

실제 owner 로그인·HttpOnly 세션·Live Gateway 동기화 상태에서 두 페이지에 펜으로 그린 원고 A를 일반 저장하고 ACK를 확인했다. 실제 Host 캡처로 1440×2160 PNG 두 장을 생성했으며 decoded pixel·원고 좌표·receipt·DB blobHash·로컬 HTTPS GET hash를 대조했다. 추가 pointer 획으로 원고 B를 저장하고 일반 캡처의 Graph submission 부모를 Production의 원본 제출 ref로 등록했다. 화면의 정확한 source tuple 링크에서 별도 검수 캡처 C를 만들고 서버의 sourceRevision 증명과 Production 원본 ref B 보존을 확인했다.

A/C 나란히·겹치기 비교에서 수정한 첫 페이지는 16,276픽셀 차이, 수정하지 않은 둘째 페이지는 동일했고 B/C decoded pixel도 동일했다. 독립 editor 로그인으로 C에 실제 좌표 핀을 저장하고 새로고침으로 다시 읽었다. editor의 Studio 승인 403, owner의 승인 200, 승인 뒤 기존 핀·이미지 조회 보존을 확인했다. Production 제출은 `submitted`로 유지하며 Studio 승인과 공정 최종 승인을 혼동하지 않는다. 미처리 페이지 오류는 0건이었다.

원문은 `webtoon-collaboration-c7-actual-chain-20261029.zip`에 별도 보관했다. SHA-256은 `d7c25f817cf3087a5577c97c6f97b8306e95339baea5e180b4e6240d271874bc`다. 이 결과는 Vite development·테스트 원고·실제 PG/HTTP·로컬 HTTPS adapter 범위다. 실제 스크린리더, 두 계정 동시 캔버스 CRDT 수렴, 운영 R2·WAN·실기기, C9 production p95/메모리·C10 실제 제작팀 납품 파일럿은 여전히 미확인이다.

## 13. C8 동시 Canvas 입력과 검수 진입 경계

상태: **migration — 2026-10-29 clean dd1287940의 부분 실행·실패 분석**. 두 계정 동시 Canvas 수렴의 합격으로 판정하지 않는다.

실제 owner/editor를 일반 인증·CSRF·HttpOnly 세션으로 로그인시키고 같은 원고를 독립 Chromium context에서 열었다. 실제 `MeModule`의 초기화·병합과 Live Gateway를 거쳤으며, 기준 원고의 두 Host 캡처와 고정 PNG의 decoded pixel 일치를 먼저 확인했다. 두 계정의 실제 포인터 입력 구간을 겹친 뒤 영속 ACK 87건(owner 42·editor 45)을 관찰했다. readonly PostgreSQL 복원에는 새 펜 획 두 개가 각각 75점·finalized로 남았다. 저장 원고는 기존 10획·revision 1을 유지했다.

그 직후 실제 canonical 검수 버튼을 누르면 원고 조회·저장 안내로 진입하기 전에 로컬 실패 상태가 됐다. online 단계의 공유 원고 조회·PATCH·prepare·입력 PNG는 없었다. 첫 ACK 묶음 뒤 약 2.55초·2.72초에 추가 ACK가 있었고, Host는 2초 지연 커밋이 남아 있으면 검수 가용성을 거절한다. 실제 클릭 순간 ref를 계측하지 않았으므로 이 실행의 원인을 단정하지 않는다. 활성 CTA와 로컬 커밋 경계의 연결은 별도 회귀 대상으로 삼는다. 권한·그리기·GPU 완료 fence, 저장 원고와 현재 편집 내용 비교, 명시적인 저장 절차는 유지해야 한다.

후속 로컬 코드는 새 수동 캡처 진입에 기존 펜 커밋 ref를 연결했다. 현재 권한·hydration·mounted·그리기 상태를 먼저 확인하고, pending을 동기 확정한 뒤 React publication을 마친 최신 문서를 읽는다. 계정·작품·제출 원본·접근 세대가 바뀌면 새 scope로 캡처하지 않는다. 정상 문서 세대 전진은 허용하며 저장본과 다르면 기존 `needs-save` 안내를 연다. HTTP 자동저장은 추가하지 않았다. GPU 완료·활성 입력·권한 fence를 그대로 적용하고, 자동 effect에서는 동기 flush를 실행하지 않는다.

실제 bridge의 현재 phase를 읽어 uncertain·busy 재열기에서는 pending을 확정하지 않는다. 이미 준비한 intent·PNG와 기존 명시적 retry는 보존한다. 수정 전 pending publication 1건과 uncertain·같은 tick checking 재진입 2건, 총 3건의 실패를 확인했다. 최종 `review-capture` 전체와 원고 복귀·origin 소비자 3개 suite를 함께 실행해 **12파일 102개 통과, exit 0**을 확인했다. 추가 필수 ref는 실제 소비자 fixture까지 갱신했다. `validate:architecture`, 소스 크기·Studio eager graph 검사도 통과했고, 큰 Host의 행 수는 늘리지 않았다. 전체 타입·하네스·정상 push는 검사 순서를 기다린다. 후속 제품 코드로 실제 두 계정 Canvas 시나리오를 다시 실행한 결과는 아직 없다.

QA 조회 도구에서도 별도 결함을 발견했다. `SELECT sequence::text … ORDER BY sequence`는 출력 alias를 문자열로 정렬해 실제 87행을 100부터 반환했다. readonly 비교에서 실제 bigint 열을 명시하면 88부터 174까지 순서대로 반환했다. 원본과 실패 증거를 보존한 새 adapter만 수정했으며, 제품 repository의 Drizzle `asc(column)`은 이 결함에 해당하지 않는다. 순수 causal 8개와 숫자 순서·actor·hash·바이트 경계 7개, 합계 15개가 통과했다. 이 순수 검증은 실제 Canvas 완주 증거를 대신하지 않는다.

실패한 UI 선택자·초기 시도와 canonical 진입 실행은 각각 분리해 보존했다. 부분 증거는 `webtoon-collaboration-c8-canvas-admission-20261029`에 모으고, 기존 C7·C8·펜 ZIP은 수정하지 않는다. QA 서버·TLS·PostgreSQL의 정상 종료, 임시 인증·키 파일 삭제, 정지·소유권·정확 경로 검사 뒤 해당 테스트 DB 파일 정리를 확인했다. 제품 소스는 시작부터 종료까지 dd1287940과 같았으며 전체 manifest의 자동 캐시 차이는 별도 기록했다.

새 획을 포함한 공유 원고 저장·양쪽 Host 픽셀 대조·실제 WebSocket 단절·재접속·새로고침은 아직 완료하지 못했다. 한 Gateway·로컬 개발 서버·로컬 HTTPS adapter의 부분 결과를 WAN·다중 노드·실기기·운영 수렴 보장으로 확대하지 않는다.

## 14. C9 계측 도구의 사전 정확성 검사

상태: **target — 2026-10-29 순수 계약 검증 완료, 실제 성능 계측 미실행**.

원본 계측 도구는 그대로 보존하고 v2 사본에서 DB Date와 JSON ISO 시각 비교, 실제 AppShell 초기화와 읽기 계측의 구분, route로 비활성화되는 HTTP cache의 조건 표기, 계측 시간에 섞인 JSON 검증 비용, 실제 요청된 lazy 자산과 dist 바이트 비교를 보강했다. 원본 Date 비교의 실패를 재현한 뒤 v2 순수 회귀 13개·구문 검사·동일 27파일 Secretlint를 통과했다. 최초 Secretlint는 실제 비밀이 없는 합성 BasicAuth URL fixture 한 건이었고, fixture 구성만 바꿔 탐지 규칙·거절 검사를 유지했다.

현재 SHA의 production build·preview·DB 적용·실제 브라우저 p95/메모리 측정은 수행하지 않았다. 준비한 3,001작업·3,500간선·승인 기록 2,501개는 합성 데이터이며 실제 500개 원고·승인 명령·제작팀 완주가 아니다. `qualified:false`를 유지하고, `webtoon-collaboration-c9-measurement-contract-20261029`의 순수 결과를 성능 합격 수치로 사용하지 않는다.

## 15. C8 수정 후 실제 두 계정 Canvas 수렴·재접속

상태: **migration — 2026-10-29, 263d02403의 로컬 실제 경로 5시나리오 통과**. 13절 작성 뒤 추가한 결과다. 해당 절의 수정 후 미실행 상태 중 아래 범위는 확인했으며 production·WAN·다중 기기 검증과 구분한다.

새 loopback PostgreSQL에 실제 스키마와 Studio 검증 trigger 21개를 준비하고 일반 Auth·CSRF·HttpOnly 로그인·실제 초대 수락을 거친 owner/editor를 독립 Chromium context에서 실행했다. 초기 두 페이지·10획은 앞선 실제 Canvas 원고 A 자료를 재사용했다. 새 펜 입력은 실제 편집기에서 포인터 구간이 겹치도록 수행했으며 앱 내부 문서·ref·socket을 주입하거나 직접 emit하지 않았다. 실제 Me 초기화·Live Gateway·공유 저장·Graph capture와 로컬 HTTPS 바이트 저장소를 사용했다.

| 확인 구간 | 실제 결과 |
| --- | --- |
| 기준 원고 | 독립 두 Host의 r1·두 페이지 input/canonical PNG decoded pixels 일치 |
| 온라인 동시 작화 | 두 계정의 새 획 각 1개·각 75점. 실제 UI PATCH 200, r1→r2·CRDT frontier 184. 두 Host의 저장 doc·PNG 일치 |
| 영속·생성 인과 | actual wire hash/bytes·세션 actor·PG receipt/update를 연결하고 순서 복원. 생성 struct·geometry·finalized 전이를 대조. 전체 renderer 속성까지 저장 element와 canonical equality |
| 실제 단절과 복원 | editor의 WebSocket close를 관찰한 상태에서 owner가 75점 획을 추가. 실제 공유 PATCH 200, r2→r3·frontier 217. 재접속의 새 socket·동기화 뒤 두 Host의 3획·doc·pixels 일치 |
| 양 계정 새로고침 | 실제 reload 뒤 r3·frontier 217·세 획·두 페이지 PNG 유지. PG/causal 증명 재확인 |
| 브라우저 종료 후 | owner/editor/viewer의 최신 GET 200·r3·frontier 217·동일 doc. readonly PG 복원과 관측 ACK 127건·새 획 3개 재대조 |

정상 종료한 최종 runner는 `passed`, `phase1Passed`, `reconnectPassed`, `reloadPassed`가 모두 true였고 실제 exit 0이다. 관측 mutation ACK는 127건(owner 82·editor 45), 새 획의 직접 생성은 owner 2개·editor 1개다. page error와 observation error는 0건이었다. 온라인·재접속·reload 각각의 PG/causal proof와 실제 Host 입력 PNG·producer canonical PNG를 보관했다. 같은 SHA의 제품 소스는 API 시작·준비·각 브라우저 시작·종료·서버 종료까지 유지했다. 지정한 자동 cache 네 경로 가운데 세 파일의 전체 manifest 차이는 제품 동일성과 분리했다.

첫 시도는 양쪽 온라인 저장·PNG 뒤 QA helper의 중첩 tsx namespace module import에서 중단됐다. 이 실패를 제품 실패나 전체 성공으로 바꾸지 않고 원본을 보존했다. helper가 부모 CLI의 실제 tsx 경계를 사용하도록 고친 뒤 세 reader export를 확인하고, 첫 작품의 90 ACK·r2·두 획을 별도 readonly PG 증명으로 대조했다. 이후 원래 작품·CRDT를 보존한 새 독립 작품에서 전체 시나리오를 실행했다. API·PG를 재시작하거나 원고를 reset하지 않았다. QA의 DB 연결값 오류 비교도 값 없는 메시지와 redactor로 보강했으며 실제 누출 관측과 구분한 합성 privacy 회귀 3개를 통과했다.

두 시도 모두 ACK 대기가 2초 idle보다 길었으므로 이 브라우저 결과를 **pending 커밋 전 즉시 진입에서 동기 flush가 작동한 직접 증거**로 사용하지 않는다. 해당 경계의 직접 증거는 13절의 수정 전 3개 실패와 수정 후 실제 hook 회귀다. 이번 결과는 실제 동시 작화의 저장·수렴·단절·복원을 증명하며, production p95·입력 지연 합격 수치를 뜻하지 않는다.

범위는 같은 기기의 Chromium 두 context·Vite development·실제 PostgreSQL·단일 memory Gateway·P2P 비활성·로컬 HTTPS QA adapter다. 단절한 editor의 신규 오프라인 편집은 수행하지 않았으며 동일 요소 충돌·Canvas ACK 유실/중복 replay·서버 재시작·다중 node·WAN·다른 기기/GPU·운영 R2의 성공으로 확대하지 않는다. C9 production 성능과 C10 실제 제작팀 납품 파일럿은 미확인이다.

실행 후 소유 API·TLS·PostgreSQL의 정상 종료와 모든 QA 포트의 listener 부재를 확인했다. 임시 config·인증값·개인키를 삭제하고, 정지·소유권·정확 정본 경로를 확인한 해당 테스트 DB 파일도 정리했다. 이전 실패 ZIP은 수정하지 않고 v3 실행·로더 수정·읽기 전용 후속 검증을 새 증거 묶음으로 보존한다. 전체 하네스·타입·정상 push는 조정한 검사 순서를 기다리며 PR 준비 범위를 유지한다. main 병합·운영 DB·배포는 실행하지 않았다.

## 16. C4 선행 재제출 뒤 후속 승인·완료의 현재 입력 경계

상태: **migration — 2026-10-29, 새 승인·완료 경계 수정과 실제 HTTP 검증**. 선행 A1을 고정한 후속 B1이 이미 검수 중일 때 A2를 제출하면, 기존 구현은 B1의 새 승인과 기존 승인 작업의 새 완료 전환을 허용했다. A2가 아직 미승인인 경우와 새 승인을 마친 경우 모두 재현됐다. 최초 9개 회귀 중 정상 경로 3개는 통과했지만 거절 경로 6개는 실패했다.

새 `approved`·`conditionally-approved`·`done` 전환에서는 변경 후 aggregate의 현재 승인 선행 출력과 작업 입력을 검사한다. 새 제출본 승인에서는 연결 산출물·범위에 해당하는 작업을 찾아 **그 제출본 자신의 고정 입력**을 대조한다. 출력 두 개 중 하나만 승인해 작업 상태가 그대로인 경우와, 작업 입력만 A2로 바꾸고 A1 기반 B1을 승인하는 경우도 거절한다. 작업 전환 검사만 추가한 중간 상태의 부분 승인 2개 실패와 제출본 입력 우회까지 포함한 3개 실패를 별도로 보존했다.

기존 A1·B1 승인과 검수 결정은 이력으로 유지한다. 선행 A2의 제출·승인, 관련 없는 제목 수정, 이미 승인된 제출본의 같은 상태 저장을 허용하며 후속 입력을 자동 교체하거나 이력을 초기화하지 않는다. 현재 입력 검사는 새 승인·완료의 조건이며 과거 aggregate 전체를 항상 최신 상태로 강제하는 검사가 아니다. `changes-requested → A2 입력 고정 → B2 제출·검수·새 승인 → done` 복구도 통과했다.

| 실제 검증 | 결과와 범위 |
| --- | --- |
| Service·DTO·Core·승인/배치 회귀 | 단일 worker, 6 suites·92 tests 통과, 실제 exit 0. 새 경계 회귀 17개 포함. 저장 transaction 경계는 메모리 adapter |
| 일반 Auth·쿠키·CSRF·실제 PostgreSQL HTTP | 새 loopback 테스트 DB에서 1 suite·26 tests 통과, skip 0, 실제 exit 0. 기존 25개와 새 원자성·복구 시나리오 1개 |
| 새 HTTP 거절 분모 | A2 제출 상태·승인 상태 각각에서 B1 부분 승인, 일반 작업 완료, 배치 완료의 6요청이 400. 매번 전체 GET 결과가 동일하고 해당 mutation receipt는 0행 |
| 새 HTTP 정상 분모 | 과거 승인·검수 결정·A1 pin 보존, 제목 수정 허용, A2를 고정한 두 출력의 부분 승인→전체 승인→완료 통과 |
| 정적 검사 | 변경한 API 세 파일의 scoped ESLint·Secretlint, 하네스 doctor/check, diff 공백 검사 통과 |

HTTP 검증 도구의 첫 실행은 잘못 지정한 pnpm 절대 경로 때문에 테스트를 시작하지 못했다. 소유 PostgreSQL과 임시 비밀값을 정리한 뒤 실제 PATH의 pnpm을 사용한 새 격리 DB에서 실행했다. 성공 실행은 제품 파일 세 개의 시작·종료 SHA-256 일치를 확인했고 PostgreSQL 정상 정지·상태 코드 3·임시 비밀 파일과 정지한 소유 DB 파일 삭제를 마쳤다. 운영 DB와 migration은 변경하지 않았다. 새 코드의 전체 하네스·타입·production build·정상 push·원격 CI는 미실행이며, 15절의 이전 소스에서 얻은 Canvas 실행을 이번 API 변경의 재검증으로 표시하지 않는다.

## 17. 크레코 공개 배포물 재수집과 제한된 REA 정적 분석

상태: **current — 2026-10-29의 공개 로그인 전 관찰**, 서버 동작은 **미확인**이다. 정상 공개 페이지를 새 브라우저로 수집한 Evidence `ev_781d1616254c1087a55f1e81b4ed144752aeea4e88954ffd7371b886ee9cf2b0`은 complete·152 events·2 steps·소유 브라우저 종료를 기록했다. 결과 전송 한도 오류 뒤 같은 수집을 반복하지 않고 보존된 원장을 내보냈다. 공개 JS export Evidence는 `ev_80b18269608fe26eba7cf4202335d34676ab9be3561e857dedeb1dce70985820`이다.

main 배포물 2,525,429바이트의 SHA-256은 `44c1542b26ba4db7b26bde274b80a0df78cc909c5abd05cb9c5bf9a5465e222b`로 기존 수집과 같았다. 원문 AST에서 API URL이 포함된 최소 객체 6개를 골라 UTF-16·UTF-8 byte 범위와 원문/괄호 wrapper hash를 기록했다. 외부 코드를 실행하거나 제품에 복사하지 않았다. 선택한 8,885바이트의 REA 분석은 6 sources·987 AST nodes·parse 실패 0이지만 findings·modules는 0, graph partial·semantic unknown이다. 이를 전체 앱 의미 관계 복원이나 실제 요청 성공으로 해석하지 않는다.

원문 객체에는 method·url 두 필드로 된 선언 107개가 있다. 조회 51·부분 변경 28·생성형 21·삭제형 7개다. 스냅샷의 상태·확정·공개 범위·텍스트 공정 확인, 프로젝트 공정, 사용자와 공정 연결, 역할 목록, 공정 template, 작업공간 공정과 버전 목록을 별도 선언으로 관찰했다. 본문·query·header·응답 DTO, 허용 상태·역할 값, 접근 제어, 확정 조건·원자성·중복 처리, 버전 비교 UI와 주석 연결은 해당 객체에 없어 미확인이다. 메서드 이름이 성공적인 생성·변경을 보증하지 않는다.

제한된 분석의 parent Evidence는 `ev_69dc23d2cf56c1c65b3251b84ad0ee4e275fd589491e9f0c9e90534f445a163c`, summary는 `ev_0ead2a021e6f4b6404964c56f726023904ed30dc43ae51b8ecb5d7a553bb63b7`이며 최종 원장은 4 records다. 공개 capture의 응답 바이트는 브라우저 API가 노출한 결과로 wire 바이트·원래 transaction과의 동일성을 보증하지 않는다. 로그인 뒤 서버 권한·다중 계정 실행·성능·시장 순위는 이 근거로 주장하지 않는다. 16절 수정은 ToonStudio 자체 결함 재현과 테스트에 근거한다.

## 18. 검수 입력 안내·영역별 정족수·직접 링크 복귀 보강

상태: **migration — 2026-10-29, 추가 결함 재현과 수정**. 16절의 서버 검사를 화면의 승인 계획에도 연결했다. 선행 입력이 바뀐 제출본의 의견은 계속 기록하되 자동 승인 명령을 계획하지 않는다. 명시적 확정은 이유를 알리며 차단하고, 화면에 입력 갱신 안내와 인계 작업함 링크를 표시한다. 작업 설정을 새 입력으로 바꿔도 제출본 자신의 고정 입력으로 판단한다. 이 판별은 Core helper를 API와 Web이 함께 사용한다. 수정 전 새 회귀 9개 중 6개가 실패했고 정상·수정 요청 3개는 통과했다.

같은 이름의 검수 lane을 서로 다른 적격자로 중복 등록하면 첫 lane의 R 승인 한 표가 S만 적격인 둘째 lane에도 집계되는 결함을 실제 Service·DTO에서 재현했다. 새 정책 입력은 중복 lane을 거절하며, 기존 중복 정책도 새 결정·승인을 허용하지 않는다. 각 lane의 적격자만 승인·veto·수정 요청에 집계한다. 과거 정책과 의견을 삭제하지 않고 무관한 편집을 허용한다. 같은 사용자의 복수 역할을 금지하거나 독립 계정 수·본인 승인 정책을 새로 정의한 변경은 아니다.

직접 검수 링크는 탭을 숨겼다 돌아올 때 같은 페이지의 이미지 요청이 다시 실행되지 않아 빈 화면이 남았고, 숨김 순간 진행 중이던 이미지 요청도 취소하지 않았다. 수정 전 component 회귀 11개 중 이 두 경로가 실패했다. 숨김에서는 요청을 중단하고 objectURL을 폐기하며, 복귀 후 최신 권한 확인이 성공해야 같은 페이지를 다시 요청한다. visibility와 focus 요청이 겹쳐도 복원 의도를 유지하고, 일반 focus·lease 갱신은 기존 이미지를 중복 다운로드하지 않는다. 권한 회수·대상 URL 변경 뒤 이전 이미지는 표시하지 않는다.

| 실제 검증 | 결과와 범위 |
| --- | --- |
| 관련 단위 전체 묶음 | 단일 worker 12 suites·158 tests 통과, 실제 exit 0. 관련 제품·테스트 파일의 실행 전후 SHA-256 동일 |
| 직접 링크 component | 위 묶음에 14개 포함. 초기 7개와 복원·취소·중첩·권한 회수·대상 변경·불필요 다운로드 방지 7개. 이미지 API와 objectURL 경계를 대체한 jsdom 검증이며 실제 PNG decode·브라우저 visibility 실행은 아님 |
| 실제 일반 Auth·쿠키·CSRF·PostgreSQL HTTP | 새 loopback 테스트 DB의 27 tests 통과, skip 0, 실제 exit 0. 16절 회귀와 중복 정책 등록·기존 정책 새 승인 거절 포함 |
| HTTP 원자성·이력 | 거절 전후 전체 프로젝트 GET 동일·해당 실패 mutation receipt 0행. 과거 중복 정책은 격리 PG fixture로만 복원해 검사하고 유효 aggregate를 정확히 되돌림 |
| 정적 검사 | 변경 파일 scoped ESLint·Secretlint와 diff 검사 통과. 기존 대형 DTO는 1,220행 유지 |

HTTP 실행은 Core workflow/review·DTO·API guard·관련 테스트의 시작·종료 hash를 대조했다. 소유 PostgreSQL 정상 정지·상태 코드 3·listener 부재·임시 비밀 파일과 정지한 테스트 DB 파일 삭제를 확인했다. 현재 후보의 Web 코드도 바뀌었으므로 15절의 이전 Canvas 실행과 전체 제품 코드가 같다고 표시하지 않는다. 새 경고의 실제 브라우저 화면·전체 타입·전체 하네스·production build·정상 push·원격 CI는 별도 미실행이며 조정한 검사 순서를 기다린다.

## 19. Kitsu/Zou 공개 소스의 권한·공정 계약 추가 대조

상태: **current — 2026-10-29의 고정 commit 정적 관찰**, 운영 서버 실행은 **미확인**이다. 공식 upstream의 Kitsu `9e83e18a2ccf2d171836be5d2db295378843d53e`와 Zou `fb38353e633ef87976ab390eadddaa223c4295a5`에서 작은 소스 네 개·27,024바이트를 별도 보관하고 Git blob SHA-1·SHA-256·출처·AGPLv3 LICENSE를 기록했다. 제품에 원문을 복제하거나 외부 코드를 실행하지 않았다.

- [Kitsu 상태 선택](https://github.com/cgwire/kitsu/blob/9e83e18a2ccf2d171836be5d2db295378843d53e/src/store/modules/taskstatus.js): 역할과 프로젝트에 따라 선택 가능한 상태를 구분한다. 클라이언트 표시와 서버 인가를 같은 증거로 보지 않는다.
- [Kitsu 공정 자동화](https://github.com/cgwire/kitsu/blob/9e83e18a2ccf2d171836be5d2db295378843d53e/src/store/modules/statusautomation.js): 공정 유형 우선순위에 따른 자동화 선택 제한을 관찰했다. 가져오지 않은 helper와 실제 자동 실행은 미확인이다.
- [Zou 댓글 권한](https://github.com/cgwire/zou/blob/fb38353e633ef87976ab390eadddaa223c4295a5/zou/app/blueprints/comments/resources.py): task action 권한이 없더라도 언급받은 사용자의 댓글을 허용하는 좁은 경로에서는 현재 상태를 그대로 유지해야 한다. 프로젝트 역할·상태 검사와 비관리자의 대리 작성 필드 제한도 source로 관찰했다.
- [Zou 자동화 모델](https://github.com/cgwire/zou/blob/fb38353e633ef87976ab390eadddaa223c4295a5/zou/app/models/status_automation.py): 공정·상태 trigger와 다음 상태·이전 revision 가져오기 설정을 구분한다. 실제 revision 선정·기존 결과 보존 구현은 해당 모델 밖이라 미확인이다.

JavaScript 두 파일 9,597바이트만 REA의 inert 정적 분석으로 선택했다. parent Evidence는 `ev_f8be899fd90cc2b658d87ce70ae49d1b282a223fcf1c7b596c7a6b02fd080abe`, summary는 `ev_c530b562355eeed356860b8f95d8e0d02614c875c98e83814530bfba7809e9ee`다. 2 sources·1,263 AST nodes·parse 실패 0이며 generic findings 26개는 취약점 수가 아니다. graph partial·semantic unknown·미확인 관계 388개를 유지한다. Python 두 파일은 JavaScript 분석 대상으로 바꾸거나 실행하지 않았다.

댓글 참여와 상태 변경 권한의 분리, 공정 자동화와 불변 revision 입력 고정은 서로 다른 계약이다. 이 공개 소스의 선언만으로 경쟁 제품 운영 동작이나 ToonStudio 대비 우열을 판정하지 않는다. 18절의 수정은 ToonStudio 자체의 실제 실패와 회귀·HTTP 결과에 근거한다. C9 production 성능·긴 실제 원고의 정밀 검수·C10 제작팀 납품 파일럿은 계속 남아 있다.

## 20. 긴 원고의 폭 맞춤·확대·이동과 첨삭 좌표

상태: **migration — 2026-10-29, 긴 테스트 원고의 기본 검수 동작 보강**. 원고 전체 높이를 화면에 맞추던 표시식은 800×16000 이미지에서 데스크톱 폭을 31.5px로 제한했다. 긴 페이지는 폭 맞춤으로 열고 전체 보기·확대·키보드 스크롤을 선택하도록 했다. 기존 비교 뷰의 표시 위치 복원 hook을 재사용하며, 이미지·SVG·pointer handler는 같은 내부 stage에 둔다. 확대와 스크롤 값을 정본 좌표에 저장하거나 scroll offset을 이중 보정하지 않는다.

펜·점·영역 입력과 별개인 이동 도구는 완성한 획을 지우지 않는다. mouse grab·touch·wheel로 이동할 수 있고 배율·스크롤·resize 중 미완성 gesture만 취소한다. 저장 의견의 위치 보기는 해당 원고 위치로 viewport만 이동시키며 새 anchor를 저장하지 않는다. 긴 원고의 새 펜 획 기본 굵기와 표시용 pin·outline은 짧은 변을 기준으로 한다. 기존에 명시한 굵기·75점 획·정본 좌표는 다시 계산하지 않는다. 원본 PNG를 축소 저장하거나 다시 렌더링하지 않았다.

실제 Chrome 156.0.8078.48에서 새 800×16000 RGB8 패턴 PNG를 decode하고, 기준 commit `e3c859e90ba6076a00ae8213fcd5341ad85f3a2f`의 annotation·pen 두 파일과 변경본을 같은 공용 contract·CSS·React로 대조했다. 전체 이전 앱 재현이 아닌 component 비교다. PNG는 429,387바이트이며 SHA-256은 `78e7713f5bc36bad8ed3b12191e1e5a84b9add70e179f5de6aa1eeec9423e3d4`다.

| 실제 브라우저 관찰 | 결과 |
| --- | --- |
| 조합 | 기준·변경본 × 1440×900·390×844 × light·dark·contrast, 12개 순차 조합 모두 exit 0 |
| 최초 표시 폭 | 기준 desktop 31.5px·mobile 29.53125px → 변경본 폭 맞춤 1078px·348px. 원본 natural 크기는 모두 800×16000 |
| 좌표 | 중간·하단 pointer, 세로 90% 숫자 입력, 변경본의 200% 확대 뒤 source 좌표 확인. 2 CSS px의 오차와 해당 source px 환산값을 별도 기록 |
| 펜·이동 | 기준·변경본 모두 요청한 pointer sample 75개·정규화 점 75개. 변경본은 3.2px 기본 굵기, 기존 기준은 64px. 변경본의 resize·wheel·touch·mouse grab에서도 선택 JSON 보존 |
| 키보드·저장 의견 | 변경본 Tab→scroll region→PageDown 실제 이동, 하단 저장 의견 노출. 위치 보기의 새 onSelect 0회 |
| 종료 뒤 대조 | 12개 종료 DOM의 anchor·75점·굵기를 입력 직후 Node 관찰과 재대조. 명시한 브라우저 입력 파일 22개·단위 검증 파일 19개 hash 동일 |
| 오류·정리 | 12조합 모두 page error·console error·차단 외부/API 요청 0. 소유 browser/Vite 정상 종료와 5207 listener 부재 확인 |

QA 실행기의 최초 시도는 Playwright CommonJS 해석 오류로 브라우저 시작 전 중단됐다. 다음 시도는 select의 전체 label exact 매칭 때문에 입력 전에 중단됐지만 초기 decode·표시 폭은 관찰했다. 부분 증거를 보존하고 정확히 식별한 소유 headless browser만 정상 종료했으며, Node의 finally에서 서버도 정리했다. 실행기의 CJS·semantic locator를 고친 최종 실행에서 위 12개를 통과했다. 이를 제품 결함 수정 횟수나 자동 재시도 성공으로 바꾸지 않는다.

새 패턴과 source props·저장 의견·선택 JSON은 합성 fixture다. API·DB·일반 계정·댓글 영속 저장·운영 원고·실기기·스크린리더·production p95/메모리 증거가 아니며 `qualified:false`를 유지한다. 실제 Canvas C8 실행은 여전히 15절의 이전 소스를 대상으로 한다.

## 21. 많은 페이지의 검증된 앞부분부터 표시

상태: **migration — 2026-10-29, 전체 목록을 기다리는 UI 경계 보강**. 실제 컴포넌트→실제 cursor loader→실제 graph client에서 HTTP 응답만 제어한 33페이지 회귀는 두 번째 응답을 기다리는 동안 첫 이미지도 표시하지 않아 실제 exit 1이었다. 아직 확인하지 않은 뒷부분을 완전한 검수본으로 취급하지 않으면서, 검증한 앞부분은 먼저 읽도록 바꿨다.

각 batch의 project·work·artifact·review·revision·root hash와 원본 preview manifest의 ordinal·hash 및 응답 mapping tuple을 검사한 뒤 읽기용 prefix를 전달한다. 순번 중복·역행·cursor 순환·다른 원고·잘못된 mapping을 거절한다. 기존 최종 전체 목록 Promise와 오류 경로는 유지한다. 후반 오류·권한 거절이면 앞부분과 관련 링크를 폐기하고, 전체 확인 전에는 핀 작성 링크를 표시하지 않는다. 취소된 세대의 callback·최종 결과와 다음 cursor 시작도 막는다. 이미 시작한 HTTP 소켓의 물리적 취소를 입증한 변경은 아니다.

부분 표시에서 이미지 읽기가 실패한 경우, 정상 suffix 완료 뒤 기존의 한정된 주소 갱신을 한 번 재개한다. 서버의 visibility lease 상한을 클라이언트 시각에 새로 추정하지 않고 기존 만료·bounded refresh 정책을 보존했다. helper와 component 2 suites·56 tests가 통과했으며, 20절 변경·기존 비교 회귀를 함께 묶은 **10 suites·143 tests**도 단일 worker·실제 exit 0으로 통과했다. 33페이지 정상 지연·invalid suffix·403·명시적 retry·subject 취소·clock 차이·manifest/mapping/cursor 실패를 포함한다. 기존 payload fixture의 잘못된 hash·null mapping·임의 cursor는 실제 서버 계약에 맞게 보완했다.

변경 파일 scoped ESLint·Secretlint·하네스 check·diff 검사를 통과했다. 현재 후보의 전체 하네스·타입·production build·정상 push·원격 CI와 실제 500원고 부하·메모리, C10 제작팀 납품 파일럿은 별도 미완료다. PR 준비 범위를 유지하며 main 병합·운영 DB·배포는 실행하지 않았다.

## 22. 선택 이미지 주소 갱신의 불필요한 전체 조회 재현

상태: **migration — 2026-10-29 수정 전 실패 재현·관련 회귀 130개 통과, 전체 게이트 대기**. 20·21절의 143개 테스트와 Chrome 12조합은 동결 후보 `495c2017ecdb998c7a3573a8e3299b060ff250b4` 기준이다. 아래의 미커밋 제품 변경을 그 통과 기록에 포함하지 않는다.

기존 autoRefresh는 한 이미지의 URL 오류·만료에도 전체 고정 원고 목록을 다시 조회했다. 실제 component→cursor loader→graph client에서 HTTP 응답만 제어한 33페이지 회귀 2개를 새로 실행했다. 제품 두 파일이 HEAD와 바이트로 같고 검사 전후 소스 해시도 같은 상태에서 실제 exit 1이었다. 33번째 이미지 갱신이 직전 manifest cursor 대신 null로 시작했고, 첫 이미지 갱신도 후속 cursor를 따라가 초기 2회와 갱신 2회를 합해 4회 요청했다. 나머지 18개는 이름 필터로 선택하지 않았으며 테스트를 skip하도록 수정하지 않았다.

현재 수정 초안은 원본 preview manifest를 정렬해 대상의 실제 직전 ref를 cursor로 사용한다. 서버는 현재 ACL과 고정 subject를 매 요청 검사하며 기존 keyset cursor를 허용한다. 한 batch의 응답 전체를 기존 목록 조회와 같은 shape·subject·manifest·순번·mapping·cursor 검사에 통과시킨 뒤, 대상의 hash·형식·바이트 크기·canonical mapping까지 원래 값과 같아야 URL·만료 시각만 교체한다. 다음 cursor는 이어 읽지 않는다. 한 요청에서도 서버는 최대 32개 URL을 서명하므로 서버가 한 장만 조회·서명한다고 표현하지 않는다.

전체 metadata 완료 전 갱신 금지, source별 동시 요청 제한, 페이지별 한정 자동 시도, 권한 실패 시 이미지·핀 링크 폐기를 유지한다. 재조회·unmount·비교 기준본 변경에는 AbortSignal과 generation·현재 controller 확인으로 늦은 성공·오류를 폐기한다. 실제 HTTP 소켓 중단을 증명한 것은 아니다. 수정 뒤 helper·component·단일 이미지 갱신의 **3 suites·130 tests가 단일 worker에서 실제 exit 0·skip 0으로 통과**했다. 이전 원고 목록·partial·clock·bounded refresh 회귀와 잘못된 subject·manifest·mapping·cursor, 403·404·network, 취소·늦은 성공/오류, await 중 원본 preview 변조도 포함한다. 명시한 입력 7파일의 검사 전후 해시가 같다. 새 lint·전체 게이트·현재 후보 브라우저와 실제 대형 원고 성능은 아직 미검증이다. 수정 전 원문은 `/tmp/toon-c9-targeted-preview-red.log`와 `-exit.json`, 수정 후 원문은 `/tmp/toon-c9-targeted-preview-first-combined.log`와 `-exit.json`에 보존했다.

## 23. 제작팀 정보 없이 진행할 대표 검증 기준

상태: **target — 2026-10-29 사용자 위임에 따른 검증 프로필 결정**. 사용자가 자료 조사와 판단을 위임해, 실제 제작팀 정보 응답을 더 기다리지 않고 [대표 검증 조건](webtoon-collaboration-representative-validation-2026-10-29.md)을 채택했다. 공식 제작 공정·분업 도구 안내·발행 전 체크리스트를 직접 읽고 근거와 가정을 구분했다.

기본은 독립 계정 4개·회차 60컷·주간 마감·검수 2회이며 전부 검증 설계 가정이다. 겸임한 사람의 업무량 합산, 외주 범위·기간, 선화·배경의 병행과 합류, 독립 검수와 납품을 함께 검사한다. 소수 계정과 확장 스튜디오 변형도 정의했다. 업계 평균·모든 플랫폼의 의무·제품 사용량 제한으로 사용하지 않는다. C1–C10의 원래 합격 조건과 실제 사람의 현장 결과가 미확인이라는 사실은 유지한다.

## 24. 대표 흐름에서 추가 확인한 미완료 경계

상태: **target — 2026-10-29 현재 source 대조와 회귀 초안, 새 실행 결과 없음**.

이 절은 추가 구현 전의 조사 기록이다. 이후 실제 red와 소스 구현의 현재 상태는 25절에 기록한다.

새 제출의 자기 역할 배정이 산출물 범위를 포함하는지 검사하는 회귀 6개를 API 테스트에 추가했다. 범위 밖 새 제출 거절, 같은 회차 허용, 프로젝트 전체 producer의 제출 허용, 기존 제출 상태 변경에 대한 소급 금지를 구분한다. 제품 API 코드는 아직 바꾸지 않았으며 이 6개는 미실행이다. 기존 main이 강제하던 규칙의 회귀라고 주장하지 않고 새 제출의 역할 귀속 검증을 추가하는 목표로 다룬다.

빈 프로젝트는 작업·산출물·제출본 없이 시작하며 현재 워크플로 생성은 입력·출력 ref가 빈 task를 만든다. 등록된 Web 검수 요청은 작업 생성·전환이고, 새 Production 제출본을 생성하는 UI producer는 확인되지 않았다. Studio의 submission revision·캡처와 Production 제출본은 서로 다르며 서버 자동 생성 경로도 확인되지 않았다. 기존 원고 연결 화면은 이미 존재하는 제출본만 연결한다. 개요에서 현재 사용자 ID를 해당 화면까지 전달하지 않는 경로도 확인해, 실제 계정과 계정 미연결 party를 혼동하지 않도록 별도 재현이 필요하다.

따라서 기존 API·fixture로 만든 제출본의 검수 성공을 첫 제출·재제출 UI 완주로 확대하지 않는다. [대표 검증 문서 6·7절](webtoon-collaboration-representative-validation-2026-10-29.md)에 실제 원고 ID의 권한 연결, 모든 쓰기 경로의 검사, 빈 프로젝트의 산출물·작업 연결·새 제출을 한 transaction으로 만드는 좁은 명령, ACK·미확인 쓰기 복구의 구현 기준을 기록했다. 컷별 원고 쓰기 격리와 첫 제출 UI는 아직 구현 완료로 판정하지 않는다.

실제 Overview → Management → Studio 원고 연결 컴포넌트를 유지한 현재 사용자 귀속 회귀 2개도 추가 작성했다. 다른 연결 계정·현재 연결 계정·미연결 외부 party를 함께 두고 정확한 현재 역할 ID를 기대하며, 사용자 ID가 없으면 명령을 보내지 않아야 한다. Overview → Management → Workspace의 사용자 ID 전달과 빈 ID 역할 선택 거절을 소스에 반영했고, 기존 양성 fixture도 연결된 계정·정확한 역할 ID로 교정했다. 이 2개와 API 6개는 미실행 초안이다. API 범위 검사 제품 코드는 아직 바꾸지 않았으며 기존 미리보기 130개 통과에 합산하지 않는다. 첫 제출의 서버 검증에는 별도 namespace의 Graph 원고를 실제 `workId`로 대조하는 같은 transaction의 source proof와, 현재 bridge의 목록 정렬 순위로 대신할 수 없는 revision 번호·lineage 권위를 먼저 정해야 한다.

후속 읽기 조사로 일반 commit·restore의 불변 `studio_operation.sequence`와 완료 영수증을 새 provenance 좌표에 활용할 수 있는 방향을 확인했다. 최초 저장·캡처의 세 단계 원고 연결에는 별도 증명이 필요하고, 클라이언트의 `operationLast`나 연결 없는 저장본을 임의의 최초 버전으로 대체하면 안 된다. lineage는 Graph 원본 재명명이 아닌 명시적인 Production 문서 역할의 업무 투영으로 정의할 수 있다. strict 응답의 버전 호환과 새 정책을 사용하는 selector·reader를 함께 구현하고 기존 참조를 보존해야 한다. 이는 실제 source에 근거한 다음 구현 기준이며, 새 API·저장 계약·전체 UI 완주 검증 완료가 아니다.

실제 Canvas 저장은 CreatorWork 문서·revision을 기록하며 generic Graph artifact 생성·commit의 Web caller는 확인되지 않았다. 실제 capture가 만드는 review artifact도 프로젝트 범위여서 회차 산출물의 현재 이미지 검수 범위를 채우지 못한다. 첫 제출에서는 저장된 capture와 페이지·프레임을 작업에 명시적으로 연결하고 서버가 고정 원고와 mapping을 검사하는 경로부터 이어야 한다. 존재하지 않는 generic 회차 원고를 고르게 하거나 Graph scope를 전역 완화하는 방법으로 이 공백을 숨기지 않는다.

## 25. 실제 캡처를 사용하는 첫 제출 소스 초안과 범위 회귀

상태: **migration — 2026-10-29 미커밋 소스, API 권한 21개·순수 Core 54개 통과, 나머지 경계·통합 검증 대기**.

2026-10-29 후속 사용자 확인으로 최종 작업 범위는 **검증 후 main 병합까지**다. 이전 PR 준비 전용 제한은 이 지시로 대체됐다. 운영 배포·운영 DB·시크릿·DNS 변경은 하지 않는다. 아래 구현은 아직 검증·커밋·PR 통합 전이므로 병합 완료로 기록하지 않는다.

`submit-task-output` 계약·순수 Core·공개 DTO·서비스·repository·작업 상세/단일 카드 진입 UI를 연결하는 초안을 작성했다. UI는 실제 저장된 검수 캡처의 전체 페이지 목록을 검증하고 원고 이미지와 페이지·프레임을 명시적으로 선택한다. 작업의 최초 기준 원고, 현재 고정 입력, 선행 작업의 최신 승인 출력은 별도로 고른다. 산출물 정의·작업 출력 연결·새 제출·현재/승인 포인터·원고 사용 근거를 기존 단일 transaction·strict CAS·mutation 영수증 경계 안에서 함께 구성한다.

서버 초안은 현재 소유권·멤버십을 잠근 뒤 같은 transaction에서 캡처의 공유 증명 쿼리, 완료 영수증, 원본 checkpoint→submission→review snapshot chain, 이미지 manifest·검사 상태·작품 객체 소유와 saved page/frame mapping을 대조한다. 별도 DB 연결의 사전 조회나 클라이언트가 보낸 원고 사용 근거를 신뢰하지 않는다. 기존 pg 경로와 새 Drizzle 경로가 동일한 parameterized 증명 쿼리를 공유하도록 추출했고, 배열 인자는 `sql.param`으로 유지한다. 실제 PostgreSQL 실행 검증은 아직 필요하다.

새 업무 원고 참조는 실제 snapshot ID·digest와 CreatorWork의 검증된 `sourceServerRevision`을 사용한다. `captureSequence`는 별도 증명 좌표다. 같은 원고의 다른 페이지를 두 작업이 쓰는 경우를 구분하도록 실제 Production 제출 ID인 optional `productionSubmissionId`를 추가했다. 최신 입력·출력·검수 및 불변 검사, 일반 상태 변경의 호환 보존, 업무 원고 조회와 비교 선택에도 이 구분을 연결했다. 새 근거는 `sourceEvidence.version=1`로 저장하며 레거시 참조·원본 Graph scope·이미지 mapping을 덮어쓰지 않는다.

새 제출 뒤 과거 승인 링크만으로 회차 원고가 준비됐다고 표시되거나 같은 역할의 출력 일부만 승인됐는데 역할 전체가 승인된 것으로 집계되는 경로도 보강했다. 현재 제출/승인 포인터와 실제 제출 상태·버전·링크를 모든 해당 산출물에서 확인한다. 과거 링크와 이력은 보존하며 나중에 종료한 담당자의 이미 확정된 승인을 소급 무효화하지 않는다. 이 변경도 아직 실행 검증 전이다.

별도 허용된 API 범위 회귀 1회에서는 6개 선택 중 **1개 실패·5개 통과**, actual exit 1·timeout false·1.896초를 기록했다. 좁은 회차 역할의 신규 범위 밖 제출이 예외 없이 허용됐다. 15개는 `-t` 필터로 미선택됐으며 새 skip을 추가하지 않았다. HEAD는 `495c2017ecdb998c7a3573a8e3299b060ff250b4`, 명시한 19입력 파일의 전후 해시가 같았다. `/tmp/toon-collaboration-submission-scope-red-20261029.log`와 `.json`에 원문을 보존했다. 실패 위치의 source-map 줄 표시는 다른 줄을 가리켰으나 테스트 이름과 예외 미발생 assertion은 해당 신규 회귀였다. 이후 `assertProductionSubmissionActor`에 신규 제출 범위 검사만 추가했다.

별도로 허용된 수정 후 실행 1회에서 같은 API 단일 파일의 **21개 전체가 통과**했다. `--maxWorkers=1 --fileParallelism=false`, actual exit 0·timeout false·2.126초이며 skip은 없다. HEAD는 같은 `495c2017ecdb998c7a3573a8e3299b060ff250b4`이고 수정은 미커밋 상태다. 명시한 19입력 해시와 Git 변경 목록이 전후 동일하며 소유 process group이 남지 않았음을 실행기 기록으로 확인했다. `/tmp/toon-collaboration-submission-scope-green-20261029.log`와 `.json`에 보존했다. 이 결과는 신규 제출 범위와 기존 승인 API의 해당 21개 회귀에 한정하며 아래의 새 첫 제출·UI·DB 기능 통과로 확대하지 않는다.

이후 별도 자원 창의 단일 실행에서 순수 Core `task-output.test.ts`·`studio-revision-coverage.test.ts` **2 suites·54 tests가 전체 통과**했다. 단일 worker·actual exit 0·skip 0·timeout false·2.621초, 같은 HEAD+미커밋 변경 기준이다. 명시한 21입력 해시와 변경 목록이 전후 같고 소유 process group 종료를 기록했다. `/tmp/toon-collaboration-first-output-core-first-20261029.log`와 `.json`을 보존했다. 원자적 후보 생성·입력 귀속 분리·종료 task 거절·현재 출력 전체의 승인 집계에 대한 단위 결과이며, 캡처 증명의 실제 DB 실행과 Web 완주 결과는 아니다.

다음 허용 창에서는 공개 제출 DTO·명령·캡처 증명·저장소 대역·공유 캡처 subject·source mapping의 **6 suites·110 tests가 전체 통과**했다. 단일 worker·actual exit 0·skip 0·timeout false·7.248초이며 시작과 종료 HEAD는 같은 `495c2017ecdb998c7a3573a8e3299b060ff250b4`였다. 명시한 39입력 해시와 변경 목록이 전후 같고 소유 process group 종료를 확인했다. `/tmp/toon-collaboration-first-output-api-first-20261029.log`와 `.json`에 보존했다. 저장소는 DB 대역을 사용했고 실제 DB 주소는 연결 불가능한 loopback으로 고정했으므로 실제 PostgreSQL·HTTP 증거가 아니다. 이 실행 뒤 아래 26절의 정책·제한 편집 소스를 추가하고 있어 현재 전체 후보의 green으로 확대하지 않는다.

새 기능의 Core·DTO·source proof·명령·선택 UI·reader·복구 회귀는 초안 작성 상태다. 기존 130개 통과 이후 공통 reader와 이미지 표시도 변경했으므로 그 결과를 현재 후보의 통과로 사용하지 않는다. 전체 타입·하네스·production build·실제 HTTP/DB·브라우저·성능·현장 완주, 정상 커밋·push·원격 CI·실제 PR 등록은 아직 미완료다. 현재 main 병합·운영 DB·배포는 실행하지 않았다. 사용자 후속 확인에 따라 검증과 정상 PR을 통과한 뒤 main 병합을 진행한다.

후속 독립 소스 검토에서는 기존 프로젝트 생성의 작품→제작 프로젝트 잠금과 새 제출의 반대 순서가 충돌할 수 있음을 확인했다. 새 제출만 잠금 없는 작품 ID 힌트→작품·본인 멤버십 잠금→제작 프로젝트 잠금 후 재조회로 맞추고, 잠근 현재 행의 작품이 힌트와 다르면 중단한다. 힌트를 권한 근거로 쓰지 않으며 현재 ACL·영수증·CAS와 원고 증명 순서를 보존한다. 이는 실제 PostgreSQL 교착 재현·해소 검증 전의 수정이다.

캡처 preview는 공개 Studio ID의 `/`·`@`를 허용하지만 제출 DTO와 공유 캡처 증명이 좁은 댓글·인계 참조 스키마를 재사용하던 불일치도 고쳤다. focused 캡처 subject 계약을 세 경로에서 함께 사용하고, 레거시 댓글·인계 참조 계약은 유지한다. 관련 양성·잘못된 tuple 음성과 잠금/현재 권한/영수증 회귀는 아직 미실행 초안이다.

조건부 승인·승인·완료·취소·범위 밖 작업은 새 제출만으로 승인 포인터를 해제할 수 없도록 Core의 좁은 명령에서 거절한다. 승인 작업은 기존에 허용된 변경 요청 전환을 먼저 수행하고, 종료된 작업은 필요에 따라 후속 작업을 만든다. 작업 상태를 자동으로 바꾸거나 종료 작업에 없는 다시 열기 동작을 있다고 안내하지 않는다. 새 원고의 저장 버전도 제출 차수와 혼동하지 않도록 `원고 vN`으로 표시했다. 이 상태·표시 수정 역시 실행 검증 전이다.

미확인 저장이 session의 원래 영수증으로 복구된 뒤 Dialog가 이미 저장된 제출 ID를 새 mutation으로 다시 생성할 수 있는 소스 결함도 보완했다. 모달 안의 저장 상태 확인을 실제 session refresh에 연결하고, 원래 입력·고정 원고·페이지/프레임·업무 제출 ID·작업 출력 연결이 일치한 실제 aggregate를 확인하면 추가 쓰기 없이 닫는다. 같은 ID만 있고 근거가 모호하면 원래 본문을 보존하고 새 쓰기를 막는다. 배정 표시도 최초 시각 고정 대신 실제 시작·종료 경계와 focus 복귀에서 갱신하며, 같은 계정·작업의 기간 만료나 종료 상태 때문에 열린 초안을 즉시 버리지 않는다. 실제 Dialog·session·API 함수에서 HTTP만 제어한 복구 회귀와 기간 회귀는 작성했으나 아직 실행하지 않았다.

필수 CI의 실행 선택자도 읽기 대조했다. 기존 Graph unit 디렉터리 선택자는 보존하고, 누락된 협업 API·Core·정본 펜 회귀를 명시 목록에 추가했다. 캡처 원본·펜 첨삭·인증 HTTP 통합 3개는 DB 없는 shard에서 제외하고 기존 필수 PostgreSQL job이 실행하도록 양쪽 목록을 맞췄다. runner·timeout·기존 필수 검사는 유지한다. 실행 선택자의 누락·중복을 보호하는 회귀를 작성했으나 CI 등록 변경 자체의 테스트와 원격 CI 실행은 아직 검증 전이다.

main 통합 읽기 감사는 로컬 `origin/main=4fbeadb9a16707efe94d64756d7a0a8cdda4af31`에서 새 migration 충돌을 확인했다. main의 `0114_studio_ai_premium_route_ledger.sql`과 협업 브랜치의 `0114_studio_review_comment_pen_strokes.sql`은 관리 manifest의 같은 순번을 차지한다. 실행기는 번호 중복과 순번 공백을 거절하므로 두 파일을 그대로 합치는 것으로 통합을 완료할 수 없다. main의 기존 migration을 보존하고 미병합 펜 migration을 통합 시점의 다음 빈 번호로 이동하며 manifest·시험 DB 준비·회귀·문서 참조를 함께 맞춰야 한다. 아직 이동·main 통합·운영 DB 적용은 실행하지 않았다. 이 main의 Canvas·CI·번들 출처 변경도 보존한 뒤 최종 후보를 다시 검증해야 한다.

## 26. 빈 프로젝트 검수와 실제 원고 제한 편집의 잔여 구현

상태: **migration — 2026-10-29 실제 소스 경로 감사 후 추가 구현 중, 새 정책·제한 편집 검증 전**. 사용자는 미완료 항목 전체의 구현을 요청했다. 최종 범위는 검증 후 main 병합까지이며 운영 배포·운영 DB 변경은 하지 않는다.

빈 Production aggregate는 검수 정책이 없고, 기존 Web에는 이를 저장하는 실제 producer가 없었다. 기존 검수 요청 폼도 새 작업을 입력·출력 없이 곧바로 `internal-review`로 만들어 현재 서버의 작업 안전 검사에 거절된다. 검수 작업대에는 현재 계정의 역할 ID가 전달되지만, 자기 역할 여러 개 중 하나를 자동 선택해 다른 자격 lane을 선택하기 어려운 공백도 확인했다. 정책 관리 UI, 실제 제출 작업의 합법적인 검수 요청, 자기 역할 선택을 함께 보완하고 있다. 서버의 상태·원고·권한 검사를 낮추는 방법으로 처리하지 않는다.

신규 정책은 독립 계정 인원 기준 정족수를 지원한다. `quorumBasis`가 없는 기존 정책의 역할표 의미는 보존하고, 새 UI 기본값은 계정 기준으로 구성한다. 새 결정의 계정 ID는 서버가 실제 actor로 기록하며, 다른 계정 ID 주장과 기존 결정 ID 덮어쓰기를 거절한다. 계정 기준에서는 같은 계정의 여러 역할을 여러 인원으로 세지 않고, 계정 증명이 없는 과거 표를 임의의 인원으로 추정하지 않는다. 과거 확정 승인 이력은 재작성하지 않는다. 이 계약·UI·회귀는 구현 중이며 새 실행 결과는 아직 없다.

대표 검증 문서 6절의 실제 페이지·프레임 제한 편집은 Production의 역할 배정과 별도 기능이다. 공동 REST 저장, JSON·binary CRDT, 별도 stroke op 저널, generic Graph 생성·commit·restore는 현재 작품 단위 `edit`가 권위이며 원고 사용 근거만으로 제한 편집을 제공하지 않는다. 새 capability와 명시적 귀속 registry, 실제 변경 전후를 검사하는 공통 admission을 모든 durable writer에 연결하는 구현을 진행하고 있다. 기존 전체 editor 권한을 배정표만으로 축소하지 않으며, 제한 권한을 전체 `edit`로 승격하지 않는다.

현재 Authoring 요소에는 영속적인 frame parent ID가 없고 기하 관계·그룹 이름만으로 귀속을 추정하는 경로가 있다. 권한 registry에는 관리자가 실제 저장 ID와 작업·역할을 명시적으로 연결하고, 새 객체는 서버가 실제 생성 diff와 요청의 생성 대상을 대조해 귀속을 기록해야 한다. 공유 raster, 기존 객체의 이동·삭제·귀속 변경, CRDT의 숨은 후보와 뒤늦은 causal activation, opaque 전체 Graph 복원까지 포함해야 한다. 이 연결과 실제 반례 검증이 끝나기 전에는 원고 제한 편집을 완료로 표시하지 않는다.

## 27. 검수 정책 실행과 제한 편집의 추가 연결

상태: **migration — 2026-10-29 소스 구현 중, 최종 후보 검증·병합 전**.

검수 정책의 Core·API 네 파일을 단일 worker로 실제 실행해 59개가 통과했다(actual exit 0, skip 0, 5.394초). 시작·종료 HEAD는 `495c2017ecdb998c7a3573a8e3299b060ff250b4`이고, 명시한 47개 입력의 해시와 변경 목록이 실행 전후 동일했다. 이 결과는 정책·계정 정족수·결정 도용 방지의 단위 검증이며 실제 PostgreSQL이나 Web 완주의 증거가 아니다. 이후 비활성 party의 신규 제출·승인 거절과 제한 편집 코드를 추가했으므로 59개를 현재 전체 후보의 통과 수로 재사용하지 않는다.

검수 Web의 정책 모델·정책 편집기·검수 요청 모델·요청 폼·실제 actor 역할 선택·검수 작업대 여섯 파일도 별도 실행에서 35개가 통과했다(actual exit 0, skip 0, wrapper 8.15초). 같은 HEAD에서 명시한 66개 입력의 해시와 변경 목록이 전후 동일했고 소유 process group 종료를 확인했다. jsdom·대역을 사용한 검증이며 실제 HTTP·DB·독립 브라우저 완주나 이후 제한 편집 코드의 통과로 합산하지 않는다.

제한 편집은 안정적인 원고 객체 귀속과 현재 공정 배정을 분리한다. 최초 등록 task와 원고 근거는 보존하고, grant의 현재 task·assignment·계정·기간·범위를 검사해 선화 완료 후 같은 원고를 다음 공정에 인계할 수 있도록 구성한다. 작업자의 새 객체와 undo 복원은 실제 ID를 현재 target에 명시하며 다른 객체의 귀속을 바꾸는 요청은 허용하지 않는다. 전체 editor의 기존 권한과 제한 작업자의 purpose 권한은 별개로 유지한다.

Production 첫 제출에도 선택적 `writeContext`를 연결했다. 같은 transaction 안에서 공통 작품 잠금, 현재 멤버십·공정·정책, 불변 캡처 chain과 실제 담당 ID를 확인하고 `submission` 목적 영수증을 기록한다. 제한 작업자의 응답 재전송도 현재 권한을 먼저 검사하며, 일반 명령이나 Graph 전체 편집 권한으로 확대하지 않는다. 이 연결과 관련 새 회귀는 실행 전이다.

다각형 컷은 프레임 배경만 다각형이고 자식 클립은 사각형이던 간격을 보완했다. 런타임 중립의 실제 클립 경로를 Konva 일반·격리 합성, Skia, SVG 일반·지우개, PSD 개별 노드 캡처가 함께 소비한다. 로컬 점은 문서 좌표로 한 번만 옮기고, 잘못된 점을 넓은 사각형으로 대체하지 않는다. registry 소유권을 기하로 추정하는 기능은 추가하지 않았다. 새 공용 경로·내보내기·GPU 회귀 초안과 필수 CI 등록을 추가했으며, 실제 렌더 픽셀·전체 게이트 검증은 남아 있다.

후속 실제 브러시 경로에서는 전체 원고 크기의 canonical PNG가 크기 기반 컷 선택을 통과하지 못하는 공백을 확인했다. 명시적 `frameClipId`로 실제 컷 경로를 연결해 원본 PNG의 크기·해상도·바이트를 유지하며, 자동 맞춤으로 파생 이미지를 재축소하지 않는다. 이 필드는 registry의 소유권이나 현재 grant를 대신하지 않는다. 다른 페이지에서 같은 레이어 ID를 사용하는 경우도 실제 `(pageId, groupId)` 복합 식별자로 구분하고 원래 ID는 보존한다. 해당 클라이언트·서버·회귀의 최종 실행은 남아 있다.

WriterRoom의 콘티 적용 버튼은 실제 페이지 생성·저장으로 연결돼 있다. 다만 `story` 역할로 선택한 저장 캡처를 검수할 때 고정 `sourceSnapshot.writerRoom` 본문을 읽는 화면이 없어 순수 대본은 빈 페이지 이미지에 머무를 수 있다. 기존 최초 제출 producer를 유지하면서 같은 불변 캡처의 원고·영수증·해시를 검증한 고정 본문 reader를 추가하는 범위로 보완한다. 현재 편집 중인 대본이나 최신 원고로 대체하지 않는다. 이 보완은 대표 검증의 기획·대본 단계에 포함하며, 새 댓글 anchor나 검수 권한 완화로 해결하지 않는다.

## 28. 소스 동결 후보와 실제 다각형 회귀 결과

상태: **migration — 2026-10-29 추가 소스 구현 종료, 종합 검증·main 통합 전**. 제한 편집의 관리·모든 영속 writer·Canvas 입력·같은 ID의 자기 Undo/Redo·초안 저장·캡처·제출, 고정 WriterRoom reader와 마지막 응답 유실 복구 소스를 동결 후보로 모았다. 신규 C2 API·Web·실제 HTTP producer suite는 아직 실행 전이다.

다각형 관련 여섯 파일의 첫 실제 실행은 67개 중 66개 통과·1개 실패였다(actual exit 1, skip 0, 6.443초). 실패는 새 전체 크기 PNG fixture에 `ImageEl.rotation` 필수 값을 빠뜨려 Skia의 기존 유한 숫자 검사가 거절한 것이었다. 제품 guard와 `supported:true`, 원본 크기·실제 clip 단언을 유지하고 fixture를 `rotation:0`·명시적인 `El` 타입으로 보정했다. 다음 단일 Skia 파일 실행은 36개 모두 통과했다(actual exit 0, skip 0, 2.577초). 두 실행 모두 HEAD `495c2017ecdb998c7a3573a8e3299b060ff250b4`와 명시한 89개 입력·변경 목록이 전후 동일했고 자기 process group 종료를 확인했다. 보정 파일 외 나머지 88개 입력도 native hash 비교로 같았다. 최초 실패 로그를 그대로 보존했으며, 전체 후보·실제 브라우저 픽셀의 통과로 확대하지 않는다.

저장 결과가 불명확할 때 최초 wire 본문·mutation ID·base revision·CRDT fence·원래 grant를 같은 계정·작품의 SQLite/OPFS 대기에 보존한다. 다시 열기나 reload는 그 원문만 확인하며 새 버전·배정·UUID로 바꾸지 않는다. 서버의 정확한 ACK 뒤에도 다른 로컬 내용이나 부분 저장에서 제외한 초안이 있으면 전체 intent·autosave를 정리하지 않는다. 권한 회수 후에는 검증된 기존 대기 요청의 명시적 상태 확인만 열고 새 저장과 자동 재전송은 허용하지 않는다.

제한 작업자가 전체 editor로 승격된 경우도 원래 성공 영수증을 먼저 읽는다. 현재 계정의 과거 scoped grant 이력이 있는 경우만 복구 확인을 요구하고, 서버가 이력이 없다고 확인한 기존 full 사용자의 저장에 SQLite 의존성을 추가하지 않는다. 정책 준비 상태 unknown과 조회 오류를 이력 없음으로 추정하지 않는다. 정책의 소유 ledger도 검증을 마친 뒤 원자적으로 반영한다. 이 마지막 C8 보완의 단위·실제 DB·브라우저 검증은 다음 동결 후보 검증에서 수행한다.

## 29. 불투명 Y 변경의 실제 회귀와 빈 제작 프로젝트의 시작 경로

상태: **migration — 2026-10-29 생성·역할 UI를 추가하고 보완한 당시의 실행 이력. 후속 실제 통과와 통합 보정의 현재 상태는 30절에 기록한다**.

제한 CRDT 쓰기의 실제 단위 실행에서 미등록 runtime root 변경이 빈 변경으로 승인되는 실패를 재현했다. Yjs의 원격 root는 `AbstractType`일 수 있으며 `toJSON()`이 `undefined`를 반환해 기존 전역 비교에서 사라졌다. 타입을 임의로 선언하지 않고 실제 Item·삭제·중첩·format·경합 후보의 상태를 비교하도록 보완했다. `__proto__` 이름, client 수신 순서와 인접 Item 병합, 정상 담당 ink 채널의 GC, 동일 update 재전송도 구분한다. 공통 validated probe와 실제 서비스 경계에 적용했으며 기존 의미·인과·byte budget과 runtime GC 설정은 유지했다. 명시 291개 입력이 전후 같았던 재실행은 **11 suites·84 tests 통과, exit 0, 9.451초**였다. 시작·종료 HEAD는 `495c2017ecdb998c7a3573a8e3299b060ff250b4`이며 실제 DB·HTTP·브라우저 증거는 아니다.

다음 Web 23파일 실행은 **2 suites 통과·1 suite 실패, 38 tests 통과·1 실패 뒤 중단, exit 1, 4.756초**였다. 보고된 56개 수집과 아직 실행하지 않은 파일을 전체 통과로 계산하지 않는다. 이 실행의 297개 입력과 변경 목록도 전후 같았다. 첫 실패는 성공 경로의 시험 원고 폭 800과 실제 Studio 논리 폭 720의 차이를 부분 저장 보호가 감지한 것이었다. 해당 suite의 성공 fixture만 실제 폭으로 맞추고, 실제 폭 차이가 있을 때 기기 ACK·전체 초안 정리를 하지 않는 음성 회귀를 추가했다. 공용 검수 fixture와 제품 보호, 원래 성공 기대는 유지했다. 이 보정 이후의 새 Web 실행은 아직 수행하지 않았다.

실제 UI 흐름을 대조하면서 저장된 작품의 Production 프로젝트 생성과 계정이 연결된 참여자·공정 역할 설정이 API에만 있고 Web producer는 없는 시작 경계를 추가로 확인했다. 저장된 자기 작품을 선택해 현재 owner 권한으로 명시적으로 프로젝트를 만들고, 관리자가 실제 작품 초대를 수락한 계정에 역할·범위·기간을 배정하는 화면을 연결했다. 생성 원문·ID는 기존 SQLite에 readback 확인 후 보존하며, 역할 설정은 기존 원문 복구 queue를 사용한다. 전체 역할 배열은 읽었던 revision에 고정해 대기 중 다른 변경을 새 revision으로 덮지 않는다. 기존 당사자·계약·크레딧·결정권·헌장과 원고 ACL을 보존하며, 프리셋 체험이나 작품 저장에 자동 생성 side effect를 넣지 않는다. 이 새 UI와 관련 회귀는 소스 반영 상태이며 실행·브라우저 완료로 표시하지 않는다.

새 화면을 포함한 Web 31파일 첫 검증은 역할 Editor 시험의 미등록 DOM matcher에서 중단됐다. 실제 결과는 1통과·1실패 후 중단이며 나머지 선택 파일은 미실행이다. 기존 저장소의 native DOM 단언으로 시험 파일만 보정했다. 독립 소스 검토에서는 새 역할 명령의 미확인 원문이 reload 첫 GET 뒤 focus·online·visibility·30초 timer·BroadcastChannel에서 자동 POST되는 경로를 확인했다. 원래 요청이 서버에 도달하지 않았던 경우 이 POST는 단순 조회를 넘어 실제 역할을 변경하므로, 화면이 약속한 명시적 저장 상태 확인과 맞지 않는다. 역할 명령에 한해 자동 갱신은 최신 GET과 이미 확인된 ACK의 버전 검증을 계속 수행하고 미확인 원문을 보존한다. 원문 재전송은 기존 저장 상태 확인 버튼에서 동일 본문·UUID·기준 버전으로만 수행한다. 다른 명령의 기존 복구 계약과 서버 idempotency·CAS는 유지했다. 이 보완과 자동 갱신 5경로 회귀는 재검증 전이다.

최종 범위는 검증 후 main 병합까지다. 전체 타입·하네스·architecture·production build·실제 로컬 DB·독립 계정 UI·C9 원시 성능·C10 사람의 현장 결과, 정상 커밋·원격 CI·PR·main 통합은 별도 증거로 확인한다. 운영 배포·운영 DB·환경변수·DNS·결제 변경은 수행하지 않았다.

## 30. 실제 Web 전체 회귀와 메인 통합의 구조 보정

상태: **migration — 경로·migration 번호 보정과 정상 훅 보완 당시의 실행 이력. 2026-10-30 정상 기능 커밋과 최신 메인 통합 후보는 31절에 기록한다**.

고정 대본 Reader의 첫 실제 실행은 잘못된 Graph project ID를 가진 transport fixture가 strict 검수 링크 검사를 통과하지 못해 중단됐다. 실제 Graph schema와 원고 선택 producer의 식별 계약에 맞는 로컬 정상 fixture를 사용하고, Reader는 링크를 Promise의 오류 처리 안에서 먼저 검증하도록 고쳤다. 잘못된 pin은 명시 오류로 수집하며 본문이나 고정 검수 링크를 그리지 않는 음성 회귀를 추가했다. 기존 7단계·60컷·여러 문단·고정 tuple·계정 전환 후 늦은 응답 검사는 유지했다. strict parser·공용 transport fixture·API를 완화하지 않았다.

이 보완까지 포함한 323개 입력의 실제 실행은 **32파일·236 tests 통과, actual exit 0, timeout 없음, 29.911초**였다. HEAD는 `495c2017ecdb998c7a3573a8e3299b060ff250b4`이며 입력·변경 목록이 전후 같고 실행 process group 종료를 확인했다. 이 결과는 HTTP를 mock한 Web 회귀와 순수 계약 시험이며 실제 DB나 독립 브라우저 4계정의 제작 완주를 증명하지 않는다.

같은 입력의 후속 정적 실행은 QA MJS 9파일의 `node --check`가 모두 통과했고, CI Node 계약 46개 중 44개 통과·2개 실패였다. 실제 exit 1, timeout 없음, 1.277초이며 입력과 실행기 전후 해시가 같고 process group 종료를 확인했다. 두 실패는 실제로 `creator/live/`에 있는 transform 회귀 13개를 과거 creator 직하 glob으로 찾던 필수 선택자의 경로 오류였다. 테스트를 삭제하거나 필수 실행 검사를 낮추지 않고 실제 경로로 고쳤다. 이 변경의 재실행은 아직 수행하지 않았다.

메인의 creator 직하 파일 예산을 유지하기 위해 새 제한 편집 모듈 25개를 기존 `studio-collab/`으로, 고정 대본 capture client와 시험 2개를 기존 `writer-room/`으로 옮겼다. 내부·외부 import, type import, mock, dynamic import와 CI 필수 Web 선택자 11개를 함께 갱신했다. root facade나 예산 증가는 추가하지 않았고, 기존 oversize 소비자의 줄 수도 유지했다. 앞의 32파일 통과는 이동 전 입력의 이력이며 이동 후 통과로 재사용하지 않는다.

메인의 AI migration 0114·0115와 번호가 충돌하지 않도록 이 변경의 펜 원고 migration을 `0116_studio_review_comment_pen_strokes.sql`, 담당 범위 정책 migration을 `0117_studio_scoped_write_policy.sql`로 옮겼다. SQL 2개의 내용은 번호 변경 전후 SHA256이 같고 manifest·시험 DB 준비·현재 실행 source의 참조를 갱신했다. 앞선 이력이 사용한 0114·0115 이름은 당시 실행의 기록으로 보존한다. 현재 작업 브랜치에 없는 메인의 AI migration은 정상 main 통합에서 함께 보존해야 하며, 원격 DB에는 적용하지 않았다.

위 경로·번호 보정 뒤 명시 341개 입력으로 다시 실행한 Web 검증은 **32파일·236 tests 통과, actual exit 0, timeout 없음, 27.830초**였다. 별도 정적 검증도 **QA MJS 9파일 구문 검사와 CI Node 계약 46개 모두 통과, actual exit 0, timeout 없음, 1.275초**였다. 두 실행의 HEAD는 `495c2017ecdb998c7a3573a8e3299b060ff250b4`였고 각 입력·변경 목록이 전후 같으며 실행 process group 종료를 확인했다. 앞의 정적 실패와 이동 전 결과도 당시 이력으로 보존한다.

다음 정상 기능 커밋은 실제 pre-commit의 ESLint 오류 21건으로 중단됐다(actual exit 1, timeout 없음, 23.836초). 하네스·lockfile 검사는 통과했지만, lint-staged가 변경을 원복했으며 기능 커밋이나 main 병합은 생성되지 않았다. 누락된 hook 의존성·시각 snapshot·cleanup 세대 fence, 제어 문자 정규식 표기·오류 cause·미사용 식별자를 최소 보완했다. 기간 snapshot은 기존 `studio-collab/`의 공용 훅을 사용해 Studio에서 Production 화면의 eager import가 늘지 않도록 했다. 실제 저장·제출 직전의 현재 시각·계정·서버 권한 검사와 원문·ACK 경계는 유지한다. 이 lint 보완 뒤에는 소스가 달라졌으므로 앞의 Web·정적 통과를 보완본의 통과로 재사용하지 않는다. 정상 훅과 영향 회귀의 재검증은 아직 실행 전이다.

실제 UI 인증·60컷 입력·서버 저장·제작 프로젝트 생성과 C9 원시 계측의 임시 실행 소스는 준비 단계다. 신규 G2 UI driver와 C9 관측기는 위 9파일 구문 검사에 포함하지 않았고 아직 실행하지 않았다. 로컬 관측을 운영 사용자의 INP나 모집단 percentile로 해석하지 않는다. Event Timing의 16ms 관측 하한과 INP의 페이지 생명주기 범위는 [Chrome의 공식 INP 설명](https://web.dev/articles/inp)을 따른다. 실제 production artifact·서버 데이터·이미지 bytes·현재 권한·기능 완료를 함께 검증하기 전에는 C9 완료나 시장 최상위 성능을 선언하지 않는다.

메인 통합의 다음 필수 증거는 통합 보정본의 기존 32파일 회귀·정적·타입·하네스·구조 검사, 실제 계정 권한·REST 경계의 로컬 PostgreSQL 통합 검사, 정상 커밋과 원격 필수 CI·PR·main 병합이다. 운영 배포는 이번 범위에서 제외한다. 4UID·60컷과 원시 성능 관측은 대표 팀을 모르는 상황에서 이 작업이 선택한 통제 검증 계획이며, 사용자가 별도로 지정한 인원 수·성능 SLO가 아니다. 실제 3계정 API 권한 검사와 아직 실행하지 않은 4계정 브라우저·운영 성능·사람의 현장 결과를 각각 구분해 기록한다. 준비 소스를 실행 결과로 승격하거나 새 계측 프레임워크의 완성을 main 병합의 추가 요건으로 삼지 않는다.

## 31. 정상 기능 커밋과 최신 메인 통합 후보

상태: **migration — 2026-10-30 기능 커밋 생성, 최신 메인의 충돌 소스 해결 후 통합 검증·merge commit·PR·main 병합 전**.

담당 역할 선택을 같은 파일의 최상위 React 컴포넌트로 분리했다. 이 컴포넌트는 표시 문자열과
선택 ID·옵션·선택 callback만 받고 실제 선택 이벤트의 시각을 부모로 전달한다. 부모의 역할
조회·미래 역할 예약·시작 시각 올림·종료 시각 설정과 서버 권한은 유지한다. 화면을 연 뒤
5분 후 선택하고 30초 뒤 제출해도 선택한 기간을 다시 쓰지 않는 회귀를 추가했다.
이 344입력의 targeted ESLint와 Panel 6개 시험은 **exit 0, timeout 없음, 5.125초**였고
입력·변경 목록이 전후 같으며 실행 process group 종료를 확인했다.

이어 실제 정상 훅의 하네스·lockfile·298개 JS/TS ESLint·307개 파일 Secretlint가 통과했다.
**exit 0, timeout 없음, 5.072초**로 기능 커밋
`e0ab2920aba059bf64c15d5f1a636817582c6d80`을 생성하고 clean 상태를 확인했다.
훅이 정리한 21파일은 실제 backup Git object와 커밋을 읽기 대조했다. import·type import·
공백 정리와 import 뒤로의 DTO 선언 이동이며, 함수·schema·권한·fixture·단언 변경은 없었다.
입력 내용의 해시는 훅 전후 달라졌으므로 이를 동일 소스 실행으로 기록하지 않는다.

정상 fetch로 확인한 메인은 `9d6c15cd5c4fe8e374a1255dc1398eae3549d509`였다.
`--no-ff --no-commit` 병합은 원고 bridge·source ratchet·DB 원장에서 충돌했고, 각 행동을
대조해 소스를 해결했다. 메인의 자산 descriptor 출처를 원격 CRDT가 덮거나 unset하지 않는
두 동작은 Web/API 공용 projector에 옮겼다. 담당 `frameClipId`와 무손실 원고 투영도 유지한다.
유효한 형식의 위조 출처와 명시적 unset을 실제 Y 문서에 적용하는 회귀 2개를 추가했으며,
일반 위치 변경은 계속 반영하도록 확인한다. 이 통합 후 회귀는 아직 실행 전이다.

DB 원장은 메인의 AI 0114·0115와 이번 0116·0117을 순서대로 보존한다. 테스트 기대는 실제
117개 migration·마지막 0117·bootstrap marker 포함 118행에 맞췄고 기존 음성 검사는 유지했다.
메인의 `reservedTokens`·`anthropic`·관련 check/index와 원고 strokes·scoped schema도 보존했다.
같은 파일 계수 규칙을 native 목록에 적용한 통합 후보는 DB 170, Core 148, Creator 직하 2,506이다.
DB의 정확한 추가 3개와 기존 순수 Production 모듈 6개·회귀 3개의 소비·분해 근거를
`ARCHITECTURE.md`에 기록하고 해당 두 상한만 맞췄다. 실제 source-layout 검사 통과를 뜻하지 않는다.

Git index의 충돌 해결 표시는 다음 정상 staging에서 처리해야 하며 merge commit은 아직 없다.
통합 후보의 관련 Web/API 회귀·migration 계약·하네스·타입·구조·실제 로컬 DB 검사와 정상
merge commit·원격 필수 CI·PR·main 병합이 남아 있다. 후속 메인이 추가되면 같은 정상 병합으로
보존한다. 운영 배포·운영 DB·환경변수·결제 변경은 수행하지 않았다.

## 32. 통합 회귀 통과와 Studio 정적 의존 경계 보완

상태: **migration — 2026-10-30 통합 후보의 기능·계약 검사 통과, 마지막 진입 그래프 실패를 좁은 공개 경로로 보완한 뒤 재검증 전**.

기능 커밋 `e0ab2920aba059bf64c15d5f1a636817582c6d80`과 메인
`9d6c15cd5c4fe8e374a1255dc1398eae3549d509`의 539입력 통합 후보에서 **Web 42파일·340 tests**가
통과했다(exit 0, 47.908초). 기존 API 11파일·84 tests도 통과했다(exit 0, 10.577초).
각 실행의 입력·변경 목록·HEAD는 전후 같고 소유 process group 종료를 확인했다.

DB 계약 3파일을 Node로 호출한 첫 실행은 runner 선택 오류로 실패했다. 원본 실패 기록을 보존하고
소스 수정 없이 올바른 Vitest로 실행한 결과 **DB 3파일·134 tests**가 통과했다(exit 0, 2.671초).
CI의 별도 Node 계약 4파일·51 cases도 정상 종료했다(exit 0, 1.391초). 이후 변경 파일 lint·
Secretlint·하네스 구조·문서·source-layout·앱 경계·파일 크기는 통과했지만 전체 architecture 명령은
마지막 Studio 정적 진입 그래프에서 실패했다(exit 1, 12.966초). 이 결과를 전체 구조 검사 통과로
표시하지 않는다.

당시 그래프는 허용 20,282,953바이트에 대해 20,623,779바이트였다. wire schema가 범위 검증에
필요한 두 값 때문에 전체 Production 진입점을 불러왔고, 두 Web 소비자가 작은 원고 함수 대신
전체 Authoring 진입점을 사용했다. 기존 `scope.ts`에 동일 범위 상수·타입을 모으고 기존 타입
진입점의 재수출을 보존했다. Core scope와 contracts의 기존 page reconcile·element projection
파일에 좁은 공개 경로를 연결하고 실제 소비 import만 바꿨다. 동기 schema 검증·함수 본문·권한·
기간·출처 처리는 유지하며 새 source 파일과 예산 증가는 없다.

이 import 보완 전 539입력의 통과 결과는 당시 후보의 증거로 보존한다. 보완 후 그래프의 실제
감소·관련 회귀·정상 merge commit과 최신 메인 통합은 다음 검증에서 확인해야 한다.
