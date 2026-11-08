import Link from 'next/link';
import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs, Tabs } from '../../components/ui';

type Clock = {
  id: string; obligationCode: string; status: string; startedAt: string; dueAt: string; satisfiedAt: string | null; ownerRole: string; escalationLevel: number; ruleRef: string; verifyNote: string; subjectType: string;
  resident: { id: string; firstName: string; preferredName: string; lastName: string } | null;
  obligation: { description: string } | null;
};

const VIEWS = [
  { key: 'attention', label: 'Needs attention', statuses: ['overdue', 'open'] },
  { key: 'done', label: 'Satisfied', statuses: ['satisfied', 'satisfied_late'] },
  { key: 'closed', label: 'Waived or cancelled', statuses: ['waived', 'cancelled'] },
];

/**
 * Regulatory deadlines started by census facts (admission, transfer, discharge, death). Each rule
 * comes from the state or federal pack with its citation; clocks close when the evidence is recorded.
 */
export default async function CompliancePage({ searchParams }: { searchParams?: Promise<{ community?: string; view?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Compliance clocks"><Empty>No community is assigned to you yet.</Empty></Page>;
  const view = VIEWS.find(v => v.key === params.view) ?? VIEWS[0];
  const data = await q<{ complianceClocks: Clock[]; overdue: number; open: number }>(`query C($c: ID!, $statuses: [String!]!) {
    complianceClocks(where: { community: { id: { equals: $c } }, current: { equals: true }, status: { in: $statuses } }, orderBy: { dueAt: ${view.key === 'attention' ? 'asc' : 'desc'} }, take: 150) {
      id obligationCode status startedAt dueAt satisfiedAt ownerRole escalationLevel ruleRef verifyNote subjectType
      resident { id firstName preferredName lastName } obligation { description }
    }
    overdue: complianceClocksCount(where: { community: { id: { equals: $c } }, current: { equals: true }, status: { equals: "overdue" } })
    open: complianceClocksCount(where: { community: { id: { equals: $c } }, current: { equals: true }, status: { equals: "open" } })
  }`, { c: community.id, statuses: view.statuses });
  const tz = community.timeZone;
  const base = `/dashboard/platform/compliance?community=${community.slug}`;
  const clocks = view.key === 'attention' ? [...data.complianceClocks].sort((a, b) => (a.status === b.status ? a.dueAt.localeCompare(b.dueAt) : a.status === 'overdue' ? -1 : 1)) : data.complianceClocks;
  return (
    <Page title="Compliance clocks">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/compliance" />
      <Tabs active={view.key} items={VIEWS.map(v => ({ key: v.key, label: v.label, href: `${base}&view=${v.key}`, count: v.key === 'attention' ? data.overdue + data.open : undefined }))} />
      <Section title={view.key === 'attention' ? `${data.overdue} overdue · ${data.open} open` : view.label}>
        {clocks.length ? clocks.map(c => {
          const who = c.resident ? `${c.resident.preferredName || c.resident.firstName} ${c.resident.lastName}` : null;
          return (
            <Row key={c.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={c.status}>{who && c.resident ? <Link className="hover:underline" href={`/dashboard/platform/census/residents/${c.resident.id}?community=${community.slug}`}>{who}</Link> : label(c.subjectType)}</Title>
                <Meta>
                  {(c.obligation?.description || label(c.obligationCode.toLowerCase())).replace(/\.\s*$/, '')}
                  {' · '}{c.status === 'satisfied' || c.status === 'satisfied_late' ? `done ${when(c.satisfiedAt, tz)} (due ${when(c.dueAt, tz, 'day')})` : `due ${when(c.dueAt, tz)}`}
                  {c.ownerRole ? ` · ${label(c.ownerRole)}` : ''}{c.escalationLevel > 0 ? ` · escalated ${c.escalationLevel}×` : ''}
                </Meta>
                <Meta>{c.ruleRef}{c.verifyNote ? ` · ${c.verifyNote}` : ''}</Meta>
              </div>
            </Row>
          );
        }) : <Empty>{view.key === 'attention' ? 'No deadline is open.' : 'Nothing here yet.'}</Empty>}
      </Section>
    </Page>
  );
}
