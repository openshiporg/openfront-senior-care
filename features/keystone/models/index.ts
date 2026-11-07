import { User } from './User'
import { Role } from './Role'
import { OAuthApp } from './OAuthApp'
import { OAuthToken } from './OAuthToken'
import * as platform from './platform'
import * as agents from './agents'
import * as places from './places'
import * as residents from './residents'
import * as sales from './sales'

const { SETTINGS: _settings, ...platformLists } = platform
const { AGENT_SCOPES: _scopes, PHI_AGENT_SCOPES: _phiScopes, PROPOSAL_KINDS: _kinds, ...agentLists } = agents
const { BED_STATUSES: _bed, APARTMENT_STATUSES: _apt, ...placeLists } = places
const { CODE_STATUSES: _code, REPRESENTATIVE_ROLES: _roles, ADMISSION_SOURCES: _src, DISCHARGE_DISPOSITIONS: _disp, CENSUS_EVENT_KINDS: _cek, PAYER_KINDS: _payers, ...residentLists } = residents
const { LEAD_STATUSES: _lead, PORTAL_SCOPES: _portal, AUTHORITY_BASES: _ab, SCOPE_AUTHORITY: _sa, MFA_SCOPES: _mfa, ...salesLists } = sales

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
}

export default models
