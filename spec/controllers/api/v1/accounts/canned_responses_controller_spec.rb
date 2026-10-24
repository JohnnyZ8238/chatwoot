require 'rails_helper'

RSpec.describe 'Canned Responses API', type: :request do
  let(:account) { create(:account) }
  let(:admin) { create(:user, account: account, role: :administrator) }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:other_agent) { create(:user, account: account, role: :agent) }
  let(:base_url) { "/api/v1/accounts/#{account.id}/canned_responses" }

  before do
    create(:canned_response, account: account, content: 'Hey {{ contact.name }}, Thanks for reaching out', short_code: 'name-short-code')
  end

  describe 'GET /api/v1/accounts/{account.id}/canned_responses' do
    context 'when it is an unauthenticated user' do
      it 'returns unauthorized' do
        get base_url

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context 'when it is an authenticated user' do
      it 'returns all the canned responses' do
        get base_url, headers: agent.create_new_auth_token, as: :json

        expect(response).to have_http_status(:success)
        expect(response.parsed_body).to eq(account.canned_responses.map { |record| record.as_template_json.as_json })
      end

      it 'returns all the canned responses the user searched for' do
        cr1 = account.canned_responses.first
        create(:canned_response, account: account, content: 'Great! Looking forward', short_code: 'short-code')
        cr2 = create(:canned_response, account: account, content: 'Thanks for reaching out', short_code: 'content-with-thanks')
        cr3 = create(:canned_response, account: account, content: 'Thanks for reaching out', short_code: 'Thanks')

        get base_url, params: { search: 'thanks' }, headers: agent.create_new_auth_token, as: :json

        expect(response).to have_http_status(:success)
        expect(response.parsed_body.pluck('id')).to eq([cr3.id, cr2.id, cr1.id])
      end

      it 'ignores null bytes in the search string' do
        matching_response = create(:canned_response, account: account, content: 'Unique response', short_code: 'unique')

        get base_url, params: { search: "uni\0que" }, headers: agent.create_new_auth_token, as: :json

        expect(response).to have_http_status(:success)
        expect(response.parsed_body.pluck('id')).to eq([matching_response.id])
      end

      it 'never returns another agent personal template' do
        mine = create(:canned_response, account: account, user: agent, short_code: 'mine')
        theirs = create(:canned_response, account: account, user: other_agent, short_code: 'theirs')

        get base_url, headers: agent.create_new_auth_token, as: :json

        ids = response.parsed_body.pluck('id')
        expect(ids).to include(mine.id)
        expect(ids).not_to include(theirs.id)
      end

      it 'returns favorites first in the saved order' do
        first = create(:canned_response, account: account, short_code: 'first')
        second = create(:canned_response, account: account, short_code: 'second')
        create(:canned_response_preference, canned_response: first, user: agent, favorite: true, favorite_position: 1)
        create(:canned_response_preference, canned_response: second, user: agent, favorite: true, favorite_position: 0)

        get base_url, headers: agent.create_new_auth_token, as: :json

        expect(response.parsed_body.first(2).pluck('id')).to eq([second.id, first.id])
        expect(response.parsed_body.first['favorite']).to be(true)
      end
    end
  end

  describe 'POST /api/v1/accounts/{account.id}/canned_responses' do
    context 'when it is an unauthenticated user' do
      it 'returns unauthorized' do
        post base_url

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context 'when it is an authenticated user' do
      it 'creates a personal template for an agent sending only short code and content' do
        post base_url, params: { short_code: 'short', content: 'content' }, headers: agent.create_new_auth_token, as: :json

        expect(response).to have_http_status(:success)
        expect(account.canned_responses.count).to eq(2)
        expect(response.parsed_body).to include('scope' => 'personal', 'user_id' => agent.id)
      end

      it 'still creates a personal template when an agent asks for the company library' do
        post base_url, params: { short_code: 'short', content: 'content', scope: 'company' }, headers: agent.create_new_auth_token, as: :json

        expect(response).to have_http_status(:success)
        expect(CannedResponse.last.user_id).to eq(agent.id)
      end

      it 'creates a company template for an administrator by default' do
        post base_url, params: { short_code: 'short', content: 'content' }, headers: admin.create_new_auth_token, as: :json

        expect(response).to have_http_status(:success)
        expect(response.parsed_body).to include('scope' => 'company', 'user_id' => nil)
      end

      it 'lets an administrator create a personal template' do
        post base_url, params: { short_code: 'short', content: 'content', scope: 'personal' }, headers: admin.create_new_auth_token, as: :json

        expect(CannedResponse.last.user_id).to eq(admin.id)
      end

      it 'saves title, category and variables' do
        category = create(:canned_response_category, account: account, user: agent)
        params = { short_code: 'ship', content: 'Ships on {{ship_date}}', title: 'Shipping date', canned_response_category_id: category.id,
                   variables: [{ key: 'ship_date', label: 'Ship date', type: 'date', required: true }] }

        post base_url, params: params, headers: agent.create_new_auth_token, as: :json

        expect(response).to have_http_status(:success)
        template = CannedResponse.last
        expect(template.title).to eq('Shipping date')
        expect(template.category).to eq(category)
        expect(template.variables.first).to include('key' => 'ship_date', 'type' => 'date', 'required' => true)
      end

      it 'saves an AI prompt template' do
        post base_url, params: { short_code: 'draft', content: 'Answer their question warmly', ai_prompt: true },
                       headers: agent.create_new_auth_token, as: :json

        expect(response).to have_http_status(:success)
        expect(response.parsed_body['ai_prompt']).to be(true)
      end

      it 'rejects variables with an unknown type' do
        params = { short_code: 'bad', content: '{{x}}', variables: [{ key: 'x', type: 'colour' }] }

        post base_url, params: params, headers: agent.create_new_auth_token, as: :json

        expect(response).to have_http_status(:unprocessable_entity)
      end
    end
  end

  describe 'PUT /api/v1/accounts/{account.id}/canned_responses/:id' do
    let(:canned_response) { CannedResponse.last }

    context 'when it is an unauthenticated user' do
      it 'returns unauthorized' do
        put "#{base_url}/#{canned_response.id}"

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context 'when it is an authenticated user' do
      it 'lets an administrator update a company template' do
        put "#{base_url}/#{canned_response.id}", params: { short_code: 'B' }, headers: admin.create_new_auth_token, as: :json

        expect(response).to have_http_status(:success)
        expect(canned_response.reload.short_code).to eq('B')
      end

      it 'lets an administrator move a company template into their own library' do
        put "#{base_url}/#{canned_response.id}", params: { scope: 'personal' }, headers: admin.create_new_auth_token, as: :json

        expect(response).to have_http_status(:success)
        expect(canned_response.reload.user_id).to eq(admin.id)
      end

      it 'does not let an agent update a company template' do
        put "#{base_url}/#{canned_response.id}", params: { short_code: 'B' }, headers: agent.create_new_auth_token, as: :json

        expect(response).to have_http_status(:unauthorized)
        expect(canned_response.reload.short_code).to eq('name-short-code')
      end

      it 'lets an agent update their own template' do
        mine = create(:canned_response, account: account, user: agent)

        put "#{base_url}/#{mine.id}", params: { content: 'Updated' }, headers: agent.create_new_auth_token, as: :json

        expect(response).to have_http_status(:success)
        expect(mine.reload.content).to eq('Updated')
      end

      it 'returns not found for another agent personal template' do
        theirs = create(:canned_response, account: account, user: other_agent)

        put "#{base_url}/#{theirs.id}", params: { content: 'Hijacked' }, headers: agent.create_new_auth_token, as: :json

        expect(response).to have_http_status(:not_found)
        expect(theirs.reload.content).not_to eq('Hijacked')
      end
    end
  end

  describe 'DELETE /api/v1/accounts/{account.id}/canned_responses/:id' do
    let(:canned_response) { CannedResponse.last }

    context 'when it is an unauthenticated user' do
      it 'returns unauthorized' do
        delete "#{base_url}/#{canned_response.id}"

        expect(response).to have_http_status(:unauthorized)
      end
    end

    context 'when it is an authenticated user' do
      it 'lets an administrator destroy a company template' do
        delete "#{base_url}/#{canned_response.id}", headers: admin.create_new_auth_token, as: :json

        expect(response).to have_http_status(:success)
        expect(CannedResponse.count).to eq(0)
      end

      it 'does not let an agent destroy a company template' do
        delete "#{base_url}/#{canned_response.id}", headers: agent.create_new_auth_token, as: :json

        expect(response).to have_http_status(:unauthorized)
        expect(CannedResponse.count).to eq(1)
      end

      it 'returns not found for another agent personal template' do
        theirs = create(:canned_response, account: account, user: other_agent)

        delete "#{base_url}/#{theirs.id}", headers: agent.create_new_auth_token, as: :json

        expect(response).to have_http_status(:not_found)
        expect(CannedResponse.exists?(theirs.id)).to be(true)
      end
    end
  end

  describe 'POST /api/v1/accounts/{account.id}/canned_responses/:id/use' do
    let(:canned_response) { CannedResponse.last }

    it 'increments usage_count and records the use for the caller' do
      post "#{base_url}/#{canned_response.id}/use", headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:success)
      expect(canned_response.reload.usage_count).to eq(1)
      preference = CannedResponsePreference.find_by(user: agent, canned_response: canned_response)
      expect(preference.use_count).to eq(1)
      expect(preference.last_used_at).to be_present
      expect(response.parsed_body['last_used_at']).to be_present
    end

    it 'returns not found for another agent personal template' do
      theirs = create(:canned_response, account: account, user: other_agent)

      post "#{base_url}/#{theirs.id}/use", headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe 'POST /api/v1/accounts/{account.id}/canned_responses/:id/generate' do
    let(:template) { create(:canned_response, account: account, ai_prompt: true, content: 'Explain the shipping date kindly') }
    let(:inbox) { create(:inbox, account: account) }
    let(:conversation) { create(:conversation, account: account, inbox: inbox) }
    let(:generator) { instance_double(ReplyTemplates::DraftGeneratorService, perform: 'Your plant ships Monday.') }

    before { create(:inbox_member, user: agent, inbox: inbox) }

    it 'returns a draft generated from the given instructions' do
      allow(ReplyTemplates::DraftGeneratorService).to receive(:new).and_return(generator)

      post "#{base_url}/#{template.id}/generate",
           params: { conversation_id: conversation.display_id, instructions: 'Ship date is Monday' },
           headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:success)
      expect(response.parsed_body).to eq('draft' => 'Your plant ships Monday.')
      expect(ReplyTemplates::DraftGeneratorService).to have_received(:new)
        .with(conversation: conversation, user: agent, instructions: 'Ship date is Monday')
    end

    it 'falls back to the template content when no instructions are sent' do
      allow(ReplyTemplates::DraftGeneratorService).to receive(:new).and_return(generator)

      post "#{base_url}/#{template.id}/generate", params: { conversation_id: conversation.display_id },
                                                  headers: agent.create_new_auth_token, as: :json

      expect(ReplyTemplates::DraftGeneratorService).to have_received(:new)
        .with(conversation: conversation, user: agent, instructions: 'Explain the shipping date kindly')
    end

    it 'does not let an agent draft for a conversation outside their inboxes' do
      other_conversation = create(:conversation, account: account, inbox: create(:inbox, account: account))

      post "#{base_url}/#{template.id}/generate", params: { conversation_id: other_conversation.display_id },
                                                  headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it 'explains when AI is not configured' do
      allow(ReplyTemplates::DraftGeneratorService).to receive(:new)
        .and_raise(ReplyTemplates::DraftGeneratorService::NotConfiguredError, 'DEEPSEEK_API_KEY is not set')

      post "#{base_url}/#{template.id}/generate", params: { conversation_id: conversation.display_id },
                                                  headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body['error']).to include('DEEPSEEK_API_KEY')
    end

    it 'reports a failed generation as a bad gateway' do
      allow(generator).to receive(:perform).and_raise(ReplyTemplates::DraftGeneratorService::GenerationError, 'DeepSeek declined')
      allow(ReplyTemplates::DraftGeneratorService).to receive(:new).and_return(generator)

      post "#{base_url}/#{template.id}/generate", params: { conversation_id: conversation.display_id },
                                                  headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:bad_gateway)
      expect(response.parsed_body['error']).to eq('DeepSeek declined')
    end
  end

  describe 'favorites' do
    let(:first) { create(:canned_response, account: account, short_code: 'first') }
    let(:second) { create(:canned_response, account: account, short_code: 'second') }

    it 'favorites, reorders and unfavorites templates for the caller only' do
      post "#{base_url}/#{first.id}/favorite", headers: agent.create_new_auth_token, as: :json
      post "#{base_url}/#{second.id}/favorite", headers: agent.create_new_auth_token, as: :json
      expect(response.parsed_body).to include('favorite' => true, 'favorite_position' => 1)

      patch "#{base_url}/favorites", params: { ids: [second.id, first.id] }, headers: agent.create_new_auth_token, as: :json
      expect(response).to have_http_status(:success)

      get base_url, headers: agent.create_new_auth_token, as: :json
      expect(response.parsed_body.first(2).map { |r| [r['id'], r['favorite_position']] }).to eq([[second.id, 0], [first.id, 1]])

      delete "#{base_url}/#{second.id}/favorite", headers: agent.create_new_auth_token, as: :json
      expect(response.parsed_body).to include('favorite' => false)

      get base_url, headers: admin.create_new_auth_token, as: :json
      expect(response.parsed_body.pluck('favorite').uniq).to eq([false])
    end

    it 'returns not found when favoriting another agent personal template' do
      theirs = create(:canned_response, account: account, user: other_agent)

      post "#{base_url}/#{theirs.id}/favorite", headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end
end
