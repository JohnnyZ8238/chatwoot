import {
  FIELD_TYPES,
  getExtraVariables,
  parseTokens,
  isSystemKey,
  getTemplateFields,
  guessFieldType,
  initialFieldValues,
  formatFieldValue,
  resolveTemplate,
  missingRequiredFields,
} from '../replyTemplates';

describe('replyTemplates', () => {
  it('lists the field types', () => {
    expect(FIELD_TYPES).toEqual([
      'text',
      'long',
      'number',
      'money',
      'date',
      'select',
      'yesno',
    ]);
  });

  describe('getExtraVariables', () => {
    // Friday 2026-10-23 09:05 local time
    const friday = new Date(2026, 9, 23, 9, 5);

    it('adds dates, time and greeting', () => {
      expect(getExtraVariables(friday, { name: 'ivybid' })).toEqual({
        'date.today': 'Fri, Oct 23',
        'date.tomorrow': 'Sat, Oct 24',
        'date.next_business_day': 'Mon, Oct 26',
        'date.in_3_days': 'Mon, Oct 26',
        'date.in_7_days': 'Fri, Oct 30',
        'time.now': '09:05',
        'time.greeting': 'Good morning',
        'account.name': 'ivybid',
      });
    });

    it('switches the greeting at noon and six', () => {
      expect(
        getExtraVariables(new Date(2026, 9, 23, 12, 0))['time.greeting']
      ).toBe('Good afternoon');
      expect(
        getExtraVariables(new Date(2026, 9, 23, 18, 0))['time.greeting']
      ).toBe('Good evening');
    });
  });

  describe('parseTokens', () => {
    it('reads keys and fallbacks in either quote style', () => {
      const tokens = parseTokens(
        'Hi {{ contact.first_name | default: "there" }}, order {{order_no}} {{x|default:\'y\'}}'
      );
      expect(tokens.map(({ key, fallback }) => [key, fallback])).toEqual([
        ['contact.first_name', 'there'],
        ['order_no', null],
        ['x', 'y'],
      ]);
      expect(tokens[1].raw).toBe('{{order_no}}');
    });
  });

  describe('isSystemKey', () => {
    it('treats dotted keys and known variables as system variables', () => {
      expect(isSystemKey('contact.custom_attribute.plan', {})).toBe(true);
      expect(isSystemKey('greeting', { greeting: 'Hi' })).toBe(true);
      expect(isSystemKey('order_no', {})).toBe(false);
    });
  });

  describe('guessFieldType', () => {
    it.each([
      ['ship_date', 'date'],
      ['deadline', 'date'],
      ['refund_amount', 'money'],
      ['total', 'money'],
      ['pay_hours', 'number'],
      ['days', 'number'],
      ['goodwill_note', 'long'],
      ['carrier', 'text'],
    ])('%s is %s', (key, type) => {
      expect(guessFieldType(key)).toBe(type);
    });
  });

  describe('getTemplateFields', () => {
    it('returns agent fields once, in order, merged over guessed defaults', () => {
      const content =
        'Hi {{contact.name}}, {{ship_date}} via {{carrier}} ({{ship_date}}) {{contact.custom_attribute.plan}}';
      const fields = getTemplateFields(
        content,
        [
          {
            key: 'carrier',
            label: 'Carrier',
            type: 'select',
            options: ['UPS'],
          },
        ],
        {}
      );

      expect(fields).toEqual([
        {
          key: 'ship_date',
          label: 'Ship date',
          type: 'date',
          required: false,
          default: '',
          options: [],
        },
        {
          key: 'carrier',
          label: 'Carrier',
          type: 'select',
          required: false,
          default: '',
          options: ['UPS'],
        },
      ]);
    });
  });

  describe('initialFieldValues', () => {
    it('uses defaults and the first option of a dropdown', () => {
      expect(
        initialFieldValues([
          { key: 'a', type: 'text', default: 'x', options: [] },
          { key: 'b', type: 'select', default: '', options: ['one', 'two'] },
          { key: 'c', type: 'date', default: '', options: [] },
        ])
      ).toEqual({ a: 'x', b: 'one', c: '' });
    });
  });

  describe('formatFieldValue', () => {
    it('formats 2026-10-26 as "Mon, Oct 26"', () => {
      expect(formatFieldValue({ type: 'date' }, '2026-10-26')).toBe(
        'Mon, Oct 26'
      );
    });

    it('prefixes money with $ only when missing', () => {
      expect(formatFieldValue({ type: 'money' }, '40')).toBe('$40');
      expect(formatFieldValue({ type: 'money' }, '$40')).toBe('$40');
    });

    it('leaves other values as typed', () => {
      expect(formatFieldValue({ type: 'text' }, ' IVY-1 ')).toBe(' IVY-1 ');
    });
  });

  describe('resolveTemplate', () => {
    const fields = [
      { key: 'ship_date', type: 'date', options: [] },
      { key: 'note', type: 'long', options: [] },
    ];

    it('fills system variables and agent fields', () => {
      expect(
        resolveTemplate('Hi {{contact.first_name}}, ships {{ship_date}}.', {
          variables: { 'contact.first_name': 'Emily' },
          values: { ship_date: '2026-10-26' },
          fields,
        })
      ).toBe('Hi Emily, ships Mon, Oct 26.');
    });

    it('keeps {{contact.email}} when there is no value and no fallback', () => {
      expect(
        resolveTemplate('Mail {{contact.email}}', { variables: {}, fields })
      ).toBe('Mail {{contact.email}}');
    });

    it('uses the fallback for an empty system variable', () => {
      expect(
        resolveTemplate('Hi {{contact.first_name | default: "there"}}', {
          variables: { 'contact.first_name': '' },
          fields,
        })
      ).toBe('Hi there');
    });

    it('inserts an empty string for an empty optional agent field', () => {
      expect(
        resolveTemplate('Thanks.{{note}}', {
          variables: {},
          values: {},
          fields,
        })
      ).toBe('Thanks.');
    });

    it('uses the fallback for an empty agent field', () => {
      expect(
        resolveTemplate('{{note | default: "None"}}', {
          variables: {},
          values: { note: '' },
          fields,
        })
      ).toBe('None');
    });
  });

  describe('missingRequiredFields', () => {
    it('returns required keys without a value', () => {
      expect(
        missingRequiredFields(
          [
            { key: 'a', required: true },
            { key: 'b', required: true },
            { key: 'c', required: false },
          ],
          { a: ' ', b: 'x' }
        )
      ).toEqual(['a']);
    });
  });
});
