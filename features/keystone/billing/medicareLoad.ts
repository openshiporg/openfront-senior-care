import type { Tx } from '../lib/db'
import { addDays } from '../lib/calendar'
import type { DerivationInput } from './derive'
import type { MedicareRatesIn, MedicareStayIn } from './medicare'
import { minorOf } from '../lib/money'
import { toScale } from '../lib/decimal'

/**
 * Reads what the Part A and hospice billing needs for one month: every Medicare A coverage of the residents billed (all
 * their stays here, for the benefit count and interrupted stays), the current PDPM classifications, the prior-days evidence,
 * the reference rates and the hospice pass-through shares. The derivation itself stays pure (derive.ts).
 */
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)
const day = (date: string) => new Date(`${date}T00:00:00Z`)

export async function loadMedicareInput(tx: Tx, communityId: string, month: string, monthEndDate: string, days: DerivationInput['days']): Promise<Pick<DerivationInput, 'medicare' | 'hospice'>> {
  const medicareStays = [...new Set(days.filter(d => d.payerKind === 'medicare_a').map(d => d.stayId))]
  const hospiceCoverages = [...new Set(days.filter(d => d.payerKind === 'hospice_agency' && d.coverageId).map(d => d.coverageId!))]
  const out: Pick<DerivationInput, 'medicare' | 'hospice'> = {}

  if (hospiceCoverages.length) {
    const rows = await tx.coveragePeriod.findMany({ where: { id: { in: hospiceCoverages } }, select: { id: true, hospiceRoomBoardBps: true } })
    out.hospice = Object.fromEntries(rows.map(r => [r.id, { roomBoardBps: r.hospiceRoomBoardBps ?? 9500 }]))
  }
  if (!medicareStays.length) return out

  const stays = await tx.stay.findMany({ where: { id: { in: medicareStays } }, select: { id: true, residentId: true } })
  const residentIds = [...new Set(stays.map(s => s.residentId).filter((id): id is string => Boolean(id)))]
  const [coverages, classifications, prior, rates, community] = await Promise.all([
    tx.coveragePeriod.findMany({
      where: { stay: { residentId: { in: residentIds }, communityId }, payer: { kind: 'medicare_a' }, status: { in: ['active', 'ending', 'ended', 'retro_approved'] }, startDate: { lte: day(monthEndDate) } },
      select: { id: true, stayId: true, startDate: true, endDate: true, qualifyingStayFrom: true, qualifyingStayTo: true, qualifyingStayEvidenceId: true, qualifyingStayEvidenceNote: true, skilledCertSignedAt: true, stay: { select: { residentId: true } } },
      orderBy: { startDate: 'asc' },
    }),
    tx.pdpmClassification.findMany({ where: { residentId: { in: residentIds }, status: 'current', effectiveFrom: { lte: day(monthEndDate) } }, select: { id: true, residentId: true, stayId: true, effectiveFrom: true, hipps: true, cmi: true, groups: true } }),
    tx.priorSnfDaysObservation.findMany({ where: { residentId: { in: residentIds } }, orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }], select: { residentId: true, daysUsed: true, asOf: true } }),
    tx.referenceRate.findMany({ where: { effectiveFrom: { lte: day(month) }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: day(month) } }] }, orderBy: { effectiveFrom: 'desc' }, include: { mappingVersion: { select: { code: true } } } }),
    tx.community.findUnique({ where: { id: communityId }, select: { identifiers: true } }),
  ])

  // Rates: the community's geography (identifiers.pdpmGeography, default 'urban') and CBSA wage index (identifiers.cbsa).
  const ids = (community?.identifiers ?? {}) as { pdpmGeography?: string; cbsa?: string }
  const geography = ids.pdpmGeography === 'rural' ? 'rural' : 'urban'
  const pick = (component: string, geo = geography) => rates.find(r => r.component === component && r.geography === geo)
  const comp = ['pt', 'ot', 'slp', 'nursing', 'nta', 'non_case_mix'].map(c => pick(c))
  const wage = ids.cbsa ? pick('wage_index', ids.cbsa) : undefined
  const coins = pick('snf_coinsurance', 'national')
  let ratesIn: MedicareRatesIn | null = null
  if (comp.every(Boolean) && coins) {
    const [pt, ot, slp, nursing, nta, ncm] = comp.map(r => r!.rate!.toString())
    ratesIn = {
      rates: { pt, ot, slp, nursing, nta, nonCaseMix: ncm }, laborShare: comp[0]!.laborShare?.toString() ?? '0.702', wageIndex: wage?.rate?.toString() ?? '1',
      coinsuranceMinor: minorOf(toScale(coins.rate!.toString(), 2).replace('.', '')), version: comp[0]!.mappingVersion?.code ?? 'unversioned',
    }
  }

  const medicareStaysIn: MedicareStayIn[] = []
  const coverageFlags: Record<string, { qualifyingStayOk: boolean; skilledCertOk: boolean }> = {}
  for (const stay of stays) {
    const own = coverages.filter(c => c.stay?.residentId === stay.residentId)
    const stretches = own.map(c => ({ from: iso(c.startDate)!, to: c.endDate ? addDays(iso(c.endDate)!, -1) : null }))
    for (const c of own) coverageFlags[c.id] = { qualifyingStayOk: Boolean(c.qualifyingStayFrom && c.qualifyingStayTo && (c.qualifyingStayEvidenceId || c.qualifyingStayEvidenceNote)), skilledCertOk: Boolean(c.skilledCertSignedAt) }
    const firstStretch = stretches[0]?.from ?? month
    const priorRow = prior.find(p => p.residentId === stay.residentId && iso(p.asOf)! <= firstStretch)
    medicareStaysIn.push({
      stayId: stay.id, stretches, priorDaysUsed: priorRow?.daysUsed ?? 0,
      classifications: classifications.filter(c => c.residentId === stay.residentId).map(c => ({ id: c.id, effectiveFrom: iso(c.effectiveFrom)!, hipps: c.hipps ?? '', cmi: c.cmi as never, aids: Boolean((c.groups as { aids?: boolean } | null)?.aids) })),
      qualifyingStayOk: true, skilledCertOk: true,
    })
  }
  out.medicare = { stays: medicareStaysIn.sort((a, b) => (a.stayId < b.stayId ? -1 : 1)), rates: ratesIn, coverages: coverageFlags }
  return out
}
