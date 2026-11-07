import type { PrismaClient } from '@prisma/client'
import { permissionNames, NEVER_DEFAULT, type Permission } from '../../features/keystone/access'

/** A Keystone-shaped session for a user with exactly the given permissions. */
export const sessionFor = (id: string, granted: readonly Permission[], extra: Record<string, unknown> = {}) => ({
  itemId: id,
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
  ...extra,
})

/** Every permission a default role may carry (the Owner's set). */
export const ALL_DEFAULT = permissionNames.filter(p => !NEVER_DEFAULT.includes(p))

export type Ctx = { session: unknown; prisma: PrismaClient }
export const ctx = (prisma: PrismaClient, id: string, granted: readonly Permission[], extra: Record<string, unknown> = {}): Ctx => ({ session: sessionFor(id, granted, extra), prisma })
