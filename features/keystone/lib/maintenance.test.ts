import { beforeEach, describe, expect, it, vi } from 'vitest'

const runDueJobs = vi.fn()
vi.mock('./jobs', () => ({ runDueJobs: (...args: unknown[]) => runDueJobs(...args) }))

import { advanceTimedStates } from './maintenance'

const db = {} as never

describe('advanceTimedStates (no timer: runs on the request that touches the records)', () => {
  beforeEach(() => {
    runDueJobs.mockReset()
    ;(globalThis as { seniorCareAdvance?: unknown }).seniorCareAdvance = undefined
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('runs the pass, and calls within five seconds share it', async () => {
    runDueJobs.mockResolvedValue({ errors: 0 })
    expect(await advanceTimedStates(db)).toEqual({ errors: 0 })
    expect(await advanceTimedStates(db)).toBeNull()
    expect(runDueJobs).toHaveBeenCalledTimes(1)
  })

  it('the staff Refresh button forces a pass', async () => {
    runDueJobs.mockResolvedValue({ errors: 0 })
    await advanceTimedStates(db)
    await advanceTimedStates(db, { force: true })
    expect(runDueJobs).toHaveBeenCalledTimes(2)
  })

  it('concurrent requests wait for the one pass in flight instead of repeating it', async () => {
    let release!: () => void
    runDueJobs.mockImplementation(() => new Promise(resolve => { release = () => resolve({ errors: 0 }) }))
    const first = advanceTimedStates(db)
    const second = advanceTimedStates(db)
    release()
    await Promise.all([first, second])
    expect(runDueJobs).toHaveBeenCalledTimes(1)
  })

  it('a failed pass is logged and never fails the request that triggered it', async () => {
    runDueJobs.mockRejectedValue(new Error('database down'))
    expect(await advanceTimedStates(db)).toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  it('there is no instrumentation timer left', async () => {
    const { existsSync } = await import('node:fs')
    expect(existsSync(new URL('../../../instrumentation.ts', import.meta.url))).toBe(false)
  })
})
