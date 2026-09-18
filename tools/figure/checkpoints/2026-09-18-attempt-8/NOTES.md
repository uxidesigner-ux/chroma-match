# Attempt 8 — bang / eye visibility then placement

Same lock list as attempt 7. No new locks. `seat_inside` cap stays 0.07.

Diagnosed on the exported mesh and the same-camera showroom:

- Bang-only is a wide diagonal sheet, so the mesh was not a thin line.
- Face on + contrast paint: the sheet sits on the forehead; it was not a
  material/lighting miss.
- Raycaster: forehead samples hit `lock_p_bang` then `head`.
- Cause: tilt +1.15 and flatten 0.94 stood a sausage into the skull;
  path points p0/p1/p4/p5 were on or inside `head_surface`. The 0.07 cap
  cannot place that outer face.
- Eyes: 3654/4322 verts behind the finished skin when seated on the
  pre-deform formula. Pinpricks were burial, then a modest oval size.

Fix: `bang_pt()` centreline, negative forehead tilt, flatten 0.32. Eyes
use `front_z()` of the finished head. Depth test stays on.
