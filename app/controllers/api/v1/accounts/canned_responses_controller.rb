class Api::V1::Accounts::CannedResponsesController < Api::V1::Accounts::BaseController
  include CannedResponseLibraryHelper

  before_action :fetch_canned_response, except: [:index, :create, :reorder_favorites]
  before_action :check_authorization, only: [:update, :destroy]

  def index
    records = canned_responses.to_a
    preferences = current_preferences.where(canned_response_id: records.map(&:id)).index_by(&:canned_response_id)
    records = favorites_first(records, preferences) if params[:search].blank?

    render json: records.map { |record| record.as_template_json(preferences[record.id]) }
  end

  def create
    @canned_response = Current.account.canned_responses.new(canned_response_params)
    @canned_response.user = library_owner
    @canned_response.save!
    render json: @canned_response.as_template_json
  end

  def update
    @canned_response.assign_attributes(canned_response_params)
    @canned_response.user = library_owner if params[:scope].present? && Current.account_user.administrator?
    @canned_response.save!
    render json: @canned_response.as_template_json(preference)
  end

  def destroy
    @canned_response.destroy!
    head :ok
  end

  # Usage is the caller's own record; it does not touch the template, so other dashboards are not told to refetch
  def use
    @canned_response.increment!(:usage_count)
    record = preference || build_preference
    record.update!(use_count: record.use_count + 1, last_used_at: Time.current)
    render json: @canned_response.as_template_json(record)
  end

  def favorite
    record = preference || build_preference
    record.update!(favorite: true, favorite_position: next_favorite_position) unless record.favorite
    render json: @canned_response.as_template_json(record)
  end

  def unfavorite
    record = preference
    record&.update!(favorite: false, favorite_position: nil)
    render json: @canned_response.as_template_json(record)
  end

  def reorder_favorites
    ids = Array(params[:ids]).map(&:to_i)
    ActiveRecord::Base.transaction do
      ids.each_with_index do |id, position|
        current_preferences.favorites.where(canned_response_id: id).update_all(favorite_position: position) # rubocop:disable Rails/SkipsModelValidations
      end
    end
    head :ok
  end

  private

  # Someone else's personal template is not found rather than forbidden, so its id gives nothing away
  def fetch_canned_response
    @canned_response = Current.account.canned_responses.visible_to(Current.user).find(params[:id])
  end

  # The policy decides on the record (company vs owner), not the class
  def check_authorization
    authorize(@canned_response)
  end

  def canned_response_params
    # a scope-only update (moving between libraries) wraps to an empty hash, which `require` rejects
    params.fetch(:canned_response, ActionController::Parameters.new).permit(
      :short_code, :content, :title, :canned_response_category_id,
      variables: [:key, :label, :type, :required, :default, { options: [] }]
    )
  end

  def canned_responses
    records = Current.account.canned_responses.visible_to(Current.user)
    return records.order(usage_count: :desc, id: :asc) if params[:search].blank?

    search = params[:search].delete("\0")
    records.where('short_code ILIKE :search OR content ILIKE :search', search: "%#{search}%").order_by_search(search)
  end

  def favorites_first(records, preferences)
    records.each_with_index.sort_by do |record, index|
      record_preference = preferences[record.id]
      record_preference&.favorite ? [0, record_preference.favorite_position || 0, index] : [1, 0, index]
    end.map(&:first)
  end

  def current_preferences
    CannedResponsePreference.where(account_id: Current.account.id, user_id: Current.user.id)
  end

  def preference
    @preference ||= current_preferences.find_by(canned_response_id: @canned_response.id)
  end

  def build_preference
    CannedResponsePreference.new(account: Current.account, user: Current.user, canned_response: @canned_response)
  end

  def next_favorite_position
    (current_preferences.favorites.maximum(:favorite_position) || -1) + 1
  end
end
