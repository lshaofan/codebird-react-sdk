# @codebird/react

Code Bird Cloud 的 React SPA 认证接入 SDK。

它负责：

- 登录、登出、callback 处理
- 当前用户与组织上下文
- 实时会话上下文获取
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

## 获取实时会话上下文

如果第三方系统需要拿到数据库实时状态，而不是登录时 claims 快照，可以直接通过 SDK 拉取实时上下文。

适合的场景：

- 管理员刚刚修改了用户资料
- 用户在使用过程中被移出组织
- 第三方系统需要按最新组织关系判断权限

命令式调用：

```ts
const context = await auth.getSessionContext({
  organizationId: 'org_xxx',
});
```

React 页面内也可以直接使用 hook：

```ts
const { data, loading, error, refresh } = useSessionContext({
  organizationId: 'org_xxx',
});
```

返回结果包含：

- `tenant`
- `user`
- `application`
- `organization`
- `organizations`
- `session`

其中 `tenant.slug` 是终端用户租户化入口的标准标识，可用于识别：

- `/t/{tenant.slug}/sign-in`
- `/t/{tenant.slug}/account-center/...`

推荐约定：

- `useCodeBirdUser()` 继续用于轻量展示
- 敏感权限判断改用 `getSessionContext()` / `useSessionContext()`

## 构造租户化终端用户入口

当第三方系统需要主动跳转到认证中心终端用户页面时，不要再手工拼裸路径。可以直接使用 SDK 提供的租户化 URL helper：

```ts
const signInUrl = auth.buildTenantSignInUrl('tenant-demo');
const registerUrl = auth.buildTenantRegisterUrl('tenant-demo');
const forgotPasswordUrl = auth.buildTenantForgotPasswordUrl('tenant-demo');
```

对应结果分别是：

- `/t/{tenantSlug}/sign-in`
- `/t/{tenantSlug}/register`
- `/t/{tenantSlug}/forgot-password`

注意：

- `tenantSlug` 不能为空
- 这组 helper 只用于终端用户入口地址构造
- 账户中心仍然应优先使用 `openAccountCenter()`，不要自己拼 `/account-center/...`

## 官方认证守卫

如果第三方系统希望尽量少写一层自己的认证守卫逻辑，可以直接使用 SDK 提供的 `CodeBirdAuthGuard`。

它只负责：

- 等待 SDK 完成登录态恢复
- 已登录时渲染受保护内容
- 未登录时执行你提供的未认证处理逻辑

它不会绑定任何特定路由库，也不会默认替你决定跳转方式。

```tsx
import { CodeBirdAuthGuard, useCodeBirdAuth } from '@codebird/react';

function ProtectedApp() {
  const auth = useCodeBirdAuth();

  return (
    <CodeBirdAuthGuard
      loadingFallback={<div>Loading...</div>}
      unauthenticatedFallback={<div>Redirecting...</div>}
      onUnauthenticated={() => auth.signIn()}
    >
      <App />
    </CodeBirdAuthGuard>
  );
}
```

建议：

- 不要在第三方项目里再自己根据 `expires_at` 判断是否跳登录页
- 不要再自行监听 token 过期事件后立刻清本地登录态
- 守卫只基于 SDK 的 `isLoading` / `isAuthenticated` 工作

## 组织角色 claims 格式

React SDK 当前只支持新版 `organization_roles` 字符串数组格式：

```json
["org_123:admin", "org_456:member"]
```

SDK 会将其归一化为：

```ts
{
  org_123: ['admin'],
  org_456: ['member'],
}
```

旧版对象格式不再兼容。

组织管理员身份请始终以 `organization_is_admin` 为准，不要再根据 `organization_roles` 中是否包含 `admin` 推断。

## 打开个人中心

如果第三方系统里的用户已经完成登录，可以直接通过 SDK 打开 CodeBird 账户中心。

SDK 会自动：

- 使用当前用户 access token 调用 `/api/account/sso-ticket`
- 获取一次性 `redirect_url`
- 使用浏览器新标签页打开账户中心

注意：

- 账户中心最终落点由后端返回
- 当前标准落点是租户化路径，如 `/t/{tenant.slug}/account-center/...`
- 不要再在第三方项目中手工拼裸 `/account-center/...`

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
