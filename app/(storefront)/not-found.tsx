import Link from 'next/link'
import { PageTitle } from '@/features/storefront/components/Chrome'

export default function NotFound() {
  return (
    <main id="main" className="sf-main">
      <PageTitle title="We can’t find that page" intro="The address may have changed, or the page may have moved.">
        <div className="sf-title-actions"><Link className="sf-btn" href="/">Back to the home page</Link></div>
      </PageTitle>
    </main>
  )
}
