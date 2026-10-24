# == Schema Information
#
# Table name: canned_responses
#
#  id                          :integer          not null, primary key
#  content                     :text
#  short_code                  :string
#  title                       :string
#  usage_count                 :integer          default(0), not null
#  variables                   :jsonb            not null
#  created_at                  :datetime         not null
#  updated_at                  :datetime         not null
#  account_id                  :integer          not null
#  canned_response_category_id :bigint
#  user_id                     :bigint
#
# Indexes
#
#  index_canned_responses_on_account_id_and_user_id       (account_id,user_id)
#  index_canned_responses_on_canned_response_category_id  (canned_response_category_id)
#

# A reply template. Company templates have no user; personal templates belong to their user and are visible only to them.
class CannedResponse < ApplicationRecord
  include AccountCacheRevalidator

  VARIABLE_TYPES = %w[text long number money date select yesno].freeze
  VARIABLE_KEY_FORMAT = /\A[a-z][a-z0-9_]*\z/

  belongs_to :account
  belongs_to :user, optional: true
  belongs_to :category, class_name: 'CannedResponseCategory', foreign_key: :canned_response_category_id,
                        optional: true, inverse_of: :canned_responses
  has_many :preferences, class_name: 'CannedResponsePreference', dependent: :delete_all

  before_validation :normalize_variables

  validates :content, presence: true
  validates :short_code, presence: true
  validates :account, presence: true
  validate :short_code_available
  validate :variables_format
  validate :category_in_same_library

  scope :company, -> { where(user_id: nil) }
  # Company templates plus the user's own; anything that isn't a user (an agent bot token) sees the company library only
  scope :visible_to, ->(user) { user.is_a?(User) ? where(user_id: [nil, user.id]) : company }

  scope :order_by_search, lambda { |search|
    short_code_starts_with = sanitize_sql_array(['WHEN short_code ILIKE ? THEN 1', "#{search}%"])
    short_code_like = sanitize_sql_array(['WHEN short_code ILIKE ? THEN 0.5', "%#{search}%"])
    content_like = sanitize_sql_array(['WHEN content ILIKE ? THEN 0.2', "%#{search}%"])

    order_clause = "CASE #{short_code_starts_with} #{short_code_like} #{content_like} ELSE 0 END"

    order(Arel.sql(order_clause) => :desc)
  }

  def company?
    user_id.nil?
  end

  def as_template_json(preference = nil)
    favorite = preference&.favorite || false
    as_json.merge(
      'scope' => company? ? 'company' : 'personal',
      'title' => title.presence || short_code,
      'favorite' => favorite,
      'favorite_position' => favorite ? preference.favorite_position : nil,
      'last_used_at' => preference&.last_used_at,
      'user_use_count' => preference&.use_count || 0
    )
  end

  private

  # A personal short code may not shadow a company one or another of the owner's; different agents may reuse a code
  def short_code_available
    return if short_code.blank? || account_id.blank?

    clashes = CannedResponse.where(account_id: account_id, short_code: short_code).where.not(id: id)
    clashes = company? ? clashes.company : clashes.where(user_id: [nil, user_id])
    errors.add(:short_code, :taken) if clashes.exists?
  end

  def normalize_variables
    return unless variables.is_a?(Array)

    self.variables = variables.map { |field| field.respond_to?(:to_h) ? normalize_variable(field.to_h.with_indifferent_access) : field }
  end

  def normalize_variable(field)
    {
      'key' => field[:key].to_s.strip,
      'label' => field[:label].to_s.strip.presence || field[:key].to_s.humanize,
      'type' => field[:type].to_s.presence || 'text',
      'required' => ActiveModel::Type::Boolean.new.cast(field[:required]) || false,
      'default' => field[:default].to_s,
      'options' => Array(field[:options]).map(&:to_s)
    }
  end

  def variables_format
    return errors.add(:variables, 'must be a list of fields') unless variables.is_a?(Array)

    keys = variables.map { |field| field.is_a?(Hash) ? field['key'] : nil }
    errors.add(:variables, 'has an invalid field') unless variables.all? { |field| valid_variable?(field) }
    errors.add(:variables, 'has a duplicate field') if keys.uniq.size != keys.size
  end

  def valid_variable?(field)
    field.is_a?(Hash) && VARIABLE_KEY_FORMAT.match?(field['key'].to_s) && VARIABLE_TYPES.include?(field['type'])
  end

  def category_in_same_library
    return if category.blank?
    return if category.account_id == account_id && category.user_id == user_id

    errors.add(:category, 'must belong to the same library')
  end
end
