# 상용 라이선스 작업 복구

상태: **current / 2026-11-05 검증·작업 보존본 복구 절차**. 운영 배포 절차가 아니다.
현재 모델 권리 상태와 새 검증은
[후속 기록](../reports/commercial-license-pr-readiness-2026-11-05.md)을 먼저 확인한다.

## 보존 범위와 필요한 입력

비공개 ChatGPT Library에 첫 `toonstudio-commercial-deliverable-2026-11-05.tar.gz` 검증 보존본과
후속 `toonstudio-commercial-recovery-2026-11-05.tar.gz` 버전을 저장했다. [영수증](../evidence/commercial-model-rights-2026-11-05/recovery-library-receipt.json)은 해당
첫 버전의 해시·크기·파일 식별자를 기록한다. 후속 버전이 생기면 버전별 영수증과 내부 README를
먼저 대조한다. 이름만 같다는 이유로 서로 다른 버전의 patch·신규 파일을 섞지 않는다.

첫 보존본은 다음 두 checkout을 각각 patch + 신규 파일 archive + 개별 hash로 보존한다.

| label | 정확한 base commit | 검증 상태 |
| --- | --- | --- |
| original-checkpoint | `8d315c85d6fde4a3a30255612c756d3e299a95b0` | 원본 작업 보존, 전체 검증의 기준 아님 |
| validated-main | `2c626df4000fcfc32318faa793a61bea3ef0901b` | 전체 타입·테스트·번들 검증 당시 기준 |

이 archive 자체에는 `.git`, 전체 base tree, 설치된 dependencies, `dist`, 실제 secret/env가 없다.
따라서 **이 archive만으로 전체 저장소를 재구성할 수 없다**. 접근 권한이 있는
`https://github.com/blue45f/toonstudio`의 정확한 base 객체 또는 별도로 승인된 base 백업이 필요하다.
전체 이력을 담는 Git bundle은 원래 제한 모델을 포함할 수 있어 업로드하지 않았다.
후속 버전 1에는 base63dcf937→head7a118fc4의 새 commit·객체만 담은 증분 Git bundle을 추가했다.
원래 제품 모델 3종 blob이 새 객체에 포함되지 않았음을 별도로 검증했다. 버전 1의 내부 README에는
bundle verify/fetch와 207개 변경 파일 전체 내용 overlay의 복구 방법이 있다. 이 또한 정확한 base
객체는 별도로 필요하며, 뒤의 예시는 첫 보존본 v0에만 적용한다.
후속 source overlay가 제공되면 변경 파일의 전체 내용을 base 접근과 별도로 읽어 복구할 수 있지만,
그 overlay도 전체 앱 또는 완성된 독립 배포물은 아니다.

## 별도 디렉터리에서 검증하고 적용

전제: 본인에게 허가된 저장소 읽기 권한, Git, Python 3, Node 24.19.0, pnpm 11.25.0 또는
프로젝트의 고정 packageManager 지원 환경. 새 로그인·토큰 발급·키 이동은 이 절차의 자동 단계가 아니다.
아래 명령은 **새 복구 디렉터리**에서 실행한다. 기존 dirty checkout에 덮어쓰지 않는다.

```sh
# 다운로드한 archive의 버전별 SHA-256을 먼저 대조한다.
sha256sum toonstudio-commercial-deliverable-2026-11-05.tar.gz
tar -tzf toonstudio-commercial-deliverable-2026-11-05.tar.gz
tar -xzf toonstudio-commercial-deliverable-2026-11-05.tar.gz

# 소유한 저장소를 새 경로에 준비하고 첫 보존본 validated-main을 복구하는 예다.
git clone --filter=blob:none --no-checkout https://github.com/blue45f/toonstudio.git toonstudio-recovered
git -C toonstudio-recovered switch --detach 2c626df4000fcfc32318faa793a61bea3ef0901b
cd toonstudio-recovered
git apply --check ../toonstudio-commercial-deliverable-2026-11-05/validated-main.patch
git apply ../toonstudio-commercial-deliverable-2026-11-05/validated-main.patch
tar -tzf ../toonstudio-commercial-deliverable-2026-11-05/validated-main-new-files.tar.gz
tar -xzf ../toonstudio-commercial-deliverable-2026-11-05/validated-main-new-files.tar.gz
git diff --check
git status --short --branch
```

원본 label을 복구하려면 base·patch·신규 파일 세 가지를 모두 original-checkpoint의 값으로 바꾼다.
후속 PR head를 복구할 때는 그 버전 README의 정확한 commit을 따른다. 최신 main에 무조건 patch를
적용하거나 문맥 충돌을 강제로 넘기지 않는다. archive member의 절대 경로·`..`·symlink가 없는지
확인하고, 내부 SHA256.json 및 신규 파일 manifest의 해시도 대조한다. 독립 재귀 검토 영수증은
검토 당시 첫 archive의 무결성에 대한 증거이며 새 버전의 무결성을 자동 보증하지 않는다.

## 설치와 검증

위 디렉터리에서 고정 registry dependencies를 설치한다. 실제 API·DB·provider secret은 복구본에
없으며 운영 연결이나 테스트를 위해 다른 환경에서 복사하지 않는다.

```sh
pnpm install --frozen-lockfile --prefer-offline
pnpm run prebuild
pnpm harness:check
pnpm run typecheck
pnpm run build:bundle
pnpm run check:studio-bundle
pnpm run audit:restricted-models
```

현재 Tag2Pix/Paprika가 남아 있으므로 마지막 명령의 exit 1은 예상되는 상용 배포 차단 결과다.
이를 통과로 바꾸려고 모델을 먼저 지우거나 정책을 완화하지 않는다. 테스트·CI·필수 검사는 별도로
실행하고, 같은 입력 snapshot의 실제 결과만 기록한다. 실패하면 새 복구 디렉터리를 보존해 원인을
확인하며 원본 checkout을 reset/clean하거나 운영 환경을 변경하지 않는다.

주석형 `.env.deployment-reference.local`은 원래 각 checkout에 mode 600·Git 제외 상태로 저장했지만
archive에는 넣지 않았다. 필요한 이름·기존 저장 위치·미확인 항목은
[클라우드 참조 문서](../reports/cloud-validation-environment-2026-11-05.md)를 따른다.
