# Perfect Freehand 내재화 현황 감사

이 문서는 Perfect Freehand(MIT 라이선스)를 brush-lab 자체 소스에 전체 내재화하는 현황 감사 결과다.
라이선스 정책(apps/brush-lab/docs/license-policy.md)에 따라 Perfect Freehand는 `ok(MIT)`이므로
**전체 수식 내재화가 허용**된다. 감사 결과에 따라 누락 항목은 Phase 3.2~3.5 TDD 테스크로 분기한다.

## 감사 대상

외부 소스: Perfect Freehand 원본(MIT) — 저장소에 사전 내재화 코드는 존재하지 않음.
확인 경로: `apps/brush-lab/src/engine/stroke/perfect-freehand/` — **디렉터리 미존재**.

## 감사 결과

| 항목 | 내용 | 상태 |
| --- | --- | --- |
| `getStrokePoints` | 스포인트 생성(시뮬레이션 점 보간) | **없음** — 저장소에 구현 없음 |
| `getOutlinePoints` | 아웃라인 생성(압력·속도 기반 폭) | **없음** — 저장소에 구현 없음 |
| `perfectFreehand` | 점 → 아웃라인 폴리곤 메인 함수 | **없음** — 저장소에 구현 없음 |
| `taper` / `easing` | 획 양끝 감쇠·완화 함수 | **없음** — 저장소에 구현 없음 |

모든 항목이 "없음"이므로 **전체 내재화가 필요하다**. Phase 3.2~3.5로 분기하여 아래 항목을 TDD로 구현한다.

## 내재화 계획(Phase 3.2~3.5)

원본 Perfect Freehand는 MIT이므로 원본 수식·알고리즘을 전체 내재화할 수 있다(license-policy.md 1절 `ok`).
원본 코드는 복사하지 않고, 동작·수식만 우리 언어로 재구현한다.

1. **`getStrokePoints`**: 입력 샘플 시퀀스를 시뮬레이션 점 보간으로 채운다.
2. **`getOutlinePoints`**: 압력·속도 기반 폭으로 스포인트 쌍을 아웃라인 점 쌍으로 변환한다.
3. **`perfectFreehand`**: 점 시퀀스를 받아 아웃라인 폴리곤을 생성한다(메인 함수).
4. **`taper` / `easing`**: 획 양끝·속도 기반 감쇠·완화 함수.

각 항목은 TDD(실패 테스트 우선 → 구현 → 커밋)로 구현하고, 골든값은 Perfect Freehand 원본(MIT 허용) 실제 실행 결과를
`apps/brush-lab/test-data/`에 `perfect-freehand-golden.json`으로 남긴다. 원본 실행 전에는
"우리가 기대하는 concept 동작" 기준으로 생성한다.

## 테스트

문서 검토만 수행(자동 테스트 없음). 구현 항목은 각 TDD 테스크에서 개별 테스트를 작성한다.

## 커밋

`docs(studio): Perfect Freehand 내재화 현황 감사 문서 추가`
