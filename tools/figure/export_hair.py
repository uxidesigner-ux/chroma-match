"""Export hair GLB from the editable .blend. Does not regenerate form."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).parent))
import asset_paths  # noqa: E402
import lib  # noqa: E402


def seed_original_if_missing():
    """Copy the frozen blockout into the original slot once. Never overwrite."""
    if asset_paths.BLEND.exists():
        return
    src = asset_paths.GENERATED / "blockout.blend"
    if not src.exists():
        raise SystemExit(
            f"missing editable original {asset_paths.BLEND} and no seed {src}"
        )
    shutil.copy(src, asset_paths.BLEND)
    print(f"SEED {asset_paths.BLEND} from {src}")


def export_hair():
    seed_original_if_missing()
    if not asset_paths.BLEND.exists():
        raise SystemExit(f"missing editable original: {asset_paths.BLEND}")
    bpy.ops.wm.open_mainfile(filepath=str(asset_paths.BLEND))
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
        raise SystemExit("no hair_* meshes in the blend")
    asset_paths.PUBLIC.mkdir(parents=True, exist_ok=True)
    lib.export(str(asset_paths.HAIR_GLB), visible_only=True)
    print(f"HAIR {asset_paths.HAIR_GLB} bytes={asset_paths.HAIR_GLB.stat().st_size} parts={[o.name for o in hair]}")


def assemble_character():
    """body.glb + hair_long_wave.glb. Neither is rebuilt here."""
    if not asset_paths.BODY_GLB.exists():
        raise SystemExit(f"missing body: {asset_paths.BODY_GLB}")
    if not asset_paths.HAIR_GLB.exists():
        raise SystemExit(f"missing hair: {asset_paths.HAIR_GLB}")
    lib.reset()
    bpy.ops.import_scene.gltf(filepath=str(asset_paths.BODY_GLB))
    bpy.ops.import_scene.gltf(filepath=str(asset_paths.HAIR_GLB))
    lib.export(str(asset_paths.CHARACTER_GLB))
    print(f"ASSEMBLED {asset_paths.CHARACTER_GLB} bytes={asset_paths.CHARACTER_GLB.stat().st_size}")


if __name__ == "__main__":
    export_hair()
    assemble_character()
