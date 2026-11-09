import { canonicalJsonStringify } from './manifest.mjs';

/**
 * Formats a human-readable report (Markdown/Text) from validation & manifest results.
 */
export function formatHumanReport({ projectPath, fixtureDir, result }) {
  const { ok, validation, manifest } = result;
  const lines = [];

  lines.push('================================================================');
  lines.push(' ToonStudio Project Validator & Safe Export Manifest Report');
  lines.push('================================================================');
  lines.push(`Status       : ${ok ? 'PASS (VALID)' : 'FAIL (INVALID)'}`);
  if (projectPath) lines.push(`Project File : ${projectPath}`);
  if (fixtureDir) lines.push(`Fixture Root : ${fixtureDir}`);

  const norm = validation?.normalizedData;
  if (norm?.project) {
    lines.push(`Project ID   : ${norm.project.id ?? '(invalid)'}`);
    lines.push(`Project Title: ${norm.project.title || '(empty)'}`);
  }

  lines.push('----------------------------------------------------------------');
  lines.push(
    `Counts       : Episodes=${norm?.episodes?.length ?? 0}, Scenes=${norm?.scenes?.length ?? 0}, Panels=${norm?.panels?.length ?? 0}, Assets=${norm?.assets?.length ?? 0}`
  );
  lines.push(
    `Diagnostics  : Errors=${validation?.errors?.length ?? 0}, Warnings=${validation?.warnings?.length ?? 0}`
  );

  if (validation?.errors?.length > 0) {
    lines.push('----------------------------------------------------------------');
    lines.push('Validation Errors:');
    validation.errors.forEach((err, i) => {
      lines.push(
        `  [${i + 1}] [${err.code}] (${err.path ?? err.entityType ?? 'root'}) ${err.message}`
      );
    });
  }

  if (validation?.warnings?.length > 0) {
    lines.push('----------------------------------------------------------------');
    lines.push('Validation Warnings:');
    validation.warnings.forEach((warn, i) => {
      lines.push(
        `  [${i + 1}] [${warn.code}] (${warn.path ?? warn.entityType ?? 'root'}) ${warn.message}`
      );
    });
  }

  if (ok && manifest) {
    lines.push('----------------------------------------------------------------');
    lines.push('Export Manifest Integrity:');
    lines.push(`  Algorithm           : ${manifest.integrity.algorithm}`);
    lines.push(`  Total Asset Bytes   : ${manifest.summary.totalBytes}`);
    lines.push(`  Asset Tree SHA-256  : ${manifest.integrity.assetTreeHash}`);
    lines.push(`  Manifest SHA-256    : ${manifest.integrity.manifestContentHash}`);
    lines.push(`  Studio Checksum     : ${manifest.integrity.checksum}`);
    lines.push('  Ordered Assets      :');
    for (const asset of manifest.assets) {
      lines.push(
        `    - [${asset.id}] ${asset.normalizedPath} (${asset.sizeBytes}B, ${asset.checksum.slice(0, 23)}...)`
      );
    }
  }

  lines.push('================================================================');
  return lines.join('\n');
}

/**
 * Formats a structured JSON report for machine consumption.
 */
export function formatJsonReport({ projectPath, fixtureDir, exitCode, result }) {
  return canonicalJsonStringify(
    {
      reportVersion: '1.0.0',
      status: result.ok ? 'valid' : 'invalid',
      exitCode,
      input: {
        projectPath: projectPath ?? null,
        fixtureDir: fixtureDir ?? null,
      },
      errorCount: result.validation.errors.length,
      warningCount: result.validation.warnings.length,
      errors: result.validation.errors,
      warnings: result.validation.warnings,
      manifest: result.manifest ?? null,
    },
    2
  );
}
