<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import CannedResponseAPI from 'dashboard/api/cannedResponse';
import Button from 'dashboard/components-next/button/Button.vue';

const props = defineProps({
  templateId: { type: Number, required: true },
  // the template content with variables and agent fields filled in
  instructions: { type: String, default: '' },
  conversationId: { type: [Number, String], default: null },
  autoGenerate: { type: Boolean, default: false },
});

const draft = defineModel('draft', { type: String, default: '' });

const { t } = useI18n();
const isGenerating = ref(false);
const error = ref('');

const generate = async () => {
  if (!props.conversationId) {
    error.value = t('REPLY_TEMPLATES.AI.NO_CONVERSATION');
    return;
  }
  isGenerating.value = true;
  error.value = '';
  try {
    const { data } = await CannedResponseAPI.generate(props.templateId, {
      conversationId: props.conversationId,
      instructions: props.instructions,
    });
    draft.value = data.draft;
  } catch (apiError) {
    error.value =
      apiError?.response?.data?.error || t('REPLY_TEMPLATES.AI.ERROR');
  } finally {
    isGenerating.value = false;
  }
};

onMounted(() => {
  if (props.autoGenerate) generate();
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs font-medium text-n-slate-11">
        {{ t('REPLY_TEMPLATES.AI.DRAFT') }}
      </span>
      <Button
        data-testid="ai-generate"
        type="button"
        size="xs"
        variant="faded"
        color="slate"
        icon="i-lucide-sparkles"
        :is-loading="isGenerating"
        :disabled="isGenerating"
        :label="
          draft
            ? t('REPLY_TEMPLATES.AI.REGENERATE')
            : t('REPLY_TEMPLATES.AI.GENERATE')
        "
        @click="generate"
      />
    </div>
    <p
      v-if="error"
      data-testid="ai-error"
      class="px-3 py-2 mb-0 text-xs rounded-lg bg-n-ruby-2 text-n-ruby-11"
    >
      {{ error }}
    </p>
    <textarea
      v-model="draft"
      rows="7"
      :placeholder="
        isGenerating
          ? t('REPLY_TEMPLATES.AI.GENERATING')
          : t('REPLY_TEMPLATES.AI.PLACEHOLDER')
      "
      class="px-3 py-2 text-sm rounded-lg outline-none resize-y reset-base bg-n-alpha-black2 text-n-slate-12"
    />
    <p class="mb-0 text-xs text-n-slate-10">
      {{ t('REPLY_TEMPLATES.AI.REVIEW_HINT') }}
    </p>
  </div>
</template>
