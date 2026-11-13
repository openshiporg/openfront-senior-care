import { q, currentCommunity } from '../../lib/server';
import { perDiem, type PdpmRates } from '@/features/keystone/pdpm/classify';
import { HIPPS_SOURCE_NOTE, PDPM_VERIFY_NOTE } from '@/features/keystone/pdpm/tables';
import { label, money, when } from '../../lib/format';
import { Page, Section, Row, Empty, Meta, Title, CommunityTabs } from '../../components/ui';

type Classification = { id: string; hipps: string | null; indicator: string; effectiveFrom: string; status: string; cmi: Record<string, string> | null; groups: Record<string, unknown> | null; resident: { firstName: string; lastName: string } | null; assessment: { id: string; reference: string } | null };
type Rate = { component: string; geography: string; rate: string; laborShare: string | null; verifyNote: string };

const DAYS = [1, 4, 21, 28, 100];

/** Current PDPM classifications and what each pays per day across the variable per diem (rates as loaded, wage index of the community). */
export default async function PdpmPage({ searchParams }: { searchParams?: Promise<{ community?: string; classification?: string }> }) {
  const params = (await searchParams) ?? {};
  const { community, communities } = await currentCommunity(params.community);
  if (!community) return <Page title="PDPM"><Empty>No community is assigned to you yet.</Empty></Page>;
  const data = await q<{ pdpmClassifications: Classification[]; referenceRates: Rate[]; community: { identifiers: Record<string, string> | null } | null }>(`query P($id: ID!) {
    pdpmClassifications(where: { community: { id: { equals: $id } }, status: { equals: "current" } }, orderBy: { effectiveFrom: desc }, take: 300) { id hipps indicator effectiveFrom status cmi groups resident { firstName lastName } assessment { id reference } }
    referenceRates(take: 100) { component geography rate laborShare verifyNote }
    community(where: { id: $id }) { identifiers }
  }`, { id: community.id }).catch(() => null);
  if (!data) return <Page title="PDPM"><Empty>Your role doesn&apos;t include PDPM. Use the menu for the screens you can open.</Empty></Page>;
  const tz = community.timeZone;
  const pick = (c: string, g = 'urban') => data.referenceRates.find(r => r.component === c && r.geography === g);
  const comps = ['pt', 'ot', 'slp', 'nursing', 'nta', 'non_case_mix'].map(c => pick(c));
  const wage = data.community?.identifiers?.cbsa ? pick('wage_index', data.community.identifiers.cbsa)?.rate ?? '1' : '1';
  const rates: PdpmRates | null = comps.every(Boolean) ? { pt: comps[0]!.rate, ot: comps[1]!.rate, slp: comps[2]!.rate, nursing: comps[3]!.rate, nta: comps[4]!.rate, nonCaseMix: comps[5]!.rate } : null;
  const labor = comps[0]?.laborShare ?? '0.702';
  const list = params.classification ? data.pdpmClassifications.filter(c => c.id === params.classification) : data.pdpmClassifications;
  return (
    <Page title="PDPM" crumbs={[{ label: 'MDS calendar', href: '/dashboard/platform/mds' }]}>
      <CommunityTabs communities={communities} active={community.slug} path="/dashboard/platform/mds/pdpm" />
      {rates ? <Meta>FY2026 urban rates · wage index {wage} · labor share {labor}. {PDPM_VERIFY_NOTE}</Meta> : <Empty>Load the MDS reference data (FY2026 rates) to see per diems.</Empty>}
      <Section title="Current classifications">
        {list.length ? list.map(c => {
          const schedule = rates && c.cmi ? DAYS.map(d => ({ d, p: perDiem({ cmi: c.cmi as never, aids: Boolean(c.groups?.aids) }, rates, d, { wageIndex: wage, labor: { pt: labor, ot: labor, slp: labor, nursing: labor, nta: labor, nonCaseMix: labor } }) })) : [];
          return (
            <Row key={c.id}>
              <div className="min-w-0 flex-1 space-y-0.5">
                <Title status="active">{c.resident ? `${c.resident.lastName}, ${c.resident.firstName}` : 'Resident'} · {c.hipps}</Title>
                <Meta>{label(c.indicator)} · pays from {when(c.effectiveFrom, tz, 'date')}{c.assessment ? ` · ${c.assessment.reference}` : ''}{c.groups ? ` · ${String(c.groups.pt)}/${String(c.groups.slp)}/${String(c.groups.nursing)}/${String(c.groups.nta)}` : ''}</Meta>
                {schedule.map(({ d, p }) => (
                  <Meta key={d}>Day {d}: {money(p.totalMinor.toString())} (PT {money(p.componentsMinor.pt.toString())} · OT {money(p.componentsMinor.ot.toString())} · SLP {money(p.componentsMinor.slp.toString())} · Nursing {money(p.componentsMinor.nursing.toString())} · NTA {money(p.componentsMinor.nta.toString())} · non-case-mix {money(p.componentsMinor.nonCaseMix.toString())}; VPD PT/OT ×{p.vpd.ptOt}, NTA ×{p.vpd.nta})</Meta>
                ))}
              </div>
              {c.assessment ? <a className="inline-flex min-h-11 items-center text-sm underline" href={`/dashboard/platform/mds/${c.assessment.id}`}>Assessment</a> : null}
            </Row>
          );
        }) : <Empty>No current classifications.</Empty>}
      </Section>
      <Meta>{HIPPS_SOURCE_NOTE}</Meta>
      {data.referenceRates.filter(r => r.verifyNote).slice(0, 1).map(r => <Meta key={r.component}>{r.verifyNote}</Meta>)}
    </Page>
  );
}
