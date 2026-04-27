import { Breadcrumb, H1, H2, Lead, P, IC, Code, Callout } from "./Layout.jsx";

export default function QuickstartArticle() {
  return (
    <article>
      <Breadcrumb section="入门" page="快速开始" />
      <H1 id="top">5 分钟接入 同源</H1>
      <Lead>
        把官方 Anthropic SDK 的 base URL 换成 <IC>api.tongyuan.ai</IC>，其他不用改。
        下面是 Python 和 TypeScript 的最小示例。
      </Lead>

      <H2 id="install">1 · 安装 SDK</H2>
      <P>我们 100% 兼容官方 SDK，直接用 Anthropic 的版本即可：</P>
      <Code language="BASH">{`pip install anthropic
# or
npm install @anthropic-ai/sdk`}</Code>

      <H2 id="key">2 · 获取密钥</H2>
      <P>
        登录控制台 → API 密钥 → 创建密钥。密钥以 <IC>sk-relay-</IC> 开头。
      </P>
      <Callout tone="warn" title="只在创建时显示一次">
        密钥创建后，完整字符串只显示一次。请立即复制保存到环境变量，例如 <IC>TONGYUAN_API_KEY</IC>。
      </Callout>

      <H2 id="call">3 · 第一次调用</H2>
      <Code language="PYTHON">{`import os
from anthropic import Anthropic

client = Anthropic(
    api_key=os.environ["TONGYUAN_API_KEY"],
    base_url="https://api.tongyuan.ai",
)

resp = client.messages.create(
    model="claude-sonnet-4.5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "用一句话证明你是 Sonnet 4.5。"}],
)
print(resp.content[0].text)
print(resp.model)  # → claude-sonnet-4.5  (与请求一致)`}</Code>

      <H2 id="verify">4 · 验证保真</H2>
      <P>
        每次响应都会带回 <IC>x-ty-audit-id</IC> 头。把它粘到控制台 → 请求日志，
        可以看到我们发给 Anthropic 的完整字节，包括 system prompt 长度、max_tokens、模型名。
        三处都应当与你上行的请求字节级一致。
      </P>
      <Callout tone="clay" title="不一致就退款">
        如果你截图发现任何一项被改写过，发邮件到 <IC>support@tongyuan.ai</IC>，
        我们退一个月费用，无需解释。
      </Callout>

      <H2 id="next">下一步</H2>
      <P>
        看完上面，可以继续阅读 <IC>认证与密钥</IC>（如何轮换 / 限流 / 子密钥），
        或直接跳到 <IC>messages.create</IC> 完整 API 参考。
      </P>
    </article>
  );
}
