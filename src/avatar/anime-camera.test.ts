import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fitFullBody } from './anime-camera.ts'
import type { CharacterBounds } from './anime-camera.ts'

test('full-body fitting keeps every corner inside the frame at all angles and screen shapes', () => {
  const bodies: CharacterBounds[] = [
    { min: [-0.3, 0, -0.15], max: [0.3, 1.7, 0.2] },
    { min: [-0.9, -0.2, -0.6], max: [1.1, 1.9, 0.3] },
  ]
  for (const body of bodies)
    for (const aspect of [0.4, 0.8, 1, 2.5]) {
      for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 8) {
        const { target, distance } = fitFullBody(body, aspect, yaw)
        for (const x of [body.min[0], body.max[0]])
          for (const y of [body.min[1], body.max[1]])
            for (const z of [body.min[2], body.max[2]]) {
              const dx = x - target[0],
                dy = y - target[1],
                dz = z - target[2]
              const depth = distance - (Math.sin(yaw) * dx + Math.cos(yaw) * dz)
              const screenX =
                (Math.cos(yaw) * dx - Math.sin(yaw) * dz) /
                (depth * Math.tan(Math.PI / 12) * aspect)
              const screenY = dy / (depth * Math.tan(Math.PI / 12))
              assert.ok(Math.abs(screenX) < 0.88 && Math.abs(screenY) < 0.88)
              assert.ok(depth > 0)
            }
      }
    }
})

test('full-body framing targets the actual centre, not an assumed ground origin', () => {
  assert.deepEqual(fitFullBody({ min: [1, -1, 3], max: [3, 3, 5] }, 1, 0).target, [2, 1, 4])
})
