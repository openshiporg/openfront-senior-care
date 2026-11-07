// Local ESLint rules for exact money and medication-quantity handling (SCHEMA G2-G4).

const MONEY_NAME = /(amount|price|rate|qty|quantity|minor|cash|units|fee|cost|charge|balance|deposit|withdrawal|payment|refund|copay|coinsurance|allowed|dose|strength|count|remaining)/i;

function nameOf(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression") return node.property?.type === "Identifier" ? node.property.name : nameOf(node.object);
  if (node.type === "ChainExpression") return nameOf(node.expression);
  if (node.type === "CallExpression") return nameOf(node.callee);
  if (node.type === "TSNonNullExpression" || node.type === "TSAsExpression") return nameOf(node.expression);
  return "";
}

/** Blocks floating-point conversion of money, price and quantity values. Counts and ids may still use Number(). */
const noNumberOnMoney = {
  meta: {
    type: "problem",
    docs: { description: "Money and medication quantities stay in BigInt or decimal.js; no float conversion" },
    messages: {
      parseFloat: "parseFloat is not allowed in money code. Use dec() from lib/decimal.",
      toFixed: "toFixed() rounds a float. Use lib/decimal formatting on a Decimal.",
      toNumber: "toNumber() turns an exact Decimal into a float. Keep it a Decimal or a string.",
      numberCall: "Number({{name}}) makes a money or quantity value a float. Use dec() or BigInt.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === "Identifier" && callee.name === "parseFloat") context.report({ node, messageId: "parseFloat" });
        if (callee.type === "MemberExpression" && callee.property?.type === "Identifier") {
          if (callee.object?.type === "Identifier" && callee.object.name === "Number" && callee.property.name === "parseFloat") context.report({ node, messageId: "parseFloat" });
          if (callee.property.name === "toFixed") context.report({ node, messageId: "toFixed" });
          if (callee.property.name === "toNumber") context.report({ node, messageId: "toNumber" });
        }
        if (callee.type === "Identifier" && callee.name === "Number" && node.arguments.length === 1) {
          const name = nameOf(node.arguments[0]);
          if (name && MONEY_NAME.test(name)) context.report({ node, messageId: "numberCall", data: { name } });
        }
      },
    };
  },
};

// Display-only measures may be floats. Everything else uses decimal, bigInt or integer.
const FLOAT_ALLOWED = new Set(["occupancyPct", "qualityMeasurePct", "starRating"]);

const noFloatFields = {
  meta: {
    type: "problem",
    docs: { description: "No float() fields outside the display-statistics allow-list" },
    messages: { float: "float() field '{{key}}' is not allowed. Use decimal(), bigInt() minor units or integer bps (SCHEMA G13)." },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier" || node.callee.name !== "float") return;
        const parent = node.parent;
        const key = parent?.type === "Property" ? (parent.key.type === "Identifier" ? parent.key.name : String(parent.key.value)) : "";
        if (!FLOAT_ALLOWED.has(key)) context.report({ node, messageId: "float", data: { key: key || "?" } });
      },
    };
  },
};

export default {
  meta: { name: "senior-care" },
  rules: { "no-number-on-money": noNumberOnMoney, "no-float-fields": noFloatFields },
};
