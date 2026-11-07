import { anyOf, hasPermission, isStaff, type Permission, type Session } from '../access'

/**
 * Assignment-based access (SCHEMA §0.1 `asg`, DOMAIN I-PR2). Staff see rows only for communities
 * they hold an active StaffAssignment in. Operator administrators (`canManageOperator`) see every
 * community. The assignment set is read once per request.
 */

const cache = new WeakMap<object, Promise<string[] | 'all'>>()

export function assignedCommunities(session: Session | undefined | null, context: any): Promise<string[] | 'all'> {
  if (!session || !isStaff({ session })) return Promise.resolve([])
  if (hasPermission(session, 'canManageOperator')) return Promise.resolve('all')
  const hit = cache.get(session)
  if (hit) return hit
  const promise = (async () => {
    const today = new Date()
    const rows = await context.sudo().prisma.staffAssignment.findMany({
      where: {
        userId: session.itemId,
        status: 'active',
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
      },
      select: { communityId: true },
    })
    return [...new Set<string>(rows.map((row: { communityId: string | null }) => row.communityId).filter(Boolean) as string[])]
  })()
  cache.set(session, promise)
  return promise
}

/** Builds `{ a: { b: { community: { id: { in: ids } } } } }` for a relationship path. */
export function communityWhere(path: readonly string[], ids: string[]) {
  let where: Record<string, unknown> = { id: { in: ids } }
  for (const key of [...path].reverse()) where = { [key]: where }
  return where
}

/** A row filter through `path` to Community (e.g. ['room', 'unit', 'community']). */
export const assignedFilter = (path: readonly string[]) => async ({ session, context }: { session?: Session; context: any }) => {
  const scope = await assignedCommunities(session, context)
  if (scope === 'all') return true
  return communityWhere(path, scope)
}

type Rule = (args: any) => boolean
const rule = (permission: Permission | Permission[]): Rule => (Array.isArray(permission) ? anyOf(...permission) : anyOf(permission))
const sys = () => false

/** Community-scoped list written only by server commands. */
export const scopedGoverned = (read: Permission | Permission[], path: readonly string[]) => ({
  operation: { query: rule(read), create: sys, update: sys, delete: sys },
  filter: { query: assignedFilter(path) },
})

/** Community-scoped reference data edited directly by `write` holders (never deleted). */
export const scopedManaged = (read: Permission | Permission[], write: Permission | Permission[], path: readonly string[]) => ({
  operation: { query: rule(read), create: rule(write), update: rule(write), delete: sys },
  filter: { query: assignedFilter(path), update: assignedFilter(path) },
})
