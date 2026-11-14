import type { Metadata } from 'next'
import { HomeScreen, loadSite, siteMetadata } from '@/features/storefront/screens/site'

export async function generateMetadata({ params }: { params: Promise<{ community: string }> }): Promise<Metadata> {
  return siteMetadata((await params).community)
}

export default async function Page({ params }: { params: Promise<{ community: string }> }) {
  const route = await params
  const site = await loadSite(route.community)
  return <HomeScreen site={site} />
}
