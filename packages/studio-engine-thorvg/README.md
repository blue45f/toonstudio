# @toonstudio/studio-engine-thorvg

안전한 SVG·Lottie 전문 island를 위한 bounded ThorVG WebCanvas provider다.

- `audit`은 WASM이나 renderer 초기화 전에 실행하는 경량 의존성 검사다.
- immutable provider plan이 ThorVG를 선택한 뒤에만 `runtime`을 동적 import한다.
- 요청마다 `wg`, `gl`, `sw` 중 정확히 하나만 선택한다. 실패해도 다른 backend나 Vello를 재시도하지 않는다.
- 활성·외부 SVG surface, Lottie expression, 외부 image asset을 거부한다.
- wrapper는 `@thorvg/webcanvas`의 기본 ESM을 불러온다. `threads: 0`으로 초기화하고 `locateFile`로 같은 출처의 `wasm/thorvg.wasm`을 지정한다.
- Canvas paint를 분리·dispose한 뒤 canvas/backend를 제거한다. process-global engine은 마지막 lease가 해제된 뒤 종료한다.

## 배포 파일 출처

[npm 배포 파일](https://registry.npmjs.org/@thorvg/webcanvas/-/webcanvas-1.1.4.tgz)의 SHA-512가 `pnpm-lock.yaml`의 무결성 값과 일치한다. [npm 빌드 출처 기록](https://registry.npmjs.org/-/npm/v1/attestations/@thorvg%2fwebcanvas@1.1.4)에 적힌 [WebCanvas 1.1.4 커밋](https://github.com/thorvg/thorvg.web/tree/4ff27c6b57a2bb6162941cb62aba3f82b0c4af79)은 [ThorVG 코어 v1.1.4](https://github.com/thorvg/thorvg/tree/47658a80842f3b3182aded036190edf459beabe7)를 사용한다. 두 파일은 이 npm 배포본의 기본 단일 스레드 빌드에서 가져온다.

| npm 파일 | 바이트 | SHA-256 |
| --- | ---: | --- |
| `dist/webcanvas.esm.js` | 398262 | `c3ac4af72b509ce25b937d781d31e903d4a007c1fdb76cedea69ee49a6dad82e` |
| `dist/thorvg.wasm` | 903904 | `0b4fd4628eec1843c47602ececdd416215f1e1ae397c108552cda3710507a962` |

업그레이드할 때는 같은 npm 배포본에서 `dist/thorvg.wasm`을 바이트 그대로 복사하고 `wasm/INTEGRITY.sha256`을 갱신한다. WebCanvas와 코어의 MIT 고지는 [NOTICE](./NOTICE)에 있다.

## 브라우저 수명주기 검증

```sh
pnpm run verify:studio-thorvg-browser
```

### 1.1.4 검증 기록 (2026-11-24)

PR #2888의 최초 커밋 `2fef3cc405`에서는 위 ESM과 1.1.2 WASM을 함께 로드했다. 당시 WASM은 909,352바이트였고 SHA-256은 `c6f485345f35742784fe5da2fda7b708e6c53a82b7d8a406a13171682d7d218f`였다. 교체 후 `runtime.test.ts`는 설치된 ESM 옆의 WASM과 wrapper가 지정한 파일의 해시를 비교하고 렌더 영수증의 버전도 확인한다.

- macOS 26.7.4, Apple M2 Max, Playwright Chromium 159.0.8154.6에서 위 probe 두 건을 실행했다. WebGPU SVG를 32회 생성·렌더·해제했고, 동시 surface 두 개의 참조 수는 소유자를 해제할 때마다 2 → 1 → 0이 됐다.
- 같은 환경에서 wrapper를 Vite로 빌드하고 웹 앱의 배포 CSP를 적용해 별도로 측정했다. WebGPU(Apple Metal), WebGL(ANGLE Metal), 소프트웨어 세 경로에서 128×128 SVG 중심색은 모두 `#ff0044`였다. Lottie의 1,024픽셀 사각형은 0프레임에서 15프레임까지 가로로 32픽셀 이동했다. 브라우저가 동일 출처에서 받은 WASM은 위 표의 SHA-256과 일치했고 CSP 위반은 0건이었다.
