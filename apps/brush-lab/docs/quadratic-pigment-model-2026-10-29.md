# 로컬 7채널 이차 안료 모델과 벤치마크 JSON v2

상태: current — 2026-10-29 관찰 및 명칭 정정. Brush Lab은 비운영 실험 앱이다.

## 현재 구현과 확인 범위

`src/engine/pigment/quadratic-pigment-model.ts`는 기존 Wave 36 소스에 있던 로컬 혼색 계산을 분리한 순수 CPU 모델이다.
황색·마젠타·청색·백색 순서의 4기저 농도와 RGB 잔차 3채널을 사용한다. 각 RGB 채널의 기저 계산에는
제곱항 4개와 교차항 6개, 총 10개의 **이차항**이 있다. 7채널을 선형 보간한 뒤 기저와 잔차를 합산하며,
출력은 기존처럼 `clamp`와 `Number(...toFixed(4))`를 거친다.

이 모델은 기존 소스에서 `MixboxLatent7`, `evaluateMixbox7DLatentPigmentMix`, “Secret Weapons Mixbox”,
“`mixbox.esm.js` 역공학”, “3차 다항식”으로 표기돼 있었다. 실제 이차식과 맞지 않는 이 명칭·설명을 정정했다.
공식 Mixbox 구현의 재현, 공식 계수·LUT 사용, 공식 호환 또는 인증을 확인했다는 뜻이 아니다.

**계수 원산지는 현재 미확인이다.** 기존 REA evidence ID·해시·143파일 등의 값은 소스에 기록된 메타데이터로
확인했으며, 그에 대응하는 원문 분석 artifact, 계수 생성 입력·생성기, 원본 열람자와 구현자의 분리 증거는
이번 검토에서 확인하지 못했다. 독립 출처 증명이 완료됐다고 주장하지 않는다. 이번 분리 작업에서는 금지된
vendor 패키지의 코드·계수·LUT를 새로 열람·복사·도입하지 않았다.

확인한 로컬 근거는 다음과 같다.

- 분리 전 커밋: `8054fc0cc70cf1d961bf081d72837dfc4da3009d`.
- 분리 전 경로: `src/engine/brush-engine/competitor-wave36-kernels.ts`의 7채널 모델 구간.
- 해당 파일 SHA256: `fb342ac06b266874a9bd83e573310b1ac3783a632dd7b8b547389e6f0b10142f`.
- 비교 기준: 해당 Git blob과 로컬 파일 내용이 같은 상태에서 채집한 기존 로컬 출력이다. 외부 구현의 골든이 아니다.
- 커밋된 대표 골든: `test-data/quadratic-pigment-model-golden.json`의 16개 입력과 전체 출력.
- 별도 QA 골든: 대표색·동일색·32개 고정 LCG 색상 쌍·유한 범위 밖 입력을 포함한 62쌍 × 13개 혼합률, 총 806개.
  골든 출력 SHA256은 `64d1c349d984a91f5447b9f09722b5a65c7a251840a0757cec511f78378a2843`이다.

## 수치와 기능의 보존

기저 상수, 항의 순서, 농도 순서, 잔차 계산, 보간 순서, 입력·출력 clamp, 반올림을 그대로 옮겼다.
기존 `mixbox-compat.ts`의 K/S·f32 모델로 교체하지 않았다. 두 모델은 농도 순서와 계산식이 달라 단순 교체하면
기존 출력이 달라지기 때문이다. 전체 QA 골든은 잠재 벡터·혼합 벡터·RGB·끝점 오차의 shape와 모든 숫자를 비교한다.

기존 벤치마크의 수치 임계값과 단언을 낮추지 않는다. 끝점 오차, 혼합색의 녹색 우세, 품질 점수, 지연·처리량 등
기존 숫자는 보존한다. 혼합률 슬라이더, 12행 비교표, 샌드박스 프로파일 적용, JSON 다운로드 기능도 유지한다.

## 분류와 승격 경계

현재 분류는 `local-prototype`, `coefficientOrigin: unverified`, `servicePromotionAllowed: false`다.
원산지·공식 호환·실측 성능이 미확인인 로컬 실험 모델이며 **운영 승격 대상이 아니다**. 비교표의 기존 지연·처리량·점수는
이번에 새로 실측한 인증값이 아니다. 이 값과 기존 수치 품질 게이트의 통과를 라이선스 허가나 운영 승격 승인으로 해석하지 않는다.

이 모델 행의 `promotedToService`를 기존 `true`에서 `false`로 정정했다. 승격 표시 필터는 실제 행 개수를 계산하며
해당 모델을 제외한다. Sumi 행에 이 모델이 운영 통합된 것처럼 보이던 설명도 정정했다. 기존 최적 프로파일 선택은
비승격 모델을 제외하며 Sumi 선택 ID·수치·샌드박스 설정 기능은 유지한다.

기존 `summaryReport.promotionGatePassed` 필드는 수치 기준의 결과를 유지하는 레거시 이름이다. UI는 이를 “수치 품질 게이트”로
설명한다. 이 필드는 모델의 원산지·공식 호환·운영 승격을 검증하지 않는다.

기존 Mixbox math-only compat, 미등록 lane, `license-policy.md` 4.5절, `BANNED_PACKAGES`, 경계 테스트의 금지 목록과
예외 목록은 변경하지 않았다. 이 로컬 모델을 공식 Mixbox 재구현이나 기존 라이선스 예외의 확대로 취급하지 않는다.
원산지 검토가 끝나기 전에는 상용·운영 승격의 근거로 사용할 수 없다.

## JSON v2와 API 전환

다운로드는 `schemaVersion: 2`와 `localPigmentModel` 분류를 명시하고,
`brush-lab-service-promotion-benchmark-v2-<seed>.json`이라는 새 파일명을 사용한다.
`exportedAt`에는 버튼을 누른 시점의 실제 ISO 시간을 기록한다.

| 기존 명칭·키 | v2의 명칭·키 |
| --- | --- |
| `mixbox7DEndpointIdentityError` | `quadraticPigmentEndpointIdentityError` |
| engine ID `mixbox-7d-latent-polynomial` | `quadratic-pigment-7d-local` |
| `evaluateMixbox7DLatentPigmentMix` | `evaluateQuadraticPigmentMix` |
| `rgbToMixboxLatent7` | `rgbToQuadraticPigmentLatent7` |
| `mixboxLatent7ToRgb` | `quadraticPigmentLatent7ToRgb` |
| `MixboxLatent7` / `Mixbox7DMixResult` | `QuadraticPigmentLatent7` / `QuadraticPigmentMixResult` |
| 버전 없는 다운로드 파일명 | `...-v2-<seed>.json`, `schemaVersion: 2` |

이미 다운로드된 이전 JSON 파일은 그대로 남는다. 파일을 읽어 덮어쓰거나 자동 변환·삭제하지 않는다.
위 키·ID에 의존하는 외부 소비자는 확인되지 않았으므로 완전한 외부 호환을 주장하지 않는다. 소비자는 schema version을
확인하고 표의 키·ID를 명시적으로 매핑해야 한다. 기존 키를 분할 문자열·숨은 alias·동적 경로로 유지하지 않는다.
내부 수치 결과의 보존과 JSON 명칭의 변경을 구분한다. 과거의 제품명과 출처 미확인 사실은 이 기록과 Git 이력에 남긴다.

## 검증 범위

기존 boundary·license-policy·compat·미등록 lane·bench·Compare 테스트를 유지한다. 새 테스트는 대표 골든의 전체 출력,
JSON v2의 키·모델 ID·비승격 상태, UI 슬라이더·필터·프로파일 적용·다운로드를 확인한다.
806개 QA 대조와 scoped typecheck 결과는 릴리스 QA receipt에 별도로 기록한다. 이 문서의 원산지 미확인 상태는
수치 검증 성공으로 해소되지 않는다. CPU·모의 GPU 테스트를 실브라우저 GPU 성능이나 8시간 실측의 증거로 쓰지 않는다.
