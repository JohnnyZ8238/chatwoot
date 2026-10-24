# == Schema Information
#
# Table name: canned_response_preferences
#
#  id                 :bigint           not null, primary key
#  favorite           :boolean          default(FALSE), not null
#  favorite_position  :integer
#  last_used_at       :datetime
#  use_count          :integer          default(0), not null
#  created_at         :datetime         not null
#  updated_at         :datetime         not null
#  account_id         :bigint           not null
#  canned_response_id :bigint           not null
#  user_id            :bigint           not null
#
# Indexes
#
#  index_canned_response_preferences_on_account_id_and_user_id  (account_id,user_id)
#  index_canned_response_preferences_on_canned_response_id      (canned_response_id)
#  index_canned_response_preferences_unique                     (user_id,canned_response_id) UNIQUE
#

# One user's favorite flag, favorite order and usage of one reply template.
class CannedResponsePreference < ApplicationRecord
  belongs_to :account
  belongs_to :user
  belongs_to :canned_response

  validates :canned_response_id, uniqueness: { scope: :user_id }

  scope :favorites, -> { where(favorite: true) }
end
