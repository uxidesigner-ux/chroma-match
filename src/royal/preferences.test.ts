import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizePreferences,normalizeProgress,rewardWin,recordLoss,startingPowers,hasCompleted,completedCount,RECENT_COMPLETION_LIMIT} from './preferences.ts'
import {MAX_LEVEL} from './progression.ts'
test('new preferences accept level 12297, sanitize malformed storage and deduplicate boosters',()=>{
 assert.equal(normalizePreferences({level:12297}).level,12297)
 assert.equal(normalizePreferences({level:'12297',moves:NaN,speed:100,unlimitedMoves:'false'}).level,1)
 assert.deepEqual(normalizePreferences({boosters:['lightball','x','lightball','tnt']}).boosters,['lightball','tnt'])
 assert.equal(normalizePreferences({level:99999999}).level,99999999)
})
test('progress rewards a completed mission only once but tracks winning streak',()=>{
 const p=normalizeProgress(null),a=rewardWin(p,1),b=rewardWin(a,1)
 assert.equal(a.stars,1);assert.equal(b.stars,1);assert.equal(b.streak,2);assert.equal(p.stars,0)
})
test('super charge unlocks at 292, activates on ten wins and resets when active failure occurs',()=>{
 let p=normalizeProgress(null)
 for(let i=0;i<9;i++)p=rewardWin(p,292+i)
 assert.equal(p.superActive,false);p=rewardWin(p,301);assert.equal(p.superActive,true)
 const lost=recordLoss(p);assert.equal(lost.lightWins,0);assert.equal(lost.superActive,false)
 assert.equal(rewardWin(normalizeProgress(null),291).lightWins,0)
})
test('butler gift changes starting powers only after its local unlock',()=>{
 const p=normalizeProgress({streak:3})
 assert.equal(startingPowers(normalizePreferences({level:1}),p).length,0)
 assert.deepEqual(startingPowers(normalizePreferences({level:32}),p),['rocket-h','propeller','tnt','lightball'])
})

test('large stage identifiers survive settings and completion storage without truncation',()=>{
 for(const level of [12000,12297,20000,999999,1000000,0x100000000+12000,MAX_LEVEL]){
  assert.equal(normalizePreferences({level}).level,level)
  const won=rewardWin(normalizeProgress(null),level)
  const restored=normalizeProgress(JSON.parse(JSON.stringify(won)))
  assert.equal(hasCompleted(restored,level),true)
  assert.equal(completedCount(restored),1)
  assert.equal(rewardWin(restored,level).stars,1)
 }
})
test('old long completion lists compact into ranges without forgetting first-clear rewards',()=>{
 const old={completed:Array.from({length:20000},(_,i)=>i+1),stars:20000,coins:1000000}
 const compact=normalizeProgress(old)
 assert.equal(compact.completed.length,RECENT_COMPLETION_LIMIT)
 assert.deepEqual(compact.completedRanges,[[1,20000]])
 assert.equal(completedCount(compact),20000)
 assert.ok(JSON.stringify(compact).length<4000)
 const restored=normalizeProgress(JSON.parse(JSON.stringify(compact)))
 assert.equal(rewardWin(restored,1).stars,20000)
 assert.equal(rewardWin(restored,12000).stars,20000)
 const next=rewardWin(restored,20001)
 assert.deepEqual(next.completedRanges,[[1,20001]])
 assert.equal(next.stars,20001)
 assert.equal(next.completed.length,RECENT_COMPLETION_LIMIT)
})
test('sparse completion ranges merge overlaps, preserve gaps and ignore malformed records',()=>{
 const p=normalizeProgress({completed:[1,2,12297,MAX_LEVEL,MAX_LEVEL+1],completedRanges:[[2,5],[5,7],[1000000,1000002],[8,6],['9',10],[0,2],[MAX_LEVEL,MAX_LEVEL]]})
 assert.deepEqual(p.completedRanges,[[1,7],[12297,12297],[1000000,1000002],[MAX_LEVEL,MAX_LEVEL]])
 assert.equal(completedCount(p),12)
 assert.equal(hasCompleted(p,8),false)
 assert.equal(hasCompleted(p,1000001),true)
 assert.equal(hasCompleted(p,MAX_LEVEL+1),false)
 assert.equal(rewardWin(p,8).stars,1)
 assert.equal(rewardWin(p,NaN).stars,0)
})
