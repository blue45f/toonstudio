/*
 * 자동 생성 파일 — 수정 금지.
 *
 * 생성 스크립트: apps/brush-lab/scripts/gen-km-tables.mjs
 *   재생성: node apps/brush-lab/scripts/gen-km-tables.mjs <spectral.js 3.0.0 설치 경로>
 *   검증:   node apps/brush-lab/scripts/gen-km-tables.mjs --check <spectral.js 3.0.0 설치 경로> (재생성 결과가 이 파일과 바이트 동일해야 한다)
 * 원본 데이터: spectral.js 3.0.0 (MIT) — 공개 API로 읽은 7기저 반사율 스펙트럼을 n밴드로 줄인 파생 표다.
 * 원본 spectral.js 파일 sha256: dbaa1a8b44d2c734b48b6d44777b1f182c9740e9220d2cbded02002c8e6d271a
 * 훈련: 시드 20261008 고정 LCG, 무작위 색쌍 400개(원색 반사율 + spectral.js 혼합 결과 반사율)의 최소제곱 적합
 * 표 본문 sha256: bf40c62aeef2e8177fb7c2c50f16e2d981f7e6f33b793b7dea020f378af4d334
 *
 * 이 표는 위 원본 데이터에서 파생했으므로 아래 MIT 라이선스 전문과 저작권 고지를 유지해야 한다(번들·재배포 포함).
 *
 * ----- spectral.js 라이선스 전문 -----
 *   MIT License
 *
 *   Copyright (c) 2025 Ronald van Wijnen
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy
 *   of this software and associated documentation files (the "Software"), to deal
 *   in the Software without restriction, including without limitation the rights
 *   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *   copies of the Software, and to permit persons to whom the Software is
 *   furnished to do so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in all
 *   copies or substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 *   SOFTWARE.
 */

// ==== 표 본문 시작(위 sha256의 대상은 이 줄 다음부터 파일 끝까지) ====
export const KM_TABLE_8 = {
  bands: 8,
  /** 38밴드(380nm + 10nm·i) 중 선택한 인덱스 */
  index: [0, 5, 11, 16, 21, 26, 32, 37],
  /** 흰·시안·마젠타·노랑·빨강·초록·파랑 7기저의 반사율(7×8, 행 우선) */
  basis: new Float32Array([1.0011607, 1.0011325, 1.0003081, 0.99970955, 1.0001448, 1.0005072, 1.0005445, 1.000545, 0.970585, 0.97316323, 0.99414568, 0.9945976, 0.53620248, 0.018202284, 0.014547016, 0.014503801, 0.99067356, 0.98987108, 0.43247281, 0.020134953, 0.5412689, 0.9662606, 0.97220942, 0.97228132, 0.021052337, 0.02267388, 0.53480431, 0.97930312, 0.98661788, 0.98497157, 0.98470668, 0.98470287, 0.031560574, 0.028648048, 0.0058980411, 0.0053434426, 0.4638126, 0.98204364, 0.98565385, 0.98569652, 0.0095560748, 0.010378623, 0.57057982, 0.97958903, 0.45927014, 0.03422152, 0.028198838, 0.028126013, 0.97940475, 0.97781447, 0.46592217, 0.020527177, 0.013548894, 0.015459285, 0.015760544, 0.01576488]),
  /** 8밴드 반사율 → 선형 sRGB 복원 행렬(3×8, 행 우선, 훈련 시드 20261008) */
  rec: new Float32Array([-0.30883852, 0.36551616, -0.15024037, -0.14415904, 0.39468566, 2.7407966, 61.848846, -63.746946, 0.49742787, -0.59156045, 0.1559786, 0.88336729, 0.11755609, -1.522724, 68.726777, -67.26664, -4.5697701, 5.5246406, 0.16768344, -0.1024859, -0.011990025, -0.32753625, 7.6376139, -7.3182006]),
} as const;

export const KM_TABLE_6 = {
  bands: 6,
  /** 38밴드(380nm + 10nm·i) 중 선택한 인덱스 */
  index: [0, 7, 15, 22, 30, 37],
  /** 흰·시안·마젠타·노랑·빨강·초록·파랑 7기저의 반사율(7×6, 행 우선) */
  basis: new Float32Array([1.0011607, 1.0009969, 0.99973861, 1.00026, 1.0005427, 1.000545, 0.970585, 0.98158761, 0.99560616, 0.15410812, 0.014695434, 0.014503801, 0.99067356, 0.98429069, 0.021313652, 0.81584169, 0.97196277, 0.97228132, 0.021052337, 0.033487939, 0.97124162, 0.98627778, 0.98471965, 0.98470287, 0.031560574, 0.019296075, 0.0043533696, 0.84705541, 0.9855073, 0.98569652, 0.0095560748, 0.016097772, 0.97841363, 0.1855741, 0.028448627, 0.028126013, 0.97940475, 0.96719848, 0.028470605, 0.013959436, 0.015745811, 0.01576488]),
  /** 6밴드 반사율 → 선형 sRGB 복원 행렬(3×6, 행 우선, 훈련 시드 20261008) */
  rec: new Float32Array([0.35029848, -0.35612543, -0.1440344, 0.97976325, -88.088163, 88.251497, -0.47188122, 0.44869618, 0.97421261, 0.47827782, -93.056024, 92.630077, -0.77236011, 1.8139916, -0.03598735, 0.12728486, -30.614454, 30.48601]),
} as const;
