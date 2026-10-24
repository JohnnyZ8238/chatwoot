class AddAiPromptToCannedResponses < ActiveRecord::Migration[7.2]
  def change
    # true: the content is instructions for Claude to draft a reply, not the reply itself
    add_column :canned_responses, :ai_prompt, :boolean, null: false, default: false
  end
end
