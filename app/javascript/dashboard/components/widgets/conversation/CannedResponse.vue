<script setup>
import { computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { picoSearch } from '@chatwoot/pico-search';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { stripUnsupportedFormatting } from 'dashboard/helper/editorHelper';
import {
  getTemplateFields,
  resolveTemplate,
} from 'dashboard/helper/replyTemplates';
import { useReplyTemplateVariables } from 'dashboard/composables/useReplyTemplateVariables';
import { useMessageFormatter } from 'shared/composables/useMessageFormatter';
import CaretAnchoredPicker from 'dashboard/components-next/preview-picker/CaretAnchoredPicker.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';

const props = defineProps({
  caretPosition: {
    type: Object,
    default: null,
  },
  searchKey: {
    type: String,
    default: '',
  },
  variables: {
    type: Object,
    default: () => ({}),
  },
  schema: {
    type: Object,
    default: null,
  },
});

// `replace` carries resolved content for templates without agent fields; `fill` hands the
// template over so the editor can ask for its fields first.
const emit = defineEmits(['replace', 'fill', 'close', 'removeTrigger']);

// Characters kept before the match when a snippet has to skip ahead
const SNIPPET_LEAD = 24;
const HIGHLIGHT_CLASS = 'text-n-blue-text';
const SHORTLIST_TABS = ['favorites', 'recent'];

const store = useStore();
const { t } = useI18n();
const { getPlainText, formatMessage, highlightContent } = useMessageFormatter();

const cannedResponses = useMapGetter('getCannedResponses');
const favorites = useMapGetter('getFavoriteCannedResponses');
const recents = useMapGetter('getRecentCannedResponses');
const categories = useMapGetter('cannedResponseCategories/getCategories');
const uiFlags = useMapGetter('getUIFlags');
const templateVariables = useReplyTemplateVariables(
  computed(() => props.variables)
);

// The trigger can already be followed by text, from a draft or a caret moved back onto it
const searchQuery = ref(props.searchKey);
const searchTerm = computed(() => searchQuery.value.trim());

const activeTab = ref(
  favorites.value.length && !props.searchKey.trim() ? 'favorites' : 'all'
);
const activeCategory = ref('');

const categoryName = id =>
  categories.value.find(category => category.id === id)?.name ||
  t('REPLY_TEMPLATES.UNCATEGORIZED');

// An empty term makes `highlightContent`'s regex match at every position, wrapping the
// whole string in empty spans
const highlightMatches = text =>
  searchTerm.value
    ? highlightContent(text, searchTerm.value, HIGHLIGHT_CLASS)
    : text;

const buildSnippet = text => {
  const term = searchTerm.value;
  if (!term) return text;

  const index = text.toLowerCase().indexOf(term.toLowerCase());
  if (index <= SNIPPET_LEAD) return text;

  return `…${text.slice(index - SNIPPET_LEAD)}`;
};

// Agent fields show as [Label] in the preview until the agent fills them in
const previewContent = template => {
  const fields = getTemplateFields(
    template.content,
    template.variables,
    templateVariables.value
  );
  return resolveTemplate(template.content, {
    variables: templateVariables.value,
    values: Object.fromEntries(fields.map(f => [f.key, `[${f.label}]`])),
    fields: fields.map(field => ({ ...field, type: 'text' })),
  });
};

const tabPool = tab => {
  if (tab === 'favorites') return favorites.value;
  if (tab === 'recent') return recents.value;
  if (tab === 'mine')
    return cannedResponses.value.filter(r => r.scope === 'personal');
  if (tab === 'company')
    return cannedResponses.value.filter(r => r.scope !== 'personal');
  return cannedResponses.value;
};

// Typing searches every template, not just a shortlist
const pool = computed(() =>
  searchTerm.value && SHORTLIST_TABS.includes(activeTab.value)
    ? cannedResponses.value
    : tabPool(activeTab.value)
);

const categoryChips = computed(() => {
  const ids = [
    ...new Set(pool.value.map(r => r.canned_response_category_id ?? null)),
  ];
  return ids
    .map(id => ({
      id: id ?? 'none',
      name: categoryName(id),
      position: categories.value.find(c => c.id === id)?.position ?? 9999,
    }))
    .sort((a, b) => a.position - b.position);
});

const records = computed(() =>
  pool.value
    .filter(
      record =>
        !activeCategory.value ||
        (record.canned_response_category_id ?? 'none') === activeCategory.value
    )
    .map(record => {
      const resolved = stripUnsupportedFormatting(
        previewContent(record),
        props.schema
      );
      return {
        record,
        resolved,
        shortCode: record.short_code,
        title: record.title || record.short_code,
        plainText: getPlainText(resolved).replace(/\s+/g, ' ').trim(),
      };
    })
);

const filteredRecords = computed(() => {
  if (!searchTerm.value) return records.value;

  return picoSearch(records.value, searchTerm.value, [
    { name: 'shortCode', weight: 2 },
    'title',
    'plainText',
  ]);
});

const items = computed(() =>
  filteredRecords.value.map(({ record, resolved, title, plainText }) => ({
    id: record.id,
    record,
    resolved,
    label: `/${record.short_code}`,
    title: highlightMatches(title),
    subtitle: highlightMatches(
      `${record.ai_prompt ? `✨ ${t('REPLY_TEMPLATES.AI.BADGE')} · ` : ''}/${record.short_code} · ${categoryName(record.canned_response_category_id)} · ${buildSnippet(plainText)}`
    ),
  }))
);

const emptyLabel = computed(() => {
  if (searchTerm.value)
    return t('REPLY_TEMPLATES.EMPTY.SEARCH', { searchTerm: searchTerm.value });
  if (activeTab.value === 'favorites')
    return t('REPLY_TEMPLATES.EMPTY.FAVORITES');
  if (activeTab.value === 'recent') return t('REPLY_TEMPLATES.EMPTY.RECENT');
  return t('REPLY_TEMPLATES.EMPTY.NONE');
});

const tabs = computed(() => [
  { id: 'favorites', label: t('REPLY_TEMPLATES.TABS.FAVORITES') },
  { id: 'recent', label: t('REPLY_TEMPLATES.TABS.RECENT') },
  { id: 'mine', label: t('REPLY_TEMPLATES.TABS.MINE') },
  { id: 'company', label: t('REPLY_TEMPLATES.TABS.COMPANY') },
  { id: 'all', label: t('REPLY_TEMPLATES.TABS.ALL') },
]);

const selectTab = tab => {
  activeTab.value = tab;
  activeCategory.value = '';
};

const toggleFavorite = record =>
  store.dispatch('toggleCannedResponseFavorite', record.id).catch(() => {});

const onSelect = ({ record }) => {
  const fields = getTemplateFields(
    record.content,
    record.variables,
    templateVariables.value
  );
  if (fields.length || record.ai_prompt) {
    // computed when this picker opened, so dates and times are current
    emit('fill', record, templateVariables.value);
    return;
  }
  emit(
    'replace',
    resolveTemplate(record.content, { variables: templateVariables.value }),
    record
  );
};

onMounted(() => {
  store.dispatch('getCannedResponse');
  store.dispatch('cannedResponseCategories/get');
});
</script>

<template>
  <CaretAnchoredPicker
    v-model:search="searchQuery"
    :caret-position="caretPosition"
    :items="items"
    :search-placeholder="t('COMBOBOX.SEARCH_PLACEHOLDER')"
    :is-loading="uiFlags.fetchingList"
    :empty-label="emptyLabel"
    @select="onSelect"
    @close="emit('close')"
    @remove-trigger="emit('removeTrigger')"
  >
    <template #filters>
      <div class="flex flex-col gap-1.5">
        <div class="flex gap-0.5 overflow-x-auto">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            :data-tab="tab.id"
            class="px-2 py-1 text-xs font-medium rounded-md whitespace-nowrap"
            :class="
              activeTab === tab.id
                ? 'bg-n-alpha-black2 text-n-slate-12'
                : 'text-n-slate-11 hover:text-n-slate-12'
            "
            @click="selectTab(tab.id)"
          >
            {{ tab.label }}
          </button>
        </div>
        <div v-if="categoryChips.length > 1" class="flex flex-wrap gap-1 px-1">
          <button
            type="button"
            data-category=""
            class="px-2 py-0.5 text-xs rounded-full"
            :class="
              !activeCategory
                ? 'bg-n-brand text-white'
                : 'bg-n-alpha-black2 text-n-slate-11'
            "
            @click="activeCategory = ''"
          >
            {{ t('REPLY_TEMPLATES.ALL_CATEGORIES') }}
          </button>
          <button
            v-for="chip in categoryChips"
            :key="chip.id"
            type="button"
            :data-category="chip.id"
            class="px-2 py-0.5 text-xs rounded-full"
            :class="
              activeCategory === chip.id
                ? 'bg-n-brand text-white'
                : 'bg-n-alpha-black2 text-n-slate-11'
            "
            @click="activeCategory = chip.id"
          >
            {{ chip.name }}
          </button>
        </div>
      </div>
    </template>
    <template #leading="{ item }">
      <button
        type="button"
        data-star
        class="flex items-center justify-center flex-shrink-0 rounded size-5"
        :title="
          item.record.favorite
            ? t('REPLY_TEMPLATES.UNPIN')
            : t('REPLY_TEMPLATES.PIN')
        "
        @mousedown.prevent
        @click.stop="toggleFavorite(item.record)"
      >
        <Icon
          :icon="item.record.favorite ? 'i-ri-star-fill' : 'i-ri-star-line'"
          class="size-3.5"
          :class="item.record.favorite ? 'text-n-amber-9' : 'text-n-slate-9'"
        />
      </button>
    </template>
    <template #preview="{ item }">
      <div
        v-dompurify-html="formatMessage(item?.resolved || '')"
        class="px-4 py-3 prose prose-bubble !max-w-none prose-a:text-n-brand"
      />
    </template>
  </CaretAnchoredPicker>
</template>
