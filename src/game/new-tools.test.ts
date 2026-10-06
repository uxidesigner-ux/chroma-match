import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Game } from './game.ts'
import { BOARD } from './types.ts'
import { ALL_ITEMS, blastCells } from './items.ts'
import { findMatches, findMoves } from './board.ts'
import { recordOf, restoreRun, verifyRun, hasRunActions } from './replay.ts'
import { metricsOf, emptyAggregate, accumulate, itemTotal } from '../player/model.ts'
import { missionFor } from './campaign.ts'

const settle = (g: Game) => { for (let n=0; n<4000 && g.busy; n++) g.update(1/60) }
test('new runs supply five tools, old rules retain their exact stock and encoding', () => {
  for (const rules of [5,7,8,9,10] as const) {
    const m = rules===7 || rules===8 || rules===10 ? missionFor('forest-1') : null
    const g=new Game({},m?.seed ?? 7,BOARD,rules,m?.id)
    assert.equal(g.items.bow, rules>=9 ? 3 : undefined)
    assert.equal(g.items.shuffle, rules>=9 ? 3 : undefined)
    const initial=recordOf(g); assert.equal(hasRunActions(initial),false)
    assert.equal(g.useItem('hammer',26),true);settle(g)
    const record=recordOf(g);assert.equal(verifyRun(record,BOARD).ok,true)
    const restored=new Game({},1); assert.equal(restoreRun(restored,record),true)
    assert.deepEqual(restored.items,g.items);assert.equal(restored.score,g.score)
    if(rules<9)assert.equal(record.moves.slice(-2),(216+26).toString(36))
  }
})
test('bow hits exactly one full column, costs no move, chains powers and verifies',()=>{
  const cell=BOARD.idx(2,4), g=new Game({},7,BOARD,9)
  assert.deepEqual(blastCells('bow',cell,BOARD),Array.from({length:9},(_,r)=>BOARD.idx(2,r)))
  const moves=g.moves
  assert.equal(g.useItem('bow',cell),true);assert.equal(g.strikes[0]?.kind,'col')
  assert.equal(g.useItem('bow',cell),false,'busy rejects double spend')
  settle(g);assert.equal(g.moves,moves);assert.equal(g.items.bow,2);assert.ok(g.score>0)
  assert.equal(verifyRun(recordOf(g),BOARD).ok,true)
})
test('shuffle is replayable, does not score or spend moves, preserves anchored terrain',()=>{
  const m=missionFor('forest-25')!, g=new Game({},m.seed,BOARD,10,m.id)
  const before=g.grid.map(x=>x && ({kind:x.kind,power:x.power,durability:x.durability}))
  const crates=[...g.terrain.crates].map(i=>[i,g.grid[i]?.durability])
  const moves=g.moves, score=g.score, progress=g.progress
  assert.equal(g.useItem('shuffle',0),true);settle(g)
  assert.equal(g.items.shuffle,2);assert.equal(g.moves,moves);assert.equal(g.score,score);assert.equal(g.progress,progress)
  assert.deepEqual([...g.terrain.crates].map(i=>[i,g.grid[i]?.durability]),crates)
  assert.notDeepEqual(g.grid.map(x=>x && ({kind:x.kind,power:x.power,durability:x.durability})),before)
  for(const i of g.terrain.voidCells)assert.equal(g.grid[i],null)
  assert.equal(findMatches(BOARD,g.grid,10).length,0);assert.ok(findMoves(BOARD,g.grid,10).length)
  const restored=new Game({},1);assert.equal(restoreRun(restored,recordOf(g)),true)
  assert.deepEqual(restored.grid.map(x=>x && ({kind:x.kind,power:x.power,durability:x.durability})),g.grid.map(x=>x && ({kind:x.kind,power:x.power,durability:x.durability})));assert.deepEqual(restored.items,g.items)
})
test('all five tools are bounded, exhausted shuffle cannot mint stock',()=>{
  const g=new Game({},7,BOARD,9)
  for(let i=0;i<3;i++){assert.equal(g.useItem('shuffle',0),true);settle(g)}
  assert.equal(g.useItem('shuffle',0),false)
  const record=recordOf(g);assert.equal(verifyRun(record,BOARD).ok,true)
  assert.equal(verifyRun({...record,moves:record.moves+record.moves.slice(-2)},BOARD).ok,false)
  for(const item of ALL_ITEMS)assert.ok((g.items[item] ?? 0)>=0)
  for(const rules of [1,2,3,4,5,6,7,8] as const) {
    const m=rules>=6?missionFor('forest-1'):null,g=new Game({},m?.seed ?? 7,BOARD,rules,m?.id)
    assert.equal(g.addBooster('bow',2),false);assert.equal(g.useItem('shuffle',0),false)
  }
})

test('new item metrics accumulate over legacy data without NaN or invented history',()=>{
  const g=new Game({},7,BOARD,9)
  g.useItem('shuffle',0);settle(g);g.useItem('bow',14);settle(g)
  const metrics=metricsOf(g),total=emptyAggregate()
  assert.equal(metrics.items.shuffle,1);assert.equal(metrics.items.bow,1);assert.equal(itemTotal(metrics),2)
  accumulate(total,{...metrics,id:'tools',mode:'free',outcome:'quit',at:1,mission:null,rules:9})
  assert.equal(total.items.bow,1);assert.equal(total.items.shuffle,1);assert.equal(total.rounds,1)
  assert.equal(total.items.hammer,0);assert.equal(total.noItems,0)
})
