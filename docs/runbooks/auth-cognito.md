# Runbook — Cognito auth (login / logout / token verify)

- **Owner**: ontology-mfg-dev
- **Last reviewed**: 2026-05-09
- **Severity**: Standard
- **Scope**: Production (mfg-ontology.whchoi.net)

## Setup at a glance

| Component | Value |
|-----------|-------|
| User Pool ID | `us-east-1_zQZZJRYer` |
| User Pool Region | `us-east-1` |
| App Client ID | `422o42g8odcmv21860cu2jta4` |
| Cognito Domain | `ontology-mfg-dev.auth.us-east-1.amazoncognito.com` |
| Callback URL | `https://mfg-ontology.whchoi.net/api/auth/callback` |
| LogoutURLs | `https://mfg-ontology.whchoi.net/`, `https://mfg-ontology.whchoi.net/api/auth/logout` |
| Allowed OAuth flow | `code` |
| Allowed scopes | `openid email` |
| Cookie name | `mfg_id_token` (HttpOnly, SameSite=Lax, Secure) |
| Demo users | `admin@whchoi.net`, `demo@whchoi.net` (vault: `ontology-mfg-demo`) |

## Procedure

### Add / remove a demo user

```bash
# Create
aws cognito-idp admin-create-user \
  --user-pool-id us-east-1_zQZZJRYer \
  --username new-user@example.com \
  --user-attributes Name=email,Value=new-user@example.com Name=email_verified,Value=true \
  --temporary-password '<rotated-by-Cognito>' \
  --region us-east-1

# Set permanent password
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_zQZZJRYer \
  --username new-user@example.com \
  --password '<from vault>' --permanent \
  --region us-east-1

# Delete
aws cognito-idp admin-delete-user \
  --user-pool-id us-east-1_zQZZJRYer \
  --username old-user@example.com --region us-east-1
```

### Rotate the demo password

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id us-east-1_zQZZJRYer \
  --username admin@whchoi.net \
  --password '<new>' --permanent \
  --region us-east-1
```

Update the 1Password vault `ontology-mfg-demo` with the new password.

### Add a new redirect URI (e.g. preview deployment)

```bash
aws cognito-idp update-user-pool-client \
  --user-pool-id us-east-1_zQZZJRYer \
  --client-id 422o42g8odcmv21860cu2jta4 \
  --callback-urls \
    "https://mfg-ontology.whchoi.net/api/auth/callback" \
    "https://preview.example.com/api/auth/callback" \
  --logout-urls \
    "https://mfg-ontology.whchoi.net/" \
    "https://mfg-ontology.whchoi.net/api/auth/logout" \
    "https://preview.example.com/" \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email \
  --allowed-o-auth-flows-user-pool-client \
  --region us-east-1
```

⚠️ **Trailing slash matters** — Cognito does exact match. Always
include both `https://host/` and `https://host` if the application
emits either.

## Verification

```bash
# Verify config is set as expected
aws cognito-idp describe-user-pool-client \
  --user-pool-id us-east-1_zQZZJRYer \
  --client-id 422o42g8odcmv21860cu2jta4 \
  --region us-east-1 \
  --query 'UserPoolClient.{CallbackURLs:CallbackURLs,LogoutURLs:LogoutURLs,Flows:AllowedOAuthFlows,Scopes:AllowedOAuthScopes}'

# Smoke — login redirect should hit Cognito hosted UI
curl -sS -o /dev/null -w "%{http_code} → %{redirect_url}\n" --max-redirs 0 \
  https://mfg-ontology.whchoi.net/api/auth/login
# Expected: 307 → https://ontology-mfg-dev.auth.us-east-1.amazoncognito.com/login?...

# Smoke — logout should hit Cognito logout with logout_uri matching a registered LogoutURL
curl -sS -o /dev/null -w "%{http_code} → %{redirect_url}\n" --max-redirs 0 \
  https://mfg-ontology.whchoi.net/api/auth/logout
# Expected: 307 → https://ontology-mfg-dev.auth.us-east-1.amazoncognito.com/logout?...&logout_uri=https://mfg-ontology.whchoi.net/
```

## Symptoms → fixes

### "Required String parameter 'redirect_uri' is not present"

User clicks logout → Cognito error page. **Cause**: `logout_uri` doesn't
exact-match any registered LogoutURL. Common: trailing slash mismatch.

**Fix**: ensure `auth.py:logout()` sends `logout_uri` with the same
trailing slash as the registered URL. Code already normalizes via
`APP_BASE.rstrip("/") + "/"`. If error persists, check the registered
LogoutURLs include both variants.

### "An error was encountered with the requested page"

Cognito hosted UI generic error. Most often **callback URL not
registered** for the env you're testing from. Add the env's domain
via the `update-user-pool-client` recipe above.

### Cookie not set after callback

Browser receives the redirect from `/api/auth/callback` but no cookie
on the next request. Common causes:

- Cookie was set with `Secure=true` but the request was http (dev)
  — Cognito + the demo only support https
- SameSite browser policy stripped the cookie on a cross-site redirect
  — verify the redirect lands on same domain (it should, post-CloudFront)

## Rollback

Cognito changes via `update-user-pool-client` are atomic — re-run with
the previous values to revert. Capture the current state with
`describe-user-pool-client` before any change.

## Related

- ADR (none authored yet) — Cognito setup is described in original spec
- `api/routers/auth.py` — login / callback / logout / whoami endpoints
- `api/middleware_auth.py` — JWT verification on protected routes
- `docs/runbooks/incident-response.md` § Symptom C — logout trailing-slash bug
