class CannedResponseCategoryPolicy < ApplicationPolicy
  def index?
    true
  end

  def create?
    true
  end

  def update?
    return @account_user.administrator? if @record.company?

    @record.user_id == @user.id
  end

  def destroy?
    update?
  end
end
