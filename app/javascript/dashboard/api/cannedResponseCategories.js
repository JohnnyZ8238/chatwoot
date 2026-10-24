/* global axios */
import ApiClient from './ApiClient';

class CannedResponseCategories extends ApiClient {
  constructor() {
    super('canned_response_categories', { accountScoped: true });
  }

  reorder(scope, ids) {
    return axios.patch(`${this.url}/reorder`, { scope, ids });
  }
}

export default new CannedResponseCategories();
