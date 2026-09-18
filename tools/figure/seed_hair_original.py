"""Copy generated/blockout.blend into the editable-original slot.

This is the only command that may create hair_long_wave.blend from a
generated freeze. export_hair.py will not do it.

Refuses if the original already exists so a later sculpt is not replaced
by a silent copy.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import asset_paths  # noqa: E402


def seed():
    src = asset_paths.GENERATED / "blockout.blend"
    dst = asset_paths.BLEND
    if not src.exists():
        raise SystemExit(f"missing seed: {src}")
    if dst.exists():
        raise SystemExit(
            f"editable original already exists: {dst}\n"
            "export_hair.py will use it. To replace it, remove or rename "
            "that file first, then run this command again."
        )
    asset_paths.ASSET.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, dst)
    print(f"SEEDED {dst} from {src} bytes={dst.stat().st_size}")


if __name__ == "__main__":
    seed()
