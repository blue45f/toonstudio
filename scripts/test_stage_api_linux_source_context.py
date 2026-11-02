"""API 전용 Git 선택·export·manifest 경계 회귀. 표준 라이브러리만 사용한다."""
import contextlib
import hashlib
import importlib.util
import io
import json
import sys
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "api_source_context", HERE / "stage-api-linux-source-context.py"
)
ASM = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ASM)
HEAD = "1" * 40
TREE = "2" * 40


def row(name, body):
    oid = hashlib.sha1(("blob " + str(len(body)) + "\0").encode() + body).hexdigest()
    return {"path": name, "mode": "100644", "oid": oid, "bytes": len(body)}


def selection():
    names = list(ASM.CONTRACT_PATHS) + [
        "apps/web/public/assets/large.glb",
        "apps/web/public/vendor/runtime.js",
        "apps/web/publicity/logo.png",
        "apps/web/public-assets/model.glb",
        "apps/admin-web/public/admin.js",
        "public/vendor/kept.js",
        "apps/web/src/public-helper.ts",
        ".env.example",
    ]
    bodies = {name: ("test-only:" + name + "\n").encode() for name in names}
    rows = [row(name, bodies[name]) for name in sorted(names)]
    raw = b"".join(
        ("{mode} blob {oid} {bytes}\t{path}".format(**item)).encode() + b"\0"
        for item in rows
    )
    with mock.patch.object(ASM, "git", return_value=raw):
        selected, excluded = ASM.tree_entries(Path("/fixture-only"), HEAD)
    return bodies, selected, excluded


def manifest(selected):
    return [{**item, "sha256": "a" * 64} for item in selected]


class CaptureInput(io.BytesIO):
    def close(self):
        self.close_requested = True


class MemoryBatch:
    """실제 read_blob에 올바른 Git batch 응답을 메모리에서 제공한다."""
    def __init__(self, selected, bodies):
        self.stdin = CaptureInput()
        self.stdin.close_requested = False
        self.stdout = io.BytesIO(b"".join(
            (item["oid"] + " blob " + str(item["bytes"]) + "\n").encode()
            + bodies[item["path"]] + b"\n" for item in selected
        ))
        self.expected = [item["oid"] for item in selected]
        self.killed = False

    def wait(self, timeout=None):
        if not self.killed:
            assert self.stdin.close_requested
            assert self.stdin.getvalue().decode().splitlines() == self.expected
            assert self.stdout.read() == b""
        return 0

    def kill(self):
        self.killed = True


class ApiPrefixTests(unittest.TestCase):
    def test_exact_prefix_only_and_lookalikes_remain(self):
        bodies, selected, excluded = selection()
        kept = {item["path"] for item in selected}
        removed = {item["path"] for item in excluded if item["reason"] == ASM.API_PREFIX_REASON}
        self.assertEqual(removed, {
            "apps/web/public/assets/large.glb",
            "apps/web/public/vendor/runtime.js",
        })
        self.assertTrue({
            "apps/web/publicity/logo.png",
            "apps/web/public-assets/model.glb",
            "apps/admin-web/public/admin.js",
            "public/vendor/kept.js",
            "apps/web/src/public-helper.ts",
        }.issubset(kept))
        self.assertFalse(ASM.is_api_web_public("apps/web/public"))
        self.assertFalse(ASM.is_api_web_public("prefix/apps/web/public/a.png"))
        self.assertIn(".env.example", {item["path"] for item in excluded})

    def test_all_eighteen_contracts_survive_and_missing_one_is_rejected(self):
        bodies, selected, excluded = selection()
        summary = ASM.api_selection_summary(selected, excluded)
        self.assertEqual(len(ASM.CONTRACT_PATHS), 18)
        self.assertTrue(set(ASM.CONTRACT_PATHS).issubset({item["path"] for item in selected}))
        self.assertEqual(summary["excludedDirectoryPrefix"], "apps/web/public/")
        self.assertEqual(summary["excludedPrefixFiles"], 2)
        self.assertFalse(summary["globalProductSourceDeletionClaimed"])
        first = next(iter(ASM.CONTRACT_PATHS))
        with self.assertRaisesRegex(ASM.Refused, "REQUIRED_BUILD_CONTRACT_EXCLUDED"):
            ASM.api_selection_summary([item for item in selected if item["path"] != first], excluded)

    def test_unreviewed_exclusions_are_rejected(self):
        bodies, selected, excluded = selection()
        wrong = {**row("apps/web/publicity/wrong.png", b"fixture"), "reason": ASM.API_PREFIX_REASON}
        with self.assertRaisesRegex(ASM.Refused, "UNREVIEWED_API_CONTEXT_EXCLUSION"):
            ASM.api_selection_summary(selected, excluded + [wrong])
        other = {**row("public/elsewhere.bin", b"fixture"), "reason": "host-generated-or-personal-directory"}
        with self.assertRaisesRegex(ASM.Refused, "ADDITIONAL_PUBLIC_ASSET_EXCLUSION_REQUIRES_REVIEW"):
            ASM.api_selection_summary(selected, excluded + [other])

    def test_manifest_requires_exact_metadata_unique_paths_and_count(self):
        _, selected, _ = selection()
        good = manifest(selected)
        ASM.validate_export_manifest(good, selected)
        variants = [good[:-1], good + [dict(good[0])]]
        changed = [dict(item) for item in good]
        changed[0]["bytes"] += 1
        variants.append(changed)
        duplicate = [dict(item) for item in good]
        duplicate[1] = dict(duplicate[0])
        variants.append(duplicate)
        renamed = [dict(item) for item in good]
        renamed[0]["path"] = "apps/web/public/forbidden.glb"
        variants.append(renamed)
        for candidate in variants:
            with self.subTest(first=candidate[0]["path"]):
                with self.assertRaises(ASM.Refused):
                    ASM.validate_export_manifest(candidate, selected)

    def test_manifest_rejects_web_asset_even_if_expected_list_is_corrupt(self):
        forbidden = [row("apps/web/public/forbidden.glb", b"fixture")]
        with self.assertRaisesRegex(ASM.Refused, "API_MANIFEST_WEB_PUBLIC_ASSET_REJECTED"):
            ASM.validate_export_manifest(manifest(forbidden), forbidden)

    def test_plan_records_api_scope_and_full_git_authority_without_export(self):
        bodies, selected, excluded = selection()
        authority = {"sha": HEAD, "tree": TREE}
        with tempfile.TemporaryDirectory(prefix="api-prefix-plan-") as temp:
            private = Path(temp).resolve()
            dockerfile = private / "Dockerfile"
            dockerfile.write_bytes(b"FROM scratch\n")
            ignore = private / "Dockerfile.dockerignore"
            ignore.write_bytes(b"apps/web/public/\n")
            output = io.StringIO()
            argv = ["assembler", "--expected-sha", HEAD, "--out", str(private / "context"),
                    "--dockerfile", str(dockerfile),
                    "--expected-dockerfile-sha256", hashlib.sha256(dockerfile.read_bytes()).hexdigest(),
                    "--expected-ignore-sha256", hashlib.sha256(ignore.read_bytes()).hexdigest()]
            with mock.patch.object(ASM, "REPOSITORY_ROOT", private), \
                 mock.patch.object(ASM, "source_gate", return_value=authority), \
                 mock.patch.object(ASM, "tree_entries", return_value=(selected, excluded)), \
                 mock.patch.object(ASM, "public_blob", side_effect=lambda _repo, _head, name: bodies[name]) as contracts, \
                 mock.patch.object(sys, "argv", argv), contextlib.redirect_stdout(output):
                ASM.main()
            plan = json.loads(output.getvalue())
            self.assertEqual(plan["sourceSelectionKind"], "api-build-context")
            self.assertEqual(plan["fullGitHeadTreeAuthority"], authority)
            self.assertEqual(plan["sourceFiles"], len(selected))
            self.assertEqual(plan["sourceSelection"]["selectedFiles"], len(selected))
            self.assertTrue(plan["publicAssetsPruned"])
            self.assertEqual(plan["publicAssetsPrunedScope"], "api-build-context-export-only")
            self.assertFalse(plan["fullGitSourceTreeExported"])
            self.assertFalse(plan["globalProductSourceDeletionClaimed"])
            self.assertEqual(set(plan["contractBlobs"]), set(ASM.CONTRACT_PATHS))
            for name in ASM.CONTRACT_PATHS:
                self.assertEqual(plan["contractBlobs"][name]["sha256"], hashlib.sha256(bodies[name]).hexdigest())
                self.assertEqual(plan["contractBlobs"][name]["oid"], row(name, bodies[name])["oid"])
            self.assertEqual({call.args[2] for call in contracts.call_args_list}, set(ASM.CONTRACT_PATHS))
            self.assertFalse((private / "context").exists())

    def test_actual_export_loop_and_manifest_match_selected_blobs(self):
        bodies, selected, excluded = selection()
        authority = {"sha": HEAD, "tree": TREE}
        summary = ASM.api_selection_summary(selected, excluded)
        plan = {
            "source": authority,
            "fullGitHeadTreeAuthority": dict(authority),
            "sourceSelectionKind": "api-build-context",
            "sourceSelection": summary,
            "sourceBytes": sum(item["bytes"] for item in selected),
            "planSha256": "b" * 64,
            "excluded": excluded,
            "recipe": {"dockerfileSha256": "c" * 64, "ignoreSha256": "d" * 64},
            "contractBlobs": {item["path"]: {**item, "sha256": hashlib.sha256(bodies[item["path"]]).hexdigest()} for item in selected if item["path"] in ASM.CONTRACT_PATHS},
        }
        with tempfile.TemporaryDirectory(prefix="api-prefix-regression-") as temp:
            private = Path(temp).resolve()
            args = SimpleNamespace(expected_sha=HEAD, out=private / "source-context")
            batch = MemoryBatch(selected, bodies)
            with mock.patch.object(ASM, "REPOSITORY_ROOT", private), \
                 mock.patch.object(ASM, "batch_process", return_value=batch), \
                 mock.patch.object(ASM, "source_gate", return_value=authority), \
                 contextlib.redirect_stdout(io.StringIO()):
                ASM.export_source(Path("/fixture-only"), args, plan, selected)
            result = json.loads((private / "source-context.manifest.json").read_text())
            self.assertEqual([item["path"] for item in result["files"]], [item["path"] for item in selected])
            self.assertEqual(result["sourceSelection"], summary)
            self.assertEqual(result["fullGitHeadTreeAuthority"], authority)
            self.assertEqual(result["sourceSelectionKind"], "api-build-context")
            self.assertEqual(result["contractBlobs"], plan["contractBlobs"])
            self.assertFalse(result["globalProductSourceDeletionClaimed"])
            self.assertTrue(result["originalWebAssetsPreservedElsewhere"])
            for item in result["files"]:
                body = (args.out / item["path"]).read_bytes()
                self.assertEqual(body, bodies[item["path"]])
                self.assertEqual(item["sha256"], hashlib.sha256(body).hexdigest())
            self.assertFalse((args.out / "apps/web/public").exists())
            self.assertTrue((args.out / "apps/web/publicity/logo.png").exists())
            journal = json.loads((private / "source-context.export-journal.json").read_text())
            self.assertEqual(journal["status"], "source-exported-not-built")
            self.assertEqual(journal["sourceSelectionKind"], "api-build-context")
            self.assertFalse(batch.killed)


if __name__ == "__main__":
    unittest.main()
