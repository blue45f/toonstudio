# 기존 ACL을 보존하는 0121 전용 migration

- 상태: **current** — 0121 전용 정본 실행 경로. 실제 운영 반영은 별도 승인 SHA·CI·TLS·writer drain 조건을 충족해야 한다.
- 적용 대상: `0121_studio_bg3d_six_pass_bundle` 한 건. 정본 SQL과 SHA-256은 수정하지 않는다.
- 운영 위치·기존 single-owner 선택은 [인프라 지도](./infrastructure-map.md)가 정본이다.

## 실행 전 경계

`scripts/run-bg3d-bundle-preserving-acl-migration.mjs`는 일반 migration runner의 manifest,
체크섬·provenance·채택 marker 검증과 durable lock·claim·applied/failed 기록을 재사용한다.
기존 ledger·Auth·Studio·Graph·storage ACL을 다시 적용하지 않는다.

기존 1~120 원장이 정상이고 pending이 0121 하나인 경우만 적용한다. 이미 적용됐다면 체크섬과
새 객체·권한을 확인한 뒤 건너뛴다. drift, failed/applying, 다른 pending, 원장 밖 항목,
marker 누락, 0121 미기록 상태의 선행 신규 객체는 자동 채택·복구하지 않는다.
`adopt`, `repair`, `reset`이나 기존 onpod shadow patch를 이 경로에서 사용하지 않는다.

release SHA는 체크아웃 HEAD와 같고 origin/main의 조상이어야 한다. 운영 checkout은 tracked·untracked
변경이 없어야 한다. `--allow-loopback`과 실제 loopback endpoint를 함께 검증한 disposable 시험만
후보 WIP 실행을 허용하며, 그 결과를 clean main SHA의 릴리스 증거로 표시하지 않는다.

## TLS와 공개 CA

기본 production 연결은 기존 URL allowlist, system CA, `verify-full`과
`channel_binding=require`를 유지한다. 상속 `PGSSLROOTCERT`, `SSL_CERT_FILE`,
`SSL_CERT_DIR`로 신뢰를 바꾸지 않는다.

공급자의 인증된 관리 채널로 확보한 공개 CA 파일은 `--public-ca-file`에 절대 경로로 명시한다.
PEM CA 인증서만 허용하며 private key, 상대 경로, symlink, 잘못되거나 만료된 인증서를 거절한다.
검증한 파일의 지문을 각 psql 실행 직전에 다시 대조하고, 해당 명령의 libpq 환경에만 전달한다.
전역 trust store와 앱 환경변수는 변경하지 않는다. 네트워크에서 읽은 미검증 peer 인증서를
자동으로 신뢰하지 않는다. 파일 형식 검사는 공급자 출처의 진위를 대신하지 않는다.

disposable `--allow-loopback`에 공개 CA를 명시하면 URL에도 정확한 TLS query 두 항목이 필요하며,
실제 psql은 verify-full과 SCRAM channel binding을 요구한다. CA 없는 기존 loopback 시험 예외는
그대로지만 TLS 검증 증거로 세지 않는다. CA가 있어도 SAN/CN 호스트 검증과 실제 연결이 성공해야 한다.

## Plan과 apply

DB 연결 값은 기존 로컬 secret store에서 `MIGRATION_DATABASE_URL`로 주입하고 출력하지 않는다.
다음은 인자 형태이며 값은 승인된 실제 값으로 지정해야 한다.

```sh
node scripts/run-bg3d-bundle-preserving-acl-migration.mjs \
  --mode plan \
  --release-sha <승인한-40자리-main-SHA> \
  --runtime-database-role <기존-runtime-role> \
  --runtime-role-mode single-owner \
  --public-ca-file /absolute/path/provider-attested-ca.pem
```

`plan`은 원장·역할·신규 객체·default ACL을 읽고 기존 권한 지문을 반환한다.
실제 Studio writer를 drain한 뒤에만 mode를 `apply`로 바꾸고 아래 두 인자를 함께 제공한다.

```text
--confirmation APPLY-TOONSPECTRUM-PRODUCTION-MIGRATIONS
--writer-state-confirmation NO-STUDIO-WRITERS
```

확인 문구를 자동 생성하거나 writer가 없었다고 추정하지 않는다. apply는 다른 DB client backend가
남아 있으면 거절한다. 이 시점 검사는 운영자가 적용 동안 writer drain을 유지할 책임을 대체하지 않는다.
유휴 연결도 검사하며, 일반 migrator에게 다른 역할의 `backend_type`이 NULL로 보이면
그 세션도 보수적으로 거절한다. 통계 조회 권한을 새로 부여하거나 비가시 연결을 없는 것으로 세지 않는다.

API와 독립된 엄격 TLS 관리 runner 및 소비자 재접속 차단 경로를 먼저 확보한다.
관리 경로 확보 전에는 API를 pause하지 않는다. paused API의 exec를 runner로 사용할 수 없다.
배너나 일시적인 빈 pool은 drain 증거가 아니다. GUI·health·관측 연결까지 정상 종료하고,
drain 이후 보존 기준선을 다시 기록한 뒤 적용과 검증이 끝날 때까지 이 상태를 유지한다.

## 기존 권한과 새 객체

기본 `separated` 모드는 기존 분리 역할 검증을 유지한다. 기존 `single-owner` 모드는 명시적으로
선택해야 하며 session/current/runtime 역할과 DB 소유자가 같고 LOGIN 가능·비슈퍼유저·비CREATEDB·
비CREATEROLE·비REPLICATION·비BYPASSRLS·직접 membership 없음·public 사용/생성 권한을 읽기 확인한다.
역할·membership·기존 테이블 권한을 만들거나 고치지 않는다.

정본 migration SQL을 그대로 실행하고 새 BG3D 두 표에만 정본 최소 ACL builder를 적용한다.
기존 namespace·relation·열 ACL·RLS·policy·function/type ACL·역할·membership·default ACL·DB 소유권의
전후 지문이 다르면 원장 완료를 거절한다. 새 private 표/함수에 제삼자 권한을 전파할 default ACL도
재작성하지 않고 사전에 거절한다. 기존 원장은 PUBLIC 노출 여부를 읽기 검사한다.

단일 소유자에게도 새 표의 일반 DML은 명시 ACL로 제한한다. 소유자의 고유 관리·자기 권한 재부여
능력까지 제거했다는 뜻은 아니다. 전체 `verify-production-database-capabilities`는 분리 역할을
강제하므로 single-owner 성공을 그 verifier의 전체 통과로 표시하지 않는다.
기존 권한 보존·새 두 표 ACL·실제 API readiness 결과를 각각 기록한다.

## 실패와 롤백

연결·CA·SAN·사전 원장 검증 실패는 claim과 DDL 전에 멈춘다. 적용 중 실패는 정본 failed/applying
경계를 보존하며 자동 재실행·수동 SQL·adopt/repair로 넘기지 않는다. 원인과 실제 상태를 확인한다.

이 경로는 기존 문서를 V5로 변환하거나 기존 행을 삭제하지 않는다. 롤백 때도 새 표와 봉인된
revision을 보존한다. API·정적 웹을 전환하려면 V5를 읽을 수 있다고 검증한 롤백 대상이 먼저 있어야 한다.
기존 정상 이미지라는 이유만으로 V5 호환성을 가정하지 않으며 DB 객체 삭제를 롤백에 포함하지 않는다.
