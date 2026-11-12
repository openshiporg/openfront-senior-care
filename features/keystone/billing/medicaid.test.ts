import { describe, expect, it } from 'vitest'
import { liabilityClocks } from './medicaid'

describe('Medicaid liability clocks are computed on read', () => {
  const base = { infoRequestedOn: null, infoRespondedOn: null, noticeReceivedOn: null, appealFiledOn: null, status: 'expected' }

  it('has no clock until something starts one', () => {
    expect(liabilityClocks(base, '2026-11-12')).toEqual([])
  })

  it('runs the information-request clock for 10 days: overdue the day after, done once answered', () => {
    const asked = liabilityClocks({ ...base, infoRequestedOn: '2026-11-01', status: 'determined' }, '2026-11-12')
    expect(asked.find(c => c.name === 'info_response')).toMatchObject({ state: 'overdue', dueBy: '2026-11-11', daysLeft: -1 })
    expect(liabilityClocks({ ...base, infoRequestedOn: '2026-11-01', status: 'determined' }, '2026-11-11').find(c => c.name === 'info_response')).toMatchObject({ state: 'open', daysLeft: 0 })
    expect(liabilityClocks({ ...base, infoRequestedOn: '2026-11-01', infoRespondedOn: '2026-11-05', status: 'determined' }, '2026-11-12').find(c => c.name === 'info_response')?.state).toBe('done')
  })

  it('runs the appeal clock for 90 days from the notice, and stops it once an appeal is filed', () => {
    const notice = liabilityClocks({ ...base, noticeReceivedOn: '2026-11-01', status: 'determined' }, '2026-11-12')
    expect(notice.find(c => c.name === 'appeal')).toMatchObject({ state: 'open', dueBy: '2027-01-30', daysLeft: 79 })
    expect(liabilityClocks({ ...base, noticeReceivedOn: '2026-11-01', status: 'determined' }, '2027-02-01').find(c => c.name === 'appeal')?.state).toBe('overdue')
    expect(liabilityClocks({ ...base, noticeReceivedOn: '2026-11-01', appealFiledOn: '2026-12-01', status: 'appealed' }, '2027-02-01').find(c => c.name === 'appeal')?.state).toBe('done')
  })
})
