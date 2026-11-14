import type { ReactNode } from 'react'
import './storefront.css'
import { storefrontSans, storefrontSerif } from '@/features/storefront/lib/fonts'

// Every storefront page reads live prices, availability and open tour times.
export const dynamic = 'force-dynamic'

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return <div className={`sf ${storefrontSerif.variable} ${storefrontSans.variable}`}>{children}</div>
}
