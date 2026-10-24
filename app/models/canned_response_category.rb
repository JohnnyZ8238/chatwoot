# == Schema Information
#
# Table name: canned_response_categories
#
#  id         :bigint           not null, primary key
#  name       :string           not null
#  position   :integer          default(0), not null
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  account_id :bigint           not null
#  user_id    :bigint
#
# Indexes
#
#  index_canned_response_categories_unique_name  (account_id,user_id,name) UNIQUE
#

# A category in the company template library (no user) or in one user's personal library.
class CannedResponseCategory < ApplicationRecord
  belongs_to :account
  belongs_to :user, optional: true
  has_many :canned_responses, inverse_of: :category, dependent: :nullify

  validates :name, presence: true, length: { maximum: 80 }, uniqueness: { scope: [:account_id, :user_id] }

  # templates lose their category with update_all, so tell the dashboards to refetch them
  after_destroy_commit -> { account&.update_cache_key('canned_response') }

  scope :company, -> { where(user_id: nil) }
  scope :visible_to, ->(user) { user.is_a?(User) ? where(user_id: [nil, user.id]) : company }
  scope :ordered, -> { order(:position, :id) }

  def company?
    user_id.nil?
  end

  def as_category_json
    { 'id' => id, 'name' => name, 'position' => position, 'scope' => company? ? 'company' : 'personal' }
  end
end
