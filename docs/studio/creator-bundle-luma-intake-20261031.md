# LumaGrove 원본 품질을 보존하는 glTF 입력 — 2026-10-31

상태: **migration**. Luma 205개의 2K GLB와 Nature를 포함한 5,434개 통합 입력을 실제 생성·재생성 대조했다. 별도 작업 브랜치에 5,434개 내용 주소 카탈로그·index·descriptor와 composite 설정을 연결했다. 기존 5,229개 보존 회귀와 실제 원본 기반 composite 재현 검사를 통과했다. 제품 로더의 Web 회귀 57사례도 통과했다. 이 문서에 기록한 실행 근거는 관련 회귀와 원본 재현까지다. 실제 제품 Worker, 장면 렌더와 저장 왕복, R2 업로드 및 운영 배포는 남아 있다. 전체 하네스와 코드 게시 결과는 PR·릴리스 증거에서 구분한다.

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

별도 읽기 검증을 `520c2a48999f8b622032c5976e159a67b64edd6d`에서 실행해 GLB **5,434개**의 해시와 파생 **3,505개**의 재생성 바이트·descriptor가 모두 일치함을 확인했다. 종료 코드 0, 82.562초였으며 원본과 통합 입력은 변경되지 않았다. 이 결과로 첫 전수 대조의 미완료 상태를 해소했다. 완료 영수증 SHA는 `94822be13548c4a0d34676467ef9850195ec778cb0a0b95b80166f5c2daac242`다.

같은 소스에서 기존 생성기와 publisher를 순차 실행해 비공개 게시 산출물 **3개**를 만들었다. 생성기 5.610초, publisher 42.270초, 전체 49.350초에 종료 코드 0이었다. 새 카탈로그의 5,434개 ID와 모델 경로·바이트·SHA가 manifest와 일치했고, 기존 5,229개 asset 객체 전체와 theme·팩 순서를 보존했다. Nature 3,300개·Luma 205개, 49개 팩이며 새 예산 탈락과 해시 불일치는 0개다. 이 작업의 공개 경로·원본·통합 입력·운영 서비스 쓰기는 없었다.

이 브랜치의 게시 후보는 [내용 주소 카탈로그](../../apps/web/public/assets/3d/environments/bundle-v1/theme-packs.b4e5df1cec78a1a2c79e6314fd452074baf12b64d4d0bd1e99153cd824ca0da5.json), [index](../../apps/web/public/assets/3d/environments/bundle-v1/deploy-index.b90b58fd4c87e9fddb2e39a7f1cbeb75ce93f0bc19f4f1cc053ac696e55e377c.json), [별도 composite 설정](../../config/creator-bundle-nature-luma-composite-ingest.json)을 사용한다. 카탈로그 원문은 **1,379,215바이트**이며 SHA는 파일명과 같다. index의 files와 고유 objects는 각각 **5,434개**, bytes와 objectBytes는 각각 **4,459,482,140바이트**다. 기존 Atlas composite 설정과 5,229개 내용 주소 카탈로그·index는 역사 재현용으로 보존한다. 새 설정의 연결 자체를 composite 재현 검사나 실제 브라우저 검증의 통과로 취급하지 않는다.

비공개 카탈로그 게시 준비 완료 영수증 SHA는 `cba3574e91c7c074424a1c16ddbb451401618557ed07b676ca96896cdc3efa4a`이며 로컬 증거는 `local-private:nature-luma-catalog-release-5434-20261031-v2`에 보관한다. 제품 Worker와 GPU 검증, R2 업로드 및 운영 배포 결과는 이 영수증에 포함되지 않는다.

별도 브랜치 `codex/virtual-studio-nature-luma-release-20261031`에서 main `d4144662b97c8f8a02d6043d2bef7171cdd45573`을 정상 통합한 작업 소스로 관련 Node 회귀 4개 파일의 **78사례**를 실행해 모두 통과했다. 실패·취소·skip·todo는 각각 0개이며 종료 코드 0, 31.429초였다. 이전 검증의 사례 수와 합산하지 않는다.

이어 새 composite 설정을 지정한 기존 `--check`를 실제 원본과 통합 입력으로 실행했다. 역사 **1,929개**와 파생 **3,505개**, 총 **5,434개·4,459,482,140바이트**가 재현됐고 종료 코드 0, 150.027초였다. 기존 Python 내부 제한 120초와 출력 한도 16MiB를 유지했으며, 임시 재생성 뒤 원본 fingerprint·통합 입력·현재 생성기 결과·projection을 대조했다. 영속 모델 출력은 만들지 않았고 실행 소스 37개·입력 메타데이터 3개와 작업 트리 상태는 전후 같았다. 전체 실행은 183.489초였으며 완료 영수증 SHA는 `9e401d765e64292c37a84cf4f7e8dc3e7ac1fb240d1b88b8b14f965180d64e53`이다. 로컬 증거는 `local-private:nature-luma-release-source7-20261031-r1`에 보관한다.

이 실행은 Node 회귀와 원본 기반 재현 검사다. Web Vitest·전체 하네스·실제 제품 Worker·GPU 화면·R2·운영 검증 결과로 확대하지 않는다. 이 실행은 main 통합과 새 연결의 정상 커밋·푸시 전 작업 소스로 수행했다. 최종 코드 게시 상태는 PR과 릴리스 증거에서 별도로 확인한다.

같은 작업 브랜치 안에 기존 lockfile과 버전으로 의존성을 오프라인 설치한 뒤, 환경 진단과 정식 `test:root` 경로의 Web 회귀 2개 파일을 실행했다. 설치 30.287초, 환경 진단 1.073초, Web 검사 5.225초에 각각 종료 코드 0이었으며 **57사례 전부 통과**했다. 새 작업 트리의 workspace 링크를 검사했고 실제 도구 버전은 Node **v24.22.1**, pnpm **11.4.0**이었다. 설치 명령에만 `CI=1`을 적용했으며 Git hook 설정 `.husky`, 소스 45개, 전체 작업 diff와 인덱스의 mode·blob·path가 전후 같았다. 기존 lockfile·제품 코드·테스트 설정·도구 버전은 바꾸지 않았다.

Web 검사에는 새 descriptor의 실제 정적 catalog/index 원문을 불러오는 로더와 기존 5,229개 전체 보존, 완료 응답 누락·과거 응답 거부가 포함된다. 완료 응답은 합성 조건이며 실제 R2와 브라우저 화면을 검증한 결과는 아니다. 전체 44.841초의 완료 영수증 SHA는 `4f75edba1468632970a7b89b724a2f07dd23d5e78e14eae5daf09ccbd434cefa`다. 전체 하네스와 정상 커밋·푸시, 실제 Worker·GPU·운영 검증의 실행 결과는 각 게시·릴리스 단계에서 별도로 기록한다.

입력 검증과 렌더 원본 보존 도구의 선행 변경은 [PR #2605](https://github.com/blue45f/toonstudio/pull/2605)로 2026-10-31에 main 병합됐다. 이후 이 후속 브랜치를 main `133b45489c36faeccccbb339a9c4be6c3f61b843`으로 정상 fast-forward하고, 새 연결 7개 파일을 원문 그대로 복원했다. 직전 검증 입력과 비교해 소스·제어 파일 49개와 설치 메타데이터 3개는 동일했고, 이전 통합 작업 트리와 달라진 main 파일은 협업 음성 관련 6개뿐이었다. 동기화 증거 SHA는 `75c09d0bb240b9ea18638ab0d835bef90d3557b49ac0b020ee54ab63e9309557`다. 각 후속 전체 검증은 해당 실행 기록에 고정한 main 기준으로 구분한다.

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

코드 게시에는 자체 의존성 환경의 제품 로더 회귀 검사와 전체 하네스, 정상 커밋·푸시 절차를 적용한다. 고정된 게시 후보의 제품·운영 적용은 별도 검증과 릴리스 절차를 따른다. [Nature·Luma 결합 recipe](../../config/creator-bundle-nature-luma-intake.json)는 기존 두 recipe의 소유 팩 행을 그대로 함께 담으며 역사 1,929개에 Nature 3,300개와 Luma 205개를 추가할 입력을 정의한다. 이 recipe의 작성 자체는 5,434개 생성·검증 완료 증거가 아니다. 이후 제품 Worker와 같은 조건의 1K/2K 화면 A/B 및 장면 저장·재로드를 확인한다. 원본 해상도만으로 외관·FPS·메모리 개선을 단정하지 않는다. R2와 운영 반영은 정확한 main SHA, 현재 배포 게이트 및 기존 릴리스 절차를 별도로 충족해야 한다.
