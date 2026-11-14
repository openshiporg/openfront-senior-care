import type { Metadata } from 'next'
import { WaitlistScreen, loadSite, siteMetadata } from '@/features/storefront/screens/site'

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] ?? '' : value ?? '')

export async function generateMetadata({ params }: { params: Promise<{ community: string }> }): Promise<Metadata> {
  return siteMetadata((await params).community, 'Join the waitlist')
}

export default async function Page({ params, searchParams }: { params: Promise<{ community: string }>; searchParams: Promise<{ setting?: string | string[]; type?: string | string[] }> }) {
  const route = await params
  const query = await searchParams
  const site = await loadSite(route.community)
  return <WaitlistScreen site={site} setting={one(query.setting)} type={one(query.type)} />
}
