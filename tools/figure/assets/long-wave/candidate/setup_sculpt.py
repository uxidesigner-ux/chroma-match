"""Open the candidate in Sculpting, frame the bust, stay in the GUI."""

import bpy
from mathutils import Euler, Vector

obj = bpy.data.objects.get("hair_bang") or bpy.data.objects.get("hair_scalp")
bpy.ops.object.select_all(action="DESELECT")
if obj:
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

try:
    bpy.context.window.workspace = bpy.data.workspaces["Sculpting"]
except Exception as exc:
    print("workspace", exc)

if bpy.context.object and bpy.context.object.type == "MESH":
    try:
        bpy.ops.object.mode_set(mode="SCULPT")
        print("SCULPT_MODE", bpy.context.object.name)
    except Exception as exc:
        print("sculpt_mode", exc)

for window in bpy.context.window_manager.windows:
    for area in window.screen.areas:
        if area.type != "VIEW_3D":
            continue
        space = area.spaces.active
        r3d = space.region_3d
        r3d.view_perspective = "ORTHO"
        # Blender: (x, -front, up). Front ortho, bust-sized.
        r3d.view_location = Vector((0.0, 0.0, 0.05))
        r3d.view_rotation = Euler((1.5708, 0.0, 0.0), "XYZ").to_quaternion()
        r3d.view_distance = 5.2
        space.shading.type = "SOLID"
        space.shading.light = "STUDIO"
        space.shading.color_type = "MATERIAL"
        print("VIEW3D framed")

print("READY_SCULPT")
