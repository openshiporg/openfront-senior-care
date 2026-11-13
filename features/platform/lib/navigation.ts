import {
  FileText, Receipt, Tags, CalendarRange, Calculator, ShieldCheck, Landmark, PiggyBank, Activity, AlertTriangle, BedDouble, Bell, Pill, Lock, ShieldPlus, Stethoscope, Sparkles, BookOpenCheck, CalendarClock, ClipboardCheck, ClipboardList, Hourglass, KeyRound, ListChecks, LucideIcon, Moon, Settings, Store, Users,
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

  { title: 'Clinical chart', href: '/platform/clinical', color: 'blue', description: 'Notes, vitals, assessments, orders, care plans and wounds.', icon: Stethoscope, group: 'clinical' },
  { title: 'eMAR', href: '/platform/emar', color: 'emerald', description: 'Medication pass: give, hold, refuse and PRN follow-up.', icon: Pill, group: 'clinical' },
  { title: 'Controlled counts', href: '/platform/counts', color: 'rose', description: 'Blind shift counts, differences and supply on hand.', icon: Lock, group: 'clinical' },
  { title: 'Incidents', href: '/platform/incidents', color: 'rose', description: 'Incidents with F609 clocks, investigations and reports.', icon: AlertTriangle, group: 'clinical' },
  { title: 'Infection control', href: '/platform/ipac', color: 'amber', description: 'Cases, precautions, antibiotic time-outs and outbreaks.', icon: ShieldPlus, group: 'clinical' },
  { title: 'Tasks', href: '/platform/tasks', color: 'slate', description: 'Staff inbox: escalations and follow-ups.', icon: Bell, group: 'clinical' },
  { title: 'MDS calendar', href: '/platform/mds', color: 'blue', description: 'MDS windows, records, sign-off and the iQIES export.', icon: CalendarRange, group: 'clinical' },
  { title: 'Findings', href: '/platform/findings', color: 'indigo', description: 'Workflow findings with evidence; run on request.', icon: Sparkles, group: 'clinical' },

  { title: 'Pipeline', href: '/platform/sales', color: 'amber', description: 'Leads, inquiries, tours and referrals with response clocks.', icon: ClipboardList, group: 'sales' },
  { title: 'Waitlist', href: '/platform/sales/waitlist', color: 'amber', description: 'Waitlist by apartment type and setting; offers and holds.', icon: Hourglass, group: 'sales' },
  { title: 'Storefront', href: '/platform/sales/storefront', color: 'cyan', description: 'Storefront copy, starting prices, availability and tour times.', icon: Store, group: 'sales' },

  { title: 'Billing', href: '/platform/billing', color: 'emerald', description: 'Month-end close, statements and payments.', icon: Receipt, group: 'billing' },
  { title: 'Rates and notices', href: '/platform/billing/rates', color: 'blue', description: 'Rate schedules and rate-change notices.', icon: Tags, group: 'billing' },
  { title: 'PDPM', href: '/platform/mds/pdpm', color: 'indigo', description: 'Current HIPPS and per diem across the variable per diem.', icon: Calculator, group: 'billing' },
  { title: 'Coverage', href: '/platform/mds/coverage', color: 'emerald', description: 'Part A days, NOMNC clock, MA authorisations and hospice.', icon: ShieldCheck, group: 'billing' },
  { title: 'Medicaid liability', href: '/platform/billing/medicaid', color: 'indigo', description: 'Patient liability with reply and appeal deadlines.', icon: Landmark, group: 'billing' },
  { title: 'Claims', href: '/platform/claims', color: 'emerald', description: 'Part A claims, 837I files, 835 remittances and denials.', icon: FileText, group: 'billing' },
  { title: 'Staffing and PBJ', href: '/platform/workforce', color: 'blue', description: 'Timecards, punch corrections and the PBJ quarter export.', icon: Users, group: 'billing' },
  { title: 'NHSN weekly report', href: '/platform/nhsn', color: 'rose', description: 'Weekly respiratory vaccination and case CSV.', icon: ClipboardCheck, group: 'clinical' },
  { title: 'Resident funds', href: '/platform/trust', color: 'amber', description: 'Resident trust ledgers, withdrawals and reconciliation.', icon: PiggyBank, group: 'billing' },

  { title: 'Approvals', href: '/platform/approvals', color: 'amber', description: 'Maker-checker requests waiting for a second person.', icon: ClipboardCheck, group: 'standalone' },
  { title: 'Compliance clocks', href: '/platform/compliance', color: 'rose', description: 'Regulatory clocks: due, overdue and satisfied.', icon: CalendarClock, group: 'standalone' },

  { title: 'Break-glass', href: '/platform/privacy/break-glass', color: 'rose', description: 'Emergency access grants and the review queue.', icon: KeyRound, group: 'operator' },
  { title: 'Audit log', href: '/platform/audit', color: 'slate', description: 'Hash-chained audit events and chain verification.', icon: BookOpenCheck, group: 'operator' },
  { title: 'Operations', href: '/platform/operations', color: 'slate', description: 'Jobs and leases.', icon: Activity, group: 'operator' },
  { title: 'Operator settings', href: '/platform/settings', color: 'slate', description: 'Operator profile, communities, packs and approval policies.', icon: Settings, group: 'operator' },
]

/** Routes that exist in this build. Others stay out of the menu until their phase ships. */
export const SHIPPED_ROUTES = new Set<string>([
  '/platform/census', '/platform/census/residents', '/platform/census/events', '/platform/census/midnight',
  '/platform/clinical', '/platform/emar', '/platform/counts', '/platform/incidents', '/platform/ipac', '/platform/tasks', '/platform/findings',
  '/platform/sales', '/platform/sales/waitlist', '/platform/sales/storefront',
  '/platform/billing', '/platform/billing/rates', '/platform/billing/medicaid', '/platform/trust',
  '/platform/mds', '/platform/mds/pdpm', '/platform/mds/coverage', '/platform/claims', '/platform/workforce', '/platform/nhsn',
  '/platform/approvals', '/platform/compliance', '/platform/privacy/break-glass', '/platform/audit',
])

const shipped = platformNavItems.filter(item => SHIPPED_ROUTES.has(item.href))

export const platformStandaloneItems = shipped.filter(item => item.group === 'standalone')

export const platformNavGroups: PlatformNavGroup[] = [
  { id: 'census', title: 'Census', icon: BedDouble, items: shipped.filter(i => i.group === 'census') },
  { id: 'clinical', title: 'Clinical', icon: Stethoscope, items: shipped.filter(i => i.group === 'clinical') },
  { id: 'billing', title: 'Billing', icon: Receipt, items: shipped.filter(i => i.group === 'billing') },
  { id: 'sales', title: 'Sales', icon: ClipboardList, items: shipped.filter(i => i.group === 'sales') },
  { id: 'operator', title: 'Operator', icon: Settings, items: shipped.filter(i => i.group === 'operator') },
]

export function getPlatformNavItemsWithBasePath(basePath: string) {
  return shipped.map(item => ({ ...item, href: `${basePath}${item.href}` }))
}
