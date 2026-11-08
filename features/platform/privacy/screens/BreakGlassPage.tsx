import Link from 'next/link';
import { q, operatorTimeZone } from '../../lib/server';
import { label, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, Tabs } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';

type Grant = {
  id: string; reason: string; note: string; requestedAt: string; expiresAt: string; endedAt: string | null; status: string; reviewNote: string; version: number;
  user: { id: string; name: string } | null; reviewedBy: { name: string } | null;
  resident: { id: string; reference: string } | null;
};

const VIEWS = [
  { key: 'review', label: 'To review', statuses: ['active', 'ended'] },
  { key: 'reviewed', label: 'Reviewed', statuses: ['reviewed_ok', 'reviewed_violation'] },
];

/**
 * Emergency access to a resident outside the user's assignment. Every use is time-boxed, written to
 * the audit log, and reviewed by the privacy officer (never by the person who used it). Staff see
 * their own uses; reviewers see everyone's.
 */
export default async function BreakGlassPage({ searchParams }: { searchParams?: Promise<{ view?: string }> }) {
  const requested = (await searchParams)?.view;
  const view = VIEWS.find(v => v.key === requested) ?? VIEWS[0];
  const [data, tz] = await Promise.all([
    q<{ breakGlassGrants: Grant[]; authenticatedItem: { id: string; role: { canReviewBreakGlass: boolean } | null } | null }>(`query B($statuses: [String!]!) {
      breakGlassGrants(where: { status: { in: $statuses } }, orderBy: { requestedAt: desc }, take: 100) {
        id reason note requestedAt expiresAt endedAt status reviewNote version user { id name } reviewedBy { name } resident { id reference }
      }
      authenticatedItem { ... on User { id role { canReviewBreakGlass } } }
    }`, { statuses: view.statuses }),
    operatorTimeZone(),
  ]);
  const me = data.authenticatedItem?.id;
  const reviewer = data.authenticatedItem?.role?.canReviewBreakGlass === true;
  const now = Date.now();
  const paths = ['/dashboard/platform/privacy/break-glass'];
  return (
    <Page title="Break-glass" crumbs={[{ label: 'Privacy' }]}>
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `/dashboard/platform/privacy/break-glass?view=${v.key}` }))} />
      <Section title={view.key === 'review' ? (reviewer ? 'Uses waiting for review' : 'Your recent emergency access') : 'Reviewed uses'}>
        {data.breakGlassGrants.length ? data.breakGlassGrants.map(g => {
          const live = g.status === 'active' && new Date(g.expiresAt).getTime() > now;
          const mine = g.user?.id === me;
          return (
            <Row key={g.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={live ? 'active' : g.status === 'active' ? 'expired' : g.status} statusText={live ? `Open until ${when(g.expiresAt, tz, 'time')}` : undefined}>
                  {g.user?.name ?? 'Someone'} · {label(g.reason)}
                </Title>
                <p className="break-words text-sm">{g.note}</p>
                <Meta>
                  Resident {g.resident ? <Link className="font-mono hover:underline" href={`/dashboard/platform/census/residents/${g.resident.id}`}>{g.resident.reference}</Link> : '—'}
                  {' · '}opened {when(g.requestedAt, tz)}{g.endedAt ? ` · closed ${when(g.endedAt, tz)}` : ''}
                </Meta>
                {g.reviewedBy ? <Meta>Reviewed by {g.reviewedBy.name}{g.reviewNote ? `: ${g.reviewNote}` : ''}</Meta> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {live && mine ? <ActionButton op="endBreakGlass" vars={{ grantId: g.id }} paths={paths}>Close access</ActionButton> : null}
                {reviewer && !mine && (g.status === 'ended' || (g.status === 'active' && !live)) ? (
                  <>
                    <ActionButton op="reviewBreakGlass" vars={{ grantId: g.id, outcome: 'reviewed_ok', expectedVersion: g.version }} ask="Review note (what you checked)" askField="note" paths={paths}>No concern</ActionButton>
                    <ActionButton op="reviewBreakGlass" vars={{ grantId: g.id, outcome: 'reviewed_violation', expectedVersion: g.version }} ask="What was wrong with this access?" askField="note" paths={paths}>Violation</ActionButton>
                  </>
                ) : null}
              </div>
            </Row>
          );
        }) : <Empty>{view.key === 'review' ? 'No emergency access is waiting for review.' : 'No reviewed uses yet.'}</Empty>}
      </Section>
    </Page>
  );
}
