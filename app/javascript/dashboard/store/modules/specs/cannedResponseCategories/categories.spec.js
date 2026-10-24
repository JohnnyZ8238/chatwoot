import axios from 'axios';
import { getters, actions, mutations } from '../../cannedResponseCategories';
import * as types from '../../../mutation-types';

const commit = vi.fn();
global.axios = axios;
vi.mock('axios');

const CATEGORIES = [
  { id: 1, name: 'Shipping', position: 1, scope: 'company' },
  { id: 2, name: 'Refunds', position: 0, scope: 'company' },
  { id: 3, name: 'Mine', position: 0, scope: 'personal' },
];

describe('cannedResponseCategories', () => {
  beforeEach(() => {
    commit.mockClear();
  });

  it('splits and orders company and personal categories', () => {
    const state = { records: CATEGORIES };
    expect(getters.getCompanyCategories(state).map(c => c.id)).toEqual([2, 1]);
    expect(getters.getPersonalCategories(state).map(c => c.id)).toEqual([3]);
  });

  it('get stores the categories', async () => {
    axios.get = vi.fn(() => Promise.resolve({ data: CATEGORIES }));
    await actions.get({ commit });
    expect(commit).toHaveBeenCalledWith(
      types.default.SET_CANNED_CATEGORIES,
      CATEGORIES
    );
  });

  it('create adds the returned category', async () => {
    axios.post = vi.fn(() => Promise.resolve({ data: CATEGORIES[2] }));
    await actions.create({ commit }, { name: 'Mine', scope: 'personal' });
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/canned_response_categories$/),
      { name: 'Mine', scope: 'personal' }
    );
    expect(commit).toHaveBeenCalledWith(
      types.default.ADD_CANNED_CATEGORY,
      CATEGORIES[2]
    );
  });

  it('reorder sets positions locally and saves them', async () => {
    axios.patch = vi.fn(() => Promise.resolve({}));
    await actions.reorder({ commit }, { scope: 'company', ids: [1, 2] });
    expect(commit).toHaveBeenCalledWith(
      types.default.SET_CANNED_CATEGORY_ORDER,
      [1, 2]
    );
    expect(axios.patch).toHaveBeenCalledWith(
      expect.stringMatching(/\/canned_response_categories\/reorder$/),
      { scope: 'company', ids: [1, 2] }
    );
  });

  it('SET_CANNED_CATEGORY_ORDER rewrites positions of the given ids', () => {
    const state = { records: CATEGORIES.map(c => ({ ...c })) };
    mutations[types.default.SET_CANNED_CATEGORY_ORDER](state, [1, 2]);
    expect(state.records.map(c => c.position)).toEqual([0, 1, 0]);
  });
});
