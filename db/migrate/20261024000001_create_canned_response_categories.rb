class CreateCannedResponseCategories < ActiveRecord::Migration[7.2]
  def change
    create_table :canned_response_categories do |t|
      t.bigint :account_id, null: false
      # null for the company library, the owner for a personal library
      t.bigint :user_id
      t.string :name, null: false
      t.integer :position, null: false, default: 0
      t.timestamps
    end

    add_index :canned_response_categories, [:account_id, :user_id, :name], unique: true, name: 'index_canned_response_categories_unique_name'
  end
end
