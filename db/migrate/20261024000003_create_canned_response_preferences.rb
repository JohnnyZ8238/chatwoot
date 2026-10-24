class CreateCannedResponsePreferences < ActiveRecord::Migration[7.2]
  def change
    create_table :canned_response_preferences do |t|
      t.bigint :account_id, null: false
      t.bigint :user_id, null: false
      t.bigint :canned_response_id, null: false
      t.boolean :favorite, null: false, default: false
      t.integer :favorite_position
      t.integer :use_count, null: false, default: 0
      t.datetime :last_used_at
      t.timestamps
    end

    add_index :canned_response_preferences, [:user_id, :canned_response_id], unique: true, name: 'index_canned_response_preferences_unique'
    add_index :canned_response_preferences, [:account_id, :user_id]
    add_index :canned_response_preferences, :canned_response_id
  end
end
