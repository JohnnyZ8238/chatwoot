require 'rails_helper'

RSpec.describe CannedResponseCategory do
  let(:account) { create(:account) }
  let(:agent) { create(:user, account: account, role: :agent) }

  describe 'validations' do
    it 'rejects a duplicate name within the same library' do
      create(:canned_response_category, account: account, name: 'Shipping')

      expect(build(:canned_response_category, account: account, name: 'Shipping')).not_to be_valid
    end

    it 'allows the same name in a personal library' do
      create(:canned_response_category, account: account, name: 'Shipping')

      expect(build(:canned_response_category, account: account, user: agent, name: 'Shipping')).to be_valid
    end
  end

  it 'destroying a category nullifies its templates' do
    category = create(:canned_response_category, account: account)
    template = create(:canned_response, account: account, category: category)

    category.destroy!

    expect(template.reload.canned_response_category_id).to be_nil
  end
end
