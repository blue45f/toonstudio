# 관리형 AI 대체텍스트의 취소·저장·재열기 검증

**2026-11-23, 현재 동작(`current`)** · 기준 SHA `0d0a0df1a92b66de194441bc3efd31128eb3bda4` · 격리 작업트리 `/Users/hjunkim/.codex/worktrees/4d16/toonstudio` · 수정본은 같은 SHA 위의 로컬 변경이다.

**수정 후 데스크톱과 모바일 회귀 시험이 모두 통과했다.** 취소된 A 응답이 데스크톱 브라우저까지 도착해도 B 미리보기와 저장 원고에 들어가지 않았다. 모바일에서는 공급자 처리 여부를 알 수 없는 B 요청을 현재 선택에서 다시 보내지 않았다. 수정 대상은 두 가지였다. 관리형 실행을 중단하면 개인에게 요금이 청구될 수 있다고 안내했다. 모바일에서는 B의 처리 여부가 불명확하다는 모의 HTTP 409 응답을 원고 편집 충돌로 표시하고 즉시 재실행을 허용했다. 다른 기능의 확인 범위와 다음 시험은 [제품 AI 기능 목록](ai-feature-e2e-inventory-2026-11-23.md)에 있다.

## 시험 환경과 통신 경계

| 대상 | 실제로 사용한 경로 및 관찰 범위 |
| --- | --- |
| 편집 화면 | 전용 Vite DEV `http://127.0.0.1:47631/studio/canvas`. 한국어 Chromium 159.0.8154.6 데스크톱 1440×960, 터치 에뮬레이션 390×844. 독립 프로필을 순서대로 실행했다. 실제 모바일 기기는 시험하지 않았다. |
| 원고 | 제품 펜으로 합성 획 1개를 그리고 실제 브라우저의 기기 저장소를 읽었다. 제품 저장소 판독기는 OPFS 복구 저널과 SQLite 후보 중 최신 사본을 선택한다. 각 저장소에 동시에 기록됐는지는 이 시험에서 판별하지 않았다. 같은 원고를 새로고침해 다시 열고 제품 ‘캔버스에서 가져오기’의 RGBA와 원고 페이지 내용을 비교했다. |
| 모의 API | 지정한 출처의 `GET /api/auth/session`에 합성 작가 세션을, `POST /api/studio-ai/messages`에 합성 이미지 응답을 반환했다. POST 세 번째 시도부터는 모의 429가 되도록 설정했다. 다른 같은 출처 API·실시간 경로와 미허용 쓰기는 로컬 503으로 끝냈다. 같은 출처의 나머지 GET·HEAD만 DEV 서버에 연결됐다. |
| 외부 요청 | 브라우저 경로에서 출처를 먼저 대조하고 미허용 HTTP 요청을 `blockedbyclient`로 중단했다. WebSocket 전부 차단, 서비스 워커 차단, 기본 프록시는 미사용 loopback 47633, DNS는 `MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`. OS 외부 연결 허용 대상은 `localhost:47631` 한 곳이다. 브라우저 실행 설정(`.qa/ai-inventory-4d16/browser.mjs`) · OS 네트워크 설정(`.qa/ai-inventory-4d16/run-local-browser.sh`) |
| 공급자 | 실제 서버 세션·사용자 자료·API 키·외부 모델·결제 계정은 사용하지 않았다. 모의 응답의 `provider: anthropic`은 응답 형식의 시험값이다. 실제 모델의 품질, 공급자 처리·과금·할당량, 서버 측 보관이나 동기화는 미검증이다. |

실행마다 `https://deny-proof.invalid/check`와 허용 목록에 없는 `http://127.0.0.1:47634/check`를 각각 1회 탐침으로 사용했다. 두 요청 모두 경로 차단기에서 멈췄고 브라우저는 `TypeError`를 받았다. DNS 차단 외에 프록시 우회 목록 `<-loopback>;127.0.0.1:47631`, `--disable-background-networking`, `--disable-quic`, `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`를 사용했다. 실행 기록의 전체 요청 수에는 이 탐침과 JS·화면 자원도 들어간다. 아래 생성 수는 관리형 POST만 센 값이다.

## 실행 기록

| 실행 | 생성 수 | 화면·저장 결과 |
| --- | ---: | --- |
| 수정 전 데스크톱 진입 1 | 0 | DEV 주소까지 DNS가 차단돼 `ERR_NAME_NOT_RESOLVED`로 종료. 탐침 2회 포함 전체 HTTP 경로 관찰 3건. 로그(`.qa/ai-inventory-4d16/baseline/desktop/events.jsonl`) |
| 수정 전 데스크톱 진입 2 | 0 | 로컬 접속 후 180초 동안 편집기 준비를 기다리다 종료. 화면에는 편집기 열기 지연 안내가 남았다. 전체 1,817건, DEV WebSocket 차단 2회. 로그(`.qa/ai-inventory-4d16/first/desktop/events.jsonl`) · 마지막 화면 문구(`.qa/ai-inventory-4d16/first/desktop/failure-ui.txt`) |
| 수정 전 데스크톱 본 시험 | A 1, B 1 | A 중단 후 B로 교체하고 A 응답을 반환했다. 브라우저 도착 1회, 기존 A 결과의 DOM 관찰 0회. B 200 결과·경고·수동 다시 만들기, 원고 재열기, 추가 번역 무호출 확인. 전체 6,919건, DEV WebSocket 차단 4회. 로그(`.qa/ai-inventory-4d16/cold/desktop/events.jsonl`) · 단계별 기록(`.qa/ai-inventory-4d16/cold/desktop/desktop-ui/steps.json`) |
| 수정 전 모바일 본 시험 | A 1, B 1 | A 전송은 제품 취소로 `net::ERR_ABORTED`. 모의 서버는 A를 늦게 반환했고 클라이언트 수신은 관찰되지 않았다. B 409의 재실행 버튼이 활성이고 잘못된 충돌 안내가 떠서 시험을 중단했다. 이 실행은 결과 후 재열기까지 도달하지 않았다. 전체 2,967건, DEV WebSocket 차단 2회. 로그(`.qa/ai-inventory-4d16/before/mobile/events.jsonl`) · 실패 화면(`.qa/ai-inventory-4d16/before/mobile/mobile-ui/중단시점.png`) |
| 수정 후 모바일 첫 진입 | 0 | 편집기는 열렸으나 저장된 기준 획을 읽지 못했고, 이어 대체텍스트를 여는 버튼을 15초 내 찾지 못해 종료했다. 전체 2,873건, 합성 세션 GET 1회, DEV WebSocket 차단 2회. 로그(`.qa/ai-inventory-4d16/after/mobile/events.jsonl`) |
| 수정 후 모바일 재시험 | A 1, B 1 | 통과. A는 네이티브 취소, B는 모의 409. 현재 이미지 재실행 비활성, Ctrl+Enter 추가 0회, 지연 A 문구 0회. 원고 페이지·픽셀의 재열기 해시 일치. 전체 5,905건, 합성 세션 GET 2회, DEV WebSocket 차단 4회. 로그(`.qa/ai-inventory-4d16/after-warm/mobile/events.jsonl`) · 수정 후 409 화면(`.qa/ai-inventory-4d16/after-warm/mobile/mobile-ui/05-B-결과.png`) |
| 수정 후 데스크톱 첫 진입 | 0 | 브러시 퀵 슬롯의 로컬 DB 작업이 120초 안에 끝나지 않았다는 안내가 떴다. 기준 획 저장과 창 도구 준비도 기한을 넘겨 A 실행 전에 종료했다. 전체 3,253건, 합성 세션 GET 1회, DEV WebSocket 차단 2회. 로그(`.qa/ai-inventory-4d16/after/desktop/events.jsonl`) · 화면 문구(`.qa/ai-inventory-4d16/after/desktop/failure-ui.txt`) |
| 수정 후 데스크톱 재시험 | A 1, B 1 | 통과. 취소한 A가 브라우저에 1회 도착했고 DOM의 A 표식은 0회였다. B 200 설명·판독 불가 경고, 저장본과 원고 픽셀 복구, 추가 번역 요청 0회 확인. 전체 6,934건, 합성 세션 GET 2회, DEV WebSocket 차단 4회. 로그(`.qa/ai-inventory-4d16/after-warm/desktop/events.jsonl`) · B 결과(`.qa/ai-inventory-4d16/after-warm/desktop/desktop-ui/05-B-결과.png`) |

8개 독립 브라우저 실행에서 미허용 출처 탐침 **16회 전부 차단**, 관리형 모의 POST **총 8회**였다. A/B 시험 네 번에서 A·B 각각 한 번씩, 기동·준비 단계에서 끝난 네 번에서는 0회였다. 최종 회귀 두 번의 생성 요청은 합계 4회다.

수정 전 초기 두 번의 진입 실패는 같은 작업트리의 별도 시도다. DEV 모듈 준비 시간과 캐시 상태는 실행에 따라 달랐다. 첫 진입 성공률이나 제품의 일반적인 시작 시간을 추정할 수 없다. 미허용 상태 조회·인증 티켓 등이 보낸 요청에도 로컬에서 503을 반환했으며, Vite의 자동 새로고침용 WebSocket도 차단했다. 시도별 차단 수(`.qa/ai-inventory-4d16/cold/desktop/summary.json`) · DEV 로그(`.qa/ai-inventory-4d16/vite-before.log`)

## 화면과 저장 결과

- **동의와 대기.** 대화상자 열기·이미지 A 선택 후 생성 0회. ‘설명 만들기’를 누르면 A 1회. 실행 중에는 ‘다른 이미지’가 비활성이고 상태 영역에 작업 중 문구와 경과 시간이 나타났다. 사용자가 중단하고 B를 선택한 시점에도 누적 1회였다. 실행 전 화면(`.qa/ai-inventory-4d16/cold/desktop/desktop-ui/01-A-실행전.png`) · 대기 화면(`.qa/ai-inventory-4d16/cold/desktop/desktop-ui/02-A-대기.png`)
- **취소한 A의 늦은 응답.** 데스크톱에서 첫 A 전송에만 브라우저의 요청 취소 신호를 분리해 응답 본문이 실제 요청 처리 코드에 도달하도록 했다. B 선택 후 A가 도착해도 미리보기의 이미지와 기본 대체텍스트가 유지됐다. DOM에서 A 문구·입력값·이미지 alt가 나타난 횟수는 0이었다. B도 사용자가 한 번 눌렀을 때만 전송됐고, B 한 줄 설명과 판독 불가 경고가 표시됐다. B 대기(`.qa/ai-inventory-4d16/cold/desktop/desktop-ui/04-B-대기.png`) · B 결과(`.qa/ai-inventory-4d16/cold/desktop/desktop-ui/05-B-결과.png`)
- **저장과 재열기.** 수정 전 데스크톱에서 기준·응답 직후·재열기 후 원고의 획 ID와 페이지 해시 `7f6ee7af…e11cf9`가 같았다. 저장본에서 A·B 설명 표식은 0개였다. 제품이 다시 읽은 1045×1568 캔버스의 RGBA 해시 `2aa7f22c…2b96a3`도 같았다. 닫았다 다시 연 도우미에는 업로드 이미지와 결과가 남지 않았다. 사용자가 복사해 작품에 붙이는 동작은 이번 시험에서 실행하지 않았다. 저장 및 픽셀 원값(`.qa/ai-inventory-4d16/cold/desktop/desktop-ui/steps.json`) · 재열기 화면(`.qa/ai-inventory-4d16/cold/desktop/desktop-ui/06-원고-재열기.png`)
- **추가 무호출 시험 한 가지.** 데스크톱 번역 도우미에 합성 대사를 적고 원문·대상 언어를 한국어로 선택했다. 같은 언어 경고가 나타나고 ‘번역하기’가 비활성화됐다. Ctrl+Enter와 닫기를 거쳐 추가 생성 0회를 확인했다. 동일 언어 화면(`.qa/ai-inventory-4d16/cold/desktop/desktop-ui/07-번역-동일언어.png`)

A·B의 입력 바이트 SHA-256은 각각 `3b68d988…f85651b`, `a4c590d2…3d2882`였다. 브라우저에 넣은 PNG와 실제 모의 POST에 실린 이미지의 전체 해시를 기록했다. 관찰한 유효 응답 및 모의 409와 별개로, 현재 관리형 구조화 출력 파서는 형식에 맞지 않는 답을 받으면 처음 입력과 오류 설명을 담은 **별도 형식 복구 POST를 최대 한 번** 보낼 수 있다. 이번 결과로 모든 응답에서 한 번만 요청한다고 보증할 수 없다. 모의 요청 기록(`.qa/ai-inventory-4d16/cold/desktop/events.jsonl`) · [관리형 파서](../../apps/web/src/shared/ai/assist/assist-managed-runtime.ts)

## 재현한 결함과 수정 범위

1. **중단 안내의 비용 문구.** 관리형 A를 중단했을 때 두 화면 모두 개인에게 요금이 청구될 수 있다고 안내했다. 수정본은 요청 당시 경로를 기억하고 관리형 중단 안내를 개인 키 경로와 구분한다. 수정 전 중단 화면(`.qa/ai-inventory-4d16/cold/desktop/desktop-ui/03-A-중단.png`) · [대체텍스트 대화상자](../../apps/web/src/domains/creator/ai/assist/AssistAltTextDialog.tsx)
2. **처리 여부를 알 수 없는 응답.** 모바일 B는 공급자 처리 여부를 확인 중이라는 로컬 409를 받았다. 화면은 “다른 곳에서 내용이 변경되었습니다”라고 안내했고 같은 이미지를 곧바로 다시 실행할 수 있었다. 수정본은 서버의 해당 응답을 인식해 “공급자가 이미지를 처리했는지 아직 확인할 수 없어요. 중복 실행을 막기 위해 이 요청은 다시 보내지 않아요.”라고 알린다. 열린 창에서 현재 선택 중인 이미지는 재실행을 막고, 창을 닫았다 다시 열거나 파일을 다시 선택하면 새로 명시 실행할 수 있다. 서버 오류 코드가 따로 없어 현재 응답 문구에 의존한다. 수정 전 응답과 버튼 상태(`.qa/ai-inventory-4d16/before/mobile/mobile-ui/steps.json`) · [오류 판별](../../apps/web/src/shared/ai/assist/assist-managed-runtime.ts)

수정 후 모바일 390×844에서 409 안내는 화면 안에 340×40px로 보였다. B의 재실행 버튼은 비활성 상태였고 단축키를 누른 뒤에도 누적 POST는 2회였다. 원고 획 ID와 페이지 해시 `307afa3e…a0eb55`, 재열기 전후 RGBA 해시 `eb24a733…681f93`가 유지됐다. 수정 후 모바일 단계별 기록(`.qa/ai-inventory-4d16/after-warm/mobile/mobile-ui/steps.json`)

수정 후 데스크톱에는 관리형 중단 안내가 표시됐고 정상 B 결과만 나왔다. 재열기에서 같은 원고 획과 페이지 해시 `87e800f2…8c91db`, 렌더링 해시 `4dddebfe…c6b3b9`를 확인했다. 수정 후 데스크톱 단계별 기록(`.qa/ai-inventory-4d16/after-warm/desktop/desktop-ui/steps.json`)

## 다음 확인 대상

다음 로컬 모의 시험 후보는 **번역 도우미의 유효한 언어 쌍**이다. 합성 말풍선 두 줄을 입력하고 실행 전 0회, 한 번 누른 뒤 번역 POST 수, 도착한 줄 순서, 창을 다시 열었을 때의 결과를 확인할 수 있다. 대체텍스트의 무효 JSON에 대한 별도 형식 복구 POST와 캐시가 없는 DEV 환경의 SQLite 준비 지연은 독립 재현 대상으로 남긴다.

실제 공급자 E2E는 미실행이다. 지정 조직·프로젝트의 포함 허용량, 초과 과금 강제 차단과 전송 범위를 닷이 독립 확인하고 별도 지시가 있어야 다음 단계로 진행한다. 위 로컬 결과는 제품의 실제 비용이나 공급자의 수신·보관·삭제를 입증하지 않는다.

관련 자동 시험은 3개 파일 63개가 통과했다. 409 응답에 집중한 별도 실행은 2개 파일에서 지정한 5개가 통과했고, 필터 밖 50개는 그 실행에서 제외됐다. 저장소 검증은 lint·Secretlint·문서·아키텍처·Studio 초기 로드 의존성 검사까지 통과했다. 전체 타입검사는 Mac에서 다른 타입검사와 자원 사용이 겹쳐 해당 작업의 워커를 SIGTERM으로 종료했다. 종료 전 컴파일 오류 진단은 보고되지 않았고, 전체 타입검사와 전체 하네스의 통과 판정은 남아 있다. 관련 시험(`.qa/ai-inventory-4d16/alttext-focused.log`) · 409 시험(`.qa/ai-inventory-4d16/ambiguous-focused.log`) · 하네스 로그(`.qa/ai-inventory-4d16/harness-verify.log`)
