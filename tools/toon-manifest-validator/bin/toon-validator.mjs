#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  EXIT_CODES,
  ERROR_CODES,
  generateExportManifest,
  verifyExportManifest,
  formatHumanReport,
  formatJsonReport,
  canonicalJsonStringify,
} from '../src/index.mjs';

function printUsage() {
  return `Usage:
  toon-validator --project <path/to/project.json> --fixture-dir <path/to/fixture> [options]

Options:
  --project <file>         Path to ToonStudio project JSON file (required unless --verify-manifest)
  --fixture-dir <dir>      Explicit fixture root directory containing project assets (required)
  --format <mode>          Output format: "human" | "json" | "both" (default: "human")
  --out-manifest <file>    Write generated deterministic export manifest JSON to file
  --out-report-json <file> Write structured JSON diagnostic report to file
  --out-report-txt <file>  Write human-readable report to file
  --verify-manifest <file> Verify an existing export manifest JSON against --fixture-dir
  --allow-unreferenced     Treat unreferenced assets as warnings instead of errors
  --help                   Show this help message

Exit Codes:
  0  Validation and manifest generation/verification succeeded
  1  Project JSON validation or manifest verification failed
  2  CLI usage error, missing arguments, or unreadable input file/JSON
`;
}

export function runCli(argv = process.argv.slice(2)) {
  let projectPath = null;
  let fixtureDir = null;
  let format = 'human';
  let outManifest = null;
  let outReportJson = null;
  let outReportTxt = null;
  let verifyManifestPath = null;
  let allowUnreferenced = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      return { exitCode: EXIT_CODES.SUCCESS, stdout: printUsage(), stderr: '' };
    } else if (arg === '--project') {
      projectPath = argv[++i];
    } else if (arg === '--fixture-dir') {
      fixtureDir = argv[++i];
    } else if (arg === '--format') {
      format = argv[++i];
    } else if (arg === '--out-manifest') {
      outManifest = argv[++i];
    } else if (arg === '--out-report-json') {
      outReportJson = argv[++i];
    } else if (arg === '--out-report-txt') {
      outReportTxt = argv[++i];
    } else if (arg === '--verify-manifest') {
      verifyManifestPath = argv[++i];
    } else if (arg === '--allow-unreferenced') {
      allowUnreferenced = true;
    } else {
      return {
        exitCode: EXIT_CODES.USAGE_OR_IO_ERROR,
        stdout: '',
        stderr: `Unknown argument: "${arg}"\n${printUsage()}`,
      };
    }
  }

  if (!fixtureDir) {
    return {
      exitCode: EXIT_CODES.USAGE_OR_IO_ERROR,
      stdout: '',
      stderr: `Error: --fixture-dir is required.\n${printUsage()}`,
    };
  }

  if (!['human', 'json', 'both'].includes(format)) {
    return {
      exitCode: EXIT_CODES.USAGE_OR_IO_ERROR,
      stdout: '',
      stderr: `Error: Invalid --format "${format}". Expected "human", "json", or "both".`,
    };
  }

  let fixtureStat;
  try {
    fixtureStat = fs.statSync(fixtureDir);
  } catch {
    return {
      exitCode: EXIT_CODES.USAGE_OR_IO_ERROR,
      stdout: '',
      stderr: `Error: Fixture directory "${fixtureDir}" does not exist or is unreadable.`,
    };
  }

  if (!fixtureStat.isDirectory()) {
    return {
      exitCode: EXIT_CODES.USAGE_OR_IO_ERROR,
      stdout: '',
      stderr: `Error: --fixture-dir "${fixtureDir}" is not a directory.`,
    };
  }

  if (verifyManifestPath) {
    let manifestRaw;
    try {
      manifestRaw = JSON.parse(fs.readFileSync(verifyManifestPath, 'utf8'));
    } catch (err) {
      return {
        exitCode: EXIT_CODES.USAGE_OR_IO_ERROR,
        stdout: '',
        stderr: `Error reading or parsing manifest file "${verifyManifestPath}": ${err.message}`,
      };
    }
    const verifyRes = verifyExportManifest(manifestRaw, fixtureDir);
    const exitCode = verifyRes.verified
      ? EXIT_CODES.SUCCESS
      : EXIT_CODES.VALIDATION_FAILED;
    const outPayload = canonicalJsonStringify(
      {
        status: verifyRes.verified ? 'verified' : 'failed',
        exitCode,
        errors: verifyRes.errors,
      },
      2
    );
    return {
      exitCode,
      stdout: outPayload + '\n',
      stderr: verifyRes.verified ? '' : 'Manifest verification failed.\n',
    };
  }

  if (!projectPath) {
    return {
      exitCode: EXIT_CODES.USAGE_OR_IO_ERROR,
      stdout: '',
      stderr: `Error: --project is required.\n${printUsage()}`,
    };
  }

  let rawText;
  try {
    rawText = fs.readFileSync(projectPath, 'utf8');
  } catch (err) {
    return {
      exitCode: EXIT_CODES.USAGE_OR_IO_ERROR,
      stdout: '',
      stderr: `Error: Cannot read project file "${projectPath}": ${err.message}`,
    };
  }

  let parsedProject;
  try {
    parsedProject = JSON.parse(rawText);
  } catch (err) {
    const parseFailResult = {
      ok: false,
      validation: {
        valid: false,
        errors: [
          {
            code: ERROR_CODES.INVALID_JSON,
            entityType: 'root',
            entityId: null,
            path: '$',
            message: `Invalid JSON syntax: ${err.message}`,
          },
        ],
        warnings: [],
        normalizedData: null,
      },
      manifest: null,
    };
    const exitCode = EXIT_CODES.USAGE_OR_IO_ERROR;
    const humanReport = formatHumanReport({ projectPath, fixtureDir, result: parseFailResult });
    const jsonReport = formatJsonReport({
      projectPath,
      fixtureDir,
      exitCode,
      result: parseFailResult,
    });
    const stdout =
      format === 'json'
        ? jsonReport
        : format === 'both'
          ? `${humanReport}\n\n${jsonReport}`
          : humanReport;
    return { exitCode, stdout: stdout + '\n', stderr: '' };
  }

  const result = generateExportManifest(parsedProject, {
    fixtureDir,
    requireAllAssetsReferenced: !allowUnreferenced,
    verifyFiles: true,
  });

  const exitCode = result.ok ? EXIT_CODES.SUCCESS : EXIT_CODES.VALIDATION_FAILED;
  const humanReport = formatHumanReport({ projectPath, fixtureDir, result });
  const jsonReport = formatJsonReport({ projectPath, fixtureDir, exitCode, result });

  if (outManifest && result.ok && result.manifest) {
    fs.mkdirSync(path.dirname(path.resolve(outManifest)), { recursive: true });
    fs.writeFileSync(outManifest, canonicalJsonStringify(result.manifest, 2) + '\n', 'utf8');
  }
  if (outReportJson) {
    fs.mkdirSync(path.dirname(path.resolve(outReportJson)), { recursive: true });
    fs.writeFileSync(outReportJson, jsonReport + '\n', 'utf8');
  }
  if (outReportTxt) {
    fs.mkdirSync(path.dirname(path.resolve(outReportTxt)), { recursive: true });
    fs.writeFileSync(outReportTxt, humanReport + '\n', 'utf8');
  }

  const stdout =
    format === 'json'
      ? jsonReport
      : format === 'both'
        ? `${humanReport}\n\n${jsonReport}`
        : humanReport;

  return {
    exitCode,
    stdout: stdout + '\n',
    stderr: '',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, stdout, stderr } = runCli(process.argv.slice(2));
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exit(exitCode);
}
