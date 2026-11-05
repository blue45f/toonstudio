# ToonStudio 복구 묶음 독립 검토 — 2026-11-05

상태: current 읽기 전용 검토. 확인 시각 `2026-11-05T11:30:41Z`.
기존 checkout·Git ref·index·archive를 수정하지 않았다. 검사 과정에서 별도 `/tmp` index와
검사용 텍스트 사본만 사용했다. 원격 clone·인증·push·PR·merge·배포·전체 빌드·타입 검사는 실행하지 않았다.

## 판정

최종 보존 묶음의 무결성과 **각 기준 커밋을 확보한 경우의 변경 복구 가능성**을 확인했다.
원본의 tracked 수정37개 + 신규135개, 검증 main의 tracked 수정34개 + 신규135개가 빠짐없이 보존되어 있다.
다만 묶음은 기준 Git 객체·전체 소스·설치 의존성·dist가 없는 **증분 체크포인트**다.
이 cloud checkout이 사라지고 원격 기준 커밋에도 접근할 수 없으면, 묶음만으로 전체 프로젝트를 복원할 수 없다.
이는 해시 검증 실패와 별개인 복구 전제 조건이다.

## 무결성 결과

검사 대상: `/workspace/scratch/toonstudio-commercial-deliverable-2026-11-05.tar.gz`

- 크기 `22,228,586` bytes.
- SHA-256 `22ce7831d20896297b960f8ac70e7f42af3e331bd92efa6dfb62e6a5255b0912`.
- 외부 `.sha256` 영수증과 일치한다.
- 외부 regular 파일27개 중 `SHA256.json` 자체를 제외한26개가 선언한 크기·해시와 모두 일치한다.
- 동일 이름 staging 디렉터리의27개 파일도 최종 tar 내용과 모두 일치한다.
- 중첩까지 regular 파일362개를 다시 해시했다. 중복 경로·절대 경로·`..` 이동·symlink·hardlink·장치 항목은 없다.
- 두 신규 파일 archive의 각135개는 per-file manifest의 경로·크기·해시와 모두 일치하며 추가 미등록 항목도 없다.
- 후보 평가 archive의51개 파일도 내부 `archive-manifest.json`과 모두 일치한다. manifest 자체를 합치면52개다.
- `superseded-remotion-math.tar.gz`의13개 regular 파일도 재귀 해시 목록에 기록했다. 이 archive는 현재 코드로 복구할 대상이 아니다.
- 압축된 전체 타입 보고서를 해제한 SHA-256은
  `a4f8d5858f37352e854c4a7fc42cb09cc3f864d291e1665ff2c0bded0296ea57`로 선언값과 일치한다.
  원 보고서는 `complete:true`, 진단0이다. 이번 검토에서 타입 검사를 다시 실행한 것은 아니다.

전체 경로별 재귀 해시·기준별 대조 결과:
`/tmp/toonstudio-recovery-review-resumed-2026-11-05.json`.
이 JSON의 SHA-256은 `0002c01f12d01cfc380d988228bd3a3cda4ecce848d9339bb74937eea8b14640`다.
검증 스크립트는 `/tmp/toonstudio-recovery-audit-resumed-2026-11-05.py`에 별도 보존했다.

## 체크포인트 완전성

| label | 기준 HEAD | tracked patch | 신규 파일 | 결과 |
| --- | --- | --- | --- | --- |
| `original-checkpoint` | `8d315c85d6fde4a3a30255612c756d3e299a95b0` | 37개 | 135개 | 현재 `git diff --binary HEAD`와 patch 바이트 동일, 신규 파일 전부 동일 |
| `validated-main` | `2c626df4000fcfc32318faa793a61bea3ef0901b` | 34개 | 135개 | 현재 `git diff --binary HEAD`와 patch 바이트 동일, 신규 파일 전부 동일 |

실제 현재 index를 건드리지 않고 `GIT_INDEX_FILE`이 가리키는 별도 `/tmp` index에
`git read-tree <각 base>`를 실행한 뒤 `git apply --cached --check --whitespace=nowarn -`로
각 patch를 검사했다. 두 경우 모두 exit0이다. 전체 재구축 checkout을 별도로 생성한 것은 아니다.

원본에는 이번 재개 이후 생성된 다음2개 파일이 이미 추가되어 있었으며, 이전 묶음 누락으로 판정하지 않았다.

- `docs/evidence/commercial-model-rights-2026-11-05/main-ownership-check.json`
- `docs/evidence/commercial-model-rights-2026-11-05/recovery-library-receipt.json`

이후 생성될 같은 권리 후속 조사 디렉터리와 `docs/reports/*-rights-followup*`도 기존 체크포인트 범위 밖이다.
후속 결과까지 보존하려면 기존 묶음을 덮어쓰지 않고 새 보존본을 만들어야 한다.

두 checkout에서 Mixbox·Remotion 이름의 tracked 파일과 `packages/product-tour-film` 경로를 합쳐
각23개 파일을 기준 HEAD와 대조했다. 변경0개다. root manifest의 관련 dependency 선언도 동일하며,
lockfile diff에 Mixbox·Remotion 변경 줄이 없다. 별도 superseded archive를 덮어써 복구하면 이 상태를 훼손하므로
정상 복구 대상은 선택한 label의 patch와 신규 파일 archive로 한정한다.

## 모델·비밀정보 범위

재귀 파일 해시362개 중 배포 검사 스크립트에 고정된 다음3개 모델의 바이트 해시와 일치하는 항목은 없다.

- Tag2Pix `ae01698835b99a009533ebbcf840d416a32bee0c0f4c9be060c21ab2084491cc`
- AnimeGANv2 Paprika `7cb5bf08d7778a8f4e25f1e654fdc24d56dc9b6cbb9c1db42e4f9d0425e7fe62`
- Face Paint v2 `54ce55c73dc974c24fa55cf1204577a6181c7e86d312a3a07f798bbbd99d4ee2`

파일 이름만으로 검사한 결과도 아니며, 아카이브 안의 파일 확장자를 바꾼 동일 바이트도 이 대조 범위에 포함된다.
변환·재압축·가중치 재포장은 동일 해시 대조로 보증하지 않는다.

**모든 모델 바이너리가 없는 묶음은 아니다.** 별도 평가 archive에는 `light_paprika` 후보의
원 checkpoint2개, SavedModel4개, 변환 ONNX1개가 있다. 변환 ONNX는
`431f2b1c7a3ab31fbee32fcae193e4e65b2304484e0a646a481d1a61351a17a8`이며 기존 제품 Paprika와 다르다.
후보 archive에는 출처 영수증·LICENSE·README가 함께 있고 `isolated candidate failed acceptance;
no production migration`으로 기록되어 있다. 이번 복구 검토는 그 후보의 권리 적합성을 새로 승인하지 않는다.
후속 모델 권리 조사와 별개로 외부에 배포 가능한 파일 묶음이라고 단정하면 안 된다.

archive 경로에 실제 `.env`, 키 파일, credential 파일은 없다. 실제 checkout의 ignored env·secret 파일은 열지 않았다.
검사용으로 분리한 텍스트331개에 저장소 Secretlint 권장 규칙을 적용해 exit0·탐지0을 확인했다.
실행 로그의 비밀값을 출력하지 않았으며 생성한 원 JSON도 탐지 항목이 없다.
이는 패턴 기반 탐지 결과이며 모든 형태의 민감정보 부재를 수학적으로 증명하는 것은 아니다.
`cloud-validation-environment` 기록에는 운영 프로젝트·주소·변수 이름 등 비밀값 외의 운영 메타데이터가 있으므로
불특정 공개용 산출물로 분류한 것은 아니다.

묶음의 `restrictedOrUnresolvedModelsStillBundled:3`은 **검증한 dist에 남은3개**를 뜻한다.
별도 `integrated-main-model-release-check.json`이 그 경로·해시를 기록한다.
이 숫자를 보존 tar 안에 원 모델3개가 들어 있다는 의미로 읽으면 잘못이다. 복구한 기본 소스에는 기존 모델이
기준 Git 트리를 통해 다시 제공되므로, 복구 또는 빌드 성공도 상용화 완료를 뜻하지 않는다.

## 기준 소스와 검증의 연결

외부 README·`verification-summary.json`·최종 main 참조 영수증은 다음 상태를 정확히 구분한다.

- 전체 웹26,231개 타입 검사·API3프로젝트·관련 테스트·실제 bundle은
  `2c626df4000fcfc32318faa793a61bea3ef0901b + 해당 task 변경`에 대한 결과다.
- `994e5ba34df98b6bcf1cb46c567456924a89dd68`에는 patch 적용성과 경로 충돌 유무만 확인했다.
  그 main을 새로 빌드하거나 타입 검사했다는 주장은 없다.
- 원 canonical 명령의 마지막 outer exit를 보존하지 못한 사정과 API stage 별도 exit0 재확인도
  summary에 그대로 남아 있다.
- `verification/toonstudio-readonly-preservation-review-2026-11-05.md`의123/92 신규 파일 수와
  당시 `origin/main=2c...`는 앞선 검토 시점의 기록이다. 최종135개 범위와994 참조를 판정할 때에는
  최상위 `verification-summary.json`과 최종 영수증을 사용해야 한다.

## 복구 전제와 실행 예시

다음은 향후 승인된 별도 작업 디렉터리에서 실행할 예시이며 이번 검토에서 실행하지 않았다.
기존 원본 또는 검증 checkout에 적용하지 않는다.

전제 조건:

1. `blue45f/toonstudio`를 읽을 수 있는 정당한 원격 접근 권한 또는 같은 기준 커밋의 신뢰할 수 있는 로컬 Git 사본.
   현재 cloud Git object store에는 두 기준 커밋과994가 모두 존재하지만 원격 clone·인증은 이번에 시험하지 않았다.
   원격의 이동·삭제·접근 상실 상황까지 묶음이 해결하지는 않는다.
2. Git, tar/gzip, SHA-256 도구, Python3. Node `24.16.0`과 `pnpm@11.4.0`은 현재 저장소의 고정 기준이다.
   `.gitattributes`에는 LFS 필터가 없고2c Git 트리에 submodule 항목도 없다.
3. frozen lockfile 패키지를 받을 수 있는 registry 연결 또는 완전한 로컬 package cache,
   설치 script가 만드는 workspace link와 필요한 원래 native/prebuilt 산출물.
   묶음에는 `node_modules`·pnpm store·dist가 없다.
4. 전체 타입 검사와 빌드는 다른 고메모리 작업과 병렬로 실행하지 않는다. 검증된16GiB 환경에서
   타입 worker heap8GiB·관측 최대RSS약8.05GiB이며 build Vite heap은12GiB다.
   이는 모든 호스트에서의 상한 보장은 아니다.
5. 배포 secret과 운영 계정 접근은 복구 archive와 별도다. 소스 복구·로컬 검증에 운영 secret을 복사할 필요는 없다.
   기본 checkout에 있던 제한·미확인 모델에 대한 상용 출시 해결도 별도다.

```bash
# archive와 sha256 파일이 있는 디렉터리에서 무결성부터 확인한다.
sha256sum -c toonstudio-commercial-deliverable-2026-11-05.tar.gz.sha256
mkdir -p /tmp/toonstudio-restore-envelope-2026-11-05
tar -xzf toonstudio-commercial-deliverable-2026-11-05.tar.gz \
  -C /tmp/toonstudio-restore-envelope-2026-11-05

# 정당한 repository 접근 권한이 전제다. 검증받지 않은 인증정보를 명령에 삽입하지 않는다.
git clone --no-checkout https://github.com/blue45f/toonstudio.git \
  /workspace/toonstudio-restored-2c626df4
git -C /workspace/toonstudio-restored-2c626df4 checkout --detach \
  2c626df4000fcfc32318faa793a61bea3ef0901b

git -C /workspace/toonstudio-restored-2c626df4 apply --check \
  /tmp/toonstudio-restore-envelope-2026-11-05/toonstudio-commercial-deliverable-2026-11-05/validated-main.patch
git -C /workspace/toonstudio-restored-2c626df4 apply \
  /tmp/toonstudio-restore-envelope-2026-11-05/toonstudio-commercial-deliverable-2026-11-05/validated-main.patch
tar -xzf /tmp/toonstudio-restore-envelope-2026-11-05/toonstudio-commercial-deliverable-2026-11-05/validated-main-new-files.tar.gz \
  -C /workspace/toonstudio-restored-2c626df4

cd /workspace/toonstudio-restored-2c626df4
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
```

patch 적용 전에 외부 `SHA256.json`의 전체 항목을 검증하고 신규 파일을 푼 뒤에도 선택한 label의
per-file manifest와 대조한다. 원본을 복구할 때는 위의 main 기준과 `validated-main`3개 파일을 혼용하지 않고
`8d315c85d6fde4a3a30255612c756d3e299a95b0`과 `original-checkpoint`3개 파일로 함께 바꾼다.
`superseded-remotion-math.tar.gz`와 후보 평가 archive는 이력·조사용이므로 일반 소스 복구 과정에 풀지 않는다.
검사 실패 시 새 복구 디렉터리에서 중단하고 기존 checkout을 수정하지 않는다.

## 남은 중요한 공백과 추가 보존 방안

최상위 README의 복구 개요는 정확하지만 exact checkout·적용 명령·toolchain·의존성 확보 조건이 생략되어 있다.
위 절차가 이를 보충한다. 원격 clone이 필요 없는 독립 보존본을 만들려면 기준 소스나 Git bundle을
별도로 확보해야 한다. 다만 완전한 Git bundle에는 기존 제한·미확인 모델과 이력까지 들어가므로,
현재의 원 모델을 포함하지 않은 차분 묶음과 같은 공개·배포 조건으로 취급할 수 없다.
권리와 보관 범위를 확인한 비공개 보존소에서 기준 커밋·객체 도달성·해시·복원 시험을 별도로 관리해야 한다.
이번 검토를 위해 기존 repo에 ref를 추가하거나 bundle을 생성하거나 외부로 전송하지 않았다.

이번 증거는2026-11-05의 변경 보존과 검증 대상의 정확한 표기를 확인한다.
최신 main의 새 필수 검사·모델 권리 해결·기능 동등성·상용 출시 준비는 별도 작업으로 남는다.
