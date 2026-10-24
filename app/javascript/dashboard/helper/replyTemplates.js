/**
 * Reply template variables.
 *
 * A template mixes two kinds of {{ }} tokens:
 * - system variables (`contact.first_name`, `conversation.custom_attribute.plan`, `date.today`, …), filled from
 *   the conversation. Without a value they fall back to `| default: "…"`, else stay as {{…}} for the backend's Liquid.
 * - agent fields (`{{ship_date}}`: no dot, not a known variable), asked when the template is picked.
 */

export const FIELD_TYPES = [
  'text',
  'long',
  'number',
  'money',
  'date',
  'select',
  'yesno',
];

const FIELD_KEY = /^[a-z][a-z0-9_]*$/;
const TOKEN =
  /\{\{\s*([^{}|]+?)\s*(?:\|\s*default:\s*(?:"([^"]*)"|'([^']*)')\s*)?\}\}/g;
const LIQUID_SYNTAX = /\{\{|\{%/;

const pad = number => String(number).padStart(2, '0');

const formatDay = date =>
  date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const nextBusinessDay = date => {
  let next = addDays(date, 1);
  while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, 1);
  return next;
};

const greeting = date => {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

const humanize = key => {
  const words = key.replace(/_+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// Variables the conversation doesn't carry but a reply often needs
export const getExtraVariables = (now = new Date(), account = {}) => ({
  'date.today': formatDay(now),
  'date.tomorrow': formatDay(addDays(now, 1)),
  'date.next_business_day': formatDay(nextBusinessDay(now)),
  'date.in_3_days': formatDay(addDays(now, 3)),
  'date.in_7_days': formatDay(addDays(now, 7)),
  'time.now': `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  'time.greeting': greeting(now),
  'account.name': account.name || '',
});

export const parseTokens = content =>
  [...(content || '').matchAll(TOKEN)].map(match => ({
    raw: match[0],
    key: match[1].trim(),
    fallback: match[2] ?? match[3] ?? null,
    index: match.index,
  }));

export const isSystemKey = (key, variables = {}) =>
  key.includes('.') || Object.prototype.hasOwnProperty.call(variables, key);

const isFieldKey = (key, variables) =>
  !isSystemKey(key, variables) && FIELD_KEY.test(key);

export const guessFieldType = key => {
  if (/date|deadline/.test(key)) return 'date';
  if (/amount|price|refund|total|fee|cost/.test(key)) return 'money';
  if (/days|hours|qty|count/.test(key)) return 'number';
  if (/note|message|details/.test(key)) return 'long';
  return 'text';
};

export const getTemplateFields = (
  content,
  definitions = [],
  variables = {}
) => {
  const keys = [
    ...new Set(
      parseTokens(content)
        .map(({ key }) => key)
        .filter(key => isFieldKey(key, variables))
    ),
  ];
  return keys.map(key => ({
    key,
    label: humanize(key),
    type: guessFieldType(key),
    required: false,
    default: '',
    options: [],
    ...(definitions || []).find(definition => definition.key === key),
  }));
};

export const initialFieldValues = fields =>
  Object.fromEntries(
    fields.map(field => [
      field.key,
      field.default ||
        (field.type === 'select' ? field.options?.[0] || '' : ''),
    ])
  );

export const formatFieldValue = (field, value) => {
  if (value === undefined || value === null || value === '') return '';
  if (field?.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return formatDay(new Date(year, month - 1, day));
  }
  if (field?.type === 'money')
    return value.startsWith('$') ? value : `$${value}`;
  return value;
};

export const resolveTemplate = (
  content,
  { variables = {}, values = {}, fields = [] } = {}
) =>
  (content || '').replace(TOKEN, (raw, rawKey, doubleQuoted, singleQuoted) => {
    const key = rawKey.trim();
    const fallback = doubleQuoted ?? singleQuoted ?? null;

    if (isSystemKey(key, variables)) {
      const value = String(variables[key] ?? '');
      if (value && !LIQUID_SYNTAX.test(value)) return value;
      return fallback ?? raw;
    }
    if (!FIELD_KEY.test(key)) return raw;

    const field = fields.find(item => item.key === key) || { key };
    return formatFieldValue(field, values[key]) || fallback || '';
  });

export const missingRequiredFields = (fields, values) =>
  fields
    .filter(field => field.required && !String(values[field.key] ?? '').trim())
    .map(field => field.key);
