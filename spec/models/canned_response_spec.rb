require 'rails_helper'

RSpec.describe CannedResponse do
  let(:account) { create(:account) }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:other_agent) { create(:user, account: account, role: :agent) }

  describe 'associations' do
    it { is_expected.to belong_to(:account) }
    it { is_expected.to belong_to(:user).optional }
    it { is_expected.to belong_to(:category).class_name('CannedResponseCategory').optional }
  end

  describe 'short code' do
    it 'rejects a personal short code that a company template uses' do
      create(:canned_response, account: account, short_code: 'ship')
      personal = build(:canned_response, account: account, user: agent, short_code: 'ship')

      expect(personal).not_to be_valid
      expect(personal.errors[:short_code]).to be_present
    end

    it 'allows two agents to own the same personal short code' do
      create(:canned_response, account: account, user: agent, short_code: 'vip')
      other = build(:canned_response, account: account, user: other_agent, short_code: 'vip')

      expect(other).to be_valid
    end

    it 'rejects a company short code already used by another company template' do
      create(:canned_response, account: account, short_code: 'ship')
      duplicate = build(:canned_response, account: account, short_code: 'ship')

      expect(duplicate).not_to be_valid
    end
  end

  describe 'variables' do
    it 'accepts well formed field definitions' do
      template = build(:canned_response, account: account,
                                         variables: [{ key: 'ship_date', label: 'Ship date', type: 'date', required: true },
                                                     { key: 'carrier', type: 'select', options: %w[UPS Purolator] }])

      expect(template).to be_valid
    end

    it 'rejects variables with an unknown type' do
      template = build(:canned_response, account: account, variables: [{ key: 'a', type: 'colour' }])

      expect(template).not_to be_valid
      expect(template.errors[:variables]).to be_present
    end

    it 'rejects variables with a bad key' do
      template = build(:canned_response, account: account, variables: [{ key: 'Order No', type: 'text' }])

      expect(template).not_to be_valid
    end
  end

  describe 'category' do
    it 'rejects a category from another owner' do
      personal_category = create(:canned_response_category, account: account, user: agent)
      template = build(:canned_response, account: account, category: personal_category)

      expect(template).not_to be_valid
      expect(template.errors[:category]).to be_present
    end

    it 'accepts a company category on a company template' do
      company_category = create(:canned_response_category, account: account)
      template = build(:canned_response, account: account, category: company_category)

      expect(template).to be_valid
    end
  end

  describe '.visible_to' do
    it 'returns company templates and the user own personal templates only' do
      company = create(:canned_response, account: account)
      mine = create(:canned_response, account: account, user: agent)
      create(:canned_response, account: account, user: other_agent)

      expect(account.canned_responses.visible_to(agent)).to contain_exactly(company, mine)
    end
  end

  describe '#as_template_json' do
    let(:template) { create(:canned_response, account: account, user: agent, short_code: 'vip', title: nil) }

    it 'adds scope, title fallback and the preference values' do
      preference = create(:canned_response_preference, canned_response: template, user: agent,
                                                       favorite: true, favorite_position: 2, use_count: 4)

      json = template.as_template_json(preference)

      expect(json).to include('scope' => 'personal', 'title' => 'vip', 'favorite' => true,
                              'favorite_position' => 2, 'user_use_count' => 4)
    end

    it 'defaults the preference values when there is none' do
      json = create(:canned_response, account: account).as_template_json

      expect(json).to include('scope' => 'company', 'favorite' => false, 'favorite_position' => nil, 'last_used_at' => nil)
    end
  end
end
