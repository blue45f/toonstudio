"""실제 파일 게시의 CAS·동시 실행·중단 복구에서 기존 자료를 보존한다."""
import importlib.util
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "render-creator-bundle-assets.py"
SPEC = importlib.util.spec_from_file_location("bundle_publication", SCRIPT)
renders = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(renders)


class PublicationRaceTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.output, self.source = self.root / "output", self.root / "source"
        self.output.mkdir()
        self.source.mkdir()
        (self.output / "manifest.json").write_bytes(b"original")
        (self.source / "manifest.json").write_bytes(b"replacement")

    def test_real_no_replace_rejects_even_empty_existing_directory(self):
        empty = self.root / "empty"
        empty.mkdir()
        with self.assertRaises(FileExistsError):
            renders.rename_no_replace(self.source, empty)
        self.assertTrue(self.source.is_dir())
        self.assertEqual(list(empty.iterdir()), [])

    def test_backup_cas_checks_actual_renamed_content_not_just_precheck(self):
        expected = renders.pack_snapshot(self.output)
        move = renders.rename_no_replace
        def change_before_backup(source, target):
            if source == self.output:
                (source / "manifest.json").write_bytes(b"concurrent")
            move(source, target)
        with patch.object(renders, "rename_no_replace", side_effect=change_before_backup):
            with self.assertRaisesRegex(renders.RenderError, "게시.*변경"):
                renders.publish_pack(self.source, self.output, expected_snapshot=expected)
        self.assertEqual((self.output / "manifest.json").read_bytes(), b"concurrent")
        self.assertEqual(list(self.root.glob(".bundle-publish-*")), [])

    def test_gap_creation_is_never_overwritten_and_stranded_backup_survives_cleanup(self):
        move = renders.rename_no_replace
        for with_file in (False, True):
            with self.subTest(nonempty=with_file), tempfile.TemporaryDirectory(dir=self.root) as tmp:
                output = Path(tmp) / "target"
                output.mkdir()
                (output / "manifest.json").write_bytes(b"old-pack")
                expected = renders.pack_snapshot(output)
                def create_in_gap(source, target):
                    if source.name == "ready":
                        output.mkdir()
                        if with_file:
                            (output / "other-publisher").write_bytes(b"new-pack")
                    move(source, target)
                with patch.object(renders, "rename_no_replace", side_effect=create_in_gap):
                    with self.assertRaisesRegex(renders.RenderError, "이전 팩을 보존") as caught:
                        renders.publish_pack(self.source, output, expected_snapshot=expected)
                backup = next(Path(tmp).glob(".bundle-publish-*/previous"))
                self.assertIn(str(backup), str(caught.exception))
                self.assertEqual((backup / "manifest.json").read_bytes(), b"old-pack")
                self.assertEqual(sorted(p.name for p in output.iterdir()), ["other-publisher"] if with_file else [])
                if with_file:
                    self.assertEqual((output / "other-publisher").read_bytes(), b"new-pack")

    def test_absent_snapshot_does_not_replace_concurrently_created_output(self):
        with self.assertRaisesRegex(renders.RenderError, "게시.*변경"):
            renders.publish_pack(self.source, self.output, expected_snapshot=None)
        self.assertEqual((self.output / "manifest.json").read_bytes(), b"original")

    def test_publication_lock_rejects_concurrent_writer_without_changing_pack(self):
        failures = []
        def another_publisher():
            try:
                renders.publish_pack(self.source, self.output)
            except renders.RenderError as error:
                failures.append(str(error))
        with renders.publication_lock(self.output):
            worker = threading.Thread(target=another_publisher)
            worker.start()
            worker.join(2)
        self.assertFalse(worker.is_alive())
        self.assertEqual(len(failures), 1)
        self.assertIn("다른 게시 작업", failures[0])
        self.assertEqual((self.output / "manifest.json").read_bytes(), b"original")

    def test_interrupt_after_install_restores_output_and_preserves_interrupted_copy(self):
        snapshot = renders.pack_snapshot
        def interrupt_after_install(path):
            if path == self.output and path.exists() and (path / "manifest.json").read_bytes() == b"replacement":
                raise KeyboardInterrupt()
            return snapshot(path)
        for existed in (True, False):
            if not existed:
                renders.shutil.rmtree(self.output)
            with patch.object(renders, "pack_snapshot", side_effect=interrupt_after_install):
                with self.subTest(existed=existed), self.assertRaisesRegex(renders.RenderError, "설치본을 보존"):
                    renders.publish_pack(self.source, self.output)
            self.assertEqual(self.output.exists(), existed)
            if existed:
                self.assertEqual((self.output / "manifest.json").read_bytes(), b"original")
            self.assertTrue(any(self.root.glob(".bundle-publish-*/interrupted/manifest.json")))

    def test_in_place_concurrent_data_survives_snapshot_mismatch_and_rollback(self):
        snapshot = renders.pack_snapshot
        def add_data_after_install(path):
            if path == self.output and path.exists() and (path / "manifest.json").read_bytes() == b"replacement":
                (path / "concurrent-C").write_bytes(b"preserve-C")
            return snapshot(path)
        with patch.object(renders, "pack_snapshot", side_effect=add_data_after_install):
            with self.assertRaisesRegex(renders.RenderError, "설치본을 보존") as caught:
                renders.publish_pack(self.source, self.output)
        self.assertEqual((self.output / "manifest.json").read_bytes(), b"original")
        saved = next(self.root.glob(".bundle-publish-*/interrupted"))
        self.assertIn(str(saved), str(caught.exception))
        self.assertEqual((saved / "concurrent-C").read_bytes(), b"preserve-C")

    def test_local_evidence_lock_preserves_matching_pack_and_proof(self):
        work = self.root / "work"
        work.mkdir()
        renders.publish_local_evidence(self.source, work, b"proof-A")
        with renders.publication_lock(work / "run-evidence"):
            with self.assertRaisesRegex(renders.RenderError, "다른 게시 작업"):
                renders.publish_local_evidence(self.output, work, b"proof-B")
        self.assertEqual((work / "pack/manifest.json").read_bytes(), b"replacement")
        self.assertEqual((work / "render-proof.json").read_bytes(), b"proof-A")

    def test_proof_install_failure_does_not_attach_old_proof_to_new_pack(self):
        work = self.root / "work"
        work.mkdir()
        renders.publish_local_evidence(self.source, work, b"proof-A")
        move = renders.rename_no_replace
        def fail_proof(source, target):
            if source.name == "render-proof.json" and target == work / "render-proof.json":
                raise OSError("proof install failed")
            move(source, target)
        with patch.object(renders, "rename_no_replace", side_effect=fail_proof):
            with self.assertRaisesRegex(renders.RenderError, "옛 proof.*보존"):
                renders.publish_local_evidence(self.output, work, b"proof-B")
        self.assertFalse((work / "render-proof.json").exists())
        self.assertEqual((work / "pack/manifest.json").read_bytes(), b"original")
        self.assertEqual(next(work.glob(".render-proof-*/previous-proof.json")).read_bytes(), b"proof-A")


if __name__ == "__main__":
    unittest.main()
