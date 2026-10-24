# Drafts a reply with DeepSeek: an AI prompt template gives the instructions, the conversation gives the context.
# The agent reviews and edits the draft before sending it. DeepSeek speaks the OpenAI API, so the ruby-openai client is used.
class ReplyTemplates::DraftGeneratorService
  class NotConfiguredError < StandardError; end
  class GenerationError < StandardError; end

  DEFAULT_BASE_URL = 'https://api.deepseek.com/'.freeze
  TRANSCRIPT_LIMIT = 40
  REQUEST_TIMEOUT = 60

  SYSTEM_PROMPT = <<~PROMPT.freeze
    You draft replies for a customer support agent. The agent reads and edits your draft before sending it, so write only the reply the customer will see: no preamble, no notes to the agent, no bracketed placeholders.
    Follow the template instructions. Take facts only from the conversation and the instructions; if something the reply needs is missing, write around it rather than inventing it.
    Write in the language the customer uses, in a friendly, professional tone, and keep the length proportionate to what they asked.
  PROMPT

  def initialize(conversation:, user:, instructions:)
    @conversation = conversation
    @user = user
    @instructions = instructions
  end

  def perform
    raise NotConfiguredError, 'AI drafts need a DeepSeek API key: an administrator can add it in Settings → Canned Responses' if api_key.blank?

    response = client.chat(
      parameters: {
        model: model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
        temperature: 0.7
      }
    )
    draft_from(response)
  rescue Faraday::Error => e
    raise GenerationError, "DeepSeek could not draft this reply: #{api_error_message(e)}"
  end

  private

  attr_reader :conversation, :user, :instructions

  def draft_from(response)
    choice = response.dig('choices', 0) || {}
    raise GenerationError, 'DeepSeek declined to draft this reply' if choice['finish_reason'] == 'content_filter'

    draft = choice.dig('message', 'content').to_s.strip
    raise GenerationError, 'DeepSeek returned an empty draft' if draft.blank?

    draft
  end

  def api_error_message(error)
    body = error.response&.dig(:body)
    parsed = body.is_a?(String) ? JSON.parse(body) : body
    parsed&.dig('error', 'message') || error.message
  rescue JSON::ParserError
    error.message
  end

  def prompt
    <<~PROMPT
      <business>#{conversation.account.name}</business>
      <agent>#{user.name}</agent>
      <customer>#{customer}</customer>
      <channel>#{conversation.inbox.name}</channel>
      <conversation>
      #{transcript}
      </conversation>
      <template_instructions>
      #{instructions}
      </template_instructions>
      Draft the agent's next reply.
    PROMPT
  end

  def customer
    contact = conversation.contact
    [contact&.name, contact&.email].compact_blank.join(', ')
  end

  # The latest public messages, oldest first; private notes stay internal
  def transcript
    conversation.messages.where(private: false, message_type: %i[incoming outgoing])
                .reorder(created_at: :desc).limit(TRANSCRIPT_LIMIT).to_a.reverse
                .select { |message| message.content.present? }
                .map { |message| "#{speaker(message)}: #{message.content}" }
                .join("\n")
  end

  def speaker(message)
    return 'Customer' if message.incoming?

    "Agent (#{message.sender.try(:name) || 'team'})"
  end

  def client
    OpenAI::Client.new(access_token: api_key, uri_base: base_url, request_timeout: REQUEST_TIMEOUT)
  end

  def ai_settings
    @ai_settings ||= ReplyTemplates::AiSettings.new(conversation.account)
  end

  def api_key
    ai_settings.api_key
  end

  def model
    ai_settings.model
  end

  def base_url
    ENV.fetch('DEEPSEEK_BASE_URL', DEFAULT_BASE_URL)
  end
end
