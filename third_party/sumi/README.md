# Sumi — WebGL 2 붓·먹 시뮬레이션 (코드 일부 이식)

- 업스트림: https://github.com/Aureliaar/sumi
- 데모: https://sumi.aure.onl
- 이식 기준 커밋: `89b8c443b51da133fb7885de1f90e23efddbfb79` (2026-09-27)
- 라이선스: MIT — `LICENSE`는 업스트림 파일의 바이트 그대로의 사본이다.

## 저작권 표기에 관한 주의

업스트림 `LICENSE`의 저작권 줄은 `Copyright (c) 2026 YOUR NAME` 이다. 템플릿 자리 표시자가 그대로 남은
것으로 보이며, 실제 저작자 이름이 적혀 있지 않다. 이 디렉터리는 그 파일을 고치지 않고 그대로 싣는다
(허가 문구를 바꾸지 않기 위해서다). 출처 표시는 위 저장소(GitHub 계정 `Aureliaar`)와 커밋으로 한다.
저작권자 표기가 확정되면 이 사본을 업스트림의 새 파일로 바꾼다.

## 무엇을 옮겼나

MIT 허가 문구가 따라가야 하는 실제 코드 이식은 한 파일이다.

- `apps/web/src/domains/creator/brush/wet-paper/studio-wet-paper-bristle.ts`
  - `public/sumi.js`의 `buildBristleTexture`(강모·다발 지도 생성), `equalize`(히스토그램 평활화),
    `pnoise`(주기 1D 값 노이즈)와 `FS_DAB` 셰이더의 갈필 문턱 수식(건조도·필압·가장자리 강모·다발 갈라짐·
    종이 골 건너뛰기)을 TypeScript로 옮겼다.
  - 바꾼 점: 지도 크기 320×2048·강모 160가닥·다발 8개 → 128×512·64가닥·6개(제품 베이크 격자 해상도에
    맞춤), `Math.sin`·`Math.exp` → 결정적 다항식(엔진 간 비트 일치), WebGL 텍스처 → `Float32Array`와
    쌍선형 샘플러, 시드 고정 mulberry32(원본과 같은 알고리즘).

개념만 참고해 이 저장소에서 다시 구현한 부분(코드 이식 아님):

- `brush/wet-paper/studio-wet-paper-deposit.ts`: dab 패스의 chord 정규화(dab 간격 / 그 픽셀을 덮는 dab
  중심 구간 길이 — 획 시작·끝으로 자른 현)와 물의 MAX 블렌딩.
- `brush/wet-paper/studio-wet-paper-paper.ts`: 회전 좌표 + 섬유 방향으로 늘인 노이즈 능선으로 섬유 결을
  만드는 생각(정수 해시 값 노이즈로 새로 작성).
- `brush/wet-paper/studio-wet-paper-composite.ts`: Beer–Lambert 합성이라는 선택(식과 LUT·직선 알파 변환은
  새로 작성).

물리 모델 자체(MoXi D2Q9 격자 볼츠만·다공성 부분 bounce-back·젖음 전선 고정, Curtis 3층 물·안료 흡착/탈착·
가장자리 짙어짐·백런)는 논문(Chu & Tai, SIGGRAPH 2005 · Curtis et al., SIGGRAPH 1997 · Chu & Tai,
IEEE CG&A 2004)을 바탕으로 이 저장소에서 독립적으로 구현했다.
