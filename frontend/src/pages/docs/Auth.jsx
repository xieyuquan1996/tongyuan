import { Breadcrumb, H1, H2, Lead, P, IC, Code, Callout } from "./Layout.jsx";

export default function AuthArticle() {
  return (
    <article>
      <Breadcrumb section="入门" page="认证与密钥"/>
      <H1 id="top">认证与密钥</H1>
      <Lead>
        同源使用 Bearer Token 认证，格式和 Anthropic 官方兼容。你的密钥同时作为 <IC>x-api-key</IC> 头
        或 <IC>Authorization: Bearer</IC> 发送都可以。
      </Lead>

      <H2 id="format">密钥格式</H2>
      <P>密钥以 <IC>sk-relay-</IC> 开头，后面是 32 字节的 crockford-style base32 编码，全字符串 61 位。我们只在服务端保存 SHA-256 哈希 — 丢失密钥就必须重新生成。</P>
      <Code language="TEXT">{`sk-relay-9F3A7C1B2D8E6A4F0C5B8E1A3D7F2C4B6E8A0D5F7B1C3E5A7D9F1B3E5A`}</Code>

      <H2 id="rotate">轮换</H2>
      <P>建议至少每 90 天轮换一次。轮换步骤：</P>
      <P>1. 控制台创建新密钥；</P>
      <P>2. 应用同时支持两把（旧的仍然有效）；</P>
      <P>3. 监控无流量打到旧密钥 24h 后在控制台撤销。</P>
      <Callout tone="warn" title="不要把密钥写进源码">
        使用环境变量 <IC>TONGYUAN_API_KEY</IC> 或密钥管理服务。我们会在控制台对提交到公开 Git 仓库的密钥做扫描告警，但不依赖。
      </Callout>

      <H2 id="scope">子密钥 / 限制（Pro）</H2>
      <P>Pro 用户可以为每把密钥单独配置：按模型白名单、按 IP 段、按 RPM / TPM 上限、按月度预算。这些限制在我们的网关上强制，不需要你在应用层做。</P>
    </article>
  );
}
