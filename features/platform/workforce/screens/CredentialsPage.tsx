import { q, currentCommunity } from '../../lib/server';
import { label, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';
import { BillingAction } from '../../components/BillingAction';

type Cred = { id: string; kind: string; status: string; number: string; expiresAt: string | null; minutesCompleted: number; completedOn: string | null; staffMember: { id: string; name: string } | null };
type Staff = { id: string; name: string };
type Leie = { id: string; month: string; rows: number; checked: number; matches: number; createdAt: string };

const KINDS = ['rn_licence', 'lpn_licence', 'cna_registry', 'med_aide_cert', 'cpr', 'tb_screen', 'background_check_state', 'background_check_fbi', 'oig_exclusion', 'state_exclusion'].map(v => ({ value: v, label: label(v) }));
const TRAINING = [{ value: 'in_service_hours', label: 'In-service hours' }, { value: 'dementia_training', label: 'Dementia training' }, { value: 'abuse_training', label: 'Abuse prevention training' }];
const SOURCES = [{ value: 'nursys', label: 'Nursys lookup' }, { value: 'state_registry', label: 'State registry' }, { value: 'background_vendor', label: 'Background-check vendor' }, { value: 'manual', label: 'Primary source, by hand' }];
const RESULTS = [{ value: 'clear', label: 'Clear / verified' }, { value: 'match', label: 'Adverse / exclusion match' }, { value: 'mismatch', label: 'Does not match our record' }, { value: 'error', label: 'Source unavailable' }];

/** Credentials and the evidence behind them: the monthly OIG LEIE file, Nursys and background-vendor results typed in by HR, training hours. */
export default async function CredentialsPage({ searchParams }: { searchParams?: Promise<{ community?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="Credentials"><Empty>No community is assigned to you yet.</Empty></Page>;
  const id = community.id;
  const tz = community.timeZone;
  const data = await q<{ credentials: Cred[]; staffMembers: Staff[]; authenticatedItem: { role: { canManageCredentials: boolean } | null } | null }>(`query C($id: ID!) {
    credentials(where: { community: { id: { equals: $id } } }, orderBy: [{ status: asc }, { expiresAt: asc }], take: 400) { id kind status number expiresAt minutesCompleted completedOn staffMember { id name } }
    staffMembers(where: { community: { id: { equals: $id } } }, orderBy: { name: asc }, take: 300) { id name }
    authenticatedItem { ... on User { role { canManageCredentials } } }
  }`, { id }).catch(() => null);
  if (!data) return <Page title="Credentials"><Empty>Your role doesn&apos;t include credentials. Use the menu for the screens you can open.</Empty></Page>;
  const canManage = Boolean(data.authenticatedItem?.role?.canManageCredentials);
  const leies = canManage ? await q<{ leieImports: Leie[] }>(`query L($id: ID!) { leieImports(where: { community: { id: { equals: $id } } }, orderBy: { createdAt: desc }, take: 12) { id month rows checked matches createdAt } }`, { id }).then(r => r.leieImports).catch(() => []) : [];
  const people = data.staffMembers.map(s => ({ value: s.id, label: s.name }));
  const attention = data.credentials.filter(c => ['revoked', 'suspended', 'expired', 'expiring', 'pending_verification'].includes(c.status));
  const training = data.credentials.filter(c => c.minutesCompleted > 0);
  const licences = data.credentials.filter(c => c.minutesCompleted === 0 && !attention.includes(c));
  const line = (c: Cred) => (
    <Row key={c.id}>
      <div className="min-w-0 flex-1">
        <Title status={c.status === 'verified' ? 'satisfied' : ['revoked', 'expired', 'suspended'].includes(c.status) ? 'overdue' : c.status}>{c.staffMember?.name} · {label(c.kind)} · {label(c.status)}</Title>
        <Meta>{c.minutesCompleted ? `${(c.minutesCompleted / 60).toFixed(1)} h on ${when(c.completedOn, tz, 'date')}` : `${c.number || 'no number'}${c.expiresAt ? ` · expires ${when(c.expiresAt, tz, 'date')}` : ''}`}</Meta>
      </div>
      {canManage && c.minutesCompleted === 0 && c.status !== 'verified' ? <BillingAction op="credential.verify" input={{ credentialId: c.id }} fields={[{ name: 'source', label: 'Checked with', type: 'select', required: true, options: SOURCES }, { name: 'result', label: 'Result', type: 'select', required: true, options: RESULTS }, { name: 'reference', label: 'Confirmation number or document', type: 'text', required: true }, { name: 'note', label: 'Note', type: 'text' }]}>Record verification</BillingAction> : null}
    </Row>
  );
  return (
    <Page title="Credentials and training">
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/credentials" />
      {canManage ? (
        <Section title="OIG exclusion list (LEIE)" aside={<BillingAction op="leie.import" input={{ communityId: id }} fields={[{ name: 'month', label: 'File month (like 2026-11)', type: 'text', required: true }, { name: 'text', label: 'Paste the UPDATED.csv contents from oig.hhs.gov', type: 'textarea', required: true }]}>Upload monthly file</BillingAction>}>
          {leies.length ? leies.map(l => <Row key={l.id}><div className="min-w-0 flex-1"><Title status={l.matches ? 'overdue' : 'satisfied'}>{l.month} · {l.matches} match{l.matches === 1 ? '' : 'es'}</Title><Meta>{l.rows} file rows · {l.checked} staff checked · uploaded {when(l.createdAt, tz, 'full')}</Meta></div></Row>) : <Empty>No LEIE file uploaded. Download the monthly file from OIG and upload it here.</Empty>}
        </Section>
      ) : null}
      <Section title="Needs attention" aside={canManage ? <BillingAction op="credential.save" input={{}} fields={[{ name: 'staffMemberId', label: 'Person', type: 'select', required: true, options: people }, { name: 'kind', label: 'Credential', type: 'select', required: true, options: KINDS }, { name: 'jurisdiction', label: 'State or issuer', type: 'text' }, { name: 'number', label: 'Number', type: 'text' }, { name: 'expiresAt', label: 'Expires', type: 'date' }, { name: 'document', label: 'Document on file', type: 'text' }]}>Add credential</BillingAction> : null}>
        {attention.length ? attention.map(line) : <Empty>Every credential on file is verified and current.</Empty>}
      </Section>
      <Section title="Verified credentials">{licences.length ? licences.map(line) : <Empty>None yet.</Empty>}</Section>
      <Section title="In-service, dementia and abuse training" aside={canManage ? <BillingAction op="credential.training" input={{}} fields={[{ name: 'staffMemberId', label: 'Person', type: 'select', required: true, options: people }, { name: 'kind', label: 'Training', type: 'select', required: true, options: TRAINING }, { name: 'minutes', label: 'Minutes completed', type: 'text', required: true }, { name: 'completedOn', label: 'Completed on', type: 'date', required: true }, { name: 'reference', label: 'Sign-in sheet or certificate', type: 'text', required: true }]}>Record training</BillingAction> : null}>
        {training.length ? training.map(line) : <Empty>No training recorded.</Empty>}
      </Section>
    </Page>
  );
}
