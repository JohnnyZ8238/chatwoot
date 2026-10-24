import { computed, unref } from 'vue';
import { useMapGetter } from 'dashboard/composables/store';
import { getExtraVariables } from 'dashboard/helper/replyTemplates';

/**
 * The conversation's variables plus the ones reply templates add (dates, greeting, account name).
 * @param {import('vue').Ref<Object>|Object} variables - variables of the conversation being replied to
 * @returns {import('vue').ComputedRef<Object>}
 */
export function useReplyTemplateVariables(variables) {
  const currentAccountId = useMapGetter('getCurrentAccountId');
  const getAccount = useMapGetter('accounts/getAccount');

  return computed(() => ({
    ...getExtraVariables(
      new Date(),
      getAccount.value(currentAccountId.value) || {}
    ),
    ...unref(variables),
  }));
}
