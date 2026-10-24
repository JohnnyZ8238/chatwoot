<script setup>
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  field: { type: Object, required: true },
  invalid: { type: Boolean, default: false },
});

const value = defineModel({ type: String, default: '' });

const { t } = useI18n();
const inputId = useId();

const pad = number => String(number).padStart(2, '0');
const toIso = date =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const daysFromNow = days => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};
const nextBusinessDay = () => {
  let days = 1;
  while ([0, 6].includes(daysFromNow(days).getDay())) days += 1;
  return daysFromNow(days);
};

const dateChips = computed(() => [
  {
    id: 'today',
    label: t('REPLY_TEMPLATES.FILL.DATE_TODAY'),
    value: toIso(new Date()),
  },
  {
    id: 'tomorrow',
    label: t('REPLY_TEMPLATES.FILL.DATE_TOMORROW'),
    value: toIso(daysFromNow(1)),
  },
  {
    id: 'next_business_day',
    label: t('REPLY_TEMPLATES.FILL.DATE_NEXT_BUSINESS_DAY'),
    value: toIso(nextBusinessDay()),
  },
  {
    id: 'in_3_days',
    label: t('REPLY_TEMPLATES.FILL.DATE_IN_3_DAYS'),
    value: toIso(daysFromNow(3)),
  },
  {
    id: 'in_7_days',
    label: t('REPLY_TEMPLATES.FILL.DATE_IN_7_DAYS'),
    value: toIso(daysFromNow(7)),
  },
]);

const inputClass = computed(() => [
  'w-full px-3 py-2 text-sm rounded-lg outline-none reset-base bg-n-alpha-black2 text-n-slate-12 border focus:border-n-brand',
  props.invalid ? 'border-n-ruby-9' : 'border-n-weak',
]);
</script>

<template>
  <div class="flex flex-col gap-1">
    <label :for="inputId" class="text-xs font-medium text-n-slate-11">
      {{ field.label }}
      <span v-if="field.required" class="text-n-ruby-11">*</span>
    </label>
    <textarea
      v-if="field.type === 'long'"
      :id="inputId"
      v-model="value"
      rows="2"
      :class="inputClass"
    />
    <select
      v-else-if="field.type === 'select'"
      :id="inputId"
      v-model="value"
      :class="inputClass"
    >
      <option v-for="option in field.options" :key="option" :value="option">
        {{ option.trim() || t('REPLY_TEMPLATES.FILL.NONE_OPTION') }}
      </option>
    </select>
    <select
      v-else-if="field.type === 'yesno'"
      :id="inputId"
      v-model="value"
      :class="inputClass"
    >
      <option :value="t('REPLY_TEMPLATES.FILL.YES')">
        {{ t('REPLY_TEMPLATES.FILL.YES') }}
      </option>
      <option :value="t('REPLY_TEMPLATES.FILL.NO')">
        {{ t('REPLY_TEMPLATES.FILL.NO') }}
      </option>
    </select>
    <template v-else-if="field.type === 'date'">
      <input :id="inputId" v-model="value" type="date" :class="inputClass" />
      <div class="flex flex-wrap gap-1">
        <button
          v-for="chip in dateChips"
          :key="chip.id"
          type="button"
          :data-date-chip="chip.id"
          class="px-2 py-0.5 text-xs rounded-full border"
          :class="
            value === chip.value
              ? 'bg-n-brand text-white border-n-brand'
              : 'border-n-weak text-n-slate-11 hover:bg-n-alpha-black2'
          "
          @click="value = chip.value"
        >
          {{ chip.label }}
        </button>
      </div>
    </template>
    <input
      v-else
      :id="inputId"
      v-model="value"
      :type="field.type === 'number' ? 'number' : 'text'"
      :inputmode="field.type === 'money' ? 'decimal' : undefined"
      :placeholder="field.type === 'money' ? '0.00' : ''"
      :class="inputClass"
      autocomplete="off"
    />
  </div>
</template>
