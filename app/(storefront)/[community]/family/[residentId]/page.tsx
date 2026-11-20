import type { Metadata } from 'next'
import { loadSite, siteMetadata } from '@/features/storefront/screens/site'
import { FamilyResidentScreen } from '@/features/storefront/screens/family'

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '')

export async function generateMetadata({ params }: { params: Promise<{ community: string; residentId: string }> }): Promise<Metadata> {
  return siteMetadata((await params).community, 'Your family', true)
}

export default async function Page({ params, searchParams }: { params: Promise<{ community: string; residentId: string }>; searchParams: Promise<{ view?: string | string[]; paid?: string | string[]; mfa?: string | string[] }> }) {
  const route = await params
  const query = await searchParams
  const site = await loadSite(route.community)
  return <FamilyResidentScreen site={site} residentId={route.residentId} view={one(query.view)} paid={one(query.paid).slice(0, 40)} mfa={one(query.mfa) === 'on'} />
}
