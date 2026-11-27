import { MathUtils, Matrix4, Quaternion, Vector3 } from "three";

import { measurePonytailContact } from "./ponytail-contact.mjs";
import { measureMountedTail } from "./tail-body.mjs";

const threshold = 12;
function differs(a, b, i) {
  return Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) >= threshold;
}
function difference(a, b) {
  let pixels = 0;
  for (let i = 0; i < a.length; i += 4) if (differs(a, b, i)) pixels++;
  return pixels;
}

// An accessory pixel is counted as covered when removing it changes the hair-free image
// but has no visible effect in the original composite. This is a view-dependent occlusion
// diagnostic, including legitimate foreground strands; it does not measure mesh penetration.
function accessoryEvidence(full, withoutProp, withoutHair, withoutBoth) {
  let visible = 0;
  let visibleWithoutHair = 0;
  let coveredByHair = 0;
  for (let i = 0; i < full.length; i += 4) {
    const withHair = differs(full, withoutProp, i);
    const bare = differs(withoutHair, withoutBoth, i);
    if (withHair) visible++;
    if (bare) visibleWithoutHair++;
    if (bare && !withHair) coveredByHair++;
  }
  return { visible, visibleWithoutHair, coveredByHair };
}

function headLocalProbes(root, head) {
  const inverseHead = new Matrix4().copy(head.matrixWorld).invert();
  const point = new Vector3();
  const positions = [];
  root.traverseVisible(mesh => {
    const pos = mesh.geometry?.attributes.position;
    if (!mesh.isMesh || !pos?.count) return;
    // The shipped wearable GLBs and procedural hair are rigid meshes. Reading an undeformed
    // position attribute for a new skinned asset would give misleading motion evidence.
    if (mesh.isSkinnedMesh) throw new Error(`Skinned probe requires evaluated vertices: ${mesh.name}`);
    const toHead = new Matrix4().multiplyMatrices(inverseHead, mesh.matrixWorld);
    for (let i = 0; i < pos.count; i += Math.max(1, Math.ceil(pos.count / 24))) {
      positions.push(point.fromBufferAttribute(pos, i).applyMatrix4(toHead).toArray());
    }
  });
  if (!positions.length) throw new Error(`No visible mesh in ${root.name}`);
  return positions;
}

export function captureHairStack({ fixture, gl, scene, camera }) {
  const previousViews = new Map();
  const restProbes = new Map();
  const contacts = new WeakMap();
  const measureTail = measureMountedTail(fixture);
  const context = gl.getContext();
  const { vrm, head, fit } = fixture;
  const rendererInfo = context.getExtension("WEBGL_debug_renderer_info");
  const renderer = context.getParameter(rendererInfo?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER);
  const read = () => {
    gl.render(scene, camera);
    const rgba = new Uint8Array(context.drawingBufferWidth * context.drawingBufferHeight * 4);
    context.readPixels(0, 0, context.drawingBufferWidth, context.drawingBufferHeight, context.RGBA, context.UNSIGNED_BYTE, rgba);
    return rgba;
  };
  const without = (object, operation) => {
    const visible = object.visible;
    try { object.visible = false; return operation(); }
    finally { object.visible = visible; }
  };
  return ({ variant, view, turned }, state) => {
    scene.updateMatrixWorld(true);
    const forge = [];
    vrm.scene.traverse(node => { if (node.userData.toonSpectrumAvatarForge) forge.push(node); });
    if (forge.length !== 1) throw new Error(`Expected one current hair group, found ${forge.length}`);
    const hair = forge[0];
    const mainHair = hair.getObjectByName("ToonStudioAvatarForgeHair_AuthoredMerged");
    const cap = scene.getObjectByName("review-cap");
    const sunglasses = scene.getObjectByName("review-sunglasses");
    if (!mainHair || !cap || !sunglasses) throw new Error("Incomplete hair/hat/glasses composition");
    if (!contacts.has(mainHair.geometry)) {
      const fittedHead = hair.userData.toonSpectrumAvatarForgeHeadFit;
      contacts.set(mainHair.geometry, measurePonytailContact(mainHair.geometry, state, fittedHead));
    }
    const full = read();
    const hairOff = without(hair, read);
    const capOff = without(cap, read);
    const glassesOff = without(sunglasses, read);
    const capEvidence = accessoryEvidence(full, capOff, hairOff, without(hair, () => without(cap, read)));
    const glassesEvidence = accessoryEvidence(full, glassesOff, hairOff, without(hair, () => without(sunglasses, read)));
    gl.render(scene, camera);
    const sourceView = `${view}-${turned}-${variant.startsWith("ponytail-") ? "closeup" : "head"}`;
    const prior = previousViews.get(sourceView);
    previousViews.set(sourceView, { variant, pixels: full });
    const probes = Object.fromEntries(Object.entries({ hair: mainHair, cap, sunglasses }).map(
      ([id, object]) => [id, headLocalProbes(object, head)]
    ));
    const headRotation = head.getWorldQuaternion(new Quaternion());
    if (!turned) restProbes.set(variant, { probes, rotation: headRotation });
    const rest = restProbes.get(variant);
    if (!rest) throw new Error(`Missing neutral sample for ${variant}`);
    const driftMm = {};
    for (const [id, points] of Object.entries(probes)) {
      const neutral = rest.probes[id];
      if (points.length !== neutral.length) throw new Error(`Vertex sample changed: ${id}`);
      const currentWorld = new Vector3();
      const expectedWorld = new Vector3();
      driftMm[id] = points.reduce((max, point, i) => {
        currentWorld.fromArray(point).applyMatrix4(head.matrixWorld);
        expectedWorld.fromArray(neutral[i]).applyMatrix4(head.matrixWorld);
        return Math.max(max, 1000 * currentWorld.distanceTo(expectedWorld));
      }, 0);
    }
    return {
      png: gl.domElement.toDataURL("image/png"),
      stats: {
        hairPixels: difference(full, hairOff), cap: capEvidence, sunglasses: glassesEvidence,
        ponytailContact: contacts.get(mainHair.geometry), tail: measureTail(mainHair, contacts.get(mainHair.geometry), turned), renderer,
        comparedStyle: prior?.variant ?? null, changedPixels: prior ? difference(full, prior.pixels) : null,
        driftMm, headTurnDegrees: MathUtils.radToDeg(headRotation.angleTo(rest.rotation)),
        sampleCounts: Object.fromEntries(Object.entries(probes).map(([id, points]) => [id, points.length])),
        headFit: { source: fit.source, sampleCount: fixture.sampleCount, frontSign: fit.frontSign,
          radius: [fit.radiusX, fit.radiusY, fit.radiusZ] },
        nativeHairCandidates: fixture.detectedHair, nativeMeshesHidden: fixture.nativeMeshes.filter(mesh => !mesh.visible).length,
        camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fov: camera.fov },
        hairGeometry: mainHair.uuid, hairVertices: mainHair.geometry.attributes.position.count,
      },
    };
  };
}
