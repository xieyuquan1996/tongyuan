import { Breadcrumb, H1, H2, Lead, P, IC, Code } from "./Layout.jsx";

export default function RegionsArticle() {
  return (
    <article>
      <Breadcrumb section="入门" page="区域选择"/>
      <H1 id="top">区域选择</H1>
      <Lead>同源在中国大陆、香港和美西各有机房。默认根据客户端 IP 就近路由，你也可以显式指定。</Lead>

      <H2 id="list">机房一览</H2>
      <Code language="TABLE">{`cn-east-1   上海     p50 ~180ms   主力节点
cn-north-1  北京     p50 ~200ms
cn-south-1  深圳     p50 ~195ms
hk-1        香港     p50 ~85ms    海外流量首选
us-west-2   美西     p50 ~1.2s    跨洋，不推荐主路径`}</Code>

      <H2 id="pin">显式指定</H2>
      <P>在请求上加一个头就行：</P>
      <Code language="HTTP">{`x-ty-region: hk-1`}</Code>
      <P>不合法或容量已满的区域会返回 <IC>409 region_unavailable</IC>，不会 silently fallback — 这是刻意的，我们不会把 region 也给你"掺水"。</P>

      <H2 id="failover">故障转移</H2>
      <P>单个上游账户失败时，我们在同一区域内的账户池里重试。跨区域的路由只在显式开启 <IC>x-ty-allow-cross-region: true</IC> 后才会发生，且响应头会带 <IC>x-ty-actual-region</IC> 告诉你实际打到了哪里。</P>
    </article>
  );
}
