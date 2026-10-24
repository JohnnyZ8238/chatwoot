# Drafts a reply with Claude: an AI prompt template gives the instructions, the conversation gives the context.
# The agent reviews and edits the draft before sending it.
class ReplyTemplates::DraftGeneratorService
  class NotConfiguredError < StandardError; end
  class GenerationError < StandardError; end

  DEFAULT_MODEL = 'claude-opus-5-5'.freeze
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
    raise NotConfiguredError, 'AI drafts need ANTHROPIC_API_KEY set on the Chatwoot server' if api_key.blank?

    message = client.messages.create(
      model: model,
      max_tokens: 4096,
      output_config: { effort: :low },
      system_: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      request_options: { timeout: REQUEST_TIMEOUT }
    )
    draft_from(message)
  rescue Anthropic::Errors::APIError => e
    raise GenerationError, "Claude could not draft this reply: #{e.message}"
  end

  private

  attr_reader :conversation, :user, :instructions

  def draft_from(message)
    raise GenerationError, 'Claude declined to draft this reply' if message.stop_reason == :refusal

    draft = message.content.select { |block| block.type == :text }.map(&:text).join.strip
    raise GenerationError, 'Claude returned an empty draft' if draft.blank?

    draft
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
    Anthropic::Client.new(api_key: api_key)
  end

  def api_key
    ENV.fetch('ANTHROPIC_API_KEY', nil)
  end

  def model
    ENV.fetch('REPLY_TEMPLATES_AI_MODEL', DEFAULT_MODEL)
  end
end
