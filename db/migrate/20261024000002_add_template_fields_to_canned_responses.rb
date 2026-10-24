class AddTemplateFieldsToCannedResponses < ActiveRecord::Migration[7.2]
  def change
    change_table :canned_responses, bulk: true do |t|
      t.string :title
      # null for the company library, the owner for a personal template
      t.bigint :user_id
      t.bigint :canned_response_category_id
      # fields the agent fills in: [{ key, label, type, required, default, options }]
      t.jsonb :variables, null: false, default: []
      t.integer :usage_count, null: false, default: 0
    end

    add_index :canned_responses, [:account_id, :user_id]
    add_index :canned_responses, :canned_response_category_id
  end
end
