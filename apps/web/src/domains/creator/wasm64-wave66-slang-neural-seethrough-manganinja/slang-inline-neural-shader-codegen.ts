/**
 * SIGGRAPH 2025/2026 `neural.slang` 인라인 뉴럴 셰이더 템플릿·Slang/WGSL 코드 생성기·계약 검증기 및 기본 촉각 브러시 사양.
 */

import type {
  CompiledInlineNeuralShaderArtifact,
  InlineNeuralHiddenActivation,
  InlineNeuralMlpSpec,
  InlineNeuralOutputActivation,
  InlineNeuralQuantization,
  QuantizedWeightBufferLayout,
  WgslSyntaxContractReport,
} from "./slang-inline-neural-shader-compiler";

export const TACTILE_BRUSH_INPUT_DIM = 8;
export const TACTILE_BRUSH_HIDDEN_DIM = 12;
export const TACTILE_BRUSH_OUTPUT_DIM = 4;

/**
 * SIGGRAPH 2025/2026 `neural.slang` 스타일 기준 웹툰 촉각 브러시 인라인 2계층 MLP 셰이더 템플릿.
 */
export const SLANG_INLINE_TACTILE_BRUSH_SHADER = `// SIGGRAPH 2025/2026 Slang Inline Neural Tactile Brush Shader (neural.slang)
import neural;

static const uint kInputDim = 8;
static const uint kHiddenDim = 12;
static const uint kOutputDim = 4;

struct InlineNeuralMeta {
    uint sampleCount;
    uint inputDim;
    uint hiddenDim;
    uint outputDim;
    float w1Scale;
    float b1Scale;
    float w2Scale;
    float b2Scale;
};

interface ITactileBrushMlp {
    InlineVector<float, kOutputDim> eval(InlineVector<float, kInputDim> features);
};

struct TactileBrushInlineMlp : ITactileBrushMlp {
    StructuredBuffer<uint> packedWeights;
    InlineNeuralMeta meta;

    InlineVector<float, kOutputDim> eval(InlineVector<float, kInputDim> features) {
        InlineVector<float, kHiddenDim> hidden;
        [unroll]
        for (uint h = 0; h < kHiddenDim; ++h) {
            float acc = unpackHalf2x16(packedWeights[h >> 1])[h & 1u] * meta.b1Scale;
            [unroll]
            for (uint i = 0; i < kInputDim; ++i) {
                uint flatIdx = h * kInputDim + i;
                float w = unpackHalf2x16(packedWeights[flatIdx >> 1])[flatIdx & 1u] * meta.w1Scale;
                acc = fma(w, features[i], acc);
            }
            hidden[h] = max(acc, 0.0f);
        }

        InlineVector<float, kOutputDim> outputVec;
        [unroll]
        for (uint o = 0; o < kOutputDim; ++o) {
            float acc = 0.0f;
            [unroll]
            for (uint h = 0; h < kHiddenDim; ++h) {
                uint flatIdx = o * kHiddenDim + h;
                float w = unpackHalf2x16(packedWeights[flatIdx >> 1])[flatIdx & 1u] * meta.w2Scale;
                acc = fma(w, hidden[h], acc);
            }
            outputVec[o] = 1.0f / (1.0f + exp(-acc));
        }
        return outputVec;
    }
};

ConstantBuffer<InlineNeuralMeta> uMeta : register(b0, space0);
StructuredBuffer<uint> bWeightsPacked : register(t1, space0);
StructuredBuffer<float> bFeatures : register(t2, space0);
RWStructuredBuffer<float> bOutputs : register(u3, space0);

[shader("compute")]
[numthreads(64, 1, 1)]
void cs_inline_neural_brush(uint3 gid : SV_DispatchThreadID) {
    uint sampleIdx = gid.x;
    if (sampleIdx >= uMeta.sampleCount) { return; }
    InlineVector<float, kInputDim> feat;
    [unroll]
    for (uint i = 0; i < kInputDim; ++i) {
        feat[i] = bFeatures[sampleIdx * kInputDim + i];
    }
    TactileBrushInlineMlp net = { bWeightsPacked, uMeta };
    InlineVector<float, kOutputDim> outVec = net.eval(feat);
    [unroll]
    for (uint o = 0; o < kOutputDim; ++o) {
        bOutputs[sampleIdx * kOutputDim + o] = outVec[o];
    }
}
`;

function formatFloatWgsl(value: number): string {
  const rounded = Math.fround(value);
  const str = Number.isInteger(rounded) ? `${rounded}.0` : rounded.toPrecision(7);
  return str.includes(".") || str.includes("e") || str.includes("E") ? str : `${str}.0`;
}

function emitHiddenActivationWgsl(kind: InlineNeuralHiddenActivation): string {
  switch (kind) {
    case "relu":
      return "return max(x, 0.0);";
    case "leaky_relu":
      return "return select(x * 0.1, x, x >= 0.0);";
    case "tanh":
      return "return tanh(x);";
    case "silu":
      return "let cx = clamp(x, -20.0, 20.0); return x / (1.0 + exp(-cx));";
  }
}

function emitOutputActivationWgsl(kind: InlineNeuralOutputActivation): string {
  switch (kind) {
    case "sigmoid":
      return "let cx = clamp(x, -20.0, 20.0); return 1.0 / (1.0 + exp(-cx));";
    case "clamp01":
      return "return clamp(x, 0.0, 1.0);";
    case "linear":
      return "return x;";
  }
}

function emitHiddenActivationSlang(kind: InlineNeuralHiddenActivation): string {
  switch (kind) {
    case "relu":
      return "max(acc, 0.0f)";
    case "leaky_relu":
      return "(acc >= 0.0f ? acc : acc * 0.1f)";
    case "tanh":
      return "tanh(acc)";
    case "silu":
      return "(acc / (1.0f + exp(-clamp(acc, -20.0f, 20.0f))))";
  }
}

function emitOutputActivationSlang(kind: InlineNeuralOutputActivation): string {
  switch (kind) {
    case "sigmoid":
      return "1.0f / (1.0f + exp(-clamp(acc, -20.0f, 20.0f)))";
    case "clamp01":
      return "clamp(acc, 0.0f, 1.0f)";
    case "linear":
      return "acc";
  }
}

export function buildSlangInlineShaderSource(
  spec: InlineNeuralMlpSpec,
  layout: QuantizedWeightBufferLayout,
  entryPoint: string,
  workgroupSize: readonly [number, number, number],
): string {
  const unpackExpr =
    spec.quantization === "fp16"
      ? "unpackHalf2x16(bWeightsPacked[wordOffset + (idx >> 1u)])[idx & 1u] * scale"
      : "float(bitfieldExtract(int(bWeightsPacked[wordOffset + (idx >> 2u)]), int((idx & 3u) * 8u), 8)) * scale";

  return [
    `// Generated Slang Inline Neural Shader (${spec.shaderId}) — ${spec.quantization.toUpperCase()}`,
    "import neural;",
    `static const uint kInputDim = ${spec.inputDim}u;`,
    `static const uint kHiddenDim = ${spec.hiddenDim}u;`,
    `static const uint kOutputDim = ${spec.outputDim}u;`,
    `static const uint kW1WordOffset = ${layout.w1WordOffset}u;`,
    `static const uint kB1WordOffset = ${layout.b1WordOffset}u;`,
    `static const uint kW2WordOffset = ${layout.w2WordOffset}u;`,
    `static const uint kB2WordOffset = ${layout.b2WordOffset}u;`,
    "struct InlineNeuralMeta {",
    "    uint sampleCount; uint inputDim; uint hiddenDim; uint outputDim;",
    "    float w1Scale; float b1Scale; float w2Scale; float b2Scale;",
    "};",
    "ConstantBuffer<InlineNeuralMeta> uMeta : register(b0, space0);",
    "StructuredBuffer<uint> bWeightsPacked : register(t1, space0);",
    "StructuredBuffer<float> bFeatures : register(t2, space0);",
    "RWStructuredBuffer<float> bOutputs : register(u3, space0);",
    `float loadWeight(uint wordOffset, uint idx, float scale) { return ${unpackExpr}; }`,
    '[shader("compute")]',
    `[numthreads(${workgroupSize[0]}, ${workgroupSize[1]}, ${workgroupSize[2]})]`,
    `void ${entryPoint}(uint3 gid : SV_DispatchThreadID) {`,
    "    uint sampleIdx = gid.x;",
    "    if (sampleIdx >= uMeta.sampleCount) { return; }",
    "    InlineVector<float, kHiddenDim> hidden;",
    "    [unroll]",
    "    for (uint h = 0u; h < kHiddenDim; ++h) {",
    "        float acc = loadWeight(kB1WordOffset, h, uMeta.b1Scale);",
    "        [unroll]",
    "        for (uint i = 0u; i < kInputDim; ++i) {",
    "            float x = bFeatures[sampleIdx * kInputDim + i];",
    "            float w = loadWeight(kW1WordOffset, h * kInputDim + i, uMeta.w1Scale);",
    "            acc = fma(w, x, acc);",
    "        }",
    `        hidden[h] = ${emitHiddenActivationSlang(spec.hiddenActivation)};`,
    "    }",
    "    [unroll]",
    "    for (uint o = 0u; o < kOutputDim; ++o) {",
    "        float acc = loadWeight(kB2WordOffset, o, uMeta.b2Scale);",
    "        [unroll]",
    "        for (uint h = 0u; h < kHiddenDim; ++h) {",
    "            float w = loadWeight(kW2WordOffset, o * kHiddenDim + h, uMeta.w2Scale);",
    "            acc = fma(w, hidden[h], acc);",
    "        }",
    `        bOutputs[sampleIdx * kOutputDim + o] = ${emitOutputActivationSlang(spec.outputActivation)};`,
    "    }",
    "}",
    "",
  ].join("\n");
}

export function buildWgslInlineShaderSource(
  spec: InlineNeuralMlpSpec,
  layout: QuantizedWeightBufferLayout,
  entryPoint: string,
  workgroupSize: readonly [number, number, number],
): string {
  const unpackFnLines =
    spec.quantization === "fp16"
      ? [
          "fn unpack_weight_elem(word_offset: u32, elem_idx: u32, scale: f32) -> f32 {",
          "  let word = b_weights_packed[word_offset + (elem_idx >> 1u)];",
          "  let pair = unpack2x16float(word);",
          "  return select(pair.x, pair.y, (elem_idx & 1u) == 1u) * scale;",
          "}",
        ]
      : [
          "fn unpack_weight_elem(word_offset: u32, elem_idx: u32, scale: f32) -> f32 {",
          "  let word = b_weights_packed[word_offset + (elem_idx >> 2u)];",
          "  let signed_q = extractBits(bitcast<i32>(word), (elem_idx & 3u) * 8u, 8u);",
          "  return f32(signed_q) * scale;",
          "}",
        ];

  return [
    `// Transpiled WebGPU WGSL from Slang Inline Neural Shader (${spec.shaderId})`,
    `const INPUT_DIM: u32 = ${spec.inputDim}u;`,
    `const HIDDEN_DIM: u32 = ${spec.hiddenDim}u;`,
    `const OUTPUT_DIM: u32 = ${spec.outputDim}u;`,
    `const W1_WORD_OFFSET: u32 = ${layout.w1WordOffset}u;`,
    `const B1_WORD_OFFSET: u32 = ${layout.b1WordOffset}u;`,
    `const W2_WORD_OFFSET: u32 = ${layout.w2WordOffset}u;`,
    `const B2_WORD_OFFSET: u32 = ${layout.b2WordOffset}u;`,
    `const DEFAULT_W1_SCALE: f32 = ${formatFloatWgsl(layout.w1Scale)};`,
    `const DEFAULT_B1_SCALE: f32 = ${formatFloatWgsl(layout.b1Scale)};`,
    `const DEFAULT_W2_SCALE: f32 = ${formatFloatWgsl(layout.w2Scale)};`,
    `const DEFAULT_B2_SCALE: f32 = ${formatFloatWgsl(layout.b2Scale)};`,
    "struct InlineNeuralMeta {",
    "  sample_count: u32, input_dim: u32, hidden_dim: u32, output_dim: u32,",
    "  w1_scale: f32, b1_scale: f32, w2_scale: f32, b2_scale: f32,",
    "};",
    "@group(0) @binding(0) var<uniform> u_meta: InlineNeuralMeta;",
    "@group(0) @binding(1) var<storage, read> b_weights_packed: array<u32>;",
    "@group(0) @binding(2) var<storage, read> b_features: array<f32>;",
    "@group(0) @binding(3) var<storage, read_write> b_outputs: array<f32>;",
    ...unpackFnLines,
    `fn activate_hidden(x: f32) -> f32 { ${emitHiddenActivationWgsl(spec.hiddenActivation)} }`,
    `fn activate_output(x: f32) -> f32 { ${emitOutputActivationWgsl(spec.outputActivation)} }`,
    "fn eval_inline_mlp(feat: array<f32, INPUT_DIM>) -> array<f32, OUTPUT_DIM> {",
    "  var hidden: array<f32, HIDDEN_DIM>;",
    "  let w1_scale = select(DEFAULT_W1_SCALE, u_meta.w1_scale, u_meta.w1_scale > 0.0);",
    "  let b1_scale = select(DEFAULT_B1_SCALE, u_meta.b1_scale, u_meta.b1_scale > 0.0);",
    "  let w2_scale = select(DEFAULT_W2_SCALE, u_meta.w2_scale, u_meta.w2_scale > 0.0);",
    "  let b2_scale = select(DEFAULT_B2_SCALE, u_meta.b2_scale, u_meta.b2_scale > 0.0);",
    "  for (var h: u32 = 0u; h < HIDDEN_DIM; h = h + 1u) {",
    "    var acc: f32 = unpack_weight_elem(B1_WORD_OFFSET, h, b1_scale);",
    "    for (var i: u32 = 0u; i < INPUT_DIM; i = i + 1u) {",
    "      acc = fma(unpack_weight_elem(W1_WORD_OFFSET, h * INPUT_DIM + i, w1_scale), feat[i], acc);",
    "    }",
    "    hidden[h] = activate_hidden(acc);",
    "  }",
    "  var out_vec: array<f32, OUTPUT_DIM>;",
    "  for (var o: u32 = 0u; o < OUTPUT_DIM; o = o + 1u) {",
    "    var acc: f32 = unpack_weight_elem(B2_WORD_OFFSET, o, b2_scale);",
    "    for (var h: u32 = 0u; h < HIDDEN_DIM; h = h + 1u) {",
    "      acc = fma(unpack_weight_elem(W2_WORD_OFFSET, o * HIDDEN_DIM + h, w2_scale), hidden[h], acc);",
    "    }",
    "    out_vec[o] = activate_output(acc);",
    "  }",
    "  return out_vec;",
    "}",
    `@compute @workgroup_size(${workgroupSize[0]}, ${workgroupSize[1]}, ${workgroupSize[2]})`,
    `fn ${entryPoint}(@builtin(global_invocation_id) gid: vec3<u32>) {`,
    "  let sample_idx = gid.x;",
    "  if (sample_idx >= u_meta.sample_count) { return; }",
    "  var feat: array<f32, INPUT_DIM>;",
    "  let in_base = sample_idx * INPUT_DIM;",
    "  for (var i: u32 = 0u; i < INPUT_DIM; i = i + 1u) { feat[i] = b_features[in_base + i]; }",
    "  let out_vec = eval_inline_mlp(feat);",
    "  let out_base = sample_idx * OUTPUT_DIM;",
    "  for (var o: u32 = 0u; o < OUTPUT_DIM; o = o + 1u) { b_outputs[out_base + o] = out_vec[o]; }",
    "}",
    "",
  ].join("\n");
}

/**
 * 트랜스파일된 WGSL 소스의 컴퓨트 스테이지·워크그룹·바인딩 계약·구분자 균형을 정적 검사한다.
 */
export function validateTranspiledWgslContract(
  compiled: CompiledInlineNeuralShaderArtifact,
): WgslSyntaxContractReport {
  const src = compiled.wgslSource;
  const hasComputeStage = src.includes("@compute");
  const expectedWorkgroup = `@workgroup_size(${compiled.workgroupSize[0]}, ${compiled.workgroupSize[1]}, ${compiled.workgroupSize[2]})`;
  const hasWorkgroupSize = src.includes(expectedWorkgroup);
  const hasAllRequiredBindings =
    src.includes("@group(0) @binding(0) var<uniform> u_meta: InlineNeuralMeta;") &&
    src.includes("@group(0) @binding(1) var<storage, read> b_weights_packed: array<u32>;") &&
    src.includes("@group(0) @binding(2) var<storage, read> b_features: array<f32>;") &&
    src.includes("@group(0) @binding(3) var<storage, read_write> b_outputs: array<f32>;");
  const hasEvalFunction =
    src.includes("fn eval_inline_mlp(") && src.includes(`fn ${compiled.entryPoint}(`);
  const hasQuantizationUnpacker =
    compiled.quantization === "fp16"
      ? src.includes("unpack2x16float(")
      : src.includes("extractBits(bitcast<i32>(");

  let braceDepth = 0;
  let parenDepth = 0;
  let balanced = true;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    if (braceDepth < 0 || parenDepth < 0) {
      balanced = false;
      break;
    }
  }
  const hasBalancedDelimiters = balanced && braceDepth === 0 && parenDepth === 0;
  const passed =
    hasComputeStage &&
    hasWorkgroupSize &&
    hasAllRequiredBindings &&
    hasEvalFunction &&
    hasQuantizationUnpacker &&
    hasBalancedDelimiters;

  return {
    hasComputeStage,
    hasWorkgroupSize,
    hasAllRequiredBindings,
    hasEvalFunction,
    hasQuantizationUnpacker,
    hasBalancedDelimiters,
    passed,
  };
}

/**
 * 웹툰 G펜·수채·유화 임파스토 촉감을 표현하는 기본 8->12->4 인라인 MLP 사양을 생성한다.
 * 가중치는 2진 분수(dyadic) 기반이라 FP16 양자화 시에도 원본 FP32와 오차 `0`에 가까운 정밀도를 유지한다.
 */
export function createDefaultWebtoonTactileBrushSpec(
  quantization: InlineNeuralQuantization = "fp16",
): InlineNeuralMlpSpec {
  const weightsLayer1: number[] = [
    0.0, 0.0, 1.5, 0.25, -0.25, 0.0, 0.5, -1.0,
    0.0, 0.0, -1.25, 0.5, 0.75, 1.25, -0.75, 0.25,
    0.0, 0.0, 1.25, 0.5, -0.5, 0.25, -0.5, 0.75,
    0.125, -0.125, 0.25, 0.0, -0.25, 1.5, 1.5, 0.0,
    0.0, 0.0, 1.0, -0.25, 0.0, -0.25, 0.25, -1.5,
    0.25, 0.25, 0.25, 1.5, 0.0, 0.75, 0.0, -0.25,
    0.0, 0.0, -0.5, 0.25, 1.5, 0.5, -0.5, 0.5,
    0.0, 0.0, 0.75, 0.0, -0.5, -0.5, 1.0, -0.75,
    0.5, 0.0, 0.25, 0.0, 0.0, 0.75, 0.25, 0.0,
    0.0, 0.5, 0.25, 0.0, 0.0, 0.75, 0.25, 0.0,
    0.0, 0.0, 1.5, -0.25, -0.5, 0.0, -0.25, -0.5,
    -0.25, 0.25, 0.0, 0.25, 0.0, 1.25, 1.0, 0.25,
  ];
  const biasLayer1: number[] = [
    0.25, 0.25, -0.25, -0.5, 0.5, -0.25, -0.25, 0.0, -0.25, -0.25, 0.0, -0.5,
  ];
  const weightsLayer2: number[] = [
    1.5, -1.25, 0.25, 0.25, 1.25, 0.25, -0.75, 0.5, 0.125, 0.125, 0.5, 0.0,
    -0.75, 1.75, -0.25, -0.5, -0.75, 0.5, 1.25, -0.75, 0.25, 0.25, -0.5, -0.25,
    0.5, -0.5, 1.75, -0.5, 0.25, 0.5, -0.25, -0.5, 0.125, 0.125, 1.25, -0.25,
    0.0, -0.25, -0.5, 1.75, 0.0, 0.25, -0.25, 0.5, 0.25, 0.25, -0.25, 1.25,
  ];
  const biasLayer2: number[] = [-0.5, -0.5, -0.75, -0.75];

  return {
    shaderId: "toonstudio_tactile_brush_v1",
    inputDim: TACTILE_BRUSH_INPUT_DIM,
    hiddenDim: TACTILE_BRUSH_HIDDEN_DIM,
    outputDim: TACTILE_BRUSH_OUTPUT_DIM,
    weightsLayer1,
    biasLayer1,
    weightsLayer2,
    biasLayer2,
    hiddenActivation: "relu",
    outputActivation: "sigmoid",
    quantization,
    entryPoint: "cs_inline_neural_brush",
    workgroupSize: [64, 1, 1],
  };
}
