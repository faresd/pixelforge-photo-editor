# Optional Cheaply Auth migration

`https://auth.cheaply.fr` is the target central OAuth/OIDC issuer for Cheaply applications. Keep this integration optional until the new Auth service, PostgreSQL storage, Kubernetes rollout, DNS ownership, and canary checks are complete.

Default production behavior must remain unchanged while `CHEAPLY_AUTH_ENABLED=false`.

Required optional settings:

- `CHEAPLY_AUTH_ENABLED=false`
- `CHEAPLY_AUTH_ISSUER=https://auth.cheaply.fr`
- `CHEAPLY_AUTH_CLIENT_ID`
- `CHEAPLY_AUTH_CLIENT_SECRET` for confidential clients only
- `CHEAPLY_AUTH_USERINFO_URL=https://auth.cheaply.fr/oauth/userinfo`

Use Authorization Code with S256 PKCE for browser sign-in. Do not use implicit flow. Do not commit secrets or log tokens, authorization codes, cookies, client secrets, kubeconfig, or provider artifacts.
