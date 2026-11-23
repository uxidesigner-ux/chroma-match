import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizePreferences,normalizeProgress,rewardWin,recordLoss,startingPowers} from './preferences.ts'
test('new preferences accept level 12297, sanitize malformed storage and deduplicate boosters',()=>{
 assert.equal(normalizePreferences({level:12297}).level,12297)
 assert.equal(normalizePreferences({level:'12297',moves:NaN,speed:100,unlimitedMoves:'false'}).level,1)
 assert.deepEqual(normalizePreferences({boosters:['lightball','x','lightball','tnt']}).boosters,['lightball','tnt'])
 assert.equal(normalizePreferences({level:99999999}).level,999999)
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
