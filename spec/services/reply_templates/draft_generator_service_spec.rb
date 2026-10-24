require 'rails_helper'

RSpec.describe ReplyTemplates::DraftGeneratorService do
  let(:account) { create(:account, name: 'ivybid') }
  let(:agent) { create(:user, account: account, role: :agent, name: 'Sean Mo') }
  let(:contact) { create(:contact, account: account, name: 'Emily Zhang') }
  let(:inbox) { create(:inbox, account: account) }
  let(:conversation) { create(:conversation, account: account, inbox: inbox, contact: contact) }
  let(:completions_url) { 'https://api.deepseek.com/v1/chat/completions' }

  let(:deepseek_reply) do
    {
      id: 'chatcmpl-1', object: 'chat.completion', model: 'deepseek-chat',
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hi Emily, your Agave ships Monday.' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 12, total_tokens: 132 }
    }
  end

  before do
    create(:message, conversation: conversation, account: account, inbox: inbox, message_type: :incoming,
                     sender: contact, content: 'When will my Agave ship?')
    create(:message, conversation: conversation, account: account, inbox: inbox, message_type: :outgoing,
                     sender: agent, content: 'Internal: check the grower', private: true)
  end

  def service
    described_class.new(conversation: conversation, user: agent, instructions: 'Tell them it ships Monday. Be warm.')
  end

  def stub_deepseek(body, status: 200)
    stub_request(:post, completions_url).to_return(status: status, body: body.to_json, headers: { 'Content-Type' => 'application/json' })
  end

  context 'with an API key' do
    around { |example| with_modified_env(DEEPSEEK_API_KEY: 'test-key') { example.run } }

    it 'returns the draft text from DeepSeek' do
      stub_deepseek(deepseek_reply)

      expect(service.perform).to eq('Hi Emily, your Agave ships Monday.')
    end

    it 'sends the template instructions and the public transcript, not private notes' do
      stub_deepseek(deepseek_reply)

      service.perform

      expect(WebMock).to(have_requested(:post, completions_url).with do |request|
        body = JSON.parse(request.body)
        prompt = body['messages'].last['content'].to_s
        body['model'] == 'deepseek-chat' &&
          body['messages'].first['role'] == 'system' &&
          request.headers['Authorization'] == 'Bearer test-key' &&
          prompt.include?('Tell them it ships Monday. Be warm.') &&
          prompt.include?('When will my Agave ship?') &&
          prompt.include?('Emily Zhang') &&
          prompt.exclude?('check the grower')
      end)
    end

    it 'raises a generation error when the reply is filtered' do
      filtered = deepseek_reply.merge(choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'content_filter' }])
      stub_deepseek(filtered)

      expect { service.perform }.to raise_error(ReplyTemplates::DraftGeneratorService::GenerationError)
    end

    it 'raises a generation error when the API fails' do
      stub_deepseek({ error: { message: 'Insufficient Balance', type: 'unknown_error' } }, status: 402)

      expect { service.perform }.to raise_error(ReplyTemplates::DraftGeneratorService::GenerationError)
    end
  end

  it 'uses the key and model saved in the account settings over the server ones' do
    ReplyTemplates::AiSettings.new(account).update!(api_key: 'account-key', model: 'deepseek-reasoner')
    stub_deepseek(deepseek_reply)

    with_modified_env(DEEPSEEK_API_KEY: 'server-key') { service.perform }

    expect(WebMock).to(have_requested(:post, completions_url).with do |request|
      request.headers['Authorization'] == 'Bearer account-key' && JSON.parse(request.body)['model'] == 'deepseek-reasoner'
    end)
  end

  it 'raises a not-configured error without an API key' do
    with_modified_env(DEEPSEEK_API_KEY: nil) do
      expect { service.perform }.to raise_error(ReplyTemplates::DraftGeneratorService::NotConfiguredError)
    end
  end
end
