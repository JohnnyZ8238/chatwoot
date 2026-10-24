<script setup>
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { vOnClickOutside } from '@vueuse/components';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { MESSAGE_VARIABLES } from 'shared/constants/messages';
import { getAgentVariables } from 'dashboard/helper/editorHelper';
import {
  FIELD_TYPES,
  getExtraVariables,
  getTemplateFields,
  guessFieldType,
  resolveTemplate,
} from 'dashboard/helper/replyTemplates';
import Dialog from 'dashboard/components-next/dialog/Dialog.vue';
import Button from 'dashboard/components-next/button/Button.vue';

const props = defineProps({
  // null for a new template
  template: { type: Object, default: null },
  scope: { type: String, default: 'personal' },
  isAdmin: { type: Boolean, default: false },
});

const emit = defineEmits(['saved', 'close']);

// kept out of the template: its braces would close the mustache
const FALLBACK_EXAMPLE = '{{contact.first_name | default: "there"}}';
const variableToken = key => `{{${key}}}`;

const store = useStore();
const { t } = useI18n();
const dialogRef = ref(null);
const messageRef = useTemplateRef('messageRef');

const companyCategories = useMapGetter(
  'cannedResponseCategories/getCompanyCategories'
);
const personalCategories = useMapGetter(
  'cannedResponseCategories/getPersonalCategories'
);
const customAttributes = useMapGetter('attributes/getAttributes');
const currentUser = useMapGetter('getCurrentUser');
const currentAccountId = useMapGetter('getCurrentAccountId');
const getAccount = useMapGetter('accounts/getAccount');

const source = props.template || {};
const form = ref({
  title: source.title || '',
  short_code: source.short_code || '',
  content: source.content || '',
  scope: props.isAdmin ? source.scope || props.scope : 'personal',
  category: source.canned_response_category_id
    ? String(source.canned_response_category_id)
    : '',
});
const definitions = ref((source.variables || []).map(field => ({ ...field })));
const errors = ref({});
const isSaving = ref(false);
const showVariableMenu = ref(false);
const askLabel = ref('');

const libraries = computed(() =>
  props.isAdmin ? ['company', 'personal'] : ['personal']
);

const categories = computed(() =>
  form.value.scope === 'company'
    ? companyCategories.value
    : personalCategories.value
);

const fields = computed(() =>
  getTemplateFields(form.value.content, definitions.value, {})
);

const typeOptions = computed(() =>
  FIELD_TYPES.map(type => ({
    value: type,
    label: t(`REPLY_TEMPLATES.EDITOR.TYPES.${type}`),
  }))
);

const sampleVariables = computed(() => ({
  ...getExtraVariables(new Date(), getAccount.value(currentAccountId.value)),
  ...getAgentVariables(currentUser.value || {}),
  'contact.name': 'Emily Zhang',
  'contact.first_name': 'Emily',
  'contact.last_name': 'Zhang',
  'contact.email': 'emily@example.com',
}));

const preview = computed(() =>
  resolveTemplate(form.value.content, {
    variables: sampleVariables.value,
    values: Object.fromEntries(fields.value.map(f => [f.key, `[${f.label}]`])),
    fields: fields.value.map(field => ({ ...field, type: 'text' })),
  })
);

const variableGroups = computed(() => {
  const standard = prefix =>
    MESSAGE_VARIABLES.filter(({ key }) => key.startsWith(`${prefix}.`)).map(
      ({ key, label }) => ({ key, label })
    );
  const custom = (model, prefix) =>
    (customAttributes.value || [])
      .filter(attribute => attribute.attribute_model === model)
      .map(attribute => ({
        key: `${prefix}.custom_attribute.${attribute.attribute_key}`,
        label: attribute.attribute_display_name,
      }));
  const extras = Object.keys(getExtraVariables()).map(key => ({
    key,
    label: key,
  }));
  return [
    {
      title: t('REPLY_TEMPLATES.EDITOR.GROUPS.CONTACT'),
      items: [...standard('contact'), ...custom('contact_attribute', 'contact')],
    },
    {
      title: t('REPLY_TEMPLATES.EDITOR.GROUPS.CONVERSATION'),
      items: [
        ...standard('conversation'),
        ...custom('conversation_attribute', 'conversation'),
      ],
    },
    {
      title: t('REPLY_TEMPLATES.EDITOR.GROUPS.AGENT'),
      items: standard('agent'),
    },
    {
      title: t('REPLY_TEMPLATES.EDITOR.GROUPS.INBOX'),
      items: standard('inbox'),
    },
    {
      title: t('REPLY_TEMPLATES.EDITOR.GROUPS.DATE_TIME'),
      items: extras,
    },
  ];
});

const insertAtCaret = async text => {
  const textarea = messageRef.value;
  const content = form.value.content;
  const start = textarea ? textarea.selectionStart : content.length;
  const end = textarea ? textarea.selectionEnd : content.length;
  form.value.content = content.slice(0, start) + text + content.slice(end);
  showVariableMenu.value = false;
  await nextTick();
  textarea?.focus();
  textarea?.setSelectionRange(start + text.length, start + text.length);
};

const updateField = (key, patch) => {
  const current = fields.value.find(field => field.key === key);
  const index = definitions.value.findIndex(field => field.key === key);
  const next = { ...current, ...patch };
  if (index === -1) definitions.value.push(next);
  else definitions.value.splice(index, 1, next);
};

const addAgentField = () => {
  const label = askLabel.value.trim();
  if (!label) return;
  const key =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^(\d)/, 'field_$1') || 'field';
  if (!definitions.value.some(field => field.key === key)) {
    definitions.value.push({
      key,
      label,
      type: guessFieldType(key),
      required: true,
      default: '',
      options: [],
    });
  }
  askLabel.value = '';
  insertAtCaret(variableToken(key));
};

const validate = () => {
  const next = {};
  if (!form.value.title.trim())
    next.title = t('REPLY_TEMPLATES.EDITOR.ERRORS.TITLE');
  if (!form.value.short_code.trim())
    next.short_code = t('REPLY_TEMPLATES.EDITOR.ERRORS.SHORTCUT');
  if (!form.value.content.trim())
    next.content = t('REPLY_TEMPLATES.EDITOR.ERRORS.MESSAGE');
  errors.value = next;
  return !Object.keys(next).length;
};

const save = async () => {
  if (!validate()) return;
  const payload = {
    title: form.value.title.trim(),
    short_code: form.value.short_code
      .trim()
      .replace(/^\/+/, '')
      .replace(/\s+/g, '-'),
    content: form.value.content,
    scope: form.value.scope,
    canned_response_category_id: form.value.category
      ? Number(form.value.category)
      : null,
    // only the fields the message still asks for
    variables: fields.value,
  };

  isSaving.value = true;
  try {
    const saved = props.template?.id
      ? await store.dispatch('updateCannedResponse', {
          id: props.template.id,
          ...payload,
        })
      : await store.dispatch('createCannedResponse', payload);
    useAlert(t('REPLY_TEMPLATES.SETTINGS.SAVED'));
    emit('saved', saved);
    dialogRef.value?.close();
  } catch (error) {
    useAlert(error?.message || t('REPLY_TEMPLATES.SETTINGS.ERROR'));
  } finally {
    isSaving.value = false;
  }
};

const onScopeChange = () => {
  form.value.category = '';
};

onMounted(() => dialogRef.value?.open());
</script>

<template>
  <Dialog
    ref="dialogRef"
    :title="
      template?.id
        ? t('REPLY_TEMPLATES.EDITOR.EDIT_TITLE')
        : t('REPLY_TEMPLATES.EDITOR.NEW_TITLE')
    "
    :confirm-button-label="t('REPLY_TEMPLATES.EDITOR.SAVE')"
    :is-loading="isSaving"
    width="5xl"
    overflow-y-auto
    @confirm="save"
    @close="emit('close')"
  >
    <div class="grid gap-6 lg:grid-cols-5">
      <div class="flex flex-col gap-4 lg:col-span-3">
        <div class="grid gap-3 sm:grid-cols-3">
          <label class="flex flex-col gap-1 sm:col-span-2">
            <span class="text-xs font-medium text-n-slate-11">
              {{ t('REPLY_TEMPLATES.EDITOR.TITLE') }}
            </span>
            <input
              v-model="form.title"
              data-testid="template-title"
              :placeholder="t('REPLY_TEMPLATES.EDITOR.TITLE_PLACEHOLDER')"
              class="px-3 py-2 text-sm rounded-lg outline-none reset-base bg-n-alpha-black2 text-n-slate-12"
            />
            <span v-if="errors.title" class="text-xs text-n-ruby-11">
              {{ errors.title }}
            </span>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-n-slate-11">
              {{ t('REPLY_TEMPLATES.EDITOR.SHORTCUT') }}
            </span>
            <input
              v-model="form.short_code"
              data-testid="template-shortcut"
              :placeholder="t('REPLY_TEMPLATES.EDITOR.SHORTCUT_PLACEHOLDER')"
              class="px-3 py-2 font-mono text-sm rounded-lg outline-none reset-base bg-n-alpha-black2 text-n-slate-12"
            />
            <span v-if="errors.short_code" class="text-xs text-n-ruby-11">
              {{ errors.short_code }}
            </span>
          </label>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-n-slate-11">
              {{ t('REPLY_TEMPLATES.EDITOR.LIBRARY') }}
            </span>
            <select
              v-model="form.scope"
              data-testid="template-scope"
              class="px-3 py-2 text-sm rounded-lg outline-none reset-base bg-n-alpha-black2 text-n-slate-12"
              @change="onScopeChange"
            >
              <option
                v-for="library in libraries"
                :key="library"
                :value="library"
              >
                {{
                  library === 'company'
                    ? t('REPLY_TEMPLATES.SETTINGS.COMPANY_TAB')
                    : t('REPLY_TEMPLATES.SETTINGS.MINE_TAB')
                }}
              </option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-n-slate-11">
              {{ t('REPLY_TEMPLATES.EDITOR.CATEGORY') }}
            </span>
            <select
              v-model="form.category"
              data-testid="template-category"
              class="px-3 py-2 text-sm rounded-lg outline-none reset-base bg-n-alpha-black2 text-n-slate-12"
            >
              <option value="">
                {{ t('REPLY_TEMPLATES.EDITOR.NO_CATEGORY') }}
              </option>
              <option
                v-for="category in categories"
                :key="category.id"
                :value="String(category.id)"
              >
                {{ category.name }}
              </option>
            </select>
          </label>
        </div>

        <div class="flex flex-col gap-1">
          <span class="text-xs font-medium text-n-slate-11">
            {{ t('REPLY_TEMPLATES.EDITOR.MESSAGE') }}
          </span>
          <div class="relative flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="xs"
              variant="faded"
              color="slate"
              icon="i-lucide-braces"
              :label="t('REPLY_TEMPLATES.EDITOR.INSERT_VARIABLE')"
              @click="showVariableMenu = !showVariableMenu"
            />
            <input
              v-model="askLabel"
              :placeholder="t('REPLY_TEMPLATES.EDITOR.ASK_AGENT_PLACEHOLDER')"
              class="flex-1 min-w-[12rem] px-2 py-1 text-xs rounded-lg outline-none reset-base bg-n-alpha-black2 text-n-slate-12"
              @keydown.enter.prevent="addAgentField"
            />
            <Button
              type="button"
              size="xs"
              variant="faded"
              color="slate"
              icon="i-lucide-text-cursor-input"
              :label="t('REPLY_TEMPLATES.EDITOR.ASK_AGENT')"
              @click="addAgentField"
            />
            <div
              v-if="showVariableMenu"
              v-on-click-outside="() => (showVariableMenu = false)"
              class="absolute left-0 z-10 p-2 overflow-y-auto border shadow-lg top-full w-80 max-h-72 rounded-xl border-n-weak bg-n-alpha-3 backdrop-blur-[100px]"
            >
              <template v-for="group in variableGroups" :key="group.title">
                <p
                  v-if="group.items.length"
                  class="px-2 pt-2 pb-1 mb-0 text-xs font-medium uppercase text-n-slate-10"
                >
                  {{ group.title }}
                </p>
                <button
                  v-for="item in group.items"
                  :key="item.key"
                  type="button"
                  class="flex justify-between w-full gap-2 px-2 py-1 text-sm rounded-md text-start hover:bg-n-alpha-black2"
                  @click="insertAtCaret(variableToken(item.key))"
                >
                  <span class="truncate text-n-slate-12">{{ item.label }}</span>
                  <code class="text-xs truncate text-n-slate-10">
                    {{ item.key }}
                  </code>
                </button>
              </template>
            </div>
          </div>
          <textarea
            ref="messageRef"
            v-model="form.content"
            data-testid="template-message"
            rows="7"
            :placeholder="t('REPLY_TEMPLATES.EDITOR.MESSAGE_PLACEHOLDER')"
            class="px-3 py-2 mt-1 font-mono text-sm rounded-lg outline-none resize-y reset-base bg-n-alpha-black2 text-n-slate-12"
          />
          <span class="text-xs text-n-slate-10">
            {{
              t('REPLY_TEMPLATES.EDITOR.FALLBACK_HINT', {
                example: FALLBACK_EXAMPLE,
              })
            }}
          </span>
          <span v-if="errors.content" class="text-xs text-n-ruby-11">
            {{ errors.content }}
          </span>
        </div>

        <div class="flex flex-col gap-2">
          <span class="text-xs font-medium text-n-slate-11">
            {{ t('REPLY_TEMPLATES.EDITOR.FIELDS') }}
          </span>
          <p v-if="!fields.length" class="mb-0 text-xs text-n-slate-10">
            {{ t('REPLY_TEMPLATES.EDITOR.FIELDS_EMPTY') }}
          </p>
          <div
            v-for="field in fields"
            :key="field.key"
            :data-field="field.key"
            class="grid items-center gap-2 p-2 rounded-lg sm:grid-cols-12 bg-n-alpha-black2"
          >
            <code class="text-xs truncate sm:col-span-2 text-n-slate-11">
              {{ field.key }}
            </code>
            <input
              :value="field.label"
              :aria-label="t('REPLY_TEMPLATES.EDITOR.FIELD.LABEL')"
              class="px-2 py-1 text-sm rounded-md outline-none sm:col-span-3 reset-base bg-n-alpha-black1 text-n-slate-12"
              @input="updateField(field.key, { label: $event.target.value })"
            />
            <select
              :value="field.type"
              :aria-label="t('REPLY_TEMPLATES.EDITOR.FIELD.TYPE')"
              class="px-2 py-1 text-sm rounded-md outline-none sm:col-span-2 reset-base bg-n-alpha-black1 text-n-slate-12"
              @change="updateField(field.key, { type: $event.target.value })"
            >
              <option
                v-for="option in typeOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <input
              v-if="field.type === 'select'"
              :value="field.options.join(', ')"
              :placeholder="t('REPLY_TEMPLATES.EDITOR.FIELD.OPTIONS')"
              class="px-2 py-1 text-sm rounded-md outline-none sm:col-span-3 reset-base bg-n-alpha-black1 text-n-slate-12"
              @change="
                updateField(field.key, {
                  options: $event.target.value
                    .split(',')
                    .map(option => option.trim())
                    .filter(Boolean),
                })
              "
            />
            <input
              v-else
              :value="field.default"
              :placeholder="t('REPLY_TEMPLATES.EDITOR.FIELD.DEFAULT')"
              class="px-2 py-1 text-sm rounded-md outline-none sm:col-span-3 reset-base bg-n-alpha-black1 text-n-slate-12"
              @input="updateField(field.key, { default: $event.target.value })"
            />
            <label
              class="flex items-center gap-1 text-xs sm:col-span-2 text-n-slate-11"
            >
              <input
                type="checkbox"
                :checked="field.required"
                @change="
                  updateField(field.key, { required: $event.target.checked })
                "
              />
              {{ t('REPLY_TEMPLATES.EDITOR.FIELD.REQUIRED') }}
            </label>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2 lg:col-span-2">
        <span class="text-xs font-medium text-n-slate-11">
          {{ t('REPLY_TEMPLATES.EDITOR.PREVIEW') }}
        </span>
        <p
          class="px-3 py-2 mb-0 text-sm whitespace-pre-wrap rounded-lg bg-n-alpha-black2 text-n-slate-12"
        >
          {{ preview }}
        </p>
        <p class="mb-0 text-xs text-n-slate-10">
          {{ t('REPLY_TEMPLATES.EDITOR.LEGEND') }}
        </p>
      </div>
    </div>
  </Dialog>
</template>
