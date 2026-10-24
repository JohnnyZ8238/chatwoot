import { mount, flushPromises } from '@vue/test-utils';
import { createStore } from 'vuex';
import cannedResponseCategories from 'dashboard/store/modules/cannedResponseCategories';
import TemplateEditorDialog from '../TemplateEditorDialog.vue';

const DialogStub = {
  emits: ['confirm', 'close'],
  methods: { open() {}, close() {} },
  template:
    '<div><slot /><button class="save" @click="$emit(\'confirm\')" /></div>',
};

const create = vi.fn(() => Promise.resolve({ id: 9 }));
const update = vi.fn(() => Promise.resolve({ id: 4 }));

const mountEditor = (props = {}) =>
  mount(TemplateEditorDialog, {
    props: { scope: 'personal', isAdmin: false, ...props },
    global: {
      plugins: [
        createStore({
          modules: {
            cannedResponseCategories: {
              ...cannedResponseCategories,
              state: {
                records: [
                  { id: 10, name: 'Shipping', position: 0, scope: 'company' },
                  { id: 20, name: 'Mine', position: 0, scope: 'personal' },
                ],
                uiFlags: {},
              },
              actions: { get: vi.fn(), create: vi.fn() },
            },
          },
          actions: {
            createCannedResponse: create,
            updateCannedResponse: update,
          },
          getters: {
            getCurrentAccountId: () => 1,
            'accounts/getAccount': () => () => ({ name: 'ivybid' }),
            getCurrentUser: () => ({ name: 'Sean Mo', email: 's@x.com' }),
            'attributes/getAttributes': () => [],
          },
        }),
      ],
      stubs: { Dialog: DialogStub },
    },
  });

const setMessage = (wrapper, text) =>
  wrapper.find('[data-testid="template-message"]').setValue(text);

describe('TemplateEditorDialog', () => {
  beforeEach(() => {
    create.mockClear();
    update.mockClear();
  });

  it('adds a field row when the message gains {{refund_amount}} and guesses money', async () => {
    const wrapper = mountEditor();

    await setMessage(wrapper, 'We refund {{refund_amount}} today.');

    const row = wrapper.find('[data-field="refund_amount"]');
    expect(row.exists()).toBe(true);
    expect(row.find('select').element.value).toBe('money');
  });

  it('drops field definitions no longer in the message on save', async () => {
    const wrapper = mountEditor();
    await wrapper.find('[data-testid="template-title"]').setValue('Refund');
    await wrapper.find('[data-testid="template-shortcut"]').setValue('refund');
    await setMessage(wrapper, '{{old_field}} and {{refund_amount}}');
    await wrapper
      .find('[data-field="old_field"] input')
      .setValue('Something old');
    await setMessage(wrapper, 'We refund {{refund_amount}}.');

    await wrapper.find('.save').trigger('click');
    await flushPromises();

    const payload = create.mock.calls[0][1];
    expect(payload.variables.map(field => field.key)).toEqual([
      'refund_amount',
    ]);
    expect(payload).toMatchObject({
      title: 'Refund',
      short_code: 'refund',
      content: 'We refund {{refund_amount}}.',
      scope: 'personal',
    });
  });

  it('only offers the personal library to agents', () => {
    const options = mountEditor()
      .findAll('[data-testid="template-scope"] option')
      .map(option => option.element.value);
    expect(options).toEqual(['personal']);
  });

  it('lets administrators save to the company library with a company category', async () => {
    const wrapper = mountEditor({ scope: 'company', isAdmin: true });
    await wrapper.find('[data-testid="template-title"]').setValue('Ship');
    await wrapper.find('[data-testid="template-shortcut"]').setValue('ship');
    await setMessage(wrapper, 'Ships soon');
    await wrapper.find('[data-testid="template-category"]').setValue('10');

    await wrapper.find('.save').trigger('click');
    await flushPromises();

    expect(create.mock.calls[0][1]).toMatchObject({
      scope: 'company',
      canned_response_category_id: 10,
    });
  });

  it('does not save without a shortcut', async () => {
    const wrapper = mountEditor();
    await wrapper.find('[data-testid="template-title"]').setValue('Ship');
    await setMessage(wrapper, 'Ships soon');

    await wrapper.find('.save').trigger('click');
    await flushPromises();

    expect(create).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('REPLY_TEMPLATES.EDITOR.ERRORS.SHORTCUT');
  });

  it('updates an existing template', async () => {
    const wrapper = mountEditor({
      template: {
        id: 4,
        title: 'Ship',
        short_code: 'ship',
        content: 'Ships {{ship_date}}',
        variables: [{ key: 'ship_date', type: 'date', label: 'Date' }],
        scope: 'personal',
        canned_response_category_id: 20,
      },
    });

    await wrapper.find('.save').trigger('click');
    await flushPromises();

    expect(update.mock.calls[0][1]).toMatchObject({
      id: 4,
      variables: [expect.objectContaining({ key: 'ship_date', type: 'date' })],
      canned_response_category_id: 20,
    });
  });
});
