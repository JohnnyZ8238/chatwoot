import { throwErrorMessage } from 'dashboard/store/utils/api';
import * as MutationHelpers from 'shared/helpers/vuex/mutationHelpers';
import types from '../mutation-types';
import CannedResponseCategoriesAPI from '../../api/cannedResponseCategories';

const byPosition = (a, b) => a.position - b.position || a.id - b.id;

export const state = {
  records: [],
  uiFlags: { isFetching: false },
};

export const getters = {
  getCategories(_state) {
    return [..._state.records].sort(byPosition);
  },
  getCompanyCategories(_state) {
    return _state.records
      .filter(record => record.scope === 'company')
      .sort(byPosition);
  },
  getPersonalCategories(_state) {
    return _state.records
      .filter(record => record.scope === 'personal')
      .sort(byPosition);
  },
  getUIFlags(_state) {
    return _state.uiFlags;
  },
};

export const actions = {
  async get({ commit }) {
    commit(types.SET_CANNED_CATEGORIES_UI_FLAG, { isFetching: true });
    try {
      const response = await CannedResponseCategoriesAPI.get();
      commit(types.SET_CANNED_CATEGORIES, response.data);
    } catch (error) {
      // Ignore error, the library still works without categories
    } finally {
      commit(types.SET_CANNED_CATEGORIES_UI_FLAG, { isFetching: false });
    }
  },
  async create({ commit }, payload) {
    try {
      const response = await CannedResponseCategoriesAPI.create(payload);
      commit(types.ADD_CANNED_CATEGORY, response.data);
      return response.data;
    } catch (error) {
      return throwErrorMessage(error);
    }
  },
  async update({ commit }, { id, ...payload }) {
    try {
      const response = await CannedResponseCategoriesAPI.update(id, payload);
      commit(types.EDIT_CANNED_CATEGORY, response.data);
      return response.data;
    } catch (error) {
      return throwErrorMessage(error);
    }
  },
  async delete({ commit }, id) {
    try {
      await CannedResponseCategoriesAPI.delete(id);
      commit(types.DELETE_CANNED_CATEGORY, id);
    } catch (error) {
      throwErrorMessage(error);
    }
  },
  async reorder({ commit }, { scope, ids }) {
    commit(types.SET_CANNED_CATEGORY_ORDER, ids);
    try {
      await CannedResponseCategoriesAPI.reorder(scope, ids);
    } catch (error) {
      throwErrorMessage(error);
    }
  },
};

export const mutations = {
  [types.SET_CANNED_CATEGORIES_UI_FLAG](_state, data) {
    _state.uiFlags = { ..._state.uiFlags, ...data };
  },
  [types.SET_CANNED_CATEGORIES]: MutationHelpers.set,
  [types.ADD_CANNED_CATEGORY]: MutationHelpers.create,
  [types.EDIT_CANNED_CATEGORY]: MutationHelpers.update,
  [types.DELETE_CANNED_CATEGORY]: MutationHelpers.destroy,
  [types.SET_CANNED_CATEGORY_ORDER](_state, ids) {
    _state.records.forEach(record => {
      const position = ids.indexOf(record.id);
      if (position !== -1) record.position = position;
    });
  },
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations,
};
