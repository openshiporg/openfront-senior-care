import { describe, expect, it } from 'vitest'
import { caaTriggers } from './caa'
import { crc32, parseFvr, recordXml, sha256Hex, unzipStored, zipStored } from './exportFile'
import { A0310, ITEM_SETS, itemSetFor, unsignedSections } from './itemSet'
import { ipaAllowed, mdsWindows } from './schedule'
import { batchEdits, runSpecEdits } from './specEdits'
import { classify } from '../pdpm/classify'
import { mdsToPdpmInput } from '../pdpm/mapMds'

/** Fictional residents only. */
const v120 = itemSetFor(ITEM_SETS, '2026-01-10')!

const fiveDay = (over: Record<string, string> = {}): Record<string, string> => ({
  ...Object.fromEntries(Object.entries(A0310.pps_5day).map(([k, v]) => [`A0310${k}`, v])),
  A0500A: 'Ada', A0500C: 'Quill', A0900: '19410302', A0800: '2', A1600: '20260105', A2300: '20260109', A2400A: '1', A2400B: '20260105',
  C0100: '1', C0500: '14', GG0130A1: '03', GG0130B1: '03', GG0130C1: '03', GG0170B1: '03', GG0170C1: '03', GG0170D1: '03', GG0170E1: '03', GG0170F1: '03', GG0170I1: '03', GG0170J1: '03', GG0170K1: '03',
  I0020: '01', I0020B: 'Z96.641', Z0500B: '20260110', ...over,
})

describe('item sets by ARD', () => {
  it('the ARD picks the version, not the day it is typed', () => {
    expect(itemSetFor(ITEM_SETS, '2025-09-30')!.itemSetVersion).toBe('1.19.1')
    expect(itemSetFor(ITEM_SETS, '2025-10-01')!.itemSetVersion).toBe('1.20.1')
    expect(itemSetFor(ITEM_SETS, '2024-01-01')).toBeNull()
  })
  it('every section must be signed before completion; tracking records carry A and Z only', () => {
    expect(unsignedSections('entry', v120, [])).toEqual(['A', 'Z'])
    expect(unsignedSections('pps_5day', v120, [{ userId: 'u', name: 'N', title: 'RN', sections: ['A', 'B', 'C', 'D', 'E', 'GG', 'H', 'I', 'J', 'K', 'M', 'N', 'O', 'P', 'Q'], signedOn: '2026-01-10' }])).toEqual(['Z'])
  })
})

describe('spec edits', () => {
  it('a complete 5-day passes', () => {
    expect(runSpecEdits('pps_5day', fiveDay(), v120).fatal).toEqual([])
  })
  it('format, range, skip and consistency edits are fatal', () => {
    const r = runSpecEdits('pps_5day', fiveDay({ A2300: '20260230', C0500: '', GG0130A1: '11', I0020B: 'U07', A0310A: '01' }), v120)
    const codes = r.fatal.map(f => `${f.item}:${f.code}`).sort()
    expect(codes).toEqual(['A0310A:consistency', 'A2300:format', 'C0500:skip', 'GG0130A1:range', 'I0020B:format'].sort())
    expect(runSpecEdits('pps_5day', fiveDay({ Z0500B: '20260108' }), v120).fatal.map(f => `${f.item}:${f.code}`)).toEqual(['Z0500B:consistency'])
    expect(runSpecEdits('pps_5day', fiveDay({ A2300: '20260104' }), v120).fatal.map(f => `${f.item}:${f.code}`)).toEqual(['A2300:consistency'])
  })
  it('a 5-day without a Medicare stay fails', () => {
    expect(runSpecEdits('pps_5day', fiveDay({ A2400A: '0' }), v120).fatal.map(f => f.item)).toContain('A2400A')
  })
})

describe('the iQIES export file', () => {
  const header = { facilityId: '366427', stateCode: 'OH', softwareVendor: 'Openfront', softwareName: 'Openfront Senior Care', softwareVersion: '4a' }
  it('only records that pass the spec edits go in; the file is a valid stored ZIP with the same hash every time', () => {
    const records = [{ reference: 'MDS-000001', kind: 'pps_5day', items: fiveDay(), correctionNumber: 0 }, { reference: 'MDS-000002', kind: 'pps_5day', items: fiveDay({ A0500A: 'Bram', A0500C: 'Okafor & Sons <test>' }), correctionNumber: 1 }]
    expect(batchEdits(records, v120)).toEqual([])
    const files = records.map(r => ({ name: `${r.reference}_NP.xml`, content: recordXml(r, v120, header) }))
    const zip = zipStored(files)
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50)
    const back = unzipStored(zip)
    expect(back.map(f => f.name)).toEqual(['MDS-000001_NP.xml', 'MDS-000002_NP.xml'])
    expect(back.every(f => f.crcOk)).toBe(true)
    expect(back[1].content).toContain('<A0500C>Okafor &amp; Sons &lt;test&gt;</A0500C>')
    expect(back[1].content).toContain('<X0100>2</X0100>')
    expect(back[0].content).toContain('<ITM_SBST_CD>NP</ITM_SBST_CD>')
    expect(back[0].content).toContain('<ITM_SET_VRSN_CD>1.20.1</ITM_SET_VRSN_CD>')
    expect(sha256Hex(zipStored(files))).toBe(sha256Hex(zip))
    // The exported XML round-trips: the items read back from it pass the same edits.
    const items = Object.fromEntries([...back[0].content.matchAll(/<([A-Z][A-Z0-9]+)>([^<]*)<\/\1>/g)].filter(m => v120.items.some(i => i.id === m[1])).map(m => [m[1], m[2]]))
    expect(runSpecEdits('pps_5day', items, v120).fatal).toEqual([])
  })
  it('worksheet answers never leave the building', () => {
    const xml = recordXml({ reference: 'MDS-000003', kind: 'pps_5day', items: fiveDay({ NURSING_SCH: '1', SLP_COMORBIDITY: '1' }), correctionNumber: 0 }, v120, header)
    expect(xml).not.toContain('NURSING_SCH')
    expect(xml).not.toContain('SLP_COMORBIDITY')
  })
  it('crc32 matches the standard check value', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926)
  })
  it('the FVR is read per record: accepted, rejected with fatal edits, or not in the report', () => {
    const text = ['Final Validation Report', 'FAC_DOC_ID MDS-000001 Accepted  -1030 warning', 'FAC_DOC_ID MDS-000002 Rejected  -3804 fatal'].join('\n')
    expect(parseFvr(text, ['MDS-000001', 'MDS-000002', 'MDS-000009'])).toEqual([
      { reference: 'MDS-000001', status: 'accepted', edits: ['-1030'] },
      { reference: 'MDS-000002', status: 'rejected', edits: ['-3804'] },
      { reference: 'MDS-000009', status: 'not_found', edits: [] },
    ])
  })
})

describe('the MDS calendar (worked out on read)', () => {
  const facts = { entryDate: '2026-01-05', partA: [{ from: '2026-01-05', to: null }] }
  it('entry, admission and 5-day windows from the entry date', () => {
    const w = mdsWindows(facts, [], '2026-01-09')
    const by = Object.fromEntries(w.map(x => [x.kind, x]))
    expect(by.entry).toMatchObject({ ardFrom: '2026-01-05', completeBy: '2026-01-11', state: 'open' })
    expect(by.obra_admission).toMatchObject({ ardTo: '2026-01-18', state: 'open' })
    expect(by.pps_5day).toMatchObject({ ardFrom: '2026-01-05', ardTo: '2026-01-12', state: 'open' })
  })
  it('a missed 5-day is overdue; a done one is done', () => {
    expect(mdsWindows(facts, [], '2026-02-01').find(w => w.kind === 'pps_5day')!.state).toBe('overdue')
    expect(mdsWindows(facts, [{ kind: 'pps_5day', ardDate: '2026-01-09', status: 'completed' }], '2026-02-01').find(w => w.kind === 'pps_5day')!.state).toBe('done')
    // ARD set in the window: open until the completion date (ARD + 14), then overdue.
    const started = [{ kind: 'pps_5day', ardDate: '2026-01-09', status: 'in_progress' }]
    expect(mdsWindows(facts, started, '2026-01-20').find(w => w.kind === 'pps_5day')!.state).toBe('open')
    expect(mdsWindows(facts, [], '2026-01-20').find(w => w.kind === 'pps_5day')!.state).toBe('overdue')
    expect(mdsWindows(facts, started, '2026-01-27').find(w => w.kind === 'pps_5day')!.state).toBe('overdue')
  })
  it('a quarterly within 92 days of the last OBRA; a PPS discharge when Part A ends and the resident stays', () => {
    const w = mdsWindows({ entryDate: '2026-01-05', partA: [{ from: '2026-01-05', to: '2026-02-20' }] }, [{ kind: 'obra_admission', ardDate: '2026-01-12', status: 'accepted' }], '2026-02-21')
    expect(w.find(x => x.kind === 'obra_quarterly')).toMatchObject({ ardTo: '2026-04-14' })
    expect(w.find(x => x.kind === 'pps_discharge')).toMatchObject({ ardFrom: '2026-02-20', completeBy: '2026-03-06', state: 'open' })
  })
  it('an IPA needs a done 5-day and an ARD inside Part A', () => {
    const recs = [{ kind: 'pps_5day', ardDate: '2026-01-09', status: 'completed' }]
    expect(ipaAllowed(facts, [], '2026-01-20').ok).toBe(false)
    expect(ipaAllowed(facts, recs, '2026-01-08').ok).toBe(false)
    expect(ipaAllowed(facts, recs, '2026-01-20').ok).toBe(true)
  })
})

describe('CAA triggers and the PDPM mapping from real item ids', () => {
  it('a comprehensive assessment triggers care areas; a PPS one does not', () => {
    const items = { C0500: '9', J1800: '1', M0210: '1', D0160: '12' }
    expect(caaTriggers('obra_admission', items).map(c => c.code)).toEqual([2, 9, 11, 16])
    expect(caaTriggers('pps_5day', items)).toEqual([])
  })
  it('the 5-day items above classify to the Ada Quill golden HIPPS', () => {
    expect(classify(mdsToPdpmInput(fiveDay()), 'five_day').hipps).toBe('CAXF1')
  })
  it('column-1 Section O items and I4500 count', () => {
    const input = mdsToPdpmInput(fiveDay({ O0110H1: '1', I4500: '1' }))
    expect(input.ntaConditions).toContain('iv_medication')
    expect(input.slpComorbidity).toBe(true)
  })
})
