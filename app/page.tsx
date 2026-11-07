import { redirect } from 'next/navigation'

/** The dashboard is the product surface. Customer-facing storefront and portal UI ship separately. */
export default function Home() {
  redirect('/dashboard')
}
