class CannedResponsePolicy < ApplicationPolicy
  def index?
    true
  end

  def create?
    true
  end

  # Company templates are changed by administrators, personal templates by their owner
  def update?
    return @account_user.administrator? if @record.company?

    @record.user_id == @user.id
  end

  def destroy?
    update?
  end
end
