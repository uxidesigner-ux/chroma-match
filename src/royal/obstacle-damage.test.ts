import test from 'node:test'
import assert from 'node:assert/strict'
import { obstacleDamage } from './obstacle-damage.ts'
import type { ObstacleState } from './model.ts'

const obstacle = (kind: ObstacleState['kind'], hp: number, initialHp = hp, stock = 1): ObstacleState => ({ id: 'test', kind, cells: [0], hp, initialHp, stock, initialStock: stock })

test('gift contents are a reward and never multiply required shell hits', () => {
  assert.equal(obstacleDamage(obstacle('gift', 2, 4, 12)).remainingHits, 2)
  assert.equal(obstacleDamage(obstacle('gift', 2, 4, 12)).contentCount, 12)
})

test('refilling obstacle shells preserve an exact total across a collection', () => {
  for (const kind of ['cuckoo', 'dynamite'] as const) {
    const before = obstacleDamage(obstacle(kind, 1, 3, 4))
    const after = obstacleDamage(obstacle(kind, 3, 3, 3))
    assert.equal(before.remainingHits, 10)
    assert.equal(after.remainingHits, 9)
    assert.equal(after.shellHits, 3)
    assert.equal(after.wear, 0)
  }
})

test('every custom shell layer changes persistent wear and reinforcement', () => {
  for (const kind of ['box', 'stone', 'ice', 'gift', 'cuckoo', 'dynamite'] as const) {
    let previous = obstacleDamage(obstacle(kind, 12, 12))
    for (let hp = 11; hp > 0; hp--) {
      const next = obstacleDamage(obstacle(kind, hp, 12))
      assert.ok(next.wear > previous.wear, `${kind} ${hp}: damage stays visible`)
      assert.equal(next.remainingHits, hp)
      assert.ok(next.extraLayers <= previous.extraLayers)
      previous = next
    }
  }
})
