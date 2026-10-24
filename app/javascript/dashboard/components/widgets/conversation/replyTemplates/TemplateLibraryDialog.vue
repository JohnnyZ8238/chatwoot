<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { picoSearch } from '@chatwoot/pico-search';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import {
  getTemplateFields,
  initialFieldValues,
  missingRequiredFields,
  resolveTemplate,
} from 'dashboard/helper/replyTemplates';
import { useReplyTemplateVariables } from 'dashboard/composables/useReplyTemplateVariables';
import Dialog from 'dashboard/components-next/dialog/Dialog.vue';
import Button from 'dashboard/components-next/button/Button.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import TemplateFieldInput from './TemplateFieldInput.vue';

const props = defineProps({
  variables: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['insert', 'close']);

const store = useStore();
const { t } = useI18n();
const dialogRef = ref(null);

const templates = useMapGetter('getCannedResponses');
const favorites = useMapGetter('getFavoriteCannedResponses');
const recents = useMapGetter('getRecentCannedResponses');
const companyCategories = useMapGetter(
  'cannedResponseCategories/getCompanyCategories'
);
const personalCategories = useMapGetter(
  'cannedResponseCategories/getPersonalCategories'
);
const currentAccountId = useMapGetter('getCurrentAccountId');
const templateVariables = useReplyTemplateVariables(
  computed(() => props.variables)
);

const node = ref(favorites.value.length ? 'favorites' : 'all');
const search = ref('');
const sort = ref('default');
const selectedId = ref(null);
const values = ref({});
const showMissing = ref(false);
const dragId = ref(null);

const isCompany = template => template.scope !== 'personal';
const inCategory = (template, id) =>
  String(template.canned_response_category_id ?? 'none') === id;

const nodePool = computed(() => {
  const [kind, categoryId] = node.value.split(':');
  // Typing searches every template, not just a shortlist
  if (search.value.trim() && ['favorites', 'recent'].includes(kind))
    return templates.value;
  if (kind === 'favorites') return favorites.value;
  if (kind === 'recent') return recents.value;
  if (kind === 'company' || kind === 'mine') {
    const wantCompany = kind === 'company';
    return templates.value.filter(
      template =>
        isCompany(template) === wantCompany &&
        (!categoryId || inCategory(template, categoryId))
    );
  }
  return templates.value;
});

const SORTERS = {
  used: (a, b) => (b.usage_count || 0) - (a.usage_count || 0),
  recent: (a, b) => (b.last_used_at || '').localeCompare(a.last_used_at || ''),
  az: (a, b) => (a.title || a.short_code).localeCompare(b.title || b.short_code),
};

const rows = computed(() => {
  const term = search.value.trim();
  if (term) {
    return picoSearch(nodePool.value, term, [
      { name: 'short_code', weight: 2 },
      'title',
      'content',
    ]);
  }
  const keepOrder =
    sort.value === 'default' && ['favorites', 'recent'].includes(node.value);
  if (keepOrder) return nodePool.value;
  return [...nodePool.value].sort(SORTERS[sort.value] || SORTERS.used);
});

const canDrag = computed(
  () =>
    node.value === 'favorites' && !search.value.trim() && sort.value === 'default'
);

const selected = computed(
  () =>
    rows.value.find(row => row.id === selectedId.value) || rows.value[0] || null
);

const fields = computed(() =>
  selected.value
    ? getTemplateFields(
        selected.value.content,
        selected.value.variables,
        templateVariables.value
      )
    : []
);

watch(
  () => selected.value?.id,
  () => {
    values.value = initialFieldValues(fields.value);
    showMissing.value = false;
  },
  { immediate: true }
);

const missing = computed(() => missingRequiredFields(fields.value, values.value));

const resolved = computed(() =>
  selected.value
    ? resolveTemplate(selected.value.content, {
        variables: templateVariables.value,
        values: values.value,
        fields: fields.value,
      })
    : ''
);

const count = (scope, categoryId) =>
  templates.value.filter(
    template =>
      isCompany(template) === (scope === 'company') &&
      (categoryId === undefined || inCategory(template, categoryId))
  ).length;

const tree = computed(() => [
  {
    heading: null,
    nodes: [
      {
        id: 'favorites',
        label: t('REPLY_TEMPLATES.TABS.FAVORITES'),
        count: favorites.value.length,
      },
      {
        id: 'recent',
        label: t('REPLY_TEMPLATES.TABS.RECENT'),
        count: recents.value.length,
      },
      {
        id: 'all',
        label: t('REPLY_TEMPLATES.LIBRARY.ALL_TEMPLATES'),
        count: templates.value.length,
      },
    ],
  },
  ...[
    ['company', t('REPLY_TEMPLATES.TABS.COMPANY'), companyCategories.value],
    ['mine', t('REPLY_TEMPLATES.TABS.MINE'), personalCategories.value],
  ].map(([scope, heading, categories]) => ({
    heading,
    nodes: [
      {
        id: scope,
        label:
          scope === 'company'
            ? t('REPLY_TEMPLATES.LIBRARY.ALL_COMPANY')
            : t('REPLY_TEMPLATES.LIBRARY.ALL_MINE'),
        count: count(scope),
      },
      ...categories.map(category => ({
        id: `${scope}:${category.id}`,
        label: category.name,
        count: count(scope, String(category.id)),
        indent: true,
      })),
      ...(count(scope, 'none')
        ? [
            {
              id: `${scope}:none`,
              label: t('REPLY_TEMPLATES.UNCATEGORIZED'),
              count: count(scope, 'none'),
              indent: true,
            },
          ]
        : []),
    ],
  })),
]);

const sortOptions = computed(() => {
  let defaultLabel = t('REPLY_TEMPLATES.LIBRARY.SORT.USED');
  if (node.value === 'favorites')
    defaultLabel = t('REPLY_TEMPLATES.LIBRARY.SORT.DEFAULT_FAVORITES');
  if (node.value === 'recent')
    defaultLabel = t('REPLY_TEMPLATES.LIBRARY.SORT.DEFAULT_RECENT');
  return [
    { value: 'default', label: defaultLabel },
    { value: 'used', label: t('REPLY_TEMPLATES.LIBRARY.SORT.USED') },
    { value: 'recent', label: t('REPLY_TEMPLATES.LIBRARY.SORT.RECENT') },
    { value: 'az', label: t('REPLY_TEMPLATES.LIBRARY.SORT.AZ') },
  ];
});

const selectNode = id => {
  node.value = id;
  sort.value = 'default';
  selectedId.value = null;
};

const moveSelection = step => {
  const index = rows.value.findIndex(row => row.id === selected.value?.id);
  const next = rows.value[Math.min(rows.value.length - 1, Math.max(0, index + step))];
  if (next) selectedId.value = next.id;
};

const categoryName = template => {
  const all = [...companyCategories.value, ...personalCategories.value];
  return (
    all.find(category => category.id === template.canned_response_category_id)
      ?.name || t('REPLY_TEMPLATES.UNCATEGORIZED')
  );
};

const toggleFavorite = template =>
  store.dispatch('toggleCannedResponseFavorite', template.id).catch(() => {});

const copyToMine = async template => {
  try {
    const copy = await store.dispatch('createCannedResponse', {
      short_code: `${template.short_code}-mine`,
      title: template.title,
      content: template.content,
      variables: template.variables,
      scope: 'personal',
    });
    node.value = 'mine';
    selectedId.value = copy.id;
  } catch (error) {
    useAlert(error?.message || t('REPLY_TEMPLATES.SETTINGS.ERROR'));
  }
};

const insert = () => {
  if (!selected.value) return;
  if (missing.value.length) {
    showMissing.value = true;
    return;
  }
  emit('insert', resolved.value, selected.value);
  dialogRef.value?.close();
};

const onSearchKeydown = event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveSelection(event.key === 'ArrowDown' ? 1 : -1);
  }
};

const onDrop = targetId => {
  const from = dragId.value;
  dragId.value = null;
  if (!canDrag.value || !from || from === targetId) return;
  const ids = favorites.value.map(template => template.id).filter(id => id !== from);
  ids.splice(ids.indexOf(targetId), 0, from);
  store.dispatch('reorderCannedResponseFavorites', ids);
};

onMounted(() => {
  store.dispatch('getCannedResponse');
  store.dispatch('cannedResponseCategories/get');
  dialogRef.value?.open();
});
</script>

<template>
  <Dialog
    ref="dialogRef"
    :title="t('REPLY_TEMPLATES.LIBRARY.TITLE')"
    width="5xl"
    :show-cancel-button="false"
    :show-confirm-button="false"
    @close="emit('close')"
    @confirm="insert"
  >
    <div
      class="flex h-[32rem] overflow-hidden border rounded-xl border-n-weak"
    >
      <nav class="flex-shrink-0 w-48 py-2 overflow-y-auto border-r border-n-weak">
        <template v-for="(group, index) in tree" :key="index">
          <p
            v-if="group.heading"
            class="px-3 pt-3 pb-1 mb-0 text-xs font-medium uppercase text-n-slate-10"
          >
            {{ group.heading }}
          </p>
          <button
            v-for="item in group.nodes"
            :key="item.id"
            type="button"
            :data-node="item.id"
            class="flex justify-between w-full py-1 pr-3 text-sm text-start"
            :class="[
              item.indent ? 'pl-6' : 'pl-3',
              node === item.id
                ? 'bg-n-alpha-black2 text-n-slate-12 font-medium'
                : 'text-n-slate-11 hover:text-n-slate-12',
            ]"
            @click="selectNode(item.id)"
          >
            <span class="truncate">{{ item.label }}</span>
            <span class="text-xs text-n-slate-10">{{ item.count }}</span>
          </button>
        </template>
      </nav>

      <div class="flex flex-col flex-shrink-0 w-72 border-r border-n-weak">
        <div class="flex gap-2 p-2 border-b border-n-weak">
          <input
            v-model="search"
            data-testid="library-search"
            type="text"
            :placeholder="t('REPLY_TEMPLATES.LIBRARY.SEARCH')"
            class="flex-1 min-w-0 px-2 py-1.5 text-sm rounded-lg outline-none reset-base bg-n-alpha-black2 text-n-slate-12"
            @keydown="onSearchKeydown"
            @keydown.enter.prevent="insert"
          />
          <select
            v-model="sort"
            class="px-1 text-xs rounded-lg outline-none reset-base bg-n-alpha-black2 text-n-slate-11"
          >
            <option
              v-for="option in sortOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </div>
        <p
          v-if="canDrag && rows.length > 1"
          class="px-3 py-1 mb-0 text-xs border-b text-n-slate-10 border-n-weak"
        >
          {{ t('REPLY_TEMPLATES.LIBRARY.DRAG_HINT') }}
        </p>
        <ul class="flex-1 m-0 overflow-y-auto list-none">
          <li
            v-for="row in rows"
            :key="row.id"
            :data-row="row.id"
            :draggable="canDrag"
            class="flex items-start gap-2 px-3 py-2 border-b cursor-pointer border-n-weak"
            :class="selected?.id === row.id ? 'bg-n-alpha-black2' : ''"
            @click="selectedId = row.id"
            @dragstart="dragId = row.id"
            @dragover.prevent
            @drop.prevent="onDrop(row.id)"
          >
            <Icon
              v-if="canDrag"
              icon="i-lucide-grip-vertical"
              class="flex-shrink-0 mt-0.5 size-4 text-n-slate-9 cursor-grab"
            />
            <button
              type="button"
              class="flex-shrink-0 mt-0.5"
              :title="
                row.favorite
                  ? t('REPLY_TEMPLATES.UNPIN')
                  : t('REPLY_TEMPLATES.PIN')
              "
              @click.stop="toggleFavorite(row)"
            >
              <Icon
                :icon="row.favorite ? 'i-ri-star-fill' : 'i-ri-star-line'"
                class="size-4"
                :class="row.favorite ? 'text-n-amber-9' : 'text-n-slate-9'"
              />
            </button>
            <div class="flex flex-col min-w-0">
              <span class="text-sm font-medium truncate text-n-slate-12">
                {{ row.title || row.short_code }}
              </span>
              <span class="text-xs truncate text-n-slate-11">
                /{{ row.short_code }} ·
                {{
                  isCompany(row)
                    ? t('REPLY_TEMPLATES.SCOPE.COMPANY')
                    : t('REPLY_TEMPLATES.SCOPE.PERSONAL')
                }}
                · {{ categoryName(row) }} ·
                {{ t('REPLY_TEMPLATES.USED', { count: row.usage_count || 0 }) }}
              </span>
            </div>
          </li>
          <li v-if="!rows.length" class="px-3 py-6 text-sm text-center text-n-slate-11">
            {{ t('REPLY_TEMPLATES.EMPTY.NONE') }}
          </li>
        </ul>
      </div>

      <section class="flex flex-col flex-1 min-w-0 p-4 overflow-y-auto">
        <template v-if="selected">
          <h4 class="mb-1 text-base font-medium text-n-slate-12">
            {{ selected.title || selected.short_code }}
          </h4>
          <p class="mb-3 text-xs text-n-slate-11">
            /{{ selected.short_code }} · {{ categoryName(selected) }}
          </p>
          <div class="flex flex-wrap gap-2 mb-4">
            <Button
              size="xs"
              variant="faded"
              color="slate"
              type="button"
              :icon="selected.favorite ? 'i-ri-star-fill' : 'i-ri-star-line'"
              :label="
                selected.favorite
                  ? t('REPLY_TEMPLATES.UNPIN')
                  : t('REPLY_TEMPLATES.PIN')
              "
              @click="toggleFavorite(selected)"
            />
            <Button
              v-if="isCompany(selected)"
              size="xs"
              variant="faded"
              color="slate"
              type="button"
              icon="i-lucide-copy"
              :label="t('REPLY_TEMPLATES.LIBRARY.COPY_TO_MINE')"
              @click="copyToMine(selected)"
            />
            <router-link
              :to="{
                name: 'canned_list',
                params: { accountId: currentAccountId },
              }"
              class="text-xs self-center text-n-brand"
              @click="dialogRef?.close()"
            >
              {{ t('REPLY_TEMPLATES.LIBRARY.EDIT') }}
            </router-link>
          </div>
          <div v-if="fields.length" class="grid gap-3 mb-4 sm:grid-cols-2">
            <TemplateFieldInput
              v-for="field in fields"
              :key="field.key"
              v-model="values[field.key]"
              :field="field"
              :invalid="showMissing && missing.includes(field.key)"
            />
          </div>
          <p
            class="flex-1 px-3 py-2 mb-4 text-sm whitespace-pre-wrap rounded-lg bg-n-alpha-black2 text-n-slate-12"
          >
            {{ resolved }}
          </p>
          <div class="flex items-center justify-end gap-2">
            <Button
              data-testid="library-insert"
              type="button"
              :label="t('REPLY_TEMPLATES.LIBRARY.INSERT')"
              @click="insert"
            />
          </div>
        </template>
        <p v-else class="m-auto text-sm text-n-slate-11">
          {{ t('REPLY_TEMPLATES.LIBRARY.PICK') }}
        </p>
      </section>
    </div>
  </Dialog>
</template>
