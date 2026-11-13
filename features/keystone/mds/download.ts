import { actorFromSession } from '../lib/actor'
import type { Db } from '../lib/db'
import { DomainError, Codes } from '../lib/errors'
import { assertCommunityAccess } from '../mutations/run'
import { auditRead } from '../mutations/reads'
import { submissionFile } from './service'

/**
 * The iQIES download button (manual export, no transmission from here): the stored submission file, rebuilt and hash-checked.
 * The file names residents, so the read writes a PhiReadAudit row for every resident in it before any byte leaves.
 */
export async function mdsSubmissionDownload(db: Db, session: unknown, submissionId: string) {
  const actor = actorFromSession(session as never)
  if ((session as { data?: { kind?: string } })?.data?.kind === 'portal') throw new DomainError(Codes.NOT_AUTHORIZED, 'This needs MDS submission access.')
  if (actor.kind !== 'user' || !actor.permissions.has('canSubmitRegulatory') || !actor.permissions.has('canReadClinical')) throw new DomainError(Codes.NOT_AUTHORIZED, 'This needs MDS submission access.')
  const row = await db.mdsSubmission.findUnique({ where: { id: submissionId }, select: { communityId: true, assessments: { select: { residentId: true } } } })
  if (!row?.communityId) throw new DomainError(Codes.NOT_FOUND, 'Submission not found.')
  await assertCommunityAccess(db as never, actor, row.communityId)
  const file = await submissionFile(db as never, submissionId)
  const residents = [...new Set(row.assessments.map(a => a.residentId).filter((id): id is string => Boolean(id)))]
  await auditRead({ prisma: db, session } as never, actor, 'mdsSubmissionDownload', residents)
  return file
}
