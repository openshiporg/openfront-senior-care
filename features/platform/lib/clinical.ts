import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

/**
 * Runs a clinical command from a server render. Used only for the commands that bring things up to date when a
 * screen is opened (eMAR slots and missed doses, the workflow run). There is no timer; opening the page is the request.
 */
export async function onLoad(op: 'emar.open' | 'workflow.run', communityId: string) {
  const idempotencyKey = `${op}:${crypto.randomUUID()}`;
  const r = await keystoneClient(`mutation Load($op: String!, $input: JSON, $k: String!) { clinicalCommand(op: $op, input: $input, idempotencyKey: $k) }`, { op, input: { communityId }, k: idempotencyKey });
  return r.success;
}

export const NOT_FOR_ROLE = (what: string) => `Your role doesn't include ${what}. Use the menu for the screens you can open.`;

export const NOTE_TYPES = ['nursing', 'physician', 'social_services', 'therapy', 'dietary', 'activity', 'other'].map(v => ({ value: v, label: v.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) }));
export const VITAL_TYPES = [
  ['temperature', 'Temperature'], ['pulse', 'Pulse'], ['respirations', 'Respirations'], ['systolic_bp', 'Systolic BP'], ['diastolic_bp', 'Diastolic BP'],
  ['spo2', 'SpO2'], ['weight', 'Weight'], ['pain', 'Pain 0-10'], ['blood_glucose', 'Blood glucose'],
].map(([value, label]) => ({ value, label }));
export const INCIDENT_TYPES = [
  ['fall', 'Fall'], ['medication_error', 'Medication error'], ['elopement', 'Elopement'], ['injury_unknown_source', 'Injury of unknown source'], ['alleged_abuse', 'Alleged abuse'],
  ['alleged_neglect', 'Alleged neglect'], ['misappropriation', 'Misappropriation'], ['resident_to_resident', 'Resident to resident'], ['skin', 'Skin'], ['choking', 'Choking'],
  ['infection', 'Infection'], ['other', 'Other'],
].map(([value, label]) => ({ value, label }));
