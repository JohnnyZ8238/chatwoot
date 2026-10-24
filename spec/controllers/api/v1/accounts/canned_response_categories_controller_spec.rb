require 'rails_helper'

RSpec.describe 'Canned Response Categories API', type: :request do
  let(:account) { create(:account) }
  let(:admin) { create(:user, account: account, role: :administrator) }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:other_agent) { create(:user, account: account, role: :agent) }
  let(:base_url) { "/api/v1/accounts/#{account.id}/canned_response_categories" }

  describe 'GET index' do
    it 'returns unauthorized without a user' do
      get base_url

      expect(response).to have_http_status(:unauthorized)
    end

    it 'returns company categories and the agent own ones only' do
      company = create(:canned_response_category, account: account, name: 'Shipping', position: 1)
      mine = create(:canned_response_category, account: account, user: agent, name: 'Mine', position: 0)
      create(:canned_response_category, account: account, user: other_agent, name: 'Theirs')

      get base_url, headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:success)
      expect(response.parsed_body.pluck('id')).to contain_exactly(company.id, mine.id)
      expect(response.parsed_body.find { |c| c['id'] == mine.id }['scope']).to eq('personal')
    end
  end

  describe 'POST create' do
    it 'creates a company category for an administrator' do
      post base_url, params: { name: 'Refunds' }, headers: admin.create_new_auth_token, as: :json

      expect(response).to have_http_status(:success)
      expect(response.parsed_body).to include('name' => 'Refunds', 'scope' => 'company')
    end

    it 'creates a personal category for an agent' do
      post base_url, params: { name: 'Refunds', scope: 'company' }, headers: agent.create_new_auth_token, as: :json

      expect(response.parsed_body['scope']).to eq('personal')
      expect(CannedResponseCategory.last.user_id).to eq(agent.id)
    end
  end

  describe 'PATCH update' do
    it 'does not let an agent rename a company category' do
      category = create(:canned_response_category, account: account, name: 'Shipping')

      patch "#{base_url}/#{category.id}", params: { name: 'Hacked' }, headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:unauthorized)
      expect(category.reload.name).to eq('Shipping')
    end

    it 'lets an agent rename their own category' do
      category = create(:canned_response_category, account: account, user: agent, name: 'Old')

      patch "#{base_url}/#{category.id}", params: { name: 'New' }, headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:success)
      expect(category.reload.name).to eq('New')
    end
  end

  describe 'DELETE destroy' do
    it 'keeps the templates of a deleted category with no category' do
      category = create(:canned_response_category, account: account)
      template = create(:canned_response, account: account, category: category)

      delete "#{base_url}/#{category.id}", headers: admin.create_new_auth_token, as: :json

      expect(response).to have_http_status(:success)
      expect(template.reload.canned_response_category_id).to be_nil
    end

    it 'returns not found for another agent category' do
      category = create(:canned_response_category, account: account, user: other_agent)

      delete "#{base_url}/#{category.id}", headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe 'PATCH reorder' do
    it 'sets positions in the given order' do
      a = create(:canned_response_category, account: account, user: agent, name: 'A')
      b = create(:canned_response_category, account: account, user: agent, name: 'B')

      patch "#{base_url}/reorder", params: { scope: 'personal', ids: [b.id, a.id] }, headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:success)
      expect([b.reload.position, a.reload.position]).to eq([0, 1])
    end

    it 'does not let an agent reorder company categories' do
      a = create(:canned_response_category, account: account, name: 'A', position: 0)
      b = create(:canned_response_category, account: account, name: 'B', position: 1)

      patch "#{base_url}/reorder", params: { scope: 'company', ids: [b.id, a.id] }, headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:unauthorized)
      expect(a.reload.position).to eq(0)
    end
  end
end
