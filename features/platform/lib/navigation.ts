import {
  Activity, BedDouble, BookOpenCheck, CalendarClock, ClipboardCheck, ClipboardList, Hourglass, KeyRound, ListChecks, LucideIcon, Moon, Settings, Store, Users,
} from 'lucide-react'

export interface PlatformNavItem {
  title: string
  href: string
  color: string
  description: string
  icon: LucideIcon
  group?: string
}

export interface PlatformNavGroup {
  id: string
  title: string
  icon: LucideIcon
  items: PlatformNavItem[]
}

/**
 * Dashboard screens (BUILD-PLAN §2). Each route is a thin wrapper in app/dashboard/(admin)/platform
 * over a feature slice in features/platform/<slice>. A screen is listed here when it ships.
 */
export const platformNavItems: PlatformNavItem[] = [
  { title: 'Bed board', href: '/platform/census', color: 'emerald', description: 'Units, rooms, beds and apartments with live status.', icon: BedDouble, group: 'census' },
  { title: 'Residents', href: '/platform/census/residents', color: 'blue', description: 'Current and former residents with place, presence and payer.', icon: Users, group: 'census' },
  { title: 'Census events', href: '/platform/census/events', color: 'slate', description: 'The append-only admission, transfer, leave and discharge log.', icon: ListChecks, group: 'census' },
  { title: 'Midnight census', href: '/platform/census/midnight', color: 'indigo', description: 'Daily census review and sign-off per community.', icon: Moon, group: 'census' },

  { title: 'Pipeline', href: '/platform/sales', color: 'amber', description: 'Leads, inquiries, tours and referrals with response clocks.', icon: ClipboardList, group: 'sales' },
  { title: 'Waitlist', href: '/platform/sales/waitlist', color: 'amber', description: 'Waitlist by apartment type and setting; offers and holds.', icon: Hourglass, group: 'sales' },
  { title: 'Storefront', href: '/platform/sales/storefront', color: 'cyan', description: 'Storefront content, published prices, availability and job postings.', icon: Store, group: 'sales' },

  { title: 'Approvals', href: '/platform/approvals', color: 'amber', description: 'Maker-checker requests waiting for a second person.', icon: ClipboardCheck, group: 'standalone' },
  { title: 'Compliance clocks', href: '/platform/compliance', color: 'rose', description: 'Regulatory clocks: due, overdue and satisfied.', icon: CalendarClock, group: 'standalone' },

  { title: 'Break-glass', href: '/platform/privacy/break-glass', color: 'rose', description: 'Emergency access grants and the review queue.', icon: KeyRound, group: 'operator' },
  { title: 'Audit log', href: '/platform/audit', color: 'slate', description: 'Hash-chained audit events and chain verification.', icon: BookOpenCheck, group: 'operator' },
  { title: 'Operations', href: '/platform/operations', color: 'slate', description: 'Outbox, jobs and leases.', icon: Activity, group: 'operator' },
  { title: 'Operator settings', href: '/platform/settings', color: 'slate', description: 'Operator profile, communities, packs and approval policies.', icon: Settings, group: 'operator' },
]

/** Routes that exist in this build. Others stay out of the menu until their phase ships. */
export const SHIPPED_ROUTES = new Set<string>([
  '/platform/census', '/platform/census/residents', '/platform/census/events', '/platform/census/midnight',
  '/platform/sales', '/platform/sales/waitlist', '/platform/sales/storefront',
  '/platform/approvals', '/platform/compliance', '/platform/privacy/break-glass', '/platform/audit',
])

const shipped = platformNavItems.filter(item => SHIPPED_ROUTES.has(item.href))

export const platformStandaloneItems = shipped.filter(item => item.group === 'standalone')

export const platformNavGroups: PlatformNavGroup[] = [
  { id: 'census', title: 'Census', icon: BedDouble, items: shipped.filter(i => i.group === 'census') },
  { id: 'sales', title: 'Sales', icon: ClipboardList, items: shipped.filter(i => i.group === 'sales') },
  { id: 'operator', title: 'Operator', icon: Settings, items: shipped.filter(i => i.group === 'operator') },
]

export function getPlatformNavItemsWithBasePath(basePath: string) {
  return shipped.map(item => ({ ...item, href: `${basePath}${item.href}` }))
}
