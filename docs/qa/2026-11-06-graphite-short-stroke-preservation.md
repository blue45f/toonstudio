# Graphite 짧은 획의 가시성과 기존 원고 보존 — 2026-11-06

상태: `current` PR #2726의 e48390e2 후속 후보 검증 기록이다. CI 전체 성공·main 병합·운영 배포 완료 기록이 아니다.

## 확인한 실패와 재현의 범위

e48390e2의 Brush run 42123161509/desktop job 127590541053은 476개 짧은 획 중 `material-graphite-platelets` 한 사례에서 실패했다. 동일 preset의 앞선 사례는 성공했다. 실패 PNG는 수학적으로 완전 투명하지 않았지만 최대 채널 변화가 3/255로 기존 `changedPixels >= 4 && maxChannelDelta >= 4` 조건에 못 미쳤다. 변경 픽셀은 채널 차이 tolerance 2를 초과하는 픽셀로 센다. job 시간 한도 취소와 구분한다.

원문과 작은 desktop artifact는 각각 한 번 회수했다. artifact 13463777109는 ZIP 775,394B·SHA-256 `0afb8447236c7578b5060957f7a51dd2af5be0c90b74c32c77a0e395c8b80d10`이며 CRC가 정상이다. 저장된 전·즉시·지연 PNG는 변환하지 않았다. 즉시와 지연 RGBA는 같았지만 지연 캡처의 실제 pointerup 경과 시간은 없으므로 장기적으로 영구히 보이지 않는다고 확대하지 않는다.

실제 실패에는 전체 brush snapshot·색·폭·문서 paper·소수 CSS 치수가 기록되지 않았다. 따라서 원래 Linux 전체 Studio UI 실패의 동일 입력을 확정하지 않았다. 소스 검토에서는 element opacity 0.82의 명시적 이중 적용도 찾지 못했다. 공통 renderer를 변경할 근거로 삼지 않는다.

같은 고정 seed를 쓰는 합성 ID `graphite-ci-weak-coverage-vQB4mN`을 구성했다. `FNV1a("graphite-ci-weak-coverage-vQB4mN:4026803820") = 372699818`이며 유리한 새 seed를 선택하지 않는다. 현재 canonical snapshot·폭 15·opacity 0.82·색 `#7c5cfc`·기본 paper와 두 좌표·필압을 사용하면 CI 관측과 mark 4개, alpha peak `0.03172320692330301`, 적분 energy `4.664622597488389`가 정확히 같다. 이 일치를 전체 UI 입력·최종 화면 일치로 간주하지 않는다.

실제 Chrome 156.0.8078.4 full Chromium, macOS arm64, DPR 1, secure localhost에서 의도적인 SwiftShader lane을 먼저 확인했다. 실제 WebGPU adapter는 google/swiftshader이며 WebGL도 SwiftShader였다. 픽셀은 제품 Canvas2D coverage renderer와 기본 OffscreenCanvas factory에서 얻었다. GPU 성능이나 Linux 동일 backend의 검증이 아니다. 최초 IIFE/import.meta.url 및 favicon 초기화 실패는 프로브 구성 오류로 분리하고 renderer 미실행으로 보존했다.

## 새 기본값의 최소 범위와 영향

관측 scale `1.0180555582046509`에서 x/y translation을 각각 0~7/8로 둔 64개 정상 배치를 비교했다. 흰 destination에 직접 렌더한 실제 Canvas2D readback은 flow 0.57에서 55통과·9실패, 최대 채널 변화 범위 3~4였다. 이는 제어된 renderer 조건의 낮은 가시성 재현이며 원래 전체 UI 실패와 구분한다.

| flow 실험 | 흰 destination readback의 최소~최대 변화 | 투명 원고 레이어를 흰 화면에 표시한 실제 SCREEN의 최소~최대 변화 |
| --- | --- | --- |
| 0.57 | 3~4, 9/64 실패 | 4~5, 64/64 통과 |
| 0.70 | 5~6, 64/64 통과 | 4~6, 64/64 통과 |
| 0.75 | 5~7, 64/64 통과 | 5~7, 64/64 통과 |

0.70도 실제 SCREEN 일부에서 기존 기준선 4에 걸쳤으므로 최종 후보는 **Graphite catalog 한 항목의 flow 0.57→0.75**다. 새 catalog 선택·같은 카드의 명시적 재선택과 built-in 기본값 복원 뒤 생성되는 획의 농도가 높아진다. flow base는 약 31.58% 증가하며 관측한 두 점 입력의 alpha peak는 약 65.18%, energy는 약 44.19% 증가했다. 모든 획의 최종 RGB 증가가 이 비율이라는 뜻은 아니다. mark 개수·위치·반경·각도와 seed는 같다. 새 획의 외관이 완전히 같다고 주장하지 않는다.

폭·opacity·필압 곡선·팁/atlas·종이·공통 renderer·normalizer·다른 46개 material 정의는 변경하지 않는다. 기존 가시성 조건과 476개 UI 입력·순서·판정·기한을 유지한다. Chemy V1의 별도 승인된 15% 예외를 Graphite에 확대하지 않는다. 저장 형식·CRDT wire·권한·DB·원고 migration을 도입하지 않는다.

## 기존 snapshot과 snapshot 없는 획의 전후 비교

정상 저장된 `brushDynamics`는 자체 snapshot을 정규화해 재생하며 최신 catalog flow를 다시 적용하지 않는다. catalog metadata만 있는 legacy dry-media도 최신 Graphite 선택을 materialize하지 않고 기존 replay-safe generic flow 0.55를 유지한다. 사용자 saved brush·도구 기억·최근 슬롯도 자체 snapshot과 기존 fallback 권위를 유지한다. 최신 baseline 조회는 명시적 기본값 복원 transaction과 구분된다.

제품 후보 적용 전에 historical 0.46·저장된 0.57·사용자 지정 0.21의 full JSON과 snapshot 없는 입력을 동결했다. 네 종류 × 공개 고정 ID 세 개 × 64개 배치의 **768개 실제 Canvas2D frame**을 변경 전후 비교했다. 새 catalog 값으로 이전 snapshot을 재생성하지 않았다.

후보 적용 뒤 같은 동결 JSON·seed·입력에서 **전체 canonical plan 불일치 0, snapshot 불일치 0, RGBA 변경 byte 0, 변경 pixel 0**이었다. 89×83 ROI raw 22,692,864B를 정확히 비교하고, 전체 733×769 중 ROI 밖은 전후 모든 frame에서 변화가 없음을 검사했다. bundle의 읽기 입력 255개 중 바뀐 파일은 Graphite flow 한 항목이 든 catalog뿐이다. 새로운 768개 기존 운영 원고를 검증했다는 뜻은 아니며 고정된 재생 표본의 보존 증거다.

기존 표본 중 가시성 기준 미달 614개도 전후 동일하게 남아 있다. 이 결과는 기존 픽셀 보존 PASS이며 가시성 768개 PASS가 아니다. 저장된 옅은 획을 임의로 진하게 보정하지 않는다.

## 결정적 회귀 검사

공개 SCREEN 회귀는 현재 factory snapshot을 그대로 사용해 흰 destination과 투명 destination 각각 64개, 총 128개 실제 browser screenshot을 검사한다. flow·seed·입력·기준 override 없이 동일 fixture를 사용한다. 이전 0.57에서는 흰 표면 9개 실패·투명 표면 64개 통과로 전체 exit 1, 후보 0.75에서는 **128개 모두 통과·최소 채널 변화 5·최대 7·exit 0**이었다. 양쪽 모두 browser·context·Vite·소유 cache 종료와 실행 중 source 불변 검사를 통과했다. 해당 제어 조건의 RED/GREEN이며 전체 Studio UI나 Linux CI 성공을 대신하지 않는다.

기존 0.46·사용자 0.21·이전 0.57 세 boundary의 모든 수치와 canonical hash를 보존하고, 새 선택 0.75 및 snapshotless v3·flow 0.55 회귀를 추가했다. 이전 기본값에서는 새 선택 두 검사가 실패·99개 통과했고, 후보는 선택 snapshot·기본값 복원·재생 계획을 포함한 **4파일 127개 통과**였다. 계획 값만으로 SCREEN 통과를 판정하지 않는다.

Brush CI의 기존 476개 UI 검사 뒤 desktop 한정 `!cancelled()` step으로 SCREEN 회귀를 추가한다. 앞선 UI가 실패해도 취소되지 않았다면 독립 회귀와 기존 always evidence 업로드를 실행하고 실패를 유지한다. 두 파일과 정책 회귀의 단독 변경도 PR·main에서 실행한다. 기존 matrix·명령·100분 상한·runner·품질 assertion을 변경하지 않고 이미 선언된 Vite·Playwright·image-js를 사용한다. 새 의존성·lockfile 변경이나 추가 전체 빌드는 없다.

화면 판정의 음성·경계와 CI 연결 검사는 Node 직접 실행 5개 및 기존 정책을 포함한 Vitest 4파일 94개에서 통과했다. 이전 workflow에서는 새 연결 검사만 실패했고 나머지 네 픽셀 계약 검사는 통과했다. static node:test만 등록해 전체 Vitest에서 빈 suite가 되는 문제를 되풀이하지 않도록 같은 다섯 검사를 두 runner에 실제 등록한다. 겹치는 사례 수를 합산하지 않는다.

이 결과는 macOS의 제어된 Canvas2D 및 로컬 관련 검사다. 정상 하네스·pre-push와 최종 Linux 전체 CI는 별도 완료 조건이다. 기존 저장·복구·DB 검증을 반복하지 않는다. 모든 최종 head CI가 실제 통과한 뒤에만 main에 병합하며 운영 배포는 하지 않는다.

최종 MJS는 browser origin·secure context·fallback·feature 수·최대 buffer 크기도 영수증에 기록하고, 정리 중 늦게 수집된 diagnostics를 종료 뒤 errors에 합산한다. 실제 late-event false-green을 재현한 증거는 없으며 코드 분석으로 종료 경계를 보완한 것이다. 보완한 코드에서 Node 5개와 실제 SCREEN 128개가 다시 통과했고 최종 diagnostics 0·소유 자원 정리 5개 성공을 확인했다. 이 MJS·문서만 staged 하네스로 추가 확인하고 최종 SHA의 정상 pre-push 및 Linux 전체 CI와 구분한다.
