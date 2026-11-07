"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// keystone.ts
var keystone_exports = {};
__export(keystone_exports, {
  default: () => keystone_default2
});
module.exports = __toCommonJS(keystone_exports);

// features/keystone/index.ts
var import_auth = require("@keystone-6/auth");
var import_core13 = require("@keystone-6/core");
var import_config = require("dotenv/config");

// features/keystone/models/User.ts
var import_core = require("@keystone-6/core");
var import_access = require("@keystone-6/core/access");
var import_fields2 = require("@keystone-6/core/fields");

// features/keystone/models/trackingFields.ts
var import_fields = require("@keystone-6/core/fields");
var trackingFields = {
  createdAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  }),
  updatedAt: (0, import_fields.timestamp)({
    access: { read: () => true, create: () => false, update: () => false },
    db: { updatedAt: true },
    validation: { isRequired: true },
    defaultValue: { kind: "now" },
    ui: {
      createView: { fieldMode: "hidden" },
      itemView: { fieldMode: "read" }
    }
  })
};

// features/keystone/access.ts
var permissionNames = [
  // Starter and fleet-mandatory
  "canSeeOtherPeople",
  "canEditOtherPeople",
  "canManagePeople",
  "canManageRoles",
  "canAccessDashboard",
  "canManageOnboarding",
  "canManagePayments",
  "canIssueRefunds",
  "canReadAudit",
  // Operator and communities
  "canManageOperator",
  "canManageCommunities",
  "canManagePlaces",
  "canManageIntegrations",
  "canApproveIntegrations",
  // Sales and storefront
  "canManageSales",
  "canManageStorefront",
  "canReadSales",
  // Residents and census
  "canAdmitDischarge",
  "canRecordCensus",
  "canManageRepresentatives",
  "canApproveCensusCorrections",
  "canReadResidentDemographics",
  // Clinical
  "canChartPointOfCare",
  "canChartNursing",
  "canManageAssessments",
  "canManageCarePlans",
  "canEnterOrders",
  "canSignOrders",
  "canApproveClinicalCorrections",
  "canReadClinical",
  "canReadSensitiveClinical",
  // Medications
  "canAdministerMeds",
  "canWitnessControlled",
  "canManagePharmacy",
  "canResolveCountDiscrepancy",
  "canApproveControlledAdjustments",
  // Incidents and infection prevention
  "canReportIncident",
  "canInvestigateIncidents",
  "canManageInfectionControl",
  "canApproveIncidentDowngrade",
  "canDeclareOutbreak",
  "canReadIncidents",
  // Workforce
  "canManageSchedule",
  "canManageTimecards",
  "canManageCredentials",
  "canApproveTimecards",
  "canReadWorkforce",
  // Billing
  "canManageRates",
  "canManageBilling",
  "canManageClaims",
  "canPostPayments",
  "canApproveRates",
  "canApproveWriteOffs",
  "canReleaseClaims",
  "canReadBilling",
  "canReadIdentifiers",
  // Resident trust
  "canOperateTrust",
  "canApproveTrust",
  "canReadTrust",
  // Compliance and quality
  "canManageCompliance",
  "canManageSurveys",
  "canManageQapi",
  "canSubmitRegulatory",
  "canApproveCompliance",
  "canReadCompliance",
  // Portal and engagement
  "canManageFamilyUpdates",
  "canManageActivities",
  "canManageDietary",
  "canMessageFamilies",
  "canApprovePortalScopes",
  // AI workflows and agents
  "canManageWorkflows",
  "canManageAgents",
  "canApproveWorkflows",
  "canApproveAgentGrants",
  "canReadFindings",
  // Privacy
  "canBreakGlass",
  "canReviewBreakGlass",
  "canReadPhiAudit",
  // Raw status correction. Never seeded on a default role; every use is audited.
  "canBreakGlassRecords"
];
var NEVER_DEFAULT = ["canBreakGlassRecords"];
var approvalPermissions = permissionNames.filter(
  (name) => name.startsWith("canApprove") || name === "canReleaseClaims" || name === "canResolveCountDiscrepancy" || name === "canReviewBreakGlass" || name === "canBreakGlassRecords"
);
var isSignedIn = ({ session }) => {
  if (!session) return false;
  const expires = session.data?.accessExpiresAt;
  return !expires || Date.parse(expires) > Date.now();
};
var isStaff = ({ session }) => isSignedIn({ session }) && session?.data.kind !== "portal" && session?.data.role?.canAccessDashboard === true;
var hasPermission = (session, permission) => isSignedIn({ session }) && session?.data.kind !== "portal" && session?.data.role?.[permission] === true;
var permissions = Object.fromEntries(
  permissionNames.map((name) => [name, ({ session }) => hasPermission(session, name)])
);
var anyOf = (...names) => ({ session }) => names.some((name) => hasPermission(session, name));
var sys = () => false;
var rules = {
  canReadPeople: ({ session }) => !isSignedIn({ session }) ? false : session.data.role?.canSeeOtherPeople || session.data.role?.canManagePeople ? true : { id: { equals: session.itemId } },
  canUpdatePeople: ({ session }) => !isSignedIn({ session }) ? false : session.data.role?.canEditOtherPeople || session.data.role?.canManagePeople ? true : { id: { equals: session.itemId } }
};

// features/keystone/models/User.ts
var User = (0, import_core.list)({
  access: {
    operation: {
      ...(0, import_access.allOperations)(isSignedIn),
      create: (args) => {
        if (process.env.PUBLIC_SIGNUPS_ALLOWED === "true") {
          return true;
        }
        return permissions.canManagePeople(args);
      },
      delete: permissions.canManagePeople
    },
    filter: {
      query: rules.canReadPeople,
      update: rules.canUpdatePeople
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManagePeople(args),
    hideDelete: (args) => !permissions.canManagePeople(args),
    listView: {
      initialColumns: ["name", "email", "title", "role", "kind"]
    },
    itemView: {
      defaultFieldMode: ({ session, item }) => {
        if (session?.data.role?.canEditOtherPeople) return "edit";
        if (session?.itemId === item?.id) return "edit";
        return "read";
      }
    }
  },
  fields: {
    name: (0, import_fields2.text)({
      validation: {
        isRequired: true
      }
    }),
    email: (0, import_fields2.text)({
      isFilterable: false,
      isOrderable: false,
      isIndexed: "unique",
      validation: {
        isRequired: true
      }
    }),
    password: (0, import_fields2.password)({
      access: {
        read: import_access.denyAll,
        update: ({ session, item }) => permissions.canManagePeople({ session }) || session?.itemId === item.id
      },
      validation: { isRequired: true }
    }),
    role: (0, import_fields2.relationship)({
      ref: "Role.assignedTo",
      access: {
        create: permissions.canManagePeople,
        update: permissions.canManagePeople
      },
      ui: {
        itemView: {
          fieldMode: (args) => permissions.canManagePeople(args) ? "edit" : "read"
        }
      }
    }),
    kind: (0, import_fields2.select)({
      type: "enum",
      options: ["staff", "portal", "surveyor", "auditor", "administrator"].map((value) => ({ label: value, value })),
      defaultValue: "staff",
      access: { create: permissions.canManagePeople, update: permissions.canManagePeople }
    }),
    title: (0, import_fields2.text)(),
    assignments: (0, import_fields2.relationship)({ ref: "StaffAssignment.user", many: true, access: { create: () => false, update: () => false } }),
    portalAccount: (0, import_fields2.relationship)({ ref: "PortalAccount.user", access: { create: () => false, update: () => false } }),
    synthetic: (0, import_fields2.checkbox)({ defaultValue: false, access: { create: () => false, update: () => false } }),
    mfaEnrolled: (0, import_fields2.checkbox)({ defaultValue: false, access: { create: () => false, update: () => false } }),
    accessExpiresAt: (0, import_fields2.timestamp)({
      access: { create: permissions.canManagePeople, update: permissions.canManagePeople },
      ui: { description: "Time-boxed access for surveyors, auditors and temporary administrator users." }
    }),
    onboardingStatus: (0, import_fields2.select)({
      options: ["not_started", "in_progress", "completed", "dismissed"].map((value) => ({ label: value.replaceAll("_", " "), value })),
      defaultValue: "not_started"
    }),
    ...trackingFields
  }
});

// features/keystone/models/Role.ts
var import_core2 = require("@keystone-6/core");
var import_access3 = require("@keystone-6/core/access");
var import_fields3 = require("@keystone-6/core/fields");
var Role = (0, import_core2.list)({
  access: {
    operation: {
      ...(0, import_access3.allOperations)(permissions.canManageRoles),
      query: isSignedIn
    }
  },
  ui: {
    hideCreate: (args) => !permissions.canManageRoles(args),
    hideDelete: (args) => !permissions.canManageRoles(args),
    listView: {
      initialColumns: ["name", "assignedTo"]
    },
    itemView: {
      defaultFieldMode: (args) => permissions.canManageRoles(args) ? "edit" : "read"
    }
  },
  fields: {
    name: (0, import_fields3.text)({ validation: { isRequired: true } }),
    description: (0, import_fields3.text)({ ui: { displayMode: "textarea" } }),
    ...Object.fromEntries(permissionNames.map((name) => [name, (0, import_fields3.checkbox)({ defaultValue: false })])),
    ...trackingFields,
    assignedTo: (0, import_fields3.relationship)({
      ref: "User.role",
      many: true,
      ui: {
        itemView: { fieldMode: "read" }
      }
    })
  }
});

// features/keystone/models/OAuthApp.ts
var import_core3 = require("@keystone-6/core");
var import_fields4 = require("@keystone-6/core/fields");

// features/keystone/mcp-oauth/core.ts
var import_node_crypto = __toESM(require("node:crypto"));
var MCP_SCOPES = ["mcp:read", "mcp:write"];
var MCP_ACCESS_PREFIX = "mcp_at_";
var ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
var REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
var AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1e3;
var CONSENT_TICKET_TTL_MS = 10 * 60 * 1e3;
var DEVELOPMENT_SECRET = "this secret should only be used in testing";
function secret() {
  return process.env.SESSION_SECRET || DEVELOPMENT_SECRET;
}
function randomToken(prefix, bytes = 32) {
  return `${prefix}${import_node_crypto.default.randomBytes(bytes).toString("base64url")}`;
}
function digestToken(token, purpose = "mcp-oauth-token") {
  return import_node_crypto.default.createHmac("sha256", secret()).update(`${purpose}\0${token}`, "utf8").digest("hex");
}
function bearerToken(header) {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string") return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value);
  return match ? match[1] : null;
}
function isMcpAccessToken(token) {
  return typeof token === "string" && token.startsWith(MCP_ACCESS_PREFIX) && token.length > MCP_ACCESS_PREFIX.length;
}
function storedScopes(value) {
  return Array.isArray(value) ? MCP_SCOPES.filter((scope) => value.includes(scope)) : [];
}

// features/keystone/models/OAuthApp.ts
var OAuthApp = (0, import_core3.list)({
  access: {
    operation: {
      query: permissions.canManagePeople,
      create: permissions.canManagePeople,
      update: permissions.canManagePeople,
      delete: permissions.canManagePeople
    }
  },
  fields: {
    name: (0, import_fields4.text)({
      validation: {
        isRequired: true
      }
    }),
    clientId: (0, import_fields4.text)({
      isIndexed: "unique",
      hooks: {
        resolveInput: ({ operation, resolvedData }) => {
          if (operation === "create" && !resolvedData.clientId) {
            return randomToken("mcp_cl_", 18);
          }
          return resolvedData.clientId;
        }
      },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "read" },
        description: "Auto-generated unique identifier for your application."
      }
    }),
    clientSecret: (0, import_fields4.text)({
      access: {
        read: () => false
      },
      hooks: {
        resolveInput: ({ resolvedData }) => {
          if (resolvedData.clientSecret) {
            return digestToken(resolvedData.clientSecret, "oauth-client-secret");
          }
          return void 0;
        }
      },
      ui: {
        createView: { fieldMode: "hidden" },
        itemView: { fieldMode: "hidden" },
        description: "Stored only as a digest. Public MCP clients have no secret."
      }
    }),
    tokenEndpointAuthMethod: (0, import_fields4.select)({
      options: [
        { label: "Client secret (POST)", value: "client_secret_post" },
        { label: "Client secret (Basic)", value: "client_secret_basic" },
        { label: "None (public PKCE client)", value: "none" }
      ],
      defaultValue: "client_secret_post",
      ui: {
        description: "How the app authenticates at the token endpoint. MCP clients are public (none)."
      }
    }),
    redirectUris: (0, import_fields4.json)({
      defaultValue: [],
      ui: {
        description: "Array of allowed redirect URIs for OAuth callbacks"
      }
    }),
    scopes: (0, import_fields4.json)({
      defaultValue: [...MCP_SCOPES],
      ui: {
        description: "Array of allowed OAuth scopes. MCP scopes only narrow the signed-in user's own access."
      }
    }),
    webhookUrl: (0, import_fields4.text)({
      ui: {
        description: "URL to receive webhook notifications"
      }
    }),
    status: (0, import_fields4.select)({
      options: [
        { label: "Active", value: "active" },
        { label: "Suspended", value: "suspended" },
        { label: "Pending", value: "pending" }
      ],
      defaultValue: "active"
    }),
    installUrl: (0, import_fields4.text)({
      ui: {
        description: "URL where users can install this app"
      }
    }),
    uninstallUrl: (0, import_fields4.text)({
      ui: {
        description: "URL to handle app uninstallation"
      }
    }),
    description: (0, import_fields4.text)({
      ui: {
        displayMode: "textarea"
      }
    }),
    metadata: (0, import_fields4.json)({
      defaultValue: {},
      ui: {
        description: "Additional app-specific configuration and settings"
      }
    }),
    developerEmail: (0, import_fields4.text)(),
    privacyPolicyUrl: (0, import_fields4.text)(),
    termsOfServiceUrl: (0, import_fields4.text)(),
    supportUrl: (0, import_fields4.text)(),
    ...trackingFields
  },
  ui: {
    labelField: "name",
    listView: {
      initialColumns: ["name", "clientId", "status", "createdAt"]
    }
  }
});

// features/keystone/models/OAuthToken.ts
var import_core5 = require("@keystone-6/core");
var import_fields5 = require("@keystone-6/core/fields");
var digestTokenInput = {
  resolveInput: ({ resolvedData, fieldKey }) => resolvedData[fieldKey] ? digestToken(resolvedData[fieldKey]) : resolvedData[fieldKey]
};
var OAuthToken = (0, import_core5.list)({
  access: {
    operation: {
      query: permissions.canManagePeople,
      create: permissions.canManagePeople,
      update: permissions.canManagePeople,
      delete: permissions.canManagePeople
    }
  },
  fields: {
    tokenType: (0, import_fields5.select)({
      options: [
        { label: "Authorization Code", value: "authorization_code" },
        { label: "Access Token", value: "access_token" },
        { label: "Refresh Token", value: "refresh_token" }
      ],
      validation: {
        isRequired: true
      }
    }),
    token: (0, import_fields5.text)({
      access: { read: () => false },
      validation: {
        isRequired: true
      },
      isIndexed: "unique",
      hooks: digestTokenInput
    }),
    clientId: (0, import_fields5.text)({
      validation: {
        isRequired: true
      },
      isIndexed: true
    }),
    user: (0, import_fields5.relationship)({
      ref: "User",
      ui: {
        description: "The user who authorized this token"
      }
    }),
    scopes: (0, import_fields5.json)({
      defaultValue: [],
      ui: {
        description: "Array of granted scopes"
      }
    }),
    redirectUri: (0, import_fields5.text)({
      ui: {
        description: "The redirect URI used during authorization"
      }
    }),
    resource: (0, import_fields5.text)({
      ui: {
        description: "The MCP endpoint (RFC 8707 resource) this grant is for"
      }
    }),
    expiresAt: (0, import_fields5.timestamp)({
      ui: {
        description: "When this token expires"
      }
    }),
    isRevoked: (0, import_fields5.select)({
      options: [
        { label: "Active", value: "false" },
        { label: "Revoked", value: "true" }
      ],
      defaultValue: "false"
    }),
    authorizationCode: (0, import_fields5.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "The authorization code that was exchanged for this token (for access tokens)"
      }
    }),
    refreshToken: (0, import_fields5.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "Associated refresh token (for access tokens)"
      }
    }),
    accessToken: (0, import_fields5.text)({
      access: { read: () => false },
      hooks: digestTokenInput,
      ui: {
        description: "Associated access token (for refresh tokens)"
      }
    }),
    state: (0, import_fields5.text)({
      ui: {
        description: "OAuth state parameter for CSRF protection"
      }
    }),
    codeChallenge: (0, import_fields5.text)({
      ui: {
        description: "PKCE code challenge"
      }
    }),
    codeChallengeMethod: (0, import_fields5.select)({
      options: [
        { label: "Plain", value: "plain" },
        { label: "SHA256", value: "S256" }
      ],
      ui: {
        description: "PKCE code challenge method"
      }
    }),
    ...trackingFields
  },
  ui: {
    labelField: "clientId",
    listView: {
      initialColumns: ["tokenType", "clientId", "user", "scopes", "expiresAt", "isRevoked"]
    }
  }
});

// features/keystone/models/platform.ts
var platform_exports = {};
__export(platform_exports, {
  AgentIdentity: () => AgentIdentity,
  ApprovalDecision: () => ApprovalDecision,
  ApprovalPolicy: () => ApprovalPolicy,
  ApprovalRequest: () => ApprovalRequest,
  AuditEvent: () => AuditEvent,
  BreakGlassGrant: () => BreakGlassGrant,
  CommandReceipt: () => CommandReceipt,
  Community: () => Community,
  ComplianceClock: () => ComplianceClock,
  DeviceRegistration: () => DeviceRegistration,
  Document: () => Document,
  DocumentTemplate: () => DocumentTemplate,
  HolidayCalendar: () => HolidayCalendar,
  HolidayDate: () => HolidayDate,
  Job: () => Job,
  JobRun: () => JobRun,
  JurisdictionPack: () => JurisdictionPack,
  Lease: () => Lease,
  Notification: () => Notification,
  NotificationDelivery: () => NotificationDelivery,
  OperatorSettings: () => OperatorSettings,
  OutboxEvent: () => OutboxEvent,
  PhiReadAudit: () => PhiReadAudit,
  ProcessorRegistration: () => ProcessorRegistration,
  RegulatoryObligation: () => RegulatoryObligation,
  RequestRateLimitBucket: () => RequestRateLimitBucket,
  SETTINGS: () => SETTINGS,
  SecretBox: () => SecretBox,
  Sequence: () => Sequence,
  StaffAssignment: () => StaffAssignment
});
var import_core7 = require("@keystone-6/core");
var import_fields7 = require("@keystone-6/core/fields");

// features/keystone/models/domainFields.ts
var import_fields6 = require("@keystone-6/core/fields");
var minor = (options = {}) => (0, import_fields6.bigInt)({
  ...options.defaultValue !== void 0 ? { defaultValue: options.defaultValue } : {},
  validation: { isRequired: options.required ?? options.defaultValue !== void 0 },
  ...options.description ? { ui: { description: options.description } } : {}
});
var exact = (precision, scale) => (options = {}) => (0, import_fields6.decimal)({
  precision,
  scale,
  validation: { isRequired: options.required ?? false },
  ...options.description ? { ui: { description: options.description } } : {}
});
var rate = exact(18, 4);
var factor = exact(12, 6);
var medQty = exact(14, 3);
var measurement = exact(12, 3);
var hours = exact(8, 2);
var option = (value) => ({ label: value.replaceAll("_", " ").replaceAll(".", " \xB7 "), value });
var lifecycle = (values, initial = values[0]) => (0, import_fields6.select)({
  type: "string",
  options: values.map(option),
  defaultValue: initial,
  validation: { isRequired: true },
  access: { create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
});
var choice = (values, initial = values[0]) => (0, import_fields6.select)({
  type: "string",
  options: values.map(option),
  ...initial !== null ? { defaultValue: initial } : {},
  validation: { isRequired: initial !== null }
});
var versionField = () => (0, import_fields6.integer)({
  defaultValue: 0,
  validation: { isRequired: true },
  access: { create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
});
var systemText = (options = {}) => (0, import_fields6.text)({
  ...options.indexed ? { isIndexed: options.indexed } : {},
  validation: { isRequired: options.required ?? false },
  access: { create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
});
var readOnly = { access: { create: () => false, update: () => false }, ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } } };
var fixedChoice = (values) => (0, import_fields6.select)({
  type: "string",
  options: values.map(option),
  validation: { isRequired: true },
  access: { create: () => false, update: () => false },
  ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" } }
});

// features/keystone/models/listAccess.ts
var rule = (permission) => permission === "signedIn" ? isSignedIn : Array.isArray(permission) ? anyOf(...permission) : permissions[permission];
var governed = (read) => ({
  operation: { query: rule(read), create: sys, update: sys, delete: sys }
});
var managed = (read, write) => ({
  operation: { query: rule(read), create: rule(write), update: rule(write), delete: sys }
});
var immutable = governed;
var serverOnly = {
  operation: { query: sys, create: sys, update: sys, delete: sys }
};

// features/keystone/models/scope.ts
var cache = /* @__PURE__ */ new WeakMap();
function assignedCommunities(session, context) {
  if (!session || !isStaff({ session })) return Promise.resolve([]);
  if (hasPermission(session, "canManageOperator")) return Promise.resolve("all");
  const hit = cache.get(session);
  if (hit) return hit;
  const promise = (async () => {
    const today = /* @__PURE__ */ new Date();
    const rows = await context.sudo().prisma.staffAssignment.findMany({
      where: {
        userId: session.itemId,
        status: "active",
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }]
      },
      select: { communityId: true }
    });
    return [...new Set(rows.map((row) => row.communityId).filter(Boolean))];
  })();
  cache.set(session, promise);
  return promise;
}
function communityWhere(path, ids) {
  let where = { id: { in: ids } };
  for (const key of [...path].reverse()) where = { [key]: where };
  return where;
}
var assignedFilter = (path) => async ({ session, context }) => {
  const scope = await assignedCommunities(session, context);
  if (scope === "all") return true;
  return communityWhere(path, scope);
};
var rule2 = (permission) => Array.isArray(permission) ? anyOf(...permission) : anyOf(permission);
var sys2 = () => false;
var scopedGoverned = (read, path) => ({
  operation: { query: rule2(read), create: sys2, update: sys2, delete: sys2 },
  filter: { query: assignedFilter(path) }
});
var scopedManaged = (read, write, path) => ({
  operation: { query: rule2(read), create: rule2(write), update: rule2(write), delete: sys2 },
  filter: { query: assignedFilter(path), update: assignedFilter(path) }
});

// features/keystone/models/platform.ts
var SETTINGS = ["nursing_facility", "assisted_living", "memory_care", "independent_living"];
var staffRead = { query: isStaff };
var OperatorSettings = (0, import_core7.list)({
  isSingleton: true,
  graphql: { plural: "OperatorSettingsItems" },
  access: { operation: { ...staffRead, create: permissions.canManageOperator, update: permissions.canManageOperator, delete: () => false } },
  fields: {
    legalName: (0, import_fields7.text)({ validation: { isRequired: true }, defaultValue: "Openfront Senior Care" }),
    displayName: (0, import_fields7.text)({ validation: { isRequired: true }, defaultValue: "Openfront Senior Care" }),
    homeTimeZone: (0, import_fields7.text)({ defaultValue: "America/New_York", validation: { isRequired: true } }),
    jurisdictionPacks: (0, import_fields7.relationship)({ ref: "JurisdictionPack", many: true }),
    // Changed only through the maker-checker mutation requestOperatorControls.
    inferencePolicy: (0, import_fields7.select)({ type: "string", options: ["self_hosted_only", "self_hosted_or_baa", "any_registered"].map((value) => ({ label: value.replaceAll("_", " "), value })), defaultValue: "self_hosted_only", validation: { isRequired: true }, ...readOnly }),
    breakGlassMaxHours: (0, import_fields7.integer)({ ...readOnly, defaultValue: 4 }),
    reauthMinutes: (0, import_fields7.integer)({ ...readOnly, defaultValue: 15 }),
    bedHoldNoticeGraceHours: (0, import_fields7.integer)({ ...readOnly, defaultValue: 24, ui: { ...readOnly.ui, description: 'Operator policy: how long after an emergency transfer the written bed-hold notice may be recorded. 42 CFR 483.15(d)(2) says "at the time of transfer"; the grace window is policy (verify with counsel).' } }),
    writeOffApprovalThresholdMinor: minor({ defaultValue: 0n }),
    refundApprovalThresholdMinor: minor({ defaultValue: 0n }),
    trustApprovalThresholdMinor: minor({ defaultValue: 0n }),
    strictAgentOwnerSoD: (0, import_fields7.checkbox)({ ...readOnly, defaultValue: true }),
    synthetic: (0, import_fields7.checkbox)({ defaultValue: false, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var Community = (0, import_core7.list)({
  access: {
    operation: { query: isStaff, create: permissions.canManageCommunities, update: permissions.canManageCommunities, delete: () => false },
    filter: { query: assignedFilter([]), update: assignedFilter([]) }
  },
  ui: { labelField: "name", listView: { initialColumns: ["name", "reference", "status", "timeZone"] } },
  fields: {
    name: (0, import_fields7.text)({ validation: { isRequired: true } }),
    slug: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true, match: { regex: /^[a-z0-9-]{2,60}$/, explanation: "Lowercase letters, digits and hyphens" } } }),
    reference: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true, match: { regex: /^[A-Z]{2,5}$/, explanation: "2-5 capital letters" } } }),
    timeZone: (0, import_fields7.text)({ defaultValue: "America/New_York", validation: { isRequired: true } }),
    addressLine1: (0, import_fields7.text)(),
    addressLine2: (0, import_fields7.text)(),
    city: (0, import_fields7.text)(),
    region: (0, import_fields7.text)(),
    postalCode: (0, import_fields7.text)(),
    country: (0, import_fields7.text)({ defaultValue: "US" }),
    phone: (0, import_fields7.text)(),
    settingsOffered: (0, import_fields7.json)({ defaultValue: [] }),
    jurisdictionPack: (0, import_fields7.relationship)({ ref: "JurisdictionPack" }),
    holidayCalendar: (0, import_fields7.relationship)({ ref: "HolidayCalendar" }),
    identifiers: (0, import_fields7.json)({ defaultValue: {}, ui: { description: "CCN, NPI, state licence, Medicaid provider id, NHSN OrgID. Seeded values are fictional." } }),
    bedHoldPolicy: (0, import_fields7.relationship)({ ref: "BedHoldPolicy" }),
    buildings: (0, import_fields7.relationship)({ ref: "Building.community", many: true }),
    units: (0, import_fields7.relationship)({ ref: "Unit.community", many: true }),
    storefront: (0, import_fields7.relationship)({ ref: "StorefrontSite.community" }),
    synthetic: (0, import_fields7.checkbox)({ defaultValue: false, ...readOnly }),
    status: choice(["setup", "active", "closed"], "setup"),
    ...trackingFields
  }
});
var StaffAssignment = (0, import_core7.list)({
  access: {
    operation: { query: isStaff, create: permissions.canManagePeople, update: permissions.canManagePeople, delete: () => false },
    filter: {
      query: ({ session }) => session?.data?.role?.canManagePeople ? true : { user: { id: { equals: session?.itemId ?? "" } } }
    }
  },
  ui: { listView: { initialColumns: ["user", "community", "role", "status", "effectiveFrom"] } },
  fields: {
    user: (0, import_fields7.relationship)({ ref: "User.assignments" }),
    community: (0, import_fields7.relationship)({ ref: "Community" }),
    units: (0, import_fields7.relationship)({ ref: "Unit", many: true, ui: { description: "Empty means every unit in the community." } }),
    role: (0, import_fields7.relationship)({ ref: "Role", ui: { description: "Overrides the user role in this community." } }),
    effectiveFrom: (0, import_fields7.calendarDay)(),
    effectiveTo: (0, import_fields7.calendarDay)(),
    status: choice(["active", "ended"], "active"),
    ...trackingFields
  }
});
var DeviceRegistration = (0, import_core7.list)({
  access: scopedManaged("canManageCommunities", "canManageCommunities", ["community"]),
  ui: { listView: { initialColumns: ["name", "community", "unit", "revokedAt"] } },
  fields: {
    community: (0, import_fields7.relationship)({ ref: "Community" }),
    unit: (0, import_fields7.relationship)({ ref: "Unit" }),
    name: (0, import_fields7.text)({ validation: { isRequired: true } }),
    deviceKeyHash: systemText(),
    allowedKinds: (0, import_fields7.json)({ defaultValue: ["poc", "emar"] }),
    revokedAt: (0, import_fields7.timestamp)(),
    ...trackingFields
  }
});
var BreakGlassGrant = (0, import_core7.list)({
  access: {
    operation: { query: permissions.canAccessDashboard, create: () => false, update: () => false, delete: () => false },
    filter: {
      query: ({ session }) => session?.data?.role?.canReviewBreakGlass ? true : { user: { id: { equals: session?.itemId ?? "" } } }
    }
  },
  ui: { listView: { initialColumns: ["user", "resident", "reason", "status", "expiresAt"] } },
  fields: {
    user: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    resident: (0, import_fields7.relationship)({ ref: "Resident", ...readOnly }),
    reason: fixedChoiceText(["emergency_care", "coverage_gap", "other"]),
    note: systemText({ required: true }),
    requestedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    expiresAt: (0, import_fields7.timestamp)({ ...readOnly }),
    endedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    status: lifecycle(["active", "ended", "reviewed_ok", "reviewed_violation"]),
    reviewedBy: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    reviewNote: systemText(),
    version: versionField(),
    ...trackingFields
  }
});
function fixedChoiceText(values) {
  return (0, import_fields7.select)({ type: "string", options: values.map((value) => ({ label: value.replaceAll("_", " "), value })), validation: { isRequired: true }, ...readOnly });
}
var AgentIdentity = (0, import_core7.list)({
  access: { operation: { query: permissions.canAccessDashboard, create: permissions.canManageAgents, update: () => false, delete: () => false } },
  ui: { labelField: "name" },
  fields: {
    name: (0, import_fields7.text)({ validation: { isRequired: true }, isIndexed: "unique" }),
    kind: choice(["llm_agent", "rules_engine", "external_mcp_client"], "llm_agent"),
    model: (0, import_fields7.text)(),
    provider: (0, import_fields7.text)(),
    owner: (0, import_fields7.relationship)({ ref: "User" }),
    status: lifecycle(["active", "suspended", "retired"]),
    killSwitch: (0, import_fields7.checkbox)({ defaultValue: false, ...readOnly }),
    oauthApp: (0, import_fields7.relationship)({ ref: "OAuthApp" }),
    grants: (0, import_fields7.relationship)({ ref: "AgentToolGrant.agent", many: true, ...readOnly }),
    runs: (0, import_fields7.relationship)({ ref: "AgentRun.agent", many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var AuditEvent = (0, import_core7.list)({
  access: immutable("canReadAudit"),
  ui: { labelField: "eventType", listView: { initialColumns: ["seq", "at", "eventType", "entityType", "entityId", "actorUser"], initialSort: { field: "seq", direction: "DESC" } } },
  fields: {
    seq: (0, import_fields7.integer)({ isIndexed: "unique", validation: { isRequired: true }, ...readOnly }),
    eventKey: systemText({ indexed: "unique", required: true }),
    eventType: systemText({ indexed: true, required: true }),
    entityType: systemText({ indexed: true, required: true }),
    entityId: systemText({ indexed: true, required: true }),
    actorUser: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    actorAgent: (0, import_fields7.relationship)({ ref: "AgentIdentity", ...readOnly }),
    approver: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    reason: systemText(),
    before: (0, import_fields7.json)({ ...readOnly }),
    after: (0, import_fields7.json)({ ...readOnly }),
    metadata: (0, import_fields7.json)({ ...readOnly }),
    requestId: systemText(),
    prevHash: systemText({ required: true }),
    hash: systemText({ indexed: "unique", required: true }),
    at: (0, import_fields7.timestamp)({ validation: { isRequired: true }, defaultValue: { kind: "now" }, ...readOnly })
  }
});
var PhiReadAudit = (0, import_core7.list)({
  access: immutable("canReadPhiAudit"),
  ui: { labelField: "operationName", listView: { initialColumns: ["occurredAt", "actorReference", "operationName", "purpose", "resultCount", "breakGlass"], initialSort: { field: "occurredAt", direction: "DESC" } } },
  fields: {
    occurredAt: (0, import_fields7.timestamp)({ ...readOnly, defaultValue: { kind: "now" }, db: { isNullable: false }, validation: { isRequired: true } }),
    actorReference: systemText({ indexed: true, required: true }),
    actorKind: systemText(),
    operationType: systemText(),
    operationName: systemText(),
    rootFields: (0, import_fields7.json)({ ...readOnly }),
    selectedFields: (0, import_fields7.json)({ ...readOnly }),
    selectionDigest: systemText(),
    resultReferenceDigest: systemText(),
    resourceReferences: (0, import_fields7.json)({ ...readOnly }),
    purpose: systemText({ required: true }),
    breakGlass: (0, import_fields7.checkbox)({ defaultValue: false, ...readOnly }),
    correlationReference: systemText(),
    resultCount: (0, import_fields7.integer)({ defaultValue: 0, ...readOnly }),
    success: (0, import_fields7.checkbox)({ defaultValue: true, ...readOnly })
  }
});
var CommandReceipt = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    command: (0, import_fields7.text)({ validation: { isRequired: true } }),
    principalKey: (0, import_fields7.text)({ validation: { isRequired: true } }),
    requestHash: (0, import_fields7.text)({ validation: { isRequired: true } }),
    requestParams: (0, import_fields7.json)(),
    responseCode: (0, import_fields7.text)(),
    responseBody: (0, import_fields7.json)(),
    recoveryPoint: (0, import_fields7.text)({ defaultValue: "completed" }),
    completedAt: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" } }),
    ...trackingFields
  }
});
var OutboxEvent = (0, import_core7.list)({
  access: governed("canManageIntegrations"),
  ui: { listView: { initialColumns: ["topic", "status", "attempts", "nextAttemptAt", "aggregateType", "aggregateId"] } },
  fields: {
    topic: systemText({ indexed: true, required: true }),
    aggregateType: systemText({ required: true }),
    aggregateId: systemText({ indexed: true, required: true }),
    dedupeKey: systemText({ indexed: "unique", required: true }),
    payload: (0, import_fields7.json)({ ...readOnly }),
    status: lifecycle(["pending", "leased", "delivered", "failed", "dead"]),
    attempts: (0, import_fields7.integer)({ defaultValue: 0, ...readOnly }),
    nextAttemptAt: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" }, ...readOnly }),
    leaseOwner: systemText(),
    leaseExpiresAt: (0, import_fields7.timestamp)({ ...readOnly }),
    fencingToken: (0, import_fields7.integer)({ defaultValue: 0, ...readOnly }),
    lastError: systemText(),
    deliveredAt: (0, import_fields7.timestamp)({ ...readOnly }),
    ...trackingFields
  }
});
var Lease = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    owner: (0, import_fields7.text)({ validation: { isRequired: true } }),
    fencingToken: (0, import_fields7.integer)({ defaultValue: 0, validation: { isRequired: true } }),
    expiresAt: (0, import_fields7.timestamp)({ validation: { isRequired: true } }),
    ...trackingFields
  }
});
var Job = (0, import_core7.list)({
  access: governed("canManageIntegrations"),
  fields: {
    kind: systemText({ indexed: "unique", required: true }),
    intervalSeconds: (0, import_fields7.integer)({ ...readOnly }),
    nextRunAt: (0, import_fields7.timestamp)({ ...readOnly }),
    lastRunAt: (0, import_fields7.timestamp)({ ...readOnly }),
    status: lifecycle(["idle", "running", "failed", "disabled"], "idle"),
    leaseKey: systemText(),
    lastError: systemText(),
    runs: (0, import_fields7.relationship)({ ref: "JobRun.job", many: true, ...readOnly }),
    ...trackingFields
  }
});
var JobRun = (0, import_core7.list)({
  access: governed(["canManageIntegrations", "canRecordCensus"]),
  ui: { listView: { initialColumns: ["job", "scopeKey", "status", "startedAt", "finishedAt"] } },
  fields: {
    job: (0, import_fields7.relationship)({ ref: "Job.runs", ...readOnly }),
    kind: systemText({ indexed: true, required: true }),
    scopeKey: systemText({ indexed: true }),
    status: lifecycle(["running", "succeeded", "failed"]),
    startedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    finishedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    summary: (0, import_fields7.json)({ ...readOnly }),
    fencingToken: (0, import_fields7.integer)({ ...readOnly }),
    ...trackingFields
  }
});
var Sequence = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    nextValue: (0, import_fields7.integer)({ defaultValue: 1, validation: { isRequired: true } })
  }
});
var RequestRateLimitBucket = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    bucketKey: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    count: (0, import_fields7.integer)({ defaultValue: 0, validation: { isRequired: true } }),
    windowStartsAt: (0, import_fields7.timestamp)({ validation: { isRequired: true } }),
    expiresAt: (0, import_fields7.timestamp)({ validation: { isRequired: true } })
  }
});
var Notification = (0, import_core7.list)({
  access: {
    operation: { query: permissions.canAccessDashboard, create: () => false, update: permissions.canAccessDashboard, delete: () => false },
    filter: {
      query: ({ session }) => session ? { recipient: { id: { equals: session.itemId } } } : false,
      update: ({ session }) => session ? { recipient: { id: { equals: session.itemId } } } : false
    }
  },
  fields: {
    recipient: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    channel: choice(["in_app", "email", "sms"], "in_app"),
    template: systemText({ required: true }),
    payloadRef: (0, import_fields7.json)({ ...readOnly, ui: { ...readOnly.ui, description: "References only (ids, links), never PHI." } }),
    status: lifecycle(["pending", "sent", "failed"]),
    deliveries: (0, import_fields7.relationship)({ ref: "NotificationDelivery.notification", many: true, ...readOnly }),
    sentAt: (0, import_fields7.timestamp)({ ...readOnly }),
    readAt: (0, import_fields7.timestamp)(),
    ...trackingFields
  }
});
var NotificationDelivery = (0, import_core7.list)({
  access: governed("canManageIntegrations"),
  fields: {
    notification: (0, import_fields7.relationship)({ ref: "Notification.deliveries", ...readOnly }),
    attempt: (0, import_fields7.integer)({ defaultValue: 1, ...readOnly }),
    outcome: (0, import_fields7.select)({ type: "string", options: ["sent", "failed", "unknown"].map((value) => ({ label: value, value })), validation: { isRequired: true }, ...readOnly }),
    providerMessageId: systemText(),
    at: (0, import_fields7.timestamp)({ ...readOnly, defaultValue: { kind: "now" } })
  }
});
var HolidayCalendar = (0, import_core7.list)({
  access: managed("signedIn", "canManageCommunities"),
  ui: { labelField: "code" },
  fields: {
    code: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    name: (0, import_fields7.text)(),
    timeZone: (0, import_fields7.text)({ validation: { isRequired: true }, defaultValue: "America/New_York" }),
    weekendDays: (0, import_fields7.json)({ defaultValue: [0, 6] }),
    dates: (0, import_fields7.relationship)({ ref: "HolidayDate.calendar", many: true }),
    coverageThrough: (0, import_fields7.calendarDay)({ ui: { description: "Working-day clocks past this date fail closed." } }),
    source: (0, import_fields7.text)({ ui: { description: "Where the holiday table came from and when it was checked." } }),
    ...trackingFields
  }
});
var HolidayDate = (0, import_core7.list)({
  access: managed("signedIn", "canManageCommunities"),
  ui: { labelField: "name", listView: { initialColumns: ["calendar", "date", "name"] } },
  fields: {
    calendar: (0, import_fields7.relationship)({ ref: "HolidayCalendar.dates" }),
    date: (0, import_fields7.calendarDay)({ validation: { isRequired: true } }),
    name: (0, import_fields7.text)(),
    ...trackingFields
  }
});
var ApprovalPolicy = (0, import_core7.list)({
  access: { operation: { query: permissions.canAccessDashboard, create: permissions.canManageOperator, update: () => false, delete: () => false } },
  ui: { labelField: "action" },
  fields: {
    action: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    description: (0, import_fields7.text)(),
    requiredPermission: (0, import_fields7.text)({ validation: { isRequired: true } }),
    minApprovals: (0, import_fields7.integer)({ defaultValue: 1, validation: { min: 1 } }),
    thresholdMinor: minor(),
    expiresAfterMinutes: (0, import_fields7.integer)({ defaultValue: 1440 }),
    ...trackingFields
  }
});
var ApprovalRequest = (0, import_core7.list)({
  access: governed("canAccessDashboard"),
  ui: { labelField: "action", listView: { initialColumns: ["action", "status", "targetList", "requestedBy", "createdAt", "expiresAt"] } },
  fields: {
    action: systemText({ indexed: true, required: true }),
    summary: systemText(),
    community: (0, import_fields7.relationship)({ ref: "Community", ...readOnly }),
    targetList: systemText({ required: true }),
    targetId: systemText({ indexed: true, required: true }),
    payload: (0, import_fields7.json)({ ...readOnly }),
    payloadHash: systemText({ required: true }),
    requiredPermission: systemText({ required: true }),
    requestedBy: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    requestedByAgent: (0, import_fields7.relationship)({ ref: "AgentIdentity", ...readOnly }),
    status: lifecycle(["pending", "approved", "rejected", "expired", "cancelled"]),
    expiresAt: (0, import_fields7.timestamp)({ ...readOnly }),
    consumedAt: (0, import_fields7.timestamp)({ ...readOnly, ui: { ...readOnly.ui, description: "When the approved action was carried out. An approval is used once." } }),
    decisions: (0, import_fields7.relationship)({ ref: "ApprovalDecision.request", many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var ApprovalDecision = (0, import_core7.list)({
  access: immutable("canAccessDashboard"),
  fields: {
    request: (0, import_fields7.relationship)({ ref: "ApprovalRequest.decisions", ...readOnly }),
    decidedBy: (0, import_fields7.relationship)({ ref: "User", ...readOnly }),
    decision: (0, import_fields7.select)({ type: "string", options: ["approve", "reject"].map((value) => ({ label: value, value })), validation: { isRequired: true }, ...readOnly }),
    reason: systemText(),
    at: (0, import_fields7.timestamp)({ defaultValue: { kind: "now" }, ...readOnly })
  }
});
var Document = (0, import_core7.list)({
  access: {
    operation: { query: isStaff, create: () => false, update: () => false, delete: () => false },
    filter: { query: assignedFilter(["community"]) }
  },
  fields: {
    title: (0, import_fields7.text)({ validation: { isRequired: true } }),
    kind: choice(["admission_agreement", "residency_agreement", "notice", "bed_hold_policy", "authority", "advance_directive", "referral_packet", "pasrr", "photo", "floor_plan", "policy", "pack_source", "other"], "other"),
    community: (0, import_fields7.relationship)({ ref: "Community", ...readOnly }),
    resident: (0, import_fields7.relationship)({ ref: "Resident", ...readOnly }),
    phiTier: (0, import_fields7.select)({ type: "string", options: ["pub", "op", "dem", "clin", "sens", "ident", "fin"].map((value) => ({ label: value, value })), defaultValue: "op", validation: { isRequired: true }, ...readOnly }),
    template: (0, import_fields7.relationship)({ ref: "DocumentTemplate", ...readOnly }),
    storageKey: systemText(),
    sha256: systemText(),
    mimeType: systemText(),
    sizeBytes: (0, import_fields7.integer)({ ...readOnly }),
    documentVersion: (0, import_fields7.integer)({ defaultValue: 1, ...readOnly }),
    supersedes: (0, import_fields7.relationship)({ ref: "Document", ...readOnly }),
    status: lifecycle(["draft", "pending_signature", "signed", "final", "entered_in_error"], "final"),
    signedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    retentionUntil: (0, import_fields7.calendarDay)({ ...readOnly }),
    ...trackingFields
  }
});
var DocumentTemplate = (0, import_core7.list)({
  access: managed("canAccessDashboard", "canManageCompliance"),
  ui: { labelField: "name" },
  fields: {
    key: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    name: (0, import_fields7.text)({ validation: { isRequired: true } }),
    kind: choice(["admission_agreement", "residency_agreement", "notice", "bed_hold_policy", "other"], "notice"),
    jurisdictionPack: (0, import_fields7.relationship)({ ref: "JurisdictionPack" }),
    body: (0, import_fields7.text)({ ui: { displayMode: "textarea" } }),
    templateVersion: (0, import_fields7.integer)({ defaultValue: 1 }),
    verifyNote: (0, import_fields7.text)({ ui: { displayMode: "textarea", description: "Shown on generated notices until counsel confirms the wording." } }),
    ...trackingFields
  }
});
var SecretBox = (0, import_core7.list)({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    purpose: (0, import_fields7.text)({ validation: { isRequired: true } }),
    ciphertext: (0, import_fields7.text)({ validation: { isRequired: true } }),
    iv: (0, import_fields7.text)({ validation: { isRequired: true } }),
    authTag: (0, import_fields7.text)({ validation: { isRequired: true } }),
    keyVersion: (0, import_fields7.integer)({ defaultValue: 1 }),
    ...trackingFields
  }
});
var ProcessorRegistration = (0, import_core7.list)({
  access: managed("canManageIntegrations", "canManageIntegrations"),
  ui: { labelField: "processor" },
  fields: {
    processor: (0, import_fields7.text)({ validation: { isRequired: true } }),
    service: (0, import_fields7.text)(),
    baaDocument: (0, import_fields7.relationship)({ ref: "Document" }),
    effectiveFrom: (0, import_fields7.calendarDay)(),
    effectiveTo: (0, import_fields7.calendarDay)(),
    dataCategories: (0, import_fields7.json)({ defaultValue: [] }),
    status: choice(["draft", "active", "lapsed"], "draft"),
    ...trackingFields
  }
});
var JurisdictionPack = (0, import_core7.list)({
  access: managed("signedIn", "canManageCompliance"),
  ui: { labelField: "code" },
  fields: {
    code: (0, import_fields7.text)({ isIndexed: "unique", validation: { isRequired: true } }),
    name: (0, import_fields7.text)({ validation: { isRequired: true } }),
    packVersion: (0, import_fields7.text)({ validation: { isRequired: true }, defaultValue: "1" }),
    effectiveFrom: (0, import_fields7.calendarDay)(),
    status: choice(["draft", "active", "retired"], "active"),
    rules: (0, import_fields7.json)({ defaultValue: {}, ui: { description: "Configuration values (e.g. bed-hold day allotments) with ruleRef and verifyNote per entry." } }),
    obligations: (0, import_fields7.relationship)({ ref: "RegulatoryObligation.pack", many: true }),
    sourceNote: (0, import_fields7.text)({ ui: { displayMode: "textarea" } }),
    ...trackingFields
  }
});
var RegulatoryObligation = (0, import_core7.list)({
  access: governed("signedIn"),
  ui: { labelField: "code", listView: { initialColumns: ["code", "pack", "description", "ruleRef", "active"] } },
  fields: {
    pack: (0, import_fields7.relationship)({ ref: "JurisdictionPack.obligations", ...readOnly }),
    code: systemText({ indexed: true, required: true }),
    description: systemText(),
    appliesTo: (0, import_fields7.json)({ ...readOnly }),
    startFact: systemText(),
    dueRule: (0, import_fields7.json)({ ...readOnly }),
    evidenceTypes: (0, import_fields7.json)({ ...readOnly }),
    waivable: (0, import_fields7.checkbox)({ defaultValue: false, ...readOnly }),
    ruleRef: systemText(),
    verifyNote: systemText(),
    ownerRole: systemText(),
    active: (0, import_fields7.checkbox)({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: "Dormant obligations are loaded for reference and start when their phase ships." } }),
    ...trackingFields
  }
});
var ComplianceClock = (0, import_core7.list)({
  access: {
    operation: { query: permissions.canReadCompliance, create: () => false, update: () => false, delete: () => false },
    filter: { query: assignedFilter(["community"]) }
  },
  ui: { labelField: "obligationCode", listView: { initialColumns: ["obligationCode", "status", "dueAt", "subjectType", "community"] } },
  fields: {
    obligation: (0, import_fields7.relationship)({ ref: "RegulatoryObligation", ...readOnly }),
    obligationCode: systemText({ indexed: true, required: true }),
    community: (0, import_fields7.relationship)({ ref: "Community", ...readOnly }),
    resident: (0, import_fields7.relationship)({ ref: "Resident", ...readOnly }),
    subjectType: systemText({ required: true }),
    subjectId: systemText({ indexed: true, required: true }),
    occurrenceKey: systemText({ required: true }),
    startedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    dueAt: (0, import_fields7.timestamp)({ ...readOnly }),
    status: lifecycle(["open", "satisfied", "overdue", "satisfied_late", "waived", "cancelled"]),
    ownerRole: systemText(),
    escalationLevel: (0, import_fields7.integer)({ defaultValue: 0, ...readOnly }),
    satisfiedBy: (0, import_fields7.json)({ ...readOnly }),
    satisfiedAt: (0, import_fields7.timestamp)({ ...readOnly }),
    cancelReason: systemText(),
    supersedes: (0, import_fields7.relationship)({ ref: "ComplianceClock", ...readOnly }),
    current: (0, import_fields7.checkbox)({ defaultValue: true, ...readOnly }),
    ruleRef: systemText(),
    verifyNote: systemText(),
    version: versionField(),
    ...trackingFields
  }
});

// features/keystone/models/agents.ts
var agents_exports = {};
__export(agents_exports, {
  AGENT_SCOPES: () => AGENT_SCOPES,
  AgentRun: () => AgentRun,
  AgentToolGrant: () => AgentToolGrant,
  PHI_AGENT_SCOPES: () => PHI_AGENT_SCOPES,
  PROPOSAL_KINDS: () => PROPOSAL_KINDS,
  Proposal: () => Proposal
});
var import_core8 = require("@keystone-6/core");
var import_fields8 = require("@keystone-6/core/fields");
var AGENT_SCOPES = [
  "workflow.read",
  "workflow.propose",
  "workflow.dry_run",
  "workflow.pause",
  "finding.read",
  "finding.recheck",
  "task.create",
  "census.read",
  "resident.read_demographics",
  "resident.read_clinical",
  "workforce.read",
  "compliance.read",
  "incident.read",
  "proposal.create_note",
  "proposal.create_care_plan",
  "proposal.create_family_update",
  "report.generate"
];
var PHI_AGENT_SCOPES = /* @__PURE__ */ new Set(["resident.read_demographics", "resident.read_clinical"]);
var PROPOSAL_KINDS = [
  "progress_note_draft",
  "care_plan_update",
  "family_update_draft",
  "care_level_change",
  "precaution_order",
  "workflow_version",
  "regulatory_report_draft"
];
var AgentToolGrant = (0, import_core8.list)({
  access: governed("canAccessDashboard"),
  ui: { labelField: "scope", listView: { initialColumns: ["agent", "scope", "status", "createdAt"] } },
  fields: {
    agent: (0, import_fields8.relationship)({ ref: "AgentIdentity.grants", ...readOnly }),
    scope: fixedChoice(AGENT_SCOPES),
    communities: (0, import_fields8.relationship)({ ref: "Community", many: true, ...readOnly }),
    constraints: (0, import_fields8.json)({ ...readOnly }),
    status: lifecycle(["requested", "active", "revoked"]),
    approval: (0, import_fields8.relationship)({ ref: "ApprovalRequest", ...readOnly }),
    revokedAt: (0, import_fields8.timestamp)({ ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var AgentRun = (0, import_core8.list)({
  access: governed("canAccessDashboard"),
  ui: { labelField: "purpose", listView: { initialColumns: ["agent", "status", "startedAt", "endedAt"] } },
  fields: {
    agent: (0, import_fields8.relationship)({ ref: "AgentIdentity.runs", ...readOnly }),
    purpose: systemText(),
    startedAt: (0, import_fields8.timestamp)({ defaultValue: { kind: "now" }, ...readOnly }),
    endedAt: (0, import_fields8.timestamp)({ ...readOnly }),
    status: lifecycle(["started", "completed", "failed", "aborted"]),
    toolCalls: (0, import_fields8.json)({ ...readOnly, ui: { ...readOnly.ui, description: "Tool names and argument digests, never raw arguments." } }),
    proposals: (0, import_fields8.relationship)({ ref: "Proposal.agentRun", many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var Proposal = (0, import_core8.list)({
  access: governed("canAccessDashboard"),
  ui: { labelField: "kind", listView: { initialColumns: ["kind", "status", "proposedByAgent", "proposedByUser", "createdAt"] } },
  fields: {
    kind: fixedChoice(PROPOSAL_KINDS),
    payload: (0, import_fields8.json)({ ...readOnly }),
    payloadHash: systemText({ required: true }),
    resident: (0, import_fields8.relationship)({ ref: "Resident", ...readOnly }),
    status: lifecycle(["proposed", "accepted", "signed", "rejected", "expired"]),
    agentRun: (0, import_fields8.relationship)({ ref: "AgentRun.proposals", ...readOnly }),
    proposedByAgent: (0, import_fields8.relationship)({ ref: "AgentIdentity", ...readOnly }),
    proposedByUser: (0, import_fields8.relationship)({ ref: "User", ...readOnly }),
    acceptedBy: (0, import_fields8.relationship)({ ref: "User", ...readOnly }),
    resultRecordType: systemText(),
    resultRecordId: systemText({ indexed: true }),
    expiresAt: (0, import_fields8.timestamp)({ ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});

// features/keystone/models/places.ts
var places_exports = {};
__export(places_exports, {
  APARTMENT_STATUSES: () => APARTMENT_STATUSES,
  Apartment: () => Apartment,
  ApartmentType: () => ApartmentType,
  BED_STATUSES: () => BED_STATUSES,
  Bed: () => Bed,
  BedHoldPolicy: () => BedHoldPolicy,
  BedOccupancy: () => BedOccupancy,
  Building: () => Building,
  PlaceReservation: () => PlaceReservation,
  Room: () => Room,
  Unit: () => Unit
});
var import_core9 = require("@keystone-6/core");
var import_fields9 = require("@keystone-6/core/fields");
var BED_STATUSES = ["available", "reserved", "occupied", "held", "cleaning", "out_of_service"];
var APARTMENT_STATUSES = ["available", "reserved", "occupied", "turnover", "out_of_service"];
var Building = (0, import_core9.list)({
  access: scopedManaged("canAccessDashboard", "canManagePlaces", ["community"]),
  ui: { labelField: "name" },
  fields: {
    community: (0, import_fields9.relationship)({ ref: "Community.buildings" }),
    name: (0, import_fields9.text)({ validation: { isRequired: true } }),
    kind: choice(["nursing", "residential", "mixed"], "mixed"),
    ...trackingFields
  }
});
var Unit = (0, import_core9.list)({
  access: scopedManaged("canAccessDashboard", "canManagePlaces", ["community"]),
  ui: { labelField: "name", listView: { initialColumns: ["name", "community", "setting", "secured", "status"] } },
  fields: {
    community: (0, import_fields9.relationship)({ ref: "Community.units" }),
    building: (0, import_fields9.relationship)({ ref: "Building" }),
    name: (0, import_fields9.text)({ validation: { isRequired: true } }),
    code: (0, import_fields9.text)({ validation: { isRequired: true, match: { regex: /^[A-Z0-9-]{1,12}$/, explanation: "Capital letters, digits and hyphens" } } }),
    setting: choice(SETTINGS, "nursing_facility"),
    secured: (0, import_fields9.checkbox)({ defaultValue: false, ui: { description: "A secured memory-care unit: placement needs a documented reason." } }),
    specialty: choice(["none", "short_stay_rehab", "long_term", "behavioural", "ventilator", "bariatric"], "none"),
    rooms: (0, import_fields9.relationship)({ ref: "Room.unit", many: true }),
    apartments: (0, import_fields9.relationship)({ ref: "Apartment.unit", many: true }),
    status: choice(["active", "closed"], "active"),
    ...trackingFields
  }
});
var Room = (0, import_core9.list)({
  access: scopedManaged("canAccessDashboard", "canManagePlaces", ["unit", "community"]),
  ui: { labelField: "number" },
  fields: {
    unit: (0, import_fields9.relationship)({ ref: "Unit.rooms" }),
    number: (0, import_fields9.text)({ validation: { isRequired: true } }),
    kind: choice(["private", "semi_private", "ward"], "semi_private"),
    isolationCapable: (0, import_fields9.checkbox)({ defaultValue: false }),
    privateBath: (0, import_fields9.checkbox)({ defaultValue: false }),
    genderPolicy: choice(["any", "female", "male"], "any"),
    beds: (0, import_fields9.relationship)({ ref: "Bed.room", many: true }),
    ...trackingFields
  }
});
var Bed = (0, import_core9.list)({
  access: {
    operation: { query: isStaff, create: anyOf("canManagePlaces"), update: anyOf("canManagePlaces"), delete: () => false },
    filter: { query: assignedFilter(["room", "unit", "community"]), update: assignedFilter(["room", "unit", "community"]) }
  },
  ui: { labelField: "label", listView: { initialColumns: ["room", "label", "certification", "status"] } },
  fields: {
    room: (0, import_fields9.relationship)({ ref: "Room.beds" }),
    label: (0, import_fields9.text)({ validation: { isRequired: true } }),
    certification: choice(["dual", "medicare", "medicaid", "private_only"], "dual"),
    licensed: (0, import_fields9.checkbox)({ defaultValue: true }),
    features: (0, import_fields9.json)({ defaultValue: [] }),
    status: lifecycle(BED_STATUSES, "available"),
    statusReason: systemText(),
    currentStay: (0, import_fields9.relationship)({ ref: "Stay", ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var ApartmentType = (0, import_core9.list)({
  access: scopedManaged("canAccessDashboard", ["canManagePlaces", "canManageStorefront"], ["community"]),
  ui: { labelField: "name" },
  fields: {
    community: (0, import_fields9.relationship)({ ref: "Community" }),
    name: (0, import_fields9.text)({ validation: { isRequired: true } }),
    setting: choice(SETTINGS, "assisted_living"),
    squareFeet: (0, import_fields9.integer)(),
    bedrooms: (0, import_fields9.integer)({ defaultValue: 0 }),
    description: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
    floorPlan: (0, import_fields9.relationship)({ ref: "Document" }),
    photos: (0, import_fields9.relationship)({ ref: "Document", many: true }),
    publishedFromPriceMinor: minor({ description: "Derived from the active rate schedule when prices are published." }),
    ...trackingFields
  }
});
var Apartment = (0, import_core9.list)({
  access: {
    operation: { query: isStaff, create: anyOf("canManagePlaces"), update: anyOf("canManagePlaces"), delete: () => false },
    filter: { query: assignedFilter(["unit", "community"]), update: assignedFilter(["unit", "community"]) }
  },
  ui: { labelField: "number", listView: { initialColumns: ["unit", "number", "apartmentType", "capacity", "occupantCount", "status"] } },
  fields: {
    unit: (0, import_fields9.relationship)({ ref: "Unit.apartments" }),
    number: (0, import_fields9.text)({ validation: { isRequired: true } }),
    apartmentType: (0, import_fields9.relationship)({ ref: "ApartmentType" }),
    capacity: (0, import_fields9.integer)({ defaultValue: 1, validation: { isRequired: true, min: 1, max: 2 } }),
    allowsUnrelatedCompanion: (0, import_fields9.checkbox)({ defaultValue: false }),
    status: lifecycle(APARTMENT_STATUSES, "available"),
    statusReason: systemText(),
    occupantCount: (0, import_fields9.integer)({ defaultValue: 0, ...readOnly }),
    version: versionField(),
    ...trackingFields
  }
});
var PlaceReservation = (0, import_core9.list)({
  access: scopedGoverned(["canAdmitDischarge", "canManageSales", "canReadSales"], ["community"]),
  ui: { labelField: "reference", listView: { initialColumns: ["reference", "bed", "apartment", "status", "expiresAt"] } },
  fields: {
    reference: systemText({ indexed: "unique", required: true }),
    community: (0, import_fields9.relationship)({ ref: "Community", ...readOnly }),
    bed: (0, import_fields9.relationship)({ ref: "Bed", ...readOnly }),
    apartment: (0, import_fields9.relationship)({ ref: "Apartment", ...readOnly }),
    prospect: (0, import_fields9.relationship)({ ref: "Prospect", ...readOnly }),
    referral: (0, import_fields9.relationship)({ ref: "Referral", ...readOnly }),
    waitlistEntry: (0, import_fields9.relationship)({ ref: "WaitlistEntry", ...readOnly }),
    purpose: systemText(),
    status: lifecycle(["active", "consumed", "released", "expired"]),
    expiresAt: (0, import_fields9.timestamp)({ ...readOnly }),
    consumedByStay: (0, import_fields9.relationship)({ ref: "Stay", ...readOnly }),
    operationKeyHash: systemText({ indexed: "unique" }),
    version: versionField(),
    ...trackingFields
  }
});
var BedOccupancy = (0, import_core9.list)({
  access: {
    operation: { query: isStaff, create: () => false, update: () => false, delete: () => false },
    filter: { query: assignedFilter(["bed", "room", "unit", "community"]) }
  },
  ui: { listView: { initialColumns: ["bed", "stay", "startAt", "endAt"] } },
  fields: {
    bed: (0, import_fields9.relationship)({ ref: "Bed", ...readOnly }),
    stay: (0, import_fields9.relationship)({ ref: "Stay", ...readOnly }),
    startAt: (0, import_fields9.timestamp)({ ...readOnly, validation: { isRequired: true } }),
    endAt: (0, import_fields9.timestamp)({ ...readOnly }),
    openedByEvent: (0, import_fields9.relationship)({ ref: "CensusEvent", ...readOnly }),
    closedByEvent: (0, import_fields9.relationship)({ ref: "CensusEvent", ...readOnly })
  }
});
var BedHoldPolicy = (0, import_core9.list)({
  access: scopedManaged("canAccessDashboard", "canManageCompliance", ["community"]),
  ui: { labelField: "name" },
  fields: {
    name: (0, import_fields9.text)({ validation: { isRequired: true } }),
    community: (0, import_fields9.relationship)({ ref: "Community" }),
    jurisdictionPack: (0, import_fields9.relationship)({ ref: "JurisdictionPack" }),
    medicaidHoldDaysPerYear: (0, import_fields9.integer)({ defaultValue: 30, ui: { description: "Paid Medicaid leave days per calendar year (all leave kinds)." } }),
    medicaidHoldPaid: (0, import_fields9.checkbox)({ defaultValue: true }),
    medicaidHoldRateRule: (0, import_fields9.json)({ defaultValue: {}, ui: { description: "Rate rule from the pack, e.g. 50% of the per diem when prior-year occupancy exceeded 95%, else 18%." } }),
    therapeuticLeaveDaysPerYear: (0, import_fields9.integer)({ defaultValue: 30 }),
    privateHoldDailyRateMinor: minor({ description: "Daily charge when a private-pay resident elects a hold." }),
    noticeTemplate: (0, import_fields9.relationship)({ ref: "DocumentTemplate" }),
    ruleRef: (0, import_fields9.text)(),
    verifyNote: (0, import_fields9.text)({ ui: { displayMode: "textarea" } }),
    effectiveFrom: (0, import_fields9.calendarDay)(),
    effectiveTo: (0, import_fields9.calendarDay)(),
    ...trackingFields
  }
});

// features/keystone/models/residents.ts
var residents_exports = {};
__export(residents_exports, {
  ADMISSION_SOURCES: () => ADMISSION_SOURCES,
  AdvanceDirective: () => AdvanceDirective,
  Allergy: () => Allergy,
  CENSUS_EVENT_KINDS: () => CENSUS_EVENT_KINDS,
  CODE_STATUSES: () => CODE_STATUSES,
  CensusDay: () => CensusDay,
  CensusEvent: () => CensusEvent,
  CensusSignoff: () => CensusSignoff,
  Contact: () => Contact,
  CoveragePeriod: () => CoveragePeriod,
  DISCHARGE_DISPOSITIONS: () => DISCHARGE_DISPOSITIONS,
  Diagnosis: () => Diagnosis,
  NoticeDelivery: () => NoticeDelivery,
  PAYER_KINDS: () => PAYER_KINDS,
  Payer: () => Payer,
  PreAdmissionScreen: () => PreAdmissionScreen,
  REPRESENTATIVE_ROLES: () => REPRESENTATIVE_ROLES,
  Representative: () => Representative,
  Resident: () => Resident,
  ResidentIdentifier: () => ResidentIdentifier,
  Stay: () => Stay
});
var import_core10 = require("@keystone-6/core");
var import_fields10 = require("@keystone-6/core/fields");

// features/keystone/models/phi.ts
var PROTECTED_TIERS = /* @__PURE__ */ new Set(["dem", "clin", "sens", "ident", "fin"]);
var TIER_PERMISSIONS = {
  pub: "anyone",
  op: "staff",
  dem: ["canReadResidentDemographics"],
  clin: ["canReadClinical"],
  sens: ["canReadSensitiveClinical"],
  ident: ["canReadIdentifiers"],
  fin: ["canReadBilling", "canReadTrust"]
};
var BREAK_GLASS_TIERS = /* @__PURE__ */ new Set(["dem", "clin"]);
var PHI_REGISTRY = {};
var PHI_LISTS = /* @__PURE__ */ new Set();
var grantCache = /* @__PURE__ */ new WeakMap();
function breakGlassResidents(session, context) {
  if (!session || !context) return Promise.resolve(/* @__PURE__ */ new Set());
  if (!hasPermission(session, "canBreakGlass")) return Promise.resolve(/* @__PURE__ */ new Set());
  const cached = grantCache.get(session);
  if (cached) return cached;
  const promise = (async () => {
    const rows = await context.sudo().prisma.breakGlassGrant.findMany({
      where: { userId: session.itemId, status: "active", expiresAt: { gt: /* @__PURE__ */ new Date() } },
      select: { residentId: true }
    });
    return new Set(rows.map((row) => row.residentId).filter(Boolean));
  })();
  grantCache.set(session, promise);
  return promise;
}
function tierAllows(session, tier) {
  const rule3 = TIER_PERMISSIONS[tier];
  if (rule3 === "anyone") return true;
  if (rule3 === "staff") return isStaff({ session });
  return rule3.some((permission) => hasPermission(session, permission));
}
var residentOf = (listKey, item) => !item ? null : listKey === "Resident" ? item.id : item.residentId ?? null;
function tierReadRule(tier) {
  return async ({ session, context, listKey, item }) => {
    if (tierAllows(session, tier)) return true;
    if (!BREAK_GLASS_TIERS.has(tier) || !isStaff({ session })) return false;
    const residentId = residentOf(listKey, item);
    if (!residentId) return false;
    return (await breakGlassResidents(session, context)).has(residentId);
  };
}
function phiFields(listKey, spec) {
  const registry = PHI_REGISTRY[listKey] ??= {};
  const out = {};
  for (const [fieldKey, [tier, factory, config2 = {}]] of Object.entries(spec)) {
    registry[fieldKey] = tier;
    if (PROTECTED_TIERS.has(tier)) PHI_LISTS.add(listKey);
    out[fieldKey] = factory({ ...config2, access: { ...config2.access ?? {}, read: tierReadRule(tier) } });
  }
  return out;
}

// features/keystone/models/residents.ts
var sys3 = () => false;
var ro = readOnly;
var opt = (values) => ({ type: "string", options: values.map((value) => ({ label: value.replaceAll("_", " "), value })) });
var residentScope = (path, residentPath) => async ({ session, context }) => {
  const scope = await assignedCommunities(session, context);
  if (scope === "all") return true;
  const glass = [...await breakGlassResidents(session, context)];
  const own = communityWhere(path, scope);
  if (!glass.length) return own;
  let glassWhere = { id: { in: glass } };
  for (const key of [...residentPath].reverse()) glassWhere = { [key]: glassWhere };
  return { OR: [own, glassWhere] };
};
var residentList = (path, residentPath = ["resident"]) => ({
  operation: { query: isStaff, create: sys3, update: sys3, delete: sys3 },
  filter: { query: residentScope(path, residentPath) }
});
var phiList = (key) => {
  PHI_LISTS.add(key);
  return key;
};
var CODE_STATUSES = ["full_code", "dnr", "dnr_cc", "dnr_cca", "comfort"];
var Resident = (0, import_core10.list)({
  access: residentList(["community"], []),
  ui: { labelField: "reference", listView: { initialColumns: ["reference", "lastName", "firstName", "community", "status"] } },
  fields: {
    reference: systemText({ indexed: "unique", required: true }),
    community: (0, import_fields10.relationship)({ ref: "Community", ...ro, ui: { ...ro.ui, description: "The community of the current (or last) stay." } }),
    ...phiFields("Resident", {
      firstName: ["dem", import_fields10.text, { ...ro, validation: { isRequired: true } }],
      middleName: ["dem", import_fields10.text, ro],
      lastName: ["dem", import_fields10.text, { ...ro, validation: { isRequired: true } }],
      preferredName: ["dem", import_fields10.text, ro],
      dateOfBirth: ["dem", import_fields10.calendarDay, ro],
      sex: ["dem", import_fields10.select, { ...opt(["female", "male", "unknown"]), ...ro }],
      genderIdentity: ["dem", import_fields10.text, ro],
      pronouns: ["dem", import_fields10.text, ro],
      primaryLanguage: ["dem", import_fields10.text, ro],
      interpreterNeeded: ["dem", import_fields10.checkbox, { defaultValue: false, ...ro }],
      maritalStatus: ["dem", import_fields10.text, ro],
      religion: ["dem", import_fields10.text, ro],
      veteran: ["dem", import_fields10.checkbox, { defaultValue: false, ...ro }],
      codeStatus: ["clin", import_fields10.select, { ...opt(CODE_STATUSES), ...ro, ui: { ...ro.ui, description: "Projection of the active code-status order or verified directive. Ohio DNR Comfort Care codes (verify)." } }],
      capacityStatus: ["sens", import_fields10.select, { ...opt(["has_capacity", "lacks_capacity", "fluctuating", "unknown"]), defaultValue: "unknown", ...ro }],
      fallRisk: ["clin", import_fields10.text, ro],
      elopementRisk: ["clin", import_fields10.text, ro]
    }),
    status: lifecycle(["prospective", "current", "former", "deceased"], "current"),
    identifiers: (0, import_fields10.relationship)({ ref: "ResidentIdentifier.resident", many: true, ...ro }),
    representatives: (0, import_fields10.relationship)({ ref: "Representative.resident", many: true, ...ro }),
    advanceDirectives: (0, import_fields10.relationship)({ ref: "AdvanceDirective.resident", many: true, ...ro }),
    allergies: (0, import_fields10.relationship)({ ref: "Allergy.resident", many: true, ...ro }),
    diagnoses: (0, import_fields10.relationship)({ ref: "Diagnosis.resident", many: true, ...ro }),
    stays: (0, import_fields10.relationship)({ ref: "Stay.resident", many: true, ...ro }),
    currentStay: (0, import_fields10.relationship)({ ref: "Stay", ...ro }),
    synthetic: (0, import_fields10.checkbox)({ defaultValue: false, ...ro }),
    version: versionField(),
    ...trackingFields
  }
});
phiList("Resident");
var ResidentIdentifier = (0, import_core10.list)({
  access: residentList(["resident", "community"]),
  ui: { labelField: "display" },
  fields: {
    resident: (0, import_fields10.relationship)({ ref: "Resident.identifiers", ...ro }),
    kind: fixedChoice(["mrn", "medicare_mbi", "medicaid_id", "ma_member_id", "ssn_last4", "incumbent_ehr_id", "pharmacy_patient_id", "other"]),
    issuer: systemText({ required: true }),
    ...phiFields("ResidentIdentifier", {
      display: ["ident", import_fields10.text, ro],
      valueEncrypted: ["ident", import_fields10.text, { access: { create: sys3, update: sys3 }, graphql: { omit: true }, ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "hidden" } } }]
    }),
    valueHash: (0, import_fields10.text)({ access: { read: sys3, create: sys3, update: sys3 }, graphql: { omit: true }, ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "hidden" } }, validation: { isRequired: true } }),
    effectiveFrom: (0, import_fields10.calendarDay)({ ...ro }),
    effectiveTo: (0, import_fields10.calendarDay)({ ...ro }),
    ...trackingFields
  }
});
var Contact = (0, import_core10.list)({
  access: {
    operation: { query: isStaff, create: sys3, update: sys3, delete: sys3 },
    filter: { query: async ({ session, context }) => {
      const scope = await assignedCommunities(session, context);
      if (scope === "all") return true;
      return { OR: [{ community: { id: { in: scope } } }] };
    } }
  },
  ui: { labelField: "reference" },
  fields: {
    reference: systemText({ indexed: "unique", required: true }),
    community: (0, import_fields10.relationship)({ ref: "Community", ...ro }),
    ...phiFields("Contact", {
      firstName: ["dem", import_fields10.text, { ...ro, validation: { isRequired: true } }],
      lastName: ["dem", import_fields10.text, ro],
      email: ["dem", import_fields10.text, ro],
      phone: ["dem", import_fields10.text, ro],
      address: ["dem", import_fields10.json, ro],
      preferredChannel: ["dem", import_fields10.select, { ...opt(["phone", "email", "text", "mail", "portal"]), defaultValue: "phone", ...ro }]
    }),
    consentToContact: (0, import_fields10.checkbox)({ defaultValue: false, ...ro }),
    synthetic: (0, import_fields10.checkbox)({ defaultValue: false, ...ro }),
    ...trackingFields
  }
});
phiList("Contact");
var REPRESENTATIVE_ROLES = ["self", "healthcare_poa", "financial_responsible", "guardian", "family", "emergency_contact", "hospice_contact", "personal_representative_hipaa"];
var Representative = (0, import_core10.list)({
  access: residentList(["resident", "community"]),
  ui: { labelField: "reference", listView: { initialColumns: ["reference", "resident", "contact", "roles", "contactPriority"] } },
  fields: {
    reference: systemText({ indexed: "unique", required: true }),
    resident: (0, import_fields10.relationship)({ ref: "Resident.representatives", ...ro }),
    contact: (0, import_fields10.relationship)({ ref: "Contact", ...ro }),
    self: (0, import_fields10.checkbox)({ defaultValue: false, ...ro }),
    roles: (0, import_fields10.json)({ ...ro, defaultValue: [] }),
    authorityDocument: (0, import_fields10.relationship)({ ref: "Document", ...ro }),
    authorityVerifiedBy: (0, import_fields10.relationship)({ ref: "User", ...ro }),
    authorityVerifiedAt: (0, import_fields10.timestamp)({ ...ro }),
    effectiveFrom: (0, import_fields10.calendarDay)({ ...ro }),
    effectiveTo: (0, import_fields10.calendarDay)({ ...ro }),
    contactPriority: (0, import_fields10.integer)({ defaultValue: 1, ...ro }),
    portalAccount: (0, import_fields10.relationship)({ ref: "PortalAccount.representatives", ...ro }),
    status: lifecycle(["active", "ended"]),
    version: versionField(),
    ...trackingFields
  }
});
phiList("Representative");
var AdvanceDirective = (0, import_core10.list)({
  access: residentList(["resident", "community"]),
  fields: {
    resident: (0, import_fields10.relationship)({ ref: "Resident.advanceDirectives", ...ro }),
    ...phiFields("AdvanceDirective", {
      kind: ["clin", import_fields10.select, { ...opt(["living_will", "healthcare_poa", "polst", "dnr", "ohio_dnr_cc", "ohio_dnr_cca", "other"]), validation: { isRequired: true }, ...ro }],
      note: ["clin", import_fields10.text, ro]
    }),
    document: (0, import_fields10.relationship)({ ref: "Document", ...ro }),
    effectiveAt: (0, import_fields10.timestamp)({ ...ro }),
    revokedAt: (0, import_fields10.timestamp)({ ...ro }),
    verifiedBy: (0, import_fields10.relationship)({ ref: "User", ...ro }),
    ...trackingFields
  }
});
phiList("AdvanceDirective");
var Allergy = (0, import_core10.list)({
  access: residentList(["resident", "community"]),
  fields: {
    resident: (0, import_fields10.relationship)({ ref: "Resident.allergies", ...ro }),
    ...phiFields("Allergy", {
      substance: ["clin", import_fields10.text, { ...ro, validation: { isRequired: true } }],
      reaction: ["clin", import_fields10.text, ro],
      severity: ["clin", import_fields10.select, { ...opt(["mild", "moderate", "severe", "unknown"]), defaultValue: "unknown", ...ro }]
    }),
    status: lifecycle(["active", "inactive", "entered_in_error"]),
    recordedBy: (0, import_fields10.relationship)({ ref: "User", ...ro }),
    ...trackingFields
  }
});
phiList("Allergy");
var Diagnosis = (0, import_core10.list)({
  access: residentList(["resident", "community"]),
  fields: {
    resident: (0, import_fields10.relationship)({ ref: "Resident.diagnoses", ...ro }),
    ...phiFields("Diagnosis", {
      icd10: ["clin", import_fields10.text, { ...ro, validation: { isRequired: true } }],
      description: ["clin", import_fields10.text, ro],
      rank: ["clin", import_fields10.select, { ...opt(["primary", "admitting", "secondary"]), defaultValue: "secondary", ...ro }]
    }),
    onsetDate: (0, import_fields10.calendarDay)({ ...ro }),
    resolvedDate: (0, import_fields10.calendarDay)({ ...ro }),
    status: lifecycle(["active", "resolved", "entered_in_error"]),
    ...trackingFields
  }
});
phiList("Diagnosis");
var PreAdmissionScreen = (0, import_core10.list)({
  access: residentList(["resident", "community"]),
  fields: {
    resident: (0, import_fields10.relationship)({ ref: "Resident", ...ro }),
    prospect: (0, import_fields10.relationship)({ ref: "Prospect", ...ro }),
    kind: fixedChoice(["pasrr_level1", "pasrr_level2", "al_physician_report", "al_resident_assessment", "tb_screen"]),
    ...phiFields("PreAdmissionScreen", {
      result: ["clin", import_fields10.text, ro]
    }),
    document: (0, import_fields10.relationship)({ ref: "Document", ...ro }),
    completedAt: (0, import_fields10.timestamp)({ ...ro }),
    expiresAt: (0, import_fields10.timestamp)({ ...ro }),
    ...trackingFields
  }
});
phiList("PreAdmissionScreen");
var ADMISSION_SOURCES = ["acute_hospital", "community_home", "another_nursing_facility", "assisted_living", "psychiatric_hospital", "irf", "ltch", "hospice", "other"];
var DISCHARGE_DISPOSITIONS = ["community_home", "acute_hospital", "another_nursing_facility", "assisted_living", "psychiatric_hospital", "irf", "ltch", "hospice", "deceased", "other"];
var Stay = (0, import_core10.list)({
  access: residentList(["community"]),
  ui: { labelField: "reference", listView: { initialColumns: ["reference", "resident", "setting", "status", "presence", "admittedAt"] } },
  fields: {
    reference: systemText({ indexed: "unique", required: true }),
    resident: (0, import_fields10.relationship)({ ref: "Resident.stays", ...ro }),
    community: (0, import_fields10.relationship)({ ref: "Community", ...ro }),
    setting: fixedChoice(SETTINGS),
    status: lifecycle(["pre_admit", "admitted", "discharged", "deceased"], "pre_admit"),
    presence: lifecycle(["not_admitted", "in_house", "on_leave_hold", "on_leave_no_hold", "gone"], "not_admitted"),
    admittedAt: (0, import_fields10.timestamp)({ ...ro }),
    dischargedAt: (0, import_fields10.timestamp)({ ...ro }),
    admissionSource: (0, import_fields10.select)({ ...opt(ADMISSION_SOURCES), ...ro }),
    dischargeDisposition: (0, import_fields10.select)({ ...opt(DISCHARGE_DISPOSITIONS), ...ro }),
    priorStay: (0, import_fields10.relationship)({ ref: "Stay", ...ro }),
    currentBed: (0, import_fields10.relationship)({ ref: "Bed", ...ro }),
    currentApartment: (0, import_fields10.relationship)({ ref: "Apartment", ...ro }),
    heldBed: (0, import_fields10.relationship)({ ref: "Bed", ...ro }),
    agreement: (0, import_fields10.relationship)({ ref: "Document", ...ro }),
    events: (0, import_fields10.relationship)({ ref: "CensusEvent.stay", many: true, ...ro }),
    coverage: (0, import_fields10.relationship)({ ref: "CoveragePeriod.stay", many: true, ...ro }),
    leaveDaysUsedThisYear: (0, import_fields10.integer)({ defaultValue: 0, ...ro }),
    projection: (0, import_fields10.json)({ ...ro, ui: { ...ro.ui, description: "The census fold (lib/censusProjection.ts); a rebuild from CensusEvents must match projectionHash." } }),
    placementReason: systemText(),
    initialPayerKind: systemText(),
    projectionVersion: (0, import_fields10.integer)({ defaultValue: 0, ...ro }),
    projectionHash: systemText(),
    lastEventHash: systemText(),
    synthetic: (0, import_fields10.checkbox)({ defaultValue: false, ...ro }),
    version: versionField(),
    ...trackingFields
  }
});
phiList("Stay");
var CENSUS_EVENT_KINDS = ["admission", "readmission", "room_change", "leave_start", "hold_release", "leave_end", "coverage_change", "discharge", "death", "correction"];
var CensusEvent = (0, import_core10.list)({
  access: residentList(["stay", "community"], ["stay", "resident"]),
  ui: { labelField: "kind", listView: { initialColumns: ["stay", "seq", "kind", "effectiveAt", "recordedAt", "actor"], initialSort: { field: "recordedAt", direction: "DESC" } } },
  fields: {
    stay: (0, import_fields10.relationship)({ ref: "Stay.events", ...ro }),
    seq: (0, import_fields10.integer)({ ...ro, validation: { isRequired: true } }),
    kind: fixedChoice(CENSUS_EVENT_KINDS),
    effectiveAt: (0, import_fields10.timestamp)({ ...ro, validation: { isRequired: true } }),
    observedAt: (0, import_fields10.timestamp)({ ...ro }),
    recordedAt: (0, import_fields10.timestamp)({ ...ro, defaultValue: { kind: "now" } }),
    fromBed: (0, import_fields10.relationship)({ ref: "Bed", ...ro }),
    toBed: (0, import_fields10.relationship)({ ref: "Bed", ...ro }),
    fromApartment: (0, import_fields10.relationship)({ ref: "Apartment", ...ro }),
    toApartment: (0, import_fields10.relationship)({ ref: "Apartment", ...ro }),
    leaveKind: (0, import_fields10.select)({ ...opt(["hospital", "therapeutic", "other"]), ...ro }),
    coverage: (0, import_fields10.relationship)({ ref: "CoveragePeriod", ...ro }),
    holdElected: (0, import_fields10.checkbox)({ defaultValue: false, ...ro }),
    holdPaidBy: (0, import_fields10.select)({ ...opt(["medicaid", "private", "none"]), ...ro }),
    dischargeDisposition: (0, import_fields10.select)({ ...opt(DISCHARGE_DISPOSITIONS), ...ro }),
    initiatedBy: (0, import_fields10.select)({ ...opt(["resident", "facility"]), ...ro }),
    voidsEvent: (0, import_fields10.relationship)({ ref: "CensusEvent", ...ro }),
    correctionReason: systemText(),
    approval: (0, import_fields10.relationship)({ ref: "ApprovalRequest", ...ro }),
    notices: (0, import_fields10.relationship)({ ref: "NoticeDelivery.censusEvent", many: true, ...ro }),
    detail: (0, import_fields10.json)({ ...ro }),
    actor: (0, import_fields10.relationship)({ ref: "User", ...ro }),
    actorAgent: (0, import_fields10.relationship)({ ref: "AgentIdentity", ...ro }),
    idempotencyKey: systemText({ indexed: "unique", required: true }),
    prevHash: systemText({ required: true }),
    hash: systemText({ required: true })
  }
});
phiList("CensusEvent");
var CensusDay = (0, import_core10.list)({
  access: residentList(["community"], ["stay", "resident"]),
  ui: { listView: { initialColumns: ["date", "stay", "presence", "unit", "billableForPayer"] } },
  fields: {
    community: (0, import_fields10.relationship)({ ref: "Community", ...ro }),
    stay: (0, import_fields10.relationship)({ ref: "Stay", ...ro }),
    date: (0, import_fields10.calendarDay)({ ...ro, validation: { isRequired: true } }),
    setting: systemText(),
    bed: (0, import_fields10.relationship)({ ref: "Bed", ...ro }),
    apartment: (0, import_fields10.relationship)({ ref: "Apartment", ...ro }),
    unit: (0, import_fields10.relationship)({ ref: "Unit", ...ro }),
    presence: systemText({ required: true }),
    primaryCoverage: (0, import_fields10.relationship)({ ref: "CoveragePeriod", ...ro }),
    payerKind: systemText(),
    billableForPayer: (0, import_fields10.checkbox)({ defaultValue: true, ...ro }),
    snapshotRun: (0, import_fields10.relationship)({ ref: "JobRun", ...ro }),
    supersededBy: (0, import_fields10.relationship)({ ref: "CensusDay", ...ro })
  }
});
phiList("CensusDay");
var CensusSignoff = (0, import_core10.list)({
  access: {
    operation: { query: isStaff, create: sys3, update: sys3, delete: sys3 },
    filter: { query: async ({ session, context }) => {
      const scope = await assignedCommunities(session, context);
      return scope === "all" ? true : communityWhere(["community"], scope);
    } }
  },
  ui: { listView: { initialColumns: ["date", "community", "unit", "signedBy", "signedAt"] } },
  fields: {
    community: (0, import_fields10.relationship)({ ref: "Community", ...ro }),
    unit: (0, import_fields10.relationship)({ ref: "Unit", ...ro, ui: { ...ro.ui, description: "Empty = the whole community." } }),
    date: (0, import_fields10.calendarDay)({ ...ro, validation: { isRequired: true } }),
    totals: (0, import_fields10.json)({ ...ro }),
    run: (0, import_fields10.relationship)({ ref: "JobRun", ...ro }),
    signedBy: (0, import_fields10.relationship)({ ref: "User", ...ro }),
    signedAt: (0, import_fields10.timestamp)({ ...ro }),
    note: systemText()
  }
});
var NoticeDelivery = (0, import_core10.list)({
  access: residentList(["resident", "community"]),
  ui: { labelField: "kind", listView: { initialColumns: ["kind", "resident", "method", "deliveredAt", "acknowledgement", "copyToOmbudsmanAt"] } },
  fields: {
    kind: fixedChoice(["bed_hold_policy", "bed_hold_at_transfer", "transfer_discharge", "room_change", "rate_change", "nomnc", "snfabn", "denc", "trust_quarterly", "ssi_threshold", "privacy_practices", "other"]),
    subjectType: systemText(),
    subjectId: systemText({ indexed: true }),
    resident: (0, import_fields10.relationship)({ ref: "Resident", ...ro }),
    censusEvent: (0, import_fields10.relationship)({ ref: "CensusEvent.notices", ...ro }),
    recipientRepresentative: (0, import_fields10.relationship)({ ref: "Representative", ...ro }),
    method: (0, import_fields10.select)({ ...opt(["in_person", "mail", "email", "portal", "phone_then_mail"]), validation: { isRequired: true }, ...ro }),
    deliveredAt: (0, import_fields10.timestamp)({ ...ro }),
    deliveredBy: (0, import_fields10.relationship)({ ref: "User", ...ro }),
    document: (0, import_fields10.relationship)({ ref: "Document", ...ro }),
    acknowledgement: (0, import_fields10.select)({ ...opt(["signed", "refused_witnessed", "not_required"]), defaultValue: "not_required", ...ro }),
    witness: (0, import_fields10.relationship)({ ref: "User", ...ro }),
    copyToOmbudsmanAt: (0, import_fields10.timestamp)({ ...ro }),
    note: systemText(),
    ...trackingFields
  }
});
phiList("NoticeDelivery");
var PAYER_KINDS = ["medicare_a", "medicare_advantage", "medicaid_ffs", "medicaid_mco", "private_pay", "commercial", "ltc_insurance", "va", "hospice_agency", "other"];
var Payer = (0, import_core10.list)({
  access: {
    operation: { query: isStaff, create: (a) => a.session?.data?.role?.canManageBilling === true, update: (a) => a.session?.data?.role?.canManageBilling === true, delete: sys3 }
  },
  ui: { labelField: "name" },
  fields: {
    name: (0, import_fields10.text)({ validation: { isRequired: true } }),
    kind: choice(PAYER_KINDS, "private_pay"),
    payerId: (0, import_fields10.text)(),
    dayCountingRule: choice(["count_admit_not_discharge", "count_both", "count_neither"], "count_admit_not_discharge"),
    timelyFilingDays: (0, import_fields10.integer)(),
    claimFormat: choice(["837i", "invoice", "none"], "invoice"),
    contact: (0, import_fields10.json)({ defaultValue: {} }),
    ...trackingFields
  }
});
var CoveragePeriod = (0, import_core10.list)({
  access: residentList(["stay", "community"], ["stay", "resident"]),
  ui: { listView: { initialColumns: ["stay", "payer", "rank", "startDate", "endDate", "status"] } },
  fields: {
    stay: (0, import_fields10.relationship)({ ref: "Stay.coverage", ...ro }),
    payer: (0, import_fields10.relationship)({ ref: "Payer", ...ro }),
    rank: fixedChoice(["primary", "secondary", "tertiary"]),
    startDate: (0, import_fields10.calendarDay)({ ...ro, validation: { isRequired: true } }),
    endDate: (0, import_fields10.calendarDay)({ ...ro }),
    status: lifecycle(["pending", "active", "ending", "ended", "denied", "retro_approved"], "active"),
    ...phiFields("CoveragePeriod", {
      levelCode: ["fin", import_fields10.text, ro],
      memberReference: ["ident", import_fields10.text, ro]
    }),
    qualifyingStayFrom: (0, import_fields10.calendarDay)({ ...ro }),
    qualifyingStayTo: (0, import_fields10.calendarDay)({ ...ro }),
    endReason: (0, import_fields10.select)({ ...opt(["skilled_need_ended", "benefit_exhausted", "discharge", "payer_change", "death", "other"]), ...ro }),
    version: versionField(),
    ...trackingFields
  }
});
phiList("CoveragePeriod");

// features/keystone/models/sales.ts
var sales_exports = {};
__export(sales_exports, {
  AUTHORITY_BASES: () => AUTHORITY_BASES,
  AvailabilitySnapshot: () => AvailabilitySnapshot,
  Inquiry: () => Inquiry,
  JobPosting: () => JobPosting,
  LEAD_STATUSES: () => LEAD_STATUSES,
  Lead: () => Lead,
  MFA_SCOPES: () => MFA_SCOPES,
  PORTAL_SCOPES: () => PORTAL_SCOPES,
  PortalAccount: () => PortalAccount,
  PortalScopeGrant: () => PortalScopeGrant,
  Prospect: () => Prospect,
  PublishedPrice: () => PublishedPrice,
  Referral: () => Referral,
  ReferralSource: () => ReferralSource,
  SCOPE_AUTHORITY: () => SCOPE_AUTHORITY,
  SalesActivity: () => SalesActivity,
  StaffBio: () => StaffBio,
  StorefrontSite: () => StorefrontSite,
  Tour: () => Tour,
  TourSlot: () => TourSlot,
  WaitlistEntry: () => WaitlistEntry
});
var import_core11 = require("@keystone-6/core");
var import_fields11 = require("@keystone-6/core/fields");
var ro2 = readOnly;
var sys4 = () => false;
var opt2 = (values) => ({ type: "string", options: values.map((value) => ({ label: value.replaceAll("_", " "), value })) });
var salesRead = ["canReadSales", "canManageSales"];
var LEAD_STATUSES = ["new", "contacted", "tour_scheduled", "toured", "assessment_scheduled", "assessed", "deposit_received", "move_in_scheduled", "moved_in", "waitlisted", "nurture", "lost"];
var Inquiry = (0, import_core11.list)({
  access: scopedGoverned([...salesRead], ["community"]),
  ui: { labelField: "publicCode", listView: { initialColumns: ["publicCode", "community", "source", "createdAt", "lead"] } },
  fields: {
    publicCode: systemText({ indexed: "unique", required: true }),
    community: (0, import_fields11.relationship)({ ref: "Community", ...ro2 }),
    source: fixedChoice(["website", "phone", "walk_in", "referral_agency", "hospital", "resident_referral", "other"]),
    ...phiFields("Inquiry", {
      contactName: ["dem", import_fields11.text, ro2],
      contactEmail: ["dem", import_fields11.text, ro2],
      contactPhone: ["dem", import_fields11.text, ro2],
      relationship: ["dem", import_fields11.text, ro2],
      message: ["dem", import_fields11.text, ro2]
    }),
    consentToContact: (0, import_fields11.checkbox)({ defaultValue: false, ...ro2 }),
    utm: (0, import_fields11.json)({ ...ro2 }),
    lead: (0, import_fields11.relationship)({ ref: "Lead", ...ro2 }),
    ...trackingFields
  }
});
var ReferralSource = (0, import_core11.list)({
  access: scopedManaged([...salesRead], "canManageSales", ["community"]),
  ui: { labelField: "name" },
  fields: {
    community: (0, import_fields11.relationship)({ ref: "Community" }),
    name: (0, import_fields11.text)({ validation: { isRequired: true } }),
    kind: choice(["hospital", "physician", "placement_agency", "ccrc", "other"], "hospital"),
    feeTerms: (0, import_fields11.json)({ defaultValue: {} }),
    contact: (0, import_fields11.json)({ defaultValue: {} }),
    ...trackingFields
  }
});
var Lead = (0, import_core11.list)({
  access: scopedGoverned([...salesRead], ["community"]),
  ui: { labelField: "reference", listView: { initialColumns: ["reference", "community", "status", "owner", "nextActionAt"] } },
  fields: {
    reference: systemText({ indexed: "unique", required: true }),
    community: (0, import_fields11.relationship)({ ref: "Community", ...ro2 }),
    owner: (0, import_fields11.relationship)({ ref: "User", ...ro2 }),
    primaryContact: (0, import_fields11.relationship)({ ref: "Contact", ...ro2 }),
    prospects: (0, import_fields11.relationship)({ ref: "Prospect.lead", many: true, ...ro2 }),
    status: lifecycle(LEAD_STATUSES),
    lostReason: (0, import_fields11.select)({ ...opt2(["chose_competitor", "care_needs_exceed", "cost", "stayed_home", "deceased", "no_response", "other"]), ...ro2 }),
    nextActionAt: (0, import_fields11.timestamp)({ ...ro2 }),
    referralSource: (0, import_fields11.relationship)({ ref: "ReferralSource", ...ro2 }),
    activities: (0, import_fields11.relationship)({ ref: "SalesActivity.lead", many: true, ...ro2 }),
    tours: (0, import_fields11.relationship)({ ref: "Tour.lead", many: true, ...ro2 }),
    synthetic: (0, import_fields11.checkbox)({ defaultValue: false, ...ro2 }),
    version: versionField(),
    ...trackingFields
  }
});
var Prospect = (0, import_core11.list)({
  access: scopedGoverned([...salesRead], ["community"]),
  ui: { labelField: "reference" },
  fields: {
    reference: systemText({ indexed: "unique", required: true }),
    community: (0, import_fields11.relationship)({ ref: "Community", ...ro2 }),
    lead: (0, import_fields11.relationship)({ ref: "Lead.prospects", ...ro2 }),
    ...phiFields("Prospect", {
      firstName: ["dem", import_fields11.text, ro2],
      lastName: ["dem", import_fields11.text, ro2],
      dateOfBirth: ["dem", import_fields11.calendarDay, ro2],
      careNotes: ["clin", import_fields11.text, ro2]
    }),
    desiredSetting: (0, import_fields11.select)({ ...opt2(SETTINGS), ...ro2 }),
    desiredMoveIn: (0, import_fields11.calendarDay)({ ...ro2 }),
    convertedResident: (0, import_fields11.relationship)({ ref: "Resident", ...ro2 }),
    synthetic: (0, import_fields11.checkbox)({ defaultValue: false, ...ro2 }),
    ...trackingFields
  }
});
var Referral = (0, import_core11.list)({
  access: scopedGoverned([...salesRead, "canAdmitDischarge"], ["community"]),
  ui: { labelField: "reference", listView: { initialColumns: ["reference", "community", "source", "status", "responseDueAt"] } },
  fields: {
    reference: systemText({ indexed: "unique", required: true }),
    community: (0, import_fields11.relationship)({ ref: "Community", ...ro2 }),
    source: (0, import_fields11.relationship)({ ref: "ReferralSource", ...ro2 }),
    receivedAt: (0, import_fields11.timestamp)({ ...ro2 }),
    prospect: (0, import_fields11.relationship)({ ref: "Prospect", ...ro2 }),
    packet: (0, import_fields11.relationship)({ ref: "Document", many: true, ...ro2 }),
    expectedPayer: (0, import_fields11.select)({ ...opt2(["medicare_a", "medicare_advantage", "medicaid", "medicaid_pending", "private_pay", "commercial", "hospice", "other"]), ...ro2 }),
    ...phiFields("Referral", {
      clinicalSummary: ["clin", import_fields11.text, ro2]
    }),
    pasrrLevel1: (0, import_fields11.relationship)({ ref: "Document", ...ro2 }),
    pasrrLevel2Required: (0, import_fields11.checkbox)({ defaultValue: false, ...ro2 }),
    status: lifecycle(["received", "clinical_review", "payer_check", "accepted", "declined", "admitted", "withdrawn"]),
    declineReason: (0, import_fields11.select)({ ...opt2(["no_bed", "clinical_needs", "payer", "pasrr", "family_choice", "other"]), ...ro2 }),
    responseDueAt: (0, import_fields11.timestamp)({ ...ro2 }),
    version: versionField(),
    ...trackingFields
  }
});
var TourSlot = (0, import_core11.list)({
  access: scopedManaged([...salesRead], "canManageSales", ["community"]),
  ui: { labelField: "startsAt", listView: { initialColumns: ["community", "startsAt", "endsAt", "capacity", "host"] } },
  fields: {
    community: (0, import_fields11.relationship)({ ref: "Community" }),
    startsAt: (0, import_fields11.timestamp)({ validation: { isRequired: true } }),
    endsAt: (0, import_fields11.timestamp)({ validation: { isRequired: true } }),
    capacity: (0, import_fields11.integer)({ defaultValue: 2, validation: { isRequired: true, min: 1, max: 20 } }),
    kind: choice(["in_person", "virtual", "either"], "either"),
    host: (0, import_fields11.relationship)({ ref: "User" }),
    tours: (0, import_fields11.relationship)({ ref: "Tour.slot", many: true, ...ro2 }),
    ...trackingFields
  }
});
var Tour = (0, import_core11.list)({
  access: scopedGoverned([...salesRead], ["community"]),
  ui: { labelField: "publicCode", listView: { initialColumns: ["publicCode", "slot", "lead", "kind", "status"] } },
  fields: {
    publicCode: systemText({ indexed: "unique", required: true }),
    community: (0, import_fields11.relationship)({ ref: "Community", ...ro2 }),
    slot: (0, import_fields11.relationship)({ ref: "TourSlot.tours", ...ro2 }),
    lead: (0, import_fields11.relationship)({ ref: "Lead.tours", ...ro2 }),
    kind: fixedChoice(["in_person", "virtual"]),
    status: lifecycle(["requested", "confirmed", "completed", "no_show", "cancelled"]),
    guestTokenHash: (0, import_fields11.text)({ access: { read: sys4, create: sys4, update: sys4 }, graphql: { omit: true }, ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "hidden" } } }),
    holdExpiresAt: (0, import_fields11.timestamp)({ ...ro2 }),
    ...phiFields("Tour", { notes: ["dem", import_fields11.text, ro2] }),
    version: versionField(),
    ...trackingFields
  }
});
var WaitlistEntry = (0, import_core11.list)({
  access: scopedGoverned([...salesRead], ["community"]),
  ui: { labelField: "reference", listView: { initialColumns: ["reference", "community", "setting", "apartmentType", "priority", "status", "offerExpiresAt"] } },
  fields: {
    reference: systemText({ indexed: "unique", required: true }),
    community: (0, import_fields11.relationship)({ ref: "Community", ...ro2 }),
    prospect: (0, import_fields11.relationship)({ ref: "Prospect", ...ro2 }),
    lead: (0, import_fields11.relationship)({ ref: "Lead", ...ro2 }),
    apartmentType: (0, import_fields11.relationship)({ ref: "ApartmentType", ...ro2 }),
    setting: (0, import_fields11.select)({ ...opt2(SETTINGS), ...ro2 }),
    priority: (0, import_fields11.integer)({ defaultValue: 100, ...ro2 }),
    priorityReason: (0, import_fields11.select)({ ...opt2(["internal_transfer", "continuing_care", "date_order", "other"]), defaultValue: "date_order", ...ro2 }),
    status: lifecycle(["active", "offered", "accepted", "declined", "expired", "converted", "withdrawn"]),
    offeredReservation: (0, import_fields11.relationship)({ ref: "PlaceReservation", ...ro2 }),
    offerExpiresAt: (0, import_fields11.timestamp)({ ...ro2 }),
    version: versionField(),
    ...trackingFields
  }
});
var SalesActivity = (0, import_core11.list)({
  access: scopedGoverned([...salesRead], ["lead", "community"]),
  fields: {
    lead: (0, import_fields11.relationship)({ ref: "Lead.activities", ...ro2 }),
    kind: fixedChoice(["call", "email", "text", "tour", "assessment", "note"]),
    at: (0, import_fields11.timestamp)({ ...ro2, defaultValue: { kind: "now" } }),
    by: (0, import_fields11.relationship)({ ref: "User", ...ro2 }),
    ...phiFields("SalesActivity", { summary: ["dem", import_fields11.text, ro2] }),
    ...trackingFields
  }
});
var StorefrontSite = (0, import_core11.list)({
  access: {
    operation: { query: isStaff, create: anyOf("canManageStorefront"), update: anyOf("canManageStorefront"), delete: sys4 },
    filter: { query: assignedFilter(["community"]), update: assignedFilter(["community"]) }
  },
  ui: { labelField: "heroTitle" },
  fields: {
    community: (0, import_fields11.relationship)({ ref: "Community.storefront" }),
    published: (0, import_fields11.checkbox)({ defaultValue: false }),
    heroTitle: (0, import_fields11.text)({ validation: { isRequired: true } }),
    heroBody: (0, import_fields11.text)({ ui: { displayMode: "textarea" } }),
    amenities: (0, import_fields11.json)({ defaultValue: [] }),
    diningCopy: (0, import_fields11.text)({ ui: { displayMode: "textarea" } }),
    activitiesCopy: (0, import_fields11.text)({ ui: { displayMode: "textarea" } }),
    careLevelsCopy: (0, import_fields11.text)({ ui: { displayMode: "textarea" } }),
    gallery: (0, import_fields11.relationship)({ ref: "Document", many: true }),
    staffBios: (0, import_fields11.relationship)({ ref: "StaffBio.site", many: true }),
    faq: (0, import_fields11.json)({ defaultValue: [] }),
    showCmsRatings: (0, import_fields11.checkbox)({ defaultValue: false }),
    acceptedPayers: (0, import_fields11.json)({ defaultValue: [] }),
    seo: (0, import_fields11.json)({ defaultValue: {} }),
    tourBookingEnabled: (0, import_fields11.checkbox)({ defaultValue: true }),
    waitlistEnabled: (0, import_fields11.checkbox)({ defaultValue: true }),
    ...trackingFields
  }
});
var StaffBio = (0, import_core11.list)({
  access: {
    operation: { query: isStaff, create: anyOf("canManageStorefront"), update: anyOf("canManageStorefront"), delete: anyOf("canManageStorefront") },
    filter: { query: assignedFilter(["site", "community"]) }
  },
  ui: { labelField: "name" },
  fields: {
    site: (0, import_fields11.relationship)({ ref: "StorefrontSite.staffBios" }),
    name: (0, import_fields11.text)({ validation: { isRequired: true } }),
    title: (0, import_fields11.text)(),
    bio: (0, import_fields11.text)({ ui: { displayMode: "textarea" } }),
    photo: (0, import_fields11.relationship)({ ref: "Document" }),
    sortOrder: (0, import_fields11.integer)({ defaultValue: 0 }),
    consentDocument: (0, import_fields11.relationship)({ ref: "Document", ui: { description: "The staff member agreed to appear on the public site." } }),
    ...trackingFields
  }
});
var PublishedPrice = (0, import_core11.list)({
  access: {
    operation: { query: isStaff, create: anyOf("canManageStorefront"), update: anyOf("canManageStorefront"), delete: sys4 },
    filter: { query: assignedFilter(["community"]), update: assignedFilter(["community"]) }
  },
  ui: { labelField: "label", listView: { initialColumns: ["label", "community", "fromMinor", "toMinor", "status"] } },
  fields: {
    community: (0, import_fields11.relationship)({ ref: "Community" }),
    apartmentType: (0, import_fields11.relationship)({ ref: "ApartmentType" }),
    setting: (0, import_fields11.select)({ ...opt2(SETTINGS) }),
    label: (0, import_fields11.text)({ validation: { isRequired: true } }),
    fromMinor: minor({ required: true, description: "Starting monthly (or daily for nursing) price in cents." }),
    toMinor: minor(),
    period: choice(["month", "day"], "month"),
    communityFeeMinor: minor(),
    disclaimer: (0, import_fields11.text)({ ui: { displayMode: "textarea" } }),
    status: lifecycle(["draft", "published", "retired"], "draft"),
    publishedAt: (0, import_fields11.timestamp)({ ...ro2 }),
    version: versionField(),
    ...trackingFields
  }
});
var AvailabilitySnapshot = (0, import_core11.list)({
  access: { operation: { query: isStaff, create: sys4, update: sys4, delete: sys4 } },
  ui: { listView: { initialColumns: ["community", "apartmentType", "setting", "availableCount", "computedAt"] } },
  fields: {
    community: (0, import_fields11.relationship)({ ref: "Community", ...ro2 }),
    apartmentType: (0, import_fields11.relationship)({ ref: "ApartmentType", ...ro2 }),
    setting: systemText(),
    snapshotKey: systemText({ indexed: "unique", required: true }),
    availableCount: (0, import_fields11.integer)({ defaultValue: 0, ...ro2 }),
    waitlistOpen: (0, import_fields11.checkbox)({ defaultValue: true, ...ro2 }),
    computedAt: (0, import_fields11.timestamp)({ ...ro2 })
  }
});
var JobPosting = (0, import_core11.list)({
  access: {
    operation: { query: isStaff, create: anyOf("canManageStorefront", "canManagePeople"), update: anyOf("canManageStorefront", "canManagePeople"), delete: sys4 },
    filter: { query: assignedFilter(["community"]) }
  },
  ui: { labelField: "title" },
  fields: {
    community: (0, import_fields11.relationship)({ ref: "Community" }),
    title: (0, import_fields11.text)({ validation: { isRequired: true } }),
    role: (0, import_fields11.text)(),
    employmentType: choice(["full_time", "part_time", "prn", "contract"], "full_time"),
    payRange: (0, import_fields11.json)({ defaultValue: {} }),
    body: (0, import_fields11.text)({ ui: { displayMode: "textarea" } }),
    status: choice(["draft", "published", "closed"], "draft"),
    ...trackingFields
  }
});
var PORTAL_SCOPES = ["updates", "photos", "care_summary", "calendar", "menus", "messages", "statements", "payments", "trust_balance", "documents", "visit_booking"];
var AUTHORITY_BASES = ["self", "healthcare_poa", "financial_responsible", "guardian"];
var SCOPE_AUTHORITY = {
  updates: ["self", "healthcare_poa", "financial_responsible", "guardian"],
  photos: ["self", "healthcare_poa", "guardian"],
  calendar: ["self", "healthcare_poa", "financial_responsible", "guardian"],
  menus: ["self", "healthcare_poa", "financial_responsible", "guardian"],
  visit_booking: ["self", "healthcare_poa", "financial_responsible", "guardian"],
  care_summary: ["self", "healthcare_poa", "guardian"],
  messages: ["self", "healthcare_poa", "guardian"],
  documents: ["self", "healthcare_poa", "guardian"],
  statements: ["self", "financial_responsible", "guardian"],
  payments: ["self", "financial_responsible", "guardian"],
  trust_balance: ["self", "financial_responsible", "guardian"]
};
var MFA_SCOPES = /* @__PURE__ */ new Set(["care_summary", "messages", "documents", "trust_balance", "statements", "payments"]);
var PortalAccount = (0, import_core11.list)({
  access: { operation: { query: anyOf("canManageRepresentatives", "canApprovePortalScopes"), create: sys4, update: sys4, delete: sys4 } },
  ui: { labelField: "reference", listView: { initialColumns: ["reference", "contact", "status", "mfaEnrolled", "invitationExpiresAt"] } },
  fields: {
    reference: systemText({ indexed: "unique", required: true }),
    user: (0, import_fields11.relationship)({ ref: "User.portalAccount", ...ro2 }),
    contact: (0, import_fields11.relationship)({ ref: "Contact", ...ro2 }),
    community: (0, import_fields11.relationship)({ ref: "Community", ...ro2 }),
    representatives: (0, import_fields11.relationship)({ ref: "Representative.portalAccount", many: true, ...ro2 }),
    status: lifecycle(["invited", "active", "suspended", "revoked"]),
    invitedBy: (0, import_fields11.relationship)({ ref: "User", ...ro2 }),
    invitationTokenHash: (0, import_fields11.text)({ access: { read: sys4, create: sys4, update: sys4 }, graphql: { omit: true }, ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "hidden" } } }),
    invitationExpiresAt: (0, import_fields11.timestamp)({ ...ro2 }),
    acceptedAt: (0, import_fields11.timestamp)({ ...ro2 }),
    mfaEnrolled: (0, import_fields11.checkbox)({ defaultValue: false, ...ro2 }),
    sessionEpoch: (0, import_fields11.integer)({ defaultValue: 0, ...ro2, ui: { ...ro2.ui, description: "Bumped on revocation so existing portal sessions stop working." } }),
    grants: (0, import_fields11.relationship)({ ref: "PortalScopeGrant.account", many: true, ...ro2 }),
    version: versionField(),
    ...trackingFields
  }
});
var PortalScopeGrant = (0, import_core11.list)({
  access: { operation: { query: anyOf("canManageRepresentatives", "canApprovePortalScopes"), create: sys4, update: sys4, delete: sys4 } },
  ui: { labelField: "scope", listView: { initialColumns: ["account", "resident", "scope", "status", "grantedAt"] } },
  fields: {
    account: (0, import_fields11.relationship)({ ref: "PortalAccount.grants", ...ro2 }),
    resident: (0, import_fields11.relationship)({ ref: "Resident", ...ro2 }),
    representative: (0, import_fields11.relationship)({ ref: "Representative", ...ro2 }),
    scope: fixedChoice(PORTAL_SCOPES),
    authorityBasis: fixedChoice(AUTHORITY_BASES),
    consentDocument: (0, import_fields11.relationship)({ ref: "Document", ...ro2 }),
    status: lifecycle(["proposed", "granted", "revoked"]),
    proposedBy: (0, import_fields11.relationship)({ ref: "User", ...ro2 }),
    grantedBy: (0, import_fields11.relationship)({ ref: "User", ...ro2 }),
    grantedAt: (0, import_fields11.timestamp)({ ...ro2 }),
    revokedAt: (0, import_fields11.timestamp)({ ...ro2 }),
    revokeReason: systemText(),
    version: versionField(),
    ...trackingFields
  }
});
PHI_LISTS.add("Inquiry");
PHI_LISTS.add("Prospect");
PHI_LISTS.add("Referral");
PHI_LISTS.add("PortalScopeGrant");

// features/keystone/models/index.ts
var { SETTINGS: _settings, ...platformLists } = platform_exports;
var { AGENT_SCOPES: _scopes, PHI_AGENT_SCOPES: _phiScopes, PROPOSAL_KINDS: _kinds, ...agentLists } = agents_exports;
var { BED_STATUSES: _bed, APARTMENT_STATUSES: _apt, ...placeLists } = places_exports;
var { CODE_STATUSES: _code, REPRESENTATIVE_ROLES: _roles, ADMISSION_SOURCES: _src, DISCHARGE_DISPOSITIONS: _disp, CENSUS_EVENT_KINDS: _cek, PAYER_KINDS: _payers, ...residentLists } = residents_exports;
var { LEAD_STATUSES: _lead, PORTAL_SCOPES: _portal, AUTHORITY_BASES: _ab, SCOPE_AUTHORITY: _sa, MFA_SCOPES: _mfa, ...salesLists } = sales_exports;
var models = {
  User,
  Role,
  OAuthApp,
  OAuthToken,
  ...platformLists,
  ...agentLists,
  ...placeLists,
  ...residentLists,
  ...salesLists
};

// features/keystone/index.ts
var import_session5 = require("@keystone-6/core/session");

// features/keystone/mutations/index.ts
var import_schema = require("@graphql-tools/schema");

// features/keystone/mutations/redirectToInit.ts
async function redirectToInit(root, args, context) {
  const userCount = await context.sudo().query.User.count({});
  if (userCount === 0) {
    return true;
  }
  return false;
}
var redirectToInit_default = redirectToInit;

// features/keystone/mutations/updateActiveUser.ts
async function updateActiveUser(_root, { data }, context) {
  const session = context.session;
  if (!isSignedIn({ session })) throw new Error("Not authenticated");
  const allowed = /* @__PURE__ */ new Set(["email", "name", "password", "onboardingStatus"]);
  if (Object.keys(data || {}).some((key) => !allowed.has(key))) throw new Error("Unsupported profile field");
  return context.db.User.updateOne({ where: { id: session.itemId }, data });
}
var updateActiveUser_default = updateActiveUser;

// features/keystone/mutations/op.ts
var import_graphql = require("graphql");

// features/keystone/lib/errors.ts
var DomainError = class extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
};
var isDomainError = (error) => error instanceof DomainError;
var Codes = {
  NOT_AUTHORIZED: "NOT_AUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  STALE_STATE: "STALE_STATE",
  GUARD_FAILED: "GUARD_FAILED",
  IDEMPOTENCY_KEY_REQUIRED: "IDEMPOTENCY_KEY_REQUIRED",
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  IN_PROGRESS: "IN_PROGRESS",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  SELF_APPROVAL: "SELF_APPROVAL",
  AGENT_CANNOT_APPROVE: "AGENT_CANNOT_APPROVE",
  APPROVAL_MISMATCH: "APPROVAL_MISMATCH",
  LEASE_LOST: "LEASE_LOST",
  STALE_FENCING_TOKEN: "STALE_FENCING_TOKEN",
  AUDIT_CHAIN_BROKEN: "AUDIT_CHAIN_BROKEN",
  PLACE_UNAVAILABLE: "PLACE_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  PROJECTION_MISMATCH: "PROJECTION_MISMATCH"
};

// features/keystone/mutations/op.ts
var UNSAFE = /prisma|invocation|\bat\s+\S+\s*\(|node_modules|postgres(ql)?:\/\/|\bSQL\b|ECONN|query engine|\.ts:\d+|\.js:\d+/i;
var SAFE_DETAIL_KEYS = /* @__PURE__ */ new Set(["currentStatus", "currentVersion", "to", "reason", "field", "problems", "replay"]);
var op = (fn) => async (root, args, context) => {
  try {
    return await fn(root, args, context);
  } catch (error) {
    if (error instanceof import_graphql.GraphQLError) throw error;
    if (isDomainError(error)) {
      const details = Object.fromEntries(Object.entries(error.details).filter(([key]) => SAFE_DETAIL_KEYS.has(key)));
      throw new import_graphql.GraphQLError(error.message, { extensions: { code: error.code, ...details } });
    }
    const message = typeof error?.message === "string" ? error.message : "";
    console.error("Operation failed:", message.slice(0, 300).replace(/postgres(ql)?:\/\/\S+/g, "<url>"));
    const safe = message && message.length <= 300 && !UNSAFE.test(message) && !error?.code;
    throw new import_graphql.GraphQLError(safe ? message : "Unable to complete the request. Please try again.", { extensions: { code: "KS_USER_INPUT_ERROR" } });
  }
};
var requireKey = (key) => String(key ?? "");

// features/keystone/lib/actor.ts
function actorFromSession(session) {
  if (!session || !isSignedIn({ session })) throw new DomainError(Codes.NOT_AUTHORIZED, "Sign in to continue.");
  const role = session.data.role;
  const granted = new Set(role ? permissionNames.filter((name) => role[name] === true) : []);
  return { kind: "user", userId: session.itemId, name: session.data.name, permissions: granted };
}
function can(actor, permission) {
  return actor.kind === "user" && actor.permissions.has(permission);
}
function requirePermission(actor, ...anyOf2) {
  if (actor.kind === "system") return;
  if (actor.kind === "agent") throw new DomainError(Codes.NOT_AUTHORIZED, "Agents act only through their tool grants.");
  if (!anyOf2.some((permission) => actor.permissions.has(permission))) {
    throw new DomainError(Codes.NOT_AUTHORIZED, `This needs the ${anyOf2.join(" or ")} permission.`);
  }
}
function requireScope(actor, scope) {
  if (actor.kind !== "agent") return;
  if (!actor.scopes.has(scope)) throw new DomainError(Codes.NOT_AUTHORIZED, `The agent has no active ${scope} grant.`);
}
var principalKey = (actor) => actor.kind === "user" ? `user:${actor.userId}` : actor.kind === "agent" ? `agent:${actor.agentId}` : `system:${actor.name}`;
var actorUserId = (actor) => actor.kind === "user" ? actor.userId : null;
var actorAgentId = (actor) => actor.kind === "agent" ? actor.agentId : null;

// features/keystone/lib/canonical.ts
var import_node_crypto2 = require("node:crypto");

// features/keystone/lib/decimal.ts
var import_decimal = __toESM(require("decimal.js"));
var Decimal = import_decimal.default.clone({
  precision: 60,
  rounding: import_decimal.default.ROUND_HALF_EVEN,
  toExpNeg: -40,
  toExpPos: 60
});
var DECIMAL_TEXT = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
function dec(value) {
  if (value instanceof Decimal) return value;
  if (typeof value === "bigint") return new Decimal(value.toString());
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`Refusing float ${value}: pass the exact decimal as a string`);
    return new Decimal(value);
  }
  const text10 = String(value).trim();
  if (!DECIMAL_TEXT.test(text10)) throw new Error(`Not a decimal number: ${JSON.stringify(text10).slice(0, 40)}`);
  return new Decimal(text10);
}
var plain = (value) => dec(value).toFixed();
var ZERO = new Decimal(0);
var ONE = new Decimal(1);
var BPS = new Decimal(1e4);

// features/keystone/lib/canonical.ts
function canonicalize(value) {
  if (value === null || value === void 0) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON cannot hold a non-finite number");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object") {
    const decimalLike = value;
    if (typeof decimalLike.isFinite === "function" && typeof decimalLike.isNaN === "function") return plain(decimalLike.toString());
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== void 0).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  throw new Error(`Canonical JSON cannot hold a ${typeof value}`);
}
var canonicalJson = (value) => JSON.stringify(canonicalize(value));
var sha256 = (text10) => (0, import_node_crypto2.createHash)("sha256").update(text10).digest("hex");
var payloadHash = (value) => sha256(canonicalJson(value));
var toJsonValue = (value) => canonicalize(value);

// features/keystone/lib/db.ts
async function advisoryLock(tx, key) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
var MODEL_NAME = /^[A-Z][A-Za-z0-9]*$/;
function tableName(model) {
  if (!MODEL_NAME.test(model)) throw new Error(`Invalid model name: ${model.slice(0, 40)}`);
  return `"${model}"`;
}
function delegateOf(tx, model) {
  tableName(model);
  const delegate = tx[model[0].toLowerCase() + model.slice(1)];
  if (!delegate) throw new Error(`Unknown model: ${model}`);
  return delegate;
}
var TRANSACTION_OPTIONS = { maxWait: 15e3, timeout: 6e4 };

// features/keystone/lib/idempotency.ts
var IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,200}$/;
function assertIdempotencyKey(key) {
  if (typeof key !== "string" || !key.trim()) throw new DomainError(Codes.IDEMPOTENCY_KEY_REQUIRED, "An idempotency key is required.");
  if (!IDEMPOTENCY_KEY.test(key)) throw new DomainError(Codes.INVALID_INPUT, "The idempotency key must be 8 to 200 letters, digits or . _ : -");
}
async function claimReceipt(tx, input) {
  assertIdempotencyKey(input.key);
  await advisoryLock(tx, `command:${input.key}`);
  const existing = await tx.commandReceipt.findUnique({ where: { idempotencyKey: input.key } });
  if (!existing) return { replay: false };
  const requestHash = payloadHash(input.params);
  if (existing.command !== input.command || existing.principalKey !== input.principalKey || existing.requestHash !== requestHash) {
    throw new DomainError(Codes.IDEMPOTENCY_KEY_REUSED, "This idempotency key was already used for a different request.");
  }
  return { replay: true, responseBody: existing.responseBody };
}
async function writeReceipt(tx, input) {
  await tx.commandReceipt.create({
    data: {
      idempotencyKey: input.key,
      command: input.command,
      principalKey: input.principalKey,
      requestHash: payloadHash(input.params),
      requestParams: toJsonValue(canonicalize(input.params)),
      responseCode: "ok",
      responseBody: toJsonValue(input.response),
      recoveryPoint: "completed",
      completedAt: input.now
    }
  });
}

// features/keystone/lib/audit.ts
var import_node_crypto3 = require("node:crypto");
var GENESIS_HASH = "0".repeat(64);
function auditHashBody(row) {
  return {
    seq: row.seq,
    eventKey: row.eventKey,
    eventType: row.eventType,
    entityType: row.entityType,
    entityId: row.entityId,
    actorUserId: row.actorUserId ?? null,
    actorAgentId: row.actorAgentId ?? null,
    approverId: row.approverId ?? null,
    reason: row.reason || null,
    before: row.before ?? null,
    after: row.after ?? null,
    metadata: row.metadata ?? null,
    requestId: row.requestId || null,
    at: row.at.toISOString()
  };
}
var auditHash = (prevHash, row) => sha256(`${prevHash}
${canonicalJson(auditHashBody(row))}`);
async function appendAuditEvents(tx, events, now = /* @__PURE__ */ new Date()) {
  if (!events.length) return [];
  await advisoryLock(tx, "audit:chain");
  const last = await tx.auditEvent.findFirst({ orderBy: { seq: "desc" }, select: { seq: true, hash: true } });
  let seq = last?.seq ?? 0;
  let prevHash = last?.hash ?? GENESIS_HASH;
  const written = [];
  const rows = [];
  for (const event of events) {
    seq += 1;
    const row = {
      seq,
      eventKey: event.eventKey ?? (0, import_node_crypto3.randomUUID)(),
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actorUserId: event.actorUserId ?? null,
      actorAgentId: event.actorAgentId ?? null,
      approverId: event.approverId ?? null,
      reason: event.reason ? event.reason.slice(0, 2e3) : null,
      before: event.before === void 0 ? null : toJsonValue(event.before),
      after: event.after === void 0 ? null : toJsonValue(event.after),
      metadata: event.metadata === void 0 ? null : toJsonValue(event.metadata),
      requestId: event.requestId ?? null,
      prevHash,
      at: now
    };
    const hash = auditHash(prevHash, row);
    rows.push({
      seq: row.seq,
      eventKey: row.eventKey,
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      actorUserId: row.actorUserId,
      actorAgentId: row.actorAgentId,
      approverId: row.approverId,
      reason: row.reason ?? "",
      // Nullable json columns: omit null (stored as SQL NULL, read back as null).
      ...row.before === null ? {} : { before: row.before },
      ...row.after === null ? {} : { after: row.after },
      ...row.metadata === null ? {} : { metadata: row.metadata },
      requestId: row.requestId ?? "",
      prevHash,
      hash,
      at: row.at
    });
    written.push({ seq, hash });
    prevHash = hash;
  }
  await tx.auditEvent.createMany({ data: rows });
  return written;
}
async function verifyAuditChain(db, batchSize = 1e3) {
  let prevHash = GENESIS_HASH;
  let expectedSeq = 1;
  let count = 0;
  for (; ; ) {
    const rows = await db.auditEvent.findMany({ where: { seq: { gte: expectedSeq } }, orderBy: { seq: "asc" }, take: batchSize });
    if (!rows.length) break;
    for (const row of rows) {
      if (row.seq !== expectedSeq) return { ok: false, count, lastSeq: expectedSeq - 1, lastHash: prevHash, brokenAtSeq: expectedSeq, problem: "missing event" };
      if (row.prevHash !== prevHash) return { ok: false, count, lastSeq: row.seq - 1, lastHash: prevHash, brokenAtSeq: row.seq, problem: "previous hash does not match" };
      const hash = auditHash(prevHash, {
        ...row,
        reason: row.reason || null,
        requestId: row.requestId || null,
        actorUserId: row.actorUserId ?? null,
        actorAgentId: row.actorAgentId ?? null,
        approverId: row.approverId ?? null
      });
      if (hash !== row.hash) return { ok: false, count, lastSeq: row.seq - 1, lastHash: prevHash, brokenAtSeq: row.seq, problem: "content does not match its hash" };
      prevHash = row.hash;
      expectedSeq += 1;
      count += 1;
    }
  }
  return { ok: true, count, lastSeq: expectedSeq - 1, lastHash: prevHash };
}

// features/keystone/lib/unitOfWork.ts
var UnitOfWork = class {
  constructor(tx, now, requestId) {
    this.tx = tx;
    this.now = now;
    this.requestId = requestId;
    this.audits = [];
    this.outbox = [];
  }
  audit(event) {
    this.audits.push({ requestId: this.requestId, ...event });
  }
  emit(message) {
    this.outbox.push(message);
  }
};
async function flushOutbox(tx, messages, now) {
  for (const message of messages) {
    const payload = toJsonValue(message.payload);
    const dedupeKey = message.dedupeKey ?? `${message.topic}:${message.aggregateType}:${message.aggregateId}:${sha256(canonicalJson(payload))}`;
    await tx.outboxEvent.upsert({
      where: { dedupeKey },
      create: {
        topic: message.topic,
        aggregateType: message.aggregateType,
        aggregateId: message.aggregateId,
        dedupeKey,
        payload,
        status: "pending",
        nextAttemptAt: message.availableAt ?? now
      },
      update: {}
    });
  }
}
async function runInTransaction(db, work, options = {}) {
  return db.$transaction(async (tx) => {
    const uow = new UnitOfWork(tx, options.now ?? /* @__PURE__ */ new Date(), options.requestId ?? null);
    const result = await work(uow);
    await flushOutbox(tx, uow.outbox, uow.now);
    await appendAuditEvents(tx, uow.audits, uow.now);
    return result;
  }, options.serializable ? { ...TRANSACTION_OPTIONS, isolationLevel: "Serializable" } : TRANSACTION_OPTIONS);
}

// features/keystone/lib/command.ts
var RETRYABLE = /deadlock detected|could not serialize|P2034|40P01|40001/i;
async function command(db, spec, work) {
  const principal = principalKey(spec.actor);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await runInTransaction(db, async (uow) => {
        const receipt = await claimReceipt(uow.tx, { key: spec.idempotencyKey, command: spec.name, principalKey: principal, params: spec.params });
        if (receipt.replay) return { replay: true, value: receipt.responseBody };
        const value = toJsonValue(await work(uow));
        await writeReceipt(uow.tx, { key: spec.idempotencyKey, command: spec.name, principalKey: principal, params: spec.params, response: value, now: uow.now });
        return { replay: false, value };
      }, { requestId: spec.requestId ?? null, now: spec.now, serializable: spec.serializable });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = error?.code ?? "";
      if (attempt < (spec.serializable ? 6 : 4) && (RETRYABLE.test(message) || RETRYABLE.test(code))) continue;
      throw error;
    }
  }
}

// features/keystone/lib/calendar.ts
var US_FEDERAL = [
  ["2026-01-01", "New Year's Day"],
  ["2026-01-19", "Birthday of Martin Luther King, Jr."],
  ["2026-02-16", "Washington's Birthday"],
  ["2026-05-25", "Memorial Day"],
  ["2026-06-19", "Juneteenth National Independence Day"],
  ["2026-07-03", "Independence Day (observed)"],
  ["2026-09-07", "Labor Day"],
  ["2026-10-12", "Columbus Day"],
  ["2026-11-11", "Veterans Day"],
  ["2026-11-26", "Thanksgiving Day"],
  ["2026-12-25", "Christmas Day"],
  ["2027-01-01", "New Year's Day"],
  ["2027-01-18", "Birthday of Martin Luther King, Jr."],
  ["2027-02-15", "Washington's Birthday"],
  ["2027-05-31", "Memorial Day"],
  ["2027-06-18", "Juneteenth National Independence Day (observed)"],
  ["2027-07-05", "Independence Day (observed)"],
  ["2027-09-06", "Labor Day"],
  ["2027-10-11", "Columbus Day"],
  ["2027-11-11", "Veterans Day"],
  ["2027-11-25", "Thanksgiving Day"],
  ["2027-12-24", "Christmas Day (observed)"],
  ["2027-12-31", "New Year's Day 2028 (observed)"],
  ["2028-01-17", "Birthday of Martin Luther King, Jr."],
  ["2028-02-21", "Washington's Birthday"],
  ["2028-05-29", "Memorial Day"],
  ["2028-06-19", "Juneteenth National Independence Day"],
  ["2028-07-04", "Independence Day"],
  ["2028-09-04", "Labor Day"],
  ["2028-10-09", "Columbus Day"],
  ["2028-11-10", "Veterans Day (observed)"],
  ["2028-11-23", "Thanksgiving Day"],
  ["2028-12-25", "Christmas Day"]
];
var US_FED_HOLIDAYS = US_FEDERAL;
var US_FED_SOURCE = "OPM federal holiday schedule 2026-2028, observed dates (opm.gov, fetched 2026-11-07)";
var US_FED = {
  code: "US-FED",
  timeZone: "America/New_York",
  weekendDays: [0, 6],
  holidays: new Set(US_FEDERAL.map(([date2]) => date2)),
  coverageThrough: "2028-12-31"
};
var DATE = /^\d{4}-\d{2}-\d{2}$/;
function assertDate(date2) {
  if (!DATE.test(date2) || Number.isNaN(Date.parse(`${date2}T00:00:00Z`))) throw new Error(`Invalid date ${date2}`);
}
function addDays(date2, days) {
  assertDate(date2);
  const t = Date.parse(`${date2}T12:00:00Z`) + days * 864e5;
  return new Date(t).toISOString().slice(0, 10);
}
var weekday = (date2) => (/* @__PURE__ */ new Date(`${date2}T12:00:00Z`)).getUTCDay();
function covered(calendar, date2) {
  if (date2 > calendar.coverageThrough) throw new Error(`${calendar.code} has no verified schedule for ${date2}`);
}
function isWorkingDay(calendar, date2) {
  assertDate(date2);
  covered(calendar, date2);
  return !calendar.weekendDays.includes(weekday(date2)) && !calendar.holidays.has(date2);
}
function nextWorkingDay(calendar, date2) {
  let d = addDays(date2, 1);
  while (!isWorkingDay(calendar, d)) d = addDays(d, 1);
  return d;
}
function previousWorkingDay(calendar, date2) {
  let d = addDays(date2, -1);
  while (!isWorkingDay(calendar, d)) d = addDays(d, -1);
  return d;
}
function addWorkingDays(calendar, date2, n) {
  let d = date2;
  for (let i = 0; i < Math.abs(n); i += 1) d = n > 0 ? nextWorkingDay(calendar, d) : previousWorkingDay(calendar, d);
  return d;
}
var zoneParts = (timeZone, at) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at)).map((p) => [p.type, p.value]));
function localDate(timeZone, at) {
  const p = zoneParts(timeZone, typeof at === "number" ? at : at.getTime());
  return `${p.year}-${p.month}-${p.day}`;
}
function zonedInstant(timeZone, date2, hhmm) {
  assertDate(date2);
  const [h, m] = hhmm.split(":").map((x) => Number.parseInt(x, 10));
  let guess = Date.parse(`${date2}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  for (let i = 0; i < 3; i += 1) {
    const p = zoneParts(timeZone, guess);
    const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
    const target = Date.UTC(Number(date2.slice(0, 4)), Number(date2.slice(5, 7)) - 1, Number(date2.slice(8, 10)), h, m);
    const diff = target - local;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

// features/keystone/lib/cas.ts
var COLUMN = /^[a-z][A-Za-z0-9]*$/;
async function lockRow(tx, model, id) {
  const rows = await tx.$queryRawUnsafe(`SELECT id FROM ${tableName(model)} WHERE id = $1 FOR UPDATE`, id);
  if (!rows.length) throw new DomainError(Codes.NOT_FOUND, `${model} not found.`, { model, id });
  const row = await delegateOf(tx, model).findUnique({ where: { id } });
  return row;
}
async function transition(uow, spec) {
  const statusField = spec.statusField ?? "status";
  if (!COLUMN.test(statusField)) throw new Error("Invalid status field");
  const row = await lockRow(uow.tx, spec.model, spec.id);
  const currentStatus = String(row[statusField]);
  const currentVersion = Number(row.version);
  if (spec.expectedVersion !== void 0 && spec.expectedVersion !== null && spec.expectedVersion !== currentVersion) {
    throw new DomainError(Codes.STALE_STATE, `${spec.model} changed since you loaded it. Reload and try again.`, { currentStatus, currentVersion });
  }
  if (!spec.from.includes(currentStatus)) {
    throw new DomainError(Codes.INVALID_TRANSITION, `${spec.model} can't move from ${currentStatus} to ${spec.to}.`, { currentStatus, currentVersion, to: spec.to });
  }
  if (spec.guard) await spec.guard(row);
  const extra = typeof spec.data === "function" ? await spec.data(row) : spec.data ?? {};
  const result = await delegateOf(uow.tx, spec.model).updateMany({
    where: { id: spec.id, version: currentVersion, [statusField]: { in: [...spec.from] } },
    data: { ...extra, [statusField]: spec.to, version: { increment: 1 } }
  });
  if (result.count !== 1) {
    throw new DomainError(Codes.STALE_STATE, `${spec.model} changed since you loaded it. Reload and try again.`, { currentStatus, currentVersion });
  }
  uow.audit({
    eventType: spec.eventType,
    entityType: spec.model,
    entityId: spec.id,
    actorUserId: actorUserId(spec.actor),
    actorAgentId: actorAgentId(spec.actor),
    approverId: spec.approverId ?? null,
    reason: spec.reason ?? null,
    before: { [statusField]: currentStatus, version: currentVersion },
    after: { [statusField]: spec.to, version: currentVersion + 1, ...extra },
    metadata: { ...spec.metadata ?? {}, ...spec.actor.kind === "system" ? { system: spec.actor.name } : {} }
  });
  return await delegateOf(uow.tx, spec.model).findUnique({ where: { id: spec.id } });
}
async function casUpdate(uow, spec) {
  const statusField = spec.statusField ?? "status";
  if (!COLUMN.test(statusField)) throw new Error("Invalid status field");
  const result = await delegateOf(uow.tx, spec.model).updateMany({
    where: { id: spec.id, version: spec.version, [statusField]: { in: [...spec.from] } },
    data: { ...spec.data ?? {}, [statusField]: spec.to, version: { increment: 1 } }
  });
  if (result.count !== 1) throw new DomainError(Codes.STALE_STATE, `${spec.model} changed since you loaded it. Reload and try again.`, { currentVersion: spec.version, to: spec.to });
  uow.audit({
    eventType: spec.eventType,
    entityType: spec.model,
    entityId: spec.id,
    actorUserId: actorUserId(spec.actor),
    actorAgentId: actorAgentId(spec.actor),
    approverId: spec.approverId ?? null,
    reason: spec.reason ?? null,
    before: { [statusField]: spec.from.length === 1 ? spec.from[0] : spec.from, version: spec.version },
    after: { [statusField]: spec.to, version: spec.version + 1, ...spec.audit ?? spec.data ?? {} },
    metadata: { ...spec.metadata ?? {}, ...spec.actor.kind === "system" ? { system: spec.actor.name } : {} }
  });
  return spec.version + 1;
}
function auditCreate(uow, actor, model, id, eventType, after, extra = {}) {
  uow.audit({
    eventType,
    entityType: model,
    entityId: id,
    actorUserId: actorUserId(actor),
    actorAgentId: actorAgentId(actor),
    reason: extra.reason ?? null,
    after,
    metadata: { ...extra.metadata ?? {}, ...actor.kind === "system" ? { system: actor.name } : {} }
  });
}

// features/keystone/seed/operator.ts
var OPERATOR = {
  legalName: "Ridgeline Senior Communities, LLC",
  displayName: "Ridgeline Senior Communities",
  homeTimeZone: "America/New_York"
};
var STAFF_BASE = ["canAccessDashboard", "canReportIncident"];
var RESIDENT_READ = ["canReadResidentDemographics"];
var CLINICAL_READ = [...RESIDENT_READ, "canReadClinical"];
var ROLES = [
  { id: "seed_role_operator_admin", name: "Operator Admin", description: "Runs the platform for the operator: communities, people, roles and integrations.", permissions: [...STAFF_BASE, "canSeeOtherPeople", "canEditOtherPeople", "canManagePeople", "canManageRoles", "canManageOnboarding", "canManageOperator", "canManageCommunities", "canManagePlaces", "canManageIntegrations", "canManageAgents", "canReadAudit", "canReadCompliance", "canReadSales"] },
  { id: "seed_role_executive_director", name: "Executive Director", description: "Licensed administrator: census, sales, compliance and approvals for the community.", permissions: [...STAFF_BASE, ...RESIDENT_READ, "canSeeOtherPeople", "canReadSales", "canManageSales", "canManageStorefront", "canApproveCensusCorrections", "canApproveIncidentDowngrade", "canApproveRates", "canApproveWriteOffs", "canApproveIntegrations", "canReadCompliance", "canApproveCompliance", "canReadIncidents", "canReadBilling", "canReadWorkforce", "canReadAudit", "canReadFindings", "canApproveWorkflows"] },
  { id: "seed_role_don", name: "Director of Nursing", description: "Clinical lead: corrections, count discrepancies, care plans and clinical approvals.", permissions: [...STAFF_BASE, ...CLINICAL_READ, "canReadSensitiveClinical", "canChartNursing", "canManageCarePlans", "canManageAssessments", "canApproveClinicalCorrections", "canResolveCountDiscrepancy", "canApproveControlledAdjustments", "canInvestigateIncidents", "canReadIncidents", "canRecordCensus", "canBreakGlass", "canReadCompliance", "canReadFindings", "canApproveWorkflows", "canManageWorkflows", "canReadWorkforce"] },
  { id: "seed_role_adon", name: "Assistant Director of Nursing", description: "Supports the DON; charts, plans care and investigates incidents.", permissions: [...STAFF_BASE, ...CLINICAL_READ, "canChartNursing", "canManageCarePlans", "canManageAssessments", "canInvestigateIncidents", "canReadIncidents", "canRecordCensus", "canBreakGlass", "canReadFindings"] },
  { id: "seed_role_charge_nurse", name: "Charge Nurse (RN/LPN)", description: "Unit nurse: charting, medication pass, census moves on the unit.", permissions: [...STAFF_BASE, ...CLINICAL_READ, "canChartNursing", "canAdministerMeds", "canWitnessControlled", "canEnterOrders", "canRecordCensus", "canBreakGlass", "canReadIncidents"] },
  { id: "seed_role_cna", name: "Certified Nursing Assistant", description: "Point-of-care charting (ADLs, intake, vitals) on assigned units.", permissions: [...STAFF_BASE, ...RESIDENT_READ, "canChartPointOfCare"] },
  { id: "seed_role_med_tech", name: "Med Tech (AL)", description: "Assisted-living medication administration where the state pack allows it.", permissions: [...STAFF_BASE, ...CLINICAL_READ, "canAdministerMeds", "canChartPointOfCare"] },
  { id: "seed_role_mds", name: "MDS Coordinator", description: "Assessments, MDS schedule and PDPM.", permissions: [...STAFF_BASE, ...CLINICAL_READ, "canManageAssessments", "canSubmitRegulatory", "canReadBilling", "canReadIdentifiers"] },
  { id: "seed_role_ip", name: "Infection Preventionist", description: "Infection surveillance, precautions, outbreaks and immunisations.", permissions: [...STAFF_BASE, ...CLINICAL_READ, "canManageInfectionControl", "canDeclareOutbreak", "canSubmitRegulatory", "canReadFindings"] },
  { id: "seed_role_prescriber", name: "Prescriber", description: "Physician or NP: orders and signatures.", permissions: [...STAFF_BASE, ...CLINICAL_READ, "canReadSensitiveClinical", "canEnterOrders", "canSignOrders"] },
  { id: "seed_role_consultant_pharmacist", name: "Consultant Pharmacist", description: "Monthly drug regimen review.", permissions: [...STAFF_BASE, ...CLINICAL_READ, "canManagePharmacy"] },
  { id: "seed_role_therapist", name: "Therapist", description: "PT/OT/SLP documentation and minutes.", permissions: [...STAFF_BASE, ...CLINICAL_READ, "canChartNursing"] },
  { id: "seed_role_dietary", name: "Dietary", description: "Diets, textures and meal service.", permissions: [...STAFF_BASE, ...RESIDENT_READ, "canManageDietary"] },
  { id: "seed_role_activities", name: "Activities", description: "Activity calendar and participation.", permissions: [...STAFF_BASE, ...RESIDENT_READ, "canManageActivities", "canManageFamilyUpdates"] },
  { id: "seed_role_social_services", name: "Social Services", description: "Representatives, portal scopes, notices and family communication.", permissions: [...STAFF_BASE, ...RESIDENT_READ, "canManageRepresentatives", "canApprovePortalScopes", "canMessageFamilies", "canManageFamilyUpdates", "canReadSensitiveClinical"] },
  { id: "seed_role_admissions", name: "Admissions", description: "Inquiries, tours, referrals, waitlist, admissions and discharges.", permissions: [...STAFF_BASE, ...RESIDENT_READ, "canManageSales", "canReadSales", "canManageStorefront", "canAdmitDischarge", "canRecordCensus", "canManageRepresentatives"] },
  { id: "seed_role_business_office", name: "Business Office", description: "Payers, coverage, billing and payments.", permissions: [...STAFF_BASE, ...RESIDENT_READ, "canManageBilling", "canManageClaims", "canPostPayments", "canManageRates", "canReadBilling", "canReadIdentifiers", "canManagePayments", "canIssueRefunds"] },
  { id: "seed_role_trust_officer", name: "Trust Officer", description: "Records resident trust deposits and withdrawals.", permissions: [...STAFF_BASE, ...RESIDENT_READ, "canOperateTrust", "canReadTrust"] },
  { id: "seed_role_trust_approver", name: "Trust Approver", description: "Second person for trust withdrawals over threshold and reconciliations.", permissions: [...STAFF_BASE, ...RESIDENT_READ, "canApproveTrust", "canReadTrust"] },
  { id: "seed_role_scheduler", name: "Scheduler", description: "Shifts and open-shift offers.", permissions: [...STAFF_BASE, "canManageSchedule", "canReadWorkforce"] },
  { id: "seed_role_hr", name: "Human Resources", description: "People, credentials and timecards.", permissions: [...STAFF_BASE, "canSeeOtherPeople", "canManagePeople", "canManageCredentials", "canManageTimecards", "canApproveTimecards", "canReadWorkforce"] },
  { id: "seed_role_privacy_officer", name: "Privacy Officer", description: "Reviews break-glass and PHI read audit; owns the BAA register.", permissions: [...STAFF_BASE, "canReviewBreakGlass", "canReadPhiAudit", "canReadAudit", "canReadCompliance", "canApproveAgentGrants"] },
  { id: "seed_role_compliance_lead", name: "QAPI / Compliance Lead", description: "Compliance clocks, surveys, QAPI and packs.", permissions: [...STAFF_BASE, ...RESIDENT_READ, "canManageCompliance", "canManageSurveys", "canManageQapi", "canApproveCompliance", "canReadCompliance", "canReadIncidents", "canReadFindings", "canReadAudit"] },
  { id: "seed_role_surveyor", name: "Surveyor", description: "Read-only, time-boxed by the user access expiry.", permissions: ["canAccessDashboard", ...CLINICAL_READ, "canReadCompliance", "canReadIncidents"] },
  { id: "seed_role_portal", name: "Portal", description: "Family portal only; no dashboard.", permissions: [] }
];
var STAFF = [
  { id: "seed_user_castellanos", name: "Naomi Castellanos", email: "naomi.castellanos@mapleridge.example", title: "Executive Director", roleId: "seed_role_executive_director", kind: "staff" },
  { id: "seed_user_oyelaran", name: "Patrick Oyelaran, RN", email: "patrick.oyelaran@mapleridge.example", title: "Director of Nursing", roleId: "seed_role_don", kind: "staff" },
  { id: "seed_user_lindqvist", name: "Grace Lindqvist, RN", email: "grace.lindqvist@mapleridge.example", title: "Assistant Director of Nursing", roleId: "seed_role_adon", kind: "staff" },
  { id: "seed_user_ramos", name: "Luis Ramos, LPN", email: "luis.ramos@mapleridge.example", title: "Charge Nurse, Birch", roleId: "seed_role_charge_nurse", kind: "staff" },
  { id: "seed_user_vukovic", name: "Renata Vukovic, RN", email: "renata.vukovic@mapleridge.example", title: "MDS Coordinator", roleId: "seed_role_mds", kind: "staff" },
  { id: "seed_user_achterberg", name: "Samuel Achterberg, RN", email: "samuel.achterberg@mapleridge.example", title: "Infection Preventionist", roleId: "seed_role_ip", kind: "staff" },
  { id: "seed_user_patel", name: "Devika Patel", email: "devika.patel@mapleridge.example", title: "Admissions Director", roleId: "seed_role_admissions", kind: "staff" },
  { id: "seed_user_brooks", name: "Tasha Brooks, MSW", email: "tasha.brooks@mapleridge.example", title: "Social Services Director", roleId: "seed_role_social_services", kind: "staff" },
  { id: "seed_user_holloway", name: "Tamsin Holloway", email: "tamsin.holloway@mapleridge.example", title: "Business Office Manager", roleId: "seed_role_business_office", kind: "staff" },
  { id: "seed_user_almeida", name: "Jorge Almeida", email: "jorge.almeida@mapleridge.example", title: "Trust Officer", roleId: "seed_role_trust_officer", kind: "staff" },
  { id: "seed_user_durand", name: "Keisha Durand", email: "keisha.durand@mapleridge.example", title: "Scheduler", roleId: "seed_role_scheduler", kind: "staff" },
  { id: "seed_user_ferreira_kahn", name: "Martin Ferreira-Kahn", email: "martin.ferreira-kahn@ridgeline.example", title: "Privacy Officer", roleId: "seed_role_privacy_officer", kind: "staff" },
  { id: "seed_user_brandvold", name: "Dr. Ilse Brandvold", email: "ilse.brandvold@mapleridge.example", title: "Medical Director", roleId: "seed_role_prescriber", kind: "staff" },
  { id: "seed_user_adewale", name: "Dr. Femi Adewale", email: "femi.adewale@mapleridge.example", title: "Consultant Pharmacist", roleId: "seed_role_consultant_pharmacist", kind: "staff" },
  { id: "seed_user_ferris", name: "Owen Ferris", email: "owen.ferris@ridgeline.example", title: "Operator Administrator", roleId: "seed_role_operator_admin", kind: "staff" }
];
var APPROVAL_POLICIES = [
  { action: "census.correct_closed_period", description: "Correct a census event inside a closed billing period.", requiredPermission: "canApproveCensusCorrections", expiresAfterMinutes: 1440 },
  { action: "operator.controls", description: "Change operator controls (inference policy, break-glass hours, approval thresholds).", requiredPermission: "canApproveCompliance", expiresAfterMinutes: 1440 },
  { action: "portal.grant_scope", description: 'Grant a family portal scope above "updates".', requiredPermission: "canApprovePortalScopes", expiresAfterMinutes: 7 * 1440 },
  { action: "agent_grant.activate", description: "Activate a tool grant for an AI agent (PHI scopes need two approvers).", requiredPermission: "canApproveAgentGrants", expiresAfterMinutes: 1440 },
  { action: "role.assign_approval", description: "Give a person a role that can approve.", requiredPermission: "canManageRoles", expiresAfterMinutes: 1440 },
  { action: "rate.publish", description: "Publish a rate schedule.", requiredPermission: "canApproveRates", expiresAfterMinutes: 1440 }
];
var COMMUNITY = {
  id: "seed_community_maple_ridge",
  name: "Maple Ridge Senior Living",
  slug: "maple-ridge",
  reference: "MRSL",
  timeZone: "America/New_York",
  addressLine1: "4100 Maple Ridge Parkway",
  city: "Columbus",
  region: "OH",
  postalCode: "43219",
  country: "US",
  phone: "(614) 555-0142",
  settingsOffered: ["nursing_facility", "assisted_living", "memory_care", "independent_living"],
  identifiers: { ccn: "SEED-CCN-0001", npi: "SEED-NPI-0001", stateLicence: "SEED-OH-NH-0001", medicaidProviderId: "SEED-OH-MCD-0001", nhsnOrgId: "SEED-NHSN-0001" }
};
var NF_UNITS = [
  { id: "seed_unit_birch", name: "Birch", code: "BIR", specialty: "short_stay_rehab", firstRoom: 101, beds: 32, isolationRooms: 0 },
  { id: "seed_unit_cedar", name: "Cedar", code: "CED", specialty: "long_term", firstRoom: 201, beds: 32, isolationRooms: 0 },
  { id: "seed_unit_willow", name: "Willow", code: "WIL", specialty: "long_term", firstRoom: 217, beds: 32, isolationRooms: 0 },
  { id: "seed_unit_aspen", name: "Aspen", code: "ASP", specialty: "long_term", firstRoom: 305, beds: 24, isolationRooms: 4 }
];
var RESIDENTIAL_UNITS = [
  { id: "seed_unit_meadow", name: "Meadow", code: "MEA", setting: "assisted_living", secured: false, count: 48, prefix: "A" },
  { id: "seed_unit_harbor", name: "Harbor", code: "HAR", setting: "memory_care", secured: true, count: 24, prefix: "H" },
  { id: "seed_unit_grove", name: "Grove", code: "GRO", setting: "independent_living", secured: false, count: 20, prefix: "I" }
];
var APARTMENT_TYPES = [
  { id: "seed_apt_studio", name: "Studio", setting: "assisted_living", squareFeet: 410, bedrooms: 0, description: "A bright studio with a kitchenette and an accessible bathroom." },
  { id: "seed_apt_one_bed", name: "One Bedroom", setting: "assisted_living", squareFeet: 620, bedrooms: 1, description: "A separate bedroom, a living room and a kitchenette." },
  { id: "seed_apt_companion", name: "Companion Suite", setting: "assisted_living", squareFeet: 540, bedrooms: 1, description: "A shared suite for spouses or companions." },
  { id: "seed_apt_mc_suite", name: "Memory Care Suite", setting: "memory_care", squareFeet: 330, bedrooms: 0, description: "A private suite in the secured Harbor neighbourhood." },
  { id: "seed_apt_il_one", name: "Independent One Bedroom", setting: "independent_living", squareFeet: 760, bedrooms: 1, description: "A full kitchen, a patio and housekeeping included." }
];
function apartmentTypeFor(unitCode, index) {
  if (unitCode === "HAR") return "seed_apt_mc_suite";
  if (unitCode === "GRO") return "seed_apt_il_one";
  if (index % 8 === 7) return "seed_apt_companion";
  return index % 3 === 0 ? "seed_apt_one_bed" : "seed_apt_studio";
}
var PAYERS = [
  { id: "seed_payer_medicare_a", name: "Medicare Part A", kind: "medicare_a", claimFormat: "837i", dayCountingRule: "count_admit_not_discharge" },
  { id: "seed_payer_ohio_medicaid", name: "Ohio Medicaid (fee-for-service)", kind: "medicaid_ffs", claimFormat: "837i", dayCountingRule: "count_admit_not_discharge" },
  { id: "seed_payer_buckeye_ma", name: "Buckeye Health Advantage (fictional MA plan)", kind: "medicare_advantage", claimFormat: "837i", dayCountingRule: "count_admit_not_discharge" },
  { id: "seed_payer_ohio_mco", name: "Scioto Care Partners (fictional Ohio Medicaid MCO)", kind: "medicaid_mco", claimFormat: "837i", dayCountingRule: "count_admit_not_discharge" },
  { id: "seed_payer_lakeshore_ltc", name: "Lakeshore Long-Term Care Insurance (fictional)", kind: "ltc_insurance", claimFormat: "invoice", dayCountingRule: "count_admit_not_discharge" },
  { id: "seed_payer_private", name: "Private pay", kind: "private_pay", claimFormat: "invoice", dayCountingRule: "count_admit_not_discharge" }
];

// features/keystone/seed/packs.ts
var NF = ["nursing_facility"];
var US_FED_PACK = {
  id: "seed_pack_us_fed",
  code: "US-FED",
  name: "United States federal requirements for long-term care facilities (42 CFR Part 483)",
  packVersion: "2026.11",
  effectiveFrom: "2026-01-01",
  sourceNote: "Fetched 2026-11-07 from law.cornell.edu (42 CFR 483.15) and opm.gov (federal holidays). Values marked (verify) need counsel review before production use.",
  rules: {
    noticeOfTransferDischargeDays: { value: 30, ruleRef: "42 CFR 483.15(c)(4)(i)", verifyNote: 'Fetched 2026-11-07. Exceptions in 483.15(c)(4)(ii)(A)-(E) allow notice "as soon as practicable".' },
    ombudsmanCopy: { value: true, ruleRef: "42 CFR 483.15(c)(3)(i)", verifyNote: "A copy of the transfer/discharge notice goes to the Office of the State LTC Ombudsman." },
    bedHoldNoticeAtTransfer: { value: true, ruleRef: "42 CFR 483.15(d)(2)", verifyNote: 'Fetched 2026-11-07: the text says "at the time of transfer" with no fixed hour window. The grace window is OperatorSettings.bedHoldNoticeGraceHours (operator policy, verify with counsel).' }
  },
  obligations: [
    { code: "BEDHOLD_AT_TRANSFER", description: "Give the resident or representative written bed-hold notice at the time of transfer to a hospital or on therapeutic leave.", appliesTo: { settings: NF }, startFact: "census.leave_start", dueRule: { kind: "operator_setting_hours", setting: "bedHoldNoticeGraceHours" }, evidenceTypes: ["notice_delivery:bed_hold_at_transfer"], ruleRef: "42 CFR 483.15(d)(2)", verifyNote: 'Regulation says "at the time of transfer"; the due window equals OperatorSettings.bedHoldNoticeGraceHours (operator policy, verify with counsel).', ownerRole: "Charge Nurse (RN/LPN)", active: true },
    { code: "BEDHOLD_POLICY_BEFORE_TRANSFER", description: "Bed-hold policy given before transfer (at admission and again in advance of a planned transfer).", appliesTo: { settings: NF }, startFact: "census.admission", dueRule: { kind: "at_start" }, evidenceTypes: ["notice_delivery:bed_hold_policy"], ruleRef: "42 CFR 483.15(d)(1)", verifyNote: "Fetched 2026-11-07.", ownerRole: "Admissions", active: true },
    { code: "DISCHARGE_NOTICE_30D", description: "Written transfer/discharge notice at least 30 days before a facility-initiated discharge, with a copy to the Ombudsman.", appliesTo: { settings: NF }, startFact: "census.discharge_planned", dueRule: { kind: "calendar_days", days: 30 }, evidenceTypes: ["notice_delivery:transfer_discharge", "ombudsman_copy"], ruleRef: "42 CFR 483.15(c)(3)-(4)", verifyNote: 'Fetched 2026-11-07. Exceptions (c)(4)(ii)(A)-(E) shorten the notice to "as soon as practicable".', ownerRole: "Social Services", active: true },
    { code: "TRANSFER_NOTICE_OMBUDSMAN", description: "Copy of the transfer or discharge notice for a facility-initiated transfer or discharge sent to the Long-Term Care Ombudsman.", appliesTo: { settings: NF }, startFact: "census.facility_initiated_transfer", dueRule: { kind: "calendar_days", days: 30 }, evidenceTypes: ["ombudsman_copy"], ruleRef: "42 CFR 483.15(c)(3)(i)", verifyNote: "CMS guidance allows a monthly list for emergency transfers (verify current State Operations Manual Appendix PP).", ownerRole: "Social Services", active: true },
    { code: "PRIVACY_NOTICE_AT_ADMISSION", description: "Notice of privacy practices given at admission.", appliesTo: {}, startFact: "census.admission", dueRule: { kind: "at_start" }, evidenceTypes: ["notice_delivery:privacy_practices"], ruleRef: "45 CFR 164.520", verifyNote: "Verify with the privacy officer.", ownerRole: "Admissions", active: true },
    { code: "ADMISSION_AGREEMENT", description: "Signed admission agreement on file.", appliesTo: {}, startFact: "census.admission", dueRule: { kind: "calendar_days", days: 7 }, evidenceTypes: ["document:admission_agreement"], waivable: true, ruleRef: "Operator policy; 42 CFR 483.15(a) limits terms", verifyNote: "Operator policy window (verify).", ownerRole: "Admissions", active: true },
    { code: "CP_BASELINE_48H", description: "Baseline care plan within 48 hours of admission.", appliesTo: { settings: NF }, startFact: "census.admission", dueRule: { kind: "duration", hours: 48 }, evidenceTypes: ["care_plan:baseline"], ruleRef: "42 CFR 483.21(a)", verifyNote: "Phase 2.", ownerRole: "Director of Nursing", active: false },
    { code: "CP_COMPREHENSIVE_7D", description: "Comprehensive care plan within 7 days after the comprehensive assessment.", appliesTo: { settings: NF }, startFact: "mds.admission_completed", dueRule: { kind: "calendar_days", days: 7 }, evidenceTypes: ["care_plan:comprehensive"], ruleRef: "42 CFR 483.21(b)(2)(i)", verifyNote: "Phase 2.", ownerRole: "MDS Coordinator", active: false },
    { code: "F609_INITIAL_2H", description: "Report alleged abuse or serious bodily injury within 2 hours.", appliesTo: { settings: NF }, startFact: "incident.alleged_abuse_sbi", dueRule: { kind: "duration", hours: 2 }, evidenceTypes: ["submission:state_incident"], ruleRef: "42 CFR 483.12(c)(1)", verifyNote: "Phase 2.", ownerRole: "Executive Director", active: false },
    { code: "F609_INITIAL_24H", description: "Report other allegations within 24 hours.", appliesTo: { settings: NF }, startFact: "incident.alleged_other", dueRule: { kind: "duration", hours: 24 }, evidenceTypes: ["submission:state_incident"], ruleRef: "42 CFR 483.12(c)(1)", verifyNote: "Phase 2.", ownerRole: "Executive Director", active: false },
    { code: "F609_INVESTIGATION_5WD", description: "Investigation results within 5 working days.", appliesTo: { settings: NF }, startFact: "incident.reported", dueRule: { kind: "working_days", days: 5 }, evidenceTypes: ["submission:state_incident_followup"], ruleRef: "42 CFR 483.12(c)(4)", verifyNote: "Phase 2.", ownerRole: "Executive Director", active: false },
    { code: "MDS_ADMISSION_D14", description: "Admission MDS completed by day 14.", appliesTo: { settings: NF }, startFact: "census.admission", dueRule: { kind: "calendar_days", days: 13 }, evidenceTypes: ["mds:admission"], ruleRef: "42 CFR 483.20(b)(2)(i)", verifyNote: "Phase 4.", ownerRole: "MDS Coordinator", active: false },
    { code: "MDS_SUBMIT_14D", description: "MDS transmitted within 14 days after completion.", appliesTo: { settings: NF }, startFact: "mds.completed", dueRule: { kind: "calendar_days", days: 14 }, evidenceTypes: ["submission:mds_batch"], ruleRef: "42 CFR 483.20(f)(3)", verifyNote: "Phase 4.", ownerRole: "MDS Coordinator", active: false },
    { code: "NOMNC_2D", description: "Notice of Medicare Non-Coverage at least 2 days before covered services end.", appliesTo: { settings: NF, payerKinds: ["medicare_a", "medicare_advantage"] }, startFact: "coverage.ending_planned", dueRule: { kind: "calendar_days", days: 2 }, evidenceTypes: ["notice_delivery:nomnc"], ruleRef: "42 CFR 405.1200", verifyNote: "Phase 4.", ownerRole: "Business Office", active: false },
    { code: "PBJ_QUARTER", description: "Payroll-Based Journal staffing data submitted by the quarterly deadline.", appliesTo: { settings: NF }, startFact: "quarter.closed", dueRule: { kind: "published_dates", dates: ["2026-11-14", "2027-02-14", "2027-05-15", "2027-08-14"] }, evidenceTypes: ["submission:pbj_quarter"], ruleRef: "42 CFR 483.70(p)", verifyNote: "Deadlines are 45 days after quarter end (verify CMS PBJ page).", ownerRole: "Human Resources", active: false },
    { code: "NHSN_WEEKLY_RPV", description: "Weekly respiratory pathogen and vaccination reporting to NHSN.", appliesTo: { settings: NF }, startFact: "week.closed", dueRule: { kind: "calendar_days", days: 7 }, evidenceTypes: ["submission:nhsn_weekly"], ruleRef: "42 CFR 483.80(g)", verifyNote: "Phase 4 (verify the current reporting scope).", ownerRole: "Infection Preventionist", active: false },
    { code: "TRUST_CONVEYANCE_30D", description: "Convey trust funds and a final accounting within 30 days of death.", appliesTo: {}, startFact: "census.death", dueRule: { kind: "calendar_days", days: 30 }, evidenceTypes: ["trust:conveyance"], ruleRef: "42 CFR 483.10(f)(10)(v)", verifyNote: "Phase 3.", ownerRole: "Trust Officer", active: false },
    { code: "TRUST_QUARTERLY_STATEMENT", description: "Quarterly trust statement to the resident or representative.", appliesTo: {}, startFact: "quarter.closed", dueRule: { kind: "calendar_days", days: 30 }, evidenceTypes: ["notice_delivery:trust_quarterly"], ruleRef: "42 CFR 483.10(f)(10)(iii)", verifyNote: "Phase 3.", ownerRole: "Trust Officer", active: false },
    { code: "SSI_THRESHOLD_NOTICE", description: "Notify when the trust balance comes within $200 of the SSI resource limit.", appliesTo: { payerKinds: ["medicaid_ffs", "medicaid_mco"] }, startFact: "trust.threshold", dueRule: { kind: "calendar_days", days: 7 }, evidenceTypes: ["notice_delivery:ssi_threshold"], ruleRef: "42 CFR 483.10(f)(10)(iv)", verifyNote: "Phase 3.", ownerRole: "Trust Officer", active: false },
    { code: "PHYSICIAN_VISIT_30_60", description: "Physician visits every 30 days for the first 90 days, then every 60 days.", appliesTo: { settings: NF }, startFact: "census.admission", dueRule: { kind: "calendar_days", days: 30 }, evidenceTypes: ["physician_visit"], ruleRef: "42 CFR 483.30(c)", verifyNote: "Phase 2 (10-day grace per 483.30(c)(2)).", ownerRole: "Director of Nursing", active: false },
    { code: "POC_10D", description: "Plan of correction within 10 calendar days of receiving the CMS-2567.", appliesTo: { settings: NF }, startFact: "survey.statement_received", dueRule: { kind: "calendar_days", days: 10 }, evidenceTypes: ["plan_of_correction"], ruleRef: "42 CFR 488.402(d)", verifyNote: "Phase 6.", ownerRole: "Executive Director", active: false }
  ]
};
var US_OH_PACK = {
  id: "seed_pack_us_oh",
  code: "US-OH",
  name: "Ohio nursing facility and residential care facility rules",
  packVersion: "2026.11",
  effectiveFrom: "2026-01-01",
  sourceNote: "Fetched 2026-11-07 from codes.ohio.gov (Ohio Adm. Code 5160-3-16.4). Other Ohio values are marked (verify).",
  rules: {
    medicaidBedHold: {
      daysPerCalendarYear: 30,
      rateRule: { kind: "percent_of_per_diem_by_prior_year_occupancy", occupancyThresholdPct: "95", aboveThresholdPct: "50", atOrBelowThresholdPct: "18" },
      paymentInFull: true,
      requiresIntentToReturn: true,
      admissionDayCountsAsOccupied: true,
      ruleRef: "Ohio Adm. Code 5160-3-16.4(D)(1)-(3), (A)(6), (C)(1); ORC 5165.34",
      verifyNote: "Fetched 2026-11-07 from codes.ohio.gov. Confirm the prior-year occupancy figure with the Medicaid cost report each year."
    },
    dnrComfortCare: { codes: ["dnr_cc", "dnr_cca"], ruleRef: "ORC 2133.21-2133.26; Ohio Adm. Code 3701-62", verifyNote: "Ohio DNR Comfort Care / Comfort Care-Arrest protocol (verify current forms)." }
  },
  obligations: [
    { code: "OH_BEDHOLD_DAYS_TRACKED", description: "Track Medicaid bed-hold leave days per calendar year (30-day cap) and the resident's intent to return.", appliesTo: { settings: NF, payerKinds: ["medicaid_ffs", "medicaid_mco"] }, startFact: "census.leave_start", dueRule: { kind: "at_start" }, evidenceTypes: ["census_event:leave_start"], ruleRef: "Ohio Adm. Code 5160-3-16.4(D)(1)", verifyNote: "Fetched 2026-11-07.", ownerRole: "Business Office", active: true },
    { code: "OH_INCIDENT_SELF_REPORT", description: "Ohio nursing home self-report of incidents to ODH.", appliesTo: { settings: NF }, startFact: "incident.reported", dueRule: { kind: "working_days", days: 5 }, evidenceTypes: ["submission:state_incident"], ruleRef: "Ohio Adm. Code 3701-17 (verify)", verifyNote: "Phase 2 (verify the ODH self-report rule and timelines).", ownerRole: "Executive Director", active: false },
    { code: "OH_AL_RESIDENT_ASSESSMENT", description: "Residential care facility resident assessment before or at move-in.", appliesTo: { settings: ["assisted_living", "memory_care"] }, startFact: "census.admission", dueRule: { kind: "at_start" }, evidenceTypes: ["assessment:al_resident"], ruleRef: "Ohio Adm. Code 3701-16 (verify)", verifyNote: "Phase 2 (verify the OAC 3701-16 timing).", ownerRole: "Director of Nursing", active: false }
  ]
};
var PACKS = [US_FED_PACK, US_OH_PACK];

// features/keystone/seed/platform.ts
var UNUSABLE_PASSWORD_HASH = "$2a$10$3dITCbIvf5zFA.1U8KZDhOHC3EEexi3KYy5ysZK1cRF6LHMm0H.ya";
var day = (date2) => /* @__PURE__ */ new Date(`${date2}T00:00:00Z`);
var seedMeta = { metadata: { seed: true } };
async function seedOperatorPlatform(uow, actor) {
  const { tx } = uow;
  const created = { operator: 0, roles: 0, staff: 0, assignments: 0, approvalPolicies: 0, calendars: 0, holidays: 0, packs: 0, obligations: 0, communities: 0, units: 0, rooms: 0, beds: 0, apartments: 0, payers: 0 };
  for (const pack of PACKS) {
    let row = await tx.jurisdictionPack.findUnique({ where: { code: pack.code } });
    if (!row) {
      row = await tx.jurisdictionPack.create({ data: { id: pack.id, code: pack.code, name: pack.name, packVersion: pack.packVersion, effectiveFrom: day(pack.effectiveFrom), status: "active", rules: pack.rules, sourceNote: pack.sourceNote } });
      auditCreate(uow, actor, "JurisdictionPack", row.id, "pack.loaded", { code: pack.code, packVersion: pack.packVersion }, seedMeta);
      created.packs += 1;
    }
    const have = new Set((await tx.regulatoryObligation.findMany({ where: { packId: row.id }, select: { code: true } })).map((o) => o.code));
    const missing = pack.obligations.filter((o) => !have.has(o.code));
    if (missing.length) {
      await tx.regulatoryObligation.createMany({
        data: missing.map((o) => ({ packId: row.id, code: o.code, description: o.description, appliesTo: o.appliesTo, startFact: o.startFact, dueRule: o.dueRule, evidenceTypes: o.evidenceTypes, waivable: Boolean(o.waivable), ruleRef: o.ruleRef, verifyNote: o.verifyNote, ownerRole: o.ownerRole, active: o.active }))
      });
      uow.audit({ eventType: "pack.obligations_loaded", entityType: "JurisdictionPack", entityId: row.id, actorUserId: actor.kind === "user" ? actor.userId : null, after: { codes: missing.map((o) => o.code) }, metadata: { seed: true } });
      created.obligations += missing.length;
    }
  }
  let calendar = await tx.holidayCalendar.findUnique({ where: { code: US_FED.code } });
  if (!calendar) {
    calendar = await tx.holidayCalendar.create({ data: { id: "seed_calendar_us_fed", code: US_FED.code, name: "US federal holidays (observed)", timeZone: US_FED.timeZone, weekendDays: US_FED.weekendDays, coverageThrough: day(US_FED.coverageThrough), source: US_FED_SOURCE } });
    auditCreate(uow, actor, "HolidayCalendar", calendar.id, "calendar.created", { code: US_FED.code, coverageThrough: US_FED.coverageThrough }, seedMeta);
    created.calendars += 1;
  }
  const haveDays = new Set((await tx.holidayDate.findMany({ where: { calendarId: calendar.id }, select: { date: true } })).map((d) => d.date.toISOString().slice(0, 10)));
  const days = US_FED_HOLIDAYS.filter(([date2]) => !haveDays.has(date2));
  if (days.length) {
    await tx.holidayDate.createMany({ data: days.map(([date2, name]) => ({ calendarId: calendar.id, date: day(date2), name })) });
    created.holidays = days.length;
  }
  if (!await tx.operatorSettings.findUnique({ where: { id: 1 } })) {
    const packIds = (await tx.jurisdictionPack.findMany({ select: { id: true } })).map((p) => ({ id: p.id }));
    await tx.operatorSettings.create({ data: { id: 1, ...OPERATOR, synthetic: true, jurisdictionPacks: { connect: packIds } } });
    auditCreate(uow, actor, "OperatorSettings", "1", "operator.created", OPERATOR, seedMeta);
    created.operator = 1;
  }
  const haveRoles = new Set((await tx.role.findMany({ where: { id: { in: ROLES.map((r) => r.id) } }, select: { id: true } })).map((r) => r.id));
  const newRoles = ROLES.filter((role) => !haveRoles.has(role.id));
  if (newRoles.length) {
    await tx.role.createMany({ data: newRoles.map((role) => ({ id: role.id, name: role.name, description: role.description, ...Object.fromEntries(permissionNames.map((name) => [name, role.permissions.includes(name)])) })) });
    for (const role of newRoles) auditCreate(uow, actor, "Role", role.id, "role.created", { name: role.name, permissions: role.permissions }, seedMeta);
    created.roles = newRoles.length;
  }
  let community = await tx.community.findUnique({ where: { slug: COMMUNITY.slug } });
  if (!community) {
    const ohio = await tx.jurisdictionPack.findUnique({ where: { code: US_OH_PACK.code }, select: { id: true } });
    community = await tx.community.create({ data: { ...COMMUNITY, settingsOffered: COMMUNITY.settingsOffered, identifiers: COMMUNITY.identifiers, jurisdictionPackId: ohio?.id ?? null, holidayCalendarId: calendar.id, status: "active", synthetic: true } });
    auditCreate(uow, actor, "Community", community.id, "community.created", { name: community.name, reference: community.reference }, seedMeta);
    created.communities = 1;
  }
  if (!community.bedHoldPolicyId) {
    const rule3 = US_OH_PACK.rules.medicaidBedHold ?? {};
    const policy = await tx.bedHoldPolicy.upsert({
      where: { id: "seed_bed_hold_policy_maple_ridge" },
      create: { id: "seed_bed_hold_policy_maple_ridge", name: "Maple Ridge bed-hold policy", communityId: community.id, jurisdictionPackId: "seed_pack_us_oh", medicaidHoldDaysPerYear: rule3.daysPerCalendarYear, medicaidHoldPaid: true, medicaidHoldRateRule: rule3.rateRule, therapeuticLeaveDaysPerYear: rule3.daysPerCalendarYear, privateHoldDailyRateMinor: 31500n, ruleRef: rule3.ruleRef, verifyNote: `${rule3.verifyNote} Private hold charge is the operator's contract rate (fictional).`, effectiveFrom: day("2026-01-01") },
      update: {}
    });
    await tx.community.update({ where: { id: community.id }, data: { bedHoldPolicyId: policy.id } });
    auditCreate(uow, actor, "BedHoldPolicy", policy.id, "bed_hold_policy.created", { medicaidHoldDaysPerYear: policy.medicaidHoldDaysPerYear, ruleRef: policy.ruleRef }, seedMeta);
  }
  const buildings = [
    { id: "seed_building_health_center", name: "Health Center", kind: "nursing" },
    { id: "seed_building_residences", name: "The Residences", kind: "residential" }
  ];
  for (const building of buildings) {
    if (await tx.building.findUnique({ where: { id: building.id } })) continue;
    await tx.building.create({ data: { ...building, communityId: community.id } });
  }
  for (const unit of NF_UNITS) {
    if (await tx.unit.findUnique({ where: { id: unit.id } })) continue;
    await tx.unit.create({ data: { id: unit.id, communityId: community.id, buildingId: "seed_building_health_center", name: unit.name, code: unit.code, setting: "nursing_facility", specialty: unit.specialty, secured: false, status: "active" } });
    created.units += 1;
    const rooms = [];
    let remaining = unit.beds;
    for (let i = 0; remaining > 0; i += 1) {
      const isolation = i < unit.isolationRooms;
      const number = String(unit.firstRoom + i);
      const beds = isolation || remaining === 1 ? ["A"] : ["A", "B"];
      rooms.push({ number, kind: beds.length === 1 ? "private" : "semi_private", isolation, beds });
      remaining -= beds.length;
    }
    for (const room of rooms) {
      const roomId = `seed_room_${unit.code.toLowerCase()}_${room.number}`;
      await tx.room.create({ data: { id: roomId, unitId: unit.id, number: room.number, kind: room.kind, isolationCapable: room.isolation, privateBath: room.isolation } });
      await tx.bed.createMany({ data: room.beds.map((label) => ({ id: `${roomId}_${label.toLowerCase()}`, roomId, label: `${room.number}${label}`, certification: "dual", licensed: true, status: "available" })) });
      created.rooms += 1;
      created.beds += room.beds.length;
    }
  }
  for (const type of APARTMENT_TYPES) {
    if (await tx.apartmentType.findUnique({ where: { id: type.id } })) continue;
    await tx.apartmentType.create({ data: { ...type, communityId: community.id } });
  }
  for (const unit of RESIDENTIAL_UNITS) {
    if (await tx.unit.findUnique({ where: { id: unit.id } })) continue;
    await tx.unit.create({ data: { id: unit.id, communityId: community.id, buildingId: "seed_building_residences", name: unit.name, code: unit.code, setting: unit.setting, secured: unit.secured, specialty: "none", status: "active" } });
    created.units += 1;
    const rows = Array.from({ length: unit.count }, (_, index) => {
      const floor = unit.code === "MEA" ? 1 + Math.floor(index / 16) : 1;
      const number = unit.code === "MEA" ? `${unit.prefix}${floor}-${String(index % 16 + 1).padStart(2, "0")}` : `${unit.prefix}${index + 1}`;
      const typeId = apartmentTypeFor(unit.code, index);
      return { id: `seed_apartment_${unit.code.toLowerCase()}_${index + 1}`, unitId: unit.id, number, apartmentTypeId: typeId, capacity: typeId === "seed_apt_companion" ? 2 : 1, allowsUnrelatedCompanion: false, status: "available", occupantCount: 0 };
    });
    await tx.apartment.createMany({ data: rows });
    created.apartments += rows.length;
  }
  for (const payer of PAYERS) {
    if (await tx.payer.findUnique({ where: { id: payer.id } })) continue;
    await tx.payer.create({ data: { ...payer } });
    created.payers += 1;
  }
  const haveUsers = await tx.user.findMany({ where: { OR: [{ id: { in: STAFF.map((p) => p.id) } }, { email: { in: STAFF.map((p) => p.email) } }] }, select: { id: true, email: true } });
  const newStaff = STAFF.filter((person) => !haveUsers.some((u) => u.id === person.id || u.email === person.email));
  if (newStaff.length) {
    await tx.user.createMany({ data: newStaff.map((person) => ({ id: person.id, name: person.name, email: person.email, title: person.title, password: UNUSABLE_PASSWORD_HASH, kind: person.kind, roleId: person.roleId, synthetic: true, onboardingStatus: "dismissed", accessExpiresAt: person.accessDays ? new Date(uow.now.getTime() + person.accessDays * 864e5) : null })) });
    for (const person of newStaff) auditCreate(uow, actor, "User", person.id, "user.created", { name: person.name, title: person.title, role: person.roleId }, seedMeta);
    created.staff = newStaff.length;
  }
  const assignees = await tx.user.findMany({ where: { id: { in: STAFF.filter((p) => p.roleId !== "seed_role_operator_admin").map((p) => p.id) } }, select: { id: true } });
  if (actor.kind === "user" && !assignees.some((a) => a.id === actor.userId)) assignees.push({ id: actor.userId });
  for (const user of assignees) {
    const exists = await tx.staffAssignment.findFirst({ where: { userId: user.id, communityId: community.id } });
    if (exists) continue;
    const row = await tx.staffAssignment.create({ data: { userId: user.id, communityId: community.id, effectiveFrom: day("2026-01-01"), status: "active" } });
    auditCreate(uow, actor, "StaffAssignment", row.id, "staff_assignment.created", { userId: user.id, communityId: community.id }, seedMeta);
    created.assignments += 1;
  }
  const havePolicies = new Set((await tx.approvalPolicy.findMany({ select: { action: true } })).map((p) => p.action));
  for (const policy of APPROVAL_POLICIES.filter((p) => !havePolicies.has(p.action))) {
    const row = await tx.approvalPolicy.create({ data: { action: policy.action, description: policy.description, requiredPermission: policy.requiredPermission, minApprovals: 1, expiresAfterMinutes: policy.expiresAfterMinutes } });
    auditCreate(uow, actor, "ApprovalPolicy", row.id, "approval_policy.created", { action: policy.action, requiredPermission: policy.requiredPermission }, seedMeta);
    created.approvalPolicies += 1;
  }
  return { communityId: community.id, created };
}

// features/keystone/mutations/setup.ts
async function loadOperatorSetup(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageOnboarding");
  const result = await command(context.prisma, { name: "setup.load_operator", actor, idempotencyKey: args.idempotencyKey, params: {} }, (uow) => seedOperatorPlatform(uow, actor));
  return { replay: result.replay, ...result.value };
}

// features/keystone/mutations/audit.ts
async function verifyAuditChain2(_root, _args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canReadAudit");
  return verifyAuditChain(context.prisma);
}

// features/keystone/lib/separationOfDuties.ts
var SELF_APPROVAL_MESSAGE = "You can't approve your own request.";
var AGENT_APPROVAL_MESSAGE = "An agent can propose but never approve.";
function assertCanDecide(actor, requesterUserId, requesterAgentOwnerId, strictAgentOwner = true) {
  if (actor.kind !== "user") throw new DomainError(Codes.AGENT_CANNOT_APPROVE, AGENT_APPROVAL_MESSAGE);
  if (requesterUserId && requesterUserId === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, SELF_APPROVAL_MESSAGE);
  if (strictAgentOwner && requesterAgentOwnerId && requesterAgentOwnerId === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, "You can't approve a proposal made by your own agent.");
}

// features/keystone/lib/approval.ts
async function requestApproval(uow, actor, input) {
  const policy = await uow.tx.approvalPolicy.findUnique({ where: { action: input.action } });
  const requiredPermission = policy?.requiredPermission ?? input.requiredPermission;
  const minutes = input.expiresInMinutes ?? policy?.expiresAfterMinutes ?? 1440;
  const created = await uow.tx.approvalRequest.create({
    data: {
      action: input.action,
      summary: input.summary ?? "",
      targetList: input.targetList,
      targetId: input.targetId,
      payload: toJsonValue(input.payload),
      payloadHash: payloadHash(input.payload),
      requiredPermission,
      communityId: input.communityId ?? null,
      requestedById: actorUserId(actor),
      requestedByAgentId: actorAgentId(actor),
      status: "pending",
      expiresAt: new Date(uow.now.getTime() + minutes * 6e4)
    }
  });
  uow.audit({ eventType: "approval.requested", entityType: "ApprovalRequest", entityId: created.id, actorUserId: actorUserId(actor), actorAgentId: actorAgentId(actor), after: { action: input.action, targetList: input.targetList, targetId: input.targetId, payloadHash: created.payloadHash, requiredPermission } });
  uow.emit({ topic: "notify.approval", aggregateType: "ApprovalRequest", aggregateId: created.id, payload: { action: input.action, requiredPermission }, dedupeKey: `notify.approval:${created.id}` });
  return created;
}
async function decideApproval(uow, actor, input) {
  const request = await lockRow(uow.tx, "ApprovalRequest", input.requestId);
  let agentOwnerId = null;
  if (request.requestedByAgentId) {
    const agent = await uow.tx.agentIdentity.findUnique({ where: { id: request.requestedByAgentId }, select: { ownerId: true } });
    agentOwnerId = agent?.ownerId ?? null;
  }
  assertCanDecide(actor, request.requestedById, agentOwnerId, input.strictAgentOwner ?? true);
  if (actor.kind !== "user" || !actor.permissions.has(request.requiredPermission)) {
    throw new DomainError(Codes.NOT_AUTHORIZED, `Deciding this needs the ${request.requiredPermission} permission.`);
  }
  if (request.communityId && !actor.permissions.has("canManageOperator")) {
    const today = /* @__PURE__ */ new Date(`${uow.now.toISOString().slice(0, 10)}T00:00:00Z`);
    const assigned = await uow.tx.staffAssignment.findFirst({ where: { userId: actor.userId, communityId: request.communityId, status: "active", OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] }, select: { id: true } });
    if (!assigned) throw new DomainError(Codes.NOT_AUTHORIZED, "Only someone assigned to this community can decide this request.");
  }
  if (request.expiresAt && new Date(request.expiresAt).getTime() <= uow.now.getTime()) {
    await transition(uow, { model: "ApprovalRequest", id: input.requestId, from: ["pending"], to: "expired", actor, eventType: "approval.expired" });
    throw new DomainError(Codes.GUARD_FAILED, "This approval request has expired.");
  }
  const to = input.decision === "approve" ? "approved" : "rejected";
  const updated = await transition(uow, {
    model: "ApprovalRequest",
    id: input.requestId,
    from: ["pending"],
    to,
    expectedVersion: input.expectedVersion,
    actor,
    eventType: `approval.${to}`,
    reason: input.reason ?? null,
    approverId: actor.userId
  });
  await uow.tx.approvalDecision.create({ data: { requestId: input.requestId, decidedById: actor.userId, decision: input.decision, reason: input.reason ?? "", at: uow.now } });
  return updated;
}
async function consumeApproval(uow, input) {
  const request = await lockRow(uow.tx, "ApprovalRequest", input.requestId);
  if (request.status !== "approved") throw new DomainError(Codes.APPROVAL_REQUIRED, "This action needs an approved request.");
  if (request.consumedAt) throw new DomainError(Codes.APPROVAL_MISMATCH, "This approval was already used.");
  if (request.action !== input.action || request.targetList !== input.targetList || request.targetId !== input.targetId || request.payloadHash !== payloadHash(input.payload)) {
    throw new DomainError(Codes.APPROVAL_MISMATCH, "The approval was given for a different action or payload.");
  }
  if (request.expiresAt && new Date(request.expiresAt).getTime() <= uow.now.getTime()) throw new DomainError(Codes.GUARD_FAILED, "The approval has expired.");
  const decision = await uow.tx.approvalDecision.findFirst({ where: { requestId: input.requestId, decision: "approve" }, orderBy: { at: "desc" } });
  await uow.tx.approvalRequest.update({ where: { id: input.requestId }, data: { consumedAt: uow.now, version: { increment: 1 } } });
  uow.audit({ eventType: "approval.consumed", entityType: "ApprovalRequest", entityId: input.requestId, approverId: decision?.decidedById ?? null, after: { action: input.action, targetId: input.targetId } });
  return { approverId: decision?.decidedById ?? null };
}

// features/keystone/lib/approvalAppliers.ts
var appliers = /* @__PURE__ */ new Map();
function registerApplier(action, apply, options = {}) {
  if (appliers.has(action)) throw new Error(`Applier for ${action} already registered`);
  appliers.set(action, { apply, applyOnApprove: options.applyOnApprove ?? true });
}
function applierFor(action) {
  return appliers.get(action) ?? null;
}

// features/keystone/mcp-oauth/session.ts
async function resolveMcpAccessToken(context, token, listKey = "User") {
  try {
    const sudo = context.sudo();
    const record = await sudo.db.OAuthToken.findOne({ where: { token: digestToken(token) } });
    if (!record || record.tokenType !== "access_token" || record.isRevoked !== "false" || !record.userId || !record.expiresAt || new Date(record.expiresAt).getTime() <= Date.now()) {
      return void 0;
    }
    const app = await sudo.db.OAuthApp.findOne({ where: { clientId: record.clientId } });
    if (!app || app.status !== "active") return void 0;
    const mcp = {
      clientId: record.clientId,
      scopes: storedScopes(record.scopes),
      tokenId: String(record.id),
      resource: String(record.resource ?? "")
    };
    return { itemId: String(record.userId), listKey, mcp };
  } catch {
    return void 0;
  }
}
function withMcpBearerSessions(strategy, listKey = "User") {
  return {
    ...strategy,
    async get({ context }) {
      const token = bearerToken(context?.req?.headers?.authorization);
      if (isMcpAccessToken(token)) return resolveMcpAccessToken(context, token, listKey);
      return strategy.get({ context });
    }
  };
}
function mcpSessionMarker(session) {
  const marker = session?.mcp;
  return marker && typeof marker.clientId === "string" && Array.isArray(marker.scopes) ? marker : null;
}

// features/keystone/lib/operatorControls.ts
var KEYS = ["inferencePolicy", "breakGlassMaxHours", "reauthMinutes", "bedHoldNoticeGraceHours", "writeOffApprovalThresholdMinor", "refundApprovalThresholdMinor", "trustApprovalThresholdMinor", "strictAgentOwnerSoD"];
var INTS = { breakGlassMaxHours: [1, 24], reauthMinutes: [1, 60], bedHoldNoticeGraceHours: [0, 72] };
function validateOperatorControls(input) {
  const out = {};
  const keys = Object.keys(input ?? {});
  if (!keys.length) throw new DomainError(Codes.INVALID_INPUT, "Nothing to change.");
  for (const key of keys) {
    if (!KEYS.includes(key)) throw new DomainError(Codes.INVALID_INPUT, `${key} is not an operator control.`, { field: key });
    const value = input[key];
    if (key in INTS) {
      const [min, max] = INTS[key];
      if (!Number.isSafeInteger(value) || value < min || value > max) throw new DomainError(Codes.INVALID_INPUT, `${key} must be a whole number from ${min} to ${max}.`, { field: key });
      out[key] = value;
    } else if (key.endsWith("Minor")) {
      if (typeof value !== "string" || !/^\d{1,15}$/.test(value)) throw new DomainError(Codes.INVALID_INPUT, `${key} must be a whole number of cents.`, { field: key });
      out[key] = BigInt(value);
    } else if (key === "inferencePolicy") {
      if (!["self_hosted_only", "self_hosted_or_baa", "any_registered"].includes(String(value))) throw new DomainError(Codes.INVALID_INPUT, "Unknown inference policy.", { field: key });
      out[key] = value;
    } else {
      if (typeof value !== "boolean") throw new DomainError(Codes.INVALID_INPUT, `${key} must be true or false.`, { field: key });
      out[key] = value;
    }
  }
  return out;
}
async function requestOperatorControlsChange(uow, actor, input, reason) {
  const changes = validateOperatorControls(input);
  const settings = await uow.tx.operatorSettings.findUnique({ where: { id: 1 } });
  if (!settings) throw new DomainError(Codes.NOT_FOUND, "Operator settings are not set up yet.");
  return requestApproval(uow, actor, {
    action: "operator.controls",
    targetList: "OperatorSettings",
    targetId: "1",
    payload: { changes, baseVersion: settings.version },
    requiredPermission: "canApproveCompliance",
    summary: `Change operator controls: ${Object.keys(changes).join(", ")}${reason ? ` (${reason})` : ""}`
  });
}
registerApplier("operator.controls", async (uow, actor, request) => {
  const [row] = await uow.tx.$queryRaw`SELECT version FROM "OperatorSettings" WHERE id = 1 FOR UPDATE`;
  if (!row) throw new DomainError(Codes.NOT_FOUND, "Operator settings are not set up yet.");
  const { changes, baseVersion } = request.payload;
  if (row.version !== baseVersion) throw new DomainError(Codes.STALE_STATE, "Operator settings changed after this was approved. Request the change again.", { currentVersion: row.version });
  const data = Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, key.endsWith("Minor") ? BigInt(String(value)) : value]));
  const before = await uow.tx.operatorSettings.findUnique({ where: { id: 1 }, select: Object.fromEntries(Object.keys(data).map((key) => [key, true])) });
  const updated = await uow.tx.operatorSettings.updateMany({ where: { id: 1, version: baseVersion }, data: { ...data, version: { increment: 1 } } });
  if (updated.count !== 1) throw new DomainError(Codes.STALE_STATE, "Operator settings changed while applying.");
  uow.audit({ eventType: "operator.controls_changed", entityType: "OperatorSettings", entityId: "1", actorUserId: actor.kind === "user" ? actor.userId : null, before, after: changes });
  return { applied: Object.keys(changes) };
});

// features/keystone/mutations/approvals.ts
async function decideApprovalRequest(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canAccessDashboard");
  if (mcpSessionMarker(context.session)) throw new DomainError(Codes.NOT_AUTHORIZED, "Approvals are decided in the dashboard, never through a connected app.");
  if (args.decision !== "approve" && args.decision !== "reject") throw new DomainError(Codes.INVALID_INPUT, "Decision must be approve or reject.");
  if (args.decision === "reject" && !args.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Say why you are rejecting it.", { field: "reason" });
  const result = await command(context.prisma, { name: "approval.decide", actor, idempotencyKey: args.idempotencyKey, params: { requestId: args.requestId, decision: args.decision, reason: args.reason ?? "", expectedVersion: args.expectedVersion } }, async (uow) => {
    const settings = await uow.tx.operatorSettings.findUnique({ where: { id: 1 }, select: { strictAgentOwnerSoD: true } });
    const decided = await decideApproval(uow, actor, { requestId: args.requestId, decision: args.decision, reason: args.reason ?? void 0, expectedVersion: args.expectedVersion, strictAgentOwner: settings?.strictAgentOwnerSoD ?? true });
    let applied = null;
    const registration = applierFor(String(decided.action));
    if (args.decision === "approve" && registration?.applyOnApprove) {
      const request = await uow.tx.approvalRequest.findUniqueOrThrow({ where: { id: args.requestId } });
      await consumeApproval(uow, { requestId: request.id, action: request.action, targetList: request.targetList, targetId: request.targetId, payload: request.payload });
      applied = await registration.apply(uow, actor, request);
    }
    return { id: decided.id, status: decided.status, applied };
  });
  return { replay: result.replay, ...result.value };
}
async function cancelApprovalRequest(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canAccessDashboard");
  const result = await command(context.prisma, { name: "approval.cancel", actor, idempotencyKey: args.idempotencyKey, params: args }, async (uow) => {
    const row = await transition(uow, {
      model: "ApprovalRequest",
      id: args.requestId,
      from: ["pending"],
      to: "cancelled",
      expectedVersion: args.expectedVersion,
      actor,
      eventType: "approval.cancelled",
      reason: args.reason ?? null,
      guard: (request) => {
        if (actor.kind !== "user" || request.requestedById !== actor.userId) throw new DomainError(Codes.NOT_AUTHORIZED, "Only the person who asked can withdraw a request.");
      }
    });
    return { id: row.id, status: row.status };
  });
  return { replay: result.replay, ...result.value };
}
async function requestOperatorControls(_root, args, context) {
  const actor = actorFromSession(context.session);
  requirePermission(actor, "canManageOperator");
  if (!args.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Say why the controls should change.", { field: "reason" });
  const result = await command(context.prisma, { name: "operator.controls.request", actor, idempotencyKey: args.idempotencyKey, params: args }, async (uow) => {
    const request = await requestOperatorControlsChange(uow, actor, args.changes, args.reason.trim());
    return { id: request.id, status: request.status };
  });
  return { replay: result.replay, ...result.value };
}

// features/keystone/lib/sequence.ts
var import_node_crypto4 = require("node:crypto");
async function nextReference(tx, prefix, now = /* @__PURE__ */ new Date(), width = 6) {
  if (!/^[A-Z]{2,5}$/.test(prefix)) throw new Error("Reference prefix must be 2-5 capital letters");
  const key = `${prefix}-${now.getUTCFullYear()}`;
  await advisoryLock(tx, `sequence:${key}`);
  const row = await tx.sequence.upsert({ where: { key }, create: { key, nextValue: 2 }, update: { nextValue: { increment: 1 } } });
  const value = row.nextValue - 1;
  return `${key}-${String(value).padStart(width, "0")}`;
}
var CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function publicCode(prefix, groups = 2) {
  const bytes = (0, import_node_crypto4.randomBytes)(groups * 4);
  const chars = Array.from(bytes, (byte) => CROCKFORD[byte % 32]);
  const parts = Array.from({ length: groups }, (_, i) => chars.slice(i * 4, i * 4 + 4).join(""));
  return `${prefix}-${parts.join("-")}`;
}

// features/keystone/lib/clocks.ts
var END_OF_DAY = "23:59";
async function communityClockContext(tx, communityId) {
  const community = await tx.community.findUnique({ where: { id: communityId }, select: { id: true, timeZone: true, jurisdictionPackId: true, holidayCalendarId: true } });
  if (!community) throw new DomainError(Codes.NOT_FOUND, "Community not found.");
  const fed = await tx.jurisdictionPack.findUnique({ where: { code: "US-FED" }, select: { id: true } });
  const packIds = [fed?.id, community.jurisdictionPackId].filter((id) => Boolean(id));
  let calendar = null;
  if (community.holidayCalendarId) {
    const row = await tx.holidayCalendar.findUnique({ where: { id: community.holidayCalendarId }, include: { dates: { select: { date: true } } } });
    if (row?.coverageThrough) {
      calendar = {
        code: row.code,
        timeZone: row.timeZone,
        weekendDays: Array.isArray(row.weekendDays) ? row.weekendDays : [0, 6],
        holidays: new Set(row.dates.map((d) => d.date.toISOString().slice(0, 10))),
        coverageThrough: row.coverageThrough.toISOString().slice(0, 10)
      };
    }
  }
  return { id: community.id, timeZone: community.timeZone, calendar, packIds };
}
async function computeDueAt(tx, rule3, startedAt, ctx) {
  const startDate = localDate(ctx.timeZone, startedAt);
  switch (rule3.kind) {
    case "duration":
      return new Date(startedAt.getTime() + rule3.hours * 36e5);
    case "at_start":
      return startedAt;
    case "calendar_days":
      return zonedInstant(ctx.timeZone, addDays(startDate, rule3.days), END_OF_DAY);
    case "working_days": {
      if (!ctx.calendar) throw new DomainError(Codes.GUARD_FAILED, "This community has no holiday calendar, so working-day deadlines cannot be computed.");
      return zonedInstant(ctx.timeZone, addWorkingDays(ctx.calendar, startDate, rule3.days), END_OF_DAY);
    }
    case "operator_setting_hours": {
      const settings = await tx.operatorSettings.findUnique({ where: { id: 1 }, select: { bedHoldNoticeGraceHours: true } });
      return new Date(startedAt.getTime() + (settings?.bedHoldNoticeGraceHours ?? 24) * 36e5);
    }
    case "published_dates": {
      const next = [...rule3.dates].sort().find((date2) => date2 >= startDate);
      if (!next) throw new DomainError(Codes.GUARD_FAILED, "The pack has no published deadline after this date. Load the next pack version.");
      return zonedInstant(ctx.timeZone, next, END_OF_DAY);
    }
  }
}
async function openClock(uow, actor, input) {
  const ctx = await communityClockContext(uow.tx, input.communityId);
  const obligation = await uow.tx.regulatoryObligation.findFirst({ where: { code: input.obligationCode, active: true, packId: { in: ctx.packIds } } });
  if (!obligation) return null;
  const applies = obligation.appliesTo ?? {};
  if (applies.settings?.length && input.setting && !applies.settings.includes(input.setting)) return null;
  if (applies.payerKinds?.length && (!input.payerKind || !applies.payerKinds.includes(input.payerKind))) return null;
  const occurrenceKey = input.occurrenceKey ?? "default";
  const existing = await uow.tx.complianceClock.findFirst({ where: { obligationCode: input.obligationCode, subjectType: input.subjectType, subjectId: input.subjectId, occurrenceKey, current: true } });
  if (existing) return existing;
  const dueAt = await computeDueAt(uow.tx, obligation.dueRule, input.startedAt, ctx);
  const clock = await uow.tx.complianceClock.create({
    data: {
      obligationId: obligation.id,
      obligationCode: obligation.code,
      communityId: input.communityId,
      residentId: input.residentId ?? null,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      occurrenceKey,
      startedAt: input.startedAt,
      dueAt,
      status: "open",
      ownerRole: obligation.ownerRole,
      ruleRef: obligation.ruleRef,
      verifyNote: obligation.verifyNote,
      current: true
    }
  });
  uow.audit({ eventType: "clock.opened", entityType: "ComplianceClock", entityId: clock.id, actorUserId: actorUserId(actor), actorAgentId: actorAgentId(actor), after: { obligationCode: clock.obligationCode, subjectType: clock.subjectType, subjectId: clock.subjectId, dueAt: clock.dueAt } });
  uow.emit({ topic: "clock.opened", aggregateType: "ComplianceClock", aggregateId: clock.id, payload: { obligationCode: clock.obligationCode, dueAt: clock.dueAt }, dedupeKey: `clock.opened:${clock.id}` });
  return clock;
}
async function openClocksForFact(uow, actor, input) {
  const ctx = await communityClockContext(uow.tx, input.communityId);
  const obligations = await uow.tx.regulatoryObligation.findMany({ where: { startFact: input.fact, active: true, packId: { in: ctx.packIds } }, select: { code: true, evidenceTypes: true } });
  const opened = [];
  for (const obligation of obligations) {
    const clock = await openClock(uow, actor, { ...input, obligationCode: obligation.code });
    if (!clock) continue;
    opened.push(clock.id);
    const evidenceTypes = Array.isArray(obligation.evidenceTypes) ? obligation.evidenceTypes : [];
    if (input.evidence && evidenceTypes.includes(input.evidence.type)) {
      await satisfyClocks(uow, actor, { obligationCodes: [obligation.code], subjectType: input.subjectType, subjectId: input.subjectId, occurrenceKey: input.occurrenceKey ?? "default" }, { ...input.evidence, at: input.startedAt });
    }
  }
  return opened;
}
async function satisfyByEvidence(uow, actor, subject, evidence) {
  const open = await uow.tx.complianceClock.findMany({
    where: { subjectType: subject.subjectType, subjectId: subject.subjectId, ...subject.occurrenceKey ? { occurrenceKey: subject.occurrenceKey } : {}, current: true, status: { in: ["open", "overdue"] } },
    select: { obligationCode: true, obligation: { select: { evidenceTypes: true } } }
  });
  const codes = open.filter((clock) => Array.isArray(clock.obligation?.evidenceTypes) && clock.obligation.evidenceTypes.includes(evidence.type)).map((clock) => clock.obligationCode);
  if (!codes.length) return [];
  return satisfyClocks(uow, actor, { obligationCodes: [...new Set(codes)], ...subject }, evidence);
}
async function satisfyClocks(uow, actor, where, evidence) {
  const clocks = await uow.tx.complianceClock.findMany({
    where: { obligationCode: { in: where.obligationCodes }, subjectType: where.subjectType, subjectId: where.subjectId, ...where.occurrenceKey ? { occurrenceKey: where.occurrenceKey } : {}, current: true, status: { in: ["open", "overdue"] } }
  });
  const satisfied = [];
  for (const clock of clocks) {
    const late = clock.dueAt ? evidence.at.getTime() > clock.dueAt.getTime() : false;
    const to = late ? "satisfied_late" : "satisfied";
    const result = await uow.tx.complianceClock.updateMany({
      where: { id: clock.id, version: clock.version, status: { in: ["open", "overdue"] } },
      data: { status: to, satisfiedAt: evidence.at, satisfiedBy: [{ type: evidence.type, id: evidence.id }], version: { increment: 1 } }
    });
    if (result.count !== 1) throw new DomainError(Codes.STALE_STATE, "A compliance clock changed while it was being satisfied. Try again.", { currentVersion: clock.version });
    uow.audit({ eventType: `clock.${to}`, entityType: "ComplianceClock", entityId: clock.id, actorUserId: actorUserId(actor), actorAgentId: actorAgentId(actor), before: { status: clock.status }, after: { status: to, evidence } });
    satisfied.push(clock.id);
  }
  return satisfied;
}

// features/keystone/lib/censusProjection.ts
var EMPTY_PROJECTION = {
  status: "pre_admit",
  presence: "not_admitted",
  currentBedId: null,
  currentApartmentId: null,
  heldBedId: null,
  admittedAt: null,
  endedAt: null,
  dischargeDisposition: null,
  openLeave: null,
  medicaidHoldDaysByYear: {},
  leaveCount: 0,
  lastSeq: 0,
  lastEffectiveAt: null
};
var fail = (message, details = {}) => {
  throw new DomainError(Codes.INVALID_TRANSITION, message, details);
};
function leaveDaysByYear(timeZone, from, to) {
  const out = {};
  if (to.getTime() <= from.getTime()) return out;
  let day3 = localDate(timeZone, from);
  const last = localDate(timeZone, to);
  for (let i = 0; i < 800 && day3 <= last; i += 1) {
    const midnight = zonedInstant(timeZone, day3, "23:59").getTime();
    if (midnight >= from.getTime() && midnight < to.getTime()) out[day3.slice(0, 4)] = (out[day3.slice(0, 4)] ?? 0) + 1;
    day3 = addDays(day3, 1);
  }
  return out;
}
function addDaysByYear(into, add) {
  const out = { ...into };
  for (const [year, days] of Object.entries(add)) out[year] = (out[year] ?? 0) + days;
  return out;
}
function openLeaveMedicaidDays(timeZone, leave, asOf) {
  if (!leave || !leave.holdElected || leave.holdPaidBy !== "medicaid") return {};
  const end = leave.holdEndedAt ? new Date(leave.holdEndedAt) : asOf;
  return leaveDaysByYear(timeZone, new Date(leave.startedAt), end);
}
function applyCensusEvent(state, event, timeZone) {
  if (event.seq !== state.lastSeq + 1) fail("Census events must be applied in order.", { reason: "sequence" });
  const at = event.effectiveAt.toISOString();
  if (state.lastEffectiveAt && event.effectiveAt.getTime() < new Date(state.lastEffectiveAt).getTime()) {
    fail("This event is dated before the stay's latest census event. Record it as a correction.", { reason: "out_of_order" });
  }
  const next = { ...state, lastSeq: event.seq, lastEffectiveAt: at };
  const terminal = state.status === "discharged" || state.status === "deceased";
  switch (event.kind) {
    case "admission":
    case "readmission": {
      if (state.status !== "pre_admit") fail("The stay is already admitted.", { currentStatus: state.status });
      if (!event.toBedId === !event.toApartmentId) fail("An admission needs exactly one bed or apartment.");
      return { ...next, status: "admitted", presence: "in_house", currentBedId: event.toBedId ?? null, currentApartmentId: event.toApartmentId ?? null, admittedAt: at };
    }
    case "room_change": {
      if (state.status !== "admitted" || state.presence !== "in_house") fail("A room change needs the resident in house.", { currentStatus: state.presence });
      if (!event.toBedId === !event.toApartmentId) fail("A room change needs exactly one target bed or apartment.");
      if (event.toBedId && event.toBedId === state.currentBedId || event.toApartmentId && event.toApartmentId === state.currentApartmentId) fail("The resident is already there.");
      return { ...next, currentBedId: event.toBedId ?? null, currentApartmentId: event.toApartmentId ?? null };
    }
    case "leave_start": {
      if (state.status !== "admitted" || state.presence !== "in_house") fail("A leave can start only while the resident is in house.", { currentStatus: state.presence });
      const holdElected = Boolean(event.holdElected);
      const apartment = Boolean(state.currentApartmentId);
      const keepsPlace = holdElected || apartment;
      const leave = { startedAt: at, kind: event.leaveKind ?? "other", holdElected: keepsPlace, holdPaidBy: keepsPlace ? event.holdPaidBy ?? (apartment ? "private" : "none") : "none", holdEndedAt: null, bedId: state.currentBedId, apartmentId: state.currentApartmentId };
      return {
        ...next,
        presence: keepsPlace ? "on_leave_hold" : "on_leave_no_hold",
        heldBedId: holdElected && state.currentBedId ? state.currentBedId : null,
        currentBedId: keepsPlace ? state.currentBedId : null,
        currentApartmentId: state.currentApartmentId,
        openLeave: leave,
        leaveCount: state.leaveCount + 1
      };
    }
    case "hold_release": {
      if (state.presence !== "on_leave_hold" || !state.openLeave || !state.heldBedId) fail("There is no bed hold to release.", { currentStatus: state.presence });
      const used = openLeaveMedicaidDays(timeZone, state.openLeave, event.effectiveAt);
      return {
        ...next,
        presence: "on_leave_no_hold",
        heldBedId: null,
        currentBedId: null,
        medicaidHoldDaysByYear: addDaysByYear(state.medicaidHoldDaysByYear, used),
        openLeave: { ...state.openLeave, holdElected: false, holdPaidBy: "none", holdEndedAt: at }
      };
    }
    case "leave_end": {
      if (state.status !== "admitted" || !state.openLeave) fail("There is no open leave to end.", { currentStatus: state.presence });
      const leave = state.openLeave;
      const used = leave.holdEndedAt ? {} : openLeaveMedicaidDays(timeZone, leave, event.effectiveAt);
      let bedId = state.currentBedId;
      let apartmentId = state.currentApartmentId;
      if (state.presence === "on_leave_no_hold") {
        if (!event.toBedId === !event.toApartmentId) fail("The resident returns without a held bed: choose an available bed or apartment.");
        bedId = event.toBedId ?? null;
        apartmentId = event.toApartmentId ?? null;
      } else if (event.toBedId || event.toApartmentId) {
        fail("The resident returns to the held place; use a room change afterwards to move them.");
      }
      return { ...next, presence: "in_house", heldBedId: null, currentBedId: bedId, currentApartmentId: apartmentId, openLeave: null, medicaidHoldDaysByYear: addDaysByYear(state.medicaidHoldDaysByYear, used) };
    }
    case "coverage_change": {
      if (state.status !== "admitted") fail("Coverage changes need an admitted stay.", { currentStatus: state.status });
      return next;
    }
    case "discharge":
    case "death": {
      if (terminal || state.status !== "admitted") fail("Only an admitted stay can end.", { currentStatus: state.status });
      const used = state.openLeave && !state.openLeave.holdEndedAt ? openLeaveMedicaidDays(timeZone, state.openLeave, event.effectiveAt) : {};
      return {
        ...next,
        status: event.kind === "death" ? "deceased" : "discharged",
        presence: "gone",
        currentBedId: null,
        currentApartmentId: null,
        heldBedId: null,
        openLeave: null,
        endedAt: at,
        dischargeDisposition: event.kind === "death" ? "deceased" : event.dischargeDisposition ?? "other",
        medicaidHoldDaysByYear: addDaysByYear(state.medicaidHoldDaysByYear, used)
      };
    }
    case "correction":
      return fail("Corrections are recorded through the census correction flow.");
  }
}
function foldCensus(events, timeZone) {
  return [...events].sort((a, b) => a.seq - b.seq).reduce((state, event) => applyCensusEvent(state, event, timeZone), EMPTY_PROJECTION);
}
var projectionHash = (projection) => sha256(canonicalJson(projection));
function presenceAt(events, timeZone, date2) {
  const cutoff = zonedInstant(timeZone, date2, "23:59").getTime();
  const upto = [...events].sort((a, b) => a.seq - b.seq).filter((event) => event.effectiveAt.getTime() <= cutoff);
  return foldCensus(upto, timeZone);
}

// features/keystone/lib/census.ts
var MAX_FUTURE_SKEW_MS = 5 * 6e4;
var CERTIFICATION_FOR_PAYER = {
  medicare_a: ["dual", "medicare"],
  medicare_advantage: ["dual", "medicare"],
  medicaid_ffs: ["dual", "medicaid"],
  medicaid_mco: ["dual", "medicaid"]
};
var NOTICE_EXCEPTIONS = ["safety_of_individuals", "health_of_individuals", "health_improved", "urgent_medical_needs", "resided_less_than_30_days"];
function assertEffectiveAt(uow, effectiveAt, projection) {
  if (Number.isNaN(effectiveAt.getTime())) throw new DomainError(Codes.INVALID_INPUT, "The event time is not a valid time.", { field: "effectiveAt" });
  if (effectiveAt.getTime() > uow.now.getTime() + MAX_FUTURE_SKEW_MS) throw new DomainError(Codes.INVALID_INPUT, "Census events cannot be dated in the future.", { field: "effectiveAt" });
  if (projection.lastEffectiveAt && effectiveAt.getTime() < new Date(projection.lastEffectiveAt).getTime()) {
    throw new DomainError(Codes.GUARD_FAILED, "This is dated before the stay's latest census event. Record it as a late entry.", { reason: "late_entry" });
  }
}
async function lockStay(tx, stayId, expectedVersion) {
  const stay = await lockRow(tx, "Stay", stayId);
  if (expectedVersion !== void 0 && expectedVersion !== null && expectedVersion !== stay.version) {
    throw new DomainError(Codes.STALE_STATE, "The stay changed since you loaded it. Reload and try again.", { currentStatus: stay.status, currentVersion: stay.version });
  }
  return stay;
}
async function communityTimeZone(tx, communityId) {
  const community = await tx.community.findUnique({ where: { id: communityId }, select: { timeZone: true } });
  if (!community) throw new DomainError(Codes.NOT_FOUND, "Community not found.");
  return community.timeZone;
}
async function loadCensusEvents(tx, stayId) {
  const rows = await tx.censusEvent.findMany({ where: { stayId, voidsEventId: null, kind: { not: "correction" } }, orderBy: [{ effectiveAt: "asc" }, { seq: "asc" }] });
  const voided = new Set((await tx.censusEvent.findMany({ where: { stayId, voidsEventId: { not: null } }, select: { voidsEventId: true } })).map((row) => row.voidsEventId));
  return rows.filter((row) => !voided.has(row.id)).map((row) => ({
    id: row.id,
    hash: row.hash,
    seq: row.seq,
    kind: row.kind,
    effectiveAt: row.effectiveAt,
    toBedId: row.toBedId,
    toApartmentId: row.toApartmentId,
    leaveKind: row.leaveKind,
    holdElected: row.holdElected,
    holdPaidBy: row.holdPaidBy,
    dischargeDisposition: row.dischargeDisposition
  }));
}
function foldStored(events, timeZone) {
  return foldCensus(events.map((event, index) => ({ ...event, seq: index + 1 })), timeZone);
}
function placeClaims(projection) {
  const claims = /* @__PURE__ */ new Map();
  if (projection.presence === "in_house" && projection.currentBedId) claims.set(`bed:${projection.currentBedId}`, "occupied");
  if (projection.presence === "on_leave_hold" && projection.heldBedId) claims.set(`bed:${projection.heldBedId}`, "held");
  if (projection.currentApartmentId && (projection.presence === "in_house" || projection.presence === "on_leave_hold")) claims.set(`apartment:${projection.currentApartmentId}`, "resident");
  return claims;
}
async function reconcilePlaces(uow, actor, stay, before, after, options) {
  const was = placeClaims(before);
  const now = placeClaims(after);
  const keys = [.../* @__PURE__ */ new Set([...was.keys(), ...now.keys()])].sort();
  for (const key of keys) await advisoryLock(uow.tx, key);
  for (const key of keys) {
    const from = was.get(key) ?? null;
    const to = now.get(key) ?? null;
    if (from === to) continue;
    const [kind, id] = key.split(":");
    if (kind === "bed") await reconcileBed(uow, actor, stay, id, from, to, options);
    else await reconcileApartment(uow, actor, stay, id, from !== null, to !== null, options);
  }
}
async function reconcileBed(uow, actor, stay, bedId, from, to, options) {
  const bed = await lockRow(uow.tx, "Bed", bedId);
  const metadata = { stayId: stay.id, censusEventId: options.eventId };
  if (!from && to) {
    if (bed.status === "reserved") {
      const reservation = await uow.tx.placeReservation.findFirst({ where: { bedId, status: "active" } });
      if (!reservation || reservation.id !== options.reservationId) throw new DomainError(Codes.PLACE_UNAVAILABLE, `Bed ${bed.label} is reserved for someone else.`, { currentStatus: bed.status });
      await consumeReservation(uow, actor, reservation.id, reservation.version, stay.id);
    } else if (bed.status !== "available") {
      throw new DomainError(Codes.PLACE_UNAVAILABLE, `Bed ${bed.label} is ${bed.status.replaceAll("_", " ")}.`, { currentStatus: bed.status });
    }
    await casUpdate(uow, { model: "Bed", id: bedId, version: bed.version, from: [bed.status], to: to === "held" ? "held" : "occupied", actor, eventType: "bed.claimed", data: { currentStayId: stay.id, statusReason: null }, audit: { currentStayId: stay.id }, metadata });
    const occupancy = await uow.tx.bedOccupancy.create({ data: { bedId, stayId: stay.id, startAt: options.effectiveAt, openedByEventId: options.eventId } });
    auditCreate(uow, actor, "BedOccupancy", occupancy.id, "bed_occupancy.opened", { bedId, stayId: stay.id, startAt: options.effectiveAt });
    return;
  }
  if (bed.currentStayId !== stay.id) throw new DomainError(Codes.PROJECTION_MISMATCH, `Bed ${bed.label} is not held by this stay.`, { currentStatus: bed.status });
  if (from && to) {
    await casUpdate(uow, { model: "Bed", id: bedId, version: bed.version, from: [from === "held" ? "held" : "occupied"], to: to === "held" ? "held" : "occupied", actor, eventType: to === "held" ? "bed.held" : "bed.reoccupied", metadata });
    return;
  }
  await casUpdate(uow, { model: "Bed", id: bedId, version: bed.version, from: [from === "held" ? "held" : "occupied"], to: "cleaning", actor, eventType: "bed.released", data: { currentStayId: null }, audit: { currentStayId: null }, metadata });
  const open = await uow.tx.bedOccupancy.findFirst({ where: { bedId, stayId: stay.id, endAt: null } });
  if (open) {
    const endAt = options.effectiveAt.getTime() < open.startAt.getTime() ? open.startAt : options.effectiveAt;
    await uow.tx.bedOccupancy.update({ where: { id: open.id }, data: { endAt, closedByEventId: options.eventId } });
    uow.audit({ eventType: "bed_occupancy.closed", entityType: "BedOccupancy", entityId: open.id, actorUserId: actorUserId(actor), actorAgentId: actorAgentId(actor), after: { endAt } });
  }
  uow.emit({ topic: "housekeeping.turnover", aggregateType: "Bed", aggregateId: bedId, payload: { bedId, reason: "census_release" }, dedupeKey: `housekeeping.turnover:${bedId}:${options.eventId}` });
}
async function reconcileApartment(uow, actor, stay, apartmentId, had, has, options) {
  const apartment = await lockRow(uow.tx, "Apartment", apartmentId);
  const metadata = { stayId: stay.id, censusEventId: options.eventId };
  if (!had && has) {
    if (apartment.status === "out_of_service" || apartment.status === "turnover") throw new DomainError(Codes.PLACE_UNAVAILABLE, `Apartment ${apartment.number} is ${apartment.status.replaceAll("_", " ")}.`, { currentStatus: apartment.status });
    if (apartment.occupantCount >= apartment.capacity) throw new DomainError(Codes.PLACE_UNAVAILABLE, `Apartment ${apartment.number} is full.`, { currentStatus: apartment.status });
    if (apartment.occupantCount > 0 && !apartment.allowsUnrelatedCompanion && !options.companionRelationship?.trim()) {
      throw new DomainError(Codes.GUARD_FAILED, "A second resident in this apartment needs a recorded relationship to the first (spouse, partner, sibling).", { field: "companionRelationship" });
    }
    if (apartment.status === "reserved") {
      const reservation = await uow.tx.placeReservation.findFirst({ where: { apartmentId, status: "active" } });
      if (!reservation || reservation.id !== options.reservationId) throw new DomainError(Codes.PLACE_UNAVAILABLE, `Apartment ${apartment.number} is reserved for someone else.`, { currentStatus: apartment.status });
      await consumeReservation(uow, actor, reservation.id, reservation.version, stay.id);
    }
    await casUpdate(uow, { model: "Apartment", id: apartmentId, version: apartment.version, from: [apartment.status], to: "occupied", actor, eventType: "apartment.occupant_added", data: { occupantCount: apartment.occupantCount + 1 }, metadata: { ...metadata, companionRelationship: options.companionRelationship ?? null } });
    return;
  }
  const remaining = Math.max(0, apartment.occupantCount - 1);
  await casUpdate(uow, { model: "Apartment", id: apartmentId, version: apartment.version, from: ["occupied"], to: remaining === 0 ? "turnover" : "occupied", actor, eventType: "apartment.occupant_removed", data: { occupantCount: remaining }, metadata });
  if (remaining === 0) uow.emit({ topic: "housekeeping.turnover", aggregateType: "Apartment", aggregateId: apartmentId, payload: { apartmentId, reason: "census_release" }, dedupeKey: `housekeeping.turnover:${apartmentId}:${options.eventId}` });
}
async function consumeReservation(uow, actor, reservationId, version, stayId) {
  await casUpdate(uow, { model: "PlaceReservation", id: reservationId, version, from: ["active"], to: "consumed", actor, eventType: "reservation.consumed", data: { consumedByStayId: stayId } });
}
async function appendCensusEvents(uow, actor, stay, inputs, options = {}) {
  if (!inputs.length) throw new DomainError(Codes.INVALID_INPUT, "Nothing to record.");
  const timeZone = await communityTimeZone(uow.tx, stay.communityId);
  const stored = await loadCensusEvents(uow.tx, stay.id);
  const before = foldStored(stored, timeZone);
  const closed = await closedThrough(uow.tx, stay.communityId);
  for (const input of inputs) {
    if (Number.isNaN(input.effectiveAt.getTime())) throw new DomainError(Codes.INVALID_INPUT, "The event time is not a valid time.", { field: "effectiveAt" });
    if (input.effectiveAt.getTime() > uow.now.getTime() + MAX_FUTURE_SKEW_MS) throw new DomainError(Codes.INVALID_INPUT, "Census events cannot be dated in the future.", { field: "effectiveAt" });
    if (!options.late) assertEffectiveAt(uow, input.effectiveAt, before);
    if (closed && localDate(timeZone, input.effectiveAt) <= closed && !input.approvalId) {
      throw new DomainError(Codes.APPROVAL_REQUIRED, `The census through ${closed} is signed off. Ask for a closed-period correction; a second person approves it.`, { reason: "closed_period" });
    }
  }
  const last = await uow.tx.censusEvent.findFirst({ where: { stayId: stay.id }, orderBy: { seq: "desc" }, select: { seq: true, hash: true } });
  let seq = last?.seq ?? 0;
  const candidates = inputs.map((input) => ({ input, event: { seq: ++seq, kind: input.kind, effectiveAt: input.effectiveAt, toBedId: input.toBedId ?? null, toApartmentId: input.toApartmentId ?? null, leaveKind: input.leaveKind ?? null, holdElected: Boolean(input.holdElected), holdPaidBy: input.holdPaidBy ?? null, dischargeDisposition: input.dischargeDisposition ?? null } }));
  const voided = new Set(inputs.map((input) => input.voidsEventId).filter(Boolean));
  for (const id of voided) if (!stored.some((event) => event.id === id)) throw new DomainError(Codes.INVALID_INPUT, "The event to void is not an active event of this stay.", { field: "voidsEventId" });
  const ordered = [...stored.filter((event) => !voided.has(event.id)), ...candidates.filter((c) => c.event.kind !== "correction").map((c) => c.event)].sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime() || a.seq - b.seq);
  const after = foldStored(ordered, timeZone);
  if (options.late && after.status !== before.status) throw new DomainError(Codes.GUARD_FAILED, "A late entry cannot admit or end the stay; use the admission or discharge command.", { reason: "late_entry_status" });
  let prevHash = last?.hash ?? stay.lastEventHash ?? "0".repeat(64);
  const events = [];
  for (const { input, event: candidate } of candidates) {
    const body = { stayId: stay.id, seq: candidate.seq, kind: input.kind, effectiveAt: input.effectiveAt.toISOString(), toBedId: candidate.toBedId, toApartmentId: candidate.toApartmentId, leaveKind: candidate.leaveKind, holdElected: Boolean(candidate.holdElected), holdPaidBy: candidate.holdPaidBy, dischargeDisposition: candidate.dischargeDisposition, initiatedBy: input.initiatedBy ?? null, voidsEventId: input.voidsEventId ?? null };
    const hash = sha256(`${prevHash}
${canonicalJson(body)}`);
    const row = await uow.tx.censusEvent.create({
      data: {
        stayId: stay.id,
        seq: candidate.seq,
        kind: input.kind,
        effectiveAt: input.effectiveAt,
        observedAt: input.observedAt ?? null,
        recordedAt: uow.now,
        fromBedId: input.fromBedId ?? null,
        toBedId: candidate.toBedId,
        fromApartmentId: input.fromApartmentId ?? null,
        toApartmentId: candidate.toApartmentId,
        leaveKind: candidate.leaveKind,
        holdElected: Boolean(candidate.holdElected),
        holdPaidBy: candidate.holdPaidBy,
        dischargeDisposition: candidate.dischargeDisposition,
        initiatedBy: input.initiatedBy ?? null,
        coverageId: input.coverageId ?? null,
        voidsEventId: input.voidsEventId ?? null,
        correctionReason: input.correctionReason ?? "",
        approvalId: input.approvalId ?? null,
        detail: input.detail ?? {},
        actorId: actorUserId(actor),
        actorAgentId: actorAgentId(actor),
        idempotencyKey: sha256(`${principalKey(actor)}:${input.idempotencyKey}:${input.kind}:${candidate.seq}`),
        prevHash,
        hash
      }
    });
    prevHash = hash;
    events.push({ id: row.id, seq: row.seq, kind: row.kind });
    uow.emit({ topic: `census.${input.kind}`, aggregateType: "Stay", aggregateId: stay.id, payload: { stayId: stay.id, eventId: row.id, communityId: stay.communityId, effectiveAt: input.effectiveAt, late: Boolean(options.late) }, dedupeKey: `census:${row.id}` });
  }
  const lastInput = inputs[inputs.length - 1];
  await reconcilePlaces(uow, actor, stay, before, after, { reservationId: options.reservationId, companionRelationship: options.companionRelationship, eventId: events[events.length - 1].id, effectiveAt: options.late ? uow.now : lastInput.effectiveAt });
  const year = localDate(timeZone, uow.now).slice(0, 4);
  const updated = await uow.tx.stay.updateMany({
    where: { id: stay.id, version: stay.version },
    data: {
      status: after.status,
      presence: after.presence,
      currentBedId: after.currentBedId,
      currentApartmentId: after.currentApartmentId,
      heldBedId: after.heldBedId,
      admittedAt: after.admittedAt ? new Date(after.admittedAt) : null,
      dischargedAt: after.endedAt ? new Date(after.endedAt) : null,
      dischargeDisposition: after.dischargeDisposition,
      leaveDaysUsedThisYear: after.medicaidHoldDaysByYear[year] ?? 0,
      projection: after,
      projectionHash: projectionHash(after),
      projectionVersion: { increment: 1 },
      lastEventHash: prevHash,
      version: { increment: 1 }
    }
  });
  if (updated.count !== 1) throw new DomainError(Codes.STALE_STATE, "The stay changed while this was being recorded. Try again.", { currentVersion: stay.version });
  uow.audit({
    eventType: options.late ? "census.late_entry" : `census.${lastInput.kind}`,
    entityType: "Stay",
    entityId: stay.id,
    actorUserId: actorUserId(actor),
    actorAgentId: actorAgentId(actor),
    reason: lastInput.correctionReason ?? null,
    before: { status: before.status, presence: before.presence, bed: before.currentBedId, apartment: before.currentApartmentId },
    after: { status: after.status, presence: after.presence, bed: after.currentBedId, apartment: after.currentApartmentId, events: events.map((e) => ({ id: e.id, seq: e.seq, kind: e.kind })) },
    metadata: lastInput.approvalId ? { approvalId: lastInput.approvalId } : void 0
  });
  return { event: events[events.length - 1], events, before, after, version: stay.version + 1, timeZone };
}
var appendCensusEvent = (uow, actor, stay, input, options = {}) => appendCensusEvents(uow, actor, stay, [input], options);
async function closedThrough(tx, communityId) {
  const row = await tx.censusSignoff.findFirst({ where: { communityId, unitId: null }, orderBy: { date: "desc" }, select: { date: true } });
  return row?.date ? row.date.toISOString().slice(0, 10) : null;
}
var REPRESENTATIVE_ROLES2 = /* @__PURE__ */ new Set(["self", "healthcare_poa", "financial_responsible", "guardian", "family", "emergency_contact", "hospice_contact", "personal_representative_hipaa"]);
async function admitResident(uow, actor, input) {
  if (!input.bedId === !input.apartmentId) throw new DomainError(Codes.INVALID_INPUT, "Choose one bed or one apartment.", { field: "bedId" });
  const community = await uow.tx.community.findUnique({ where: { id: input.communityId }, select: { id: true, status: true, synthetic: true } });
  if (!community || community.status === "closed") throw new DomainError(Codes.NOT_FOUND, "Community not found or closed.");
  const payer = await uow.tx.payer.findUnique({ where: { id: input.payerId } });
  if (!payer) throw new DomainError(Codes.INVALID_INPUT, "Choose the initial payer.", { field: "payerId" });
  let setting;
  let medicaidCertified = false;
  if (input.bedId) {
    const bed = await uow.tx.bed.findUnique({ where: { id: input.bedId }, include: { room: { include: { unit: true } } } });
    if (!bed?.room?.unit || bed.room.unit.communityId !== input.communityId) throw new DomainError(Codes.NOT_FOUND, "That bed is not in this community.");
    setting = bed.room.unit.setting;
    const needed = CERTIFICATION_FOR_PAYER[payer.kind];
    if (needed && !needed.includes(bed.certification)) throw new DomainError(Codes.GUARD_FAILED, `This bed is certified ${bed.certification.replaceAll("_", " ")}; a ${payer.kind.replaceAll("_", " ")} admission needs a ${needed.join(" or ")} bed.`, { reason: "certification" });
    medicaidCertified = bed.certification === "dual" || bed.certification === "medicaid";
    if (bed.room.genderPolicy !== "any" && input.resident?.sex && input.resident.sex !== bed.room.genderPolicy) throw new DomainError(Codes.GUARD_FAILED, `Room ${bed.room.number} is ${bed.room.genderPolicy} only.`, { reason: "gender_policy" });
    if (bed.room.unit.secured && !input.placementReason?.trim()) throw new DomainError(Codes.GUARD_FAILED, "A secured unit placement needs a documented reason.", { field: "placementReason" });
  } else {
    const apartment = await uow.tx.apartment.findUnique({ where: { id: input.apartmentId }, include: { unit: true } });
    if (!apartment?.unit || apartment.unit.communityId !== input.communityId) throw new DomainError(Codes.NOT_FOUND, "That apartment is not in this community.");
    setting = apartment.unit.setting;
    if (apartment.unit.secured && !input.placementReason?.trim()) throw new DomainError(Codes.GUARD_FAILED, "A memory-care (secured unit) placement needs a documented reason.", { field: "placementReason" });
  }
  if (setting === "nursing_facility" && medicaidCertified && !input.pasrrLevel1 && !input.residentId) {
    throw new DomainError(Codes.GUARD_FAILED, "A Level I PASRR screen must be completed before admission to a Medicaid-certified nursing facility bed.", { field: "pasrrLevel1" });
  }
  if (!input.selfRepresented && !input.representatives?.length && !input.residentId) throw new DomainError(Codes.GUARD_FAILED, "Add at least one representative, or record that the resident represents themself.", { field: "representatives" });
  for (const rep of input.representatives ?? []) {
    if (!rep.firstName?.trim() || !rep.roles?.length || rep.roles.some((role) => !REPRESENTATIVE_ROLES2.has(role))) throw new DomainError(Codes.INVALID_INPUT, "Each representative needs a name and known roles.", { field: "representatives" });
  }
  let residentId = input.residentId ?? null;
  const synthetic = Boolean(input.synthetic ?? community.synthetic);
  if (residentId) {
    const resident2 = await lockRow(uow.tx, "Resident", residentId);
    if (resident2.status === "deceased") throw new DomainError(Codes.GUARD_FAILED, "This resident is recorded as deceased.");
    const open = await uow.tx.stay.findFirst({ where: { residentId, status: { in: ["pre_admit", "admitted"] } }, select: { id: true } });
    if (open) throw new DomainError(Codes.GUARD_FAILED, "This resident already has an open stay.", { reason: "open_stay" });
    const reps = await uow.tx.representative.count({ where: { residentId, status: "active" } });
    if (!reps && !input.selfRepresented && !input.representatives?.length) throw new DomainError(Codes.GUARD_FAILED, "Add at least one representative.", { field: "representatives" });
  } else {
    const data = input.resident;
    if (!data?.firstName?.trim() || !data.lastName?.trim()) throw new DomainError(Codes.INVALID_INPUT, "The resident needs a first and last name.", { field: "resident" });
    if (data.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(data.dateOfBirth)) throw new DomainError(Codes.INVALID_INPUT, "Date of birth must be YYYY-MM-DD.", { field: "dateOfBirth" });
    const created = await uow.tx.resident.create({
      data: {
        reference: await nextReference(uow.tx, "RES", uow.now),
        communityId: input.communityId,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        middleName: data.middleName ?? "",
        preferredName: data.preferredName ?? "",
        dateOfBirth: data.dateOfBirth ? /* @__PURE__ */ new Date(`${data.dateOfBirth}T00:00:00Z`) : null,
        sex: data.sex ?? "unknown",
        primaryLanguage: data.primaryLanguage ?? "English",
        status: "prospective",
        synthetic
      }
    });
    residentId = created.id;
    auditCreate(uow, actor, "Resident", created.id, "resident.created", { reference: created.reference });
  }
  if (input.prospectId) {
    const prospect = await uow.tx.prospect.findUnique({ where: { id: input.prospectId }, select: { id: true, convertedResidentId: true } });
    if (!prospect) throw new DomainError(Codes.NOT_FOUND, "Prospect not found.");
    if (prospect.convertedResidentId && prospect.convertedResidentId !== residentId) throw new DomainError(Codes.GUARD_FAILED, "This prospect was already converted.");
    await uow.tx.prospect.update({ where: { id: prospect.id }, data: { convertedResidentId: residentId } });
  }
  for (const rep of input.representatives ?? []) await addRepresentative(uow, actor, residentId, input.communityId, rep, synthetic);
  if (input.selfRepresented) {
    const self = await uow.tx.representative.findFirst({ where: { residentId, self: true, status: "active" } });
    if (!self) {
      const row = await uow.tx.representative.create({ data: { reference: await nextReference(uow.tx, "REP", uow.now), residentId, self: true, roles: ["self"], status: "active", contactPriority: 1 } });
      auditCreate(uow, actor, "Representative", row.id, "representative.added", { self: true });
    }
  }
  if (input.pasrrLevel1) {
    const screen = await uow.tx.preAdmissionScreen.create({ data: { residentId, prospectId: input.prospectId ?? null, kind: "pasrr_level1", result: input.pasrrLevel1.result, completedAt: new Date(input.pasrrLevel1.completedAt) } });
    auditCreate(uow, actor, "PreAdmissionScreen", screen.id, "pre_admission_screen.recorded", { kind: "pasrr_level1" });
  }
  const stay = await uow.tx.stay.create({
    data: { reference: await nextReference(uow.tx, "STY", uow.now), residentId, communityId: input.communityId, setting, status: "pre_admit", presence: "not_admitted", admissionSource: input.admissionSource, placementReason: input.placementReason ?? "", initialPayerKind: payer.kind, projection: EMPTY_PROJECTION, synthetic }
  });
  auditCreate(uow, actor, "Stay", stay.id, "stay.created", { reference: stay.reference, setting });
  const effectiveDate = localDate(await communityTimeZone(uow.tx, input.communityId), input.effectiveAt);
  const coverage = await uow.tx.coveragePeriod.create({
    data: { stayId: stay.id, payerId: payer.id, rank: "primary", startDate: /* @__PURE__ */ new Date(`${effectiveDate}T00:00:00Z`), status: "active", memberReference: input.memberReference ?? "", qualifyingStayFrom: input.qualifyingStayFrom ? /* @__PURE__ */ new Date(`${input.qualifyingStayFrom}T00:00:00Z`) : null, qualifyingStayTo: input.qualifyingStayTo ? /* @__PURE__ */ new Date(`${input.qualifyingStayTo}T00:00:00Z`) : null }
  });
  auditCreate(uow, actor, "CoveragePeriod", coverage.id, "coverage.opened", { payerKind: payer.kind, startDate: effectiveDate });
  const { event, after } = await appendCensusEvent(uow, actor, stay, {
    kind: input.residentId ? "readmission" : "admission",
    effectiveAt: input.effectiveAt,
    observedAt: input.observedAt,
    toBedId: input.bedId ?? null,
    toApartmentId: input.apartmentId ?? null,
    coverageId: coverage.id,
    idempotencyKey: input.idempotencyKey,
    detail: { admissionSource: input.admissionSource }
  }, { reservationId: input.reservationId, companionRelationship: input.companionRelationship });
  const resident = await uow.tx.resident.findUniqueOrThrow({ where: { id: residentId }, select: { version: true, status: true } });
  await casUpdate(uow, { model: "Resident", id: residentId, version: resident.version, from: [resident.status], to: "current", actor, eventType: "resident.admitted", data: { currentStayId: stay.id, communityId: input.communityId } });
  await openClocksForFact(uow, actor, { fact: "census.admission", communityId: input.communityId, residentId, subjectType: "Stay", subjectId: stay.id, startedAt: input.effectiveAt, setting, payerKind: payer.kind, evidence: { type: "census_event:admission", id: event.id } });
  for (const notice of input.notices ?? []) await recordNotice(uow, actor, { ...notice, stayId: stay.id });
  uow.emit({ topic: "portal.invite_representatives", aggregateType: "Stay", aggregateId: stay.id, payload: { stayId: stay.id }, dedupeKey: `portal.invite:${stay.id}` });
  return { stayId: stay.id, residentId, eventId: event.id, status: after.status, presence: after.presence };
}
async function addRepresentative(uow, actor, residentId, communityId, rep, synthetic) {
  const contact = await uow.tx.contact.create({ data: { reference: await nextReference(uow.tx, "CON", uow.now), communityId, firstName: rep.firstName.trim(), lastName: rep.lastName?.trim() ?? "", email: rep.email?.trim().toLowerCase() ?? "", phone: rep.phone?.trim() ?? "", consentToContact: true, synthetic } });
  const representative = await uow.tx.representative.create({ data: { reference: await nextReference(uow.tx, "REP", uow.now), residentId, contactId: contact.id, roles: rep.roles, contactPriority: rep.contactPriority ?? 1, status: "active" } });
  auditCreate(uow, actor, "Representative", representative.id, "representative.added", { roles: rep.roles, contactReference: contact.reference });
  return representative;
}
async function primaryPayerKind(tx, stayId) {
  const coverage = await tx.coveragePeriod.findFirst({ where: { stayId, rank: "primary", status: { in: ["active", "ending", "retro_approved"] } }, orderBy: { startDate: "desc" }, include: { payer: { select: { kind: true } } } });
  return coverage?.payer?.kind ?? null;
}
async function changeRoom(uow, actor, input) {
  if (!input.toBedId === !input.toApartmentId) throw new DomainError(Codes.INVALID_INPUT, "Choose one target bed or apartment.", { field: "toBedId" });
  const stay = await lockStay(uow.tx, input.stayId, input.expectedVersion);
  if (input.toBedId) {
    const bed = await uow.tx.bed.findUnique({ where: { id: input.toBedId }, include: { room: { include: { unit: true } } } });
    if (!bed?.room?.unit || bed.room.unit.communityId !== stay.communityId) throw new DomainError(Codes.NOT_FOUND, "That bed is not in this community.");
    const payerKind = await primaryPayerKind(uow.tx, stay.id);
    const needed = payerKind ? CERTIFICATION_FOR_PAYER[payerKind] : void 0;
    if (needed && !needed.includes(bed.certification)) throw new DomainError(Codes.GUARD_FAILED, `Bed ${bed.label} is certified ${bed.certification.replaceAll("_", " ")}, which the resident's coverage cannot use.`, { reason: "certification" });
    const resident = stay.residentId ? await uow.tx.resident.findUnique({ where: { id: stay.residentId }, select: { sex: true } }) : null;
    if (bed.room.genderPolicy !== "any" && resident?.sex && resident.sex !== bed.room.genderPolicy) throw new DomainError(Codes.GUARD_FAILED, `Room ${bed.room.number} is ${bed.room.genderPolicy} only.`, { reason: "gender_policy" });
    if (bed.room.unit.secured && !input.reason?.trim()) throw new DomainError(Codes.GUARD_FAILED, "A move into a secured unit needs a documented reason.", { field: "reason" });
  } else {
    const apartment = await uow.tx.apartment.findUnique({ where: { id: input.toApartmentId }, include: { unit: true } });
    if (!apartment?.unit || apartment.unit.communityId !== stay.communityId) throw new DomainError(Codes.NOT_FOUND, "That apartment is not in this community.");
    if (apartment.unit.secured && !input.reason?.trim()) throw new DomainError(Codes.GUARD_FAILED, "A move into memory care needs a documented reason.", { field: "reason" });
  }
  const result = await appendCensusEvent(uow, actor, stay, {
    kind: "room_change",
    effectiveAt: input.effectiveAt,
    observedAt: input.observedAt,
    toBedId: input.toBedId ?? null,
    toApartmentId: input.toApartmentId ?? null,
    fromBedId: stay.currentBedId,
    fromApartmentId: stay.currentApartmentId,
    idempotencyKey: input.idempotencyKey,
    detail: { reason: input.reason ?? null }
  }, { companionRelationship: input.companionRelationship, reservationId: input.reservationId });
  uow.emit({ topic: "task.room_change_notice", aggregateType: "Stay", aggregateId: stay.id, payload: { stayId: stay.id, eventId: result.event.id }, dedupeKey: `task.room_change_notice:${result.event.id}` });
  return { stayId: stay.id, eventId: result.event.id, presence: result.after.presence, version: result.version };
}
async function startLeave(uow, actor, input) {
  if (!["hospital", "therapeutic", "other"].includes(input.leaveKind)) throw new DomainError(Codes.INVALID_INPUT, "Unknown leave kind.", { field: "leaveKind" });
  const stay = await lockStay(uow.tx, input.stayId, input.expectedVersion);
  const nursing = stay.setting === "nursing_facility";
  let holdPaidBy = input.holdElected ? input.holdPaidBy ?? "private" : "none";
  if (nursing && stay.currentBedId) {
    const policyNotice = await uow.tx.noticeDelivery.findFirst({ where: { residentId: stay.residentId, kind: "bed_hold_policy", deliveredAt: { not: null } }, select: { id: true } });
    if (!policyNotice) throw new DomainError(Codes.GUARD_FAILED, "Record that the bed-hold policy was given to the resident or representative before the transfer (42 CFR 483.15(d)(1)).", { reason: "bed_hold_policy_missing" });
    if (input.holdElected && holdPaidBy === "medicaid") {
      const payerKind2 = await primaryPayerKind(uow.tx, stay.id);
      if (payerKind2 !== "medicaid_ffs" && payerKind2 !== "medicaid_mco") throw new DomainError(Codes.GUARD_FAILED, "Medicaid pays for a bed hold only when Medicaid is the resident's primary payer.", { field: "holdPaidBy" });
      const policy = await bedHoldPolicyFor(uow.tx, stay.communityId);
      const cap = policy?.medicaidHoldDaysPerYear ?? 0;
      const projection = stay.projection ?? EMPTY_PROJECTION;
      const year = localDate(await communityTimeZone(uow.tx, stay.communityId), input.effectiveAt).slice(0, 4);
      const used = projection.medicaidHoldDaysByYear?.[year] ?? 0;
      if (!policy?.medicaidHoldPaid || used >= cap) throw new DomainError(Codes.GUARD_FAILED, `The resident has used ${used} of ${cap} paid Medicaid bed-hold days this year. Offer a private-pay hold instead.`, { reason: "medicaid_hold_cap" });
    }
  } else {
    holdPaidBy = input.holdElected ? holdPaidBy : "none";
  }
  const result = await appendCensusEvent(uow, actor, stay, {
    kind: "leave_start",
    effectiveAt: input.effectiveAt,
    observedAt: input.observedAt,
    leaveKind: input.leaveKind,
    holdElected: input.holdElected,
    holdPaidBy,
    fromBedId: stay.currentBedId,
    fromApartmentId: stay.currentApartmentId,
    initiatedBy: input.facilityInitiated ? "facility" : "resident",
    idempotencyKey: input.idempotencyKey,
    detail: { destination: input.destination ?? null }
  });
  const payerKind = await primaryPayerKind(uow.tx, stay.id);
  const subject = { communityId: stay.communityId, residentId: stay.residentId, subjectType: "Stay", subjectId: stay.id, occurrenceKey: result.event.id, startedAt: input.effectiveAt, setting: stay.setting, payerKind };
  await openClocksForFact(uow, actor, { ...subject, fact: "census.leave_start", evidence: { type: "census_event:leave_start", id: result.event.id } });
  if (input.facilityInitiated) await openClocksForFact(uow, actor, { ...subject, fact: "census.facility_initiated_transfer" });
  if (input.noticeAtTransfer) await recordNotice(uow, actor, { ...input.noticeAtTransfer, kind: "bed_hold_at_transfer", stayId: stay.id, censusEventId: result.event.id });
  if (input.leaveKind === "hospital") uow.emit({ topic: "task.transfer_packet", aggregateType: "Stay", aggregateId: stay.id, payload: { stayId: stay.id, eventId: result.event.id }, dedupeKey: `task.transfer_packet:${result.event.id}` });
  return { stayId: stay.id, eventId: result.event.id, presence: result.after.presence, version: result.version };
}
async function bedHoldPolicyFor(tx, communityId) {
  const community = await tx.community.findUnique({ where: { id: communityId }, select: { bedHoldPolicyId: true } });
  return community?.bedHoldPolicyId ? tx.bedHoldPolicy.findUnique({ where: { id: community.bedHoldPolicyId } }) : null;
}
async function releaseBedHold(uow, actor, input) {
  if (!input.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Say why the hold ends (e.g. the resident will not return, or the paid days ran out).", { field: "reason" });
  const stay = await lockStay(uow.tx, input.stayId, input.expectedVersion);
  const result = await appendCensusEvent(uow, actor, stay, { kind: "hold_release", effectiveAt: input.effectiveAt, fromBedId: stay.heldBedId, idempotencyKey: input.idempotencyKey, detail: { reason: input.reason.trim() } });
  return { stayId: stay.id, eventId: result.event.id, presence: result.after.presence, version: result.version };
}
async function endLeave(uow, actor, input) {
  const stay = await lockStay(uow.tx, input.stayId, input.expectedVersion);
  const projection = stay.projection ?? EMPTY_PROJECTION;
  const result = await appendCensusEvent(uow, actor, stay, { kind: "leave_end", effectiveAt: input.effectiveAt, observedAt: input.observedAt, toBedId: input.toBedId ?? null, toApartmentId: input.toApartmentId ?? null, idempotencyKey: input.idempotencyKey, detail: { leaveStartedAt: projection.openLeave?.startedAt ?? null } }, { reservationId: input.reservationId });
  const startedAt = projection.openLeave?.startedAt ? new Date(projection.openLeave.startedAt) : null;
  const interrupted = Boolean(startedAt && input.effectiveAt.getTime() - startedAt.getTime() <= 3 * 864e5);
  if (interrupted) uow.audit({ eventType: "census.interrupted_stay_window", entityType: "Stay", entityId: stay.id, actorUserId: actorUserId(actor), after: { eventId: result.event.id, interruptedStay: true } });
  return { stayId: stay.id, eventId: result.event.id, presence: result.after.presence, interruptedStay: interrupted, version: result.version };
}
async function dischargeResident(uow, actor, input) {
  if (input.disposition === "deceased") throw new DomainError(Codes.INVALID_INPUT, "Record a death with the death command.", { field: "disposition" });
  const stay = await lockStay(uow.tx, input.stayId, input.expectedVersion);
  if (input.initiatedBy === "facility" && stay.setting === "nursing_facility") {
    if (input.noticeException && !NOTICE_EXCEPTIONS.includes(input.noticeException)) throw new DomainError(Codes.INVALID_INPUT, "Unknown notice exception.", { field: "noticeException" });
    const notice = await uow.tx.noticeDelivery.findFirst({ where: { subjectType: "Stay", subjectId: stay.id, kind: "transfer_discharge", deliveredAt: { not: null } }, orderBy: { deliveredAt: "asc" } });
    if (!notice) throw new DomainError(Codes.GUARD_FAILED, "A facility-initiated discharge needs a written transfer/discharge notice on file (42 CFR 483.15(c)(3)).", { reason: "notice_missing" });
    if (!notice.copyToOmbudsmanAt) throw new DomainError(Codes.GUARD_FAILED, "Record the copy of the notice sent to the Long-Term Care Ombudsman.", { reason: "ombudsman_copy_missing" });
    const days = (input.effectiveAt.getTime() - notice.deliveredAt.getTime()) / 864e5;
    if (days < 30 && !input.noticeException) throw new DomainError(Codes.GUARD_FAILED, `The notice was given ${Math.floor(days)} days ago; 30 days are required unless an exception in 42 CFR 483.15(c)(4)(ii) applies.`, { reason: "notice_period" });
  }
  const result = await appendCensusEvent(uow, actor, stay, {
    kind: "discharge",
    effectiveAt: input.effectiveAt,
    observedAt: input.observedAt,
    dischargeDisposition: input.disposition,
    initiatedBy: input.initiatedBy,
    fromBedId: stay.currentBedId ?? stay.heldBedId,
    fromApartmentId: stay.currentApartmentId,
    idempotencyKey: input.idempotencyKey,
    detail: { noticeException: input.noticeException ?? null }
  });
  await endStay(uow, actor, stay, input.effectiveAt, "discharge", "former");
  if (input.initiatedBy === "facility") {
    const subject = { communityId: stay.communityId, residentId: stay.residentId, subjectType: "Stay", subjectId: stay.id, occurrenceKey: result.event.id, startedAt: input.effectiveAt, setting: stay.setting, payerKind: await primaryPayerKind(uow.tx, stay.id) };
    await openClocksForFact(uow, actor, { ...subject, fact: "census.facility_initiated_transfer" });
    const notice = await uow.tx.noticeDelivery.findFirst({ where: { subjectType: "Stay", subjectId: stay.id, kind: "transfer_discharge", copyToOmbudsmanAt: { not: null } } });
    if (notice) await satisfyByEvidence(uow, actor, { subjectType: "Stay", subjectId: stay.id, occurrenceKey: result.event.id }, { type: "ombudsman_copy", id: notice.id, at: notice.copyToOmbudsmanAt });
  }
  uow.emit({ topic: "portal.stay_ended", aggregateType: "Stay", aggregateId: stay.id, payload: { stayId: stay.id }, dedupeKey: `portal.stay_ended:${stay.id}` });
  return { stayId: stay.id, eventId: result.event.id, status: result.after.status };
}
async function recordDeath(uow, actor, input) {
  if (!input.pronouncedBy?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Record who pronounced the death.", { field: "pronouncedBy" });
  const stay = await lockStay(uow.tx, input.stayId, input.expectedVersion);
  const result = await appendCensusEvent(uow, actor, stay, { kind: "death", effectiveAt: input.effectiveAt, observedAt: input.observedAt, fromBedId: stay.currentBedId ?? stay.heldBedId, fromApartmentId: stay.currentApartmentId, idempotencyKey: input.idempotencyKey, detail: { pronouncedBy: input.pronouncedBy.trim() } });
  await endStay(uow, actor, stay, input.effectiveAt, "death", "deceased");
  await openClocksForFact(uow, actor, { fact: "census.death", communityId: stay.communityId, residentId: stay.residentId, subjectType: "Stay", subjectId: stay.id, startedAt: input.effectiveAt, setting: stay.setting, payerKind: await primaryPayerKind(uow.tx, stay.id) });
  uow.emit({ topic: "task.family_notification", aggregateType: "Stay", aggregateId: stay.id, payload: { stayId: stay.id }, dedupeKey: `task.family_notification:${stay.id}` });
  return { stayId: stay.id, eventId: result.event.id, status: result.after.status };
}
async function endStay(uow, actor, stay, at, reason, residentStatus) {
  const timeZone = await communityTimeZone(uow.tx, stay.communityId);
  const endDate = /* @__PURE__ */ new Date(`${localDate(timeZone, at)}T00:00:00Z`);
  const coverages = await uow.tx.coveragePeriod.findMany({ where: { stayId: stay.id, status: { in: ["pending", "active", "ending", "retro_approved"] } } });
  for (const coverage of coverages) {
    await casUpdate(uow, { model: "CoveragePeriod", id: coverage.id, version: coverage.version, from: [coverage.status], to: "ended", actor, eventType: "coverage.ended", data: { endDate, endReason: reason } });
  }
  if (stay.residentId) {
    const resident = await uow.tx.resident.findUniqueOrThrow({ where: { id: stay.residentId }, select: { version: true, status: true } });
    await casUpdate(uow, { model: "Resident", id: stay.residentId, version: resident.version, from: [resident.status], to: residentStatus, actor, eventType: `resident.${reason}`, data: { currentStayId: null } });
  }
}
async function recordNotice(uow, actor, input) {
  const stay = await uow.tx.stay.findUnique({ where: { id: input.stayId }, select: { id: true, residentId: true, communityId: true } });
  if (!stay) throw new DomainError(Codes.NOT_FOUND, "Stay not found.");
  const deliveredAt = new Date(input.deliveredAt);
  if (Number.isNaN(deliveredAt.getTime()) || deliveredAt.getTime() > uow.now.getTime() + MAX_FUTURE_SKEW_MS) throw new DomainError(Codes.INVALID_INPUT, "Delivery time must be a real time, not in the future.", { field: "deliveredAt" });
  if (input.recipientRepresentativeId) {
    const rep = await uow.tx.representative.findUnique({ where: { id: input.recipientRepresentativeId }, select: { residentId: true } });
    if (rep?.residentId !== stay.residentId) throw new DomainError(Codes.INVALID_INPUT, "That representative does not represent this resident.", { field: "recipientRepresentativeId" });
  }
  if (input.censusEventId) {
    const event = await uow.tx.censusEvent.findUnique({ where: { id: input.censusEventId }, select: { stayId: true } });
    if (event?.stayId !== stay.id) throw new DomainError(Codes.INVALID_INPUT, "That census event belongs to another stay.", { field: "censusEventId" });
  }
  const copy = input.copyToOmbudsmanAt ? new Date(input.copyToOmbudsmanAt) : null;
  const notice = await uow.tx.noticeDelivery.create({
    data: {
      kind: input.kind,
      subjectType: "Stay",
      subjectId: stay.id,
      residentId: stay.residentId,
      censusEventId: input.censusEventId ?? null,
      recipientRepresentativeId: input.recipientRepresentativeId ?? null,
      method: input.method,
      deliveredAt,
      deliveredById: actorUserId(actor),
      acknowledgement: input.acknowledgement ?? "not_required",
      copyToOmbudsmanAt: copy,
      note: input.note ?? ""
    }
  });
  auditCreate(uow, actor, "NoticeDelivery", notice.id, "notice.delivered", { kind: input.kind, method: input.method, deliveredAt, censusEventId: input.censusEventId ?? null, copyToOmbudsmanAt: copy });
  const subject = { subjectType: "Stay", subjectId: stay.id, ...input.censusEventId ? { occurrenceKey: input.censusEventId } : {} };
  const satisfied = await satisfyByEvidence(uow, actor, subject, { type: `notice_delivery:${input.kind}`, id: notice.id, at: deliveredAt });
  if (copy) satisfied.push(...await satisfyByEvidence(uow, actor, subject, { type: "ombudsman_copy", id: notice.id, at: copy }));
  return { noticeId: notice.id, satisfiedClocks: satisfied };
}
async function verifyCensusProjection(tx, stayId) {
  const stay = await tx.stay.findUnique({ where: { id: stayId }, select: { id: true, communityId: true, projectionHash: true, currentBedId: true, heldBedId: true, currentApartmentId: true, presence: true, status: true } });
  if (!stay?.communityId) throw new DomainError(Codes.NOT_FOUND, "Stay not found.");
  const timeZone = await communityTimeZone(tx, stay.communityId);
  const rebuilt = foldStored(await loadCensusEvents(tx, stayId), timeZone);
  const hash = projectionHash(rebuilt);
  const columnsMatch = rebuilt.status === stay.status && rebuilt.presence === stay.presence && rebuilt.currentBedId === stay.currentBedId && rebuilt.heldBedId === stay.heldBedId && rebuilt.currentApartmentId === stay.currentApartmentId;
  return { stayId, matches: hash === stay.projectionHash && columnsMatch, storedHash: stay.projectionHash, rebuiltHash: hash };
}
async function verifyCensusChain(tx, stayId) {
  const rows = await tx.censusEvent.findMany({ where: { stayId }, orderBy: { seq: "asc" } });
  let prev = "0".repeat(64);
  for (const row of rows) {
    const body = { stayId, seq: row.seq, kind: row.kind, effectiveAt: row.effectiveAt.toISOString(), toBedId: row.toBedId, toApartmentId: row.toApartmentId, leaveKind: row.leaveKind, holdElected: row.holdElected, holdPaidBy: row.holdPaidBy, dischargeDisposition: row.dischargeDisposition, initiatedBy: row.initiatedBy, voidsEventId: row.voidsEventId };
    if (row.prevHash !== prev || row.hash !== sha256(`${prev}
${canonicalJson(body)}`)) return { ok: false, brokenAtSeq: row.seq };
    prev = row.hash;
  }
  return { ok: true, count: rows.length };
}

// features/keystone/lib/censusCorrection.ts
var LATE_KINDS = ["room_change", "leave_start", "hold_release", "leave_end", "coverage_change"];
function validateCorrection(payload) {
  if (!payload?.stayId) throw new DomainError(Codes.INVALID_INPUT, "Choose the stay.", { field: "stayId" });
  if (!payload.reason?.trim() || payload.reason.trim().length < 10) throw new DomainError(Codes.INVALID_INPUT, "Explain the correction (at least 10 characters).", { field: "reason" });
  if (!Array.isArray(payload.events) || !payload.events.length || payload.events.length > 10) throw new DomainError(Codes.INVALID_INPUT, "A correction has 1 to 10 events.", { field: "events" });
  for (const event of payload.events) {
    if (event.kind === "correction") {
      if (!event.voidsEventId) throw new DomainError(Codes.INVALID_INPUT, "A void names the event it voids.", { field: "voidsEventId" });
    } else if (!LATE_KINDS.includes(event.kind)) {
      throw new DomainError(Codes.INVALID_INPUT, `A correction cannot record ${event.kind.replaceAll("_", " ")}; use the admission, discharge or death command.`, { field: "kind" });
    }
    if (Number.isNaN(new Date(event.effectiveAt).getTime())) throw new DomainError(Codes.INVALID_INPUT, "Each event needs a valid time.", { field: "effectiveAt" });
  }
}
async function applyCorrection(uow, actor, payload, approvalId) {
  validateCorrection(payload);
  const stay = await lockRow(uow.tx, "Stay", payload.stayId);
  if (stay.version !== payload.expectedStayVersion) throw new DomainError(Codes.STALE_STATE, "The stay changed after this correction was prepared. Prepare it again.", { currentStatus: stay.status, currentVersion: stay.version });
  const result = await appendCensusEvents(uow, actor, stay, payload.events.map((event, index) => ({
    kind: event.kind,
    effectiveAt: new Date(event.effectiveAt),
    toBedId: event.toBedId ?? null,
    toApartmentId: event.toApartmentId ?? null,
    leaveKind: event.leaveKind ?? null,
    holdElected: event.holdElected ?? null,
    holdPaidBy: event.holdPaidBy ?? null,
    voidsEventId: event.voidsEventId ?? null,
    correctionReason: payload.reason.trim(),
    approvalId,
    idempotencyKey: `correction:${approvalId ?? "open"}:${index}`
  })), { late: true });
  return { stayId: payload.stayId, events: result.events, presence: result.after.presence, version: result.version };
}
async function requestClosedPeriodCorrection(uow, actor, payload) {
  validateCorrection(payload);
  if (actor.kind !== "user") throw new DomainError(Codes.NOT_AUTHORIZED, "Census corrections are requested by people only.");
  const stay = await uow.tx.stay.findUnique({ where: { id: payload.stayId }, select: { id: true, communityId: true, reference: true, version: true } });
  if (!stay) throw new DomainError(Codes.NOT_FOUND, "Stay not found.");
  return requestApproval(uow, actor, {
    action: "census.correct_closed_period",
    targetList: "Stay",
    targetId: stay.id,
    communityId: stay.communityId,
    payload: { ...payload, reason: payload.reason.trim() },
    requiredPermission: "canApproveCensusCorrections",
    summary: `Correct the signed-off census for stay ${stay.reference}: ${payload.events.map((e) => e.kind.replaceAll("_", " ")).join(", ")}`
  });
}
registerApplier("census.correct_closed_period", (uow, actor, request) => applyCorrection(uow, actor, request.payload, request.id), { applyOnApprove: true });

// features/keystone/lib/censusDay.ts
var DATE2 = /^\d{4}-\d{2}-\d{2}$/;
var day2 = (date2) => /* @__PURE__ */ new Date(`${date2}T00:00:00Z`);
async function timeZoneOf(tx, communityId) {
  const community = await tx.community.findUnique({ where: { id: communityId }, select: { timeZone: true } });
  if (!community) throw new DomainError(Codes.NOT_FOUND, "Community not found.");
  return community.timeZone;
}
async function deriveCensusDay(tx, communityId, date2) {
  if (!DATE2.test(date2)) throw new DomainError(Codes.INVALID_INPUT, "Date must be YYYY-MM-DD.", { field: "date" });
  const timeZone = await timeZoneOf(tx, communityId);
  const dayStart = day2(date2);
  const stays = await tx.stay.findMany({
    where: { communityId, admittedAt: { not: null }, OR: [{ dischargedAt: null }, { dischargedAt: { gte: new Date(dayStart.getTime() - 864e5) } }] },
    select: { id: true, setting: true, residentId: true }
  });
  const rows = [];
  for (const stay of stays) {
    const events = await loadCensusEvents(tx, stay.id);
    const projection = presenceAt(events.map((event, index) => ({ ...event, seq: index + 1 })), timeZone, date2);
    if (projection.presence !== "in_house" && projection.presence !== "on_leave_hold") continue;
    const bedId = projection.presence === "in_house" ? projection.currentBedId : projection.heldBedId;
    const apartmentId = projection.currentApartmentId;
    let unitId = null;
    if (bedId) unitId = (await tx.bed.findUnique({ where: { id: bedId }, select: { room: { select: { unitId: true } } } }))?.room?.unitId ?? null;
    else if (apartmentId) unitId = (await tx.apartment.findUnique({ where: { id: apartmentId }, select: { unitId: true } }))?.unitId ?? null;
    const coverage = await tx.coveragePeriod.findFirst({
      where: { stayId: stay.id, rank: "primary", startDate: { lte: dayStart }, OR: [{ endDate: null }, { endDate: { gt: dayStart } }], status: { in: ["active", "ending", "ended", "retro_approved"] } },
      orderBy: { startDate: "desc" },
      include: { payer: { select: { kind: true } } }
    });
    rows.push({ stayId: stay.id, setting: stay.setting, presence: projection.presence, bedId, apartmentId, unitId, coverageId: coverage?.id ?? null, payerKind: coverage?.payer?.kind ?? "uncovered" });
  }
  const totals = { present: rows.length, inHouse: 0, onLeaveHold: 0, bySetting: {}, byUnit: {}, byPayer: {} };
  for (const row of rows) {
    if (row.presence === "in_house") totals.inHouse += 1;
    else totals.onLeaveHold += 1;
    totals.bySetting[row.setting] = (totals.bySetting[row.setting] ?? 0) + 1;
    if (row.unitId) totals.byUnit[row.unitId] = (totals.byUnit[row.unitId] ?? 0) + 1;
    totals.byPayer[row.payerKind] = (totals.byPayer[row.payerKind] ?? 0) + 1;
  }
  return { timeZone, rows, totals };
}
async function snapshotCensusDay(uow, actor, input) {
  const closed = await closedThrough(uow.tx, input.communityId);
  if (closed && input.date <= closed) throw new DomainError(Codes.GUARD_FAILED, `The census through ${closed} is signed off.`, { reason: "closed_period" });
  const timeZone = await timeZoneOf(uow.tx, input.communityId);
  if (input.date > localDate(timeZone, uow.now)) throw new DomainError(Codes.INVALID_INPUT, "The census day has not happened yet.", { field: "date" });
  const derived = await deriveCensusDay(uow.tx, input.communityId, input.date);
  const existing = await uow.tx.censusDay.findMany({ where: { communityId: input.communityId, date: day2(input.date), supersededById: null } });
  const byStay = new Map(existing.map((row) => [row.stayId, row]));
  let written = 0;
  let superseded = 0;
  for (const row of derived.rows) {
    const prior = byStay.get(row.stayId);
    byStay.delete(row.stayId);
    const same = prior && prior.presence === row.presence && prior.bedId === row.bedId && prior.apartmentId === row.apartmentId && prior.unitId === row.unitId && prior.primaryCoverageId === row.coverageId;
    if (same) continue;
    const created = await uow.tx.censusDay.create({ data: { communityId: input.communityId, stayId: row.stayId, date: day2(input.date), setting: row.setting, bedId: row.bedId, apartmentId: row.apartmentId, unitId: row.unitId, presence: row.presence, primaryCoverageId: row.coverageId, payerKind: row.payerKind, billableForPayer: row.payerKind !== "uncovered", snapshotRunId: input.runId ?? null } });
    written += 1;
    if (prior) {
      await uow.tx.censusDay.update({ where: { id: prior.id }, data: { supersededById: created.id } });
      superseded += 1;
    }
  }
  for (const stale of byStay.values()) {
    const tombstone = await uow.tx.censusDay.create({ data: { communityId: input.communityId, stayId: stale.stayId, date: day2(input.date), setting: stale.setting, presence: "absent", payerKind: stale.payerKind, billableForPayer: false, snapshotRunId: input.runId ?? null } });
    await uow.tx.censusDay.update({ where: { id: stale.id }, data: { supersededById: tombstone.id } });
    superseded += 1;
  }
  uow.audit({ eventType: "census.day_snapshot", entityType: "Community", entityId: input.communityId, actorUserId: actorUserId(actor), after: { date: input.date, present: derived.totals.present, written, superseded } });
  return { date: input.date, totals: derived.totals, written, superseded };
}
async function signOffCensusDay(uow, actor, input) {
  if (actor.kind !== "user") throw new DomainError(Codes.NOT_AUTHORIZED, "Only a person can sign off the census.");
  const timeZone = await timeZoneOf(uow.tx, input.communityId);
  if (input.date >= localDate(timeZone, uow.now)) throw new DomainError(Codes.GUARD_FAILED, "A census day can be signed off once it has ended.", { reason: "day_not_ended" });
  const closed = await closedThrough(uow.tx, input.communityId);
  if (closed && input.date <= closed) throw new DomainError(Codes.GUARD_FAILED, `The census through ${closed} is already signed off.`, { reason: "closed_period" });
  const snapshot = await snapshotCensusDay(uow, actor, { communityId: input.communityId, date: input.date });
  const signoff = await uow.tx.censusSignoff.create({ data: { communityId: input.communityId, date: day2(input.date), totals: snapshot.totals, signedById: actor.userId, signedAt: uow.now, note: input.note?.trim() ?? "" } });
  uow.audit({ eventType: "census.signed_off", entityType: "CensusSignoff", entityId: signoff.id, actorUserId: actor.userId, after: { communityId: input.communityId, date: input.date, totals: snapshot.totals } });
  uow.emit({ topic: "census.signed_off", aggregateType: "Community", aggregateId: input.communityId, payload: { date: input.date }, dedupeKey: `census.signed_off:${input.communityId}:${input.date}` });
  return { signoffId: signoff.id, date: input.date, totals: snapshot.totals };
}

// features/keystone/mutations/actorFor.ts
async function actorFor(context) {
  const person = actorFromSession(context.session);
  const marker = mcpSessionMarker(context.session);
  if (!marker) return person;
  const agent = await context.prisma.agentIdentity.findFirst({
    where: { oauthApp: { clientId: { equals: marker.clientId } } },
    select: { id: true, name: true, status: true, ownerId: true, grants: { where: { status: "active" }, select: { scope: true } } }
  });
  if (!agent) return person;
  if (agent.status !== "active") throw new DomainError(Codes.NOT_AUTHORIZED, `The agent ${agent.name} is ${agent.status}.`);
  return { kind: "agent", agentId: agent.id, ownerUserId: agent.ownerId, name: agent.name, scopes: new Set(agent.grants.map((g) => g.scope)) };
}

// features/keystone/mutations/run.ts
async function assertCommunityAccess(tx, actor, communityId) {
  if (actor.kind === "system") return;
  if (!communityId) throw new DomainError(Codes.NOT_FOUND, "Not found.");
  if (actor.kind === "user" && actor.permissions.has("canManageOperator")) return;
  const userId = actor.kind === "user" ? actor.userId : actor.ownerUserId;
  if (!userId) throw new DomainError(Codes.NOT_AUTHORIZED, "Not assigned to this community.");
  const assigned = await tx.staffAssignment.count({ where: { userId, communityId, status: "active", OR: [{ effectiveTo: null }, { effectiveTo: { gte: /* @__PURE__ */ new Date() } }] } });
  if (!assigned) throw new DomainError(Codes.NOT_FOUND, "Not found.");
}
var communityOf = {
  stay: async (tx, id) => (await tx.stay.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  resident: async (tx, id) => (await tx.resident.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  representative: async (tx, id) => (await tx.representative.findUnique({ where: { id }, select: { resident: { select: { communityId: true } } } }))?.resident?.communityId ?? null,
  bed: async (tx, id) => (await tx.bed.findUnique({ where: { id }, select: { room: { select: { unit: { select: { communityId: true } } } } } }))?.room?.unit?.communityId ?? null,
  apartment: async (tx, id) => (await tx.apartment.findUnique({ where: { id }, select: { unit: { select: { communityId: true } } } }))?.unit?.communityId ?? null,
  place: async (tx, target) => target.bedId ? communityOf.bed(tx, target.bedId) : target.apartmentId ? communityOf.apartment(tx, target.apartmentId) : null,
  reservation: async (tx, id) => (await tx.placeReservation.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  lead: async (tx, id) => (await tx.lead.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  tour: async (tx, id) => (await tx.tour.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  referral: async (tx, id) => (await tx.referral.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  waitlist: async (tx, id) => (await tx.waitlistEntry.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  portalAccount: async (tx, id) => (await tx.portalAccount.findUnique({ where: { id }, select: { communityId: true } }))?.communityId ?? null,
  portalGrant: async (tx, id) => (await tx.portalScopeGrant.findUnique({ where: { id }, select: { resident: { select: { communityId: true } } } }))?.resident?.communityId ?? null
};
function assertHuman(context, actor, humanOnly = true) {
  if (!humanOnly) return;
  if (actor.kind !== "user" || mcpSessionMarker(context.session)) throw new DomainError(Codes.NOT_AUTHORIZED, "Only a person signed in to the dashboard can do this.");
}
async function runDomain(context, args, spec, work) {
  const actor = await actorFor(context);
  assertHuman(context, actor, spec.humanOnly);
  requirePermission(actor, ...spec.permissions);
  const { idempotencyKey, ...params } = args;
  const result = await command(context.prisma, { name: spec.name, actor, idempotencyKey: requireKey(idempotencyKey), params, serializable: spec.serializable }, async (uow) => {
    if (spec.community) await assertCommunityAccess(uow.tx, actor, await spec.community(uow.tx));
    return work(uow, actor);
  });
  return { replay: result.replay, ...result.value };
}
var date = (value, field) => {
  const parsed = value instanceof Date ? value : new Date(String(value ?? ""));
  if (Number.isNaN(parsed.getTime())) throw new DomainError(Codes.INVALID_INPUT, `${field} is not a valid time.`, { field });
  return parsed;
};
var optionalDate = (value, field) => value == null || value === "" ? null : date(value, field);

// features/keystone/mutations/census.ts
var census = (name, community, permissions2 = ["canRecordCensus", "canAdmitDischarge"]) => ({ name, permissions: permissions2, serializable: true, community });
async function admitResidentMutation(_root, args, context) {
  const input = args.input;
  return runDomain(context, args, { name: "census.admit", permissions: ["canAdmitDischarge"], serializable: true, community: async () => input.communityId }, (uow, actor) => admitResident(uow, actor, { ...input, effectiveAt: date(input.effectiveAt, "effectiveAt"), observedAt: optionalDate(input.observedAt, "observedAt"), idempotencyKey: args.idempotencyKey }).then((result) => ({ ...result })));
}
async function changeRoomMutation(_root, args, context) {
  return runDomain(context, args, census("census.room_change", (tx) => communityOf.stay(tx, args.stayId)), (uow, actor) => changeRoom(uow, actor, { ...args, effectiveAt: date(args.effectiveAt, "effectiveAt"), observedAt: optionalDate(args.observedAt, "observedAt") }));
}
async function startLeaveMutation(_root, args, context) {
  return runDomain(context, args, census("census.leave_start", (tx) => communityOf.stay(tx, args.stayId)), (uow, actor) => startLeave(uow, actor, { ...args, effectiveAt: date(args.effectiveAt, "effectiveAt"), observedAt: optionalDate(args.observedAt, "observedAt") }));
}
async function releaseBedHoldMutation(_root, args, context) {
  return runDomain(context, args, census("census.hold_release", (tx) => communityOf.stay(tx, args.stayId)), (uow, actor) => releaseBedHold(uow, actor, { ...args, effectiveAt: date(args.effectiveAt, "effectiveAt") }));
}
async function endLeaveMutation(_root, args, context) {
  return runDomain(context, args, census("census.leave_end", (tx) => communityOf.stay(tx, args.stayId)), (uow, actor) => endLeave(uow, actor, { ...args, effectiveAt: date(args.effectiveAt, "effectiveAt"), observedAt: optionalDate(args.observedAt, "observedAt") }));
}
async function dischargeResidentMutation(_root, args, context) {
  return runDomain(context, args, census("census.discharge", (tx) => communityOf.stay(tx, args.stayId), ["canAdmitDischarge"]), (uow, actor) => dischargeResident(uow, actor, { ...args, effectiveAt: date(args.effectiveAt, "effectiveAt"), observedAt: optionalDate(args.observedAt, "observedAt") }));
}
async function recordDeathMutation(_root, args, context) {
  return runDomain(context, args, { ...census("census.death", (tx) => communityOf.stay(tx, args.stayId), ["canAdmitDischarge", "canChartNursing"]), humanOnly: true }, (uow, actor) => recordDeath(uow, actor, { ...args, effectiveAt: date(args.effectiveAt, "effectiveAt"), observedAt: optionalDate(args.observedAt, "observedAt") }));
}
async function recordNoticeMutation(_root, args, context) {
  return runDomain(context, args, { name: "census.notice", permissions: ["canAdmitDischarge", "canRecordCensus", "canManageRepresentatives"], community: (tx) => communityOf.stay(tx, args.input.stayId) }, (uow, actor) => recordNotice(uow, actor, args.input));
}
async function correctCensus(_root, args, context) {
  return runDomain(context, args, { name: "census.correct", permissions: ["canRecordCensus", "canAdmitDischarge"], serializable: true, humanOnly: true, community: (tx) => communityOf.stay(tx, args.input.stayId) }, async (uow, actor) => {
    const stay = await uow.tx.stay.findUnique({ where: { id: args.input.stayId }, select: { communityId: true, community: { select: { timeZone: true } } } });
    const closed = await closedThrough(uow.tx, stay.communityId);
    const touchesClosed = closed && args.input.events.some((event) => localDate(stay.community.timeZone, new Date(event.effectiveAt)) <= closed);
    if (touchesClosed) {
      const request = await requestClosedPeriodCorrection(uow, actor, args.input);
      return { status: "approval_requested", approvalRequestId: request.id };
    }
    return { status: "applied", ...await applyCorrection(uow, actor, args.input, null) };
  });
}
async function snapshotCensusDayMutation(_root, args, context) {
  return runDomain(context, args, { name: "census.snapshot", permissions: ["canRecordCensus"], serializable: true, community: async () => args.communityId }, (uow, actor) => snapshotCensusDay(uow, actor, { communityId: args.communityId, date: args.date }));
}
async function signOffCensusDayMutation(_root, args, context) {
  return runDomain(context, args, { name: "census.sign_off", permissions: ["canRecordCensus"], serializable: true, humanOnly: true, community: async () => args.communityId }, (uow, actor) => signOffCensusDay(uow, actor, args));
}
async function verifyStay(_root, args, context) {
  const actor = await actorFor(context);
  requirePermission(actor, "canRecordCensus", "canAdmitDischarge", "canReadAudit");
  return context.prisma.$transaction(async (tx) => {
    await assertCommunityAccess(tx, actor, await communityOf.stay(tx, args.stayId));
    return { projection: await verifyCensusProjection(tx, args.stayId), chain: await verifyCensusChain(tx, args.stayId) };
  });
}

// features/keystone/lib/places.ts
var import_node_crypto5 = require("node:crypto");
var MAX_RESERVATION_HOURS = 24 * 30;
async function lockPlace(tx, target) {
  if (!target.bedId === !target.apartmentId) throw new DomainError(Codes.INVALID_INPUT, "Choose one bed or one apartment.", { field: "bedId" });
  const model = target.bedId ? "Bed" : "Apartment";
  const id = target.bedId ?? target.apartmentId;
  await advisoryLock(tx, `${target.bedId ? "bed" : "apartment"}:${id}`);
  const row = await lockRow(tx, model, id);
  return { model, id, row, name: target.bedId ? `Bed ${row.label}` : `Apartment ${row.number}` };
}
async function placeCommunity(tx, target) {
  if (target.bedId) {
    const bed = await tx.bed.findUnique({ where: { id: target.bedId }, select: { room: { select: { unit: { select: { communityId: true } } } } } });
    return bed?.room?.unit?.communityId ?? null;
  }
  const apartment = await tx.apartment.findUnique({ where: { id: target.apartmentId }, select: { unit: { select: { communityId: true } } } });
  return apartment?.unit?.communityId ?? null;
}
async function reservePlace(uow, actor, input) {
  if (!Number.isInteger(input.hours) || input.hours < 1 || input.hours > MAX_RESERVATION_HOURS) throw new DomainError(Codes.INVALID_INPUT, `A reservation lasts 1 to ${MAX_RESERVATION_HOURS} hours.`, { field: "hours" });
  const place = await lockPlace(uow.tx, input);
  const communityId = await placeCommunity(uow.tx, input);
  if (!communityId) throw new DomainError(Codes.NOT_FOUND, "Place not found.");
  const reservable = place.model === "Bed" ? place.row.status === "available" : place.row.status === "available" || place.row.status === "occupied" && (place.row.occupantCount ?? 0) < Number(place.row.capacity ?? 1);
  if (!reservable) throw new DomainError(Codes.PLACE_UNAVAILABLE, `${place.name} is ${place.row.status.replaceAll("_", " ")}.`, { currentStatus: place.row.status });
  const active = await uow.tx.placeReservation.findFirst({ where: { status: "active", ...input.bedId ? { bedId: input.bedId } : { apartmentId: input.apartmentId } }, select: { id: true } });
  if (active) throw new DomainError(Codes.PLACE_UNAVAILABLE, `${place.name} already has an active reservation.`, { currentStatus: "reserved" });
  const reservation = await uow.tx.placeReservation.create({
    data: {
      reference: await nextReference(uow.tx, "RSV", uow.now),
      communityId,
      bedId: input.bedId ?? null,
      apartmentId: input.apartmentId ?? null,
      prospectId: input.prospectId ?? null,
      referralId: input.referralId ?? null,
      waitlistEntryId: input.waitlistEntryId ?? null,
      purpose: input.purpose,
      status: "active",
      expiresAt: new Date(uow.now.getTime() + input.hours * 36e5),
      operationKeyHash: (0, import_node_crypto5.createHash)("sha256").update(`${principalKey(actor)}:${input.idempotencyKey}`).digest("hex")
    }
  });
  auditCreate(uow, actor, "PlaceReservation", reservation.id, "reservation.created", { reference: reservation.reference, bedId: input.bedId ?? null, apartmentId: input.apartmentId ?? null, expiresAt: reservation.expiresAt, purpose: input.purpose });
  if (place.row.status === "available") await casUpdate(uow, { model: place.model, id: place.id, version: place.row.version, from: ["available"], to: "reserved", actor, eventType: `${place.model.toLowerCase()}.reserved`, metadata: { reservationId: reservation.id } });
  return { reservationId: reservation.id, reference: reservation.reference, expiresAt: reservation.expiresAt };
}
async function endReservation(uow, actor, input) {
  const reservation = await lockRow(uow.tx, "PlaceReservation", input.reservationId);
  if (input.expectedVersion != null && input.expectedVersion !== reservation.version) throw new DomainError(Codes.STALE_STATE, "The reservation changed since you loaded it.", { currentStatus: reservation.status, currentVersion: reservation.version });
  if (input.to === "expired" && reservation.expiresAt && reservation.expiresAt.getTime() > uow.now.getTime()) throw new DomainError(Codes.GUARD_FAILED, "The reservation has not expired yet.");
  const place = await lockPlace(uow.tx, { bedId: reservation.bedId, apartmentId: reservation.apartmentId });
  await casUpdate(uow, { model: "PlaceReservation", id: reservation.id, version: reservation.version, from: ["active"], to: input.to, actor, eventType: `reservation.${input.to}`, reason: input.reason ?? null });
  if (place.row.status === "reserved") await casUpdate(uow, { model: place.model, id: place.id, version: place.row.version, from: ["reserved"], to: "available", actor, eventType: `${place.model.toLowerCase()}.reservation_ended`, metadata: { reservationId: reservation.id } });
  uow.emit({ topic: "availability.changed", aggregateType: place.model, aggregateId: place.id, payload: { [place.model === "Bed" ? "bedId" : "apartmentId"]: place.id }, dedupeKey: `availability:${reservation.id}:${input.to}` });
  return { reservationId: reservation.id, status: input.to };
}
async function markPlaceReady(uow, actor, input) {
  const place = await lockPlace(uow.tx, input);
  if (input.expectedVersion != null && input.expectedVersion !== place.row.version) throw new DomainError(Codes.STALE_STATE, `${place.name} changed since you loaded it.`, { currentStatus: place.row.status, currentVersion: place.row.version });
  const from = place.model === "Bed" ? "cleaning" : "turnover";
  if (place.model === "Apartment" && (place.row.occupantCount ?? 0) > 0) throw new DomainError(Codes.GUARD_FAILED, `${place.name} still has a resident.`);
  await casUpdate(uow, { model: place.model, id: place.id, version: place.row.version, from: [from], to: "available", actor, eventType: `${place.model.toLowerCase()}.ready`, reason: input.note ?? null, data: { statusReason: null } });
  uow.emit({ topic: "availability.changed", aggregateType: place.model, aggregateId: place.id, payload: { placeId: place.id }, dedupeKey: `availability:${place.id}:ready:${place.row.version}` });
  return { id: place.id, status: "available", version: place.row.version + 1 };
}
async function setPlaceService(uow, actor, input) {
  if (!input.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Say why.", { field: "reason" });
  const place = await lockPlace(uow.tx, input);
  if (input.expectedVersion != null && input.expectedVersion !== place.row.version) throw new DomainError(Codes.STALE_STATE, `${place.name} changed since you loaded it.`, { currentStatus: place.row.status, currentVersion: place.row.version });
  if (!input.inService) {
    const from = place.model === "Bed" ? ["available", "cleaning"] : ["available", "turnover"];
    if (!from.includes(place.row.status)) throw new DomainError(Codes.INVALID_TRANSITION, `${place.name} is ${place.row.status.replaceAll("_", " ")}; only an empty, unreserved place can go out of service.`, { currentStatus: place.row.status });
    await casUpdate(uow, { model: place.model, id: place.id, version: place.row.version, from, to: "out_of_service", actor, eventType: `${place.model.toLowerCase()}.out_of_service`, reason: input.reason.trim(), data: { statusReason: input.reason.trim() } });
    return { id: place.id, status: "out_of_service" };
  }
  await casUpdate(uow, { model: place.model, id: place.id, version: place.row.version, from: ["out_of_service"], to: "available", actor, eventType: `${place.model.toLowerCase()}.in_service`, reason: input.reason.trim(), data: { statusReason: null } });
  uow.emit({ topic: "availability.changed", aggregateType: place.model, aggregateId: place.id, payload: { placeId: place.id }, dedupeKey: `availability:${place.id}:in_service:${place.row.version}` });
  return { id: place.id, status: "available" };
}
async function recomputeAvailability(uow, communityId) {
  const types = await uow.tx.apartmentType.findMany({ where: { communityId }, select: { id: true, setting: true } });
  const results = [];
  for (const type of types) {
    const availableCount = await uow.tx.apartment.count({ where: { apartmentTypeId: type.id, status: "available" } });
    const snapshotKey2 = `${communityId}:type:${type.id}`;
    await uow.tx.availabilitySnapshot.upsert({ where: { snapshotKey: snapshotKey2 }, create: { snapshotKey: snapshotKey2, communityId, apartmentTypeId: type.id, setting: type.setting, availableCount, computedAt: uow.now }, update: { availableCount, computedAt: uow.now } });
    results.push({ snapshotKey: snapshotKey2, availableCount });
  }
  const beds = await uow.tx.bed.count({ where: { status: "available", licensed: true, room: { unit: { communityId, setting: "nursing_facility" } } } });
  const snapshotKey = `${communityId}:setting:nursing_facility`;
  await uow.tx.availabilitySnapshot.upsert({ where: { snapshotKey }, create: { snapshotKey, communityId, setting: "nursing_facility", availableCount: beds, computedAt: uow.now }, update: { availableCount: beds, computedAt: uow.now } });
  results.push({ snapshotKey, availableCount: beds });
  uow.audit({ eventType: "availability.recomputed", entityType: "Community", entityId: communityId, actorUserId: null, after: { snapshots: results.length } });
  return results;
}

// features/keystone/lib/publicToken.ts
var import_node_crypto7 = require("node:crypto");

// features/keystone/lib/derivedSessionSecret.ts
var import_node_crypto6 = require("node:crypto");
function derivedSessionSecret(purpose) {
  const session = process.env.SESSION_SECRET?.trim() ?? "";
  if (!session) return "";
  return (0, import_node_crypto6.createHmac)("sha256", session).update(`openfront-senior-care:${purpose}`).digest("base64url");
}

// features/keystone/lib/publicToken.ts
var ENV = { "tour-manage": "TOUR_MANAGE_SECRET", "waitlist-offer": "WAITLIST_OFFER_SECRET", "portal-invite": "PORTAL_INVITE_SECRET" };
function publicTokenSecret(purpose) {
  const secret2 = process.env[ENV[purpose]]?.trim() || derivedSessionSecret(purpose);
  if (Buffer.byteLength(secret2, "utf8") < 32) throw new Error("Token secret must be at least 32 bytes. Set SESSION_SECRET.");
  return secret2;
}
var sign = (encoded, secret2) => (0, import_node_crypto7.createHmac)("sha256", secret2).update(encoded).digest("base64url");
function createPublicToken(purpose, subjectId, expiresAtMs, secret2 = publicTokenSecret(purpose)) {
  if (!subjectId || !Number.isSafeInteger(expiresAtMs)) throw new Error("Invalid token payload.");
  const payload = { version: 1, purpose, subjectId, expiresAtMs, nonce: (0, import_node_crypto7.randomBytes)(18).toString("base64url") };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret2)}`;
}
function verifyPublicToken(token, purpose, secret2 = publicTokenSecret(purpose), nowMs = Date.now()) {
  if (!token || token.length > 4096) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== void 0) return null;
  const expected = Buffer.from(sign(encoded, secret2), "base64url");
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !(0, import_node_crypto7.timingSafeEqual)(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload.version !== 1 || payload.purpose !== purpose || typeof payload.subjectId !== "string" || !payload.subjectId) return null;
    if (typeof payload.expiresAtMs !== "number" || !Number.isSafeInteger(payload.expiresAtMs) || payload.expiresAtMs <= nowMs) return null;
    if (typeof payload.nonce !== "string" || !payload.nonce) return null;
    return payload;
  } catch {
    return null;
  }
}
var hashPublicToken = (token) => (0, import_node_crypto7.createHash)("sha256").update(token).digest("hex");
function publicTokenMatches(token, storedHash) {
  if (!storedHash || !/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  const actual = Buffer.from(hashPublicToken(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && (0, import_node_crypto7.timingSafeEqual)(actual, expected);
}

// features/keystone/lib/sales.ts
var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var clean = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
async function publishedCommunity(uow, slug) {
  const community = await uow.tx.community.findUnique({ where: { slug }, select: { id: true, status: true, synthetic: true, storefront: { select: { published: true, tourBookingEnabled: true, waitlistEnabled: true } } } });
  if (!community || community.status !== "active" || !community.storefront?.published) throw new DomainError(Codes.NOT_FOUND, "Community not found.");
  return community;
}
async function submitInquiry(uow, input) {
  const community = await publishedCommunity(uow, input.communitySlug);
  if (clean(input.website, 200)) return { publicCode: publicCode("INQ") };
  const name = clean(input.contactName, 120);
  const email = clean(input.contactEmail, 200).toLowerCase();
  const phone = clean(input.contactPhone, 40);
  if (!name) throw new DomainError(Codes.INVALID_INPUT, "Tell us your name.", { field: "contactName" });
  if (!email && !phone) throw new DomainError(Codes.INVALID_INPUT, "Leave an email address or a phone number.", { field: "contactEmail" });
  if (email && !EMAIL.test(email)) throw new DomainError(Codes.INVALID_INPUT, "That email address does not look right.", { field: "contactEmail" });
  if (!input.consentToContact) throw new DomainError(Codes.INVALID_INPUT, "Tick the box so the community may contact you.", { field: "consentToContact" });
  const [firstName, ...rest] = name.split(/\s+/);
  const contact = await uow.tx.contact.create({ data: { reference: await nextReference(uow.tx, "CON", uow.now), communityId: community.id, firstName, lastName: rest.join(" "), email, phone, consentToContact: true, synthetic: community.synthetic } });
  const lead = await uow.tx.lead.create({ data: { reference: await nextReference(uow.tx, "LEAD", uow.now), communityId: community.id, primaryContactId: contact.id, status: "new", nextActionAt: new Date(uow.now.getTime() + 4 * 36e5), synthetic: community.synthetic } });
  const forFirst = clean(input.forWhomFirstName, 80);
  if (forFirst) {
    await uow.tx.prospect.create({ data: { reference: await nextReference(uow.tx, "PRO", uow.now), communityId: community.id, leadId: lead.id, firstName: forFirst, lastName: clean(input.forWhomLastName, 80), desiredSetting: ["nursing_facility", "assisted_living", "memory_care", "independent_living"].includes(String(input.desiredSetting)) ? input.desiredSetting : null, synthetic: community.synthetic } });
  }
  const code = publicCode("INQ");
  const utm = Object.fromEntries(Object.entries(input.utm ?? {}).slice(0, 10).map(([key, value]) => [clean(key, 40), clean(value, 200)]));
  const inquiry = await uow.tx.inquiry.create({ data: { publicCode: code, communityId: community.id, source: "website", contactName: name, contactEmail: email, contactPhone: phone, relationship: clean(input.relationship, 80), message: clean(input.message, 4e3), consentToContact: true, utm, leadId: lead.id } });
  uow.audit({ eventType: "inquiry.received", entityType: "Inquiry", entityId: inquiry.id, actorUserId: null, after: { publicCode: code, leadId: lead.id, communityId: community.id } });
  uow.emit({ topic: "task.sales_callback", aggregateType: "Lead", aggregateId: lead.id, payload: { leadId: lead.id, communityId: community.id }, dedupeKey: `task.sales_callback:${lead.id}` });
  return { publicCode: code };
}
async function recordInquiry(uow, actor, input) {
  const community = await uow.tx.community.findUnique({ where: { id: input.communityId }, select: { slug: true } });
  if (!community) throw new DomainError(Codes.NOT_FOUND, "Community not found.");
  const sources = ["phone", "walk_in", "referral_agency", "hospital", "resident_referral", "other"];
  if (!sources.includes(input.source)) throw new DomainError(Codes.INVALID_INPUT, "Choose where the inquiry came from.", { field: "source" });
  const name = clean(input.contactName, 120);
  if (!name) throw new DomainError(Codes.INVALID_INPUT, "Enter the caller's name.", { field: "contactName" });
  const [firstName, ...rest] = name.split(/\s+/);
  const contact = await uow.tx.contact.create({ data: { reference: await nextReference(uow.tx, "CON", uow.now), communityId: input.communityId, firstName, lastName: rest.join(" "), email: clean(input.contactEmail, 200).toLowerCase(), phone: clean(input.contactPhone, 40), consentToContact: Boolean(input.consentToContact) } });
  const lead = await uow.tx.lead.create({ data: { reference: await nextReference(uow.tx, "LEAD", uow.now), communityId: input.communityId, primaryContactId: contact.id, ownerId: actorUserId(actor), status: "contacted" } });
  const code = publicCode("INQ");
  const inquiry = await uow.tx.inquiry.create({ data: { publicCode: code, communityId: input.communityId, source: input.source, contactName: name, contactEmail: clean(input.contactEmail, 200), contactPhone: clean(input.contactPhone, 40), relationship: clean(input.relationship, 80), message: clean(input.message, 4e3), consentToContact: Boolean(input.consentToContact), leadId: lead.id } });
  auditCreate(uow, actor, "Inquiry", inquiry.id, "inquiry.recorded", { publicCode: code, leadId: lead.id, source: input.source });
  return { inquiryId: inquiry.id, leadId: lead.id, publicCode: code };
}
var LEAD_EDGES = {
  contacted: ["new", "nurture"],
  tour_scheduled: ["new", "contacted", "toured", "nurture", "waitlisted"],
  toured: ["tour_scheduled"],
  assessment_scheduled: ["toured", "contacted"],
  assessed: ["assessment_scheduled"],
  deposit_received: ["assessed"],
  move_in_scheduled: ["deposit_received", "assessed", "waitlisted"],
  waitlisted: ["new", "contacted", "toured", "assessed", "deposit_received", "nurture"],
  nurture: ["new", "contacted", "toured", "assessed", "waitlisted"],
  lost: LEAD_STATUSES.filter((status) => status !== "moved_in" && status !== "lost")
};
async function moveLead(uow, actor, input) {
  const from = LEAD_EDGES[input.to];
  if (!from) throw new DomainError(Codes.INVALID_INPUT, input.to === "moved_in" ? "A lead moves in when the resident is admitted." : "Unknown lead status.", { field: "to" });
  const lead = await lockRow(uow.tx, "Lead", input.leadId);
  const evidence = {
    contacted: async () => await uow.tx.salesActivity.count({ where: { leadId: lead.id, kind: { in: ["call", "email", "text", "note"] } } }) > 0,
    tour_scheduled: async () => await uow.tx.tour.count({ where: { leadId: lead.id, status: "confirmed" } }) > 0,
    toured: async () => await uow.tx.tour.count({ where: { leadId: lead.id, status: "completed" } }) > 0,
    move_in_scheduled: async () => await uow.tx.placeReservation.count({ where: { status: "active", prospect: { leadId: lead.id } } }) > 0,
    waitlisted: async () => await uow.tx.waitlistEntry.count({ where: { leadId: lead.id, status: { in: ["active", "offered"] } } }) > 0
  };
  if (evidence[input.to] && !await evidence[input.to]()) {
    const need = { contacted: "Log a call, email, text or note first.", tour_scheduled: "Confirm a tour first.", toured: "Mark the tour completed first.", move_in_scheduled: "Reserve an apartment or bed first.", waitlisted: "Add a waitlist entry first." };
    throw new DomainError(Codes.GUARD_FAILED, need[input.to], { reason: "evidence" });
  }
  if (input.to === "lost" && !input.lostReason) throw new DomainError(Codes.INVALID_INPUT, "Choose why the lead was lost.", { field: "lostReason" });
  const row = await casUpdate(uow, { model: "Lead", id: lead.id, version: input.expectedVersion, from, to: input.to, actor, eventType: `lead.${input.to}`, reason: input.note ?? null, data: input.to === "lost" ? { lostReason: input.lostReason } : {} });
  if (input.to === "lost") {
    const holds = await uow.tx.placeReservation.findMany({ where: { status: "active", prospect: { leadId: lead.id } }, select: { id: true } });
    for (const hold of holds) await endReservation(uow, actor, { reservationId: hold.id, to: "released", reason: "lead lost" });
    const entries = await uow.tx.waitlistEntry.findMany({ where: { leadId: lead.id, status: { in: ["active", "offered"] } }, select: { id: true, version: true, status: true } });
    for (const entry of entries) await casUpdate(uow, { model: "WaitlistEntry", id: entry.id, version: entry.version, from: [entry.status], to: "withdrawn", actor, eventType: "waitlist.withdrawn", reason: "lead lost" });
  }
  return { leadId: lead.id, status: input.to, version: row?.version ?? input.expectedVersion + 1 };
}
async function logSalesActivity(uow, actor, input) {
  if (!["call", "email", "text", "tour", "assessment", "note"].includes(input.kind)) throw new DomainError(Codes.INVALID_INPUT, "Unknown activity.", { field: "kind" });
  if (!clean(input.summary, 4e3)) throw new DomainError(Codes.INVALID_INPUT, "Add a summary.", { field: "summary" });
  const lead = await uow.tx.lead.findUnique({ where: { id: input.leadId }, select: { id: true } });
  if (!lead) throw new DomainError(Codes.NOT_FOUND, "Lead not found.");
  const row = await uow.tx.salesActivity.create({ data: { leadId: lead.id, kind: input.kind, at: input.at ?? uow.now, byId: actorUserId(actor), summary: clean(input.summary, 4e3) } });
  auditCreate(uow, actor, "SalesActivity", row.id, "sales_activity.logged", { leadId: lead.id, kind: input.kind });
  return { activityId: row.id };
}
var TOUR_HOLD_MINUTES = 30;
async function slotHasRoom(uow, slotId) {
  await advisoryLock(uow.tx, `tour_slot:${slotId}`);
  const slot = await uow.tx.tourSlot.findUnique({ where: { id: slotId }, select: { id: true, communityId: true, startsAt: true, capacity: true, kind: true } });
  if (!slot) throw new DomainError(Codes.NOT_FOUND, "Tour time not found.");
  if (slot.startsAt.getTime() <= uow.now.getTime()) throw new DomainError(Codes.GUARD_FAILED, "That tour time has passed.");
  const taken = await uow.tx.tour.count({ where: { slotId, OR: [{ status: "confirmed" }, { status: "requested", holdExpiresAt: { gt: uow.now } }] } });
  if (taken >= slot.capacity) throw new DomainError(Codes.PLACE_UNAVAILABLE, "That tour time is full. Choose another.");
  return slot;
}
async function requestTour(uow, input) {
  const community = await publishedCommunity(uow, input.communitySlug);
  if (!community.storefront?.tourBookingEnabled) throw new DomainError(Codes.GUARD_FAILED, "Tours are booked by phone at this community.");
  const slot = await slotHasRoom(uow, input.slotId);
  if (slot.communityId !== community.id) throw new DomainError(Codes.NOT_FOUND, "Tour time not found.");
  if (input.kind !== "in_person" && input.kind !== "virtual") throw new DomainError(Codes.INVALID_INPUT, "Choose in person or virtual.", { field: "kind" });
  if (slot.kind !== "either" && slot.kind !== input.kind) throw new DomainError(Codes.INVALID_INPUT, `This time is for ${slot.kind.replace("_", " ")} tours.`, { field: "kind" });
  const { publicCode: inquiryCode } = await submitInquiry(uow, { communitySlug: input.communitySlug, contactName: input.contactName, contactEmail: input.contactEmail, contactPhone: input.contactPhone, message: input.notes, consentToContact: input.consentToContact });
  const inquiry = await uow.tx.inquiry.findUnique({ where: { publicCode: inquiryCode }, select: { leadId: true } });
  const code = publicCode("TOUR");
  const tour = await uow.tx.tour.create({ data: { publicCode: code, communityId: community.id, slotId: slot.id, leadId: inquiry?.leadId ?? null, kind: input.kind, status: "requested", holdExpiresAt: new Date(uow.now.getTime() + TOUR_HOLD_MINUTES * 6e4), notes: clean(input.notes, 2e3) } });
  const token = createPublicToken("tour-manage", tour.id, slot.startsAt.getTime() + 864e5);
  await uow.tx.tour.update({ where: { id: tour.id }, data: { guestTokenHash: hashPublicToken(token) } });
  uow.audit({ eventType: "tour.requested", entityType: "Tour", entityId: tour.id, actorUserId: null, after: { publicCode: code, slotId: slot.id } });
  uow.emit({ topic: "mail.tour_requested", aggregateType: "Tour", aggregateId: tour.id, payload: { tourId: tour.id }, dedupeKey: `mail.tour_requested:${tour.id}` });
  return { publicCode: code, manageToken: token, holdExpiresAt: tour.holdExpiresAt };
}
async function cancelTourWithToken(uow, input) {
  const payload = verifyPublicToken(input.token, "tour-manage");
  if (!payload) throw new DomainError(Codes.GUARD_FAILED, "This link is invalid or has expired.");
  const tour = await lockRow(uow.tx, "Tour", payload.subjectId);
  if (!publicTokenMatches(input.token, tour.guestTokenHash)) throw new DomainError(Codes.GUARD_FAILED, "This link is invalid or has expired.");
  await casUpdate(uow, { model: "Tour", id: tour.id, version: tour.version, from: ["requested", "confirmed"], to: "cancelled", actor: { kind: "system", name: "guest" }, eventType: "tour.cancelled_by_guest", reason: clean(input.reason, 500) || null });
  return { status: "cancelled" };
}
async function moveTour(uow, actor, input) {
  const edges = { confirmed: ["requested"], completed: ["confirmed"], no_show: ["confirmed"], cancelled: ["requested", "confirmed"] };
  if (!edges[input.to]) throw new DomainError(Codes.INVALID_INPUT, "Unknown tour status.", { field: "to" });
  const tour = await lockRow(uow.tx, "Tour", input.tourId);
  if (input.to === "confirmed" && tour.slotId) {
    await advisoryLock(uow.tx, `tour_slot:${tour.slotId}`);
    const slot = await uow.tx.tourSlot.findUnique({ where: { id: tour.slotId }, select: { capacity: true } });
    const confirmed = await uow.tx.tour.count({ where: { slotId: tour.slotId, status: "confirmed" } });
    if (slot && confirmed >= slot.capacity) throw new DomainError(Codes.PLACE_UNAVAILABLE, "That tour time is full.");
  }
  await casUpdate(uow, { model: "Tour", id: tour.id, version: input.expectedVersion, from: edges[input.to], to: input.to, actor, eventType: `tour.${input.to}`, reason: input.reason ?? null, data: { holdExpiresAt: null } });
  if (tour.leadId && (input.to === "confirmed" || input.to === "completed")) {
    const lead = await uow.tx.lead.findUnique({ where: { id: tour.leadId }, select: { status: true, version: true } });
    const target = input.to === "confirmed" ? "tour_scheduled" : "toured";
    if (lead && LEAD_EDGES[target].includes(lead.status)) await casUpdate(uow, { model: "Lead", id: tour.leadId, version: lead.version, from: [lead.status], to: target, actor, eventType: `lead.${target}`, metadata: { tourId: tour.id } });
  }
  return { tourId: tour.id, status: input.to };
}
var REFERRAL_EDGES = { clinical_review: ["received"], payer_check: ["clinical_review"], accepted: ["payer_check"], declined: ["received", "clinical_review", "payer_check"], withdrawn: ["received", "clinical_review", "payer_check", "accepted"] };
async function moveReferral(uow, actor, input) {
  const from = REFERRAL_EDGES[input.to];
  if (!from) throw new DomainError(Codes.INVALID_INPUT, input.to === "admitted" ? "A referral is admitted by the admission command." : "Unknown referral status.", { field: "to" });
  const referral = await lockRow(uow.tx, "Referral", input.referralId);
  if (input.to === "declined" && !input.declineReason) throw new DomainError(Codes.INVALID_INPUT, "Choose why the referral is declined.", { field: "declineReason" });
  let reservation = null;
  if (input.to === "accepted") {
    if (!input.bedId) throw new DomainError(Codes.GUARD_FAILED, "Choose the bed to hold for this referral.", { field: "bedId" });
    if (!referral.pasrrLevel1Id && ["medicaid", "medicaid_pending"].includes(String(referral.expectedPayer))) throw new DomainError(Codes.GUARD_FAILED, "Attach the PASRR Level I screen before accepting a Medicaid referral.", { field: "pasrrLevel1" });
    reservation = await reservePlace(uow, actor, { bedId: input.bedId, hours: input.reservationHours ?? 48, purpose: "referral", referralId: referral.id, prospectId: referral.prospectId, idempotencyKey: input.idempotencyKey });
  }
  if (input.to === "withdrawn" || input.to === "declined") {
    const holds = await uow.tx.placeReservation.findMany({ where: { referralId: referral.id, status: "active" }, select: { id: true } });
    for (const hold of holds) await endReservation(uow, actor, { reservationId: hold.id, to: "released", reason: `referral ${input.to}` });
  }
  await casUpdate(uow, { model: "Referral", id: referral.id, version: input.expectedVersion, from, to: input.to, actor, eventType: `referral.${input.to}`, data: input.to === "declined" ? { declineReason: input.declineReason } : {} });
  return { referralId: referral.id, status: input.to, reservationId: reservation?.reservationId ?? null };
}
async function addToWaitlist(uow, actor, input) {
  if (!input.leadId && !input.prospectId) throw new DomainError(Codes.INVALID_INPUT, "Choose the lead or prospect.", { field: "leadId" });
  const priority = { internal_transfer: 10, continuing_care: 20, date_order: 100, other: 100 }[input.priorityReason ?? "date_order"] ?? 100;
  const entry = await uow.tx.waitlistEntry.create({ data: { reference: await nextReference(uow.tx, "WL", uow.now), communityId: input.communityId, leadId: input.leadId ?? null, prospectId: input.prospectId ?? null, apartmentTypeId: input.apartmentTypeId ?? null, setting: input.setting, priority, priorityReason: input.priorityReason ?? "date_order", status: "active" } });
  auditCreate(uow, actor, "WaitlistEntry", entry.id, "waitlist.added", { reference: entry.reference, setting: input.setting, priority });
  return { waitlistEntryId: entry.id, reference: entry.reference };
}
async function offerWaitlistPlace(uow, actor, input) {
  const entry = await lockRow(uow.tx, "WaitlistEntry", input.waitlistEntryId);
  const hold = await reservePlace(uow, actor, { apartmentId: input.apartmentId, bedId: input.bedId, hours: input.hours, purpose: "waitlist_offer", waitlistEntryId: entry.id, prospectId: entry.prospectId, idempotencyKey: input.idempotencyKey });
  await casUpdate(uow, { model: "WaitlistEntry", id: entry.id, version: input.expectedVersion, from: ["active"], to: "offered", actor, eventType: "waitlist.offered", data: { offeredReservationId: hold.reservationId, offerExpiresAt: hold.expiresAt } });
  return { waitlistEntryId: entry.id, reservationId: hold.reservationId, offerExpiresAt: hold.expiresAt };
}
async function resolveWaitlistOffer(uow, actor, input) {
  if (!["accepted", "declined", "expired"].includes(input.to)) throw new DomainError(Codes.INVALID_INPUT, "Unknown outcome.", { field: "to" });
  const entry = await lockRow(uow.tx, "WaitlistEntry", input.waitlistEntryId);
  if (input.to === "expired" && entry.offerExpiresAt && entry.offerExpiresAt.getTime() > uow.now.getTime()) throw new DomainError(Codes.GUARD_FAILED, "The offer has not expired yet.");
  if (input.to !== "accepted" && entry.offeredReservationId) {
    const reservation = await uow.tx.placeReservation.findUnique({ where: { id: entry.offeredReservationId }, select: { status: true } });
    if (reservation?.status === "active") await endReservation(uow, actor, { reservationId: entry.offeredReservationId, to: "released", reason: `offer ${input.to}` });
  }
  await casUpdate(uow, { model: "WaitlistEntry", id: entry.id, version: input.expectedVersion, from: ["offered"], to: input.to, actor, eventType: `waitlist.${input.to}` });
  return { waitlistEntryId: entry.id, status: input.to };
}

// features/keystone/lib/portal.ts
var INVITE_DAYS = 7;
function authorityFor(roles, scope) {
  const allowed = SCOPE_AUTHORITY[scope];
  for (const basis of allowed) if (roles.includes(basis)) return basis;
  return null;
}
async function inviteRepresentative(uow, actor, input) {
  const rep = await uow.tx.representative.findUnique({ where: { id: input.representativeId }, include: { contact: true, resident: { select: { id: true, communityId: true, status: true } }, portalAccount: true } });
  if (!rep || rep.status !== "active") throw new DomainError(Codes.NOT_FOUND, "Active representative not found.");
  if (!rep.contact?.email) throw new DomainError(Codes.GUARD_FAILED, "The representative needs an email address for a portal invitation.", { field: "email" });
  if (rep.resident?.status === "deceased") throw new DomainError(Codes.GUARD_FAILED, "The resident is recorded as deceased.");
  let account = rep.portalAccount;
  if (account && (account.status === "active" || account.status === "suspended")) throw new DomainError(Codes.GUARD_FAILED, `This representative already has a ${account.status} portal account.`, { currentStatus: account.status });
  const expiresAt = new Date(uow.now.getTime() + INVITE_DAYS * 864e5);
  if (!account) {
    account = await uow.tx.portalAccount.findFirst({ where: { contactId: rep.contactId, status: { in: ["invited", "active"] } } });
  }
  if (!account) {
    account = await uow.tx.portalAccount.create({ data: { reference: await nextReference(uow.tx, "PRT", uow.now), contactId: rep.contactId, communityId: rep.resident?.communityId ?? null, status: "invited", invitedById: actorUserId(actor), invitationExpiresAt: expiresAt, representatives: { connect: [{ id: rep.id }] } } });
    auditCreate(uow, actor, "PortalAccount", account.id, "portal.invited", { reference: account.reference, representativeId: rep.id });
  } else {
    await uow.tx.portalAccount.update({ where: { id: account.id }, data: { representatives: { connect: [{ id: rep.id }] } } });
    if (account.status === "revoked") throw new DomainError(Codes.GUARD_FAILED, "This portal account was revoked. Create a new representative contact to invite again.", { currentStatus: account.status });
  }
  const token = createPublicToken("portal-invite", account.id, expiresAt.getTime());
  await uow.tx.portalAccount.update({ where: { id: account.id }, data: { invitationTokenHash: hashPublicToken(token), invitationExpiresAt: expiresAt } });
  uow.emit({ topic: "mail.portal_invitation", aggregateType: "PortalAccount", aggregateId: account.id, payload: { accountId: account.id, contactId: rep.contactId, token, expiresAt }, dedupeKey: `mail.portal_invitation:${account.id}:${expiresAt.getTime()}` });
  return { accountId: account.id, reference: account.reference, expiresAt };
}
async function acceptPortalInvitation(uow, input) {
  const payload = verifyPublicToken(input.token, "portal-invite");
  if (!payload) throw new DomainError(Codes.GUARD_FAILED, "This invitation link is invalid or has expired.");
  const account = await lockRow(uow.tx, "PortalAccount", payload.subjectId);
  if (account.status !== "invited" || !publicTokenMatches(input.token, account.invitationTokenHash)) throw new DomainError(Codes.GUARD_FAILED, "This invitation link was already used or replaced.");
  const contact = account.contactId ? await uow.tx.contact.findUnique({ where: { id: account.contactId }, select: { firstName: true, lastName: true, email: true } }) : null;
  if (!contact?.email) throw new DomainError(Codes.GUARD_FAILED, "The invitation has no email address.");
  const existing = await uow.tx.user.findUnique({ where: { email: contact.email } });
  if (existing && existing.kind !== "portal") throw new DomainError(Codes.GUARD_FAILED, "This email belongs to a staff account. Ask the community to invite a different address.");
  const portalRole = await uow.tx.role.findUnique({ where: { id: "seed_role_portal" }, select: { id: true } });
  const user = existing ?? await uow.tx.user.create({ data: { name: `${contact.firstName} ${contact.lastName}`.trim(), email: contact.email, password: input.passwordHash, kind: "portal", roleId: portalRole?.id ?? null, onboardingStatus: "dismissed" } });
  await uow.tx.portalAccount.updateMany({ where: { id: account.id, version: account.version, status: "invited" }, data: { status: "active", userId: user.id, acceptedAt: uow.now, invitationTokenHash: "", version: { increment: 1 } } });
  uow.audit({ eventType: "portal.activated", entityType: "PortalAccount", entityId: account.id, actorUserId: user.id, before: { status: "invited" }, after: { status: "active" } });
  return { accountId: account.id, status: "active" };
}
async function proposePortalScope(uow, actor, input) {
  if (actor.kind !== "user") throw new DomainError(Codes.NOT_AUTHORIZED, "Portal scopes are granted by people only.");
  if (!PORTAL_SCOPES.includes(input.scope)) throw new DomainError(Codes.INVALID_INPUT, "Unknown portal scope.", { field: "scope" });
  const rep = await uow.tx.representative.findUnique({ where: { id: input.representativeId }, select: { id: true, residentId: true, roles: true, self: true, status: true, portalAccountId: true } });
  if (!rep || rep.status !== "active") throw new DomainError(Codes.NOT_FOUND, "Active representative not found.");
  if (!rep.portalAccountId) throw new DomainError(Codes.GUARD_FAILED, "Invite the representative to the portal first.");
  const roles = [...Array.isArray(rep.roles) ? rep.roles : [], ...rep.self ? ["self"] : []];
  const basis = authorityFor(roles, input.scope);
  if (!basis) throw new DomainError(Codes.GUARD_FAILED, `This representative's authority (${roles.join(", ") || "none"}) does not cover ${input.scope.replaceAll("_", " ")}.`, { reason: "authority" });
  const existing = await uow.tx.portalScopeGrant.findFirst({ where: { accountId: rep.portalAccountId, residentId: rep.residentId, scope: input.scope, status: { in: ["proposed", "granted"] } }, select: { id: true, status: true } });
  if (existing) return { grantId: existing.id, status: existing.status, mfaRequired: MFA_SCOPES.has(input.scope) };
  const immediate = input.scope === "updates";
  const grant = await uow.tx.portalScopeGrant.create({ data: { accountId: rep.portalAccountId, residentId: rep.residentId, representativeId: rep.id, scope: input.scope, authorityBasis: basis, consentDocumentId: input.consentDocumentId ?? null, status: immediate ? "granted" : "proposed", proposedById: actor.userId, ...immediate ? { grantedById: actor.userId, grantedAt: uow.now } : {} } });
  auditCreate(uow, actor, "PortalScopeGrant", grant.id, immediate ? "portal.scope_granted" : "portal.scope_proposed", { scope: input.scope, authorityBasis: basis, representativeId: rep.id });
  return { grantId: grant.id, status: grant.status, mfaRequired: MFA_SCOPES.has(input.scope) };
}
async function grantPortalScope(uow, actor, input) {
  if (actor.kind !== "user") throw new DomainError(Codes.NOT_AUTHORIZED, "Portal scopes are granted by people only.");
  const grant = await lockRow(uow.tx, "PortalScopeGrant", input.grantId);
  if (grant.proposedById === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, "Someone other than the proposer must grant this scope.");
  if (input.expectedVersion != null && input.expectedVersion !== grant.version) throw new DomainError(Codes.STALE_STATE, "The grant changed since you loaded it.", { currentStatus: grant.status, currentVersion: grant.version });
  await casUpdate(uow, { model: "PortalScopeGrant", id: grant.id, version: grant.version, from: ["proposed"], to: "granted", actor, eventType: "portal.scope_granted", approverId: actor.userId, data: { grantedById: actor.userId, grantedAt: uow.now } });
  return { grantId: grant.id, status: "granted" };
}
async function revokePortalScope(uow, actor, input) {
  if (actor.kind !== "user") throw new DomainError(Codes.NOT_AUTHORIZED, "Portal scopes are revoked by people only.");
  if (!input.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Say why the scope is revoked.", { field: "reason" });
  const grant = await lockRow(uow.tx, "PortalScopeGrant", input.grantId);
  if (input.expectedVersion != null && input.expectedVersion !== grant.version) throw new DomainError(Codes.STALE_STATE, "The grant changed since you loaded it.", { currentStatus: grant.status, currentVersion: grant.version });
  await casUpdate(uow, { model: "PortalScopeGrant", id: grant.id, version: grant.version, from: ["proposed", "granted"], to: "revoked", actor, eventType: "portal.scope_revoked", reason: input.reason.trim(), data: { revokedAt: uow.now, revokeReason: input.reason.trim() } });
  if (grant.accountId) await uow.tx.portalAccount.update({ where: { id: grant.accountId }, data: { sessionEpoch: { increment: 1 }, version: { increment: 1 } } });
  return { grantId: grant.id, status: "revoked" };
}
async function setPortalAccountStatus(uow, actor, input) {
  if (actor.kind !== "user") throw new DomainError(Codes.NOT_AUTHORIZED, "Portal accounts are managed by people only.");
  if (!input.reason?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Say why.", { field: "reason" });
  const from = input.to === "suspended" ? ["active"] : input.to === "active" ? ["suspended"] : ["invited", "active", "suspended"];
  const account = await lockRow(uow.tx, "PortalAccount", input.accountId);
  if (input.expectedVersion != null && input.expectedVersion !== account.version) throw new DomainError(Codes.STALE_STATE, "The account changed since you loaded it.", { currentStatus: account.status, currentVersion: account.version });
  await casUpdate(uow, { model: "PortalAccount", id: account.id, version: account.version, from, to: input.to, actor, eventType: `portal.${input.to}`, reason: input.reason.trim(), data: { sessionEpoch: { increment: 1 }, ...input.to === "revoked" ? { invitationTokenHash: "" } : {} } });
  if (input.to === "revoked") {
    const grants = await uow.tx.portalScopeGrant.findMany({ where: { accountId: account.id, status: { in: ["proposed", "granted"] } }, select: { id: true, version: true, status: true } });
    for (const grant of grants) await casUpdate(uow, { model: "PortalScopeGrant", id: grant.id, version: grant.version, from: [grant.status], to: "revoked", actor, eventType: "portal.scope_revoked", reason: "account revoked", data: { revokedAt: uow.now, revokeReason: "account revoked" } });
  }
  return { accountId: account.id, status: input.to };
}

// features/keystone/lib/privacy.ts
var BREAK_GLASS_REASONS = ["emergency_care", "coverage_gap", "other"];
async function openBreakGlass(uow, actor, input) {
  if (actor.kind !== "user") throw new DomainError(Codes.NOT_AUTHORIZED, "Only a person can use break-glass.");
  if (!BREAK_GLASS_REASONS.includes(input.reason)) throw new DomainError(Codes.INVALID_INPUT, "Choose a reason.", { field: "reason" });
  if (!input.note?.trim() || input.note.trim().length < 10) throw new DomainError(Codes.INVALID_INPUT, "Describe the situation (at least 10 characters).", { field: "note" });
  const settings = await uow.tx.operatorSettings.findUnique({ where: { id: 1 }, select: { breakGlassMaxHours: true } });
  const max = settings?.breakGlassMaxHours ?? 4;
  const hours2 = input.hours ?? max;
  if (!Number.isInteger(hours2) || hours2 < 1 || hours2 > max) throw new DomainError(Codes.INVALID_INPUT, `Break-glass lasts 1 to ${max} hours.`, { field: "hours" });
  const resident = await uow.tx.resident.findUnique({ where: { id: input.residentId }, select: { id: true } });
  if (!resident) throw new DomainError(Codes.NOT_FOUND, "Resident not found.");
  const open = await uow.tx.breakGlassGrant.findFirst({ where: { userId: actor.userId, residentId: input.residentId, status: "active", expiresAt: { gt: uow.now } }, select: { id: true, expiresAt: true } });
  if (open) return { grantId: open.id, expiresAt: open.expiresAt, reused: true };
  const grant = await uow.tx.breakGlassGrant.create({ data: { userId: actor.userId, residentId: input.residentId, reason: input.reason, note: input.note.trim(), requestedAt: uow.now, expiresAt: new Date(uow.now.getTime() + hours2 * 36e5), status: "active" } });
  auditCreate(uow, actor, "BreakGlassGrant", grant.id, "break_glass.opened", { residentId: input.residentId, reason: input.reason, hours: hours2 });
  uow.emit({ topic: "privacy.break_glass_opened", aggregateType: "BreakGlassGrant", aggregateId: grant.id, payload: { grantId: grant.id }, dedupeKey: `privacy.break_glass:${grant.id}` });
  return { grantId: grant.id, expiresAt: grant.expiresAt, reused: false };
}
async function endBreakGlass(uow, actor, input) {
  const grant = await lockRow(uow.tx, "BreakGlassGrant", input.grantId);
  if (actor.kind === "user" && grant.userId !== actor.userId) throw new DomainError(Codes.NOT_AUTHORIZED, "Only the holder can end this grant.");
  await casUpdate(uow, { model: "BreakGlassGrant", id: grant.id, version: grant.version, from: ["active"], to: "ended", actor, eventType: "break_glass.ended", data: { endedAt: uow.now } });
  return { grantId: grant.id, status: "ended" };
}
async function reviewBreakGlass(uow, actor, input) {
  if (actor.kind !== "user") throw new DomainError(Codes.NOT_AUTHORIZED, "Only a person can review break-glass.");
  if (input.outcome !== "reviewed_ok" && input.outcome !== "reviewed_violation") throw new DomainError(Codes.INVALID_INPUT, "Choose an outcome.", { field: "outcome" });
  if (!input.note?.trim()) throw new DomainError(Codes.INVALID_INPUT, "Add a review note.", { field: "note" });
  const grant = await lockRow(uow.tx, "BreakGlassGrant", input.grantId);
  if (grant.userId === actor.userId) throw new DomainError(Codes.SELF_APPROVAL, "Someone else must review your own break-glass use.");
  if (input.expectedVersion != null && input.expectedVersion !== grant.version) throw new DomainError(Codes.STALE_STATE, "The grant changed since you loaded it.", { currentStatus: grant.status, currentVersion: grant.version });
  const from = grant.status === "active" && grant.expiresAt && grant.expiresAt.getTime() <= uow.now.getTime() ? "active" : "ended";
  await casUpdate(uow, { model: "BreakGlassGrant", id: grant.id, version: grant.version, from: [from], to: input.outcome, actor, eventType: `break_glass.${input.outcome}`, reason: input.note.trim(), data: { reviewedById: actor.userId, reviewNote: input.note.trim(), ...from === "active" ? { endedAt: grant.expiresAt } : {} } });
  if (input.outcome === "reviewed_violation") uow.emit({ topic: "privacy.break_glass_violation", aggregateType: "BreakGlassGrant", aggregateId: grant.id, payload: { grantId: grant.id }, dedupeKey: `privacy.violation:${grant.id}` });
  return { grantId: grant.id, status: input.outcome };
}

// features/keystone/lib/publicRateLimit.ts
var import_node_crypto9 = require("node:crypto");

// features/keystone/security/internalIdentity.ts
var import_node_crypto8 = require("node:crypto");
var INTERNAL_IDENTITY_MAX_AGE_MS = 9e4;
function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && (0, import_node_crypto8.timingSafeEqual)(leftBuffer, rightBuffer);
}
function verifiedInternalIdentity(headers, socketAddress, secret2, now) {
  const loopback = /^(?:127\.|::1$|::ffff:127\.)/.test(String(socketAddress || ""));
  if (!loopback || secret2.length < 32) return null;
  const identity = String(headers["x-openfront-client-identity"] || "");
  const timestamp9 = String(headers["x-openfront-client-timestamp"] || "");
  const signature = String(headers["x-openfront-client-signature"] || "");
  if (!/^[a-f0-9]{64}$/.test(identity) || !/^\d{10}$/.test(timestamp9) || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const age = Math.abs(now - Number(timestamp9) * 1e3);
  if (!Number.isFinite(age) || age > INTERNAL_IDENTITY_MAX_AGE_MS) return null;
  const expected = (0, import_node_crypto8.createHmac)("sha256", secret2).update(`${timestamp9}:${identity}`).digest("hex");
  return safeEqual(signature, expected) ? `forwarded:${identity}` : null;
}

// features/keystone/lib/publicRateLimit.ts
function signingSecret() {
  const value = process.env.RATE_LIMIT_SECRET?.trim() || derivedSessionSecret("rate-limit");
  if (Buffer.byteLength(value, "utf8") < 32) throw new Error("Rate-limit secret must be at least 32 bytes.");
  return value;
}
var normalized = (value) => value.trim().replace(/^::ffff:/, "").slice(0, 200) || "unknown";
function requesterAddress(req, trustedProxyHops = Number(process.env.TRUSTED_PROXY_HOPS ?? 0)) {
  if (!req) return null;
  const internal = verifiedInternalIdentity(req.headers ?? {}, req.socket?.remoteAddress, String(process.env.SESSION_SECRET || ""), Date.now());
  if (internal) return internal;
  const remote = normalized(req.socket?.remoteAddress ?? "unknown");
  const header = req.headers["x-forwarded-for"];
  const forwarded = (Array.isArray(header) ? header.join(",") : header ?? "").split(",").map(normalized).filter(Boolean);
  const hops = Number.isInteger(trustedProxyHops) ? Math.max(0, Math.min(10, trustedProxyHops)) : 0;
  if (hops === 0 || forwarded.length === 0) return remote;
  const chain = [...forwarded, remote];
  return chain[Math.max(0, chain.length - 1 - hops)];
}
async function consumeRateLimit(prisma, input) {
  if (!input.address) return { count: 0, limited: false };
  const now = input.now ?? /* @__PURE__ */ new Date();
  const windowMs = Math.max(6e4, Math.min(24 * 36e5, Math.floor(input.windowMs)));
  const windowStartMs = Math.floor(now.getTime() / windowMs) * windowMs;
  const identity = (0, import_node_crypto9.createHmac)("sha256", signingSecret()).update(normalized(input.address)).digest("hex");
  const bucketKey = (0, import_node_crypto9.createHmac)("sha256", signingSecret()).update(`${input.operation}:${windowStartMs}:${identity}`).digest("hex");
  const row = await prisma.requestRateLimitBucket.upsert({
    where: { bucketKey },
    create: { bucketKey, count: 1, windowStartsAt: new Date(windowStartMs), expiresAt: new Date(windowStartMs + windowMs + 36e5) },
    update: { count: { increment: 1 } },
    select: { count: true }
  });
  return { count: row.count, limited: row.count > input.limit };
}
async function enforceRateLimit(context, operation, limit, windowMs = 10 * 6e4) {
  const result = await consumeRateLimit(context.prisma, { address: requesterAddress(context.req), operation, limit, windowMs });
  if (result.limited) throw new DomainError(Codes.RATE_LIMITED, "Too many requests. Please wait and try again.");
  return result;
}

// features/keystone/mutations/frontOfHouse.ts
var reservePlaceMutation = (_, args, context) => runDomain(context, args, { name: "place.reserve", permissions: ["canAdmitDischarge", "canManageSales"], community: (tx) => communityOf.place(tx, args) }, (uow, actor) => reservePlace(uow, actor, args));
var releaseReservation = (_, args, context) => runDomain(context, args, { name: "place.release", permissions: ["canAdmitDischarge", "canManageSales"], community: (tx) => communityOf.reservation(tx, args.reservationId) }, (uow, actor) => endReservation(uow, actor, { ...args, to: "released" }));
var markPlaceReadyMutation = (_, args, context) => runDomain(context, args, { name: "place.ready", permissions: ["canManagePlaces", "canRecordCensus"], community: (tx) => communityOf.place(tx, args) }, (uow, actor) => markPlaceReady(uow, actor, args));
var setPlaceServiceMutation = (_, args, context) => runDomain(context, args, { name: "place.service", permissions: ["canManagePlaces"], community: (tx) => communityOf.place(tx, args) }, (uow, actor) => setPlaceService(uow, actor, args));
var recomputeAvailabilityMutation = (_, args, context) => runDomain(context, args, { name: "place.availability", permissions: ["canManageStorefront", "canManagePlaces"], community: async () => args.communityId }, (uow) => recomputeAvailability(uow, args.communityId).then((snapshots) => ({ snapshots })));
async function publicCall(context, bucket, limit, work) {
  await enforceRateLimit(context, bucket, limit, 60 * 6e4);
  return runInTransaction(context.prisma, work);
}
var submitInquiryMutation = (_, args, context) => publicCall(context, `inquiry:${args.input?.communitySlug ?? ""}`, 10, (uow) => submitInquiry(uow, args.input));
var requestTourMutation = (_, args, context) => publicCall(context, `tour:${args.input?.communitySlug ?? ""}`, 6, (uow) => requestTour(uow, args.input));
var cancelTourByToken = (_, args, context) => publicCall(context, "tour-manage", 20, (uow) => cancelTourWithToken(uow, args));
var acceptPortalInvitationMutation = async (_, args, context) => {
  if (typeof args.password !== "string" || args.password.length < 12) throw new DomainError(Codes.INVALID_INPUT, "Use at least 12 characters.", { field: "password" });
  const { hash } = await import("bcryptjs");
  const passwordHash = await hash(args.password, 10);
  return publicCall(context, "portal-invite", 10, (uow) => acceptPortalInvitation(uow, { token: args.token, passwordHash }));
};
var recordInquiryMutation = (_, args, context) => runDomain(context, args, { name: "sales.inquiry", permissions: ["canManageSales"], community: async () => args.input.communityId }, (uow, actor) => recordInquiry(uow, actor, args.input));
var moveLeadMutation = (_, args, context) => runDomain(context, args, { name: "sales.lead", permissions: ["canManageSales"], community: (tx) => communityOf.lead(tx, args.leadId) }, (uow, actor) => moveLead(uow, actor, args));
var logSalesActivityMutation = (_, args, context) => runDomain(context, args, { name: "sales.activity", permissions: ["canManageSales"], community: (tx) => communityOf.lead(tx, args.leadId) }, (uow, actor) => logSalesActivity(uow, actor, args));
var moveTourMutation = (_, args, context) => runDomain(context, args, { name: "sales.tour", permissions: ["canManageSales"], community: (tx) => communityOf.tour(tx, args.tourId) }, (uow, actor) => moveTour(uow, actor, args));
var moveReferralMutation = (_, args, context) => runDomain(context, args, { name: "sales.referral", permissions: ["canAdmitDischarge"], community: (tx) => communityOf.referral(tx, args.referralId) }, (uow, actor) => moveReferral(uow, actor, args));
var addToWaitlistMutation = (_, args, context) => runDomain(context, args, { name: "sales.waitlist_add", permissions: ["canManageSales"], community: async () => args.communityId }, (uow, actor) => addToWaitlist(uow, actor, args));
var offerWaitlistPlaceMutation = (_, args, context) => runDomain(context, args, { name: "sales.waitlist_offer", permissions: ["canManageSales"], humanOnly: true, community: (tx) => communityOf.waitlist(tx, args.waitlistEntryId) }, (uow, actor) => offerWaitlistPlace(uow, actor, args));
var resolveWaitlistOfferMutation = (_, args, context) => runDomain(context, args, { name: "sales.waitlist_resolve", permissions: ["canManageSales"], community: (tx) => communityOf.waitlist(tx, args.waitlistEntryId) }, (uow, actor) => resolveWaitlistOffer(uow, actor, args));
var invitePortalRepresentative = (_, args, context) => runDomain(context, args, { name: "portal.invite", permissions: ["canManageRepresentatives"], humanOnly: true, community: (tx) => communityOf.representative(tx, args.representativeId) }, (uow, actor) => inviteRepresentative(uow, actor, args));
var proposePortalScopeMutation = (_, args, context) => runDomain(context, args, { name: "portal.scope_propose", permissions: ["canManageRepresentatives"], humanOnly: true, community: (tx) => communityOf.representative(tx, args.representativeId) }, (uow, actor) => proposePortalScope(uow, actor, args));
var grantPortalScopeMutation = (_, args, context) => runDomain(context, args, { name: "portal.scope_grant", permissions: ["canApprovePortalScopes"], humanOnly: true, community: (tx) => communityOf.portalGrant(tx, args.grantId) }, (uow, actor) => grantPortalScope(uow, actor, args));
var revokePortalScopeMutation = (_, args, context) => runDomain(context, args, { name: "portal.scope_revoke", permissions: ["canManageRepresentatives", "canApprovePortalScopes"], humanOnly: true, community: (tx) => communityOf.portalGrant(tx, args.grantId) }, (uow, actor) => revokePortalScope(uow, actor, args));
var setPortalAccountStatusMutation = (_, args, context) => runDomain(context, args, { name: "portal.account_status", permissions: ["canManageRepresentatives"], humanOnly: true, community: (tx) => communityOf.portalAccount(tx, args.accountId) }, (uow, actor) => setPortalAccountStatus(uow, actor, args));
var openBreakGlassMutation = (_, args, context) => runDomain(context, args, { name: "privacy.break_glass_open", permissions: ["canBreakGlass"], humanOnly: true }, (uow, actor) => openBreakGlass(uow, actor, args));
var endBreakGlassMutation = (_, args, context) => runDomain(context, args, { name: "privacy.break_glass_end", permissions: ["canBreakGlass"], humanOnly: true }, (uow, actor) => endBreakGlass(uow, actor, args));
var reviewBreakGlassMutation = (_, args, context) => runDomain(context, args, { name: "privacy.break_glass_review", permissions: ["canReviewBreakGlass"], humanOnly: true }, (uow, actor) => reviewBreakGlass(uow, actor, args));

// features/keystone/mutations/reads.ts
var import_node_crypto11 = require("node:crypto");

// features/keystone/security/phiReadAudit.ts
var import_node_crypto10 = require("node:crypto");
var import_graphql2 = require("graphql");
function referenceToken(secret2, resourceType, id) {
  if (!secret2 || secret2.length < 32) throw new Error("A strong PHI audit reference secret is required");
  return (0, import_node_crypto10.createHmac)("sha256", secret2).update(`${resourceType}\0${id}`).digest("hex");
}
function phiReferenceSecret() {
  const configured = process.env.PHI_AUDIT_SECRET?.trim();
  if (configured) return configured;
  const session = process.env.SESSION_SECRET?.trim() ?? "";
  if (!session) return "";
  return (0, import_node_crypto10.createHmac)("sha256", session).update("openfront-senior-care:phi-audit").digest("hex");
}

// features/keystone/mutations/reads.ts
async function reader(context, permissions2) {
  const actor = await actorFor(context);
  if (actor.kind === "agent") requireScope(actor, "census.read");
  else requirePermission(actor, ...permissions2);
  const names = actor.kind === "agent" ? actor.scopes.has("resident.read_demographics") : can(actor, "canReadResidentDemographics");
  return { actor, names };
}
async function auditRead(context, actor, operationName, residentIds) {
  if (!residentIds.length) return;
  const secret2 = phiReferenceSecret();
  if (secret2.length < 32) throw new DomainError(Codes.GUARD_FAILED, "Protected data auditing is unavailable.");
  const references = residentIds.slice(0, 2e3).map((id) => referenceToken(secret2, "Resident", id));
  await context.prisma.phiReadAudit.create({
    data: {
      occurredAt: /* @__PURE__ */ new Date(),
      actorReference: referenceToken(secret2, "principal", principalKey(actor)),
      actorKind: actor.kind,
      operationType: "query",
      operationName,
      rootFields: [operationName],
      selectedFields: ["Resident.firstName", "Resident.lastName"],
      selectionDigest: (0, import_node_crypto11.createHash)("sha256").update(`${operationName}:names`).digest("hex"),
      resultReferenceDigest: (0, import_node_crypto11.createHash)("sha256").update(references.join(",")).digest("hex"),
      resourceReferences: references,
      purpose: mcpSessionMarker(context.session) || actor.kind === "agent" ? "operations" : "treatment_operations",
      breakGlass: false,
      resultCount: residentIds.length,
      success: true
    }
  });
}
async function censusSummary(_root, args, context) {
  const { actor } = await reader(context, ["canRecordCensus", "canAdmitDischarge", "canReadResidentDemographics", "canManageSales"]);
  return context.prisma.$transaction(async (tx) => {
    await assertCommunityAccess(tx, actor, args.communityId);
    const community = await tx.community.findUnique({ where: { id: args.communityId }, select: { timeZone: true, name: true } });
    const date2 = args.date ?? localDate(community.timeZone, /* @__PURE__ */ new Date());
    const derived = await deriveCensusDay(tx, args.communityId, date2);
    const [beds, apartments] = await Promise.all([
      tx.bed.groupBy({ by: ["status"], where: { licensed: true, room: { unit: { communityId: args.communityId } } }, _count: { _all: true } }),
      tx.apartment.groupBy({ by: ["status"], where: { unit: { communityId: args.communityId } }, _count: { _all: true } })
    ]);
    const counts = (rows) => Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
    return { community: community.name, date: date2, timeZone: community.timeZone, totals: derived.totals, beds: counts(beds), apartments: counts(apartments), closedThrough: await closedThrough(tx, args.communityId) };
  }, { timeout: 15e3 });
}
async function bedBoard(_root, args, context) {
  const { actor, names } = await reader(context, ["canRecordCensus", "canAdmitDischarge", "canManagePlaces"]);
  const rows = await context.prisma.$transaction(async (tx) => {
    await assertCommunityAccess(tx, actor, args.communityId);
    const units = await tx.unit.findMany({
      where: { communityId: args.communityId, ...args.unitId ? { id: args.unitId } : {} },
      orderBy: { code: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        setting: true,
        specialty: true,
        secured: true,
        rooms: { orderBy: { number: "asc" }, select: { number: true, kind: true, beds: { orderBy: { label: "asc" }, select: { id: true, label: true, status: true, version: true, certification: true, statusReason: true } } } },
        apartments: { orderBy: { number: "asc" }, select: { id: true, number: true, status: true, version: true, capacity: true, occupantCount: true, apartmentType: { select: { name: true } } } }
      }
    });
    const stays = await tx.stay.findMany({
      where: { communityId: args.communityId, status: "admitted" },
      select: { id: true, reference: true, presence: true, currentBedId: true, heldBedId: true, currentApartmentId: true, version: true, residentId: true, resident: { select: { firstName: true, lastName: true, preferredName: true } } }
    });
    return { units, stays };
  }, { timeout: 15e3 });
  const byBed = /* @__PURE__ */ new Map();
  const byApartment = /* @__PURE__ */ new Map();
  for (const stay of rows.stays) {
    const who = { stayId: stay.id, stayReference: stay.reference, presence: stay.presence, version: stay.version, ...names ? { residentId: stay.residentId, name: `${stay.resident?.preferredName || stay.resident?.firstName} ${stay.resident?.lastName}` } : {} };
    if (stay.currentBedId) byBed.set(stay.currentBedId, who);
    if (stay.heldBedId) byBed.set(stay.heldBedId, { ...who, held: true });
    if (stay.currentApartmentId) byApartment.set(stay.currentApartmentId, [...byApartment.get(stay.currentApartmentId) ?? [], who]);
  }
  if (names) await auditRead(context, actor, "bedBoard", rows.stays.map((stay) => stay.residentId).filter(Boolean));
  return rows.units.map((unit) => ({
    id: unit.id,
    name: unit.name,
    code: unit.code,
    setting: unit.setting,
    specialty: unit.specialty,
    secured: unit.secured,
    beds: unit.rooms.flatMap((room) => room.beds.map((bed) => ({ ...bed, room: room.number, roomKind: room.kind, occupant: byBed.get(bed.id) ?? null }))),
    apartments: unit.apartments.map((apartment) => ({ ...apartment, type: apartment.apartmentType?.name ?? null, occupants: byApartment.get(apartment.id) ?? [] }))
  }));
}
async function residentRoster(_root, args, context) {
  const { actor, names } = await reader(context, ["canReadResidentDemographics"]);
  if (!names) throw new DomainError(Codes.NOT_AUTHORIZED, "Reading the roster needs resident demographics access.");
  const status = args.status && ["admitted", "discharged", "deceased", "pre_admit"].includes(args.status) ? args.status : "admitted";
  const stays = await context.prisma.$transaction(async (tx) => {
    await assertCommunityAccess(tx, actor, args.communityId);
    return tx.stay.findMany({
      where: { communityId: args.communityId, status },
      orderBy: { admittedAt: "desc" },
      take: 500,
      select: {
        id: true,
        reference: true,
        setting: true,
        status: true,
        presence: true,
        admittedAt: true,
        dischargedAt: true,
        version: true,
        resident: { select: { id: true, reference: true, firstName: true, lastName: true, preferredName: true } },
        currentBed: { select: { label: true } },
        heldBed: { select: { label: true } },
        currentApartment: { select: { number: true } },
        coverages: { where: { rank: "primary", endDate: null }, take: 1, select: { payer: { select: { name: true, kind: true } } } }
      }
    });
  }, { timeout: 15e3 });
  await auditRead(context, actor, "residentRoster", stays.map((stay) => stay.resident?.id).filter(Boolean));
  return stays.map((stay) => ({
    stayId: stay.id,
    stayReference: stay.reference,
    setting: stay.setting,
    status: stay.status,
    presence: stay.presence,
    admittedAt: stay.admittedAt,
    dischargedAt: stay.dischargedAt,
    version: stay.version,
    residentId: stay.resident?.id,
    residentReference: stay.resident?.reference,
    name: `${stay.resident?.preferredName || stay.resident?.firstName} ${stay.resident?.lastName}`,
    place: stay.currentBed?.label ?? (stay.currentApartment ? `Apt ${stay.currentApartment.number}` : stay.heldBed ? `${stay.heldBed.label} (held)` : null),
    payer: stay.coverages?.[0]?.payer ?? null
  }));
}

// features/keystone/mutations/index.ts
var graphql = String.raw;
function extendGraphqlSchema(baseSchema) {
  return (0, import_schema.mergeSchemas)({
    schemas: [baseSchema],
    typeDefs: graphql`
      scalar JSON
      type Query {
        redirectToInit: Boolean
        verifyAuditChain: JSON
        verifyStay(stayId: ID!): JSON
        censusSummary(communityId: ID!, date: String): JSON
        bedBoard(communityId: ID!, unitId: ID): JSON
        residentRoster(communityId: ID!, status: String): JSON
      }
      input UserUpdateProfileInput { name: String, email: String, password: String, onboardingStatus: String }
      type Mutation {
        updateActiveUser(data: UserUpdateProfileInput!): User
        loadOperatorSetup(idempotencyKey: String!): JSON
        decideApprovalRequest(requestId: ID!, decision: String!, reason: String, expectedVersion: Int!, idempotencyKey: String!): JSON
        cancelApprovalRequest(requestId: ID!, expectedVersion: Int!, reason: String, idempotencyKey: String!): JSON
        requestOperatorControls(changes: JSON!, reason: String!, idempotencyKey: String!): JSON

        admitResident(input: JSON!, idempotencyKey: String!): JSON
        changeRoom(stayId: ID!, toBedId: ID, toApartmentId: ID, effectiveAt: String!, observedAt: String, reason: String, companionRelationship: String, reservationId: ID, expectedVersion: Int, idempotencyKey: String!): JSON
        startLeave(stayId: ID!, leaveKind: String!, holdElected: Boolean!, holdPaidBy: String, facilityInitiated: Boolean!, effectiveAt: String!, observedAt: String, destination: String, noticeAtTransfer: JSON, expectedVersion: Int, idempotencyKey: String!): JSON
        releaseBedHold(stayId: ID!, effectiveAt: String!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        endLeave(stayId: ID!, effectiveAt: String!, observedAt: String, toBedId: ID, toApartmentId: ID, reservationId: ID, expectedVersion: Int, idempotencyKey: String!): JSON
        dischargeResident(stayId: ID!, disposition: String!, initiatedBy: String!, effectiveAt: String!, observedAt: String, noticeException: String, expectedVersion: Int, idempotencyKey: String!): JSON
        recordDeath(stayId: ID!, effectiveAt: String!, pronouncedBy: String!, observedAt: String, expectedVersion: Int, idempotencyKey: String!): JSON
        recordNotice(input: JSON!, idempotencyKey: String!): JSON
        correctCensus(input: JSON!, idempotencyKey: String!): JSON
        snapshotCensusDay(communityId: ID!, date: String!, idempotencyKey: String!): JSON
        signOffCensusDay(communityId: ID!, date: String!, note: String, idempotencyKey: String!): JSON

        reservePlace(bedId: ID, apartmentId: ID, hours: Int!, purpose: String!, prospectId: ID, referralId: ID, waitlistEntryId: ID, idempotencyKey: String!): JSON
        releaseReservation(reservationId: ID!, reason: String, expectedVersion: Int, idempotencyKey: String!): JSON
        markPlaceReady(bedId: ID, apartmentId: ID, note: String, expectedVersion: Int, idempotencyKey: String!): JSON
        setPlaceService(bedId: ID, apartmentId: ID, inService: Boolean!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        recomputeAvailability(communityId: ID!, idempotencyKey: String!): JSON

        submitInquiry(input: JSON!): JSON
        requestTour(input: JSON!): JSON
        cancelTourByToken(token: String!, reason: String): JSON
        acceptPortalInvitation(token: String!, password: String!): JSON
        recordInquiry(input: JSON!, idempotencyKey: String!): JSON
        moveLead(leadId: ID!, to: String!, lostReason: String, note: String, expectedVersion: Int!, idempotencyKey: String!): JSON
        logSalesActivity(leadId: ID!, kind: String!, summary: String!, idempotencyKey: String!): JSON
        moveTour(tourId: ID!, to: String!, reason: String, expectedVersion: Int!, idempotencyKey: String!): JSON
        moveReferral(referralId: ID!, to: String!, declineReason: String, bedId: ID, reservationHours: Int, expectedVersion: Int!, idempotencyKey: String!): JSON
        addToWaitlist(communityId: ID!, leadId: ID, prospectId: ID, apartmentTypeId: ID, setting: String!, priorityReason: String, idempotencyKey: String!): JSON
        offerWaitlistPlace(waitlistEntryId: ID!, apartmentId: ID, bedId: ID, hours: Int!, expectedVersion: Int!, idempotencyKey: String!): JSON
        resolveWaitlistOffer(waitlistEntryId: ID!, to: String!, expectedVersion: Int!, idempotencyKey: String!): JSON

        invitePortalRepresentative(representativeId: ID!, idempotencyKey: String!): JSON
        proposePortalScope(representativeId: ID!, scope: String!, consentDocumentId: ID, idempotencyKey: String!): JSON
        grantPortalScope(grantId: ID!, expectedVersion: Int, idempotencyKey: String!): JSON
        revokePortalScope(grantId: ID!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON
        setPortalAccountStatus(accountId: ID!, to: String!, reason: String!, expectedVersion: Int, idempotencyKey: String!): JSON

        openBreakGlass(residentId: ID!, reason: String!, note: String!, hours: Int, idempotencyKey: String!): JSON
        endBreakGlass(grantId: ID!, idempotencyKey: String!): JSON
        reviewBreakGlass(grantId: ID!, outcome: String!, note: String!, expectedVersion: Int, idempotencyKey: String!): JSON
      }
    `,
    resolvers: {
      Query: {
        redirectToInit: redirectToInit_default,
        verifyAuditChain: op(verifyAuditChain2),
        verifyStay: op(verifyStay),
        censusSummary: op(censusSummary),
        bedBoard: op(bedBoard),
        residentRoster: op(residentRoster)
      },
      Mutation: {
        updateActiveUser: updateActiveUser_default,
        loadOperatorSetup: op(loadOperatorSetup),
        decideApprovalRequest: op(decideApprovalRequest),
        cancelApprovalRequest: op(cancelApprovalRequest),
        requestOperatorControls: op(requestOperatorControls),
        admitResident: op(admitResidentMutation),
        changeRoom: op(changeRoomMutation),
        startLeave: op(startLeaveMutation),
        releaseBedHold: op(releaseBedHoldMutation),
        endLeave: op(endLeaveMutation),
        dischargeResident: op(dischargeResidentMutation),
        recordDeath: op(recordDeathMutation),
        recordNotice: op(recordNoticeMutation),
        correctCensus: op(correctCensus),
        snapshotCensusDay: op(snapshotCensusDayMutation),
        signOffCensusDay: op(signOffCensusDayMutation),
        reservePlace: op(reservePlaceMutation),
        releaseReservation: op(releaseReservation),
        markPlaceReady: op(markPlaceReadyMutation),
        setPlaceService: op(setPlaceServiceMutation),
        recomputeAvailability: op(recomputeAvailabilityMutation),
        submitInquiry: op(submitInquiryMutation),
        requestTour: op(requestTourMutation),
        cancelTourByToken: op(cancelTourByToken),
        acceptPortalInvitation: op(acceptPortalInvitationMutation),
        recordInquiry: op(recordInquiryMutation),
        moveLead: op(moveLeadMutation),
        logSalesActivity: op(logSalesActivityMutation),
        moveTour: op(moveTourMutation),
        moveReferral: op(moveReferralMutation),
        addToWaitlist: op(addToWaitlistMutation),
        offerWaitlistPlace: op(offerWaitlistPlaceMutation),
        resolveWaitlistOffer: op(resolveWaitlistOfferMutation),
        invitePortalRepresentative: op(invitePortalRepresentative),
        proposePortalScope: op(proposePortalScopeMutation),
        grantPortalScope: op(grantPortalScopeMutation),
        revokePortalScope: op(revokePortalScopeMutation),
        setPortalAccountStatus: op(setPortalAccountStatusMutation),
        openBreakGlass: op(openBreakGlassMutation),
        endBreakGlass: op(endBreakGlassMutation),
        reviewBreakGlass: op(reviewBreakGlassMutation)
      }
    }
  });
}

// features/keystone/lib/mail.ts
var import_nodemailer = require("nodemailer");
function getBaseUrlForEmails() {
  if (process.env.SMTP_STORE_LINK) {
    return process.env.SMTP_STORE_LINK;
  }
  console.warn("SMTP_STORE_LINK not set. Please add SMTP_STORE_LINK to your environment variables for email links to work properly.");
  return "";
}
var transport = (0, import_nodemailer.createTransport)({
  // @ts-ignore
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});
function passwordResetEmail({ url }) {
  const backgroundColor = "#f9f9f9";
  const textColor = "#444444";
  const mainBackgroundColor = "#ffffff";
  const buttonBackgroundColor = "#346df1";
  const buttonBorderColor = "#346df1";
  const buttonTextColor = "#ffffff";
  return `
    <body style="background: ${backgroundColor};">
      <table width="100%" border="0" cellspacing="20" cellpadding="0" style="background: ${mainBackgroundColor}; max-width: 600px; margin: auto; border-radius: 10px;">
        <tr>
          <td align="center" style="padding: 10px 0px 0px 0px; font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            Please click below to reset your password
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 5px;" bgcolor="${buttonBackgroundColor}"><a href="${url}" target="_blank" style="font-size: 18px; font-family: Helvetica, Arial, sans-serif; color: ${buttonTextColor}; text-decoration: none; border-radius: 5px; padding: 10px 20px; border: 1px solid ${buttonBorderColor}; display: inline-block; font-weight: bold;">Reset Password</a></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding: 0px 0px 10px 0px; font-size: 16px; line-height: 22px; font-family: Helvetica, Arial, sans-serif; color: ${textColor};">
            If you did not request this email you can safely ignore it.
          </td>
        </tr>
      </table>
    </body>
  `;
}
async function sendPasswordResetEmail(resetToken, to, baseUrl) {
  const frontendUrl = baseUrl || getBaseUrlForEmails();
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}/dashboard/reset?token=${resetToken}`
    })
  });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.log(`\u{1F4E7} Message Sent!  Preview it at ${(0, import_nodemailer.getTestMessageUrl)(info)}`);
  }
}

// features/keystone/prismaConstraints.ts
var COMPOUND_UNIQUES = {
  HolidayDate: ['@@unique([calendarId, date], map: "HolidayDate_calendar_date_key")'],
  StaffAssignment: ['@@unique([userId, communityId], map: "StaffAssignment_user_community_key")'],
  Building: ['@@unique([communityId, name], map: "Building_community_name_key")'],
  Unit: ['@@unique([communityId, code], map: "Unit_community_code_key")'],
  Room: ['@@unique([unitId, number], map: "Room_unit_number_key")'],
  Bed: ['@@unique([roomId, label], map: "Bed_room_label_key")'],
  Apartment: ['@@unique([unitId, number], map: "Apartment_unit_number_key")'],
  RegulatoryObligation: ['@@unique([packId, code], map: "RegulatoryObligation_pack_code_key")'],
  ComplianceClock: ['@@unique([obligationCode, subjectType, subjectId, occurrenceKey, supersedesId], map: "ComplianceClock_occurrence_key")'],
  CensusEvent: ['@@unique([stayId, seq], map: "CensusEvent_stay_seq_key")']
};
function addDatabaseConstraints(schema) {
  for (const [modelName, directives] of Object.entries(COMPOUND_UNIQUES)) {
    const pattern = new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`);
    const model = schema.match(pattern)?.[0];
    if (!model) throw new Error(`Generated Prisma schema is missing ${modelName}`);
    const missing = directives.filter((directive) => !model.includes(directive));
    if (!missing.length) continue;
    schema = schema.replace(model, model.replace(/\n\}$/, `
${missing.map((directive) => `  ${directive}`).join("\n")}
}`));
  }
  return schema;
}

// features/keystone/index.ts
var databaseURL = process.env.DATABASE_URL || "file:./keystone.db";
var sessionConfig = {
  maxAge: 60 * 60 * 24 * 360,
  // How long they stay signed in?
  secret: process.env.SESSION_SECRET || "this secret should only be used in testing"
};
var {
  S3_BUCKET_NAME: bucketName = "keystone-test",
  S3_REGION: region = "ap-southeast-2",
  S3_ACCESS_KEY_ID: accessKeyId = "keystone",
  S3_SECRET_ACCESS_KEY: secretAccessKey = "keystone",
  S3_ENDPOINT: endpoint = "https://sfo3.digitaloceanspaces.com"
} = process.env;
var { withAuth } = (0, import_auth.createAuth)({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  initFirstItem: {
    fields: ["name", "email", "password"],
    itemData: {
      role: {
        create: {
          name: "Owner / Admin",
          // Every permission except break-glass, which is never granted by default.
          ...Object.fromEntries(permissionNames.filter((name) => !NEVER_DEFAULT.includes(name)).map((name) => [name, true]))
        }
      }
    }
  },
  passwordResetLink: {
    async sendToken(args) {
      await sendPasswordResetEmail(args.token, args.identity);
    }
  },
  sessionData: `
    name
    email
    kind
    accessExpiresAt
    role {
      id
      name
      ${permissionNames.join("\n      ")}
    }
  `
});
var keystone_default = withAuth(
  (0, import_core13.config)({
    db: {
      provider: "postgresql",
      url: databaseURL,
      extendPrismaSchema: addDatabaseConstraints
    },
    lists: models,
    storage: {
      my_images: {
        kind: "s3",
        type: "image",
        bucketName,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint,
        signed: { expiry: 5e3 },
        forcePathStyle: true
      }
    },
    ui: {
      isAccessAllowed: ({ session }) => isSignedIn({ session }) && session?.data.role?.canAccessDashboard === true
    },
    // MCP OAuth bearer tokens resolve to the approving user; everything else is unchanged.
    session: withMcpBearerSessions((0, import_session5.statelessSessions)(sessionConfig)),
    graphql: {
      extendGraphqlSchema
    }
  })
);

// keystone.ts
var keystone_default2 = keystone_default;
//# sourceMappingURL=config.js.map
