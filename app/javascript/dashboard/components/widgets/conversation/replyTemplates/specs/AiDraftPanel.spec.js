import { mount, flushPromises } from '@vue/test-utils';
import CannedResponseAPI from 'dashboard/api/cannedResponse';
import AiDraftPanel from '../AiDraftPanel.vue';

vi.mock('dashboard/api/cannedResponse', () => ({
  default: { generate: vi.fn() },
}));

const mountPanel = (props = {}) =>
  mount(AiDraftPanel, {
    props: {
      templateId: 7,
      instructions: 'Tell them it ships Monday',
      conversationId: 42,
      ...props,
    },
  });

describe('AiDraftPanel', () => {
  beforeEach(() => {
    CannedResponseAPI.generate.mockReset();
  });

  it('generates a draft from the template instructions and the conversation', async () => {
    CannedResponseAPI.generate.mockResolvedValue({
      data: { draft: 'Hi Emily, it ships Monday.' },
    });
    const wrapper = mountPanel();

    await wrapper.find('[data-testid="ai-generate"]').trigger('click');
    await flushPromises();

    expect(CannedResponseAPI.generate).toHaveBeenCalledWith(7, {
      conversationId: 42,
      instructions: 'Tell them it ships Monday',
    });
    expect(wrapper.find('textarea').element.value).toBe(
      'Hi Emily, it ships Monday.'
    );
    expect(wrapper.emitted('update:draft').at(-1)).toEqual([
      'Hi Emily, it ships Monday.',
    ]);
  });

  it('generates on open when asked to', async () => {
    CannedResponseAPI.generate.mockResolvedValue({ data: { draft: 'Draft' } });

    mountPanel({ autoGenerate: true });
    await flushPromises();

    expect(CannedResponseAPI.generate).toHaveBeenCalledTimes(1);
  });

  it('shows the server error when generation fails', async () => {
    const apiError = Object.assign(new Error('Request failed'), {
      response: { data: { error: 'AI drafts need ANTHROPIC_API_KEY' } },
    });
    CannedResponseAPI.generate.mockRejectedValue(apiError);
    const wrapper = mountPanel();

    await wrapper.find('[data-testid="ai-generate"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="ai-error"]').text()).toContain(
      'ANTHROPIC_API_KEY'
    );
  });

  it('does not call the API without a conversation', async () => {
    const wrapper = mountPanel({ conversationId: null });

    await wrapper.find('[data-testid="ai-generate"]').trigger('click');
    await flushPromises();

    expect(CannedResponseAPI.generate).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="ai-error"]').exists()).toBe(true);
  });
});
