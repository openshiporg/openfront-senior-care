'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PageTitle } from '@/features/storefront/components/Chrome'

/** A page that could not be read on our side: say so plainly and read it again when asked. */
export default function StorefrontError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <main id="main" className="sf-main">
      <PageTitle title="This page did not load" intro="Something went wrong on our side. Please try again in a moment.">
        <div className="sf-title-actions">
          <button type="button" className="sf-btn sf-btn-lg" disabled={pending} onClick={() => startTransition(() => { router.refresh(); reset() })}>
            {pending ? 'Trying again…' : 'Try again'}
          </button>
        </div>
      </PageTitle>
    </main>
  )
}
