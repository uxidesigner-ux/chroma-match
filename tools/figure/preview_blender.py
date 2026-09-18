"""Stage-1 stills from Blender, not from the showroom.

Form is judged here. If these views are wrong, do not correct them in
Three.js — edit the asset in hair_long_wave.py / the .blend instead.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector, Euler

sys.path.insert(0, str(Path(__file__).parent))
import character  # noqa: E402

OUT = Path("/opt/cursor/artifacts")


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
    obj.location = ( -3.0, -6.0, 5.0)
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
    character.build()
    OUT.mkdir(parents=True, exist_ok=True)
    _add_light()
    target = (0.0, 0.35, -0.55)
    front = _add_camera("cam_front", (0.0, -9.5, -0.35), target, lens=70)
    three = _add_camera("cam_34", (6.2, -7.2, -0.25), target, lens=70)
    side = _add_camera("cam_side", (9.5, -0.6, -0.30), target, lens=70)
    back = _add_camera("cam_back", (0.0, 9.5, -0.20), target, lens=70)
    render(OUT / "blender_front.png", front)
    render(OUT / "blender_threequarter.png", three)
    render(OUT / "blender_side.png", side)
    render(OUT / "blender_back.png", back)


if __name__ == "__main__":
    main()
