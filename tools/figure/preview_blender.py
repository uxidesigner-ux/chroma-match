"""Stage-1 stills from the editable .blend, not from a regenerated script."""

from __future__ import annotations

import sys
from pathlib import Path

import bpy
from mathutils import Vector, Euler

sys.path.insert(0, str(Path(__file__).parent))
import asset_paths  # noqa: E402

OUT = Path("/opt/cursor/artifacts")
PREVIEW = asset_paths.ASSET / "preview"


def _look_at(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _add_camera(name, location, target, lens=85):
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = lens
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = location
    _look_at(cam, target)
    return cam


def _add_light():
    data = bpy.data.lights.new("key", "SUN")
    data.energy = 3.0
    obj = bpy.data.objects.new("key", data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = (-3.0, -6.0, 5.0)
    obj.rotation_euler = Euler((0.7, 0.0, -0.4), "XYZ")
    fill = bpy.data.lights.new("fill", "SUN")
    fill.energy = 0.8
    fobj = bpy.data.objects.new("fill", fill)
    bpy.context.scene.collection.objects.link(fobj)
    fobj.location = (4.0, -2.0, 1.0)


def render(path: Path, camera, size=(720, 960)):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.render.resolution_x = size[0]
    scene.render.resolution_y = size[1]
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(path)
    scene.render.image_settings.file_format = "PNG"
    scene.camera = camera
    bpy.ops.render.render(write_still=True)
    print(f"RENDER {path}")


def main():
    if not asset_paths.BLEND.exists():
        raise SystemExit(f"missing blend: {asset_paths.BLEND}")
    bpy.ops.wm.open_mainfile(filepath=str(asset_paths.BLEND))
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    _add_light()
    # Frame the bust like the original: eyes ~40% from the top, face filling
    # the middle. Blender coords are (x, -front, up).
    target = (0.0, -0.22, -0.15)
    front = _add_camera("cam_front", (0.0, -6.6, 0.18), target, lens=85)
    three = _add_camera("cam_34", (4.4, -5.2, 0.16), target, lens=85)
    side = _add_camera("cam_side", (6.8, -0.35, 0.12), target, lens=85)
    back = _add_camera("cam_back", (0.0, 6.6, 0.20), target, lens=85)
    for name, cam in [
        ("blender_front.png", front),
        ("blender_threequarter.png", three),
        ("blender_side.png", side),
        ("blender_back.png", back),
    ]:
        render(OUT / name, cam)
        render(PREVIEW / name, cam)


if __name__ == "__main__":
    main()
