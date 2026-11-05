# 2026-11-05 main CI 복구의 독립 검토와 추가 보완

상태: `current` 로컬 검증 기록. main 기준은 `5165e4faf796cebe255460ab38d1c13fde8972c4`, 인수한 공통 소스는 `f9e5460677512518a8cb8e55f57f08bd07a92b05`다. 이 문서는 원격 CI·병합·배포 완료 기록이 아니다.

## 기존 변경 보존

공통 작업의 커밋을 부모로 둔 별도 브랜치에서 추가 보완을 검증한다. 기존 작업트리와 브랜치, 원고 JSON·PNG, 원래 6컷 검증 증거와 기술 검토용 ZIP은 그대로 보존한다. 기존 공통 변경의 재현과 한계는 [공통 CI 보고서](../reports/main-ci-quality-followup-2026-11-05.md)를 따른다.

공통 변경에는 사용자가 판단과 진행을 위임한 Chemy V1 검사 계약 변경도 포함된다. 원래 최종 알파 질량 `>1.15` 보장을 포기한 내용이므로 전체 변경을 검사 기준 강화라고 설명하지 않는다. 다른 33종 기준과 기존 렌더러를 유지한다는 범위도 공통 보고서와 구분 없이 확장하지 않는다.

## 일반 JSON과 보존 필드의 pending 오탐

고정 후보 `eb43690dcf7b36a9a3142ccef89db214017c31ba`의 실제 helper·root schema·서비스와 MemoryRepo, 실제 구 `63dcf937` publisher로 재현했다. `shapeParams`의 일반 JSON에 `psdGroupId` 또는 `colorizeMaskEnabled: false`가 있으면 같은 유효 변경이 부모부터 도착할 때는 수락되고 child부터 도착할 때는 reader 업그레이드 오류로 거절됐다. v1–v6의 두 키 조합 12개에서 확인했고 일반 숫자 `7` 대조군은 두 순서 모두 수락됐다. 실제 구 publisher가 만든 v6 변경도 동일한 차이를 보였다.

원인은 pending 검사에서 값 안의 키 존재만 보고, 해당 값이 실제 획 `extensions`인지 알려진 일반 `shapeParams`인지 구분하지 않은 것이다. 알려진 다른 키는 제외하고 `extensions`와 상속 키 미확정인 `null`만 보수적으로 조사하도록 제한했다. 실제 v7 버전 판정과 원래 PSD·false 마스크의 보호는 유지한다. wire·파일 형식·protocol·DB schema·편집 ACL은 바꾸지 않는다.

검증은 다음처럼 나눈다.

- 계약 회귀는 알려진 `shapeParams`의 두 키를 허용하고, 실제 `extensions`의 알려진 키·상속 키를 계속 보호한다.
- 서비스 회귀는 v1–v6 × 두 키의 12개 입력에서 양쪽 도착 순서의 실제 schema·필드 위치·receipt·sequence를 확인한다.
- 기존 v7 pending·구 writer 거절·false 마스크·PSD·실제 `Y.UndoManager` 회귀는 그대로 실행한다.

소유 소스의 관련 3파일 74개가 통과했다. 이는 실제 Yjs·실제 서버 서비스·메모리 저장소의 검증이다. HTTP·실계정·실제 PostgreSQL·브라우저 버튼 검증을 뜻하지 않는다. 임시 A/B 실험은 별도 source override이며 이 소유 소스의 실행과 합산하지 않는다.

**남는 제한:** 기존 일반 JSON 값을 교체한 child의 상속 키가 `null`이면 부모 도착 전에는 실제 `extensions`와 구분할 수 없어 보수적 reader 요구가 남는다. 이 제한을 전체 오탐 해결로 표시하지 않는다. 부모 맥락으로 다시 판정하거나 별도 보류하는 개선은 이번 최소 보완 범위 밖이다.

## 문서를 내려받지 않는 CI 작업의 정본 검사

원격 `Core preflight/typecheck`는 foundation 문서를 물리적으로 내려받지 않는다. 그런데 공통 게이트의 정본 검사가 물리 파일 존재를 요구해 TSC 이전에 실패했다. 문서 정본은 Git 추적 목록의 정확한 literal 경로로 확인하고, foundation에서 실제로 필요한 16개 문서의 sparse 투영 검사는 유지했다.

추가 실제 Git 회귀는 CI의 typecheck sparse 선언으로 문서 본문을 제외해도 추적 정본은 인정한다. 같은 문서를 index에서 제거한 뒤 물리 파일만 복구하면 계속 거절한다. 관련 Node 3파일 56개가 통과했으며 skip·취소·실패는 없었다. 문서를 읽는 작업의 입력을 생략하거나 정본 누락을 무시하는 변경이 아니다.

## 원래 안료 원고 불변

공통 후보가 추가한 자체 안료·spectral 어댑터 비교와 V1 Mixbox 직접 실행 차단을 유지했다. 차단 전 원본의 깊은 복사와 차단 후·명시 사본 구성 후의 동등성 검사를 덧붙였다. 관련 material·기존 SVG byte replay·이주 경계 3파일 57개가 통과했다. 제품 guard·픽셀 기준·저장 형식은 바꾸지 않았다.

## 실행 범위와 남은 확인

위 세 실행은 서로 겹칠 수 있는 별도 묶음이므로 하나의 총 테스트 수로 합산하지 않는다. 추가 보완 전체에서 `pnpm harness:verify --base=origin/main`이 통과했고 웹 TypeScript 및 API의 세 TypeScript 설정 검사를 포함했다. 정상 pre-push·정확한 원격 head의 `core`와 같은 CI workflow의 `verify`, 최신 source에서의 실제 계정·브라우저 검증은 별도로 확인해야 한다. 로컬 성공과 이미 병합된 이전 변경을 원격 최종 후보 성공으로 옮겨 적지 않는다.

운영 배포·migration·운영 환경변수·시크릿·유료 runner 설정 변경은 하지 않았다. 원래 6컷 보고서의 사람 확인 항목과 정식 게시 승인 미완료 상태는 유지한다.

## 2026-11-06 동일 6컷의 냉간 검증 서버 보완

`7dc2a368a43cb2b35997f5a81c77da1c9e4f0254`의 새 Vite 캐시에서 같은 6컷 시험을 실행했다. 먼저 로컬 시험 DB를 연결 파일의 포트가 아닌 기본 포트로 시작해 준비 단계 두 번이 실패했다. 이를 기존 데이터나 schema 변경 없이 명시 포트로 바로잡은 뒤 실계정 준비는 통과했지만, `TOONSPECTRUM_VITE_DISABLE_OPTIMIZE_DEPS=1`의 명시 목록에 `spectral.js`가 없어 CommonJS 진입점의 default export 오류로 화면 진입이 실패했다. 원본 fixture 1개 통과·실계정 사례 1개 실패였으며 원격 CI·전체 제작 통과로 계산하지 않는다.

변환 목록에 `spectral.js`만 추가했다. 안료 계산·렌더러·저장 형식은 바꾸지 않는다. 동일 시험의 새 냉간 캐시·새 결과 폴더 실행은 별도 확인하고, 첫 실패의 원시 로그와 고정 소스 지문은 보존한다. 이 설정은 원고 브라우저 검증 서버에서 사용하는 기존 선택 모드이며 production 빌드나 운영 배포의 증거와 구분한다.

첫 변환 보완 `bdba63889e35c72cc011026038d1d037c32bc543`의 새 냉간 실행에서는 Spectral 오류가 사라졌지만 `react-konva`의 실제 캔버스 진입점이 읽는 CommonJS `react-reconciler/constants.js`의 named export 오류로 다시 1개 통과·1개 실패했다. 따라서 첫 보완만으로 화면 진입이 해결됐다고 표시하지 않는다. 이어 진입점 전체를 사전 변환한 `da734a3b020089eb5c815a2a4cf79e965cad5529`도 Konva의 도형 등록이 분리돼 `Rect`·`Transformer`가 `Group`으로 대체되고 `tr.nodes` 오류가 나 1개 통과·1개 실패했다. 이 전체 변환 방식은 최종 설정에서 제거한다.

최종 설정은 기존 Konva 모듈의 단일성을 유지하면서 Vite의 중첩 의존성 지정으로 `react-konva > react-reconciler`, 해당 `constants.js`, `react-konva > scheduler`의 세 CommonJS 경로만 변환한다. 설치된 Vite의 중첩 resolver와 실제 패키지 형식을 근거로 선택했으며, transitive 패키지를 앱에서 직접 import하거나 의존성·렌더러를 바꾸지 않는다. 후속 실제 완주 결과는 같은 방식으로 별도 확인한다.

위 세 경로를 적용한 뒤 화면 진입은 가능했지만 실제 6컷은 binary sync 확인 120초에서 실패했다. HTTP 로그인·작품 조회·live auth ticket 발급은 성공했으며, 제한된 진단에 실제 협업 Socket 생성·ACK가 없었다. 별도 브라우저에서 연결 factory 모듈을 평가해 `debug@4.4.3/src/browser.js`의 default export 오류를 직접 재현했다. 인증 hook이 잡은 지연 import 실패로 접속 전에 막힌 것이며, 서버가 원고 저장을 거절하거나 데이터가 소실된 증거로 해석하지 않는다. `socket.io-client > debug`만 추가해 그 내부 `ms`까지 기존 optimizer가 변환하게 한다. 원시 frame·쿠키·토큰·요청 본문을 저장하지 않는 시작 실패 진단을 테스트에 추가했으며, 기존 120초·원래 성공 단언은 그대로다.

공통 `6e6808de844e4592a374722b2db89f7ccbbf5462`의 생략된 원격 적용 reader 메모 복원도 부모 커밋으로 보존했다. 알려진 일반 JSON 보완과 통합한 계약·서비스·Web fence·실제 room binding 회귀는 4파일 88개 통과했다. 실제 HTTP·DB·브라우저 성공 수치로 합산하지 않는다.

`61b0c45856fdd13c7cbbacdebd79d94b0f3f27e9`의 새 냉간 캐시에서 실제 6컷 두 시험이 모두 통과했다(실패·skip 0, 약 118.7초). 작품·팀 초기 준비는 실제 API와 Web serializer의 63개 증분으로 수행했으며 기획 UI부터 연속 수동 제작한 결과로 표시하지 않는다. 원본 6페이지·57요소와 순서, 새로운 포인터 입력의 Undo/Redo/Undo 복원, 두 계정 재열기·재로그인, 고정 검수·다음 공정 인계, 기술 ZIP을 확인했다. 작업자 ACK 7개·거절 0개였으며 검수·재로그인·ZIP의 여섯 1440px RGBA는 해당 실행의 기준본과 정확히 일치했다. 원래 Undo journal은 없고 사람의 게시 확인은 미완료다. 같은 소스의 guest 회차→콘티→작화·자동 복구 UI 검사도 통과했으며 API 시험을 대신한 결과로 합산하지 않는다.

다만 그 실행의 역사 기준 PNG 대비 2.62–4.05% 픽셀 차이와 한글 줄바꿈 차이를 별도로 확인했다. 직접 Skia 캡처를 평가한 결과 `module.default is not a function`으로 `unavailable`이었다. 제한된 변환 목록에 UMD인 `canvaskit-wasm`이 없었던 추가 공백이다. 이 상태의 현재 실행 내 RGBA 일치를 과거 외관 보존으로 확대하지 않는다. CanvasKit만 명시 변환 목록에 추가해 선호 렌더러를 복구하고, 후속 실제 6컷과 이전 기술 ZIP의 픽셀을 별도로 재비교한다. 기존 그림·폰트 계산이나 원고 저장 필드는 바꾸지 않는다.

CanvasKit 변환을 적용한 직접 캡처는 실제 `skia-document`·1440×1440으로 성공했고 첫 컷은 이전 `4c14fece` 기술 ZIP과 RGBA 차이 0픽셀·최대 채널 차이 0이었다. 이는 한 컷의 분리 관측이며 여섯 컷 전체 완주와 합산하지 않는다. 기존 실계정 시험에는 UI에서 먼저 내려받은 여섯 PNG 각각을 선호 렌더러의 실제 RGBA와 비교하는 회귀를 추가했다. 선호 렌더러가 `unavailable`이거나 호환 경로와 픽셀이 다르면 실패하며, 준비를 미리 끝내 UI의 첫 냉간 내보내기를 가리지 않도록 이 확인은 UI 다운로드 뒤에 수행한다.
