# 구매 번들의 외부 텍스처 GLB 편입 — 2026-10-30

상태: **migration**. 별도 후속 브랜치의 준비 경로이며 main 병합·Worker 검증·장면 저장 왕복·운영 서빙 완료를 뜻하지 않는다. 권리와 출처는 [소유자 결정](itch-purchased-commercial-use-owner-decision-20261029.md) 및 현재 [팩별 원장](../../config/creator-bundle-pack-rights.json)을 따른다.

## 현재 입력과 해결할 문제

Nature Godot판의 `Models/`에는 2026-10-30 헤더 전수 대조 기준 GLB 3,300개가 있으며 모두 `../../Textures/atlas_nature.png`를 참조한다. 파일 수는 고유 형상 수가 아니다. 기존 자기완결 GLB 경로에 원본만 복사하면 텍스처 연결이 깨진다. 공개 Nature 행은 아직 `placeable: 0`이므로 파일을 준비한 수와 서비스에서 선택할 수 있는 수를 구분한다.

후속 [준비 설정](../../config/creator-bundle-atlas-intake.json)은 정확한 Nature owner·Godot 팩 루트·`Models` 디렉터리·원문 URI와 PNG 상대경로를 지정한다. `generatedAt`은 재현 가능한 입력 레시피의 시각이며 실제 실행·검수 시각은 별도 영수증으로 기록한다. 다른 팩을 추가할 때도 현재 원장과 공개 투영의 정확한 팩·ingest 관계 및 실제 텍스처 참조를 먼저 대조한다.

## 구현 경로

[normalizer](../../scripts/normalize_studio_asset_glb.py)의 `OwnerPackImageBindings`를 명시한 호출만 같은 팩 안의 부모 상대경로를 처리한다. 기본 API와 CLI의 외부 URI 거부, 전역 `safe_file`은 유지한다. 원본 mesh·UV·skin·animation·재질을 재작성하지 않고 원래 BIN prefix, 이미지 bytes, 내부화에 필요한 변경만 허용한 전체 JSON을 대조한다. 출력에는 원본과 다른 파생 SHA·바이트 수를 부여한다.

[준비 CLI](../../scripts/prepare-creator-bundle-atlas-intake.py)는 레시피·권리 원장·공개 JSON 투영을 함께 확인하고 지정 디렉터리 전체를 결정적인 순서로 처리한다. 원문 URI는 명시된 바인딩에서만 찾고 같은 이름의 텍스처를 다른 팩에서 추정하지 않는다. 원본·기존 입력은 보존하며 신규 private envelope 안의 `input/manifest-v2.json`과 파생 GLB를 원자적으로 게시한다. 선택한 기존 입력을 합칠 때는 descriptor·ID·경로·SHA·바이트를 보존해 별도 복사한다.

명령은 저장소 루트에서 실행한다. Python 3.11로 검증했으며 원본 라이브러리와 출력 부모 디렉터리가 존재해야 한다. 아래 쓰기 예시는 Nature 단독 입력을 만든다. 기존 입력과 합치려면 검증한 `input/`의 절대 경로를 `--existing-root` 인자로 추가한다.

```bash
python3 scripts/prepare-creator-bundle-atlas-intake.py \
  --library-root "$HOME/3d-asset-library" \
  --recipe config/creator-bundle-atlas-intake.json \
  --check

python3 scripts/prepare-creator-bundle-atlas-intake.py \
  --library-root "$HOME/3d-asset-library" \
  --recipe config/creator-bundle-atlas-intake.json \
  --output-root "$HOME/.local/share/toonstudio/asset-reviews/atlas-nature-intake-20261030" \
  --write
```

`--check`는 영속 출력을 만들지 않는다. `--write`의 출력은 저장소·원본 팩·기존 입력·`public`·`dist` 밖의 새 경로여야 한다. 현재 배포 인덱스나 원격 객체를 변경하지 않는다. 생성기의 다음 입력은 새 envelope의 `input/`이며, 기존 생성기·권리·GLB·예산 검사를 계속 통과해야 한다.

## current — 로컬 준비 실행

2026-10-30 후속 작업트리를 main `4685be49e2c108ad1602fb1851670bdf6eca002d`에 동기화한 뒤, 변경 파일의 SHA를 고정해 Python 회귀 93개를 실행했다. 실패·오류·skip은 0개였다. 실물 Lettuce 표본은 현재 저장소 normalizer로 원본 BIN 7,284바이트·허용한 전체 JSON 변경·PNG bytes·1024² RGBA 픽셀 보존을 확인했다. 이는 렌더링 결과 검증이 아니다.

같은 변경 소스로 Nature 전체 3,300개와 기존 1,929개를 새 private 입력에 합치는 준비 명령을 한 번 실행했다. 120초 상한 안의 68.216초에 exit 0으로 끝났고 합계 5,229개·3,985,892,748바이트였다. 기존 descriptor 전체와 준비 소스·HEAD·기존 manifest의 전후 해시는 동일했다. 소유 PID·process group의 잔류 0을 별도 확인했다. 결과 manifest SHA256은 `d1af2c67b6e35e96dfb0c1e2dae658face389b273faff0f5dc34029c2ad9f997`이다.

실행 증거는 로컬 `asset-reviews/itch-characters2-20261029-1xmbfu47/qa/atlas-nature-3300-union-20261030-r1/`의 `receipt.json`, `cleanup-audit.json`, `envelope/input/preparation-proof.json`에 보존한다. `productApplied`와 `studioRuntimeVerified`는 false다. 공개 카탈로그는 아직 기존 1,929개이며 R2와 운영 서비스를 변경하지 않았다.

## migration — 재현과 공개 카탈로그 연결

기존 `creator-bundle-local-ingest.json`은 원본을 그대로 복사하는 10팩·1,929개와 현재 공개 projection SHA를 정본으로 사용한다. Nature 파생본의 source ID·SHA·proof sidecar를 이 계약에 억지로 넣지 않는다. 기존 복사 입력과 atlas 파생 입력을 함께 재현·검사하는 명시적인 후속 계약이 필요하다. 공개 projection을 바꿀 때는 기존 에셋을 ID로 묶어 path·bytes·SHA·tris·팩 소속을 보존하고 새 전체 합계와 현재 배포 인덱스를 함께 대조한다.

실제 Worker 전수 검사와 Nature 대표 렌더도 다음 범위에 추가해야 한다. 종전 `licensed-20261029`의 기대 팩·대표 선택과 1,929개 증거를 새 5,229개 전체의 성공 증거로 재사용하지 않는다.

## 적용 완료에 필요한 다음 증거

- 같은 실행에서 원본·텍스처·파생 hash/bytes와 입력 불변을 확인한다.
- 현재 생성기와 실제 제품 Worker에서 파생 GLB를 검증하고 정상 이미지 decode를 확인한다.
- 실제 로더에서 원본 재질·UV·alpha·skin·motion을 확인하고 장면 저장·재열기·아카이브 왕복을 확인한다.
- Chrome과 macOS Safari Technology Preview의 정확한 버전·기기·GPU에서 같은 장면과 품질 조건으로 측정한다.
- 기존 1,929개 descriptor를 보존한 최종 공개 투영과 배포 계획을 대조한다. 파생 파일 생성 수를 ready 모델 수로 대체하지 않는다.
- 메인 병합과 운영 반영은 각각 최종 SHA·배포 ID·실서비스 스모크로 기록한다.

이미지 내부화는 압축 atlas bytes를 GLB마다 반복한다. 전체 팩을 준비한 뒤 저장·전송·실제 GPU 객체 사용을 따로 측정한다. 같은 이미지 hash를 가진 별도 decode를 하나의 GPU 객체로 계산하거나 품질을 낮춰 예산을 맞추지 않는다.
