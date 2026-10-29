# Klecks — brush tip kernels (algorithms re-implemented)

- Upstream: https://github.com/bitbof/klecks
- License: MIT (see LICENSE, verbatim upstream copy) — Copyright (c) 2026 bitbof (bitbof.com)

`src/domains/creator/studio-oss-brush-kernels.ts` re-implements Klecks brush
algorithms (pen equal-area scatter, `genBrushAlpha01` multi-octave chalk alpha,
chalk rotate hash) and `studio-dry-media-kernel-tip.ts` builds the core
dry-media tips on those kernels. The implementations are clean re-typings of
the published algorithms rather than file copies, but they follow specific
upstream functions closely, so the MIT notice is preserved here and embedded
verbatim into `dist/legal/THIRD_PARTY_NOTICES.generated.md` by
`scripts/generate-third-party-notices.mjs`; removing either fails
`pnpm run audit:licenses`.

## 절차 브러시 이식 (2026-10-29 추가)

`apps/web/src/domains/creator/brush-lab/brush-studio-v6-procedural-klecks-kernels.ts`는 Klecks의 다음 함수
알고리즘을 Brush Studio V6 위상 커널(`carrier-cpu-klecks-sketchy-v1`, `carrier-cpu-klecks-chemy-v1`)로 다시
타이핑해 이식했다. 파일을 복사하지 않았지만 특정 상류 함수를 가깝게 따르므로 이 디렉터리의 MIT 고지를 함께 적용한다.

| 이식 대상(상류) | 따른 부분 |
| --- | --- |
| `src/app/script/klecks/brushes/sketchy-brush.ts` — `SketchyBrush.goLine` | 정수 절삭 좌표, 직전 점→현재 점 본선, `거리² < 4000·scale²`이고 `rand > 거리²/(2000·scale²)`인 지난 점 연결, 양 끝 30% 줄임, 기본 불투명도 0.2 |
| `src/app/script/klecks/brushes/chemy-brush.ts` — `ChemyBrush.goLine`·`drawShape` | 제스처 첫 점 기준 닫힌 경로 채움(fill)·윤곽(stroke), 좌우(X)·상하(Y) 대칭, distort(±distort·40px) |

이 저장소의 결정성·무판독 계약 때문에 바꾼 점:

- 난수: Klecks의 sin·cos 순차 난수와 `Math.random()` 대신 (덥 번호, 점 번호, 시드) 정수 해시를 쓴다.
- 기억: sketchy는 획 전체 점 대신 최근 64점 링 버퍼만 본다.
- 블렌딩: 펜 아래 캔버스 색 읽기(`getImageData`) 대신 보조색(기본: 종이색)과 섞는다.
- chemy 채움: Canvas `fill()` 대신 시작점·직전 점·현재 점 삼각형을 캡슐로 근사한다. nonzero 채움 규칙의 구멍은
  재현하지 않고, 반투명일 때 이음매가 조금 진해질 수 있다. 대칭축은 캔버스 중심 대신 제스처 시작점이며, `gradient`
  옵션은 최종 y 범위가 필요해 이식하지 않았다.
- 크기: Klecks의 Size·Scale을 제품의 단일 크기 슬라이더에 맞춰 크기 20을 scale 1로 본다.

실행 영수증에는 제공자 `klecks-procedural-port-v1`(MIT, `compatibility-adapter`)로 기록된다
(`brush-studio-v6-license-profile.ts`).
