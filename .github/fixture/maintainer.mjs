// A simulated person on the team Darwin proposes to. Every run:
//   - merges Darwin's pull requests Darwin marked ready (it does so only once CI passes), when GitHub says they merge
//     cleanly (an UNKNOWN merge state is asked again before it is skipped);
//   - reviews what Darwin held as a draft for a person (a model-edited migration, a major version, a provider or
//     deprecation fix): once its CI has passed for config.heldMergeAfterHours, marks it ready and merges it;
//   - rejects config.reject.package: closes a pull request that moves only that package, saying why, each time Darwin
//     opens one (Darwin retries a first rejection once; a second is final).
// Each decision is added as a comment to the open "Darwin fixture watch" issue. Pull requests that change workflow
// files are left for a real person: the job's GITHUB_TOKEN may not merge them.
//
// Env: GH_TOKEN, REPO; settings in config.json. Merges only while the repository variable FIXTURE_MAINTAINER_MERGES is
// 'true' (the workflow checks it).
import { readFileSync } from 'node:fs'

const config = JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8'))
const REPO = process.env.REPO
const HELD_MS = Number(config.heldMergeAfterHours ?? 24) * 3600_000
const now = Date.now()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function gh(method, path, body) {
  const response = await fetch(`https://api.github.com/${path}`, {
    method, headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 300)}`)
  return text === '' ? null : JSON.parse(text)
}
async function graphql(query, variables) {
  const result = await gh('POST', 'graphql', { query, variables })
  if (result.errors?.length) throw new Error(result.errors.map(error => error.message).join('; '))
  return result.data
}
const movesOf = body => {
  // <!-- dovel:update v=1 ecosystem=gomod directory=. moves=github.com%2Ftidwall%2Flotsa@v1.0.5,... -->: names are URL-encoded.
  const marker = /<!-- dovel:update [^>]*?moves=(\S+)/u.exec(String(body ?? ''))?.[1]
  if (marker === undefined) return {}
  return Object.fromEntries(marker.split(',').map(item => { const at = item.lastIndexOf('@'); return [decodeURIComponent(item.slice(0, at)), item.slice(at + 1)] }))
}

// The latest completed run of each check on the head commit, and since when all of them have passed.
async function ciOf(sha) {
  const runs = (await gh('GET', `repos/${REPO}/commits/${sha}/check-runs?per_page=100`)).check_runs.filter(run => !/darwin|dovel/iu.test(run.name))
  const latest = new Map()
  for (const run of runs) {
    const seen = latest.get(run.name)
    if (seen === undefined || Date.parse(run.started_at ?? 0) > Date.parse(seen.started_at ?? 0)) latest.set(run.name, run)
  }
  const current = [...latest.values()]
  if (current.length === 0) return { state: 'none' }
  if (current.some(run => run.status !== 'completed')) return { state: 'pending' }
  if (!current.every(run => ['success', 'skipped', 'neutral'].includes(run.conclusion))) return { state: 'failed' }
  return { state: 'passed', since: Math.max(...current.map(run => Date.parse(run.completed_at))) }
}

async function mergeState(number) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const pull = await gh('GET', `repos/${REPO}/pulls/${number}`)
    if (pull.mergeable_state !== 'unknown' && pull.mergeable !== null) return pull.mergeable_state
    await sleep(15_000)
  }
  return 'unknown'
}

const decisions = []
const pulls = (await gh('GET', `repos/${REPO}/pulls?state=open&per_page=100`)).filter(pull => /darwin|dovel/iu.test(pull.user.login) && pull.user.type === 'Bot')
for (const pull of pulls.sort((a, b) => a.number - b.number)) {
  const moves = movesOf(pull.body)
  const files = await gh('GET', `repos/${REPO}/pulls/${pull.number}/files?per_page=100`)
  const touchesWorkflows = files.some(file => file.filename.startsWith('.github/workflows/'))
  const reject = config.reject?.package
  if (reject !== undefined && Object.keys(moves).length === 1 && moves[reject] !== undefined) {
    await gh('POST', `repos/${REPO}/issues/${pull.number}/comments`, { body: config.reject.reason })
    await gh('PATCH', `repos/${REPO}/pulls/${pull.number}`, { state: 'closed' })
    decisions.push(`closed #${pull.number} (${reject}@${moves[reject]}), rejecting it: "${config.reject.reason}"`)
    continue
  }
  const ci = await ciOf(pull.head.sha)
  if (ci.state !== 'passed') { console.log(`#${pull.number}: CI ${ci.state}, left`); continue }
  const held = pull.draft
  if (held && (now - ci.since < HELD_MS || now - Date.parse(pull.created_at) < HELD_MS)) { console.log(`#${pull.number}: held, CI green for ${Math.round((now - ci.since) / 3600_000)} h, left`); continue }
  if (touchesWorkflows) { console.log(`#${pull.number}: changes workflow files, left for a real person`); continue }
  const state = await mergeState(pull.number)
  if (!['clean', 'unstable', 'has_hooks'].includes(state)) { decisions.push(`left #${pull.number}: GitHub's merge state is ${state}`); continue }
  try {
    if (held) await graphql('mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { pullRequest { isDraft } } }', { id: pull.node_id })
    await gh('PUT', `repos/${REPO}/pulls/${pull.number}/merge`, { merge_method: 'squash', sha: pull.head.sha })
    decisions.push(held ? `reviewed and merged #${pull.number}, which Darwin held for a person (CI green for ${Math.round((now - ci.since) / 3600_000)} h): ${pull.title}`
      : `merged #${pull.number}, which Darwin marked ready: ${pull.title}`)
    // The base moved: GitHub recomputes the other pull requests' merge state; until it has, it still says "clean".
    await sleep(30_000)
  } catch (error) {
    decisions.push(`could not merge #${pull.number}: ${String(error.message).slice(0, 200)}`)
  }
}

console.log(decisions.length === 0 ? 'Nothing to decide.' : decisions.join('\n'))
if (decisions.length > 0) {
  const issue = (await gh('GET', `repos/${REPO}/issues?state=open&per_page=100`)).find(item => item.title === 'Darwin fixture watch' && item.pull_request === undefined)
  const body = `Maintainer, ${new Date(now).toISOString().slice(0, 16)}Z:\n\n${decisions.map(line => `- ${line}`).join('\n')}`
  if (issue !== undefined) await gh('POST', `repos/${REPO}/issues/${issue.number}/comments`, { body })
}
