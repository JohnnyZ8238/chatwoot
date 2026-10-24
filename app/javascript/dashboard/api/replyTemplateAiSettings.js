/* global axios */
import ApiClient from './ApiClient';

// The account's DeepSeek key and model for AI drafts; the key itself never comes back, only its last four characters
class ReplyTemplateAiSettings extends ApiClient {
  constructor() {
    super('reply_template_ai_settings', { accountScoped: true });
  }

  get() {
    return axios.get(this.url);
  }

  update(data) {
    return axios.patch(this.url, data);
  }
}

export default new ReplyTemplateAiSettings();
