import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { StudioBg3dCaptureEnvironmentContext as Context,
  type StudioBg3dCaptureEnvironmentApplication as Application,
  type StudioBg3dCaptureEnvironmentChannel as Channel } from "./studio-bg3d-capture-environment-context";
import { publishStudioBg3dCaptureEnvironment } from "./studio-bg3d-capture-environment-receipt";
import { getStudioBg3dWebglRecoverySnapshot, STUDIO_BG3D_WEBGL_RECOVERY_EVENT } from "./studio-bg3d-webgl-context-recovery";
import type { ReactNode } from "react";
import type { StudioBg3dCaptureEnvironmentIntent, StudioBg3dCaptureEnvironmentOwner } from "./studio-bg3d-capture-environment-intent";
import { createStudioBg3dCaptureEnvironmentIntent } from "./studio-bg3d-capture-environment-intent";

function createChannel(scene: object, renderer: object, intent: StudioBg3dCaptureEnvironmentIntent, generation: number): Channel {
  type Report = { application: Application; applied: boolean };
  type Attempt = { active: boolean; reports: Map<StudioBg3dCaptureEnvironmentOwner, Report>;
    settle: (value: boolean) => void; publication: { dispose(): void }; needsPublication: boolean };
  let current: Attempt | null = null;
  const required = new Set([intent.environment, intent.background]);
  const verify = (attempt: Attempt): boolean => attempt.active && current === attempt && [...required].every((owner) => {
    const report = attempt.reports.get(owner);
    return report?.applied === true && report.application.isApplied() === true;
  });
  const finish = (attempt: Attempt) => {
    if (!attempt.active || current !== attempt || ![...required].every((owner) => attempt.reports.get(owner)?.applied)) return;
    try { attempt.settle(verify(attempt)); } catch { attempt.settle(false); }
  };
  const publish = (attempt: Attempt) => {
    const ready = new Promise<boolean>((resolve) => { attempt.settle = resolve; });
    attempt.needsPublication = false;
    attempt.publication = publishStudioBg3dCaptureEnvironment(scene, renderer, {
      fingerprint: intent.fingerprint, ready, isApplied: () => verify(attempt),
    });
  };
  const invalidate = () => {
    const attempt = current; current = null;
    if (!attempt) return;
    attempt.active = false; attempt.settle(false); attempt.publication.dispose();
  };
  return {
    intent, generation, invalidate,
    activate() {
      invalidate();
      const attempt: Attempt = { active: true, reports: new Map(), settle() {}, publication: { dispose() {} }, needsPublication: false };
      current = attempt;
      publish(attempt);
      return () => { if (current === attempt) invalidate(); else { attempt.active = false; attempt.settle(false); attempt.publication.dispose(); } };
    },
    report(owner, application) {
      const attempt = current;
      if (!attempt?.active || !required.has(owner)) return () => {};
      // 실제 생산자가 같은 요청으로 재마운트하면 새 opaque entry만 게시한다. GPU 작업은 재시작하지 않는다.
      if (attempt.needsPublication) publish(attempt);
      const report: Report = { application, applied: false };
      attempt.reports.set(owner, report);
      void Promise.resolve(application.ready).then((ready) => {
        if (!attempt.active || current !== attempt || attempt.reports.get(owner) !== report) return;
        if (ready !== true) { attempt.settle(false); return; }
        report.applied = true; finish(attempt);
      }, () => { if (attempt.active && current === attempt && attempt.reports.get(owner) === report) attempt.settle(false); });
      return () => {
        if (attempt.reports.get(owner) !== report) return;
        attempt.reports.delete(owner);
        if (attempt.active && current === attempt) {
          attempt.needsPublication = true; attempt.settle(false); attempt.publication.dispose();
        }
      };
    },
  };
}

/** 슬롯을 쓰지 않고 같은 Scene/renderer의 요청과 실제 두 생산자의 적용을 합성한다. */
export function StudioBg3dCaptureEnvironmentAuthority({ intent, children }: {
  readonly intent: StudioBg3dCaptureEnvironmentIntent; readonly children: ReactNode;
}) {
  const scene = useThree((state) => state.scene), gl = useThree((state) => state.gl);
  const [epoch, setEpoch] = useState(0);
  const { source, assetId, intensity, rotationDegrees, useAsBackground } = intent.settings;
  const { fileTier, skyPresetId, panoramaRotationDegrees, immersiveAr } = intent;
  const stableIntent = useMemo(() => createStudioBg3dCaptureEnvironmentIntent({
    settings: { source, assetId, intensity, rotationDegrees, useAsBackground },
    fileTier, skyPresetId, panoramaRotationDegrees, immersiveAr,
  }), [source, assetId, intensity, rotationDegrees, useAsBackground, fileTier, skyPresetId, panoramaRotationDegrees, immersiveAr]);
  const channel = useMemo(() => createChannel(scene, gl, stableIntent, epoch), [epoch, gl, stableIntent, scene]);
  useLayoutEffect(() => channel.activate(), [channel]);
  useLayoutEffect(() => {
    if (!("isWebGLRenderer" in gl) || gl.isWebGLRenderer !== true) return undefined;
    const canvas = gl.domElement;
    let last = getStudioBg3dWebglRecoverySnapshot(canvas);
    const lost = () => channel.invalidate();
    const restored = () => {
      const snapshot = getStudioBg3dWebglRecoverySnapshot(canvas);
      if (snapshot && (snapshot.phase !== "restored" || snapshot === last)) return;
      last = snapshot; setEpoch((value) => value + 1);
    };
    const notice = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail: unknown = event.detail;
      if (!detail || typeof detail !== "object" || !("owner" in detail) || detail.owner !== canvas) return;
      const snapshot = getStudioBg3dWebglRecoverySnapshot(canvas);
      if (snapshot?.phase === "restored") restored(); else if (snapshot && snapshot.phase !== "healthy") lost();
    };
    canvas.addEventListener("webglcontextlost", lost); canvas.addEventListener("webglcontextrestored", restored);
    window.addEventListener(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, notice);
    const snapshot = getStudioBg3dWebglRecoverySnapshot(canvas);
    if (snapshot && snapshot.phase !== "healthy" && snapshot.phase !== "restored") lost();
    return () => {
      canvas.removeEventListener("webglcontextlost", lost); canvas.removeEventListener("webglcontextrestored", restored);
      window.removeEventListener(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, notice);
    };
  }, [channel, gl]);
  useEffect(() => {
    if (stableIntent.environment !== "none" && stableIntent.background !== "none") return undefined;
    return channel.report("none", { ready: Promise.resolve(true), isApplied: () =>
      (stableIntent.environment !== "none" || scene.environment === null) && (stableIntent.background !== "none" || scene.background === null) });
  }, [channel, stableIntent, scene]);
  return <Context value={channel}>{children}</Context>;
}
