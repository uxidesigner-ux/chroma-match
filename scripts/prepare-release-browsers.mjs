import { spawnSync } from 'node:child_process'

// The existing Pages workflow installs Chromium. Add WebKit on that same CI
// runner so its unchanged `npm run test:release` command verifies both engines.
// Local verification uses the already-installed browsers, without downloads.
if (process.env.CI) {
  const result = spawnSync('npx', ['playwright', 'install', '--with-deps', 'webkit'], { stdio: 'inherit' })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}
