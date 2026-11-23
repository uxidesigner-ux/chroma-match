import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_LEVEL, isLevelId, levelPageRange, nextLevelId, normalizeLevelId } from './progression.ts'

test('campaign progression crosses twelve thousand and the former million boundary without wrapping',()=>{
  for(const id of [11999,12000,12297,19999,999999,1000000,0xffffffff,0x100000000,MAX_LEVEL-1]){
    assert.equal(normalizeLevelId(id),id)
    assert.equal(nextLevelId(id),id+1)
  }
  assert.equal(nextLevelId(MAX_LEVEL),MAX_LEVEL)
})
test('level identifiers reject unsafe or fractional inputs without losing valid high digits',()=>{
  for(const invalid of [0,-1,1.5,NaN,Infinity,MAX_LEVEL+1,'12000',null]){
    assert.equal(isLevelId(invalid),false)
    assert.equal(normalizeLevelId(invalid,12297),12297)
  }
  assert.equal(normalizeLevelId(MAX_LEVEL),MAX_LEVEL)
})
test('last level pages contain only exact supported identifiers and never allocate past the boundary',()=>{
  for(const size of [1,7,30,64,100]){
    const maximum=levelPageRange(MAX_LEVEL,size)
    assert.equal(maximum.last,MAX_LEVEL)
    assert.ok(maximum.count>=1&&maximum.count<=size)
    assert.ok(Number.isSafeInteger(maximum.first))
    assert.equal(maximum.first+maximum.count-1,MAX_LEVEL)
    const previous=levelPageRange(maximum.page-1,size)
    if(maximum.page>0)assert.equal(previous.last+1,maximum.first)
  }
  assert.deepEqual(levelPageRange(33333),{page:33333,first:999991,last:1000020,count:30,lastPage:300239975158033})
})
