import Link from 'next/link';
import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { NOT_FOR_ROLE } from '../../lib/clinical';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { ClinicalAction } from '../../components/ClinicalAction';

type Task = { id: string; kind: string; title: string; detail: string; status: string; ownerRole: string; dueAt: string | null; escalateAt: string | null; resident: { id: string; firstName: string; lastName: string } | null; assignee: { name: string } | null };

/** The staff inbox. Escalations and notifications are tasks here, never sent messages. */
export default async function TasksPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Tasks"><Empty>No community is assigned to you yet.</Empty></Page>;
  const data = await q<{ tasks: Task[] }>(`query T($c: ID!) { tasks(where: { community: { id: { equals: $c } }, status: { in: ["open", "in_progress"] } }, orderBy: { dueAt: asc }, take: 200) { id kind title detail status ownerRole dueAt escalateAt resident { id firstName lastName } assignee { name } } }`, { c: community.id }).catch(() => null);
  if (!data) return <Page title="Tasks"><Empty>{NOT_FOR_ROLE('the task inbox')}</Empty></Page>;
  const tz = community.timeZone;
  const now = Date.now();
  return (
    <Page title="Tasks">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/tasks" />
      <Section title={`${data.tasks.length} open`}>
        {data.tasks.length ? data.tasks.map(t => {
          const late = t.dueAt && new Date(t.dueAt).getTime() < now;
          const escalated = t.escalateAt && new Date(t.escalateAt).getTime() < now;
          return (
            <Row key={t.id}>
              <div className="min-w-0 flex-1 basis-60 space-y-0.5">
                <Title status={late ? 'overdue' : null}>{t.title}</Title>
                <Meta>{label(t.kind)}{t.resident ? <> · <Link className="underline" href={`/dashboard/platform/clinical/${t.resident.id}?community=${community.slug}`}>{t.resident.firstName} {t.resident.lastName}</Link></> : null}{t.dueAt ? ` · due ${when(t.dueAt, tz)}` : ''}{t.assignee ? ` · ${t.assignee.name}` : t.ownerRole ? ` · ${t.ownerRole}` : ''}{escalated ? ' · escalated to the owner role' : ''}</Meta>
                {t.detail ? <Meta>{t.detail}</Meta> : null}
              </div>
              <ClinicalAction op="task.complete" input={{ taskId: t.id }}>Done</ClinicalAction>
            </Row>
          );
        }) : <Empty>Nothing is waiting.</Empty>}
      </Section>
    </Page>
  );
}
