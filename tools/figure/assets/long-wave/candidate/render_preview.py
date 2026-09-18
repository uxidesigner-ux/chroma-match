"""Workbench stills of the candidate blend. Does not touch the original."""
from pathlib import Path
import bpy
from mathutils import Vector, Euler

BLEND = Path("/workspace/tools/figure/assets/long-wave/candidate/hair_long_wave.blend")
OUT = Path("/workspace/tools/figure/assets/long-wave/candidate/preview")
ART = Path("/opt/cursor/artifacts/candidate")


def look_at(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_camera(name, location, target, lens=85):
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = lens
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = location
    look_at(cam, target)
    return cam


def add_light():
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


def render(path, camera, size=(720, 960)):
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
    print("RENDER", path)


def main():
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    OUT.mkdir(parents=True, exist_ok=True)
    ART.mkdir(parents=True, exist_ok=True)
    add_light()
    target = (0.0, -0.55, -0.10)
    cams = [
        ("front.png", add_camera("c_front", (0.0, -8.4, 0.05), target, 85)),
        ("threequarter.png", add_camera("c_34", (5.6, -6.6, 0.05), target, 85)),
        ("side.png", add_camera("c_side", (8.6, -0.40, 0.02), target, 85)),
        ("back.png", add_camera("c_back", (0.0, 8.4, 0.08), target, 85)),
    ]
    notes = []
    for name, cam in cams:
        render(OUT / name, cam)
        render(ART / name, cam)
        loc = tuple(round(v, 3) for v in cam.location)
        notes.append(
            f"{name}: Workbench 85mm perspective, camera {loc}, "
            f"target {target}, engine BLENDER_WORKBENCH studio/material"
        )
    (OUT / "cameras.txt").write_text("\n".join(notes) + "\n")
    (ART / "cameras.txt").write_text("\n".join(notes) + "\n")
    print("CAMERAS", notes)


if __name__ == "__main__":
    main()
