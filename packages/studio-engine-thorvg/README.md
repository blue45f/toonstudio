# @toonstudio/studio-engine-thorvg

안전한 SVG·Lottie 전문 island를 위한 bounded ThorVG WebCanvas provider다.

- `audit`은 WASM이나 renderer 초기화 전에 실행하는 경량 의존성 검사다.
- immutable provider plan이 ThorVG를 선택한 뒤에만 `runtime`을 동적 import한다.
- 요청마다 `wg`, `gl`, `sw` 중 정확히 하나만 선택한다. 실패해도 다른 backend나 Vello를 재시도하지 않는다.
- 활성·외부 SVG surface, Lottie expression, 외부 image asset을 거부한다.
- `wasm/thorvg.wasm`은 `@thorvg/webcanvas@1.1.4`의 바이트를 그대로 복사하고 `INTEGRITY.sha256`으로 고정한다.
- Canvas paint를 분리·dispose한 뒤 canvas/backend를 제거한다. process-global engine은 마지막 lease가 해제된 뒤 종료한다.

브라우저 수명주기 검증:

```sh
pnpm run verify:studio-thorvg-browser
```

설치된 npm JS와 vendored WASM은 같은 1.1.4 배포본이어야 한다. 브라우저 검사는
설치 패키지와 WASM 바이트·SHA-256·모듈 형식을 먼저 확인하고 32회 생성·해제와
동시 두 소유자의 마지막 해제를 실제 WebGPU에서 검증한다. 별도 순수 WebGPU
canvas는 현재 texture의 중앙 픽셀을 같은 GPU 명령으로 복사해 두 생성·해제 cycle에서
RGBA가 각각 `[255, 0, 0, 255]`인지 확인한다. 이는 canvas backing의 실제 픽셀 검사이며,
Canvas2D 상호운용과 화면 screenshot은 별도 검증 대상이다.
초기화 실패를 다른 backend 성공이나 skip으로 처리하지 않는다.

Linux CI는 [Chromium issue 575926500](https://issues.chromium.org/issues/575926500)의
SharedImage·Instance 문제에 대한 실행 구성을 따라 기존 Vulkan·WebGPU 옵션에
`--use-vulkan=swiftshader`, `--use-angle=swiftshader`, `--enable-unsafe-swiftshader`를
명시한다. WebGPU와 canvas 공유 이미지의 software backend를 맞추기 위한 설정이다.
이 CI의 검증 범위는 SwiftShader 소프트웨어 어댑터의 렌더링·수명주기이며, 물리 GPU는 별도 실측 대상이다.
테스트 전용 `THORVG_CHROMIUM_EXECUTABLE_PATH`로 별도 Chromium 경로를 지정할 수 있다.
기본 CI는 이 변수를 설정하지 않고 Playwright가 설치한 Chromium을 사용한다.
