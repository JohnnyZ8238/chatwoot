<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { picoSearch } from '@chatwoot/pico-search';
import { useAlert } from 'dashboard/composables';
import { useAdmin } from 'dashboard/composables/useAdmin';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { getTemplateFields } from 'dashboard/helper/replyTemplates';
import SettingsLayout from '../SettingsLayout.vue';
import BaseSettingsHeader from '../components/BaseSettingsHeader.vue';
import Button from 'dashboard/components-next/button/Button.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import Dialog from 'dashboard/components-next/dialog/Dialog.vue';
import TemplateEditorDialog from './TemplateEditorDialog.vue';

defineOptions({
  name: 'CannedResponseSettings',
});

const store = useStore();
const { t } = useI18n();
const { isAdmin } = useAdmin();

const templates = useMapGetter('getCannedResponses');
const uiFlags = useMapGetter('getUIFlags');
const companyCategories = useMapGetter(
  'cannedResponseCategories/getCompanyCategories'
);
const personalCategories = useMapGetter(
  'cannedResponseCategories/getPersonalCategories'
);

const library = ref('company');
const activeCategory = ref('');
const searchQuery = ref('');
const editor = ref(null); // { template, scope }
const pendingDelete = ref(null); // { kind: 'template'|'category', item }
const deleteDialogRef = ref(null);
const newCategoryName = ref('');
const renaming = ref(null); // { id, name }

const canEdit = computed(() => library.value === 'personal' || isAdmin.value);
const isCompany = template => template.scope !== 'personal';

const categories = computed(() =>
  library.value === 'company'
    ? companyCategories.value
    : personalCategories.value
);

const libraryTemplates = computed(() =>
  templates.value.filter(
    template => isCompany(template) === (library.value === 'company')
  )
);

const inCategory = (template, id) =>
  String(template.canned_response_category_id ?? 'none') === String(id);

const rows = computed(() => {
  const list = activeCategory.value
    ? libraryTemplates.value.filter(template =>
        inCategory(template, activeCategory.value)
      )
    : libraryTemplates.value;
  const query = searchQuery.value.trim();
  if (!query) return list;
  return picoSearch(list, query, [
    { name: 'short_code', weight: 4 },
    { name: 'title', weight: 2 },
    'content',
  ]);
});

const categoryCount = id =>
  libraryTemplates.value.filter(template => inCategory(template, id)).length;

const uncategorizedCount = computed(() => categoryCount('none'));

const categoryName = template =>
  categories.value.find(
    category => category.id === template.canned_response_category_id
  )?.name || t('REPLY_TEMPLATES.UNCATEGORIZED');

const fieldLabels = template =>
  getTemplateFields(template.content, template.variables)
    .map(field => field.label)
    .join(', ');

const snippet = template => template.content.replace(/\s+/g, ' ').trim();

const selectLibrary = value => {
  library.value = value;
  activeCategory.value = '';
};

const toggleFavorite = template =>
  store.dispatch('toggleCannedResponseFavorite', template.id).catch(() => {});

const openEditor = (template = null) => {
  editor.value = { template, scope: library.value };
};

// A copy is a new template; agents' copies of company templates land in My library
const openCopy = template => {
  const scope =
    isCompany(template) && !isAdmin.value ? 'personal' : template.scope;
  editor.value = {
    template: {
      ...template,
      id: null,
      short_code: `${template.short_code}-copy`,
      scope,
      canned_response_category_id:
        scope === template.scope ? template.canned_response_category_id : null,
    },
    scope,
  };
};

const askDelete = (kind, item) => {
  pendingDelete.value = { kind, item };
  deleteDialogRef.value?.open();
};

const deleteMessage = computed(() => {
  const pending = pendingDelete.value;
  if (!pending) return '';
  return pending.kind === 'category'
    ? t('REPLY_TEMPLATES.SETTINGS.DELETE_CATEGORY_CONFIRM', {
        name: pending.item.name,
      })
    : t('REPLY_TEMPLATES.SETTINGS.DELETE_CONFIRM', {
        title: pending.item.title || pending.item.short_code,
      });
});

const confirmDelete = async () => {
  const { kind, item } = pendingDelete.value;
  try {
    if (kind === 'category') {
      await store.dispatch('cannedResponseCategories/delete', item.id);
      if (String(activeCategory.value) === String(item.id))
        activeCategory.value = '';
      await store.dispatch('getCannedResponse');
    } else {
      await store.dispatch('deleteCannedResponse', item.id);
      useAlert(t('REPLY_TEMPLATES.SETTINGS.DELETED'));
    }
  } catch (error) {
    useAlert(error?.message || t('REPLY_TEMPLATES.SETTINGS.ERROR'));
  }
  pendingDelete.value = null;
  deleteDialogRef.value?.close();
};

const addCategory = async () => {
  const name = newCategoryName.value.trim();
  if (!name) return;
  try {
    await store.dispatch('cannedResponseCategories/create', {
      name,
      scope: library.value,
    });
    newCategoryName.value = '';
  } catch (error) {
    useAlert(error?.message || t('REPLY_TEMPLATES.SETTINGS.ERROR'));
  }
};

const saveRename = async () => {
  const { id, name } = renaming.value || {};
  renaming.value = null;
  if (!id || !name.trim()) return;
  try {
    await store.dispatch('cannedResponseCategories/update', {
      id,
      name: name.trim(),
    });
  } catch (error) {
    useAlert(error?.message || t('REPLY_TEMPLATES.SETTINGS.ERROR'));
  }
};

const moveUp = index => {
  if (index === 0) return;
  const ids = categories.value.map(category => category.id);
  [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
  store
    .dispatch('cannedResponseCategories/reorder', {
      scope: library.value,
      ids,
    })
    .catch(() => useAlert(t('REPLY_TEMPLATES.SETTINGS.ERROR')));
};

onMounted(() => {
  store.dispatch('getCannedResponse');
  store.dispatch('cannedResponseCategories/get');
});
</script>

<template>
  <SettingsLayout
    :is-loading="uiFlags.fetchingList && !templates.length"
    :loading-message="t('CANNED_MGMT.LOADING')"
  >
    <template #header>
      <BaseSettingsHeader
        v-model:search-query="searchQuery"
        :title="t('REPLY_TEMPLATES.SETTINGS.HEADER')"
        :description="t('REPLY_TEMPLATES.SETTINGS.DESCRIPTION')"
        :link-text="t('CANNED_MGMT.LEARN_MORE')"
        :search-placeholder="t('CANNED_MGMT.SEARCH_PLACEHOLDER')"
        feature-name="canned_responses"
      >
        <template #actions>
          <Button
            v-if="canEdit"
            data-action="new-template"
            :label="t('REPLY_TEMPLATES.SETTINGS.NEW_TEMPLATE')"
            size="sm"
            @click="openEditor()"
          />
        </template>
      </BaseSettingsHeader>
    </template>

    <template #body>
      <div class="flex gap-1 mb-4 border-b border-n-weak">
        <button
          v-for="option in ['company', 'personal']"
          :key="option"
          type="button"
          :data-library="option"
          class="px-3 py-2 -mb-px text-sm border-b-2"
          :class="
            library === option
              ? 'border-n-brand text-n-slate-12 font-medium'
              : 'border-transparent text-n-slate-11 hover:text-n-slate-12'
          "
          @click="selectLibrary(option)"
        >
          {{
            option === 'company'
              ? t('REPLY_TEMPLATES.SETTINGS.COMPANY_TAB')
              : t('REPLY_TEMPLATES.SETTINGS.MINE_TAB')
          }}
        </button>
      </div>

      <p
        class="px-3 py-2 mb-4 text-sm rounded-lg bg-n-alpha-black2 text-n-slate-11"
      >
        <template v-if="library === 'personal'">
          {{ t('REPLY_TEMPLATES.SETTINGS.MINE_NOTE') }}
        </template>
        <template v-else-if="isAdmin">
          {{ t('REPLY_TEMPLATES.SETTINGS.COMPANY_NOTE_ADMIN') }}
        </template>
        <template v-else>
          {{ t('REPLY_TEMPLATES.SETTINGS.COMPANY_NOTE_AGENT') }}
        </template>
      </p>

      <div class="flex flex-col gap-6 md:flex-row">
        <aside class="flex flex-col flex-shrink-0 gap-0.5 md:w-52">
          <button
            type="button"
            data-category=""
            class="flex justify-between px-3 py-1.5 text-sm rounded-lg text-start"
            :class="
              !activeCategory
                ? 'bg-n-alpha-black2 text-n-slate-12 font-medium'
                : 'text-n-slate-11'
            "
            @click="activeCategory = ''"
          >
            <span>{{ t('REPLY_TEMPLATES.ALL_CATEGORIES') }}</span>
            <span class="text-xs text-n-slate-10">
              {{ libraryTemplates.length }}
            </span>
          </button>
          <div
            v-for="(category, index) in categories"
            :key="category.id"
            class="flex items-center group"
          >
            <input
              v-if="renaming?.id === category.id"
              v-model="renaming.name"
              class="flex-1 min-w-0 px-3 py-1 text-sm rounded-lg outline-none reset-base bg-n-alpha-black2 text-n-slate-12"
              @keydown.enter.prevent="saveRename"
              @blur="saveRename"
            />
            <button
              v-else
              type="button"
              :data-category="category.id"
              class="flex justify-between flex-1 min-w-0 px-3 py-1.5 text-sm rounded-lg text-start"
              :class="
                String(activeCategory) === String(category.id)
                  ? 'bg-n-alpha-black2 text-n-slate-12 font-medium'
                  : 'text-n-slate-11'
              "
              @click="activeCategory = category.id"
            >
              <span class="truncate">{{ category.name }}</span>
              <span class="text-xs text-n-slate-10">
                {{ categoryCount(category.id) }}
              </span>
            </button>
            <div
              v-if="canEdit && renaming?.id !== category.id"
              class="flex invisible group-hover:visible"
            >
              <Button
                v-tooltip.top="t('REPLY_TEMPLATES.SETTINGS.MOVE_UP')"
                icon="i-lucide-arrow-up"
                slate
                ghost
                xs
                :disabled="index === 0"
                @click="moveUp(index)"
              />
              <Button
                v-tooltip.top="t('REPLY_TEMPLATES.SETTINGS.RENAME')"
                icon="i-lucide-pencil"
                slate
                ghost
                xs
                @click="renaming = { id: category.id, name: category.name }"
              />
              <Button
                v-tooltip.top="t('REPLY_TEMPLATES.SETTINGS.DELETE_CATEGORY')"
                icon="i-lucide-trash-2"
                slate
                ghost
                xs
                @click="askDelete('category', category)"
              />
            </div>
          </div>
          <button
            v-if="uncategorizedCount"
            type="button"
            data-category="none"
            class="flex justify-between px-3 py-1.5 text-sm rounded-lg text-start"
            :class="
              activeCategory === 'none'
                ? 'bg-n-alpha-black2 text-n-slate-12 font-medium'
                : 'text-n-slate-11'
            "
            @click="activeCategory = 'none'"
          >
            <span>{{ t('REPLY_TEMPLATES.UNCATEGORIZED') }}</span>
            <span class="text-xs text-n-slate-10">
              {{ uncategorizedCount }}
            </span>
          </button>
          <form
            v-if="canEdit"
            class="flex gap-1 mt-2"
            data-action="new-category"
            @submit.prevent="addCategory"
          >
            <input
              v-model="newCategoryName"
              :placeholder="
                t('REPLY_TEMPLATES.SETTINGS.NEW_CATEGORY_PLACEHOLDER')
              "
              class="flex-1 min-w-0 px-2 py-1 text-xs rounded-lg outline-none reset-base bg-n-alpha-black2 text-n-slate-12"
            />
            <Button
              type="submit"
              icon="i-lucide-plus"
              :label="t('REPLY_TEMPLATES.SETTINGS.NEW_CATEGORY')"
              slate
              faded
              xs
            />
          </form>
        </aside>

        <div class="flex-1 min-w-0 overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-xs uppercase text-start text-n-slate-10">
                <th class="w-8 py-2" />
                <th class="py-2 pr-3 font-medium text-start">
                  {{ t('REPLY_TEMPLATES.SETTINGS.TABLE.TEMPLATE') }}
                </th>
                <th class="py-2 pr-3 font-medium text-start">
                  {{ t('REPLY_TEMPLATES.SETTINGS.TABLE.SHORTCUT') }}
                </th>
                <th class="py-2 pr-3 font-medium text-start">
                  {{ t('REPLY_TEMPLATES.SETTINGS.TABLE.CATEGORY') }}
                </th>
                <th class="py-2 pr-3 font-medium text-start">
                  {{ t('REPLY_TEMPLATES.SETTINGS.TABLE.ASKS_FOR') }}
                </th>
                <th class="py-2 pr-3 font-medium text-start">
                  {{ t('REPLY_TEMPLATES.SETTINGS.TABLE.USED') }}
                </th>
                <th class="py-2" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="template in rows"
                :key="template.id"
                :data-template="template.id"
                class="align-top border-t border-n-weak"
              >
                <td class="py-3">
                  <button
                    type="button"
                    :title="
                      template.favorite
                        ? t('REPLY_TEMPLATES.UNPIN')
                        : t('REPLY_TEMPLATES.PIN')
                    "
                    @click="toggleFavorite(template)"
                  >
                    <Icon
                      :icon="
                        template.favorite ? 'i-ri-star-fill' : 'i-ri-star-line'
                      "
                      class="size-4"
                      :class="
                        template.favorite ? 'text-n-amber-9' : 'text-n-slate-9'
                      "
                    />
                  </button>
                </td>
                <td class="w-full py-3 pr-3 max-w-0">
                  <span class="block font-medium truncate text-n-slate-12">
                    {{ template.title || template.short_code }}
                  </span>
                  <span class="block text-xs truncate text-n-slate-11">
                    {{ snippet(template) }}
                  </span>
                </td>
                <td class="py-3 pr-3 font-mono text-xs text-n-slate-11">
                  /{{ template.short_code }}
                </td>
                <td class="py-3 pr-3 text-n-slate-11 whitespace-nowrap">
                  {{ categoryName(template) }}
                </td>
                <td class="py-3 pr-3 text-xs text-n-slate-11 min-w-[8rem]">
                  {{ fieldLabels(template) || '—' }}
                </td>
                <td class="py-3 pr-3 text-n-slate-11">
                  {{ template.usage_count || 0 }}
                </td>
                <td class="py-3">
                  <div class="flex justify-end gap-1">
                    <template v-if="canEdit">
                      <Button
                        v-tooltip.top="t('CANNED_MGMT.EDIT.BUTTON_TEXT')"
                        data-action="edit"
                        icon="i-woot-edit-pen"
                        slate
                        sm
                        @click="openEditor(template)"
                      />
                      <Button
                        v-tooltip.top="t('REPLY_TEMPLATES.SETTINGS.DUPLICATE')"
                        data-action="copy"
                        icon="i-lucide-copy"
                        slate
                        sm
                        @click="openCopy(template)"
                      />
                      <Button
                        v-tooltip.top="t('CANNED_MGMT.DELETE.BUTTON_TEXT')"
                        data-action="delete"
                        icon="i-woot-bin"
                        slate
                        sm
                        class="hover:enabled:text-n-ruby-11 hover:enabled:bg-n-ruby-2"
                        @click="askDelete('template', template)"
                      />
                    </template>
                    <Button
                      v-else
                      data-action="copy"
                      icon="i-lucide-copy"
                      :label="t('REPLY_TEMPLATES.LIBRARY.COPY_TO_MINE')"
                      slate
                      faded
                      sm
                      @click="openCopy(template)"
                    />
                  </div>
                </td>
              </tr>
              <tr v-if="!rows.length">
                <td colspan="7" class="py-8 text-center text-n-slate-11">
                  {{
                    searchQuery
                      ? t('CANNED_MGMT.NO_RESULTS')
                      : t('REPLY_TEMPLATES.EMPTY.NONE')
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <TemplateEditorDialog
        v-if="editor"
        :template="editor.template"
        :scope="editor.scope"
        :is-admin="isAdmin"
        @close="editor = null"
      />
      <Dialog
        ref="deleteDialogRef"
        type="alert"
        :title="t('CANNED_MGMT.DELETE.CONFIRM.TITLE')"
        :description="deleteMessage"
        :confirm-button-label="t('CANNED_MGMT.DELETE.BUTTON_TEXT')"
        @confirm="confirmDelete"
        @close="pendingDelete = null"
      />
    </template>
  </SettingsLayout>
</template>
