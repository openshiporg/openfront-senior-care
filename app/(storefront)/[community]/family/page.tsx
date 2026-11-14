import type { Metadata } from 'next'
import { loadSite, siteMetadata } from '@/features/storefront/screens/site'
import { FamilyHomeScreen } from '@/features/storefront/screens/family'

export async function generateMetadata({ params }: { params: Promise<{ community: string }> }): Promise<Metadata> {
  return siteMetadata((await params).community, 'Your family', true)
}

export default async function Page({ params }: { params: Promise<{ community: string }> }) {
  const route = await params
  const site = await loadSite(route.community)
  return <FamilyHomeScreen site={site} />
}
