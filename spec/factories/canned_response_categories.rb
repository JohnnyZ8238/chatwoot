# frozen_string_literal: true

FactoryBot.define do
  factory :canned_response_category do
    account
    sequence(:name) { |n| "Category #{n}" }
  end

  factory :canned_response_preference do
    canned_response
    user
    account { canned_response.account }
  end
end
