# The DeepSeek key and model behind AI drafts. Everyone can see whether a key is set; only administrators change it.
class Api::V1::Accounts::ReplyTemplateAiSettingsController < Api::V1::Accounts::BaseController
  before_action :check_admin_authorization?, only: [:update]

  def show
    render json: settings
  end

  def update
    settings.update!(api_key: params[:api_key], model: params[:model],
                     clear_api_key: ActiveModel::Type::Boolean.new.cast(params[:clear_api_key]))
    render json: ReplyTemplates::AiSettings.new(Current.account.reload)
  end

  private

  def settings
    @settings ||= ReplyTemplates::AiSettings.new(Current.account)
  end
end
