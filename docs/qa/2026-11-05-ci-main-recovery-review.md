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
