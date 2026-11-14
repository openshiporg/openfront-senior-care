import type { Metadata } from 'next'
import { TourScreen, loadSite, siteMetadata } from '@/features/storefront/screens/site'

export async function generateMetadata({ params }: { params: Promise<{ community: string }> }): Promise<Metadata> {
  return siteMetadata((await params).community, 'Schedule a tour')
}

export default async function Page({ params }: { params: Promise<{ community: string }> }) {
  const route = await params
  const site = await loadSite(route.community)
  return <TourScreen site={site} />
}
