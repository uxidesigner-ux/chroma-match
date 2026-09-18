"""Export the candidate hair GLB only. Does not write public/ or the original."""

from __future__ import annotations

import sys
from pathlib import Path

import bpy

ROOT = Path("/workspace/tools/figure")
sys.path.insert(0, str(ROOT))
import lib  # noqa: E402

CANDIDATE = ROOT / "assets/long-wave/candidate"
BLEND = CANDIDATE / "hair_long_wave.blend"
GLB = CANDIDATE / "hair_long_wave.glb"


def main():
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    hair = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        is_hair = obj.name.startswith("hair")
        obj.hide_set(not is_hair)
        obj.hide_render = not is_hair
        if is_hair:
            hair.append(obj)
    if not hair:
        raise SystemExit("no hair_* meshes")
    lib.export(str(GLB), visible_only=True)
    print("CANDIDATE_GLB", GLB, "bytes", GLB.stat().st_size, "parts", [o.name for o in hair])


if __name__ == "__main__":
    main()
