import { keystoneContext } from '@/features/keystone/context';
import { viewOffer } from '@/features/keystone/scheduling/service';
import { OfferAnswer } from './OfferAnswer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shift offer', robots: { index: false, follow: false } };

const ROLE: Record<string, string> = { rn: 'Registered nurse', lpn: 'Licensed practical nurse', cna: 'Nurse aide', med_aide: 'Medication aide', other: 'Staff' };

/** The link a scheduler copies to a staff member. No account: the signed link is the proof. */
export default async function ShiftOfferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const offer = await viewOffer(keystoneContext.prisma as never, token);
  if (!offer.valid) {
    return <main className="mx-auto max-w-md p-6"><h1 className="text-xl font-semibold">Shift offer</h1><p className="mt-3 text-sm text-muted-foreground">{offer.message} Ask your scheduler for a new link.</p></main>;
  }
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: offer.timeZone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <p className="text-sm text-muted-foreground">{offer.community}</p>
      <h1 className="text-xl font-semibold">Open shift for {offer.staffName}</h1>
      <dl className="space-y-1 text-sm">
        <div><dt className="inline font-medium">Role: </dt><dd className="inline">{ROLE[offer.role] ?? offer.role}{offer.unit ? `, ${offer.unit}` : ''}</dd></div>
        <div><dt className="inline font-medium">Starts: </dt><dd className="inline">{fmt(offer.startsAt)}</dd></div>
        <div><dt className="inline font-medium">Ends: </dt><dd className="inline">{fmt(offer.endsAt)}</dd></div>
      </dl>
      {offer.status === 'offered' ? <OfferAnswer token={token} /> : <p className="text-sm">This offer is {offer.status.replace('_', ' ')}.</p>}
    </main>
  );
}
