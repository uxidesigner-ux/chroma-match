# bpy sculpt operators — 2026-09-18 notes

Separate from hair **quality**. The long-wave is rejected on screen
(tubes and a cap, not the reference). This file only records operator
behaviour in one process.

## Process

| | |
|---|---|
| Date | 2026-09-18 |
| bpy | 5.0.1 (`bpy.app.version_string`) |
| Python | 3.11 |
| `bpy.app.background` | `True` |
| Host | Cursor cloud agent VM, Linux, no GPU window attached to this Python |

Default context after `import bpy` still had a `Screen("Layout")` with a
`VIEW_3D` area and one `Window`.

## What was run

1. `bpy.ops.object.mode_set(mode='SCULPT')` on a default UV sphere — succeeded (`context.mode == 'SCULPT'`).
2. `bpy.ops.sculpt.dynamic_topology_toggle()` — succeeded.
3. `bpy.ops.sculpt.brush_stroke.poll()` with no area override — **False**. Invoking without override: `RuntimeError: Operator bpy.ops.sculpt.brush_stroke.poll() failed, context is incorrect`.
4. Same poll inside `bpy.context.temp_override(window=..., area=VIEW_3D, region=WINDOW)` — **True**.
5. Invoking `bpy.ops.sculpt.brush_stroke(stroke=[...], mode='NORMAL', override_location=True)` under that override — process **aborted, exit 139 (SIGSEGV)**. Last prints: vertex 0 at `(0,0,1)`, brush `Draw`. No `brush_stroke returned` line.
6. `bpy.ops.sculpt.mesh_filter(type='SMOOTH', strength=0.5)` (and INFLATE) — process **aborted, exit 139 (SIGSEGV)**. In one run this happened after `mode_set(SCULPT)` with no override; in another, `read_factory_settings(use_empty=False)` also aborted before prints (stdout fully buffered / crash in UI init). Treat mesh_filter as crashing in this process; do not treat factory-settings crash as fully isolated.
7. `bpy.ops.object.mode_set(mode='EDIT')` then `bpy.ops.mesh.vertices_smooth(repeat=2)` — succeeded.

Minimal reproduction for (5), after `import bpy`:

```python
bpy.ops.mesh.primitive_uv_sphere_add()
obj = bpy.context.active_object
win = bpy.context.window
area = next(a for a in bpy.context.screen.areas if a.type == "VIEW_3D")
region = next(r for r in area.regions if r.type == "WINDOW")
bpy.ops.object.mode_set(mode="SCULPT")
stroke = [{
    "name": "stroke",
    "is_start": True,
    "location": (0.0, 0.0, 1.0),
    "mouse": (region.width / 2, region.height / 2),
    "mouse_event": (region.width / 2, region.height / 2),
    "pressure": 1.0,
    "size": 50.0,
    "time": 0.0,
}]
with bpy.context.temp_override(window=win, area=area, region=region):
    bpy.ops.sculpt.brush_stroke(stroke=stroke, mode="NORMAL", override_location=True)
```

No core dump path was captured. The only record is this file plus the
agent session’s stderr (`Segmentation fault`, exit 139).

## What this does not say

- Not: hair can only be made by a person.
- Not: scripts cannot produce hair form (ribbons, grids, and modifiers did run).
- Not: installing a windowed Blender is sufficient for visual approval.

Further operator experiments are out of scope for this handoff.
