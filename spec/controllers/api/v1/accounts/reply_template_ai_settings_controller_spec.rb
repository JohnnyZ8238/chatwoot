require 'rails_helper'

RSpec.describe 'Reply template AI settings API', type: :request do
  let(:account) { create(:account) }
  let(:admin) { create(:user, account: account, role: :administrator) }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:url) { "/api/v1/accounts/#{account.id}/reply_template_ai_settings" }

  describe 'GET show' do
    it 'reports an unconfigured account' do
      with_modified_env(DEEPSEEK_API_KEY: nil) do
        get url, headers: agent.create_new_auth_token, as: :json
      end

      expect(response).to have_http_status(:success)
      expect(response.parsed_body).to include('configured' => false, 'model' => 'deepseek-chat', 'key_hint' => nil)
    end

    it 'shows only the last four characters of a saved key' do
      ReplyTemplates::AiSettings.new(account).update!(api_key: 'sk-secret-abcd1234', model: 'deepseek-reasoner')

      get url, headers: agent.create_new_auth_token, as: :json

      expect(response.parsed_body).to include('configured' => true, 'model' => 'deepseek-reasoner', 'key_hint' => '1234', 'source' => 'account')
      expect(response.body).not_to include('sk-secret')
    end

    it 'reports a key that only exists on the server' do
      with_modified_env(DEEPSEEK_API_KEY: 'sk-server-9999') do
        get url, headers: admin.create_new_auth_token, as: :json
      end

      expect(response.parsed_body).to include('configured' => true, 'source' => 'server', 'key_hint' => '9999')
    end
  end

  describe 'PATCH update' do
    it 'lets an administrator save a key and a model' do
      patch url, params: { api_key: 'sk-new-key-5678', model: 'deepseek-reasoner' }, headers: admin.create_new_auth_token, as: :json

      expect(response).to have_http_status(:success)
      expect(response.parsed_body).to include('configured' => true, 'key_hint' => '5678', 'model' => 'deepseek-reasoner')
      expect(response.body).not_to include('sk-new-key')
      settings = ReplyTemplates::AiSettings.new(account.reload)
      expect(settings.api_key).to eq('sk-new-key-5678')
    end

    it 'keeps the saved key when only the model changes' do
      ReplyTemplates::AiSettings.new(account).update!(api_key: 'sk-keep-0000')

      patch url, params: { model: 'deepseek-reasoner' }, headers: admin.create_new_auth_token, as: :json

      expect(ReplyTemplates::AiSettings.new(account.reload).api_key).to eq('sk-keep-0000')
    end

    it 'removes the saved key on request' do
      ReplyTemplates::AiSettings.new(account).update!(api_key: 'sk-gone-0000')

      with_modified_env(DEEPSEEK_API_KEY: nil) do
        patch url, params: { clear_api_key: true }, headers: admin.create_new_auth_token, as: :json
      end

      expect(response.parsed_body['configured']).to be(false)
    end

    it 'does not let an agent change the settings' do
      patch url, params: { api_key: 'sk-agent-1111' }, headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:unauthorized)
      expect(ReplyTemplates::AiSettings.new(account.reload).api_key).to be_nil
    end

    it 'never sends the key in the account payload' do
      ReplyTemplates::AiSettings.new(account).update!(api_key: 'sk-private-2222')

      get "/api/v1/accounts/#{account.id}", headers: admin.create_new_auth_token, as: :json

      expect(response.body).not_to include('sk-private')
    end
  end
end
