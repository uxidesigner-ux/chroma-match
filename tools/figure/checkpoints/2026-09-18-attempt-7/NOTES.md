# Attempt 7 — overlapping flowing locks

Layered ribbons, no voxel fuse of the whole head. Three mesh groups:

- `scalp_*` / `back_vol_*` — base volume (occiput, nape, sides, cheek fill)
- `lock_p_*` — primary flows (bang, left/right waves, side-to-back wraps)
- `lock_s_*` — secondary locks, inside the same outline, different roots

Showroom treats them as one hair slot. Hide `lock_s_*` and the long-wave
silhouette from the base+primary should remain.

Hanging locks keep section tilt near 0 so the width faces the camera.
`seat_inside` only lifts vertices that punched deep into the skull.
The back volume is authored outside the occiput, not projected onto it.
