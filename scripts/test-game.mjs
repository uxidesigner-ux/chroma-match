// Temporary character freeze: preserve the full suite as test:all.
import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
async function collect(dir) {
  const files=[]
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    if(entry.name==='avatar') continue
    const path=`${dir}/${entry.name}`
    if(entry.isDirectory()) files.push(...await collect(path))
    else if(entry.name.endsWith('.test.ts')) files.push(path)
  }
  return files
}
const result=spawnSync(process.execPath,['--test',...await collect('src')],{stdio:'inherit'})
process.exit(result.status ?? 1)
