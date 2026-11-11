// Load every staff page as each role and print only PASS/FAIL per page.
// Usage: CRAWL_BASE=http://localhost:3962 CRAWL_LOGINS=/path/to/logins.json node scripts/r6-crawl.mjs [roles...]
// CRAWL_LOGINS is a JSON file { "<role>": { "email": "...", "password": "..." } } kept outside the repo.
import fs from 'node:fs'
import { chromium } from '/Users/junaid/Code/vibeghost/vibeghost/node_modules/playwright/index.mjs'

const BASE = process.env.CRAWL_BASE
const people = JSON.parse(fs.readFileSync(process.env.CRAWL_LOGINS, 'utf8'))
const roles = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(people)
const OUT = process.env.CRAWL_OUT

async function gql(query, variables, cookie) {
  const r = await fetch(BASE + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ query, variables }) })
  return r.json()
}
async function token(who) {
  const p = people[who]
  const r = await gql('mutation($e:String!,$p:String!){authenticateUserWithPassword(email:$e,password:$p){... on UserAuthenticationWithPasswordSuccess{sessionToken}}}', { e: p.email, p: p.password })
  return r.data?.authenticateUserWithPassword?.sessionToken
}

const own = await token(process.env.CRAWL_OWNER || 'owner_admin')
const cookie = 'keystonejs-session=' + own
const dr = await gql(`{residents(take:1){id} communities(take:1){id slug}}`, {}, cookie)
if (!dr.data) { console.log('CHECK crawl id lookup: FAIL'); process.exit(1) }
const resident = dr.data.residents[0]?.id
const slug = dr.data.communities[0]?.slug
const sections = ['census', 'census/midnight', 'census/residents', 'census/events', 'compliance', 'sales', 'sales/waitlist', 'sales/storefront', 'approvals', 'audit', 'privacy/break-glass']
const paths = [
  ...sections.map(s => `/dashboard/platform/${s}`),
  ...sections.map(s => `/dashboard/platform/${s}?community=${slug}`),
  `/dashboard/platform/census/residents/${resident}`,
  '/dashboard',
  '/dashboard/residents', '/dashboard/communities', '/dashboard/users',
]
const notFound = ['/dashboard/platform/census/residents/nope123', '/dashboard/residents/nope123']
if (OUT) fs.writeFileSync(OUT + '-ids.json', JSON.stringify({ resident, slug }, null, 1))

const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
const res = {}
let bad = 0
for (const role of roles) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
  const p = await ctx.newPage()
  await ctx.addCookies([{ name: 'keystonejs-session', value: await token(role), url: BASE }])
  for (const path of [...paths, ...notFound]) {
    // A load that never completes (no response at all) is retried once; a real status, including 5xx, is never retried.
    let r = await p.goto(BASE + path, { waitUntil: 'load', timeout: 60000 }).catch(() => null)
    if (!r) r = await p.goto(BASE + path, { waitUntil: 'load', timeout: 90000 }).catch(() => null)
    await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined)
    const txt = await p.evaluate(() => document.body.innerText).catch(() => '')
    const http = r?.status() ?? 0
    const broken = /this page could not be loaded|something went wrong|application error|QUERY_TOO_BROAD|too broad|Unable to complete/i.test(txt)
    const expect404 = notFound.includes(path)
    // A role without access to a screen may legitimately get 404/403/redirect; a 5xx or a broken render never passes.
    const ok = expect404 ? http === 404 : http < 500 && http !== 0 && !broken
    res[`${role} ${path}`] = { http, broken }
    if (!ok) bad++
    console.log(`CHECK ${role} ${path}: ${ok ? 'PASS' : 'FAIL'} (${http})`)
  }
  await ctx.close()
}
await b.close()
if (OUT) fs.writeFileSync(OUT + '.json', JSON.stringify(res, null, 1))
console.log(`CHECK all staff pages: ${bad ? 'FAIL' : 'PASS'} (${Object.keys(res).length} loads, ${bad} failed)`)
