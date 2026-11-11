import { isStaff, permissions, type Permission, type Session } from '../access'
import { label } from '../../../lib/labels'
import { readOnly } from './domainFields'
import { breakGlassResidents, PHI_LISTS } from './phi'
import { assignedCommunities, communityWhere } from './scope'

export const sys = () => false
export const ro = readOnly
export const opt = (values: readonly string[]) => ({ type: 'string' as const, options: values.map(value => ({ label: label(value), value })) })

/** Rows of residents in the caller's assigned communities, plus residents under an active break-glass grant. */
const residentScope = (path: readonly string[], residentPath: readonly string[]) => async ({ session, context }: { session?: Session; context: any }) => {
  const scope = await assignedCommunities(session, context)
  if (scope === 'all') return true
  const glass = [...(await breakGlassResidents(session, context))]
  const own = communityWhere(path, scope)
  if (!glass.length) return own
  let glassWhere: Record<string, unknown> = { id: { in: glass } }
  for (const key of [...residentPath].reverse()) glassWhere = { [key]: glassWhere }
  return { OR: [own, glassWhere] }
}

/** `path` reaches Community; `residentPath` reaches Resident (empty for the Resident list itself). */
export const residentList = (path: readonly string[], residentPath: readonly string[] = ['resident'], read: Permission[] | null = null) => ({
  operation: { query: read ? ((args: any) => read.some(p => permissions[p](args))) : isStaff, create: sys, update: sys, delete: sys },
  filter: { query: residentScope(path, residentPath) },
})

export const phiList = (key: string) => {
  PHI_LISTS.add(key)
  return key
}
