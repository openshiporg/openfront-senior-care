import { describe, expect, it } from 'vitest'
import { addDays } from '../lib/calendar'
import { countCoveredDays, counterSummary, noticeState, qualifyingStay, nextReviewDue, hospiceRoomBoardDays } from './medicare'

const range = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i))

describe('Medicare Part A benefit period', () => {
  it('a stay through day 101: 20 full days, 80 coinsurance days, day 101 not covered', () => {
    const days = countCoveredDays(range('2026-01-05', 101))
    const s = counterSummary(days)
    expect(s).toMatchObject({ fullDaysUsed: 20, coinsuranceDaysUsed: 80, exhaustedDays: 1, lastCountedDay: 101 })
    expect(days[19]).toMatchObject({ n: 20, bucket: 'full', date: '2026-01-24' })
    expect(days[20]).toMatchObject({ n: 21, bucket: 'coinsurance', date: '2026-01-25' })
    expect(days[99]).toMatchObject({ n: 100, bucket: 'coinsurance', date: '2026-04-14' })
    expect(days[100]).toMatchObject({ n: 101, bucket: 'exhausted', date: '2026-04-15' })
  })
  it('counts days already used in the spell elsewhere (prior SNF days evidence)', () => {
    const days = countCoveredDays(range('2026-02-01', 10), { priorDaysUsed: 15 })
    expect(days.filter(d => d.bucket === 'full')).toHaveLength(5)
    expect(days[5]).toMatchObject({ n: 21, bucket: 'coinsurance' })
  })
  it('60 days out of care start a new benefit period; 59 do not', () => {
    const first = range('2026-01-01', 30)
    const late = countCoveredDays([...first, ...range(addDays('2026-01-30', 61), 5)])
    expect(late[30]).toMatchObject({ n: 1, spell: 2 })
    const early = countCoveredDays([...first, ...range(addDays('2026-01-30', 60), 5)])
    expect(early[30]).toMatchObject({ n: 31, spell: 1 })
  })
})

describe('NOMNC two-day clock (computed on read)', () => {
  it('is due two calendar days before the last covered day', () => {
    expect(noticeState('2026-03-20', null, '2026-03-17')).toMatchObject({ dueBy: '2026-03-18', status: 'due', daysLeft: 1 })
    expect(noticeState('2026-03-20', null, '2026-03-19')).toMatchObject({ status: 'overdue', daysLeft: -1 })
    expect(noticeState('2026-03-20', '2026-03-18', '2026-03-25').status).toBe('delivered_in_time')
    expect(noticeState('2026-03-20', '2026-03-19', '2026-03-25').status).toBe('delivered_late')
  })
})

describe('qualifying stay, MA concurrent review, hospice', () => {
  it('needs 3 inpatient days, admission within 30 days and evidence', () => {
    expect(qualifyingStay({ inpatientFrom: '2026-01-01', inpatientTo: '2026-01-04', snfAdmission: '2026-01-04', hasEvidence: true }).ok).toBe(true)
    expect(qualifyingStay({ inpatientFrom: '2026-01-01', inpatientTo: '2026-01-03', snfAdmission: '2026-01-03', hasEvidence: true }).ok).toBe(false)
    expect(qualifyingStay({ inpatientFrom: '2026-01-01', inpatientTo: '2026-01-04', snfAdmission: '2026-02-04', hasEvidence: true }).ok).toBe(false)
    expect(qualifyingStay({ inpatientFrom: '2026-01-01', inpatientTo: '2026-01-04', snfAdmission: '2026-01-05', hasEvidence: false }).problems).toHaveLength(1)
  })
  it('next review is the interval after the last review, capped at the authorised end', () => {
    expect(nextReviewDue({ authFrom: '2026-03-01', authTo: '2026-03-14', intervalDays: 7 })).toBe('2026-03-08')
    expect(nextReviewDue({ authFrom: '2026-03-01', authTo: '2026-03-14', lastReviewOn: '2026-03-10', intervalDays: 7 })).toBe('2026-03-14')
  })
  it('hospice room and board covers only the election days', () => {
    expect(hospiceRoomBoardDays({ from: '2026-03-03', to: '2026-03-04' }, range('2026-03-01', 6))).toEqual(['2026-03-03', '2026-03-04'])
  })
})
