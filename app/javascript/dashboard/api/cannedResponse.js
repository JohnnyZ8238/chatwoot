/* global axios */
import ApiClient from './ApiClient';

// Not cached in IndexedDB: the list carries the signed-in agent's personal templates and favorites,
// which an account-wide cache key can't keep apart.
class CannedResponse extends ApiClient {
  constructor() {
    super('canned_responses', { accountScoped: true });
  }

  use(id) {
    return axios.post(`${this.url}/${id}/use`);
  }

  favorite(id) {
    return axios.post(`${this.url}/${id}/favorite`);
  }

  unfavorite(id) {
    return axios.delete(`${this.url}/${id}/favorite`);
  }

  reorderFavorites(ids) {
    return axios.patch(`${this.url}/favorites`, { ids });
  }
}

export default new CannedResponse();
