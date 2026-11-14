import { actorFromSession, type Actor } from '../lib/actor'
import type { Db } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { assertCommunityAccess } from '../mutations/run'
import { auditRead } from '../mutations/reads'
import { pbjExportFile } from '../pbj/service'
import { payrollFile } from '../scheduling/service'

/**
 * Export buttons (manual export, nothing is transmitted from here). Each download checks the permission and the community,
 * and a file that names a resident writes a PhiReadAudit row before any byte leaves.
 */
export type ExportKind = 'claim' | 'pbj' | 'nhsn' | 'payroll'
export type ExportFile = { body: string; fileName: string; contentType: string }

function staff(session: unknown, permission: string): Actor & { kind: 'user' } {
  if ((session as { data?: { kind?: string } })?.data?.kind === 'portal') throw new DomainError(Codes.NOT_AUTHORIZED, 'This needs staff access.')
  const actor = actorFromSession(session as never)
  if (actor.kind !== 'user' || !actor.permissions.has(permission as never)) throw new DomainError(Codes.NOT_AUTHORIZED, 'You do not have access to this export.')
  return actor as Actor & { kind: 'user' }
}

export async function exportDownload(db: Db, session: unknown, kind: ExportKind, id: string): Promise<ExportFile> {
  if (kind === 'claim') {
    const actor = staff(session, 'canManageClaims')
    const row = await db.claim.findUnique({ where: { id }, select: { communityId: true, residentId: true, reference: true, exportText: true, exportHash: true } })
    if (!row?.communityId) throw new DomainError(Codes.NOT_FOUND, 'Claim not found.')
    await assertCommunityAccess(db as never, actor, row.communityId)
    if (!row.exportText) throw new DomainError(Codes.GUARD_FAILED, 'Export the claim first; there is no file yet.', { reason: 'not_exported' })
    await auditRead({ prisma: db, session } as never, actor, 'claimExportDownload', row.residentId ? [row.residentId] : [])
    return { body: row.exportText, fileName: `${row.reference}.837`, contentType: 'application/edi-x12' }
  }
  if (kind === 'payroll') {
    const actor = staff(session, 'canApproveTimecards')
    const file = await payrollFile(db as never, id)
    await assertCommunityAccess(db as never, actor, file.communityId)
    return { body: file.csv, fileName: file.fileName, contentType: 'text/csv; charset=utf-8' }
  }
  if (kind === 'pbj') {
    const actor = staff(session, 'canSubmitRegulatory')
    const quarter = await db.pbjQuarter.findUnique({ where: { id }, select: { communityId: true } })
    if (!quarter?.communityId) throw new DomainError(Codes.NOT_FOUND, 'Quarter not found.')
    await assertCommunityAccess(db as never, actor, quarter.communityId)
    const file = await pbjExportFile(db as never, id)
    return { body: file.xml, fileName: file.fileName, contentType: 'application/xml' }
  }
  const actor = staff(session, 'canSubmitRegulatory')
  const row = await db.nhsnExport.findUnique({ where: { id }, select: { communityId: true, csv: true, reference: true, weekStart: true } })
  if (!row?.communityId) throw new DomainError(Codes.NOT_FOUND, 'Export not found.')
  await assertCommunityAccess(db as never, actor, row.communityId)
  if (!row.csv) throw new DomainError(Codes.GUARD_FAILED, 'This week has problems to fix; there is no file.', { reason: 'no_file' })
  return { body: row.csv, fileName: `${row.reference}-${row.weekStart?.toISOString().slice(0, 10)}.csv`, contentType: 'text/csv' }
}
