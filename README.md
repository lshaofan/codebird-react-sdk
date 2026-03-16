# @codebird/react

Code Bird Cloud 的 React SPA 认证接入 SDK。

它负责：

- 登录、登出、callback 处理
- 当前用户与组织上下文
- 面向目标 `resource` 的 access token 获取
- organization token 获取
- 本地 state / storage / token 生命周期托管

## 安装

```bash
pnpm add @codebird/react
```

## 最小示例

```tsx
import { CodeBirdProvider } from '@codebird/react';

export function AuthBootstrap() {
  return (
    <CodeBirdProvider
      endpoint="https://auth.codebird.cloud"
      appId="YOUR_APP_ID"
      redirectUri="https://app.example.com/callback"
      postLogoutRedirectUri="https://app.example.com"
      defaultResource="https://api.example.com"
      scopes={['openid', 'profile', 'email', 'offline_access']}
    >
      <App />
    </CodeBirdProvider>
  );
}
```

## 组织级登录

单组织后台通常建议直接配置：

```tsx
<CodeBirdProvider
  endpoint="https://auth.codebird.cloud"
  appId="YOUR_APP_ID"
  redirectUri="https://app.example.com/callback"
  postLogoutRedirectUri="https://app.example.com/login"
  defaultResource="https://api.example.com"
  defaultOrganizationId="org_xxx"
  scopes={[
    'openid',
    'profile',
    'email',
    'offline_access',
    'urn:codebird:scope:organizations',
    'urn:codebird:scope:organization_roles',
  ]}
>
  <App />
</CodeBirdProvider>
```

登录时：

```ts
await auth.signIn();
```

也可以显式传入组织参数：

```ts
await auth.signIn({
  organizationId: 'org_xxx',
  resource: 'https://api.example.com',
});
```

## Token 获取

推荐直接通过 SDK 获取 token：

```ts
const accessToken = await auth.getAccessToken();
const organizationToken = await auth.getOrganizationToken('org_xxx');
```

SDK 会尽量保证：

- `getAccessToken()` 返回的 token 面向当前目标 `resource`
- token 已过期或即将过期时自动续期
- organization token 做同样的有效期与缓存处理

## 打开个人中心

如果第三方系统里的用户已经完成登录，可以直接通过 SDK 打开 CodeBird 账户中心。

SDK 会自动：

- 使用当前用户 access token 调用 `/api/account/sso-ticket`
- 获取一次性 `redirect_url`
- 使用浏览器新标签页打开账户中心

```ts
await auth.openAccountCenter();
```

也可以指定目标页和组织上下文：

```ts
await auth.openAccountCenter({
  target: 'security',
  organizationId: 'org_xxx',
});
```

当前支持的 `target`：

- `overview`
- `profile`
- `security`
- `connections`

## 本地开发

```bash
pnpm install
pnpm test
pnpm build
```

## 发布

建议通过 GitHub Actions 在 tag 时自动发布：

- tag 格式：`vX.Y.Z`
- 发布命令：`npm publish --access public`

## License

MIT
