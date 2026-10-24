<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Dialog from 'dashboard/components-next/dialog/Dialog.vue';
import TemplateFieldInput from './TemplateFieldInput.vue';
import {
  getTemplateFields,
  initialFieldValues,
  missingRequiredFields,
  resolveTemplate,
} from 'dashboard/helper/replyTemplates';

const props = defineProps({
  template: { type: Object, required: true },
  variables: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['insert', 'close']);

const { t } = useI18n();
const dialogRef = ref(null);
const fieldsRef = ref(null);

const fields = computed(() =>
  getTemplateFields(
    props.template.content,
    props.template.variables,
    props.variables
  )
);
const values = ref(initialFieldValues(fields.value));

const missing = computed(() =>
  missingRequiredFields(fields.value, values.value)
);

const resolved = computed(() =>
  resolveTemplate(props.template.content, {
    variables: props.variables,
    values: values.value,
    fields: fields.value,
  })
);

const onConfirm = () => {
  if (missing.value.length) return;
  emit('insert', resolved.value);
  dialogRef.value?.close();
};

const onKeydown = event => {
  if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
  event.preventDefault();
  onConfirm();
};

// Dialog renders its content only once open, so focus the first field after that render;
// otherwise focus lands on Cancel and Enter would throw the template away
onMounted(async () => {
  dialogRef.value?.open();
  await nextTick();
  fieldsRef.value?.querySelector('input, select, textarea')?.focus();
});
</script>

<template>
  <Dialog
    ref="dialogRef"
    :title="template.title || `/${template.short_code}`"
    :description="`/${template.short_code}`"
    :confirm-button-label="t('REPLY_TEMPLATES.FILL.INSERT')"
    :disable-confirm-button="missing.length > 0"
    width="xl"
    @confirm="onConfirm"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-4" @keydown="onKeydown">
      <div ref="fieldsRef" class="grid gap-3 sm:grid-cols-2">
        <TemplateFieldInput
          v-for="field in fields"
          :key="field.key"
          v-model="values[field.key]"
          :field="field"
        />
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-n-slate-11">
          {{ t('REPLY_TEMPLATES.FILL.PREVIEW') }}
        </span>
        <p
          data-testid="template-preview"
          class="px-3 py-2 mb-0 text-sm whitespace-pre-wrap rounded-lg bg-n-alpha-black2 text-n-slate-12"
        >
          {{ resolved }}
        </p>
      </div>
    </div>
  </Dialog>
</template>
