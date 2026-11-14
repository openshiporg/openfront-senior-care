import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSite, publishedCommunities } from '@/features/storefront/lib/data'
import { SiteShell } from '@/features/storefront/components/Chrome'
import { ChooserScreen, HomeScreen, siteMetadata } from '@/features/storefront/screens/site'

export async function generateMetadata(): Promise<Metadata> {
  const communities = await publishedCommunities().catch(() => [])
  return communities.length === 1 ? siteMetadata(communities[0].slug) : { title: 'Our communities' }
}

/** One published community: its home page lives here. Several: a list to choose from. None yet: the staff workspace, where the site is set up. */
export default async function Page() {
  const communities = await publishedCommunities()
  if (!communities.length) redirect('/dashboard')
  if (communities.length > 1) return <ChooserScreen communities={communities} />
  const site = await getSite(communities[0].slug)
  if (!site) redirect('/dashboard')
  return <SiteShell site={site}><HomeScreen site={site} /></SiteShell>
}
