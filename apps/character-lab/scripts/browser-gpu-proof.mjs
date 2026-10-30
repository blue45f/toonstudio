/** Playwright init script로 직렬화할 수 있는 실제 GPU 사용 증거 관찰기. */
export function installGpuProofRecorder(config, scope = globalThis) {
  if (scope.__characterLabGpuProof?.recorderVersion === 1) return scope.__characterLabGpuProof;
  const settings = {
    lane: config?.lane ?? "observe",
    ...(config?.expectedVendor !== undefined ? { expectedVendor: config.expectedVendor } : {}),
    ...(config?.expectedArchitecture !== undefined ? { expectedArchitecture: config.expectedArchitecture } : {}),
    ...(config?.expectedWebglRenderer !== undefined ? { expectedWebglRenderer: config.expectedWebglRenderer } : {}),
  };
  const adapters = [];
  const devices = [];
  const webgpuContexts = [];
  const webglContexts = [];
  const errors = [];
  const expectedLosses = [];
  const requestFailures = [];
  const queueRejections = [];
  const deviceQueues = new Map();
  const lossObservations = new Map();
  const adapterIds = new WeakMap();
  const deviceIds = new WeakMap();
  const contextIds = new WeakMap();
  const glIds = new WeakMap();
  const pending = new Set();
  let sequence = 0;
  let deviceSerial = 0;

  function plain(value, depth = 0) {
    if (value === null || value === undefined) return value ?? null;
    if (["string", "boolean"].includes(typeof value)) return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
    if (typeof value === "bigint") return String(value);
    if (depth > 5) return "[depth-limit]";
    if (Array.isArray(value)) return value.map((item) => plain(item, depth + 1));
    if (typeof value !== "object") return String(value);
    const result = {};
    for (const key of Object.keys(value)) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        result[key] = descriptor && "value" in descriptor ? plain(descriptor.value, depth + 1) : "[accessor]";
      }
      catch { result[key] = "[unreadable]"; }
    }
    return result;
  }
  function detail(error) {
    return { name: String(error?.name ?? "Error"), message: String(error?.message ?? error ?? "알 수 없는 GPU 오류") };
  }
  function fail(kind, error, extra = {}) {
    errors.push({ sequence: ++sequence, kind, ...detail(error), ...extra });
  }
  function patch(target, key, factory) {
    try {
      const original = target?.[key];
      if (typeof original !== "function") return;
      const own = Object.getOwnPropertyDescriptor(target, key);
      Object.defineProperty(target, key, {
        configurable: own?.configurable ?? true,
        enumerable: own?.enumerable ?? false,
        writable: own?.writable ?? true,
        value: factory(original),
      });
    } catch (error) { fail("instrumentation", error, { method: key }); }
  }
  function observePromise(result, fulfilled, rejected, wait = true) {
    try {
      if (!result || typeof result.then !== "function") {
        fail("instrumentation", new Error("GPU 비동기 API가 Promise를 반환하지 않았습니다."));
        return;
      }
      let observation;
      observation = result.then(
        (value) => {
          try { fulfilled(value); } catch (error) { fail("instrumentation", error); }
          finally { if (wait) pending.delete(observation); }
        },
        (error) => {
          try { rejected(error); } catch (observerError) { fail("instrumentation", observerError); }
          finally { if (wait) pending.delete(observation); }
        },
      );
      if (wait) pending.add(observation);
      return observation;
    } catch (error) { fail("instrumentation", error); }
  }
  function features(value) {
    try { return value && typeof value[Symbol.iterator] === "function" ? [...value].map(String).sort() : null; }
    catch (error) { fail("instrumentation", error, { method: "device.features" }); return null; }
  }
  function limits(value) {
    if (!value) return null;
    const names = new Set();
    let current = value;
    while (current && current !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(current)) names.add(name);
      current = Object.getPrototypeOf(current);
    }
    const result = {};
    for (const name of [...names].sort()) {
      try {
        const entry = value[name];
        if (typeof entry === "number" && Number.isFinite(entry)) result[name] = entry;
        else if (typeof entry === "bigint") result[name] = String(entry);
      } catch (error) { fail("instrumentation", error, { method: `device.limits.${name}` }); }
    }
    return result;
  }
  function adapterInfo(adapter) {
    try {
      const info = adapter.info;
      if (!info) return null;
      return {
        vendor: typeof info.vendor === "string" ? info.vendor : null,
        architecture: typeof info.architecture === "string" ? info.architecture : null,
        device: typeof info.device === "string" ? info.device : null,
        description: typeof info.description === "string" ? info.description : null,
        isFallbackAdapter: typeof info.isFallbackAdapter === "boolean" ? info.isFallbackAdapter : null,
      };
    } catch (error) { fail("instrumentation", error, { method: "adapter.info" }); return null; }
  }
  function registerDevice(device, adapterId, options) {
    if (!device || typeof device !== "object") return null;
    if (deviceIds.has(device)) return deviceIds.get(device);
    const id = `device-${++deviceSerial}`;
    deviceIds.set(device, id);
    const record = {
      id, adapterId, createdSequence: ++sequence, requestOptions: plain(options),
      features: features(device.features), limits: limits(device.limits),
      destroySequence: null, shutdownExpectation: null, loss: null,
    };
    devices.push(record);
    const queue = device.queue;
    if (queue && typeof queue.onSubmittedWorkDone === "function") {
      deviceQueues.set(id, queue);
      patch(queue, "onSubmittedWorkDone", (original) => function (...args) {
        const result = original.apply(this, args);
        observePromise(result, () => {}, (error) => queueRejections.push({ sequence: ++sequence, deviceId: id, ...detail(error) }));
        return result;
      });
    }
    if (typeof device.addEventListener === "function") {
      device.addEventListener("uncapturederror", (event) => fail("uncaptured-error", event?.error, { deviceId: id }));
    } else fail("instrumentation", new Error("GPUDevice 오류 이벤트를 관찰할 수 없습니다."), { deviceId: id });
    patch(device, "popErrorScope", (original) => function (...args) {
      const result = original.apply(this, args);
      observePromise(result, (error) => {
        if (error !== null) fail("error-scope", error, { deviceId: id });
      }, (error) => fail("error-scope-rejected", error, { deviceId: id }));
      return result;
    });
    patch(device, "destroy", (original) => function (...args) {
      const result = original.apply(this, args);
      if (record.destroySequence === null) record.destroySequence = ++sequence;
      return result;
    });
    // lost는 장치 수명 동안 pending이므로 settle이 이를 기다리면 안 된다.
    const lossObservation = observePromise(device.lost, (info) => {
      const loss = { sequence: ++sequence, reason: String(info?.reason ?? "unknown"), message: String(info?.message ?? "") };
      record.loss = loss;
      const expected = record.destroySequence !== null && loss.reason === "destroyed";
      if (expected) expectedLosses.push({ deviceId: id, ...loss, shutdownReason: record.shutdownExpectation?.reason ?? "explicit-destroy" });
      else fail("unexpected-device-loss", new Error(loss.message || "GPUDevice가 예기치 않게 소실됐습니다."), { deviceId: id, reason: loss.reason });
    }, (error) => fail("device-lost-rejected", error, { deviceId: id }), false);
    lossObservations.set(id, lossObservation);
    return id;
  }
  function registerAdapter(adapter, options) {
    if (!adapter || typeof adapter !== "object") return;
    if (adapterIds.has(adapter)) return;
    const id = `adapter-${adapters.length + 1}`;
    adapterIds.set(adapter, id);
    adapters.push({ id, requestOptions: plain(options), info: adapterInfo(adapter) });
    patch(adapter, "requestDevice", (original) => function (...args) {
      const result = original.apply(this, args);
      observePromise(result, (device) => registerDevice(device, id, args[0]),
        (error) => requestFailures.push({ kind: "request-device", adapterId: id, ...detail(error) }));
      return result;
    });
  }
  function gpuContext(context, source) {
    if (contextIds.has(context)) return contextIds.get(context);
    const record = { id: `webgpu-${webgpuContexts.length + 1}`, source, configured: false, deviceId: null, configureAttempts: [] };
    contextIds.set(context, record);
    webgpuContexts.push(record);
    patch(context, "configure", (original) => function (...args) {
      // 관찰기는 native 옵션·리턴·예외를 바꾸지 않는다. 엄격 판정은 Node pixel gate가 한다.
      const result = original.apply(this, args);
      try {
        const device = args[0]?.device;
        const deviceId = deviceIds.get(device) ?? registerDevice(device, null, null);
        record.deviceId = deviceId ?? null;
        record.configured = true;
        record.configureAttempts.push({ sequence: ++sequence, deviceId: record.deviceId, format: args[0]?.format ?? null });
      } catch (error) { fail("instrumentation", error, { method: "GPUCanvasContext.configure" }); }
      return result;
    });
    patch(context, "unconfigure", (original) => function (...args) {
      const result = original.apply(this, args);
      record.configured = false;
      return result;
    });
    return record;
  }
  function webglContext(context, source) {
    if (glIds.has(context)) return;
    const record = { id: `webgl2-${webglContexts.length + 1}`, source, vendor: null, renderer: null };
    glIds.set(context, record.id);
    try {
      const extension = context.getExtension("WEBGL_debug_renderer_info");
      if (extension) {
        const vendor = context.getParameter(extension.UNMASKED_VENDOR_WEBGL);
        const renderer = context.getParameter(extension.UNMASKED_RENDERER_WEBGL);
        record.vendor = typeof vendor === "string" ? vendor : null;
        record.renderer = typeof renderer === "string" ? renderer : null;
      }
    } catch (error) { record.proofProblem = detail(error); }
    webglContexts.push(record);
  }
  for (const name of ["HTMLCanvasElement", "OffscreenCanvas"]) {
    const prototype = scope[name]?.prototype;
    patch(prototype, "getContext", (original) => function (...args) {
      const result = original.apply(this, args);
      if (result) {
        try {
          if (args[0] === "webgpu") gpuContext(result, name);
          else if (args[0] === "webgl2") webglContext(result, name);
        } catch (error) { fail("instrumentation", error, { method: `${name}.getContext` }); }
      }
      return result;
    });
  }
  const gpu = scope.navigator?.gpu;
  patch(gpu, "requestAdapter", (original) => function (...args) {
    const result = original.apply(this, args);
    observePromise(result, (adapter) => registerAdapter(adapter, args[0]),
      (error) => requestFailures.push({ kind: "request-adapter", ...detail(error) }));
    return result;
  });
  function snapshot() {
    const expectedQueueErrors = [];
    const unexpectedQueueErrors = [];
    for (const error of queueRejections) {
      const device = devices.find((entry) => entry.id === error.deviceId);
      const expected = device?.destroySequence !== null && error.sequence > device?.destroySequence && device?.loss?.reason === "destroyed";
      if (expected) expectedQueueErrors.push(error);
      else unexpectedQueueErrors.push({ ...error, kind: "queue-work-done-rejected" });
    }
    return plain({ schema: "toonstudio.character-lab-gpu-proof/1", config: settings,
      origin: scope.location?.origin ?? null, isSecureContext: scope.isSecureContext === true,
      adapters, devices, webgpuContexts, webglContexts, errors: [...errors, ...unexpectedQueueErrors], expectedLosses,
      expectedQueueErrors, requestFailures, pendingObservations: pending.size });
  }
  const api = {
    recorderVersion: 1,
    snapshot,
    expectCurrentDeviceShutdown(reason) {
      const expectation = { sequence: ++sequence, reason: String(reason) };
      for (const device of devices) {
        if (device.destroySequence === null && device.loss === null) device.shutdownExpectation = { ...expectation };
      }
    },
    async settle() {
      await Promise.resolve();
      for (const device of devices) {
        // 이미 destroy된 queue에는 새 완료 요청을 보내지 않는다. lost 판정은 별도로 유지한다.
        if (device.destroySequence !== null) continue;
        const queue = deviceQueues.get(device.id);
        if (!queue) continue;
        try { queue.onSubmittedWorkDone(); }
        catch (error) { queueRejections.push({ sequence: ++sequence, deviceId: device.id, ...detail(error) }); }
      }
      while (pending.size) await Promise.all([...pending]);
      // destroy가 실제 호출된 장치만 loss reason까지 기다린다. 살아 있는 장치는 기다리지 않는다.
      await Promise.all(devices.filter((device) => device.destroySequence !== null).map((device) => lossObservations.get(device.id)));
      await Promise.resolve();
      return snapshot();
    },
  };
  scope.__characterLabGpuProof = api;
  return api;
}

/** 실제 renderer context의 증거만 판정한다. capability adapter는 대체 증거가 아니다. */
export function validateGpuProofSnapshot(snapshot, backend, consoleDiagnostics = []) {
  const problems = [];
  const fingerprints = [];
  if (!snapshot || snapshot.schema !== "toonstudio.character-lab-gpu-proof/1") {
    return { ok: false, problems: ["GPU 증거 snapshot이 없거나 schema가 다릅니다."], fingerprints };
  }
  const config = snapshot.config ?? {};
  for (const key of ["adapters", "devices", "webgpuContexts", "webglContexts", "errors"]) {
    if (!Array.isArray(snapshot[key])) problems.push(`GPU 증거 배열이 없습니다: ${key}`);
  }
  if (problems.length) return { ok: false, problems, fingerprints };
  const strict = config.lane === "native" || config.lane === "software";
  if (!["observe", "native", "software"].includes(config.lane)) problems.push("알 수 없는 GPU 증거 lane입니다.");
  if (!["webgpu", "webgl2"].includes(backend)) problems.push(`알 수 없는 backend: ${String(backend)}`);
  for (const error of snapshot.errors ?? []) problems.push(`${error.kind}: ${error.message ?? "GPU 오류"}${error.deviceId ? ` (${error.deviceId})` : ""}`);
  if (!Array.isArray(consoleDiagnostics)) problems.push("GPU 콘솔 진단 배열이 올바르지 않습니다.");
  else {
    for (const diagnostic of consoleDiagnostics) {
      const classified = diagnostic && classifyGpuConsoleDiagnostic(diagnostic.type, diagnostic.message);
      if (classified) problems.push(`${classified.kind} (${classified.code}): ${classified.message}`);
    }
  }
  if (strict && (!snapshot.isSecureContext || !snapshot.origin || snapshot.origin === "null")) problems.push("실제 보안 origin의 GPU 증거가 필요합니다.");
  const software = /swiftshader|llvmpipe|lavapipe|softpipe|software|basic render|subzero/iu;
  function regexMatch(pattern, value, label) {
    if (pattern === undefined) return;
    try { if (!new RegExp(pattern, "iu").test(String(value ?? ""))) problems.push(`${label} 지문 불일치: ${String(value)}`); }
    catch { problems.push(`${label} 기대값 정규식이 올바르지 않습니다.`); }
  }
  if (backend === "webgpu") {
    const contexts = (snapshot.webgpuContexts ?? []).filter((context) => context.configureAttempts?.length > 0);
    if (strict && !contexts.length) problems.push("실제 configure된 WebGPU context가 없습니다.");
    for (const context of contexts) {
      const usedDeviceIds = new Set(context.configureAttempts.map((attempt) => attempt.deviceId));
      for (const usedDeviceId of usedDeviceIds) {
        const device = snapshot.devices.find((entry) => entry.id === usedDeviceId);
        const adapter = (snapshot.adapters ?? []).find((entry) => entry.id === device?.adapterId);
        const info = adapter?.info;
        if (!device || !adapter || !info) {
          if (strict) problems.push(`${context.id}: 실제 device→adapter 연결 증거가 없습니다.`);
          continue;
        }
        const fp = { backend, contextId: context.id, deviceId: device.id, adapterId: adapter.id,
          ...info, features: device.features, limits: device.limits };
        fingerprints.push(fp);
        if (!strict) continue;
        if (!Array.isArray(device.features) || !device.limits || !Object.keys(device.limits).length) problems.push(`${device.id}: 실제 device features/limits 증거가 없습니다.`);
        if (typeof info.isFallbackAdapter !== "boolean") problems.push(`${device.id}: actual adapter.info.isFallbackAdapter 증거가 없습니다.`);
        const isSoftware = info.isFallbackAdapter === true || software.test([info.vendor, info.architecture, info.device, info.description].join(" "));
        if (config.lane === "native" && isSoftware) problems.push(`${device.id}: native lane에서 software/fallback adapter를 사용했습니다.`);
        if (config.lane === "software" && !isSoftware) problems.push(`${device.id}: software lane의 실제 adapter 증거가 아닙니다.`);
        if (config.lane === "native" && ![info.vendor, info.architecture, info.device, info.description].some((value) => typeof value === "string" && value.length > 0)) problems.push(`${device.id}: adapter 식별 지문이 비어 있습니다.`);
        if (config.expectedVendor !== undefined && String(info.vendor).toLowerCase() !== String(config.expectedVendor).toLowerCase()) problems.push(`${device.id}: vendor 지문 불일치: ${String(info.vendor)}`);
        regexMatch(config.expectedArchitecture, info.architecture, "architecture");
      }
    }
  }
  if (backend === "webgl2") {
    const contexts = snapshot.webglContexts ?? [];
    if (strict && !contexts.length) problems.push("실제 getContext로 얻은 WebGL2 context가 없습니다.");
    for (const context of contexts) {
      fingerprints.push({ backend, contextId: context.id, source: context.source, vendor: context.vendor, renderer: context.renderer });
      if (!strict) continue;
      if (typeof context.vendor !== "string" || !context.vendor || typeof context.renderer !== "string" || !context.renderer) problems.push(`${context.id}: unmasked WebGL vendor/renderer 증거가 없습니다.`);
      const isSoftware = software.test(`${context.vendor ?? ""} ${context.renderer ?? ""}`);
      if (config.lane === "native" && isSoftware) problems.push(`${context.id}: native lane에서 software WebGL을 사용했습니다.`);
      if (config.lane === "software" && !isSoftware) problems.push(`${context.id}: software WebGL renderer 증거가 아닙니다.`);
      regexMatch(config.expectedWebglRenderer, context.renderer, "WebGL renderer");
    }
  }
  return { ok: problems.length === 0, problems, fingerprints };
}

/** Node 측 증거 수집이 멈춰도 실패 보고와 브라우저 정리로 진행할 수 있게 제한한다. */
export async function withGpuProofDeadline(read, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`GPU proof collection timed out (${timeoutMs}ms)`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** 일반 경고와 구별되는 GPU 오류 진단만 Node 측 실패 근거로 반환한다. */
export function classifyGpuConsoleDiagnostic(type, text) {
  const level = String(type ?? "").toLowerCase();
  if (!["warn", "warning", "error"].includes(level)) return null;
  const message = String(text ?? "");
  let code = null;
  if (/\bGPU(?:Validation|OutOfMemory|Internal)Error\b/iu.test(message)) {
    code = "gpu-error-class";
  } else if (/\bWebGPU\b\s*[:\]-]?\s*(?:(?:warning|warn)\s*:\s*)?(?:uncaptured(?:\s+(?:validation|internal))?\s+error\b|(?:validation|internal)\s+error\b|error(?:\s*:|(?=\s+(?:during|while|when|in|at)\b|[.!]|$))|(?:GPU\s+)?device\s+(?:(?:was|is)\s+)?lost\b|out[ -]of[ -]memory\b)/iu.test(message)) {
    code = "webgpu-error";
  } else if (/\bGL_(?:INVALID_ENUM|INVALID_VALUE|INVALID_OPERATION|INVALID_FRAMEBUFFER_OPERATION|OUT_OF_MEMORY|CONTEXT_LOST(?:_WEBGL)?)\b/iu.test(message)
    || /\bWebGL2?\b[^\n]{0,80}\b(?:INVALID_ENUM|INVALID_VALUE|INVALID_OPERATION|INVALID_FRAMEBUFFER_OPERATION|OUT_OF_MEMORY|CONTEXT_LOST(?:_WEBGL)?)\b/iu.test(message)) {
    code = "webgl-error-token";
  } else if (/\b(?:shader(?:\s+compilation|\s+compile)?\s+(?:failed|failure)|shader\s+(?:compilation|compile)\s+error|(?:failed\s+to\s+compile|error\s+(?:(?:while|when)\s+)?compiling)\s+(?:(?:a|the|vertex|fragment|compute)\s+)*shader|shader\s+could\s+not\s+be\s+compiled|THREE\.WebGLProgram\s*:\s*Shader\s+Error)\b/iu.test(message)) {
    code = "shader-compilation-failure";
  }
  return code === null ? null : { kind: "gpu-console-diagnostic", type: level === "error" ? "error" : "warning", code, message };
}

/** 브라우저 종료가 실패해도 이 프로브의 preview 정리는 반드시 호출한다. */
export async function closeBrowserAndStopPreview(closeBrowser, stopPreview, timeoutMs) {
  try {
    return await withGpuProofDeadline(closeBrowser, timeoutMs);
  } finally {
    await stopPreview();
  }
}
