# 두 법률 데이터 파일의 병합 해결 초안 — 2026-11-05

상태: draft. 기존 checkout·worktree·index·branch·Git 객체를 쓰지 않았다.
`/tmp/toonstudio-license-conflict-resolution-5165` 아래 요청받은 두 파일의 완성본과 이 기록만 작성했다.
테스트·타입 검사·빌드·Secretlint·하네스 검사·원격 작업은 실행하지 않았다.

기준:

- merge base `63dcf937ca8658fbae52396595416daa1a796043`
- 기능 브랜치 `abd691ee218a49a92b6ef170c152fa7415d23cf0`
- 원격 main `5165e4faf796cebe255460ab38d1c13fde8972c4`
- 읽은 가상 병합 tree `48f46a795c052d8ecefee1ae46d7134d55555313`

## 완성본

| 상대 경로 | SHA-256 |
| --- | --- |
| `apps/web/src/domains/legal/technology/engineering-license-inventory.test.ts` | `b6cfbc123621ef15fdd12eb73c0eab7485c675dec40db150e46fad53bc1a6d14` |
| `apps/web/src/domains/legal/technology/engineering-map-open-source.ts` | `d01151676123ce174e42a935e84b3087f1bed52625cdcf005fbbce289bd79993` |

원문 크기·줄 수·기준 ref는 `review-native-cutover-sha256.json`에 기록했다.
요청받은 두 파일만 선택해 적용해야 하며, 다른 agent의 파일이나 이 notes/manifest를 소스 경로로 복사하지 않는다.

## 결합한 의미

가상 병합의 실제 inventory 행을 정적으로 세면115개다. 각 브랜치의116은 서로 다른 패키지를 제거한 결과이므로,
둘 중 한 숫자를 선택하면 틀린다. base117개에서 외부 Mixbox와 wasm-vips를 모두 제외하면115이며,
표면별로 web83·api22·mobile8·labs2다. 새 테스트와 지도 소개에 이 합산을 반영했다.
이는 전체 현재 의존성을 재수집한 수치라는 주장이 아니다.

main의 Mixbox 제외 assertion과 잔여 플래그6개 assertion은 그대로 보존했다.
wasm-vips 부재 assertion을 추가했으며 기존 이름 유일성·버전·라이선스·한영 역할·GPL/AGPL 부재 검증은 유지했다.
외부 Mixbox 행·dependency를 되살리지 않는다. main이 기록한 자체 잠재 안료 연결과
실행 프로필 검증·빌드 산출물 검사의 구별 문장도 한영 모두 그대로 보존했다.

모델은 우리 브랜치의 Tag2Pix 비상업·재배포 제한, Paprika 원본 조건 충돌, Face Paint repository MIT와
불완전한 학습 출처 검토 assertion을 모두 유지했다. main의 AnimeGAN 두 모델 수 검증도 유지했다.
과거 모든 모델이 MIT/Apache/BSD라는 일반 허용 목록은 실제 제한 고지와 양립하지 않으므로,
6개 exact 파일별 라이선스 매핑과 권리 상태 검증으로 대체했다. 이는 검사 삭제·완화가 아니라
확인된 비허용·미확인 조건까지 정확히 검증하는 변경이다.
추가로 Tag2Pix/Paprika 두 차단 항목과 Face Paint 한 체크포인트 출처 검토 항목을 구별한다.

지도는 자체 Lanczos3를 output chip·alt에 유지하고 표준 수식의 독립 구현·wasm-vips 과거 LGPL 경계·
2026-11-05 고지 수집 수정 완료를 연결했다. Remotion은 사용자가 설명한 개인·1인 전제의 유지 결정을
보존하며 조직 전체 인원을 독립 검증하지 않았다는 한계를 남겼다.
모델 차단2·검토1은 새 notes에 명시했다. 과거 고지 비교의117/22/95는2026-10-07 기록으로 날짜를 붙였고,
현재 설치본의 고지와 구별했다. `reviewedAt`은 이 결합 설명을 작성한2026-11-05로 갱신했다.

## 부모가 함께 처리할 자동 병합의 의미 충돌

아래 두 파일은 담당 밖이므로 수정하지 않았다. 부모에게 별도 통지했다.

1. `engineering-license-inventory.ts`의 자동 병합된 header는 실제115행인데도
   “mixbox 항목만 제외…잔존116개”를 남기고 뒤에서 wasm-vips 제거를 추가한다.
   두 제거를 함께 명시하고115로 바로잡아야 한다.
2. `EngineeringLicensesPage.test.tsx`의 가상 병합127·136행은 여전히
   `116개 / 전체 116개 라이브러리`, `1개 / 전체 116개 라이브러리`를 기대한다.
   실제115행에 맞춰 총수만115로 바꾸고 필터 결과1개 검증은 유지해야 한다.

## 검증 상태와 위험

원문 diff와 가상 병합 데이터의 정적 검토만 수행했다. 두 초안에는 충돌 표식이 없고800줄 미만이다.
다른 두 충돌 파일은 별도 agent 담당이다. 전체 해결본 적용 뒤 부모가 관련 Vitest·필수 검사·전체 타입 검사와
빌드를 실행해야 한다. 5165 이후 main이 이동하면 새 main과 겹침을 다시 확인해야 한다.
현재 초안만으로 병합 성공·검사 통과·상용 출시 준비·배포 완료를 주장하지 않는다.
