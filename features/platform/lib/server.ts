import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

/** Staff reads go through the signed-in session, so list access rules still apply. */
export async function q<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await keystoneClient<T>(query, variables)
  if (!r.success) throw new Error(r.error)
  return r.data as T
}

/** The operator's home time zone (OperatorSettings.homeTimeZone), New York by default. */
export async function operatorTimeZone(): Promise<string> {
  try {
    const d: any = await q(`{ operatorSettings { homeTimeZone } }`)
    return d.operatorSettings?.homeTimeZone || 'America/New_York'
  } catch {
    return 'America/New_York'
  }
}

/** The communities the signed-in user can see (list access applies), first one first. */
export async function myCommunities(): Promise<{ id: string; name: string; slug: string; timeZone: string }[]> {
  try {
    const d: any = await q(`{ communities(orderBy: [{ name: asc }], where: { status: { not: { equals: "closed" } } }) { id name slug timeZone } }`)
    return d.communities ?? []
  } catch {
    return []
  }
}
