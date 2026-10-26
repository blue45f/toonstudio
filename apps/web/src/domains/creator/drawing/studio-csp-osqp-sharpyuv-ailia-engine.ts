/**
 * @file studio-csp-osqp-sharpyuv-ailia-engine.ts
 * @description Clip Studio Paint 5.1.5 `libosqp.dylib` (`_QDLDL_factor`, `_QDLDL_solve`, `_osqp_setup`, `_osqp_solve`, `_form_KKT`)
 * 2차 계획법(ADMM QP) 및 제약 메쉬 변형 솔버,
 * `libsharpyuv.dylib` (`_SharpYuvConvert`, `_SharpYuvGammaToLinear`, `_SharpYuvUpdateChroma`, `_SharpYuvUpdateY`)
 * 선화 색번짐 방지 SharpYUV 4:2:0 변환기,
 * 그리고 `libailia.dylib` (`AILIANetwork`, `ailia::TensorMath`, `ailia::CHCDecoder::create_hanukemap`)
 * 신경망 활성화 계층 및 채색 누락(하누케/틈새) 검출 엔진.
 */

// ============================================================================
// 1. libosqp.dylib (QDLDL Factorization & OSQP ADMM Quadratic Program Solver)
// ============================================================================

export interface CspQdldlFactorization {
  readonly dim: number;
  readonly lowerL: Float64Array;
  readonly diagD: Float64Array;
  readonly invDiagD: Float64Array;
  readonly positiveEigenCount: number;
}

/**
 * `libosqp.dylib` 내 `_QDLDL_factor` 동작을 재현하여
 * 준정부호 대칭 행렬(Quasi-Definite Symmetric Matrix, $K = L D L^T$)을 분해합니다.
 */
export function factorizeCspQdldlMatrix(
  dim: number,
  symMatrixRowMajor: Float64Array,
): CspQdldlFactorization {
  const lowerL = new Float64Array(dim * dim);
  const diagD = new Float64Array(dim);
  const invDiagD = new Float64Array(dim);
  let positiveEigenCount = 0;

  for (let j = 0; j < dim; j += 1) {
    lowerL[j * dim + j] = 1.0;
    let dj = symMatrixRowMajor[j * dim + j] ?? 0;
    for (let k = 0; k < j; k += 1) {
      const ljk = lowerL[j * dim + k]!;
      dj -= ljk * ljk * diagD[k]!;
    }
    if (Math.abs(dj) < 1e-12) {
      dj = dj >= 0 ? 1e-12 : -1e-12;
    }
    diagD[j] = dj;
    invDiagD[j] = 1.0 / dj;
    if (dj > 0) {
      positiveEigenCount += 1;
    }

    for (let i = j + 1; i < dim; i += 1) {
      let sum = symMatrixRowMajor[i * dim + j] ?? 0;
      for (let k = 0; k < j; k += 1) {
        sum -= lowerL[i * dim + k]! * lowerL[j * dim + k]! * diagD[k]!;
      }
      lowerL[i * dim + j] = sum * invDiagD[j]!;
    }
  }

  return {
    dim,
    lowerL,
    diagD,
    invDiagD,
    positiveEigenCount,
  };
}

/**
 * `libosqp.dylib` 내 `_QDLDL_Lsolve` -> `D^-1` -> `_QDLDL_Ltsolve` (`_QDLDL_solve`)를 수행합니다.
 */
export function solveCspQdldlSystem(
  factor: CspQdldlFactorization,
  rhs: Float64Array,
): Float64Array {
  const n = factor.dim;
  const x = new Float64Array(rhs);

  // Forward substitution: L y = b
  for (let i = 0; i < n; i += 1) {
    let val = x[i]!;
    for (let k = 0; k < i; k += 1) {
      val -= factor.lowerL[i * n + k]! * x[k]!;
    }
    x[i] = val;
  }

  // Diagonal scaling: D z = y
  for (let i = 0; i < n; i += 1) {
    x[i] = x[i]! * factor.invDiagD[i]!;
  }

  // Backward substitution: L^T x = z
  for (let i = n - 1; i >= 0; i -= 1) {
    let val = x[i]!;
    for (let k = i + 1; k < n; k += 1) {
      val -= factor.lowerL[k * n + i]! * x[k]!;
    }
    x[i] = val;
  }

  return x;
}

export interface CspOsqpProblemInput {
  readonly nVars: number;
  readonly mConstraints: number;
  /** nVars x nVars 대칭 양준정부호 목적 행렬 P (row-major) */
  readonly P: Float64Array;
  /** 길이 nVars 선형 비용 벡터 q */
  readonly q: Float64Array;
  /** mConstraints x nVars 제약 행렬 A (row-major) */
  readonly A: Float64Array;
  /** 길이 mConstraints 하한 벡터 l */
  readonly l: Float64Array;
  /** 길이 mConstraints 상한 벡터 u */
  readonly u: Float64Array;
  readonly rho?: number;
  readonly sigma?: number;
  readonly alpha?: number;
  readonly maxIter?: number;
  readonly epsAbs?: number;
}

export interface CspOsqpSolution {
  readonly x: Float64Array;
  readonly z: Float64Array;
  readonly y: Float64Array;
  readonly objVal: number;
  readonly iterations: number;
  readonly primalResidual: number;
  readonly dualResidual: number;
  readonly status: "solved" | "max_iter_reached";
}

/**
 * `libosqp.dylib` (`_osqp_setup`, `_form_KKT`, `_osqp_solve`, `_update_xz_tilde`, `_update_x`, `_update_z`, `_update_y`, `_project`)
 * ADMM 2차 계획법 솔버:
 *   minimize    0.5 * x^T P x + q^T x
 *   subject to  l <= A x <= u
 */
export function solveCspOsqpQuadraticProgram(input: CspOsqpProblemInput): CspOsqpSolution {
  const n = input.nVars;
  const m = input.mConstraints;
  const rho = input.rho ?? 0.1;
  const invRho = 1.0 / rho;
  const sigma = input.sigma ?? 1e-6;
  const alpha = input.alpha ?? 1.6;
  const maxIter = input.maxIter ?? 200;
  const epsAbs = input.epsAbs ?? 1e-5;

  // _form_KKT: (n + m) x (n + m) 준정부호 KKT 행렬 조립
  // [ P + sigma*I   A^T        ]
  // [ A             -invRho*I  ]
  const kktDim = n + m;
  const kkt = new Float64Array(kktDim * kktDim);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      kkt[i * kktDim + j] = (input.P[i * n + j] ?? 0) + (i === j ? sigma : 0);
    }
  }
  for (let i = 0; i < m; i += 1) {
    for (let j = 0; j < n; j += 1) {
      const aij = input.A[i * n + j] ?? 0;
      kkt[(n + i) * kktDim + j] = aij;
      kkt[j * kktDim + (n + i)] = aij;
    }
    kkt[(n + i) * kktDim + (n + i)] = -invRho;
  }

  const factor = factorizeCspQdldlMatrix(kktDim, kkt);

  const x = new Float64Array(n);
  const z = new Float64Array(m);
  const y = new Float64Array(m);
  const zTilde = new Float64Array(m);
  const rhs = new Float64Array(kktDim);

  let primalResidual = Number.POSITIVE_INFINITY;
  let dualResidual = Number.POSITIVE_INFINITY;
  let iterations = maxIter;
  let status: "solved" | "max_iter_reached" = "max_iter_reached";

  for (let iter = 1; iter <= maxIter; iter += 1) {
    // _update_xz_tilde: KKT 우변 조립
    for (let i = 0; i < n; i += 1) {
      rhs[i] = sigma * x[i]! - (input.q[i] ?? 0);
    }
    for (let i = 0; i < m; i += 1) {
      rhs[n + i] = z[i]! - invRho * y[i]!;
    }

    const sol = solveCspQdldlSystem(factor, rhs);
    for (let i = 0; i < m; i += 1) {
      zTilde[i] = z[i]! + invRho * (sol[n + i]! - y[i]!);
    }

    // _update_x: x^{k+1} = alpha * x_tilde + (1 - alpha) * x^k
    for (let i = 0; i < n; i += 1) {
      x[i] = alpha * sol[i]! + (1 - alpha) * x[i]!;
    }

    // _update_z & _project: z^{k+1} = Π_{[l, u]}(alpha * z_tilde + (1 - alpha)*z^k + invRho * y^k)
    for (let i = 0; i < m; i += 1) {
      const unproj = alpha * zTilde[i]! + (1 - alpha) * z[i]! + invRho * y[i]!;
      const li = input.l[i] ?? Number.NEGATIVE_INFINITY;
      const ui = input.u[i] ?? Number.POSITIVE_INFINITY;
      const zNext = Math.max(li, Math.min(ui, unproj));
      const yNext = y[i]! + rho * (alpha * zTilde[i]! + (1 - alpha) * z[i]! - zNext);
      z[i] = zNext;
      y[i] = yNext;
    }

    // _compute_pri_res & _compute_dua_res
    primalResidual = 0;
    for (let i = 0; i < m; i += 1) {
      let ax = 0;
      for (let j = 0; j < n; j += 1) {
        ax += (input.A[i * n + j] ?? 0) * x[j]!;
      }
      const diff = Math.abs(ax - z[i]!);
      if (diff > primalResidual) {
        primalResidual = diff;
      }
    }

    dualResidual = 0;
    for (let i = 0; i < n; i += 1) {
      let px = input.q[i] ?? 0;
      for (let j = 0; j < n; j += 1) {
        px += (input.P[i * n + j] ?? 0) * x[j]!;
      }
      for (let k = 0; k < m; k += 1) {
        px += (input.A[k * n + i] ?? 0) * y[k]!;
      }
      const absDual = Math.abs(px);
      if (absDual > dualResidual) {
        dualResidual = absDual;
      }
    }

    if (primalResidual <= epsAbs && dualResidual <= epsAbs) {
      status = "solved";
      iterations = iter;
      break;
    }
  }

  // _compute_obj_val: 0.5 * x^T P x + q^T x
  let objVal = 0;
  for (let i = 0; i < n; i += 1) {
    let px = 0;
    for (let j = 0; j < n; j += 1) {
      px += (input.P[i * n + j] ?? 0) * x[j]!;
    }
    objVal += 0.5 * x[i]! * px + (input.q[i] ?? 0) * x[i]!;
  }

  return {
    x,
    z,
    y,
    objVal,
    iterations,
    primalResidual,
    dualResidual,
    status,
  };
}

/**
 * 클립스튜디오의 메쉬 변형(Mesh Transformation) 격자 정점들을
 * OSQP 라플라시안 매끄러움 에너지 + 고정 핀/경계 박스 제약으로 최적화합니다.
 */
export function solveCspConstrainedMeshWarpGridOsqp(params: {
  readonly cols: number;
  readonly rows: number;
  readonly restPositionsXY: readonly { readonly x: number; readonly y: number }[];
  readonly pinnedVertices: readonly {
    readonly vertexIndex: number;
    readonly targetX: number;
    readonly targetY: number;
  }[];
  readonly boundsMinX?: number;
  readonly boundsMaxX?: number;
  readonly boundsMinY?: number;
  readonly boundsMaxY?: number;
}): {
  readonly deformedPositionsXY: readonly { readonly x: number; readonly y: number }[];
  readonly totalObjective: number;
} {
  const numVerts = params.cols * params.rows;
  const P = new Float64Array(numVerts * numVerts);
  const qX = new Float64Array(numVerts);
  const qY = new Float64Array(numVerts);

  const addEdgeSpring = (u: number, v: number, weight: number): void => {
    P[u * numVerts + u] = (P[u * numVerts + u] ?? 0) + weight;
    P[v * numVerts + v] = (P[v * numVerts + v] ?? 0) + weight;
    P[u * numVerts + v] = (P[u * numVerts + v] ?? 0) - weight;
    P[v * numVerts + u] = (P[v * numVerts + u] ?? 0) - weight;

    const restDx = (params.restPositionsXY[u]?.x ?? 0) - (params.restPositionsXY[v]?.x ?? 0);
    const restDy = (params.restPositionsXY[u]?.y ?? 0) - (params.restPositionsXY[v]?.y ?? 0);
    qX[u] = (qX[u] ?? 0) - weight * restDx;
    qX[v] = (qX[v] ?? 0) + weight * restDx;
    qY[u] = (qY[u] ?? 0) - weight * restDy;
    qY[v] = (qY[v] ?? 0) + weight * restDy;
  };

  for (let r = 0; r < params.rows; r += 1) {
    for (let c = 0; c < params.cols; c += 1) {
      const idx = r * params.cols + c;
      // 약한 원위치 복원 정규화 항
      P[idx * numVerts + idx] = (P[idx * numVerts + idx] ?? 0) + 0.05;
      qX[idx] = (qX[idx] ?? 0) - 0.05 * (params.restPositionsXY[idx]?.x ?? 0);
      qY[idx] = (qY[idx] ?? 0) - 0.05 * (params.restPositionsXY[idx]?.y ?? 0);

      if (c + 1 < params.cols) {
        addEdgeSpring(idx, idx + 1, 1.0);
      }
      if (r + 1 < params.rows) {
        addEdgeSpring(idx, idx + params.cols, 1.0);
      }
    }
  }

  // A = I (정점별 위치 범위 및 핀 고정 제약)
  const A = new Float64Array(numVerts * numVerts);
  const lX = new Float64Array(numVerts);
  const uX = new Float64Array(numVerts);
  const lY = new Float64Array(numVerts);
  const uY = new Float64Array(numVerts);

  const minX = params.boundsMinX ?? -1e6;
  const maxX = params.boundsMaxX ?? 1e6;
  const minY = params.boundsMinY ?? -1e6;
  const maxY = params.boundsMaxY ?? 1e6;

  for (let i = 0; i < numVerts; i += 1) {
    A[i * numVerts + i] = 1.0;
    lX[i] = minX;
    uX[i] = maxX;
    lY[i] = minY;
    uY[i] = maxY;
  }

  for (const pin of params.pinnedVertices) {
    if (pin.vertexIndex >= 0 && pin.vertexIndex < numVerts) {
      lX[pin.vertexIndex] = pin.targetX;
      uX[pin.vertexIndex] = pin.targetX;
      lY[pin.vertexIndex] = pin.targetY;
      uY[pin.vertexIndex] = pin.targetY;
    }
  }

  const solX = solveCspOsqpQuadraticProgram({
    nVars: numVerts,
    mConstraints: numVerts,
    P,
    q: qX,
    A,
    l: lX,
    u: uX,
    rho: 1.0,
    maxIter: 150,
  });

  const solY = solveCspOsqpQuadraticProgram({
    nVars: numVerts,
    mConstraints: numVerts,
    P,
    q: qY,
    A,
    l: lY,
    u: uY,
    rho: 1.0,
    maxIter: 150,
  });

  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < numVerts; i += 1) {
    out.push({ x: solX.x[i]!, y: solY.x[i]! });
  }

  return {
    deformedPositionsXY: out,
    totalObjective: solX.objVal + solY.objVal,
  };
}

// ============================================================================
// 2. libsharpyuv.dylib (_SharpYuvConvert / _SharpYuvGammaToLinear / 5 Matrices)
// ============================================================================

export type CspSharpYuvMatrixId =
  | "webp"
  | "rec601Limited"
  | "rec601Full"
  | "rec709Limited"
  | "rec709Full";

export interface CspSharpYuvMatrixSpec {
  readonly matrixId: CspSharpYuvMatrixId;
  readonly symbolName: string;
  readonly kr: number;
  readonly kb: number;
  readonly yOffset: number;
  readonly yScale: number;
  readonly uvScale: number;
}

/**
 * `libsharpyuv.dylib` 심볼(`_kWebpMatrix`, `_kRec601LimitedMatrix`, `_kRec601FullMatrix`, `_kRec709LimitedMatrix`, `_kRec709FullMatrix`)에
 * 대응하는 5종 YUV 색공간 변환 행렬 파라미터.
 */
export const CSP_SHARPYUV_MATRIX_SPECS: Readonly<
  Record<CspSharpYuvMatrixId, CspSharpYuvMatrixSpec>
> = {
  webp: {
    matrixId: "webp",
    symbolName: "_kWebpMatrix",
    kr: 0.299,
    kb: 0.114,
    yOffset: 16,
    yScale: 219 / 255,
    uvScale: 224 / 255,
  },
  rec601Limited: {
    matrixId: "rec601Limited",
    symbolName: "_kRec601LimitedMatrix",
    kr: 0.299,
    kb: 0.114,
    yOffset: 16,
    yScale: 219 / 255,
    uvScale: 224 / 255,
  },
  rec601Full: {
    matrixId: "rec601Full",
    symbolName: "_kRec601FullMatrix",
    kr: 0.299,
    kb: 0.114,
    yOffset: 0,
    yScale: 1.0,
    uvScale: 1.0,
  },
  rec709Limited: {
    matrixId: "rec709Limited",
    symbolName: "_kRec709LimitedMatrix",
    kr: 0.2126,
    kb: 0.0722,
    yOffset: 16,
    yScale: 219 / 255,
    uvScale: 224 / 255,
  },
  rec709Full: {
    matrixId: "rec709Full",
    symbolName: "_kRec709FullMatrix",
    kr: 0.2126,
    kb: 0.0722,
    yOffset: 0,
    yScale: 1.0,
    uvScale: 1.0,
  },
};

function sharpYuvGammaToLinear(v255: number): number {
  const norm = Math.max(0, Math.min(255, v255)) / 255;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

function sharpYuvLinearToGamma(lin01: number): number {
  const c = Math.max(0, Math.min(1, lin01));
  const g = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return g * 255;
}

/**
 * `libsharpyuv.dylib`의 `_SharpYuvConvert` (`_SharpYuvGammaToLinear` -> `_UpdateChroma` -> `_SharpYuvUpdateY`)를 수행하여
 * 웹툰 선화·스크린톤의 4:2:0 크로마 서브샘플링 경계 번짐을 억제합니다.
 */
export function convertCspRgbaToSharpYuv420(params: {
  readonly width: number;
  readonly height: number;
  readonly rgbaBytes: Uint8ClampedArray;
  readonly matrixId?: CspSharpYuvMatrixId;
  readonly iterations?: number;
}): {
  readonly yPlane: Uint8Array;
  readonly uPlane: Uint8Array;
  readonly vPlane: Uint8Array;
  readonly uvWidth: number;
  readonly uvHeight: number;
} {
  const { width, height, rgbaBytes } = params;
  const spec = CSP_SHARPYUV_MATRIX_SPECS[params.matrixId ?? "webp"];
  const kg = 1 - spec.kr - spec.kb;
  const iterations = Math.max(1, Math.min(8, params.iterations ?? 2));

  const uvWidth = Math.ceil(width / 2);
  const uvHeight = Math.ceil(height / 2);
  const yPlane = new Uint8Array(width * height);
  const uPlane = new Uint8Array(uvWidth * uvHeight);
  const vPlane = new Uint8Array(uvWidth * uvHeight);

  const targetLinY = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const rL = sharpYuvGammaToLinear(rgbaBytes[i * 4]!);
    const gL = sharpYuvGammaToLinear(rgbaBytes[i * 4 + 1]!);
    const bL = sharpYuvGammaToLinear(rgbaBytes[i * 4 + 2]!);
    targetLinY[i] = spec.kr * rL + kg * gL + spec.kb * bL;
  }

  for (let by = 0; by < uvHeight; by += 1) {
    for (let bx = 0; bx < uvWidth; bx += 1) {
      // 2x2 블록 선형 광량 평균으로 크로마 초기화 (_ScaleDown + _SharpYuvLinearToGamma)
      let sumRL = 0;
      let sumGL = 0;
      let sumBL = 0;
      let count = 0;
      for (let dy = 0; dy < 2; dy += 1) {
        const py = Math.min(height - 1, by * 2 + dy);
        for (let dx = 0; dx < 2; dx += 1) {
          const px = Math.min(width - 1, bx * 2 + dx);
          const idx = (py * width + px) * 4;
          sumRL += sharpYuvGammaToLinear(rgbaBytes[idx]!);
          sumGL += sharpYuvGammaToLinear(rgbaBytes[idx + 1]!);
          sumBL += sharpYuvGammaToLinear(rgbaBytes[idx + 2]!);
          count += 1;
        }
      }
      const avgR = sharpYuvLinearToGamma(sumRL / count);
      const avgG = sharpYuvLinearToGamma(sumGL / count);
      const avgB = sharpYuvLinearToGamma(sumBL / count);
      const avgY = spec.kr * avgR + kg * avgG + spec.kb * avgB;

      const uRaw = ((avgB - avgY) / (2 * (1 - spec.kb))) * spec.uvScale + 128;
      const vRaw = ((avgR - avgY) / (2 * (1 - spec.kr))) * spec.uvScale + 128;
      uPlane[by * uvWidth + bx] = Math.max(0, Math.min(255, Math.round(uRaw)));
      vPlane[by * uvWidth + bx] = Math.max(0, Math.min(255, Math.round(vRaw)));

      // _SharpYuvUpdateY: 선형 휘도 오차를 최소화하도록 각 픽셀 Y 보정
      const uCentered = (uPlane[by * uvWidth + bx]! - 128) / spec.uvScale;
      const vCentered = (vPlane[by * uvWidth + bx]! - 128) / spec.uvScale;
      const rChroma = 2 * (1 - spec.kr) * vCentered;
      const bChroma = 2 * (1 - spec.kb) * uCentered;
      const gChroma = (-2 * spec.kr * (1 - spec.kr) * vCentered - 2 * spec.kb * (1 - spec.kb) * uCentered) / kg;

      for (let dy = 0; dy < 2; dy += 1) {
        const py = by * 2 + dy;
        if (py >= height) continue;
        for (let dx = 0; dx < 2; dx += 1) {
          const px = bx * 2 + dx;
          if (px >= width) continue;
          const pIdx = py * width + px;
          let yEst =
            spec.kr * rgbaBytes[pIdx * 4]! +
            kg * rgbaBytes[pIdx * 4 + 1]! +
            spec.kb * rgbaBytes[pIdx * 4 + 2]!;

          for (let it = 0; it < iterations; it += 1) {
            const recR = sharpYuvGammaToLinear(yEst + rChroma);
            const recG = sharpYuvGammaToLinear(yEst + gChroma);
            const recB = sharpYuvGammaToLinear(yEst + bChroma);
            const recLinY = spec.kr * recR + kg * recG + spec.kb * recB;
            const errGamma =
              sharpYuvLinearToGamma(targetLinY[pIdx]!) - sharpYuvLinearToGamma(recLinY);
            yEst = Math.max(0, Math.min(255, yEst + 0.5 * errGamma));
          }

          const yQuant = Math.round(spec.yOffset + yEst * spec.yScale);
          yPlane[pIdx] = Math.max(0, Math.min(255, yQuant));
        }
      }
    }
  }

  return {
    yPlane,
    uPlane,
    vPlane,
    uvWidth,
    uvHeight,
  };
}

// ============================================================================
// 3. libailia.dylib (ailia::Layer::Activation & ailia::CHCDecoder Hanuke Map)
// ============================================================================

export type CspAiliaActivationType =
  | "Sigmoid"
  | "Softplus"
  | "Softsign"
  | "HardSwish"
  | "HardSigmoid"
  | "ThresholdedRelu"
  | "Elu"
  | "ParametricRelu";

/**
 * `libailia.dylib` 내 `ailia::Layer::Activation::*Layer` 및 `ailia::TensorMath` 심볼과 동일하게
 * 텐서 버퍼에 신경망 활성화 함수를 적용합니다.
 */
export function applyCspAiliaActivationTensor(
  input: Float32Array,
  activation: CspAiliaActivationType,
  paramAlpha = 0.2,
): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const x = input[i]!;
    switch (activation) {
      case "Sigmoid":
        out[i] = 1 / (1 + Math.exp(-x));
        break;
      case "Softplus":
        out[i] = Math.log1p(Math.exp(x));
        break;
      case "Softsign":
        out[i] = x / (1 + Math.abs(x));
        break;
      case "HardSigmoid":
        out[i] = Math.max(0, Math.min(1, 0.2 * x + 0.5));
        break;
      case "HardSwish":
        out[i] = x * Math.max(0, Math.min(1, x / 6 + 0.5));
        break;
      case "ThresholdedRelu":
        out[i] = x > paramAlpha ? x : 0;
        break;
      case "Elu":
        out[i] = x >= 0 ? x : paramAlpha * (Math.exp(x) - 1);
        break;
      case "ParametricRelu":
        out[i] = x >= 0 ? x : paramAlpha * x;
        break;
    }
  }
  return out;
}

/**
 * `libailia.dylib`의 `ailia::CHCDecoder::create_hanukemap` 및 클립스튜디오 '빈틈 없이 칠하기 / 칠 누락 확인' 동작을 재현하여
 * 선화 알파(lineAlphaBytes)와 밑색 알파(fillAlphaBytes) 사이의 미세한 미채색 픽셀(하누케/틈새) 마스크를 검출합니다.
 */
export function computeCspAiliaHanukeEnclosedGapMap(params: {
  readonly width: number;
  readonly height: number;
  readonly lineAlphaBytes: Uint8Array;
  readonly fillAlphaBytes: Uint8Array;
  readonly maxGapRadiusPx?: number;
}): {
  readonly gapMaskBytes: Uint8Array;
  readonly detectedGapPixelCount: number;
} {
  const { width, height, lineAlphaBytes, fillAlphaBytes } = params;
  const radius = Math.max(1, Math.min(8, params.maxGapRadiusPx ?? 2));
  const gapMask = new Uint8Array(width * height);
  let detectedGapPixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if ((lineAlphaBytes[idx] ?? 0) > 128 || (fillAlphaBytes[idx] ?? 0) > 128) {
        continue;
      }
      // 반경 내 선화 픽셀과 채색 픽셀이 동시에 둘러싸고 있는 미세 공백인지 검사
      let hasLineNeighbor = false;
      let fillDirectionCount = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const nIdx = ny * width + nx;
          if ((lineAlphaBytes[nIdx] ?? 0) > 128) {
            hasLineNeighbor = true;
          }
          if ((fillAlphaBytes[nIdx] ?? 0) > 128) {
            fillDirectionCount += 1;
          }
        }
      }

      if (hasLineNeighbor && fillDirectionCount >= 2) {
        gapMask[idx] = 255;
        detectedGapPixelCount += 1;
      }
    }
  }

  return {
    gapMaskBytes: gapMask,
    detectedGapPixelCount,
  };
}
