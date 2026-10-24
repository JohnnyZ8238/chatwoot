require 'rails_helper'

RSpec.describe ReplyTemplates::DraftGeneratorService do
  let(:account) { create(:account, name: 'ivybid') }
  let(:agent) { create(:user, account: account, role: :agent, name: 'Sean Mo') }
  let(:contact) { create(:contact, account: account, name: 'Emily Zhang') }
  let(:inbox) { create(:inbox, account: account) }
  let(:conversation) { create(:conversation, account: account, inbox: inbox, contact: contact) }
  let(:messages_url) { 'https://api.anthropic.com/v1/messages' }

  let(:claude_reply) do
    {
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
      content: [{ type: 'text', text: 'Hi Emily, your Agave ships Monday.' }],
      stop_reason: 'end_turn', stop_sequence: nil,
      usage: { input_tokens: 120, output_tokens: 12 }
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

  context 'with an API key' do
    around { |example| with_modified_env(ANTHROPIC_API_KEY: 'test-key') { example.run } }

    it 'returns the draft text from Claude' do
      stub_request(:post, messages_url).to_return(status: 200, body: claude_reply.to_json, headers: { 'Content-Type' => 'application/json' })

      expect(service.perform).to eq('Hi Emily, your Agave ships Monday.')
    end

    it 'sends the template instructions and the public transcript, not private notes' do
      stub_request(:post, messages_url).to_return(status: 200, body: claude_reply.to_json, headers: { 'Content-Type' => 'application/json' })

      service.perform

      expect(WebMock).to(have_requested(:post, messages_url).with do |request|
        body = JSON.parse(request.body)
        prompt = body['messages'].first['content'].to_s
        body['model'] == 'claude-opus-5-5' &&
          prompt.include?('Tell them it ships Monday. Be warm.') &&
          prompt.include?('When will my Agave ship?') &&
          prompt.include?('Emily Zhang') &&
          !prompt.include?('check the grower')
      end)
    end

    it 'raises a generation error when Claude declines' do
      refused = claude_reply.merge(content: [], stop_reason: 'refusal')
      stub_request(:post, messages_url).to_return(status: 200, body: refused.to_json, headers: { 'Content-Type' => 'application/json' })

      expect { service.perform }.to raise_error(ReplyTemplates::DraftGeneratorService::GenerationError)
    end

    it 'raises a generation error when the API fails' do
      stub_request(:post, messages_url).to_return(status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'bad' } }.to_json,
                                                  headers: { 'Content-Type' => 'application/json' })

      expect { service.perform }.to raise_error(ReplyTemplates::DraftGeneratorService::GenerationError)
    end
  end

  it 'raises a not-configured error without an API key' do
    with_modified_env(ANTHROPIC_API_KEY: nil) do
      expect { service.perform }.to raise_error(ReplyTemplates::DraftGeneratorService::NotConfiguredError)
    end
  end
end
