import { mount } from '@vue/test-utils';
import { createStore } from 'vuex';
import cannedResponse from 'dashboard/store/modules/cannedResponse';
import cannedResponseCategories from 'dashboard/store/modules/cannedResponseCategories';
import CannedResponse from '../../CannedResponse.vue';

const PickerStub = {
  props: ['items', 'emptyLabel'],
  emits: ['select', 'close', 'removeTrigger'],
  template: `<div>
    <slot name="filters" />
    <ul><li v-for="item in items" :key="item.id" class="item" :data-id="item.id" @click="$emit('select', item)">
      <slot name="leading" :item="item" />{{ item.label }}
    </li></ul>
    <p class="empty">{{ emptyLabel }}</p>
  </div>`,
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
    favorite_position: 1,
    last_used_at: null,
  },
  {
    id: 2,
    short_code: 'heat',
    title: 'Heat pack',
    content:
      'Hi {{contact.first_name | default: "there"}}, we add a heat pack.',
    variables: [],
    scope: 'personal',
    canned_response_category_id: null,
    favorite: true,
    favorite_position: 0,
    last_used_at: null,
  },
  {
    id: 3,
    short_code: 'bye',
    title: 'Closing the chat',
    content: 'Bye from {{account.name}}',
    variables: [],
    scope: 'company',
    canned_response_category_id: 11,
    favorite: false,
    favorite_position: null,
    last_used_at: '2026-10-22T10:00:00Z',
  },
];

const toggleFavorite = vi.fn();

const buildStore = () =>
  createStore({
    modules: {
      cannedResponse: {
        ...cannedResponse,
        state: { records: RECORDS, uiFlags: {}, cacheKey: null },
        actions: {
          getCannedResponse: vi.fn(),
          toggleCannedResponseFavorite: toggleFavorite,
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
  });

const mountPicker = (props = {}) =>
  mount(CannedResponse, {
    props: { variables: { 'contact.first_name': '' }, ...props },
    global: {
      plugins: [buildStore()],
      stubs: { CaretAnchoredPicker: PickerStub },
    },
  });

const ids = wrapper =>
  wrapper.findAll('.item').map(item => +item.attributes('data-id'));

describe('CannedResponse picker', () => {
  beforeEach(() => toggleFavorite.mockClear());

  it('opens on Favorites in the saved order when the agent has favorites', () => {
    expect(ids(mountPicker())).toEqual([2, 1]);
  });

  it('opens on All when there is a search term, searching every template', () => {
    expect(ids(mountPicker({ searchKey: 'bye' }))).toEqual([3]);
  });

  it('switches tabs and filters by category chip', async () => {
    const wrapper = mountPicker();

    await wrapper.find('[data-tab="company"]').trigger('click');
    expect(ids(wrapper)).toEqual([1, 3]);

    await wrapper.find('[data-category="11"]').trigger('click');
    expect(ids(wrapper)).toEqual([3]);
  });

  it('emits fill for a template with agent fields', async () => {
    const wrapper = mountPicker();

    await wrapper.find('[data-id="1"]').trigger('click');

    expect(wrapper.emitted('fill')[0][0].id).toBe(1);
    expect(wrapper.emitted('replace')).toBeUndefined();
  });

  it('emits replace with resolved content for a template without fields', async () => {
    const wrapper = mountPicker();

    await wrapper.find('[data-id="2"]').trigger('click');

    expect(wrapper.emitted('replace')[0]).toEqual([
      'Hi there, we add a heat pack.',
      RECORDS[1],
    ]);
  });

  it('resolves account.name', async () => {
    const wrapper = mountPicker({ searchKey: 'bye' });

    await wrapper.find('[data-id="3"]').trigger('click');

    expect(wrapper.emitted('replace')[0][0]).toBe('Bye from ivybid');
  });

  it('stars a template without selecting it', async () => {
    const wrapper = mountPicker({ searchKey: 'bye' });

    await wrapper.find('[data-id="3"] [data-star]').trigger('click');

    expect(toggleFavorite).toHaveBeenCalled();
    expect(toggleFavorite.mock.calls[0][1]).toBe(3);
    expect(wrapper.emitted('replace')).toBeUndefined();
  });
});
