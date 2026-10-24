import { mount } from '@vue/test-utils';
import { createStore } from 'vuex';
import cannedResponse from 'dashboard/store/modules/cannedResponse';
import cannedResponseCategories from 'dashboard/store/modules/cannedResponseCategories';
import TemplateLibraryDialog from '../TemplateLibraryDialog.vue';

const DialogStub = {
  emits: ['confirm', 'close'],
  methods: { open() {}, close() {} },
  template: '<div><slot /></div>',
};

const RECORDS = [
  {
    id: 1,
    short_code: 'ship',
    title: 'Shipping date',
    content: 'Ships {{ship_date}}',
    variables: [{ key: 'ship_date', type: 'date', required: true }],
    scope: 'company',
    canned_response_category_id: 10,
    favorite: true,
    favorite_position: 0,
    usage_count: 5,
    last_used_at: null,
  },
  {
    id: 2,
    short_code: 'heat',
    title: 'Heat pack',
    content: 'We add a heat pack for {{contact.first_name}}.',
    variables: [],
    scope: 'personal',
    canned_response_category_id: null,
    favorite: true,
    favorite_position: 1,
    usage_count: 2,
    last_used_at: null,
  },
  {
    id: 3,
    short_code: 'bye',
    title: 'Closing the chat',
    content: 'Bye!',
    variables: [],
    scope: 'company',
    canned_response_category_id: 11,
    favorite: false,
    favorite_position: null,
    usage_count: 9,
    last_used_at: null,
  },
];

const reorder = vi.fn();

const mountLibrary = () =>
  mount(TemplateLibraryDialog, {
    props: { variables: { 'contact.first_name': 'Emily' } },
    global: {
      plugins: [
        createStore({
          modules: {
            cannedResponse: {
              ...cannedResponse,
              state: { records: RECORDS, uiFlags: {}, cacheKey: null },
              actions: {
                getCannedResponse: vi.fn(),
                toggleCannedResponseFavorite: vi.fn(),
                reorderCannedResponseFavorites: reorder,
              },
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
          getters: {
            getCurrentAccountId: () => 1,
            'accounts/getAccount': () => () => ({ name: 'ivybid' }),
          },
        }),
      ],
      stubs: { Dialog: DialogStub, RouterLink: true },
      mocks: { $router: { push: vi.fn() } },
    },
  });

const rowIds = wrapper =>
  wrapper.findAll('[data-row]').map(row => +row.attributes('data-row'));

describe('TemplateLibraryDialog', () => {
  beforeEach(() => reorder.mockClear());

  it('opens on Favorites in the saved order', () => {
    expect(rowIds(mountLibrary())).toEqual([1, 2]);
  });

  it('typing searches every template even on Favorites', async () => {
    const wrapper = mountLibrary();

    await wrapper.find('[data-testid="library-search"]').setValue('bye');

    expect(rowIds(wrapper)).toEqual([3]);
  });

  it('shows a category with its templates only', async () => {
    const wrapper = mountLibrary();

    await wrapper.find('[data-node="company:11"]').trigger('click');

    expect(rowIds(wrapper)).toEqual([3]);
  });

  it('reordering favorites dispatches the new id order', async () => {
    const wrapper = mountLibrary();

    await wrapper.find('[data-row="2"]').trigger('dragstart');
    await wrapper.find('[data-row="1"]').trigger('drop');

    expect(reorder).toHaveBeenCalled();
    expect(reorder.mock.calls[0][1]).toEqual([2, 1]);
  });

  it('inserts the resolved template', async () => {
    const wrapper = mountLibrary();

    await wrapper.find('[data-row="2"]').trigger('click');
    await wrapper.find('[data-testid="library-insert"]').trigger('click');

    expect(wrapper.emitted('insert')[0][0]).toBe(
      'We add a heat pack for Emily.'
    );
    expect(wrapper.emitted('insert')[0][1].id).toBe(2);
  });

  it('does not insert until required fields are filled', async () => {
    const wrapper = mountLibrary();

    await wrapper.find('[data-row="1"]').trigger('click');
    await wrapper.find('[data-testid="library-insert"]').trigger('click');
    expect(wrapper.emitted('insert')).toBeUndefined();

    await wrapper.find('input[type="date"]').setValue('2026-10-26');
    await wrapper.find('[data-testid="library-insert"]').trigger('click');
    expect(wrapper.emitted('insert')[0][0]).toBe('Ships Mon, Oct 26');
  });
});
