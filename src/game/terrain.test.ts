import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Game } from './game.ts'
import { WORLD_MISSIONS, missionFor } from './campaign.ts'
import { BOARD } from './types.ts'
import { findMatches,findMoves,applyGravity,makeGem,shuffleBoard } from './board.ts'
import { makeRng } from './rng.ts'
import { terrainFor } from './terrain.ts'
import { recordOf,restoreRun,verifyRun } from './replay.ts'
import { bestMove } from './autoplay.ts'

function settle(g:Game){for(let i=0;i<4000&&g.busy;i++)g.update(1/60)}
test('all 120 v8 stages have playable shaped boards; legacy campaigns remain rectangles',()=>{
  for(const m of WORLD_MISSIONS){
    const g=new Game({},m.seed,BOARD,8,m.id)
    assert.equal(findMatches(BOARD,g.grid,8).length,0,m.id)
    assert.ok(findMoves(BOARD,g.grid,8).length,m.id)
    assert.equal(g.grid.filter(Boolean).length,BOARD.cells-g.terrain.voidCells.size)
    for(const cell of g.terrain.voidCells)assert.equal(g.grid[cell],null)
    for(const cell of g.terrain.crates)assert.equal(g.grid[cell]?.durability,g.terrain.durability)
    const old=new Game({},m.seed,BOARD,7,m.id)
    assert.equal(old.terrain.voidCells.size,0);assert.equal(old.terrain.crates.length,0)
  }
})
test('three-hit block stays anchored, cannot swap, and only breaks on the third hammer; v8 replay agrees',()=>{
  const m=missionFor('forest-16')!,g=new Game({},m.seed,BOARD,8,m.id),cell=g.terrain.crates[0]!
  const id=g.grid[cell]!.id
  g.drag(cell,cell+1);assert.equal(g.grid[cell]?.id,id);assert.equal(g.log.length,0);assert.equal(g.busy,false)
  for(let hit=1;hit<=3;hit++){
    assert.ok(g.useItem('hammer',cell));settle(g)
    if(hit<3){assert.equal(g.grid[cell]?.id,id);assert.equal(g.grid[cell]?.durability,3-hit)}
    else assert.equal(g.grid[cell]?.durability,undefined)
  }
  const record=recordOf(g);assert.ok(record.moves.startsWith('zs'))
  assert.ok(verifyRun(record,BOARD).claimMatches)
  const restored=new Game();assert.ok(restoreRun(restored,record))
  assert.deepEqual(restored.grid.map(a=>a&&[a.kind,a.power,a.durability]),g.grid.map(a=>a&&[a.kind,a.power,a.durability]))
})
test('mask and fixed crate survive segmented gravity and dead-board shuffles',()=>{
  const terrain=terrainFor(BOARD,missionFor('forest-25'),8),geom={...BOARD,voidCells:terrain.voidCells}
  const g=new Game({},42,BOARD,8,'forest-25'),cell=g.terrain.crates[0]!,crate=g.grid[cell]!
  for(let i=0;i<BOARD.cells;i++)if(!geom.voidCells.has(i)&&i!==cell)g.grid[i]=makeGem(i%5)
  g.grid[cell+BOARD.cols]=null
  applyGravity(geom,g.grid,makeRng(7));assert.equal(g.grid[cell],crate)
  shuffleBoard(geom,g.grid,makeRng(9),8);assert.equal(g.grid[cell],crate)
  for(const i of terrain.voidCells)assert.equal(g.grid[i],null)
  assert.ok(findMoves(BOARD,g.grid,8).length)
})
test('a blast and neighboring clears damage a shared block only once in one wave',()=>{
  const m=missionFor('forest-16')!,g=new Game({},m.seed,BOARD,8,m.id),cell=g.terrain.crates[0]!
  assert.ok(g.useItem('bomb',cell));assert.equal(g.grid[cell]?.durability,2)
  settle(g);assert.ok(verifyRun(recordOf(g),BOARD).claimMatches)
})
test('all 120 terrain missions can clear and reproduce their exact result from the new header',()=>{
  for(const m of WORLD_MISSIONS){
    const g=new Game({},m.seed,BOARD,8,m.id)
    for(let action=0;action<45&&g.status==='playing';action++){
      if(g.feverCharge===100)g.activateFever()
      if(action<3)g.useItem('bomb',BOARD.idx(2,4))
      else {const move=bestMove(g);assert.ok(move,m.id);g.drag(move.a,move.b)}
      for(let frame=0;frame<4000&&g.phaseKind!=='idle';frame++)g.update(1/60)
      for(const cell of g.terrain.voidCells)assert.equal(g.grid[cell],null,m.id)
    }
    assert.equal(g.status,'levelComplete',m.id)
    assert.ok(verifyRun(recordOf(g),BOARD).claimMatches,m.id)
  }
})
