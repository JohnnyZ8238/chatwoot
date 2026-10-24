# Which library a new reply template or category goes into.
# Administrators choose with `scope` (company by default); everyone else always gets their personal library.
module CannedResponseLibraryHelper
  private

  def library_owner
    return Current.user unless Current.account_user&.administrator?

    params[:scope] == 'personal' ? Current.user : nil
  end

  def company_library_requested?
    params[:scope] == 'company'
  end
end
