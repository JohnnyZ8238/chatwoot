import { mount, flushPromises } from '@vue/test-utils';
import ReplyTemplateAiSettingsAPI from 'dashboard/api/replyTemplateAiSettings';
import AiSettingsCard from '../AiSettingsCard.vue';

vi.mock('dashboard/api/replyTemplateAiSettings', () => ({
  default: { get: vi.fn(), update: vi.fn() },
}));
vi.mock('dashboard/composables', () => ({ useAlert: vi.fn() }));

const mountCard = props => mount(AiSettingsCard, { props });

describe('AiSettingsCard', () => {
  beforeEach(() => {
    ReplyTemplateAiSettingsAPI.get.mockReset();
    ReplyTemplateAiSettingsAPI.update.mockReset();
  });

  it('shows that no key is set yet', async () => {
    ReplyTemplateAiSettingsAPI.get.mockResolvedValue({
      data: { configured: false, model: 'deepseek-chat', key_hint: null },
    });
    const wrapper = mountCard({ isAdmin: true });
    await flushPromises();

    expect(wrapper.find('[data-testid="ai-status"]').text()).toContain(
      'REPLY_TEMPLATES.AI_SETTINGS.NOT_SET'
    );
  });

  it('shows only the last four characters of a saved key', async () => {
    ReplyTemplateAiSettingsAPI.get.mockResolvedValue({
      data: {
        configured: true,
        model: 'deepseek-chat',
        key_hint: 'ab12',
        source: 'account',
      },
    });
    const wrapper = mountCard({ isAdmin: true });
    await flushPromises();

    expect(wrapper.find('[data-testid="ai-status"]').text()).toContain('ab12');
    expect(wrapper.find('input[type="password"]').element.value).toBe('');
  });

  it('saves a new key and model, then clears the field', async () => {
    ReplyTemplateAiSettingsAPI.get.mockResolvedValue({
      data: { configured: false, model: 'deepseek-chat', key_hint: null },
    });
    ReplyTemplateAiSettingsAPI.update.mockResolvedValue({
      data: {
        configured: true,
        model: 'deepseek-reasoner',
        key_hint: '5678',
        source: 'account',
      },
    });
    const wrapper = mountCard({ isAdmin: true });
    await flushPromises();

    await wrapper.find('input[type="password"]').setValue('sk-new-5678');
    await wrapper.find('select').setValue('deepseek-reasoner');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(ReplyTemplateAiSettingsAPI.update).toHaveBeenCalledWith({
      api_key: 'sk-new-5678',
      model: 'deepseek-reasoner',
    });
    expect(wrapper.find('input[type="password"]').element.value).toBe('');
    expect(wrapper.find('[data-testid="ai-status"]').text()).toContain('5678');
  });

  it('does not send an empty key when only the model changes', async () => {
    ReplyTemplateAiSettingsAPI.get.mockResolvedValue({
      data: { configured: true, model: 'deepseek-chat', key_hint: 'ab12' },
    });
    ReplyTemplateAiSettingsAPI.update.mockResolvedValue({
      data: { configured: true, model: 'deepseek-reasoner', key_hint: 'ab12' },
    });
    const wrapper = mountCard({ isAdmin: true });
    await flushPromises();

    await wrapper.find('select').setValue('deepseek-reasoner');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(ReplyTemplateAiSettingsAPI.update).toHaveBeenCalledWith({
      model: 'deepseek-reasoner',
    });
  });

  it('only shows the status to agents', async () => {
    ReplyTemplateAiSettingsAPI.get.mockResolvedValue({
      data: { configured: true, model: 'deepseek-chat', key_hint: 'ab12' },
    });
    const wrapper = mountCard({ isAdmin: false });
    await flushPromises();

    expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-status"]').exists()).toBe(true);
  });
});
