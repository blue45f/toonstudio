# ToonStudio Local ToonBridge v2

`tools/toonbridge`는 Vite 번들에 섞을 수 없는 제작 도구를 위한 로컬 별도 실행 경계다. Studio UI의
정확한 origin과 bearer 인증 요청만 받고, 검토된 command plan을 `shell: false`로 실행한다.

## 역할

- 외부 실행 파일의 정확한 경로·버전을 조사하고 missing/manual/connector/research 상태를 반환한다.
- job마다 private directory를 만들고 선언된 입력 파일을 stream한다.
- 실행 전에 size와 SHA-256 불일치를 거부한다.
- 임의 command 대신 operation allowlist에서 argument를 조립한다.
- 동시 process, 실행 시간, log, captured output, 보존 job 수를 제한한다.
- 파일당 2 GiB, job당 4 GiB 한도 안에서 output hash를 stream 계산한다.
- tool version, upstream source, license, input/output hash와 정제된 command digest를 기록한다.
- service 재시작으로 중단된 작업을 성공으로 위장하지 않고 실패 처리한다.

G'MIC, GEGL, Natron, Tesseract, Inkscape, OpenToonz, Synfig, FFmpeg, Blender, QGIS, OpenSCAD,
Ghostscript, darktable, eSpeak NG, Rubber Band 등 외부 프로그램을 설치·다운로드·재배포하지 않는다.
각 프로그램의 설치 경로와 라이선스는 별도다.

## 시작

```sh
export TOONBRIDGE_TOKEN="$(openssl rand -hex 24)"
export TOONBRIDGE_ALLOWED_ORIGINS="http://127.0.0.1:5173,http://localhost:5173"
pnpm run toonbridge
```

`/studio/engines`에서 loopback URL과 token을 입력한다. token은 현재 탭의 `sessionStorage`에만 저장하며
project JSON, log, analytics에 쓰지 않는다.

server 없이 현재 장비를 조사하려면 다음을 실행한다.

```sh
pnpm run toonbridge:probe
```

## 보안·데이터 경계

- loopback이 아닌 bind address를 거부한다.
- CORS는 exact origin allowlist를 사용한다.
- preflight를 제외한 모든 요청은 protocol version `2`와 bearer token이 필요하다.
- URL path와 input ID를 제한하고 모든 resolved path가 job directory 안에 있어야 한다.
- upload는 stream·원자 쓰기를 사용하며 선언한 byte length와 digest를 확인한다.
- child process에는 job-local `HOME`, temporary, XDG directory만 주고 application credential을 전달하지 않는다.
- 결과는 regular file만 허용하고 symbolic link를 거부한다. metadata 저장 전과 download 전에 다시 hash한다.
- provider 자동 대체가 없다. binary 누락, timeout, nonzero exit는 구조화된 실패다.

이 runner는 kernel sandbox가 아니다. 신뢰하고 명시적으로 설치한 binary만 연결한다. 기술적 격리 경계이지
법적 결론이 아니므로 release review에서 source offer, asset license, codec 설정을 별도로 확인한다.

## 테스트

```sh
pnpm run test:toonbridge
pnpm run test:production-toolchain
```

HTTP 통합 테스트는 임시 loopback port에 실제 service를 띄워 origin 거절, 인증, stream upload,
child 실행, hash, receipt, download를 검증한다.

## current — 선택적 로컬 Blender 작업의 보존 계약

Blender 어댑터는 사용자가 직접 연결한 로컬 프로그램의 선택적 실행 경로다.
ToonStudio 웹 편집을 사용하기 위해 Blender 설치나 원격 Blender 서버를 요구하지 않는다.

- 입력 `.blend`를 열기 전에 factory startup과 자동 스크립트 실행 차단을 적용한다.
  어댑터의 Python 예외는 종료 코드 `42`로 반환해 성공 결과로 처리하지 않는다.
- 장면 렌더는 저장된 현재 프레임·카메라·해상도와 원본 compositor의 주 이미지를 유지한다.
  compositor의 별도 파일 출력은 막고, Freestyle의 Python script 모드는 실행 전에 거부한다.
- GLB 출력은 평가된 메시를 내보내되 Shape Key가 있으면 morph target을 보존한다.
  이때 함께 보존할 수 없는 모디파이어는 원본을 고치거나 형태를 잃는 대신 구체적인 오류로 알린다.
- 선화는 카메라·해상도를 유지하면서 별도의 흰 world·표면과 검정 Freestyle 선 집합을 구성한다.
  기존 compositor·sequencer가 선화 결과를 바꾸지 않게 한다. 원본 `.blend` 파일은 저장하지 않는다.

실제 Blender 검증은 저장소 루트에서 다음과 같이 실행한다. 임시 fixture만 생성·삭제하며
프레임·해상도·모디파이어·Shape Key·선화 픽셀·실패 종료·원본 파일 보존을 확인한다.

```sh
blender --background --factory-startup --disable-autoexec --python-exit-code 42 \
  --python tools/toonbridge/test/blender-adapters.integration.py
```
