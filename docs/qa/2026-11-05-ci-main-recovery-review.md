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

Konva 관련 최종 설정은 기존 모듈의 단일성을 유지하면서 Vite의 중첩 의존성 지정으로 `react-konva > react-reconciler`, 해당 `constants.js`, `react-konva > scheduler`의 세 CommonJS 경로만 변환한다. 설치된 Vite의 중첩 resolver와 실제 패키지 형식을 근거로 선택했으며, transitive 패키지를 앱에서 직접 import하거나 의존성·렌더러를 바꾸지 않는다. 후속 실제 완주 결과는 같은 방식으로 별도 확인한다.

위 세 경로를 적용한 뒤 화면 진입은 가능했지만 실제 6컷은 binary sync 확인 120초에서 실패했다. HTTP 로그인·작품 조회·live auth ticket 발급은 성공했으며, 제한된 진단에 실제 협업 Socket 생성·ACK가 없었다. 별도 브라우저에서 연결 factory 모듈을 평가해 `debug@4.4.3/src/browser.js`의 default export 오류를 직접 재현했다. 인증 hook이 잡은 지연 import 실패로 접속 전에 막힌 것이며, 서버가 원고 저장을 거절하거나 데이터가 소실된 증거로 해석하지 않는다. `socket.io-client > debug`만 추가해 그 내부 `ms`까지 기존 optimizer가 변환하게 한다. 원시 frame·쿠키·토큰·요청 본문을 저장하지 않는 시작 실패 진단을 테스트에 추가했으며, 기존 120초·원래 성공 단언은 그대로다.

공통 `6e6808de844e4592a374722b2db89f7ccbbf5462`의 생략된 원격 적용 reader 메모 복원도 부모 커밋으로 보존했다. 알려진 일반 JSON 보완과 통합한 계약·서비스·Web fence·실제 room binding 회귀는 4파일 88개 통과했다. 실제 HTTP·DB·브라우저 성공 수치로 합산하지 않는다.

`61b0c45856fdd13c7cbbacdebd79d94b0f3f27e9`의 새 냉간 캐시에서 실제 6컷 두 시험이 모두 통과했다(실패·skip 0, 약 118.7초). 작품·팀 초기 준비는 실제 API와 Web serializer의 63개 증분으로 수행했으며 기획 UI부터 연속 수동 제작한 결과로 표시하지 않는다. 원본 6페이지·57요소와 순서, 새로운 포인터 입력의 Undo/Redo/Undo 복원, 두 계정 재열기·재로그인, 고정 검수·다음 공정 인계, 기술 ZIP을 확인했다. 작업자 ACK 7개·거절 0개였으며 검수·재로그인·ZIP의 여섯 1440px RGBA는 해당 실행의 기준본과 정확히 일치했다. 원래 Undo journal은 없고 사람의 게시 확인은 미완료다. 같은 소스의 guest 회차→콘티→작화·자동 복구 UI 검사도 통과했으며 API 시험을 대신한 결과로 합산하지 않는다.

다만 그 실행의 역사 기준 PNG 대비 2.62–4.05% 픽셀 차이와 한글 줄바꿈 차이를 별도로 확인했다. 직접 Skia 캡처를 평가한 결과 `module.default is not a function`으로 `unavailable`이었다. 제한된 변환 목록에 UMD인 `canvaskit-wasm`이 없었던 추가 공백이다. 이 상태의 현재 실행 내 RGBA 일치를 과거 외관 보존으로 확대하지 않는다. CanvasKit만 명시 변환 목록에 추가해 선호 렌더러를 복구하고, 후속 실제 6컷과 이전 기술 ZIP의 픽셀을 별도로 재비교한다. 기존 그림·폰트 계산이나 원고 저장 필드는 바꾸지 않는다.

CanvasKit 변환을 적용한 직접 캡처는 실제 `skia-document`·1440×1440으로 성공했고 첫 컷은 이전 `4c14fece` 기술 ZIP과 RGBA 차이 0픽셀·최대 채널 차이 0이었다. 이는 한 컷의 분리 관측이며 여섯 컷 전체 완주와 합산하지 않는다. 기존 실계정 시험에는 UI에서 먼저 내려받은 여섯 PNG 각각을 선호 렌더러의 실제 RGBA와 비교하는 회귀를 추가했다. 선호 렌더러가 `unavailable`이거나 호환 경로와 픽셀이 다르면 실패하며, 준비를 미리 끝내 UI의 첫 냉간 내보내기를 가리지 않도록 이 확인은 UI 다운로드 뒤에 수행한다.

## 2026-11-06 최종 로컬 검증과 사업계획서 활용 범위

최종 실행 source는 `f63dd7cf3c90804c077bd31868ca68de2b54fca8`이다. 공통 `502096134e3aea7b139e614a3d9fa4f3372fdc4d`의 남은 회귀·모바일 준비 보완도 통합한 뒤 새 Vite 캐시·새 브라우저 context·별도 결과 폴더에서 실제 계정 시험 **2개 통과·실패 0·skip 0**, process exit 0, 약 135.1초였다. 생성 QA 문서를 제외한 실행·설정 소스와 fixture 74개 지문은 전후 동일했다. 여섯 컷의 실제 `skia-document` 영수증과 UI PNG의 RGBA가 일치했고, 검수·인계·재열기·재로그인·ZIP까지 같은 결과를 유지했다. 작업자 update ACK 7개·거절 0개다. 별도 guest UI 검사도 같은 source에서 다섯 단언 통과·page error 0이었다. 선행 `74f82639`의 2개 통과·약 142.8초 결과는 별도 실행으로 보존하고 합산하지 않는다.

통합된 Graphite 수정은 새 선택·명시 기본값 복원에서만 flow 0.46→0.57을 사용한다. 기존 저장 snapshot과 사용자 편집값을 재해석하지 않는다. 소유 소스의 재질 계획·저장 슬롯·기존 byte replay·초안 guard 4파일 133개도 통과했다. 이는 일반 pen 51개로 된 6컷 결과와 별개이며, 해당 흑연의 실제 Linux Canvas 가시성은 최종 원격 job에서 별도로 확인해야 한다.

실행 방법의 경계도 유지한다. 로그인·로그아웃과 시험용 공정 설정·검수 승인은 실제 API를 사용했다. 고정 검수본 생성·열람, 공동 저장, 실제 다음 공정 인계는 브라우저 UI다. 정식 패키지 버튼의 차단을 확인한 뒤 기술 ZIP은 브라우저의 제품 생성 함수로 구성했다. guest 로컬 프로젝트와 서버 작품은 별도 ID에 같은 6컷을 복사한 경로이며, guest→server UI 이주나 빈 화면부터 연속 제작을 검증한 것은 아니다.

후속 전체 하네스 `a6b9e78e`에서는 새 모바일 회귀의 `HTMLElement.hidden`이 `boolean | "until-found"`인 TypeScript 오류 한 건이 확인됐다. 공통 `f0d69841`의 `panel.hidden === true` 수정과 `0d73c5e4`의 helper 전용 CI 경로 회귀를 통합했다. 제품 코드와 위 6컷 실행 스크립트는 바뀌지 않았으며 최종 하네스·정상 pre-push에서 별도 확인한다. 실패한 하네스는 성공으로 계산하지 않는다.

직전 실제 검증 `4c14fece`의 기술 ZIP과 다시 비교한 결과, 여섯 1440×1440 원고 PNG 모두 변경 픽셀 0·최대 채널 차이 0이었다. **기술 ZIP 자체도 838,465 B, SHA-256 `ee2d8658436c270cc208fb6cad438806c114df24d704bf27c3aab3e587fce1ee`로 바이트까지 동일**했다. 첫 냉간 시도의 다른 외관은 원고나 폰트 변경 없이 CanvasKit 변환 복구로 해소됐다. 더 오래된 `8d315c85` 기준 PNG의 기존 차이는 별도 기록이며 모든 역사적 버전의 픽셀 일치를 주장하지 않는다.

계정·쿠키·원시 Socket frame을 제외한 [실행 요약](evidence/2026-11-06-short-comic-recovery/verification-summary.json), [렌더러 영수증](evidence/2026-11-06-short-comic-recovery/renderer-receipts.json), [이전 패키지 비교](evidence/2026-11-06-short-comic-recovery/previous-package-comparison.json), [UI 인계 증거](evidence/2026-11-06-short-comic-recovery/ui-handoff-proof.json), [기존 로컬 데이터 보존](evidence/2026-11-06-short-comic-recovery/local-data-preservation.json)을 공개 검토용으로 보존했다. 실행 직후 추가한 파일은 설명·증거 문서다. 최종 원격 CI와 병합 상태 및 이후 source 변경은 해당 PR의 정확한 head에서 별도 확인한다.

| 구분 | 사업계획서에서 사용할 수 있는 범위 |
| --- | --- |
| 구현 완료 | 회차·콘티·작화의 정본 연결과 인계, 게시 준비 상태 안내, 원래 저장 계약을 유지하는 협업 reader 보호, 새 캐시에서도 실제 원고·협업·내보내기 모듈을 준비하는 검증 환경 |
| 실제 검증 완료 | 동일 6컷·57요소의 로컬 실제 계정/PG 시나리오와 별도 guest UI, 새 포인터 Undo/Redo/Undo, 두 계정 재열기·재로그인, 순서가 고정된 검수·다음 공정 인계, 이전과 동일한 기술 ZIP. 기획부터 빈 화면에서 연속 제작한 결과와 구분 |
| 향후 개선·사람 확인 | 키가 미확정인 일반 JSON pending의 보수적 차단, 더 다양한 직군·인계 조합, 최초 Undo journal 복원, 실제 외부 메일·private storage, 모든 역사 버전·렌더러 간 외관 일치, 작품 품질·권리·등급·게시 승인 |

정식 게시 버튼은 차단 상태이고 ZIP의 `validation-report.json.releaseAuthorized`는 `false`다. 기존 원고 JSON·PNG와 이전 기술 ZIP은 보존했으며 운영 배포·운영 DB·저장 형식 변경은 하지 않았다.
