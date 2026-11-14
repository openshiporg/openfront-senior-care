import type { Metadata } from 'next'
import { ManageTourScreen, loadSite, siteMetadata } from '@/features/storefront/screens/site'

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '')

export async function generateMetadata({ params }: { params: Promise<{ community: string }> }): Promise<Metadata> {
  return siteMetadata((await params).community, 'Cancel a tour', true)
}

export default async function Page({ params, searchParams }: { params: Promise<{ community: string }>; searchParams: Promise<{ token?: string | string[] }> }) {
  const route = await params
  const query = await searchParams
  const site = await loadSite(route.community)
  return <ManageTourScreen site={site} token={one(query.token)} />
}
