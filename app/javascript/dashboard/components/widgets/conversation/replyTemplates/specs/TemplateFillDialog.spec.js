import { mount, flushPromises } from '@vue/test-utils';
import TemplateFillDialog from '../TemplateFillDialog.vue';

const DialogStub = {
  props: ['disableConfirmButton'],
  emits: ['confirm', 'close'],
  methods: { open() {}, close() {} },
  template:
    '<div><slot /><button class="confirm" :disabled="disableConfirmButton" @click="$emit(\'confirm\')" /></div>',
};

const TEMPLATE = {
  id: 7,
  title: 'Shipping date',
  short_code: 'ship',
  content:
    'Hi {{contact.first_name}}, order ships {{ship_date}} by {{carrier}}.',
  variables: [
    { key: 'ship_date', label: 'Ship date', type: 'date', required: true },
    {
      key: 'carrier',
      label: 'Carrier',
      type: 'select',
      options: ['UPS', 'Purolator'],
    },
  ],
};

const mountDialog = () =>
  mount(TemplateFillDialog, {
    props: { template: TEMPLATE, variables: { 'contact.first_name': 'Emily' } },
    global: { stubs: { Dialog: DialogStub } },
  });

describe('TemplateFillDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 23, 9, 0));
  });

  afterEach(() => vi.useRealTimers());

  it('focuses the first field when it opens', async () => {
    const wrapper = mount(TemplateFillDialog, {
      props: { template: TEMPLATE, variables: {} },
      global: { stubs: { Dialog: DialogStub } },
      attachTo: document.body,
    });
    await flushPromises();

    expect(document.activeElement).toBe(
      wrapper.find('input[type="date"]').element
    );
    wrapper.unmount();
  });

  it('inserts with Ctrl+Enter once required fields are filled', async () => {
    const wrapper = mountDialog();
    const input = wrapper.find('input[type="date"]');

    await input.trigger('keydown', { key: 'Enter', ctrlKey: true });
    expect(wrapper.emitted('insert')).toBeUndefined();

    await input.setValue('2026-10-26');
    await input.trigger('keydown', { key: 'Enter', ctrlKey: true });
    expect(wrapper.emitted('insert')[0][0]).toBe(
      'Hi Emily, order ships Mon, Oct 26 by UPS.'
    );
  });

  it('disables Insert until required fields are filled', async () => {
    const wrapper = mountDialog();
    expect(wrapper.find('.confirm').attributes('disabled')).toBeDefined();

    await wrapper.find('input[type="date"]').setValue('2026-10-26');

    expect(wrapper.find('.confirm').attributes('disabled')).toBeUndefined();
  });

  it('emits resolved content with the date chip value', async () => {
    const wrapper = mountDialog();

    await wrapper.find('[data-date-chip="tomorrow"]').trigger('click');
    await wrapper.find('select').setValue('Purolator');
    await wrapper.find('.confirm').trigger('click');

    expect(wrapper.emitted('insert')[0][0]).toBe(
      'Hi Emily, order ships Sat, Oct 24 by Purolator.'
    );
  });

  it('shows the resolved preview while typing', async () => {
    const wrapper = mountDialog();

    await wrapper.find('input[type="date"]').setValue('2026-10-26');

    expect(wrapper.find('[data-testid="template-preview"]').text()).toContain(
      'ships Mon, Oct 26 by UPS'
    );
  });
});

describe('TemplateFillDialog with an AI prompt template', () => {
  const AI_TEMPLATE = {
    id: 9,
    title: 'Answer warmly',
    short_code: 'warm',
    ai_prompt: true,
    content: 'Answer {{contact.first_name}} warmly. Mention {{perk}}.',
    variables: [{ key: 'perk', label: 'Perk', type: 'text' }],
  };

  const PanelStub = {
    props: ['templateId', 'instructions', 'conversationId', 'autoGenerate'],
    emits: ['update:draft'],
    template:
      '<div data-testid="ai-panel" :data-instructions="instructions" :data-conversation="conversationId"><button class="fake-draft" @click="$emit(\'update:draft\', \'Hi Emily! Free shipping.\')" /></div>',
  };

  const mountAi = () =>
    mount(TemplateFillDialog, {
      props: {
        template: AI_TEMPLATE,
        variables: { 'contact.first_name': 'Emily', 'conversation.id': 42 },
      },
      global: { stubs: { Dialog: DialogStub, AiDraftPanel: PanelStub } },
    });

  it('passes the resolved instructions and conversation to the AI panel', async () => {
    const wrapper = mountAi();
    await wrapper.find('input').setValue('free shipping');

    const panel = wrapper.find('[data-testid="ai-panel"]');
    expect(panel.attributes('data-instructions')).toBe(
      'Answer Emily warmly. Mention free shipping.'
    );
    expect(panel.attributes('data-conversation')).toBe('42');
  });

  it('inserts the draft, not the instructions, once there is one', async () => {
    const wrapper = mountAi();
    expect(wrapper.find('.confirm').attributes('disabled')).toBeDefined();

    await wrapper.find('.fake-draft').trigger('click');
    await wrapper.find('.confirm').trigger('click');

    expect(wrapper.emitted('insert')[0][0]).toBe('Hi Emily! Free shipping.');
  });
});
