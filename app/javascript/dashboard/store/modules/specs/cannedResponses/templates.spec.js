import axios from 'axios';
import CannedResponses from '../../cannedResponse';
import * as types from '../../../mutation-types';

const { getters, actions, mutations } = CannedResponses;
const commit = vi.fn();
global.axios = axios;
vi.mock('axios');

const RECORDS = [
  {
    id: 1,
    short_code: 'ship',
    scope: 'company',
    favorite: true,
    favorite_position: 1,
    last_used_at: '2026-10-20T10:00:00Z',
  },
  {
    id: 2,
    short_code: 'heat',
    scope: 'personal',
    favorite: true,
    favorite_position: 0,
    last_used_at: null,
  },
  {
    id: 3,
    short_code: 'bye',
    scope: 'company',
    favorite: false,
    favorite_position: null,
    last_used_at: '2026-10-22T10:00:00Z',
  },
];

describe('reply template getters', () => {
  const state = { records: RECORDS };

  it('getFavoriteCannedResponses orders favorites by position', () => {
    expect(getters.getFavoriteCannedResponses(state).map(r => r.id)).toEqual([
      2, 1,
    ]);
  });

  it('getRecentCannedResponses lists used templates, latest first', () => {
    expect(getters.getRecentCannedResponses(state).map(r => r.id)).toEqual([
      3, 1,
    ]);
  });

  it('splits company and personal templates', () => {
    expect(getters.getCompanyCannedResponses(state).map(r => r.id)).toEqual([
      1, 3,
    ]);
    expect(getters.getPersonalCannedResponses(state).map(r => r.id)).toEqual([
      2,
    ]);
  });
});

describe('reply template actions', () => {
  beforeEach(() => {
    commit.mockClear();
  });

  const stateWith = () => ({ records: RECORDS.map(r => ({ ...r })) });

  it('toggleCannedResponseFavorite pins optimistically and keeps the server copy', async () => {
    const state = stateWith();
    axios.post = vi.fn(() =>
      Promise.resolve({
        data: { ...RECORDS[2], favorite: true, favorite_position: 5 },
      })
    );

    await actions.toggleCannedResponseFavorite({ commit, state }, 3);

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/canned_responses\/3\/favorite$/)
    );
    expect(commit.mock.calls[0]).toEqual([
      types.default.EDIT_CANNED,
      { ...RECORDS[2], favorite: true, favorite_position: 2 },
    ]);
    expect(commit.mock.calls[1]).toEqual([
      types.default.EDIT_CANNED,
      { ...RECORDS[2], favorite: true, favorite_position: 5 },
    ]);
  });

  it('toggleCannedResponseFavorite reverts when the request fails', async () => {
    const state = stateWith();
    axios.delete = vi.fn(() => Promise.reject(new Error('nope')));

    await expect(
      actions.toggleCannedResponseFavorite({ commit, state }, 2)
    ).rejects.toThrow();

    expect(commit.mock.calls.at(-1)).toEqual([
      types.default.EDIT_CANNED,
      RECORDS[1],
    ]);
  });

  it('markCannedResponseUsed stores the returned usage', async () => {
    const used = { ...RECORDS[1], last_used_at: '2026-10-24T10:00:00Z' };
    axios.post = vi.fn(() => Promise.resolve({ data: used }));

    await actions.markCannedResponseUsed({ commit }, 2);

    expect(axios.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/canned_responses\/2\/use$/)
    );
    expect(commit).toHaveBeenCalledWith(types.default.EDIT_CANNED, used);
  });

  it('reorderCannedResponseFavorites rewrites positions and saves the order', async () => {
    const state = stateWith();
    axios.patch = vi.fn(() => Promise.resolve({}));

    await actions.reorderCannedResponseFavorites({ commit, state }, [1, 2]);

    expect(commit).toHaveBeenCalledWith(
      types.default.SET_CANNED_FAVORITE_ORDER,
      [1, 2]
    );
    expect(axios.patch).toHaveBeenCalledWith(
      expect.stringMatching(/\/canned_responses\/favorites$/),
      { ids: [1, 2] }
    );
  });

  it('revalidateCannedResponses refetches only when the key changes', async () => {
    const dispatch = vi.fn();
    const state = { cacheKey: 'a' };

    await actions.revalidateCannedResponses(
      { commit, dispatch, state },
      {
        newKey: 'a',
      }
    );
    expect(dispatch).not.toHaveBeenCalled();

    await actions.revalidateCannedResponses(
      { commit, dispatch, state },
      {
        newKey: 'b',
      }
    );
    expect(commit).toHaveBeenCalledWith(
      types.default.SET_CANNED_CACHE_KEY,
      'b'
    );
    expect(dispatch).toHaveBeenCalledWith('getCannedResponse');
  });
});

describe('reply template mutations', () => {
  it('SET_CANNED_FAVORITE_ORDER sets positions from the id order', () => {
    const state = { records: RECORDS.map(r => ({ ...r })) };
    mutations[types.default.SET_CANNED_FAVORITE_ORDER](state, [1, 2]);
    expect(state.records.map(r => r.favorite_position)).toEqual([0, 1, null]);
  });
});
