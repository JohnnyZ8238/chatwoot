<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import ReplyTemplateAiSettingsAPI from 'dashboard/api/replyTemplateAiSettings';
import Button from 'dashboard/components-next/button/Button.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';

defineProps({
  isAdmin: { type: Boolean, default: false },
});

const MODELS = ['deepseek-chat', 'deepseek-reasoner'];

const { t } = useI18n();
const status = ref(null);
const apiKey = ref('');
const model = ref('deepseek-chat');
const isSaving = ref(false);

const modelOptions = computed(() =>
  MODELS.includes(model.value) ? MODELS : [...MODELS, model.value]
);

const apply = data => {
  status.value = data;
  model.value = data.model || 'deepseek-chat';
};

const save = async (extra = {}) => {
  const payload = { model: model.value, ...extra };
  // a blank field keeps the saved key
  if (apiKey.value.trim()) payload.api_key = apiKey.value.trim();
  isSaving.value = true;
  try {
    const { data } = await ReplyTemplateAiSettingsAPI.update(payload);
    apply(data);
    apiKey.value = '';
    useAlert(t('REPLY_TEMPLATES.AI_SETTINGS.SAVED'));
  } catch (error) {
    useAlert(
      error?.response?.data?.error || t('REPLY_TEMPLATES.SETTINGS.ERROR')
    );
  } finally {
    isSaving.value = false;
  }
};

const removeKey = () => save({ clear_api_key: true });

onMounted(async () => {
  try {
    const { data } = await ReplyTemplateAiSettingsAPI.get();
    apply(data);
  } catch (error) {
    // the card stays in its loading state
  }
});
</script>

<template>
  <section class="flex flex-col gap-3 p-4 mb-6 border rounded-xl border-n-weak">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Icon icon="i-lucide-sparkles" class="size-4 text-n-brand" />
        <h3 class="mb-0 text-sm font-medium text-n-slate-12">
          {{ t('REPLY_TEMPLATES.AI_SETTINGS.TITLE') }}
        </h3>
      </div>
      <span
        v-if="status"
        data-testid="ai-status"
        class="px-2 py-0.5 text-xs rounded-full"
        :class="
          status.configured
            ? 'bg-n-teal-3 text-n-teal-11'
            : 'bg-n-amber-3 text-n-amber-11'
        "
      >
        <template v-if="status.configured">
          {{ t('REPLY_TEMPLATES.AI_SETTINGS.SET') }}
          <code>{{ `…${status.key_hint}` }}</code>
          {{ `· ${status.model}` }}
        </template>
        <template v-else>
          {{ t('REPLY_TEMPLATES.AI_SETTINGS.NOT_SET') }}
        </template>
      </span>
    </div>
    <p class="mb-0 text-xs text-n-slate-11">
      {{
        isAdmin
          ? t('REPLY_TEMPLATES.AI_SETTINGS.DESCRIPTION')
          : t('REPLY_TEMPLATES.AI_SETTINGS.AGENT_NOTE')
      }}
    </p>
    <form
      v-if="isAdmin"
      class="grid items-end gap-3 sm:grid-cols-[1fr_12rem_auto]"
      @submit.prevent="save()"
    >
      <label class="flex flex-col gap-1">
        <span class="text-xs font-medium text-n-slate-11">
          {{ t('REPLY_TEMPLATES.AI_SETTINGS.API_KEY') }}
        </span>
        <input
          v-model="apiKey"
          type="password"
          autocomplete="off"
          :placeholder="
            status?.configured
              ? t('REPLY_TEMPLATES.AI_SETTINGS.API_KEY_KEEP')
              : t('REPLY_TEMPLATES.AI_SETTINGS.API_KEY_PLACEHOLDER')
          "
          class="px-3 py-2 text-sm rounded-lg outline-none reset-base bg-n-alpha-black2 text-n-slate-12"
        />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs font-medium text-n-slate-11">
          {{ t('REPLY_TEMPLATES.AI_SETTINGS.MODEL') }}
        </span>
        <select
          v-model="model"
          class="px-3 py-2 text-sm rounded-lg outline-none reset-base bg-n-alpha-black2 text-n-slate-12"
        >
          <option v-for="option in modelOptions" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
      </label>
      <div class="flex gap-2">
        <Button
          type="submit"
          size="sm"
          :is-loading="isSaving"
          :label="t('REPLY_TEMPLATES.AI_SETTINGS.SAVE')"
        />
        <Button
          v-if="status?.source === 'account'"
          type="button"
          size="sm"
          variant="faded"
          color="ruby"
          :label="t('REPLY_TEMPLATES.AI_SETTINGS.REMOVE')"
          @click="removeKey"
        />
      </div>
    </form>
  </section>
</template>
