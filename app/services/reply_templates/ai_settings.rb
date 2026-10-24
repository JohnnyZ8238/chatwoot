# The account's DeepSeek key and model for AI drafts, set by an administrator in Settings → Canned Responses.
# Kept in internal_attributes, which the dashboard API never serializes; the server env is the fallback.
class ReplyTemplates::AiSettings
  KEY = 'reply_templates_ai'.freeze
  DEFAULT_MODEL = 'deepseek-chat'.freeze
  MAX_MODEL_LENGTH = 100

  def initialize(account)
    @account = account
  end

  def api_key
    stored['api_key'].presence || ENV.fetch('DEEPSEEK_API_KEY', nil).presence
  end

  def model
    stored['model'].presence || ENV.fetch('REPLY_TEMPLATES_AI_MODEL', nil).presence || DEFAULT_MODEL
  end

  # A blank api_key keeps the saved one; clear_api_key removes it
  def update!(api_key: nil, model: nil, clear_api_key: false)
    values = stored.dup
    values['api_key'] = api_key.strip if api_key.present?
    values.delete('api_key') if clear_api_key
    values['model'] = model.to_s.strip.first(MAX_MODEL_LENGTH) if model.present?
    account.update!(internal_attributes: account.internal_attributes.merge(KEY => values))
  end

  def as_json(*)
    {
      'configured' => api_key.present?,
      'source' => source,
      'key_hint' => api_key&.last(4),
      'model' => model
    }
  end

  private

  attr_reader :account

  def stored
    account.internal_attributes[KEY] || {}
  end

  def source
    return 'account' if stored['api_key'].present?

    'server' if api_key.present?
  end
end
