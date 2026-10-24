import { mount } from '@vue/test-utils';
import { createStore } from 'vuex';
import cannedResponse from 'dashboard/store/modules/cannedResponse';
import cannedResponseCategories from 'dashboard/store/modules/cannedResponseCategories';
import Index from '../Index.vue';

const LayoutStub = {
  template: '<div><slot name="header" /><slot name="body" /></div>',
};
const HeaderStub = {
  template: '<div><slot name="actions" /></div>',
};

const RECORDS = [
  {
    id: 1,
    short_code: 'ship',
    title: 'Shipping date',
    content: 'Ships {{ship_date}}',
    variables: [{ key: 'ship_date', label: 'Ship date', type: 'date' }],
    scope: 'company',
    canned_response_category_id: 10,
    favorite: false,
    usage_count: 3,
  },
  {
    id: 2,
    short_code: 'bye',
    title: 'Closing',
    content: 'Bye',
    variables: [],
    scope: 'company',
    canned_response_category_id: 11,
    favorite: true,
    usage_count: 7,
  },
  {
    id: 3,
    short_code: 'heat',
    title: 'Heat pack',
    content: 'Heat pack',
    variables: [],
    scope: 'personal',
    canned_response_category_id: null,
    favorite: false,
    usage_count: 1,
  },
];

const mountPage = role =>
  mount(Index, {
    global: {
      plugins: [
        createStore({
          modules: {
            cannedResponse: {
              ...cannedResponse,
              state: { records: RECORDS, uiFlags: {}, cacheKey: null },
              actions: { getCannedResponse: vi.fn() },
            },
            cannedResponseCategories: {
              ...cannedResponseCategories,
              state: {
                records: [
                  { id: 10, name: 'Shipping', position: 0, scope: 'company' },
                  { id: 11, name: 'Greetings', position: 1, scope: 'company' },
                ],
                uiFlags: {},
              },
              actions: { get: vi.fn() },
            },
          },
          getters: { getCurrentRole: () => role },
        }),
      ],
      stubs: {
        SettingsLayout: LayoutStub,
        BaseSettingsHeader: HeaderStub,
        TemplateEditorDialog: true,
        AiSettingsCard: true,
        Dialog: true,
      },
    },
  });

const rowIds = wrapper =>
  wrapper
    .findAll('[data-template]')
    .map(row => +row.attributes('data-template'));

describe('Reply templates settings', () => {
  it('shows the company library first', () => {
    expect(rowIds(mountPage('administrator'))).toEqual([1, 2]);
  });

  it('filters the table by category', async () => {
    const wrapper = mountPage('administrator');

    await wrapper.find('[data-category="11"]').trigger('click');

    expect(rowIds(wrapper)).toEqual([2]);
  });

  it('shows My library templates on the Mine tab', async () => {
    const wrapper = mountPage('agent');

    await wrapper.find('[data-library="personal"]').trigger('click');

    expect(rowIds(wrapper)).toEqual([3]);
    expect(
      wrapper.find('[data-template="3"] [data-action="edit"]').exists()
    ).toBe(true);
  });

  it('gives agents a read-only company library with Copy to Mine', () => {
    const wrapper = mountPage('agent');
    const row = wrapper.find('[data-template="1"]');

    expect(row.find('[data-action="edit"]').exists()).toBe(false);
    expect(row.find('[data-action="delete"]').exists()).toBe(false);
    expect(row.find('[data-action="copy"]').exists()).toBe(true);
    expect(wrapper.find('[data-action="new-category"]').exists()).toBe(false);
  });

  it('lets administrators edit company templates', () => {
    const row = mountPage('administrator').find('[data-template="1"]');

    expect(row.find('[data-action="edit"]').exists()).toBe(true);
    expect(row.find('[data-action="delete"]').exists()).toBe(true);
    expect(row.text()).toContain('Ship date');
  });
});
