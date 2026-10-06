import test from 'node:test'
import assert from 'node:assert/strict'
import { frameTier } from './profile-rank.ts'
test('rank frame grows at stable thresholds without altering XP or equipped cosmetics',()=>{
  for(const [level,id] of [[1,'bronze'],[2,'bronze'],[3,'silver'],[9,'silver'],[10,'gold'],[19,'gold'],[20,'crystal'],[34,'crystal'],[35,'royal'],[49,'royal'],[50,'legend'],[999,'legend']] as const)assert.equal(frameTier(level).id,id)
  assert.equal(frameTier(NaN).id,'bronze');assert.equal(frameTier(-10).id,'bronze')
})
