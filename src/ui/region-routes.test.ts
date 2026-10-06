import {test} from 'node:test'
import assert from 'node:assert/strict'
import {REGIONS,WORLD_MISSIONS} from '../game/campaign.ts'
import {pointFor,regionalArt,terraceRoute} from './region-routes.ts'

test('all four regions use thirty terrain-aligned terrace nodes, not a five-column grid',()=>{
  assert.equal(terraceRoute.length,30)
  assert.equal(new Set(Object.values(regionalArt)).size,4)
  for(const region of REGIONS){
    const nodes=WORLD_MISSIONS.filter(m=>m.region===region).map(pointFor)
    assert.equal(nodes.length,30)
    for(const [i,a] of nodes.entries()){
      assert.ok(a.x>.3&&a.x<.7&&a.y>.1&&a.y<.85)
      for(const b of nodes.slice(i+1)){
        // Axis-aligned 52px touch squares must remain distinct at minimum zoom.
        assert.ok(Math.abs(a.x-b.x)*1024*1.4>=52 || Math.abs(a.y-b.y)*1536*1.4>=52)
      }
    }
  }
})
test('invalid route indexes do not silently place nodes at the origin',()=>{
  assert.throws(()=>pointFor({region:'forest',step:0}),RangeError)
  assert.throws(()=>pointFor({region:'relay',step:31}),RangeError)
})
