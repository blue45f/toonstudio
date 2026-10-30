# 구매 번들의 외부 텍스처 GLB 편입 — 2026-10-30

상태: **migration**. 별도 후속 브랜치의 준비 경로이며 main 병합·Worker 검증·장면 저장 왕복·운영 서빙 완료를 뜻하지 않는다. 권리와 출처는 [소유자 결정](itch-purchased-commercial-use-owner-decision-20261029.md) 및 현재 [팩별 원장](../../config/creator-bundle-pack-rights.json)을 따른다.

## 현재 입력과 해결할 문제

Nature Godot판의 `Models/`에는 2026-10-30 헤더 전수 대조 기준 GLB 3,300개가 있으며 모두 `../../Textures/atlas_nature.png`를 참조한다. 파일 수는 고유 형상 수가 아니다. 기존 자기완결 GLB 경로에 원본만 복사하면 텍스처 연결이 깨진다. 호환용 고정 `theme-packs.json`의 Nature 행은 `placeable: 0`으로 보존하고, 후속 브랜치의 새 내용 주소 카탈로그에는 3,300개를 편입했다. 준비·실제 제품 Worker·화면·운영 완료는 별도로 판정한다.

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

실행 증거는 로컬 `asset-reviews/itch-characters2-20261029-1xmbfu47/qa/atlas-nature-3300-union-20261030-r1/`의 `receipt.json`, `cleanup-audit.json`, `envelope/input/preparation-proof.json`에 보존한다. 이 준비 실행의 `productApplied`와 `studioRuntimeVerified`는 false다. 이 뒤의 소스 연결이 과거 준비 영수증의 범위를 바꾸지는 않는다.

파생본의 읽기 재생성 검사를 추가한 Python 소스는 회귀 105개를 통과했다. 기존 93개를 포함한 수이며 별개 성공 수로 합산하지 않는다. 실제 생성기를 private 5,229개 입력에 실행한 검사는 6.504초에 exit 0으로 끝났고, 모든 입력이 인입되고 기존 1,929개 전체 객체가 ID별로 보존됨을 확인했다. 결과 카탈로그 원문 SHA256은 `e855c272c15db1f75a7a398c93f01c9ce6ff27342f2b10b2707e4daf9abe3ce4`다.

## migration — 재현과 공개 카탈로그 연결

기존 `creator-bundle-local-ingest.json`과 고정 카탈로그는 10팩·1,929개의 역사 재현 계약으로 보존한다. 별도 [composite 설정](../../config/creator-bundle-composite-ingest.json)은 Git `4685be49e2c108ad1602fb1851670bdf6eca002d`의 v1 설정·투영을 실제 SHA로 고정하고, 현재 원본 1,929개와 atlas 파생 3,300개를 재생성해 전체 private 입력 및 새 공개 투영과 대조한다. `--check`는 4GB 입력을 다시 복사하지 않는다.

```bash
node scripts/rebuild-creator-bundle-composite-ingest.mjs \
  --library-root "$BUNDLE_LIBRARY_ROOT" \
  --input-root "$BUNDLE_ATLAS_INPUT" \
  --python python3 \
  --check
```

실행 위치는 저장소 루트다. `BUNDLE_LIBRARY_ROOT`에는 실제 원본 라이브러리, `BUNDLE_ATLAS_INPUT`에는 검증된 envelope의 `input/` 절대 경로를 지정한다. 원본만으로 최초 입력을 생성하는 명령과 구분한다. 읽기 검사도 원본·atlas·전체 descriptor·실제 바이트·현재 생성기의 권리/예산 판정·역사 에셋 보존·입력 불변을 확인한다.

2026-10-30 `edbed52dad660b64f440bc0db37ea336f8a73395` 작업트리의 관련 28개 입력을 고정한 실행은 Node 회귀 41개, 실제 private 발행기, 실제 전체 재현을 차례로 통과했다. 전체 164.026초 중 발행 34.141초·재현 125.144초였으며 전후 입력·manifest·proof가 같고 소유 process group 잔류도 0이었다. 이는 이후 앱 연결 코드의 타입·단위·브라우저 검증을 대신하지 않는다. 영수증은 `qa/atlas-release-reproduction-20261030-r1/`에 있다.

## migration — 웹 발행 쌍과 추가 3D 테마

[발행기](../../scripts/publish-creator-bundle-release.mjs)는 카탈로그 원문을 보존한 내용 주소 JSON, 그 카탈로그 SHA를 가진 내용 주소 인덱스, 웹 빌드에 고정하는 descriptor를 private 폴더에 원자적으로 만든다. 새 인덱스 SHA는 `a5e46f6cfbe92a53ab8aedae578a5160e7c5fe9dc9fa87d4e96b16e6fa7b9994`이고 304바이트다. 고유 GLB 객체와 논리 에셋은 이 입력에서 각각 5,229개·3,985,892,748바이트다. 기존 고정 인덱스를 새 합계로 덮는 명령은 실행하지 않았다.

후속 브랜치의 웹 기본 로더는 같은 descriptor의 catalog/index 원문 SHA·bytes와 기존 권리·합계 계약을 함께 검사한다. 검증된 기본 발행 객체 하나만 재사용하고, 명시 legacy/custom 포트는 매번 읽는다. 캐시 초기화·실패는 검증 캐시도 비우며 다른 발행의 늦은 응답이 현재 선택을 덮지 않도록 한다. 이 경로의 단위·타입·실제 UI 검증은 별도 단계다.

숲속 관찰 작업실과 정원 관찰 작업실은 실제 Nature 모델 8개와 기존 작업 장비를 조합하는 새 recipe다. 테마별 고유 source는 5개이고, 반복 배치는 기존 geometry/material/texture 공유 clone 경로를 따른다. 하드웨어 instancing·서로 다른 GLB의 atlas 공유·시각 품질·최고 성능을 검증했다고 주장하지 않는다. 작은 식물의 표시 부모만 정확한 모델 ID·역할에 맞춰 조정하며 원본 vertex·UV·재질은 바꾸지 않는다.

소스의 역사 1,929개 파일 보존만으로 실제 운영의 기존 발행과 같다고 단정할 수 없다. 운영 전 실제 legacy catalog/index 원문·합계·SHA와 롤백 상태를 읽어 비교해야 한다. R2·Worker 쓰기와 운영 배포는 아직 실행하지 않았다.

실제 Worker 전수 검사와 Nature 대표 렌더는 `atlas-20261030` 모드로 별도 실행한다. 기존 10팩과 Nature Lettuce를 합한 대표는 11개다. 종전 `licensed-20261029`의 기대 팩·대표 선택과 1,929개 증거를 새 5,229개 전체의 성공 증거로 재사용하지 않는다. 새 Native 연결도 실제 실행 전 코드이며 아직 Worker·GPU 성공으로 표시하지 않는다.

## 적용 완료에 필요한 다음 증거

- 같은 실행에서 원본·텍스처·파생 hash/bytes와 입력 불변을 확인한다.
- 현재 생성기와 실제 제품 Worker에서 파생 GLB를 검증하고 정상 이미지 decode를 확인한다.
- 실제 로더에서 원본 재질·UV·alpha·skin·motion을 확인하고 장면 저장·재열기·아카이브 왕복을 확인한다.
- Chrome과 macOS Safari Technology Preview의 정확한 버전·기기·GPU에서 같은 장면과 품질 조건으로 측정한다.
- 기존 1,929개 descriptor를 보존한 최종 공개 투영과 배포 계획을 대조한다. 파생 파일 생성 수를 ready 모델 수로 대체하지 않는다.
- 메인 병합과 운영 반영은 각각 최종 SHA·배포 ID·실서비스 스모크로 기록한다.

이미지 내부화는 압축 atlas bytes를 GLB마다 반복한다. 전체 팩을 준비한 뒤 저장·전송·실제 GPU 객체 사용을 따로 측정한다. 같은 이미지 hash를 가진 별도 decode를 하나의 GPU 객체로 계산하거나 품질을 낮춰 예산을 맞추지 않는다.
