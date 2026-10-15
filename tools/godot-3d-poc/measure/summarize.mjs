#!/usr/bin/env node
/**
 * run.mjs 가 만든 측정 결과 JSON 을 마크다운 표로 요약한다.
 * 보고서의 표는 이 출력에서 옮긴다. 값을 손으로 다시 계산하거나 반올림하지 않는다.
 *
 * 사용(저장소 루트에서):
 *   node tools/godot-3d-poc/measure/summarize.mjs docs/evidence/godot-3d-poc/2026-10-15/results-4.4.1-b*.json
 * 여러 파일을 주면 스위트 단위로 합친다(뒤의 파일이 같은 스위트를 덮어쓴다).
 * 셀 표기: `중앙값 ±MAD (n)`. n 은 유효 반복 수, MAD 는 중앙값 절대편차다.
 */
import { readFileSync } from "node:fs";

const files = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (files.length === 0) {
  console.error("사용: node tools/godot-3d-poc/measure/summarize.mjs <results-*.json> [...]");
  process.exit(2);
}

const merged = { environments: [], suites: {} };
for (const file of files) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  merged.environments.push({ file, label: data.label, environment: data.environment, startedAt: data.startedAt, finishedAt: data.finishedAt });
  Object.assign(merged.suites, data.suites ?? {});
}
const suites = merged.suites;

const num = (value, digits = 1) => (typeof value === "number" && Number.isFinite(value) ? String(Math.round(value * 10 ** digits) / 10 ** digits) : "—");
/** 요약 객체({n, median, mad})를 셀 문자열로. */
function cell(summary, digits = 1) {
  if (!summary || !summary.n) return "—";
  return `${num(summary.median, digits)} ±${num(summary.mad, digits)} (${summary.n})`;
}
const row = (...cells) => `| ${cells.join(" | ")} |`;
const header = (...names) => [row(...names), row(...names.map(() => "---"))].join("\n");
const out = [];
const p = (...lines) => out.push(...lines);

function metaLine(suite) {
  const m = suites[suite]?._meta;
  if (!m) return "";
  return `_조건: 스위트 소요 ${m.seconds}초, loadavg 시작 ${m.loadAverageBefore?.join("/")} -> 종료 ${m.loadAverageAfter?.join("/")}_`;
}

// ── 환경 ────────────────────────────────────────────────────────────────────
p("## 측정 환경");
for (const entry of merged.environments) {
  const env = entry.environment ?? {};
  p(
    `- 파일 \`${entry.file}\`: Godot 라벨 \`${env.godotLabel}\`, 반복 ${env.repeat}회, 시작 ${entry.startedAt}, 종료 ${entry.finishedAt ?? "(미종료)"}`,
    `  - ${env.platform}, CPU ${env.cpus}개(${env.cpuModel}), 메모리 ${env.totalMemMiB} MiB, Node ${env.node}, Chromium ${env.chromium}`,
    `  - WebGL2 렌더러: ${env.webgl?.renderer}, WebGPU: ${env.webgl?.webgpu}, 뷰포트 ${env.viewport?.width}x${env.viewport?.height}`,
    `  - ${env.software}, 시작 시 loadavg ${env.loadAverageAtStart?.join("/")}`,
  );
  for (const [name, info] of Object.entries(env.buildFiles ?? {})) p(`  - 빌드 ${name}: ${info.bytes} B, sha256 \`${info.sha256}\``);
}
p("");

// ── sizes ───────────────────────────────────────────────────────────────────
if (suites.sizes) {
  p("## 크기 (바이트)", "", header("대상", "raw", "gzip9", "brotli9"));
  const sizes = suites.sizes;
  for (const [variant, files2] of Object.entries(sizes.godot ?? {})) {
    for (const [name, v] of Object.entries(files2)) p(row(`Godot PoC ${variant}/${name}`, v.raw, v.gzip9, v.brotli9));
  }
  for (const [site, files2] of Object.entries(sizes.productionBuildsInRepo ?? {})) {
    for (const [name, v] of Object.entries(files2)) p(row(`저장소 운영 ${site}/${name}`, v.raw, v.gzip9, v.brotli9));
  }
  for (const [name, v] of Object.entries(sizes.threeBundles ?? {})) p(row(`Three 번들(${name})`, v.raw, v.gzip9, v.brotli9));
  p("", sizes.note ?? "", "");
}

// ── cold ────────────────────────────────────────────────────────────────────
if (suites.cold) {
  const cold = suites.cold;
  p("## 콜드 기동 (매 반복 새 브라우저, ms는 탐색 시작 기준)", "", metaLine("cold"), "");
  p(header("변형", "결과", "engine.js 준비", "wasm instantiate", "ready 이벤트", "첫 프레임", "wasm 메모리 MiB", "JS 힙 MiB", "RSS 합 MiB", "UA 메모리 MiB"));
  for (const [name, v] of Object.entries(cold.variants ?? {})) {
    const s = v.summary;
    p(row(`\`${name}\`${v.isolated ? " (격리)" : ""}`, Object.entries(s.outcomes ?? {}).map(([k, c]) => `${k} ${c}`).join(", "), cell(s.engineJsReadyMs), cell(s.wasmInstantiateMs), cell(s.readyMs), cell(s.firstFrameMs), cell(s.wasmMemoryMiB, 2), cell(s.jsHeapUsedMiB, 2), cell(s.rssTotalMiB), cell(s.uaMemoryMiB, 2)));
  }
  if (cold.baselineEmptyWebgl) p("", `빈 페이지 + WebGL2 컨텍스트 RSS 합(MiB): ${cell(cold.baselineEmptyWebgl.rssTotalMiB)}`);
  if (cold.runOrder) p("", `실행 순서(라운드 로빈, 반복마다 시작 변형을 한 칸씩 돌림): ${cold.runOrder.join(" | ")}`);
  for (const [name, v] of Object.entries(cold.variants ?? {})) {
    if (v.bootError) p("", `- \`${name}\` 부팅 오류: ${String(v.bootError).replaceAll("\n", " / ").slice(0, 300)}`);
  }
  p("");
}

// ── warm ────────────────────────────────────────────────────────────────────
if (suites.warm) {
  const warm = suites.warm;
  p("## 워밍 시작 (같은 컨텍스트, HTTP 캐시 허용)", "", metaLine("warm"), "", header("구분", "첫 프레임 ms", "wasm instantiate ms", "wasm 전송 바이트"));
  if (warm.coldFill) p(row("캐시 채우는 첫 실행", num(warm.coldFill.firstFrameMs), num(warm.coldFill.wasmInstantiateMs), warm.coldFill.wasmTransfer ?? "—"));
  p(row("워밍 반복", cell(warm.warmSummary?.firstFrameMs), cell(warm.warmSummary?.wasmInstantiateMs), (warm.runs ?? []).filter((r) => r.kind === "warm").map((r) => r.wasmTransfer).join(", ") || "—"), "");
}

// ── revisit ─────────────────────────────────────────────────────────────────
if (suites.revisit && !suites.revisit.error) {
  const revisit = suites.revisit;
  p("## 재방문 (방문마다 새 브라우저 프로세스, 같은 영구 프로필, brotli 전송)", "", metaLine("revisit"), "", `압축 후 크기(B): ${JSON.stringify(revisit.packedBytes)}`, "", header("방문", "n", "첫 프레임 ms", "wasm instantiate ms", "wasm 응답 끝 ms", "wasm transferSize (B)", "encoded (B)", "decoded (B)"));
  for (const [visit, v] of Object.entries(revisit.visits)) p(row(visit === "1" ? "1 (빈 프로필)" : `${visit} (캐시 채워진 뒤)`, v.n, cell(v.firstFrameMs), cell(v.wasmInstantiateMs), cell(v.wasmFetchEndMs), v.wasmTransferBytes.join(", "), v.wasmEncodedBytes.join(", "), v.wasmDecodedBytes.join(", ")));
  p("");
}

// ── coi ─────────────────────────────────────────────────────────────────────
if (suites.coi) {
  p("## 교차 출처 격리(COOP/COEP) 시나리오", "", metaLine("coi"), "", header("시나리오", "결과(반복)", "부모 격리", "프레임 격리", "교차 출처 이미지", "부팅 오류"));
  for (const s of suites.coi.scenarios ?? []) {
    const first = s.runs?.[0] ?? {};
    p(row(s.name, (s.outcomes ?? []).join("/") + ` (${s.runs?.length})`, String(first.parentIsolated), String(first.frameIsolated), JSON.stringify(first.img), String(first.bootError ?? "").replaceAll("\n", " ").slice(0, 120) || "—"));
  }
  p("");
}

// ── glb ─────────────────────────────────────────────────────────────────────
if (suites.glb) {
  p("## GLB 런타임 로드 (Godot GLTFDocument)", "", metaLine("glb"), "");
  for (const [model, v] of Object.entries(suites.glb.models ?? {})) {
    const info = v.model ?? {};
    p(`### ${model}`, "", `삼각형 ${info.triangles}, 정점 ${info.vertices}, 메시 ${info.meshInstances}, 표면 ${info.surfaces}, 본 ${info.bones}, 블렌드셰이프 ${info.blendShapes}, 텍스처 ${info.textures}; 검증 ${JSON.stringify(v.verification)}`, "");
    p(header("방법", "성공", "전체 왕복 ms", "바이트 확보 ms", "parse ms", "generate ms", "toon ms"));
    for (const [method, m] of Object.entries(v.methods ?? {})) p(row(`\`${method}\``, String(m.ok), cell(m.total), cell(m.acquire), cell(m.parse), cell(m.generate), cell(m.toon)));
    p("", `로드 후 메모리: ${JSON.stringify(v.afterLoads)}`, "");
  }
}

// ── ext ─────────────────────────────────────────────────────────────────────
if (suites.ext) {
  const ext = suites.ext;
  p("## glTF 확장 호환 (같은 GLB 를 Godot 과 Three 로 연다)", "", metaLine("ext"), "", header("픽스처", "Godot", "Godot 오류", "Three"));
  const threeByName = Object.fromEntries((ext.three ?? []).map((t) => [String(t.url).split("/").pop(), t]));
  for (const [name, g] of Object.entries(ext.godot ?? {})) {
    const t = threeByName[name];
    const render = g.renderCheck ? ` (렌더 고유색 ${g.renderCheck.uniqueColorsSampled}, 덮임 ${g.renderCheck.coveredRatio})` : "";
    p(row(`\`${name}\``, (g.ok ? "성공" : "실패") + render, g.ok ? "—" : (g.consoleErrors?.[0] ?? g.error ?? "").replace("ERROR: glTF: ", "").slice(0, 110), t ? (t.ok ? `성공(삼각형 ${t.triangles}, ${num(t.ms)} ms)` : `실패 ${t.error ?? ""}`) : "—"));
  }
  p("", `Godot GLTFDocument 가 보고한 지원 확장: ${(ext.godotSupportedExtensions ?? []).join(", ")}`, "");
}

// ── bridge ──────────────────────────────────────────────────────────────────
if (suites.bridge) {
  p("## JS 브리지 비용", "", metaLine("bridge"), "");
  for (const mode of ["standalone", "iframe"]) {
    const b = suites.bridge[mode];
    if (!b) continue;
    p(`### ${mode}`, "", `ping 왕복(ms): ${cell(b.pingRttMs, 2)}`, "", header("JSON 크기(B)", "왕복 ms", "Godot JSON.parse ms"));
    for (const [bytes, v] of Object.entries(b.jsonEcho ?? {})) p(row(bytes, cell(v.rttMs), cell(v.godotJsonParseMs)));
    p("", header("이진 입력(호스트->Godot)", "왕복 ms", "Godot 복사 ms", "sha256 일치"));
    for (const via of Object.keys(b.binaryIn ?? {})) for (const [size, v] of Object.entries(b.binaryIn[via])) p(row(`${via} ${size}`, cell(v.rttMs), cell(v.godotCopyMs, 2), String(v.allShaMatch)));
    p("", header("이진 출력(Godot->호스트, base64)", "왕복 ms", "Godot 인코딩 ms", "호스트 디코딩 ms", "확장비", "sha256 일치"));
    for (const [size, v] of Object.entries(b.binaryOut ?? {})) p(row(size, cell(v.rttMs), cell(v.godotBase64EncodeMs), cell(v.hostBase64DecodeMs), String(v.expansion), String(v.allShaMatch)));
    p("");
  }
}

// ── capture ─────────────────────────────────────────────────────────────────
if (suites.capture) {
  p("## 패스 캡처 (beauty / depth / normal / line / tone)", "", metaLine("capture"), "");
  for (const [model, v] of Object.entries(suites.capture.models ?? {})) {
    p(`### ${model}`, "", header("해상도", "성공", "Godot 합계 ms", "왕복 ms", "beauty", "depth", "normal", "ndl", "line", "tone", "PNG 합계 B"));
    for (const [size, r] of Object.entries(v.sizes ?? {})) {
      const png = r.pngBytes ? Object.values(r.pngBytes).reduce((a, b) => a + b, 0) : "—";
      p(row(size, String(r.ok), cell(r.totalGodotMs), cell(r.rttMs), ...["beauty", "depth", "normal", "ndl", "line", "tone"].map((k) => cell(r.perPassMs?.[k])), String(png)));
    }
    const first = Object.values(v.sizes ?? {})[0];
    if (first?.diag) p("", `8비트 전달 함수 진단: codedRangeMaxError=${first.diag.codedRangeMaxError}, 3D 샘플 ${JSON.stringify(first.diag.threeD)}, toeBelow=${first.diag.toeBelow}`);
    const checks = Object.entries(v.sizes ?? {}).map(([size, r]) => `${size}: ${(r.validity ?? []).map((c) => `${c.name} ${c.pngSignatureOk ? "PNG" : "비PNG"} 비투명 ${c.nonTransparentRatio}`).join(", ")}`);
    p("", ...checks.map((c) => `- ${c}`), "");
  }
}

// ── twopoint ────────────────────────────────────────────────────────────────
if (suites.twopoint) {
  const t = suites.twopoint;
  p("## 2점 투시 (Camera3D frustum_offset)", "", metaLine("twopoint"), "", header("yaw/pitch/거리/fov", "기울임 세로모서리 dx px", "2점 dx px", "타깃 오차 px (2점)", "저장소 공식 lensShiftY", "엔진 역산", "문서 한도 클램프"));
  for (const c of t.cases ?? []) p(row(`${c.case.yaw}/${c.case.pitch}/${c.case.distance}/${c.case.fovDegrees}`, num(c.pitchedMaxVerticalEdgeDxPx, 3), num(c.twoPointMaxVerticalEdgeDxPx, 6), num(c.twoPointTargetErrPx, 3), num(c.formulaLensShiftY, 6), num(c.engineLensShiftY, 6), String(c.clampedByDocumentLimit)));
  p("", `최대 2점 dx=${t.maxTwoPointDxPx} px, 최소 기울임 dx=${num(t.minPitchedDxPx, 3)} px, 공식-엔진 lensShiftY 최대 차이=${t.maxLensShiftDiff}`, `렌더 검증(기둥 알파 마스크): ${JSON.stringify(t.render)}`, "");
}

// ── bench ───────────────────────────────────────────────────────────────────
if (suites.bench) {
  const b = suites.bench;
  p("## 인스턴스 벤치 (12삼각형 박스 N개, 1 드로, SwiftShader — 상대 비교용)", "", metaLine("bench"), "", header("N", "엔진", "setup ms", "프레임 ms(중앙값)", "첫 프레임 ms", "드로", "RSS 합 MiB", "메모리 증가"));
  for (const count of Object.keys(b.godot ?? {})) {
    const g = b.godot[count];
    const t = b.three?.[count];
    p(row(count, "Godot MultiMesh", cell(g.setupMs), cell(g.frameMsMedian), cell(g.firstFrameMs), String(g.drawCalls), cell(g.rssTotalMiB), `wasm +${cell(g.wasmMemoryDeltaMiB, 2)} MiB`));
    if (t) p(row(count, "Three InstancedMesh", cell(t.setupMs), cell(t.frameMsMedian), cell(t.firstFrameMs), String(t.drawCalls), cell(t.rssTotalMiB), `JS 힙 ${cell(t.heapMiB, 2)} MiB`));
  }
  if (b.godotSetupPath10k) p("", `10,000 인스턴스 설정 경로: 버퍼 일괄 ${cell(b.godotSetupPath10k.bufferMs)} ms, 인스턴스별 호출 ${cell(b.godotSetupPath10k.perInstanceCallMs)} ms`, "");
}

// ── compare ─────────────────────────────────────────────────────────────────
if (suites.compare) {
  p("## 같은 GLB 상대 비교 (Godot vs Three, 960x540, 툰 3단 + 외곽선)", "", metaLine("compare"), "", header("모델", "엔진", "삼각형", "첫 모델 프레임 ms", "로드/파싱 ms", "프레임 ms(중앙값)", "RSS 합 MiB", "힙/wasm 메모리 MiB"));
  for (const [model, v] of Object.entries(suites.compare.models ?? {})) {
    const g = v.godot;
    const t = v.three;
    p(row(model, "Godot 4", String(g.triangles), cell(g.modelFirstFrameMs), `${cell(g.loadMs)} (parse ${cell(g.parseMs)})`, cell(g.frameMsMedian), cell(g.rssTotalMiB), `wasm ${cell(g.wasmMemoryMiB, 1)} / JS ${cell(g.jsHeapUsedMiB, 1)}`));
    p(row(model, "Three", String(t.triangles), cell(t.modelFirstFrameMs), `fetch ${cell(t.fetchMs)} + parse ${cell(t.parseMs)}`, cell(t.frameMsMedian), cell(t.rssTotalMiB), `JS ${cell(t.jsHeapMiB, 1)}`));
  }
  p("", "Godot 의 `첫 모델 프레임`은 페이지 탐색 시작부터 GLB 가 그려진 첫 프레임까지이고, 엔진 부팅(wasm 인스턴스화 포함)을 포함한다. Three 쪽은 번들이 이미 작아 부팅 비용이 거의 없다.", "");
}

// ── memory ──────────────────────────────────────────────────────────────────
if (suites.memory) {
  p("## 메모리 반환 (같은 페이지: 부팅 직후 / GLB 로드 / clear-model 뒤)", "", metaLine("memory"), "", header("모델 · 단계", "wasm 메모리 MiB", "JS 힙 MiB", "RSS 합 MiB", "엔진 비디오 MiB", "엔진 텍스처 MiB", "노드 수"));
  for (const [model, v] of Object.entries(suites.memory.models ?? {})) {
    for (const stage of ["before", "loaded", "cleared"]) {
      const s = v[stage] ?? {};
      p(row(`${model} · ${stage}`, cell(s.wasmMemoryMiB, 2), cell(s.jsHeapUsedMiB, 1), cell(s.rssTotalMiB, 1), cell(s.videoMemMiB, 2), cell(s.textureMemMiB, 2), cell(s.nodeCount, 0)));
    }
  }
  p("");
}

process.stdout.write(`${out.join("\n")}\n`);
