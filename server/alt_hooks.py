# LiteLLM 훅 — Claude Code 는 system 을 블록 목록([{type: text, text, cache_control}])으로 보내는데, ChatGPT(Codex) 쪽은 목록이면
# system 역할 메시지로 넘겨 "System messages are not allowed"(400)로 거절한다(실측 2026-11-02). 글 한 덩어리로 펴면 instructions 로 들어간다.
# alt_llm.ensure() 가 LiteLLM 설정 파일 옆에 복사해 둔다(설정의 callbacks: alt_hooks.proxy_handler_instance)
from litellm.integrations.custom_logger import CustomLogger


class Flat(CustomLogger):
    async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type):
        s = data.get('system')
        if isinstance(s, list): data['system'] = '\n\n'.join(b.get('text', '') for b in s if isinstance(b, dict))
        return data


proxy_handler_instance = Flat()
