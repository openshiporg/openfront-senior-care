import type { Metadata } from 'next'
import { PricingScreen, loadSite, siteMetadata } from '@/features/storefront/screens/site'

export async function generateMetadata({ params }: { params: Promise<{ community: string }> }): Promise<Metadata> {
  return siteMetadata((await params).community, 'Pricing')
}

export default async function Page({ params }: { params: Promise<{ community: string }> }) {
  const route = await params
  const site = await loadSite(route.community)
  return <PricingScreen site={site} />
}
