# ADR-0027: 캐릭터 키트의 소품 슬롯을 장착 부위별 복수 슬롯으로 확장하는 제안

- 상태: Proposed
- 날짜: 2026-10-11
- 범위: `apps/character-lab/src/contracts/{outfit-port,character-kit,preset-vocabulary}.ts`, `scripts/verify-character-kit.mjs`,
  `apps/character-lab/docs/authored-kit-spec.md`, `tools/blender/character_kit/garment_presets.py`·`kit_manifest.py`
- 관련: [ADR-0026](0026-labs-experimental-apps-engine-selection-and-promotion.md)(실험 앱의 위치와 승격 절차),
  `apps/character-lab/docs/authored-kit-spec.md`(키트 계약 정본), `apps/character-lab/docs/webtoon-style-guide.md`
- 이 문서는 **제안만** 한다. 이번 변경에서는 `contracts/**`를 수정하지 않았고, 수용되면 별도 PR에서 아래 이행 계획대로 한 번에 바꾼다.

## 맥락

키트의 소품 슬롯은 하나다. `GarmentSelection.accessory`는 `AccessoryStyleId | null`(`outfit-port.ts` 70행)이고 색 키도 `accessory` 하나(`RECIPE_COLOR_KEYS`)며, 키트 기본값은
`accessory: null`(`KIT_DEFAULT_SLOTS`)이다. 키트는 지금 소품 6종을 파츠로 제공한다(2026-10-11, 베이스마다): 안경·귀걸이·초커(절차 생성), 리본·캡·헤드폰(Hyper3D 생성).
사용자는 이 중 **한 번에 하나만** 착용할 수 있다.

웹툰 캐릭터 제작 도구(SHAPER류)의 일반적인 흐름은 안경·귀걸이·목걸이처럼 서로 다른 부위의 소품을 함께 거는 것이다. 이번 작업에서 초커까지 만들어 6종이 모두 한 슬롯을 두고
경쟁하게 됐고, 그중 대부분은 서로 겹치지 않는 부위에 걸린다(예: 안경은 얼굴, 귀걸이는 귀, 초커는 목). 슬롯 하나는 "어느 부위의 소품인가"를 계약에 담지 못해 조합 가능성도 표현하지 못한다.

사실 확인(2026-10-11):

- 모든 소품 파츠는 머리 부착 morph 8개(`HEAD_BODY_MORPHS`)를 가진다. 초커도 머리 체형 morph를 쓴다(`authored-kit-spec.md` 367행).
- 소품 삼각형 예산은 파츠 하나당 6,000(`KIT_BUDGET.triangles.accessory`). 여러 개를 동시에 착용하면 합이 예산을 넘을 수 있어 장면 쪽 합산 예산이 필요하다.
- 소품은 `hides`(몸 영역 숨김)를 쓰지 않는다. 헤어 숨김 같은 상호작용은 계약에 없다(캡 아래로 헤어가 비치는 것을 이번에 확인했다).

## 결정(제안)

장착 부위(`mount`)를 계약에 넣고, 부위마다 슬롯 하나를 둔다. 슬롯 한 개짜리 `accessory`는 **읽기 호환 별칭**으로만 남긴다.

| mount | 소품 | 비고 |
| --- | --- | --- |
| `head-top` | 캡, 리본, 헤드폰 | 같은 부위 안에서는 하나만(캡+리본, 캡+헤드폰은 겹친다) |
| `face` | 안경 | |
| `ear` | 귀걸이 | 헤드폰과는 함께 못 쓴다(헤드폰이 귀를 덮는다) |
| `neck` | 초커 | `webtoon_style.neck_lift`가 만든 목 기둥 기준 |

### 계약 변경안

1. `GarmentSelection.accessories: Partial<Record<AccessoryMount, AccessoryStyleId>>`를 더하고 `accessory`는 읽기 호환용으로 둔다. 읽을 때 `accessory`가 있으면
   그 프리셋의 `mount` 하나로 옮긴다(저장된 레시피를 깨지 않는다). 쓸 때는 새 필드만 쓴다.
2. 색 키는 부위별로 `accessoryHead`·`accessoryFace`·`accessoryEar`·`accessoryNeck`을 더하고 `accessory`는 `accessoryHead`의 별칭으로 둔다. 색 키 하나를 공유하는 안(B)도
   있으나 안경 테와 초커가 같은 색이어야 한다는 제약이 부자연스러워 부위별을 제안한다.
3. 키트 `parts[].variants`에 `mount`를 선언하고, 검증기 V16/V17에서 같은 `mount`에 두 파츠가 동시에 켜지지 않는지, 비호환 쌍(`head-top`+`ear` 헤드폰 등)이 선언돼 있는지 확인한다.
4. 예산: `KIT_BUDGET.triangles.accessoryTotal`(장면 합산)을 더한다. 파츠당 6,000은 유지한다.

### 이행 계획(수용 시)

1. 계약·검증기·`authored-kit-spec.md`·테스트를 한 PR에서 함께 바꾼다(레시피 v1→v2 읽기 호환 테스트 포함).
2. `garment_presets.py`에 `mount` 필드, `kit_manifest.py`가 이를 `kit.json`에 쓰도록 하고 `test_garment_presets.py`에 소품마다 `mount`가 있는지 단언을 더한다.
3. 소품 상호작용(캡 아래 헤어 숨김, 헤드폰·귀걸이 충돌)은 이번 ADR 범위 밖이다. 별도 제안으로 다룬다.

## 대안

- **A. 합성 소품을 변형으로 제공**(안경+귀걸이 세트 등): 조합 폭발이다(6종이면 63가지). 거절.
- **B. 색 키 하나 공유 + 슬롯 배열**: 계약 변경이 가장 작지만 부위별 색을 못 칠하고, 같은 부위 충돌을 계약이 표현하지 못한다.
- **C. 현행 유지**: 비용이 없지만 소품 6종을 한 번에 하나만 쓰게 되어 키트의 조합 가치를 잃는다. 이번 작업의 기본값이다.

## 결과와 위험

- 저장된 레시피·프리셋 공유 링크와의 호환은 읽기 별칭과 버전 필드로 지킨다. 별칭을 언제 제거할지는 이 ADR이 정하지 않는다.
- 슬롯이 늘면 UI·기본값·검증기·`kit-preview.mjs`의 소품 인자(`--glb` 반복)가 함께 바뀐다. 변경 범위가 계약 전반이라 부분 적용은 금지한다.
- 현재 키트·도구는 이 제안과 무관하게 동작한다(소품 슬롯 하나, 6종).
