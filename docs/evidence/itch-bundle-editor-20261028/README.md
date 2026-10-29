# 구매 번들 실제 편집기 저장·복구·제작 결과 검증

2026-10-29 최종 소스 동결 뒤의 별도 loopback Vite 서버와 사용자 프로필을 사용하지 않는 headless Chromium에서 실행했다. 실제 제품 Studio host, 번들 패널, 배송 검증, 정본 자동저장 reader, 아카이브 내보내기·가져오기 UI와 PNG 내보내기 UI를 사용했다.

운영 API와 외부 HTTP·WebSocket은 차단했다. `auth/session`만 미인증 응답으로 처리했고, 나머지 API는 503으로 처리했다. API의 성공을 흉내 낸 계정·게시·원격 저장 검증은 하지 않았다. 정식 프로젝트 `.toonstudio` 저장 대화상자는 이번 범위에 포함하지 않았다.

## 실제 전체 편집기 왕복

1. 고유 `draftId`의 빈 문서에서 실제 번들 벤치 `cbv1-008-bench-1-1`을 클릭해 삽입했다.
2. 제품 OPFS journal과 worker SQLite reader에서 정본 자동저장을 읽었다.
3. 전체 페이지 reload 후 실제 자동 복구 DOM receipt를 확인했다.
4. 실제 **프로젝트 센터 → 아카이브 백업**을 눌러 592,072바이트 `.toonproject.zip`을 내려받았다.
5. 다른 빈 draft에서 실제 아카이브 가져오기 input으로 복구했다.
6. 제품이 SHA-256·CRC-32·MIME 검증과 자산 1개 복구를 알린 뒤 다시 내보냈다.
7. 두 아카이브를 실제 제품 importer로 읽어 본문 SHA, 출처 기록 전체, 요소 ID와 배치, attachment 목록이 같은지 비교했다.

본문은 588,254바이트 WebP이고 SHA-256은 `b9fe70a44aee3617d22a264f9bdaab1286d9bc9f5e55359b17ab35bb3f667a49`이다. 배치는 x=92, y=30, width=537, height=536으로 보존됐다. 실제 `pageerror`는 0건이다. ZIP 전체 해시는 내보내기 메타데이터 때문에 다르며, 비교 기준은 검증된 attachment와 문서 내용이다.

## 실제 PNG 제작 결과

왕복에 성공한 실제 아카이브를 같은 서버의 다른 격리 문서에서 제품 UI로 복구한 후, **내보내기 옵션 → 1× → PNG → 현재 페이지 다운로드**를 실행했다. 추가 기능이나 테스트 전용 렌더 경로를 사용하지 않았다.

다운로드한 실제 PNG는 720×1080이고 비백색 82,612픽셀, 벤치 색상에 해당하는 갈색 69,705픽셀을 포함했다. 이미지 서명·치수·색상 통계와 `pageerror` 0건을 확인했다. [실제 출력](./restored-page.png)은 UI 스크린샷이 아닌 다운로드한 제작 결과다.

## 완성 배경 아카이브 수정의 검증 범위

기존 writer는 `data:`만 자동 첨부하고 상대 경로 `frame.bg`를 외부 의존성으로 표시하지 않아, 번들 완성 배경의 실제 바이트가 빠질 수 있었다. 실제 park-garden WebP를 사용하는 `frame.bg`와 `image.src` 회귀 2개가 수정 전 실패했고, 수정 후 같은 이미지 바이트·출처·해시·배치를 왕복했다.

현재 문서가 참조하는 정식 번들 credit의 정확한 renderPath만 요청하고, 실제 바이트를 용량 제한 안에서 읽어 SHA를 대조한 뒤 기존 archive attachment 검증기에 전달한다. 같은 이미지는 한 번만 요청한다. 경로 불일치·본문 변조·HTTP 실패·용량 초과는 명시적으로 실패한다. 신뢰할 출처가 없는 기존 배경 URL은 임의 다운로드하지 않고 외부 의존성으로 알린다. 완성 배경의 full-host 선택 UI 왕복은 별도 검증이며 이 보고서가 통과했다고 주장하지 않는다. 현재 작품의 opaque 이미지 참조는 기존 인증 다운로드 포트가 반환한 manifest·descriptor credit·실제 Blob을 대조해 첨부한다. caller가 이미 공급한 본문은 추가 fetch 없이 기존 writer의 검증 후 같은 SHA 참조로 닫는다. 작품 컨텍스트가 없으면 원래 주소와 외부 의존성 경고를 보존하며 self-contained로 표시하지 않는다. 정적 읽기와 작품 다운로드의 30초 제한·caller abort, 이미 취소된 요청과 마지막 ZIP 진행 콜백의 취소도 회귀로 확인했다. 이 경로는 기존 포트의 정식 반환 계약을 주입한 writer/importer 회귀이며, 인증된 운영 서버 브라우저 검증은 아니다.

## 재실행

서로 다른 실행은 이전 실행이 끝난 뒤 서로 다른 빈 출력 폴더로 수행하고, 명령의 실제 종료 코드와 이번 실행의 report를 함께 확인한다. 기존 서버·사용자 브라우저는 종료하거나 재사용하지 않는다. 빈 loopback 포트를 확인한 뒤 저장소의 원래 Vite 설정을 사용한다.

```sh
pnpm_config_verify_deps_before_run=false \
NEST_API_URL=http://127.0.0.1:9 VITE_API_BASE= \
TOONSPECTRUM_VITE_CACHE_DIR=/tmp/toonstudio-itch-full-host-vite-20261028 \
pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port 5217 --strictPort
```

별도 터미널에서 실제 host 왕복을 실행한다. 결과는 기본 `/tmp/toonstudio-bundle-editor-20261028`에 저장된다. `TOONSTUDIO_BUNDLE_EDITOR_OUTPUT`으로 실행별 출력 폴더를 정할 수 있다.

```sh
pnpm_config_verify_deps_before_run=false \
TOONSTUDIO_BUNDLE_EDITOR_ORIGIN=http://127.0.0.1:5217 \
pnpm exec tsx scripts/verify-creator-bundle-editor.mts

pnpm_config_verify_deps_before_run=false \
TOONSTUDIO_BUNDLE_EDITOR_ORIGIN=http://127.0.0.1:5217 \
TOONSTUDIO_BUNDLE_EDITOR_PNG_ARCHIVE=/tmp/toonstudio-bundle-editor-20261028/restored.toonproject.zip \
pnpm exec tsx scripts/verify-creator-bundle-editor.mts
```

[기계 판독 검증 기록](./runtime-review.json)에 source 파일 해시, 자동 복구 receipt, 두 아카이브의 attachment·credit·배치, PNG 픽셀 통계, 차단한 네트워크 경계를 남겼다. 원본 ZIP과 원고 autosave JSON은 로컬 `/tmp`에만 두었다.
