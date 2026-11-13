import { hasPermission, isStaff, type Permission, type Session } from '../access'

/**
 * PHI tiers as field annotations (SCHEMA G8, DOMAIN §7.1). Every field of a resident-scoped list is
 * declared through phiFields(), which sets the field's read access from the tier policy and records
 * the field in PHI_REGISTRY. The PhiReadAudit classifier and the access tests read that registry, so
 * the tier sets are derived from the schema, never hand-listed.
 */

export const PHI_TIERS = ['pub', 'op', 'dem', 'clin', 'sens', 'ident', 'fin'] as const
export type PhiTier = (typeof PHI_TIERS)[number]

/** Tiers that are protected health information (a read writes a PhiReadAudit row). */
export const PROTECTED_TIERS: ReadonlySet<PhiTier> = new Set(['dem', 'clin', 'sens', 'ident', 'fin'])

/** Which permission reads each tier (in addition to list-level row filters). */
export const TIER_PERMISSIONS: Record<PhiTier, Permission[] | 'anyone' | 'staff'> = {
  pub: 'anyone',
  op: 'staff',
  dem: ['canReadResidentDemographics'],
  clin: ['canReadClinical'],
  sens: ['canReadSensitiveClinical'],
  ident: ['canReadIdentifiers'],
  fin: ['canReadBilling', 'canReadTrust'],
}

/** Tiers an active break-glass grant opens for its resident (sensitive and identifiers stay closed). */
export const BREAK_GLASS_TIERS: ReadonlySet<PhiTier> = new Set(['dem', 'clin'])

/** listKey → fieldKey → tier. Filled as the models load. */
export const PHI_REGISTRY: Record<string, Record<string, PhiTier>> = {}

/** Lists whose rows identify a resident (or a prospective resident): reads are audited as PHI. */
export const PHI_LISTS = new Set<string>()

type FieldFactory = (config: any) => any
type Spec = [PhiTier, FieldFactory, Record<string, any>?]

const grantCache = new WeakMap<object, Promise<Set<string>>>()

/** Residents the session holds an active, unexpired break-glass grant for (cached per request). */
export function breakGlassResidents(session: Session | undefined | null, context: any): Promise<Set<string>> {
  if (!session || !context) return Promise.resolve(new Set())
  if (!hasPermission(session, 'canBreakGlass')) return Promise.resolve(new Set())
  const cached = grantCache.get(session)
  if (cached) return cached
  const promise = (async () => {
    const rows = await context.sudo().prisma.breakGlassGrant.findMany({
      where: { userId: session.itemId, status: 'active', expiresAt: { gt: new Date() } },
      select: { residentId: true },
    })
    return new Set<string>(rows.map((row: { residentId: string | null }) => row.residentId).filter(Boolean) as string[])
  })()
  grantCache.set(session, promise)
  return promise
}

export function tierAllows(session: Session | undefined | null, tier: PhiTier) {
  const rule = TIER_PERMISSIONS[tier]
  if (rule === 'anyone') return true
  if (rule === 'staff') return isStaff({ session })
  return rule.some(permission => hasPermission(session, permission))
}

/** The resident a row belongs to, for break-glass checks. */
const residentOf = (listKey: string, item: Record<string, unknown> | undefined) =>
  !item ? null : listKey === 'Resident' ? (item.id as string) : ((item.residentId as string | undefined) ?? null)

export function tierReadRule(tier: PhiTier) {
  return async ({ session, context, listKey, item }: { session?: Session; context?: any; listKey: string; item?: Record<string, unknown> }) => {
    if (tierAllows(session, tier)) return true
    if (!BREAK_GLASS_TIERS.has(tier) || !isStaff({ session })) return false
    const residentId = residentOf(listKey, item)
    if (!residentId) return false
    return (await breakGlassResidents(session, context)).has(residentId)
  }
}

/**
 * Declare tiered fields for a list: `...phiFields('Resident', { firstName: ['dem', text, { validation: … }] })`.
 * Write access in the config is kept; read access comes from the tier.
 */
export function phiFields<T extends Record<string, Spec>>(listKey: string, spec: T): { [K in keyof T]: ReturnType<T[K][1]> } {
  const registry = (PHI_REGISTRY[listKey] ??= {})
  const out: Record<string, unknown> = {}
  for (const [fieldKey, [tier, factory, config = {}]] of Object.entries(spec)) {
    registry[fieldKey] = tier
    if (PROTECTED_TIERS.has(tier)) PHI_LISTS.add(listKey)
    out[fieldKey] = factory({ ...config, access: { ...(config.access ?? {}), read: tierReadRule(tier) } })
  }
  return out as never
}

/**
 * As phiFields, and the read gate also gates `where` and `orderBy` (no inference by bisection): a session that cannot read the
 * tier cannot filter or sort on the field either. Break-glass opens reads only, never filters.
 */
export function phiGatedFields<T extends Record<string, Spec>>(listKey: string, spec: T): { [K in keyof T]: ReturnType<T[K][1]> } {
  const gated = Object.fromEntries(Object.entries(spec).map(([key, [tier, factory, config = {}]]) => {
    const gate = ({ session }: { session?: Session }) => tierAllows(session, tier)
    return [key, [tier, factory, { ...config, isFilterable: gate, isOrderable: gate }]]
  }))
  return phiFields(listKey, gated as T)
}

/** Every protected field name across lists (for the read-audit selection classifier). */
export function protectedFieldNames() {
  const names = new Set<string>()
  for (const fields of Object.values(PHI_REGISTRY)) for (const [field, tier] of Object.entries(fields)) if (PROTECTED_TIERS.has(tier)) names.add(field)
  return names
}
