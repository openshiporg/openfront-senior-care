import { describe, expect, it } from 'vitest'
import { amountText, parseAmount, parseX12 } from './x12'
import { detectKind, parse835, parse999, parse277CA } from './parsers'
import { frequencyFor, validMbi, validNpi } from './scrubber'

const ISA = (gs: string) => `ISA*00*          *00*          *ZZ*A              *ZZ*B              *261015*1200*^*00501*000000001*0*P*:~${gs}`

describe('x12 amounts are exact BigInt cents', () => {
  it('round-trips without floats', () => {
    for (const minor of [0n, 5n, 100n, 123456789n, 1999n]) expect(parseAmount(amountText(minor))).toBe(minor)
    expect(amountText(1050n)).toBe('10.5')
    expect(parseAmount('0.1') + parseAmount('0.2')).toBe(30n)
    expect(() => parseAmount('1.234')).toThrow()
  })
})

describe('response files', () => {
  it('reads a 999 accept and reject', () => {
    const ok = ISA('GS*FA*A*B*20261001*1200*1*X*005010X231A1~ST*999*0001~AK1*HC*1~AK9*A*1*1*1~SE*4*0001~GE*1*1~IEA*1*000000001~')
    const bad = ISA('GS*FA*A*B*20261001*1200*1*X*005010X231A1~ST*999*0001~AK1*HC*1~IK3*CLM*22**8~AK9*R*1*1*0~SE*5*0001~GE*1*1~IEA*1*000000001~')
    expect(detectKind(ok)).toBe('999')
    expect(parse999(ok).accepted).toBe(true)
    const r = parse999(bad)
    expect(r.accepted).toBe(false)
    expect(r.errors[0]).toContain('IK3')
  })
  it('reads 277CA accepts and rejections per claim', () => {
    const t = ISA('GS*HN*A*B*20261001*1200*1*X*005010X214~ST*277*0001~TRN*2*CLM-1~STC*A2:20:PR*20261001~REF*1K*PC1~TRN*2*CLM-2~STC*A3:21:PR*20261001***********Bad member id~SE*8*0001~GE*1*1~IEA*1*000000001~')
    const r = parse277CA(t)
    expect(r.claims.map(c => c.accepted)).toEqual([true, false])
    expect(r.claims[0].payerClaimNumber).toBe('PC1')
    expect(() => parse277CA(ISA('GS*HP*A*B*20261001*1200*1*X*005010X221A1~ST*835*0001~SE*2*0001~GE*1*1~IEA*1*000000001~'))).toThrow()
  })
  it('reads an 835 with CAS groups split into contractual, patient and other', () => {
    const t = ISA('GS*HP*A*B*20261015*1200*1*X*005010X221A1~ST*835*0001~BPR*I*800.00*C*CHK************20261015~TRN*1*T1*1512345678~N1*PR*MEDICARE~CLP*CLM-1*1*1000.00*800.00*100.00*MA*PC1~CAS*CO*45*60.00~CAS*PR*2*100.00~CAS*OA*23*40.00~SE*9*0001~GE*1*1~IEA*1*000000001~')
    const r = parse835(t)
    expect(r.traceNumber).toBe('T1')
    expect(r.totalPaidMinor).toBe(80000n)
    const c = r.claims[0]
    expect([c.paidMinor, c.contractualMinor, c.prMinor, c.otherMinor]).toEqual([80000n, 6000n, 10000n, 4000n])
    expect(c.paidMinor + c.contractualMinor + c.prMinor + c.otherMinor).toBe(c.billedMinor)
    expect(parseX12(t).segments.length).toBeGreaterThan(8)
  })
})

describe('scrubber primitives', () => {
  it('checks NPI check digits and MBI shape', () => {
    expect(validNpi('1487296539')).toBe(true)
    expect(validNpi('1487296530')).toBe(false)
    expect(validNpi('123')).toBe(false)
    expect(validMbi('1EG4TE5MK73')).toBe(true)
    expect(validMbi('1EG4TE5MK7S')).toBe(false)
  })
  it('chooses the type-of-bill frequency from the stay position in the month', () => {
    expect(frequencyFor({ firstMonth: true, lastMonth: false })).toBe('2')
    expect(frequencyFor({ firstMonth: false, lastMonth: false })).toBe('3')
    expect(frequencyFor({ firstMonth: false, lastMonth: true })).toBe('4')
    expect(frequencyFor({ firstMonth: true, lastMonth: true })).toBe('1')
  })
})
