class Api::V1::Accounts::CannedResponseCategoriesController < Api::V1::Accounts::BaseController
  include CannedResponseLibraryHelper

  before_action :fetch_category, only: [:update, :destroy]
  before_action :check_authorization, only: [:update, :destroy]

  def index
    render json: categories.ordered.map(&:as_category_json)
  end

  def create
    owner = library_owner
    siblings = Current.account.canned_response_categories.where(user_id: owner&.id)
    category = siblings.new(name: params[:name], position: (siblings.maximum(:position) || -1) + 1)
    category.save!
    render json: category.as_category_json
  end

  def update
    @category.update!(params.permit(:name, :position))
    render json: @category.as_category_json
  end

  def destroy
    @category.destroy!
    head :ok
  end

  def reorder
    raise Pundit::NotAuthorizedError if company_library_requested? && !Current.account_user.administrator?

    library = company_library_requested? ? categories.company : categories.where(user_id: Current.user.id)
    ActiveRecord::Base.transaction do
      Array(params[:ids]).map(&:to_i).each_with_index do |id, position|
        library.where(id: id).update_all(position: position) # rubocop:disable Rails/SkipsModelValidations
      end
    end
    head :ok
  end

  private

  def categories
    Current.account.canned_response_categories.visible_to(Current.user)
  end

  def fetch_category
    @category = categories.find(params[:id])
  end

  # The policy decides on the record (company vs owner), not the class
  def check_authorization
    authorize(@category)
  end
end
