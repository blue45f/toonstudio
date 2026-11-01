# 구매 Plasticine 재질의 실제 제품 브라우저 검증

실제 `/studio/bg3d`의 guest UI에서 다음 대표 3개만 순서대로 검사한다.

- `emaceart-plasticine-01-native-8k`
- `emaceart-plasticine-01-godot-2k`
- `emaceart-plasticine-11-godot-2k`

원본 선택만으로 PBR 요청이 추가되지 않는지, 적용 후 실제 채널·색 공간·반복·normal 설정과
자연스러운 제품 렌더 프레임·PNG 픽셀 변화가 생기는지 확인한다. 제품 UI로 내 템플릿 저장,
재질 해제, reload 후 빈 장면 확인, 저장한 템플릿 재적용과 원본 선택 복원까지 이어진다.
문서·세션·OPFS·재질·렌더러를 직접 주입하거나 제품의 추가 프레임을 요청하지 않는다.

## 실행 준비와 명령

구매 권한이 있는 원본 PNG 59개가 카탈로그 URL에 대응하는
`apps/web/public/assets/virtual-studio/purchased-materials-v1/plasticine/maps/`에 있어야 한다.
이 폴더의 원본 payload는 Git에 포함하지 않는다. 실행 전 카탈로그의 정확한 파일 집합,
크기와 SHA256을 스트리밍 대조한다. 현재 합계는 1,938,819,011바이트이며,
원본을 축소·변환·복제하거나 다른 해상도로 대체하지 않는다.

먼저 별도 터미널에서 소유한 loopback 서버를 시작한다. 저장소와 새 캐시 경로는 절대 경로다.

```sh
node apps/web/tools/browser-harnesses/plasticine-materials/source-server.mjs \
  <저장소의_절대_경로> 5199 <아직_없는_외부_캐시_절대_경로>
```

서버의 `ready` JSON을 확인한 다음 실행한다. 서버는 제품 Vite 설정을 사용하고 env 파일을
로드하지 않으며, loopback·strict port·HMR 비활성·의존성 사전 최적화 완료를 확인한다.
제품 모듈 alias나 API 성공 mock을 추가하지 않는다.
실제로 여는 route·정밀 편집·View·Templates와 관측기 entry를 변환하고, Vite 8.3.4의
실제 pre-transform 대기열이 비었는지 확인한 뒤 ready를 낸다. 이 dev 입력 준비는
cold 제품 로딩 성능을 측정하거나 보증하는 절차가 아니다.

```sh
node apps/web/tools/browser-harnesses/plasticine-materials/browser.mjs \
  --repo <저장소의_절대_경로> --expected-head <40자리_HEAD> \
  --base-url http://127.0.0.1:5199/ \
  --observer-url http://127.0.0.1:5199/tools/browser-harnesses/plasticine-materials/passive-entry.ts \
  --out <아직_없는_결과_폴더의_절대_경로> \
  --browser-binary <소유한_Chrome_for_Testing_바이너리의_절대_경로> \
  --scope core-3 --work-ms 800000
```

결과 폴더는 소스 밖의 새 디렉터리를 사용한다. ignored QA 결과 폴더나 저장소 밖의 경로를
권장한다. 드라이버가 만든 Chrome과 context는 드라이버가 종료하고, 소유 서버의 종료와
포트·잔여 프로세스 확인은 실행자가 맡는다. 실패 시 자동 재시도·재클릭은 하지 않는다.

DOM 대기는 15초, 원본 채널 로딩은 120초, 전체 작업은 800초, 정리 예비 시간은 60초다.
실제 Apple/Metal WebGL2·최대 texture 8K 이상을 요구하며 software renderer를 거부한다.
원본 8K를 포함한 실제 decode 크기·채널 URL·색 공간을 검사한다. 원래 PNG 판정인
변경 픽셀 100개 초과·최대 채널 차이 3 초과·색상 3개 초과를 유지한다.

`passive-entry.ts`는 같은 app Vite 그래프의 R3F store·실제 scene/interaction 객체를 읽는다.
별도 미러나 다른 R3F 사본을 사용하지 않는다. 변경 중 제품도 검증할 수 있도록 clean 상태를
강제하는 대신 HEAD, 관련 범위의 tracked 변경·신규 소스, 카탈로그, 공개 검증 소스의 SHA256을
실행 전후 대조한다. 검증 중 제품이나 검증 소스를 편집하면 실패한다.

## 증거와 한계

`receipt.json`, 대표별 JSON·PNG, `events.json`을 남긴다. 실패 시 원래 오류를 유지하면서
가능한 DOM·이미지 완료 상태·resource 완료 시각·미완료 재질 요청 진단을 추가한다.
진단 실패를 성공으로 바꾸거나 대기 시간을 늘리지 않는다.

로컬 원본 SHA256 사전 대조와 브라우저 HTTP 완료·200 상태·실제 decode 관측은 별도 증거다.
HTTP 응답 body의 SHA256을 검증했다는 주장은 하지 않는다. 사전 원본 59개 대조는
19개 재질 전체의 브라우저 검증을 의미하지 않는다. 라우팅으로 HTTP 캐시가 비활성화될 수 있다.
실제 API·계정·외부 공급자 요청과 WebSocket은 차단하며 성공 응답으로 대체하지 않는다.
해당 차단의 Chrome resource 오류와 Vite WebSocket 오류만 예상된 콘솔 기록으로 구분하며,
그 외 콘솔 오류와 페이지 예외는 실패로 판정한다.

2026-11-01 `materials-r1`은 Chrome for Testing 156.0.8078.4 / Apple M2 Max Metal에서
대표 3개 모두 적용·템플릿 재열기까지 통과했다. 실행 전후 제품/QA 소스가 일치했고
브라우저가 종료됐다. 대표별 적용·재열기의 변경 픽셀은 18,529~18,533개로 원래 기준을 통과했다.
최초 통과 뒤 공개 receipt의 대표 목록 기록과 예상 밖 콘솔 오류 검사를 보강했으므로,
최종 게시 입력은 보강된 도구의 새 실행 결과와 구분해 기록한다.

이 검증은 Safari·설치형 Chrome·WebGPU 성능·장시간 메모리 안정성·GLB 내보내기·운영 배포를
보증하지 않는다. 비공개 r5의 이전 실패 기록은 이 공개 사본의 통과 증거가 아니며,
공개 사본은 정확한 HEAD와 변경 소스가 봉인된 새 실제 실행으로 검증해야 한다.
