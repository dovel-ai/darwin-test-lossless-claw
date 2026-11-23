// Watches Darwin on this repository. Every change the fixture made must be handled within config.deadlineHours:
//   - a dependency the simulated developer added at an old release, or a release of config.library: proposed in a
//     Darwin pull request (with a code change when the change needs a migration), merged, or held with a reason the
//     console shows for that release or a newer one;
//   - a retired provider API or a deprecated member the developer's code calls: a Darwin provider/deprecation fix.
// It also checks that Darwin never marks a pull request ready while its CI fails (the latest run of each check), never
// edits a test's expectation to make a behaviour change pass, never proposes a release again after a person closed it
// twice, that no run is stuck, and that the console (Darwin's API, read-only agent token) agrees with GitHub.
//
// Env: GH_TOKEN, REPO (owner/name); for the console DARWIN_API, DARWIN_TOKEN, DARWIN_WORKSPACE. Settings in
// config.json. Writes the report to REPORT (markdown) and STATE (json); exits 1 on a failure.
import { readFileSync, writeFileSync } from 'node:fs'

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'))
const env = name => process.env[name] ?? ''
const REPO = env('REPO')
const ECOSYSTEM = config.ecosystem
const LIB = config.library ?? ''
const LIB_MODULE = LIB === '' ? '' : `github.com/${LIB}`
const DEADLINE_MS = Number(config.deadlineHours ?? 48) * 3600_000
const STUCK_MS = 6 * 3600_000
const now = Date.now()

async function gh(path, accept = 'application/vnd.github+json') {
  const response = await fetch(`https://api.github.com/${path}`, { headers: { authorization: `Bearer ${env('GH_TOKEN')}`, accept, 'x-github-api-version': '2022-11-28' } })
  if (!response.ok) throw new Error(`GitHub ${path}: ${response.status} ${(await response.text()).slice(0, 200)}`)
  return accept.includes('json') ? response.json() : response.text()
}
async function ghAll(path) {
  const items = []
  for (let page = 1; page <= 10; page += 1) {
    const batch = await gh(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
    items.push(...batch)
    if (batch.length < 100) break
  }
  return items
}
async function darwin(path) {
  const response = await fetch(`${env('DARWIN_API').replace(/\/$/u, '')}${path}`, { headers: { authorization: `Bearer ${env('DARWIN_TOKEN')}` } })
  if (!response.ok) throw new Error(`Darwin ${path}: ${response.status} ${(await response.text()).slice(0, 200)}`)
  return response.json()
}

// Versions: "v1.2.3", "1.2.3", "^1.2.3" -> [1,2,3]; anything else is unknown (null) and compares as nothing.
const parse = version => {
  const m = /^[\^~=v]*(\d+)\.(\d+)\.(\d+)/u.exec(String(version ?? '').trim())
  return m === null ? null : m.slice(1).map(Number)
}
const compare = (a, b) => { for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] - b[i]; return 0 }
const atLeast = (version, target) => { const [a, b] = [parse(version), parse(target)]; return a !== null && b !== null && compare(a, b) >= 0 }
const newer = (version, target) => { const [a, b] = [parse(version), parse(target)]; return a !== null && b !== null && compare(a, b) > 0 }

async function latestRelease(module) {
  try {
    if (ECOSYSTEM === 'npm') return (await (await fetch(`https://registry.npmjs.org/${module.replace('/', '%2F')}/latest`)).json()).version ?? null
    return (await (await fetch(`https://proxy.golang.org/${module.replace(/[A-Z]/gu, c => `!${c.toLowerCase()}`)}/@latest`)).json()).Version ?? null
  } catch { return null }
}

// What each Darwin pull request moves, from the update marker every Darwin update pull request carries.
const movesOf = body => {
  const marker = /<!-- dovel:update \S+ \S+ moves=([^\s]+) -->/u.exec(String(body ?? ''))?.[1]
  if (marker === undefined) return {}
  return Object.fromEntries(marker.split(',').map(item => { const at = item.lastIndexOf('@'); return [item.slice(0, at), item.slice(at + 1)] }))
}
const isFix = body => /<!-- dovel:notice(?:-fix)? /u.test(String(body ?? ''))
const MANIFESTS = /(^|\/)(go\.mod|go\.sum|package\.json|package-lock\.json)$/u

const failures = []
const fail = (what, detail) => failures.push({ what, detail })

const repoInfo = await gh(`repos/${REPO}`)
const BRANCH = repoInfo.default_branch

// 1. What main declares.
const raw = path => gh(`repos/${REPO}/contents/${path}?ref=${BRANCH}`, 'application/vnd.github.raw')
let declared = {}
if (ECOSYSTEM === 'gomod') {
  const goMod = await raw('go.mod')
  declared = Object.fromEntries([...goMod.matchAll(/^\s*(?:require\s+)?([a-z0-9.\-_/]+\.[a-z]+\/[^\s]+)\s+(v[^\s]+)/gmu)].map(m => [m[1], m[2]]))
} else {
  const lock = JSON.parse(await raw('package-lock.json'))
  declared = Object.fromEntries(Object.entries(lock.packages ?? {}).filter(([path]) => /^node_modules\/(@[^/]+\/)?[^/]+$/u.test(path)).map(([path, info]) => [path.slice('node_modules/'.length), info.version]))
}

// 2. The changes the fixture made: the developer's commits (subject "fixture: add dependency <module> <version>",
// body lines "expect: ...", "notice: <identifier>", "deprecation: <member>", "family: a,b") and the library's releases.
const commits = await ghAll(`repos/${REPO}/commits?sha=${BRANCH}`)
const events = []
for (const commit of commits) {
  const lines = commit.commit.message.split('\n')
  if (!lines[0].startsWith('fixture: ')) continue
  const m = /^fixture: add dependency (\S+) (\S+)/u.exec(lines[0])
  const at = Date.parse(commit.commit.committer.date)
  const field = name => lines.filter(line => line.startsWith(`${name}: `)).map(line => line.slice(name.length + 2).trim())
  if (m !== null) events.push({ kind: 'dependency', module: m[1], version: m[2], at, url: commit.html_url, expect: field('expect'), family: field('family').flatMap(f => f.split(',')) })
  for (const id of field('notice')) events.push({ kind: 'notice', identifier: id, at, url: commit.html_url })
  for (const id of field('deprecation')) events.push({ kind: 'deprecation', identifier: id, at, url: commit.html_url })
}
const libAdded = events.find(event => event.kind === 'dependency' && event.module === LIB_MODULE)?.at
if (LIB !== '' && libAdded !== undefined) {
  for (const release of await ghAll(`repos/${LIB}/releases`)) {
    const at = Date.parse(release.created_at)
    if (at <= libAdded || parse(release.tag_name) === null) continue
    const change = JSON.parse(/<!-- darwin-fixture (\{.*\}) -->/u.exec(release.body ?? '')?.[1] ?? '{}')
    events.push({ kind: 'release', module: LIB_MODULE, version: release.tag_name, at, url: release.html_url, change, expect: change.breaking ? ['migration'] : [] })
  }
}

// 3. Darwin's pull requests, what they move and change, and their CI (the latest completed run of each check).
const pulls = (await ghAll(`repos/${REPO}/pulls?state=all`)).filter(pull => /darwin|dovel/iu.test(pull.user.login) && pull.user.type === 'Bot')
for (const pull of pulls) {
  pull.moves = movesOf(pull.body)
  pull.files = (pull.state === 'open' || isFix(pull.body)) ? await ghAll(`repos/${REPO}/pulls/${pull.number}/files`) : []
  if (pull.state !== 'open') continue
  const runs = (await gh(`repos/${REPO}/commits/${pull.head.sha}/check-runs?per_page=100`)).check_runs.filter(run => !/darwin|dovel/iu.test(run.name))
  const latest = new Map()
  for (const run of runs) {
    const seen = latest.get(run.name)
    if (seen === undefined || Date.parse(run.started_at ?? 0) > Date.parse(seen.started_at ?? 0)) latest.set(run.name, run)
  }
  const current = [...latest.values()]
  pull.ci = current.length === 0 ? 'none' : current.some(run => run.status !== 'completed') ? 'pending'
    : current.every(run => ['success', 'skipped', 'neutral'].includes(run.conclusion)) ? 'passed' : 'failed'
  if (!pull.draft && pull.ci === 'failed') fail(`#${pull.number} is ready for review with failing CI`, pull.html_url)
}
const codeChanged = pull => pull.files.some(file => !MANIFESTS.test(file.filename))

// 4. The console's view (optional: without a token the console is not checked).
let consoleUpdates = []
let consoleNote = 'not checked (no DARWIN_TOKEN)'
if (env('DARWIN_TOKEN') !== '') await checkConsole().catch(error => {
  consoleNote = 'could not be read'
  fail('the console could not be read', String(error.message).slice(0, 300))
})
async function checkConsole() {
  const ws = env('DARWIN_WORKSPACE')
  const repository = (await darwin(`/v1/workspaces/${ws}/repositories?limit=100`)).data.find(repo => repo.fullName.toLowerCase() === REPO.toLowerCase())
  if (repository === undefined) { fail('the console does not list this repository', REPO); return }
  const runs = (await darwin(`/v1/workspaces/${ws}/runs?repository=${repository.id}&limit=20`)).data
  for (const run of runs) {
    const started = Date.parse(run.startedAt ?? run.dispatchedAt ?? run.queuedAt)
    if (['queued', 'dispatched', 'running', 'publishing'].includes(run.status) && now - started > STUCK_MS) fail(`run ${run.id} is stuck in ${run.status}`, `since ${new Date(started).toISOString()}`)
  }
  const lastFinished = runs.find(run => ['succeeded', 'failed', 'cancelled'].includes(run.status))
  if (lastFinished?.status === 'failed') fail(`the last run failed: ${String(lastFinished.failure).slice(0, 200)}`, lastFinished.githubRunUrl ?? lastFinished.id)
  const consolePulls = (await darwin(`/v1/workspaces/${ws}/pull-requests?repository=${repository.id}&state=all&limit=100`)).data
  const byNumber = new Map(consolePulls.map(pull => [pull.number, pull]))
  for (const pull of pulls.filter(item => Object.keys(item.moves).length > 0)) {
    const shown = byNumber.get(pull.number)
    const state = pull.merged_at !== null ? 'merged' : pull.state === 'closed' ? 'closed' : pull.draft ? 'draft' : 'open'
    const settled = now - Date.parse(pull.updated_at) > 3600_000
    if (shown === undefined) { if (settled) fail(`the console does not show #${pull.number}`, pull.html_url) }
    else if (shown.state !== state && settled) fail(`the console shows #${pull.number} as ${shown.state}, GitHub as ${state}`, pull.html_url)
  }
  consoleUpdates = (await darwin(`/v1/workspaces/${ws}/updates?repository=${repository.id}&view=all&limit=100`)).data
  consoleNote = `${runs.length} recent runs (last: ${runs[0]?.status ?? 'none'}${runs[0]?.catchUp ? ', catch-up' : ''}), ${consolePulls.length} pull requests, ${consoleUpdates.length} updates`
}

// 5. A release a person closed twice is not proposed again (repository-memory.mjs HUMAN_REJECTIONS_BEFORE_STOP).
const reject = config.reject?.package
const rejections = []
if (reject !== undefined) {
  const own = pulls.filter(pull => Object.keys(pull.moves).length === 1 && pull.moves[reject] !== undefined).sort((a, b) => a.number - b.number)
  const byVersion = new Map()
  for (const pull of own) byVersion.set(pull.moves[reject], [...(byVersion.get(pull.moves[reject]) ?? []), pull])
  for (const [version, list] of byVersion) {
    const closed = list.filter(pull => pull.state === 'closed' && pull.merged_at === null)
    rejections.push(`${reject}@${version}: ${list.map(pull => `#${pull.number} ${pull.merged_at !== null ? 'merged' : pull.state}`).join(', ')}`)
    const afterTwo = list.slice(2).filter(pull => closed.slice(0, 2).length === 2 && Date.parse(pull.created_at) > Date.parse(closed[1].closed_at))
    for (const pull of afterTwo) fail(`#${pull.number} proposes ${reject}@${version} again after a person closed it twice`, pull.html_url)
  }
}

// 6. Each change: handled, waiting, or missed.
const latestOf = new Map()
const rows = []
for (const event of events.sort((a, b) => a.at - b.at)) {
  const age = now - event.at
  let status
  if (event.kind === 'notice' || event.kind === 'deprecation') {
    const fix = pulls.filter(pull => isFix(pull.body) && Date.parse(pull.created_at) > event.at && `${pull.title}\n${pull.body}`.includes(event.identifier)).sort((a, b) => a.number - b.number)[0]
    if (fix !== undefined) status = `${event.kind} fix in #${fix.number} (${fix.merged_at !== null ? 'merged' : fix.state}${fix.draft ? ', draft' : ''})`
    else if (age > DEADLINE_MS) { status = 'MISSED'; fail(`no ${event.kind} fix for ${event.identifier} within ${DEADLINE_MS / 3600_000} hours`, event.url) }
    else status = `waiting (${Math.round(age / 3600_000)} h old)`
    rows.push(`| ${new Date(event.at).toISOString().slice(0, 16)} | ${event.kind}: \`${event.identifier}\` | ${status} |`)
    continue
  }
  const present = declared[event.module]
  if (!latestOf.has(event.module)) latestOf.set(event.module, await latestRelease(event.module))
  const latest = latestOf.get(event.module)
  const reaches = version => event.kind === 'release' ? atLeast(version, event.version) : newer(version, event.version)
  const proposal = pulls.filter(pull => pull.state === 'open' && reaches(pull.moves[event.module])).sort((a, b) => b.number - a.number)[0]
  const update = consoleUpdates.find(item => item.name === event.module && Date.parse(item.checkedAt) > event.at && newer(item.latestVersion, event.version))
  const needsCode = event.expect?.includes('migration')
  if (newer(present, event.version) || (event.kind === 'release' && atLeast(present, event.version))) status = `merged (main has ${present})`
  else if (proposal !== undefined) {
    const migrated = codeChanged(proposal)
    status = `proposed in #${proposal.number}${needsCode ? (migrated ? ' with a code migration' : ' WITHOUT a code migration') : ''}, CI ${proposal.ci}${proposal.draft ? ', draft' : ''}`
    if (needsCode && !migrated && proposal.ci === 'passed') fail(`#${proposal.number} moves ${event.module} past a breaking change without changing code, yet CI passed`, proposal.html_url)
    if (event.expect?.includes('behavior')) {
      const testEdits = proposal.files.filter(file => /(^|\/)(test|tests)\/|_test\.go$|\.test\.ts$/u.test(file.filename) && file.status === 'modified')
      if (testEdits.length > 0) fail(`#${proposal.number} edits a test's expectation (${testEdits.map(file => file.filename).join(', ')}) for a behaviour change`, proposal.html_url)
    }
    for (const member of event.family ?? []) if (proposal.moves[member] === undefined && declared[member] !== undefined) status += `; does not move ${member} with it`
  } else if (update?.held != null) status = `held for ${update.latestVersion}: ${String(update.held.reason).slice(0, 160)}`
  else if (update?.retrying != null) status = `retrying ${update.latestVersion}: ${String(update.retrying.reason).slice(0, 160)}`
  else if (update?.withheld != null && update.withheld !== '') status = `withheld ${update.latestVersion}: ${String(update.withheld).slice(0, 160)}`
  else if (latest !== null && !newer(latest, event.version)) status = `nothing newer than ${event.version}`
  else if (event.kind === 'dependency' && present !== undefined && present !== event.version && !newer(present, event.version)) status = `moved to ${present} by someone else`
  else if (age > DEADLINE_MS) { status = 'MISSED'; fail(`${event.module} ${event.version} (${event.kind}${event.change?.op ? `, ${event.change.op}` : ''}) was not handled within ${DEADLINE_MS / 3600_000} hours`, event.url) }
  else status = `waiting (${Math.round(age / 3600_000)} h old)`
  const label = event.kind === 'release' ? `[${event.version}](${event.url}) ${event.change?.op ?? ''}${event.change?.breaking ? ' (breaking)' : ''}` : `added ${event.module} ${event.version}${event.expect?.length ? ` (${event.expect.join(', ')})` : ''}`
  rows.push(`| ${new Date(event.at).toISOString().slice(0, 16)} | ${label} | ${status} |`)
}

const open = pulls.filter(pull => pull.state === 'open')
const report = [
  `# Darwin fixture watch`, '',
  `Checked ${new Date(now).toISOString()}: ${failures.length === 0 ? 'everything handled or waiting' : `**${failures.length} failure(s)**`}.`, '',
  ...(LIB === '' ? [] : [`- ${LIB_MODULE}: main declares ${declared[LIB_MODULE] ?? 'nothing'}`]),
  `- Darwin pull requests: ${open.length} open (${open.filter(pull => pull.draft).length} draft), ${pulls.filter(pull => pull.merged_at !== null).length} merged, ${pulls.filter(pull => pull.state === 'closed' && pull.merged_at === null).length} closed`,
  `- Console: ${consoleNote}`,
  ...(rejections.length === 0 ? [] : [`- Rejected by the person: ${rejections.join('; ')}`]), '',
  ...(failures.length === 0 ? [] : ['## Failures', '', ...failures.map(item => `- ${item.what} (${item.detail})`), '']),
  '## Changes', '', '| When (UTC) | Change | Darwin |', '|---|---|---|', ...rows.reverse(), '',
].join('\n')
writeFileSync(env('REPORT') || 'watch-report.md', report)
writeFileSync(env('STATE') || 'watch-state.json', JSON.stringify({ checkedAt: new Date(now).toISOString(), failures }, null, 2))
process.stdout.write(report)
process.exitCode = failures.length === 0 ? 0 : 1
