import { User } from './User'
import { Role } from './Role'
import { OAuthApp } from './OAuthApp'
import { OAuthToken } from './OAuthToken'
import * as platform from './platform'
import * as agents from './agents'
import * as places from './places'
import * as residents from './residents'
import * as sales from './sales'
import * as clinical from './clinical'
import * as medications from './medications'
import * as safety from './safety'
import * as workflows from './workflows'
import * as billing from './billing'
import * as trust from './trust'
import * as mds from './mds'
import * as claims from './claims'
import * as workforce from './workforce'

const { SETTINGS: _settings, ...platformLists } = platform
const { AGENT_SCOPES: _scopes, PHI_AGENT_SCOPES: _phiScopes, PROPOSAL_KINDS: _kinds, ...agentLists } = agents
const { BED_STATUSES: _bed, APARTMENT_STATUSES: _apt, ...placeLists } = places
const { CODE_STATUSES: _code, REPRESENTATIVE_ROLES: _roles, ADMISSION_SOURCES: _src, DISCHARGE_DISPOSITIONS: _disp, CENSUS_EVENT_KINDS: _cek, PAYER_KINDS: _payers, ...residentLists } = residents
const { LEAD_STATUSES: _lead, PORTAL_SCOPES: _portal, AUTHORITY_BASES: _ab, SCOPE_AUTHORITY: _sa, MFA_SCOPES: _mfa, ...salesLists } = sales

const { NOTE_KINDS: _nk, VITAL_KINDS: _vk, ORDER_KINDS: _ok, TASK_KINDS: _tk, rl: _rl, scope: _sc, stamps: _st, choice: _ch, ...clinicalLists } = clinical
const { DRUG_SCHEDULES: _ds, SUPPLY_KINDS: _sk, MOVEMENT_KINDS: _mk, SLOT_STATUSES: _ss, ADMIN_OUTCOMES: _ao, BALANCE_READERS: _br, ...medicationLists } = medications
const { INCIDENT_KINDS: _ik, ...safetyLists } = safety
const { RATE_KINDS: _rk, CHARGE_KINDS: _chk, PAYMENT_METHODS: _pm, DEPOSIT_KINDS: _dk, ...billingLists } = billing
const { MDS_KINDS: _mdsk, coverageDepthFields: _cdf, ...mdsLists } = mds
const { CLAIM_STATUSES: _ccs, DENIAL_STATUSES: _cds, ...claimLists } = claims
const { TRUST_BUCKETS: _tb, TRUST_TX_KINDS: _ttk, ...trustLists } = trust

export const models = {
  User,
  Role,
  OAuthApp,
  OAuthToken,
  ...platformLists,
  ...agentLists,
  ...placeLists,
  ...residentLists,
  ...salesLists,
  ...clinicalLists,
  ...medicationLists,
  ...safetyLists,
  ...workflows,
  ...billingLists,
  ...trustLists,
  ...mdsLists,
  ...claimLists,
  ...workforce,
}

export default models
