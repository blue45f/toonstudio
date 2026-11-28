import { describe, expect, it } from 'vitest';

import {
  CEL_MATERIAL_PRESETS,
  CEL_MATERIAL_PRESET_IDS,
  CEL_SHADING_UNIFORM_ALIGNMENT,
  CEL_SHADING_UNIFORM_BYTE_SIZE,
  DEFAULT_CEL_RAMP_CONFIG,
  absHueDeltaDeg,
  angleBetweenVec3Deg,
  auditCutSpecularAndCelConsistency,
  buildCelShadingBandWgsl,
  computeCelLightingFingerprint,
  computePerceptualShadowColor,
  computeSchlickFresnel,
  createSampleCelLightingScenario,
  deriveOrthonormalTangent,
  directionFromSphericalDeg,
  dotVec3,
  escapeSvgXml,
  evaluateStylizedCelShading,
  formatOklchCss,
  harmonizeCutSpecularAndCelLighting,
  normalizeVec3,
  packCelShadingUniforms,
  renderCelShadingAuditSvg,
  runCelShadingAndSpecularConsistency,
  sha256CelHex,
  shortestHueDeltaDeg,
  summarizeCelShadingAuditKo,
  validateCelShadingBandWgsl,
  wrapHueDeg,
  type CelLightingScenario,
  type CelRampConfig,
  type StylizedMultiLightRig,
} from './index';

function createFrontLitRig(): StylizedMultiLightRig {
  return {
    id: 'rig-front-test',
    label: '정면 검증 리그',
    key: { id: 'key-front', role: 'key', direction: { x: 0, y: 0, z: 1 }, intensity: 1.0, color: { l: 0.94, c: 0.04, h: 72 } },
    fill: { id: 'fill-cool', role: 'fill', direction: { x: -0.7, y: 0.2, z: 0.68 }, intensity: 0.4, color: { l: 0.72, c: 0.07, h: 242 } },
    rim: { id: 'rim-back', role: 'rim', direction: { x: 0.2, y: 0.3, z: -0.93 }, intensity: 0.9, color: { l: 0.92, c: 0.09, h: 55 } },
    bounce: { id: 'bounce-ground', role: 'bounce', direction: { x: 0, y: -1, z: 0 }, intensity: 0.25, color: { l: 0.66, c: 0.04, h: 80 } },
    viewDirection: { x: 0, y: 0, z: 1 },
  };
}

function createSampleSkinWgsl() {
  const scenario = createSampleCelLightingScenario();
  return buildCelShadingBandWgsl(scenario.rig, CEL_MATERIAL_PRESETS['skin-matte'], scenario.ramp);
}

describe('Wave 163: Cel Shading 2/3-Band & Specular Consistency Kernel', () => {
  describe('1. Vector & OKLCH math primitives', () => {
    it('normalizes arbitrary vectors and safely falls back on zero or non-finite vectors', () => {
      const n = normalizeVec3({ x: 3, y: 4, z: 0 });
      expect(n.x).toBeCloseTo(0.6, 6);
      expect(n.y).toBeCloseTo(0.8, 6);
      expect(n.z).toBeCloseTo(0, 6);
      expect(normalizeVec3({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
      expect(normalizeVec3({ x: Number.NaN, y: 1, z: 0 })).toEqual({ x: 0, y: 0, z: 1 });
    });

    it('computes exact spherical directions and inter-vector angles', () => {
      expect(directionFromSphericalDeg(0, 89.9).y).toBeGreaterThan(0.999);
      const a = directionFromSphericalDeg(0, 0);
      const b = directionFromSphericalDeg(45, 0);
      expect(angleBetweenVec3Deg(a, b)).toBeCloseTo(45, 4);
      expect(angleBetweenVec3Deg(a, a)).toBeCloseTo(0, 5);
    });

    it('wraps hues and computes shortest signed/absolute hue deltas across 0/360 boundary', () => {
      expect(wrapHueDeg(-30)).toBe(330);
      expect(wrapHueDeg(390)).toBe(30);
      expect(shortestHueDeltaDeg(350, 10)).toBeCloseTo(20, 6);
      expect(shortestHueDeltaDeg(10, 350)).toBeCloseTo(-20, 6);
      expect(absHueDeltaDeg(355, 5)).toBeCloseTo(10, 6);
    });

    it('derives an orthonormal tangent even when hint aligns with normal', () => {
      const n = normalizeVec3({ x: 0, y: 1, z: 0 });
      const t = deriveOrthonormalTangent(n, { x: 0, y: 1, z: 0 });
      expect(Math.abs(dotVec3(n, t))).toBeLessThan(1e-6);
      expect(Math.hypot(t.x, t.y, t.z)).toBeCloseTo(1, 6);
    });
  });

  describe('2. 2-Band & 3-Band cel ramp continuity and perceptual OKLCH shadow tinting', () => {
    it('maintains monotonic bandLuminance across N·L from -1 to +1 in 2-band mode', () => {
      const rig = createFrontLitRig();
      const material = CEL_MATERIAL_PRESETS['skin-matte'];
      const ramp2: CelRampConfig = { ...DEFAULT_CEL_RAMP_CONFIG, bandCount: 2 };
      let prevLuma = -1;
      for (let i = 0; i <= 20; i += 1) {
        const ndotl = -1 + (2 * i) / 20;
        const normal = { x: Math.sqrt(Math.max(0, 1 - ndotl * ndotl)), y: 0, z: ndotl };
        const result = evaluateStylizedCelShading(rig, material, ramp2, { normal });
        expect(result.bandCount).toBe(2);
        expect(result.midWeight).toBe(0);
        expect(result.litWeight + result.shadowWeight).toBeCloseTo(1, 6);
        expect(result.bandLuminance).toBeGreaterThanOrEqual(prevLuma - 1e-6);
        prevLuma = result.bandLuminance;
      }
    });

    it('maintains monotonic bandLuminance across N·L from -1 to +1 in 3-band mode with a distinct mid plateau', () => {
      const rig = createFrontLitRig();
      const material = CEL_MATERIAL_PRESETS['cloth-fabric'];
      const ramp3: CelRampConfig = { ...DEFAULT_CEL_RAMP_CONFIG, bandCount: 3 };
      let prevLuma = -1;
      let observedMidPeak = 0;
      for (let i = 0; i <= 24; i += 1) {
        const ndotl = -1 + (2 * i) / 24;
        const normal = { x: Math.sqrt(Math.max(0, 1 - ndotl * ndotl)), y: 0, z: ndotl };
        const result = evaluateStylizedCelShading(rig, material, ramp3, { normal });
        expect(result.litWeight + result.midWeight + result.shadowWeight).toBeCloseTo(1, 6);
        expect(result.bandLuminance).toBeGreaterThanOrEqual(prevLuma - 1e-6);
        observedMidPeak = Math.max(observedMidPeak, result.midWeight);
        prevLuma = result.bandLuminance;
      }
      expect(observedMidPeak).toBeGreaterThan(0.85);
    });

    it('smoothly anti-aliases across the terminator according to bandFeatherWidth', () => {
      const rig = createFrontLitRig();
      const material = CEL_MATERIAL_PRESETS['skin-matte'];
      const wideRamp: CelRampConfig = { ...DEFAULT_CEL_RAMP_CONFIG, bandCount: 2, terminatorThreshold: 0.1, bandFeatherWidth: 0.12 };
      const narrowRamp: CelRampConfig = { ...wideRamp, bandFeatherWidth: 0.01 };
      const nearEdgeNormal = { x: Math.sqrt(1 - 0.14 * 0.14), y: 0, z: 0.14 };

      const wideEval = evaluateStylizedCelShading(rig, material, wideRamp, { normal: nearEdgeNormal });
      const narrowEval = evaluateStylizedCelShading(rig, material, narrowRamp, { normal: nearEdgeNormal });

      expect(wideEval.litWeight).toBeGreaterThan(0.5);
      expect(wideEval.litWeight).toBeLessThan(0.95);
      expect(narrowEval.litWeight).toBeCloseTo(1, 4);
    });

    it('shifts OKLCH shadow hue cleanly away from base hue without collapsing chroma into muddy gray', () => {
      const base = CEL_MATERIAL_PRESETS['skin-matte'].baseColor;
      const shadow = computePerceptualShadowColor(base, DEFAULT_CEL_RAMP_CONFIG, createFrontLitRig().fill);
      expect(shadow.l).toBeLessThan(base.l);
      expect(shadow.c / base.c).toBeGreaterThanOrEqual(0.9);
      expect(absHueDeltaDeg(base.h, shadow.h)).toBeGreaterThanOrEqual(15);
    });

    it('darkens cel response predictably when cast shadowMask or ambientOcclusion drops', () => {
      const rig = createFrontLitRig();
      const material = CEL_MATERIAL_PRESETS['skin-matte'];
      const litSample = evaluateStylizedCelShading(rig, material, DEFAULT_CEL_RAMP_CONFIG, {
        normal: { x: 0, y: 0, z: 1 },
        shadowMask: 1,
        ambientOcclusion: 1,
      });
      const occludedSample = evaluateStylizedCelShading(rig, material, DEFAULT_CEL_RAMP_CONFIG, {
        normal: { x: 0, y: 0, z: 1 },
        shadowMask: 0,
        ambientOcclusion: 0.4,
      });
      expect(occludedSample.bandLuminance).toBeLessThan(litSample.bandLuminance);
      expect(occludedSample.specularStrength).toBe(0);
      expect(Number.isFinite(occludedSample.finalLuminance)).toBe(true);
    });
  });

  describe('3. Material physics discipline (6 presets, Kajiya-Kay hair, grazing Fresnel rim)', () => {
    it('exposes all 6 canonical material presets with strict binary dielectric/metal discipline', () => {
      expect(CEL_MATERIAL_PRESET_IDS).toHaveLength(6);
      const dielectrics = ['skin-matte', 'cloth-fabric', 'hair-anisotropic', 'dielectric-glass', 'water-surface'] as const;
      for (const id of dielectrics) {
        const spec = CEL_MATERIAL_PRESETS[id];
        expect(spec.isMetal).toBe(false);
        expect(spec.metallic).toBe(0);
        expect(spec.fresnelF0).toBeGreaterThanOrEqual(0.02);
        expect(spec.fresnelF0).toBeLessThanOrEqual(0.05);
        expect(spec.specularTintByAlbedo).toBe(0);
      }
      const metal = CEL_MATERIAL_PRESETS['brushed-metal'];
      expect(metal.isMetal).toBe(true);
      expect(metal.metallic).toBe(1);
      expect(metal.specularTintByAlbedo).toBe(1);
    });

    it('tints specular with base albedo on brushed-metal while keeping dielectric glass light-tinted', () => {
      const rig = createFrontLitRig();
      const vividGlassBase = { l: 0.72, c: 0.16, h: 220 };
      const vividGoldBase = { l: 0.76, c: 0.15, h: 84 };

      const glassEval = evaluateStylizedCelShading(rig, CEL_MATERIAL_PRESETS['dielectric-glass'], DEFAULT_CEL_RAMP_CONFIG, {
        normal: { x: 0, y: 0, z: 1 },
        baseColor: vividGlassBase,
      });
      const metalEval = evaluateStylizedCelShading(rig, CEL_MATERIAL_PRESETS['brushed-metal'], DEFAULT_CEL_RAMP_CONFIG, {
        normal: { x: 0, y: 0, z: 1 },
        baseColor: vividGoldBase,
      });

      expect(absHueDeltaDeg(glassEval.specularColor.h, rig.key.color.h)).toBeLessThan(5);
      expect(absHueDeltaDeg(metalEval.specularColor.h, vividGoldBase.h)).toBeLessThan(3);
      expect(metalEval.specularColor.c).toBeGreaterThan(glassEval.specularColor.c);
    });

    it('produces Kajiya-Kay shifted-tangent hair specular ring peaking off-axis from standard isotropic Blinn-Phong', () => {
      const rig = createFrontLitRig();
      const hair = CEL_MATERIAL_PRESETS['hair-anisotropic'];
      const tangentHint = { x: 0, y: 1, z: 0 };

      const onAxis = evaluateStylizedCelShading(rig, hair, DEFAULT_CEL_RAMP_CONFIG, {
        normal: { x: 0, y: 0, z: 1 },
        tangent: tangentHint,
      });
      const shiftRad = Math.atan(hair.anisotropicShift);
      const offAxis = evaluateStylizedCelShading(rig, hair, DEFAULT_CEL_RAMP_CONFIG, {
        normal: { x: 0, y: Math.sin(shiftRad), z: Math.cos(shiftRad) },
        tangent: tangentHint,
      });

      expect(onAxis.isotropicSpecular).toBeGreaterThan(offAxis.isotropicSpecular);
      expect(offAxis.anisotropicSpecular).toBeGreaterThan(onAxis.anisotropicSpecular);
      expect(offAxis.specularStrength).toBeGreaterThan(onAxis.specularStrength);
    });

    it('computes Schlick Fresnel increasing sharply toward grazing angles', () => {
      const fNormal = computeSchlickFresnel(0.04, 1.0);
      const fMid = computeSchlickFresnel(0.04, 0.5);
      const fGrazing = computeSchlickFresnel(0.04, 0.0);
      expect(fNormal).toBeCloseTo(0.04, 6);
      expect(fMid).toBeGreaterThan(fNormal);
      expect(fGrazing).toBeCloseTo(1.0, 6);
    });

    it('increases grazing Fresnel rim light as N·V approaches 0 on rim-facing surfaces', () => {
      const rig = createFrontLitRig();
      const material = CEL_MATERIAL_PRESETS['water-surface'];
      const frontEval = evaluateStylizedCelShading(rig, material, DEFAULT_CEL_RAMP_CONFIG, { normal: { x: 0, y: 0, z: 1 } });
      const grazingEval = evaluateStylizedCelShading(rig, material, DEFAULT_CEL_RAMP_CONFIG, {
        normal: normalizeVec3({ x: 0.25, y: 0.94, z: 0.08 }),
      });
      expect(frontEval.rimStrength).toBeCloseTo(0, 6);
      expect(grazingEval.rimStrength).toBeGreaterThan(0.25);
    });

    it('disables rim contribution cleanly when rim light enabled is false', () => {
      const baseRig = createFrontLitRig();
      const noRimRig: StylizedMultiLightRig = { ...baseRig, rim: { ...baseRig.rim, enabled: false } };
      const evalNoRim = evaluateStylizedCelShading(noRimRig, CEL_MATERIAL_PRESETS['dielectric-glass'], DEFAULT_CEL_RAMP_CONFIG, {
        normal: normalizeVec3({ x: 0.2, y: 0.95, z: 0.08 }),
      });
      expect(evalNoRim.rimStrength).toBe(0);
    });
  });

  describe('4. Multi-object cut consistency audit', () => {
    it('detects >= 4 distinct defects on the canonical sample scenario', () => {
      const audit = auditCutSpecularAndCelConsistency(createSampleCelLightingScenario());
      expect(audit.passed).toBe(false);
      expect(audit.status).toBe('FAIL');
      expect(audit.violations.length).toBeGreaterThanOrEqual(5);
      expect(audit.defectCounts['specular-direction-mismatch']).toBeGreaterThanOrEqual(1);
      expect(audit.defectCounts['muddy-desaturated-shadow']).toBeGreaterThanOrEqual(1);
      expect(audit.defectCounts['dielectric-metallic-violation']).toBeGreaterThanOrEqual(1);
      expect(audit.defectCounts['rim-key-occlusion-clash']).toBeGreaterThanOrEqual(1);
      expect(audit.defectCounts['hard-banding-aliasing']).toBeGreaterThanOrEqual(1);
    });

    it('flags specular highlights deviating > 22 degrees and passes those within <= 22 degrees', () => {
      const base = createSampleCelLightingScenario();
      const cleanObj = base.annotations[5];
      const offBy45: CelLightingScenario = {
        ...base,
        annotations: [{ ...cleanObj, paintedHighlightDirection: directionFromSphericalDeg(88, 42) }],
      };
      const within10: CelLightingScenario = {
        ...base,
        annotations: [{ ...cleanObj, paintedHighlightDirection: directionFromSphericalDeg(42, 42) }],
      };
      expect(auditCutSpecularAndCelConsistency(offBy45).defectCounts['specular-direction-mismatch']).toBe(1);
      expect(auditCutSpecularAndCelConsistency(within10).defectCounts['specular-direction-mismatch']).toBe(0);
      expect(angleBetweenVec3Deg(base.rig.key.direction, within10.annotations[0].paintedHighlightDirection)).toBeLessThan(22);
    });

    it('flags muddy desaturated shadows without hue shift', () => {
      const base = createSampleCelLightingScenario();
      const audit = auditCutSpecularAndCelConsistency({ ...base, annotations: [base.annotations[1]] });
      expect(audit.defectCounts['muddy-desaturated-shadow']).toBe(1);
    });

    it('flags non-binary metallic (0.45), metal metallic=0.0, and dielectric albedo-tinted specular', () => {
      const base = createSampleCelLightingScenario();
      const keyDir = base.rig.key.direction;
      const makeShadow = (id: 'dielectric-glass' | 'brushed-metal' | 'skin-matte') =>
        computePerceptualShadowColor(CEL_MATERIAL_PRESETS[id].baseColor, base.ramp, base.rig.fill);

      const multiViolation: CelLightingScenario = {
        ...base,
        annotations: [
          {
            id: 'v-nonbinary',
            objectName: '비이진 유리',
            materialId: 'dielectric-glass',
            surfaceNormal: { x: 0, y: 0, z: 1 },
            baseColor: CEL_MATERIAL_PRESETS['dielectric-glass'].baseColor,
            paintedHighlightDirection: keyDir,
            paintedShadowColor: makeShadow('dielectric-glass'),
            metallicOverride: 0.45,
          },
          {
            id: 'v-metal-zero',
            objectName: '금속성 누락 검신',
            materialId: 'brushed-metal',
            surfaceNormal: { x: 0, y: 0, z: 1 },
            baseColor: CEL_MATERIAL_PRESETS['brushed-metal'].baseColor,
            paintedHighlightDirection: keyDir,
            paintedShadowColor: makeShadow('brushed-metal'),
            metallicOverride: 0.0,
          },
          {
            id: 'v-dielectric-tint',
            objectName: '착색 스페큘러 피부',
            materialId: 'skin-matte',
            surfaceNormal: { x: 0, y: 0, z: 1 },
            baseColor: CEL_MATERIAL_PRESETS['skin-matte'].baseColor,
            paintedHighlightDirection: keyDir,
            paintedShadowColor: makeShadow('skin-matte'),
            specularTintByAlbedoOverride: 0.7,
          },
        ],
      };
      expect(auditCutSpecularAndCelConsistency(multiViolation).defectCounts['dielectric-metallic-violation']).toBe(3);
    });

    it('flags rim-key occlusion clash and zero-feather hard-banding aliasing', () => {
      const base = createSampleCelLightingScenario();
      const audit = auditCutSpecularAndCelConsistency({ ...base, annotations: [base.annotations[3], base.annotations[4]] });
      expect(audit.defectCounts['hard-banding-aliasing']).toBe(1);
      expect(audit.defectCounts['rim-key-occlusion-clash']).toBe(1);
    });

    it('reports WARN status when only warning-level violations exist', () => {
      const base = createSampleCelLightingScenario();
      const audit = auditCutSpecularAndCelConsistency({ ...base, annotations: [base.annotations[4]] });
      expect(audit.status).toBe('WARN');
      expect(audit.passed).toBe(false);
    });
  });

  describe('5. Automatic lighting harmonization', () => {
    it('resolves all defects on the sample scenario down to 0 violations while preserving key light direction', () => {
      const scenario = createSampleCelLightingScenario();
      const origKey = normalizeVec3(scenario.rig.key.direction);
      const result = harmonizeCutSpecularAndCelLighting(scenario);

      expect(result.beforeAudit.violations.length).toBeGreaterThanOrEqual(5);
      expect(result.afterAudit.violations).toHaveLength(0);
      expect(result.afterAudit.passed).toBe(true);
      expect(result.afterAudit.status).toBe('PASS');
      expect(result.afterAudit.consistencyScore).toBe(100);
      expect(result.changes.length).toBeGreaterThanOrEqual(5);
      expect(angleBetweenVec3Deg(origKey, result.harmonizedRig.key.direction)).toBeCloseTo(0, 5);
    });

    it('repairs global clashing rim light and zero global bandFeatherWidth', () => {
      const scenario = createSampleCelLightingScenario();
      const brokenGlobal: CelLightingScenario = {
        ...scenario,
        rig: { ...scenario.rig, rim: { ...scenario.rig.rim, direction: scenario.rig.key.direction } },
        ramp: { ...scenario.ramp, bandFeatherWidth: 0 },
      };
      const result = harmonizeCutSpecularAndCelLighting(brokenGlobal);
      expect(result.afterAudit.passed).toBe(true);
      expect(result.afterAudit.violations).toHaveLength(0);
      expect(result.harmonizedRamp.bandFeatherWidth).toBeGreaterThanOrEqual(0.045);
      expect(dotVec3(result.harmonizedRig.rim.direction, result.harmonizedRig.key.direction)).toBeLessThan(0.2);
    });

    it('is idempotent when re-executed on an already harmonized scenario', () => {
      const scenario = createSampleCelLightingScenario();
      const pass1 = harmonizeCutSpecularAndCelLighting(scenario);
      const pass2 = harmonizeCutSpecularAndCelLighting({
        ...scenario,
        rig: pass1.harmonizedRig,
        ramp: pass1.harmonizedRamp,
        annotations: pass1.harmonizedAnnotations,
      });
      expect(pass2.beforeAudit.violations).toHaveLength(0);
      expect(pass2.afterAudit.violations).toHaveLength(0);
      expect(pass2.changes).toHaveLength(0);
    });
  });

  describe('6. WGSL 80-byte shader generation and static contract validation', () => {
    it('packs 20 finite floats (80 bytes, 16-byte aligned) matching rig, material, and ramp', () => {
      const scenario = createSampleCelLightingScenario();
      const uniforms = packCelShadingUniforms(scenario.rig, CEL_MATERIAL_PRESETS['brushed-metal'], scenario.ramp);
      expect(uniforms.length).toBe(20);
      expect(uniforms.byteLength).toBe(CEL_SHADING_UNIFORM_BYTE_SIZE);
      expect(uniforms.byteLength % CEL_SHADING_UNIFORM_ALIGNMENT).toBe(0);
      expect(uniforms[12]).toBe(3);
      expect(uniforms[16]).toBe(1);
    });

    it('generates valid WGSL fragment shader passing all static contract checks', () => {
      const validation = validateCelShadingBandWgsl(createSampleSkinWgsl());
      expect(validation.valid).toBe(true);
      expect(validation.uniformByteSize).toBe(80);
      expect(validation.is16ByteAligned).toBe(true);
      expect(validation.hasFwidth).toBe(true);
      expect(validation.hasBalancedBraces).toBe(true);
      expect(validation.duplicateBindings).toHaveLength(0);
      expect(validation.forbiddenGlslTokens).toHaveLength(0);
      expect(validation.nonFiniteUniformIndices).toHaveLength(0);
      expect(validation.errors).toHaveLength(0);
    });

    it('rejects WGSL with unbalanced braces', () => {
      const bundle = createSampleSkinWgsl();
      const validation = validateCelShadingBandWgsl({ ...bundle, wgslSource: `${bundle.wgslSource}\nfn broken() {` });
      expect(validation.valid).toBe(false);
      expect(validation.hasBalancedBraces).toBe(false);
    });

    it('rejects WGSL with duplicate @group/@binding declarations', () => {
      const bundle = createSampleSkinWgsl();
      const dupSource = bundle.wgslSource.replace('@group(0) @binding(1)', '@group(0) @binding(0)');
      const validation = validateCelShadingBandWgsl({ ...bundle, wgslSource: dupSource });
      expect(validation.valid).toBe(false);
      expect(validation.duplicateBindings).toContain('group(0)/binding(0)');
    });

    it('rejects misaligned uniform byte sizes (e.g. 76 bytes)', () => {
      const bundle = createSampleSkinWgsl();
      const validation = validateCelShadingBandWgsl({
        ...bundle,
        uniformByteSize: 76,
        uniformFloat32: new Float32Array(19),
      });
      expect(validation.valid).toBe(false);
      expect(validation.is16ByteAligned).toBe(false);
    });

    it('rejects WGSL missing fwidth anti-aliasing', () => {
      const bundle = createSampleSkinWgsl();
      const stripped = bundle.wgslSource.replace(/fwidth\([^)]+\)/g, '0.02');
      const validation = validateCelShadingBandWgsl({ ...bundle, wgslSource: stripped });
      expect(validation.valid).toBe(false);
      expect(validation.hasFwidth).toBe(false);
    });

    it('rejects forbidden GLSL tokens (vec3, texture2D, gl_FragCoord)', () => {
      const bundle = createSampleSkinWgsl();
      const polluted = `${bundle.wgslSource}\nfn bad() { let p = vec3(1.0); let t = texture2D(a, b); let c = gl_FragCoord; }`;
      const validation = validateCelShadingBandWgsl({ ...bundle, wgslSource: polluted });
      expect(validation.valid).toBe(false);
      expect(validation.forbiddenGlslTokens).toContain('vec3');
      expect(validation.forbiddenGlslTokens).toContain('texture2D');
      expect(validation.forbiddenGlslTokens).toContain('gl_FragCoord');
    });

    it('rejects NaN and Infinity uniform float entries', () => {
      const bundle = createSampleSkinWgsl();
      const badUniforms = new Float32Array(bundle.uniformFloat32);
      badUniforms[3] = Number.NaN;
      badUniforms[15] = Number.POSITIVE_INFINITY;
      const validation = validateCelShadingBandWgsl({ ...bundle, uniformFloat32: badUniforms });
      expect(validation.valid).toBe(false);
      expect(validation.nonFiniteUniformIndices).toEqual([3, 15]);
    });
  });

  describe('7. FIPS 180-4 SHA-256 standard test vectors & fingerprint determinism', () => {
    it('matches exact FIPS 180-4 SHA-256 hex digest for empty string ""', () => {
      expect(sha256CelHex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('matches exact FIPS 180-4 SHA-256 hex digest for "abc"', () => {
      expect(sha256CelHex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('deterministically hashes multi-byte Korean UTF-8 strings to 64 lowercase hex chars', () => {
      const h1 = sha256CelHex('웹툰 셀 셰이딩 2·3밴드 광원 일관성');
      expect(h1).toBe(sha256CelHex('웹툰 셀 셰이딩 2·3밴드 광원 일관성'));
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('mutates manifest fingerprint when key light azimuth changes and remains invariant to annotation order', () => {
      const scenario = createSampleCelLightingScenario();
      const bundle = createSampleSkinWgsl();
      const fpBase = computeCelLightingFingerprint(scenario.rig, scenario.ramp, scenario.annotations, bundle.wgslSource);
      const fpReordered = computeCelLightingFingerprint(
        scenario.rig,
        scenario.ramp,
        [...scenario.annotations].reverse(),
        bundle.wgslSource,
      );
      const rotatedRig: StylizedMultiLightRig = {
        ...scenario.rig,
        key: { ...scenario.rig.key, direction: directionFromSphericalDeg(50, 42) },
      };
      const fpRotated = computeCelLightingFingerprint(rotatedRig, scenario.ramp, scenario.annotations, bundle.wgslSource);
      expect(fpBase).toBe(fpReordered);
      expect(fpRotated).not.toBe(fpBase);
    });
  });

  describe('8. Pure OKLCH SVG visual audit & natural Korean QA summary', () => {
    it('renders pure OKLCH SVG with zero raw hex/rgb/hsl colors and zero NaN/Infinity', () => {
      const svg = runCelShadingAndSpecularConsistency(createSampleCelLightingScenario()).auditSvg;
      expect(svg).toContain('<svg');
      expect(svg).toContain('oklch(');
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg).not.toMatch(/\brgba?\s*\(/i);
      expect(svg).not.toMatch(/\bhsla?\s*\(/i);
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('Infinity');
    });

    it('supports both 2-band and 3-band swatch rendering cleanly in SVG', () => {
      const scenario2Band: CelLightingScenario = {
        ...createSampleCelLightingScenario(),
        ramp: { ...DEFAULT_CEL_RAMP_CONFIG, bandCount: 2 },
      };
      const result = runCelShadingAndSpecularConsistency(scenario2Band);
      expect(result.auditSvg).toContain('2-밴드 OKLCH 셀 셰이딩 램프');
      expect(result.auditSvg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    });

    it('escapes XML special characters in SVG titles and cut IDs', () => {
      const harm = harmonizeCutSpecularAndCelLighting(createSampleCelLightingScenario());
      const svg = renderCelShadingAuditSvg({
        titleKo: '테스트 <script> & "컷" \'1\'',
        rig: harm.harmonizedRig,
        ramp: harm.harmonizedRamp,
        beforeAudit: harm.beforeAudit,
        afterAudit: harm.afterAudit,
        manifestFingerprint: sha256CelHex('xml-test'),
      });
      expect(escapeSvgXml('<&"\'>')).toBe('&lt;&amp;&quot;&#39;&gt;');
      expect(svg).toContain('&lt;script&gt;');
      expect(svg).toContain('&amp;');
      expect(svg).not.toContain('<script>');
    });

    it('formats OKLCH CSS safely even for out-of-range or NaN inputs', () => {
      expect(formatOklchCss({ l: 1.4, c: -0.2, h: -45 })).toBe('oklch(1.000 0.000 315.0)');
      expect(formatOklchCss({ l: Number.NaN, c: Number.NaN, h: Number.NaN }, 0.5)).toBe(
        'oklch(0.000 0.000 0.0 / 0.50)',
      );
    });

    it('produces clear PASS, WARN, and FAIL Korean QA summaries without translationese', () => {
      const scenario = createSampleCelLightingScenario();
      const harm = harmonizeCutSpecularAndCelLighting(scenario);
      const validWgsl = validateCelShadingBandWgsl(
        buildCelShadingBandWgsl(harm.harmonizedRig, CEL_MATERIAL_PRESETS['skin-matte'], harm.harmonizedRamp),
      );
      const passSummary = summarizeCelShadingAuditKo(harm.beforeAudit, harm.afterAudit, harm.changes, validWgsl);
      const failSummary = summarizeCelShadingAuditKo(harm.beforeAudit, harm.beforeAudit, [], validWgsl);
      const warnAudit = auditCutSpecularAndCelConsistency({ ...scenario, annotations: [scenario.annotations[4]] });
      const warnSummary = summarizeCelShadingAuditKo(warnAudit, warnAudit, [], validWgsl);

      expect(passSummary).toContain('[PASS]');
      expect(failSummary).toContain('[FAIL]');
      expect(warnSummary).toContain('[WARN]');
      expect(passSummary).not.toContain('하는 것을 가능하게 합니다');
    });
  });

  describe('9. End-to-end orchestrator (runCelShadingAndSpecularConsistency)', () => {
    it('executes full pipeline cleanly from default scenario with beforeViolations > 0 -> afterViolations === 0', () => {
      const result = runCelShadingAndSpecularConsistency();
      expect(result.waveId).toBe('wave163');
      expect(result.engineId).toBe('wasm64-wave163-cel-shading-band-and-specular-consistency-kernel');
      expect(result.beforeAudit.violations.length).toBeGreaterThanOrEqual(5);
      expect(result.afterAudit.violations).toHaveLength(0);
      expect(result.afterAudit.passed).toBe(true);
      expect(result.wgslValidation.valid).toBe(true);
      expect(result.manifestFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(result.passed).toBe(true);
    });

    it('produces deterministic identical results across repeated executions', () => {
      const r1 = runCelShadingAndSpecularConsistency(createSampleCelLightingScenario());
      const r2 = runCelShadingAndSpecularConsistency(createSampleCelLightingScenario());
      expect(r1.manifestFingerprint).toBe(r2.manifestFingerprint);
      expect(r1.auditSvg).toBe(r2.auditSvg);
      expect(r1.summaryKo).toBe(r2.summaryKo);
      expect(Array.from(r1.wgslBundle.uniformFloat32)).toEqual(Array.from(r2.wgslBundle.uniformFloat32));
    });
  });
});
