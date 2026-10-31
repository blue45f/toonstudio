# LumaGrove 원본 품질을 보존하는 glTF 입력 — 2026-10-31

상태: **migration**. 로컬 입력 준비 경로를 구현하고 Luma 205개의 2K GLB를 실제 생성·재생성 대조했다. 새 카탈로그 발행, 실제 제품 Worker 검사, 장면 렌더와 저장 왕복, R2 업로드 및 운영 배포는 남아 있다.

## current — 원본과 기존 소비 계약

LumaGrove의 `models/glb`판에는 1024×1024 이미지가 내장되어 있고, `models/gltf`판은 별도 BIN과 2048×2048 `textures/LumaSolid.png`를 사용한다. 구매 원본은 수정하지 않는다. 2026-10-31 glTF 205개의 JSON 335,754바이트를 읽어 모두 단일 BIN과 같은 Solid 이미지 URI를 참조함을 확인했다. 이 관측은 렌더 품질 검증이 아니다.

기존 5,229개 카탈로그에는 Luma 모델이 없다. 기존 항목의 텍스처를 교체하는 작업이 아니라 Luma를 새 입력으로 편입한다. 기존 카탈로그·Nature 입력·역사 재현 설정은 보존한다. 런타임은 외부 리소스 없는 GLB와 정확한 바이트·SHA를 요구하므로 raw glTF URL을 카탈로그에 넣지 않는다.

## migration — 명시적인 원본 형식과 보존 검사

[별도 Luma recipe](../../config/creator-bundle-luma-intake.json)는 기존 owner와 `cbv1-ingest-231-lumagrovewonkywoods`를 사용하고 `sourceFormat: "gltf"`를 명시한다. 기존 [준비기](../../scripts/prepare-creator-bundle-atlas-intake.py)의 형식 생략 행은 종전 GLB 동작을 유지한다.

glTF 입력은 단일 로컬 BIN만 허용한다. 원문 JSON·BIN·승인 이미지의 크기와 SHA를 고정하고, 실제 읽은 BIN 길이를 `byteLength`와 직접 비교한다. 원본 BIN을 `write_glb()`로 포장한 뒤 기존 `normalize_bytes()`에 정확한 이미지 resolver를 전달한다. 원본 geometry·UV·skin·animation·material·sampler·기타 JSON과 이미지 바이트를 보존하고, URI 내부화에 필요한 변경만 허용한다.

모델·BIN·이미지의 팩 외부 이동, symlink, 미승인 URI, 여러 buffer, 길이 불일치, 계획 이후 입력 변경은 거부한다. 같은 원본 디렉터리를 여러 recipe 행이 선택해 목록 snapshot을 덮는 경우도 거부한다. 출력 manifest는 GLB `sourcePath`를 유지하고, 준비 proof에는 실제 glTF 경로와 BIN의 별도 출처를 기록한다. 생성과 재생성 검사는 같은 정규화 함수를 사용한다.

## current — 2026-10-31 실행 근거

기준 checkout은 main을 정상 fast-forward한 `778c2fbf076b3a1da9d883c5a362e43393b6833e`와 그 위의 이 변경이다. 이후 main의 검사 결과로 확대하지 않는다.

- Python 3.11.15에서 관련 합성 회귀 **48개**를 한 번 실행해 모두 통과했다. 기존 34개와 신규 14개이며, 30초 상한 안의 2.236초에 종료 코드 0이었다.
- 실제 Luma recipe의 `--check`는 **205개**를 검사하고 2.482초에 종료 코드 0이었다. 실행 전후 준비기·정규화기·recipe·권리 원장 SHA가 같았다. 영속 모델 출력은 만들지 않았다.
- 별도로 GreenTree와 DSEmace 두 모델의 2K GLB를 private 영역에 만들었다. 합계 5,442,260바이트이며 원본 BIN·UV·장면·재질·sampler와 PNG 원문을 대조했다. 두 모델의 1K GLB와도 geometry 및 장면 metadata가 같았다. 화면 A/B는 실행하지 않았다.
- 커밋 `6409e136f6f64e64cf3b7713cd8cfce9c0ed52f5`에서 같은 준비기·정규화기와 Luma recipe로 205개의 GLB를 실제 생성하고, `--verify-derived-root`로 전체 descriptor와 GLB 바이트를 원본 재생성 결과와 대조했다. 두 명령은 합계 10.155초에 종료 코드 0이었고 205개 모두 일치했다. 생성 GLB 합계는 **473,589,392바이트**다. 원본 입력·검사 대상·설정 pin과 당시 작업 소스는 변경되지 않았다.

로컬 증거는 `local-private:luma-fullquality-samples-20261031-r1`에 보관한다. 대표 모델 proof SHA는 `c293c31d897cfdc8a91ce35e353a3bd7889ecfad7a78049a49998e667436d398`, 205개 check 영수증 SHA는 `9d23838ce30ccc3b455681015877e3168d92a5c8cb3a73aff08ff5ccc2eb6547`이다. 구매·인증 정보와 원본 바이너리는 이 문서에 포함하지 않는다.

전체 생성·재생성 증거는 `local-private:luma-native-205-write-20261031-r1`에 별도로 보관한다. 완성 manifest SHA는 `a2eb3b344d7fa7a6b3c58b8d8516cfedea1f8fa65ac0e8448454a15d89edda2c`, 준비 proof SHA는 `af26c7be461664bceacbcc7d96a4edae5ee24cb3ce80264b55e5af9f0421a085`, 완료 영수증 SHA는 `97b4d1b64cef699dc8dfb652723bbcb8d720a4132640174bfc5ad1da27f144fc`다. 이 결과는 제품 Worker·화면 검증이나 공개·운영 반영을 뜻하지 않는다.

같은 커밋에서 Nature·Luma 결합 recipe로 역사 1,929개에 3,505개를 추가하는 첫 생성 명령은 87.741초에 종료 코드 0이었다. 생성 manifest에는 **5,434개·5,434파일·4,459,482,140바이트**가 선언되어 있다. 이어진 전수 재생성 대조는 남은 작업 예산 70.258초에서 `subprocess.TimeoutExpired`로 중단됐다. 전체 실행은 종료 코드 1이며, 생성 성공을 전체 바이트 검증 통과로 취급하지 않는다. 원본과 생성 자료·실패 기록을 보존하고 자동 재실행하지 않았다. manifest SHA는 `5a9e7846644840cbf669e211668b9aaedc4a265a622514fd0a2cc593a7826825`, 부분 실행 영수증 SHA는 `f2f5c95a8e797ff65af69e9de4f27f019df5a315dc267d318979bad3e1361964`이며 로컬 증거는 `local-private:nature-luma-native-5434-write-20261031-r1`에 보관한다.

## target — 재현과 서비스 연결

아래 명령은 저장소 루트에서 실행한다. 기존 Python 3.11 이상과 원본 라이브러리가 필요하다. 첫 명령은 읽기 검사이며, 두 번째 명령은 저장소·원본·기존 입력·`public`·`dist` 밖의 **새 private 경로**에만 출력한다. 세 번째 명령은 생성물을 원본부터 다시 만들어 전수 대조한다. 같은 출력 경로에 쓰기를 반복하지 않는다.

```bash
python3.11 -B scripts/prepare-creator-bundle-atlas-intake.py \
  --library-root "$BUNDLE_LIBRARY_ROOT" \
  --recipe config/creator-bundle-luma-intake.json \
  --check

python3.11 -B scripts/prepare-creator-bundle-atlas-intake.py \
  --library-root "$BUNDLE_LIBRARY_ROOT" \
  --recipe config/creator-bundle-luma-intake.json \
  --output-root "$BUNDLE_LUMA_ENVELOPE" \
  --write

python3.11 -B scripts/prepare-creator-bundle-atlas-intake.py \
  --library-root "$BUNDLE_LIBRARY_ROOT" \
  --recipe config/creator-bundle-luma-intake.json \
  --verify-derived-root "$BUNDLE_LUMA_ENVELOPE/input" \
  --check
```

다음 단계는 기존 5,229개를 보존한 composite 재현 연결과 내용 주소 카탈로그 발행이다. [Nature·Luma 결합 recipe](../../config/creator-bundle-nature-luma-intake.json)는 기존 두 recipe의 소유 팩 행을 그대로 함께 담으며 역사 1,929개에 Nature 3,300개와 Luma 205개를 추가할 입력을 정의한다. 이 recipe의 작성 자체는 5,434개 생성·검증 완료 증거가 아니다. 이후 제품 Worker와 같은 조건의 1K/2K 화면 A/B 및 장면 저장·재로드를 확인한다. 원본 해상도만으로 외관·FPS·메모리 개선을 단정하지 않는다. R2와 운영 반영은 정확한 main SHA, 현재 배포 게이트 및 기존 릴리스 절차를 별도로 충족해야 한다.
