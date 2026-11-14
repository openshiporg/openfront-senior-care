import type { ReactNode } from 'react'
import { SiteShell } from '@/features/storefront/components/Chrome'
import { loadSite } from '@/features/storefront/screens/site'

export default async function CommunityLayout({ children, params }: { children: ReactNode; params: Promise<{ community: string }> }) {
  const site = await loadSite((await params).community)
  return <SiteShell site={site}>{children}</SiteShell>
}
