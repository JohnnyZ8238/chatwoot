import { throwErrorMessage } from 'dashboard/store/utils/api';
import * as MutationHelpers from 'shared/helpers/vuex/mutationHelpers';
import * as types from '../mutation-types';
import CannedResponseAPI from '../../api/cannedResponse';

const RECENT_LIMIT = 15;

const byFavoritePosition = (a, b) =>
  (a.favorite_position ?? 0) - (b.favorite_position ?? 0);

const state = {
  records: [],
  cacheKey: null,
  uiFlags: {
    fetchingList: false,
    fetchingItem: false,
    creatingItem: false,
    updatingItem: false,
    deletingItem: false,
  },
};

const getters = {
  getCannedResponses(_state) {
    return _state.records;
  },
  getSortedCannedResponses(_state) {
    return sortOrder =>
      [..._state.records].sort((a, b) => {
        if (sortOrder === 'asc') {
          return a.short_code.localeCompare(b.short_code);
        }
        return b.short_code.localeCompare(a.short_code);
      });
  },
  getUIFlags(_state) {
    return _state.uiFlags;
  },
  getFavoriteCannedResponses(_state) {
    return _state.records
      .filter(record => record.favorite)
      .sort(byFavoritePosition);
  },
  getRecentCannedResponses(_state) {
    return _state.records
      .filter(record => record.last_used_at)
      .sort((a, b) => b.last_used_at.localeCompare(a.last_used_at))
      .slice(0, RECENT_LIMIT);
  },
  getCompanyCannedResponses(_state) {
    return _state.records.filter(record => record.scope !== 'personal');
  },
  getPersonalCannedResponses(_state) {
    return _state.records.filter(record => record.scope === 'personal');
  },
};

const actions = {
  // The list isn't cached in IndexedDB, so a changed account key just means fetching it again
  revalidateCannedResponses: async function revalidateCannedResponses(
    { commit, dispatch, state: currentState },
    { newKey }
  ) {
    if (!newKey || newKey === currentState.cacheKey) return;
    commit(types.default.SET_CANNED_CACHE_KEY, newKey);
    await dispatch('getCannedResponse');
  },

  markCannedResponseUsed: async function markCannedResponseUsed(
    { commit },
    id
  ) {
    try {
      const response = await CannedResponseAPI.use(id);
      commit(types.default.EDIT_CANNED, response.data);
    } catch (error) {
      // Usage stats are best effort
    }
  },

  toggleCannedResponseFavorite: async function toggleCannedResponseFavorite(
    { commit, state: currentState },
    id
  ) {
    const record = currentState.records.find(item => item.id === id);
    if (!record) return;

    const positions = currentState.records
      .filter(item => item.favorite)
      .map(item => item.favorite_position ?? 0);
    const favorite = !record.favorite;
    commit(types.default.EDIT_CANNED, {
      ...record,
      favorite,
      favorite_position: favorite ? Math.max(-1, ...positions) + 1 : null,
    });

    try {
      const response = favorite
        ? await CannedResponseAPI.favorite(id)
        : await CannedResponseAPI.unfavorite(id);
      commit(types.default.EDIT_CANNED, response.data);
    } catch (error) {
      commit(types.default.EDIT_CANNED, record);
      throwErrorMessage(error);
    }
  },

  reorderCannedResponseFavorites: async function reorderCannedResponseFavorites(
    { commit },
    ids
  ) {
    commit(types.default.SET_CANNED_FAVORITE_ORDER, ids);
    try {
      await CannedResponseAPI.reorderFavorites(ids);
    } catch (error) {
      throwErrorMessage(error);
    }
  },

  getCannedResponse: async function getCannedResponse({ commit }) {
    commit(types.default.SET_CANNED_UI_FLAG, { fetchingList: true });
    try {
      const response = await CannedResponseAPI.get(true);
      commit(types.default.SET_CANNED, response.data);
      commit(types.default.SET_CANNED_UI_FLAG, { fetchingList: false });
    } catch (error) {
      commit(types.default.SET_CANNED_UI_FLAG, { fetchingList: false });
    }
  },

  createCannedResponse: async function createCannedResponse(
    { commit },
    cannedObj
  ) {
    commit(types.default.SET_CANNED_UI_FLAG, { creatingItem: true });
    try {
      const response = await CannedResponseAPI.create(cannedObj);
      commit(types.default.ADD_CANNED, response.data);
      commit(types.default.SET_CANNED_UI_FLAG, { creatingItem: false });
      return response.data;
    } catch (error) {
      commit(types.default.SET_CANNED_UI_FLAG, { creatingItem: false });
      return throwErrorMessage(error);
    }
  },

  updateCannedResponse: async function updateCannedResponse(
    { commit },
    { id, ...updateObj }
  ) {
    commit(types.default.SET_CANNED_UI_FLAG, { updatingItem: true });
    try {
      const response = await CannedResponseAPI.update(id, updateObj);
      commit(types.default.EDIT_CANNED, response.data);
      commit(types.default.SET_CANNED_UI_FLAG, { updatingItem: false });
      return response.data;
    } catch (error) {
      commit(types.default.SET_CANNED_UI_FLAG, { updatingItem: false });
      return throwErrorMessage(error);
    }
  },

  deleteCannedResponse: async function deleteCannedResponse({ commit }, id) {
    commit(types.default.SET_CANNED_UI_FLAG, { deletingItem: true });
    try {
      await CannedResponseAPI.delete(id);
      commit(types.default.DELETE_CANNED, id);
      commit(types.default.SET_CANNED_UI_FLAG, { deletingItem: true });
      return id;
    } catch (error) {
      commit(types.default.SET_CANNED_UI_FLAG, { deletingItem: true });
      return throwErrorMessage(error);
    }
  },
};

const mutations = {
  [types.default.SET_CANNED_UI_FLAG](_state, data) {
    _state.uiFlags = {
      ..._state.uiFlags,
      ...data,
    };
  },

  [types.default.SET_CANNED]: MutationHelpers.set,
  [types.default.ADD_CANNED]: MutationHelpers.create,
  [types.default.EDIT_CANNED]: MutationHelpers.update,
  [types.default.DELETE_CANNED]: MutationHelpers.destroy,
  [types.default.SET_CANNED_CACHE_KEY](_state, key) {
    _state.cacheKey = key;
  },
  [types.default.SET_CANNED_FAVORITE_ORDER](_state, ids) {
    _state.records.forEach(record => {
      const position = ids.indexOf(record.id);
      if (position !== -1) record.favorite_position = position;
    });
  },
};

export default {
  state,
  getters,
  actions,
  mutations,
};
