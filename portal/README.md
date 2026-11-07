# Testing bench

The public site stays on GitHub Pages. Pages cannot check a password, so `test/index.html` is a closed plaque: no password field, no game bytes, no link from the rest of the site. The password check lives in `handle.js` and runs only when a host is actually configured. Until then every request on that host is the closed plaque as well.

Nothing in this directory publishes the site, changes DNS, or creates an account.

## What is already true in the repository

| Copy | Package | On this bench |
| --- | --- | --- |
| Maxwell's Demon, full | `md-test-36ec3cdea1`, Professor package pass | Reserved. The zip is not in the repository. It stays closed until a seal and a private copy exist. |
| Vacuum Maze, full | `vm-test-full-a4a51186fe`, Professor package pass | Same. `vm-test-full-841142a6a1` is refused and must not be uploaded. |
| Fantastic Apparatus, full standard | `fa-standard-full-v1-4322acb`, Professor package pass | Same. The package is accepted. It is not waiting on preparation. It is not served from this repository. |
| Fantastic Apparatus, experimental, five extra parts | `fa-experimental-full-v3-craft-b6a055d`, craft pass only | Stays closed. Physics, input, and saved-record review is still open. Do not seal or upload it. |

Zip SHA-256 values stay in the host secret `PORTAL_PACKAGES_MANIFEST`. They are not written here. `packages.manifest.example.json` keeps the ids and blank seals.

Public demos, notebooks, and `/play/` are unchanged. This bench does not modify a game and does not turn a demo into a full copy.

## Service workers

Each public demo registers `sw.js` next to itself, with no scope argument. The default scope is that demo's directory (`/play/<game>/`). Those `sw.js` files are not in the repository, so the registration fails closed. That scope does not cover `/test`.

A worker already controlling the whole origin still could. Shell pages load `portal-sw-guard.js`, which unregisters a worker whose scope is `/` or `/test` and reloads once if that worker was in control. It leaves `/play/` workers alone. Logout also sends `Clear-Site-Data: "cache"` and does not clear storage, so save records are not wiped. `sw.js` under `/test` is never served. A worker that ignores unregistration and answers from its own cache, without contacting the host, cannot be stopped from the server. A separate hostname is the isolation that does not share that cache.

## Saves

Approved builds are expected to keep their own records. This repository does not change those builds. On `gillundlabs.com` the public pages and `/test` share one origin, so the browser does not separate their storage for them. A different hostname does.

## Password check

The handler issues a session only when all of these are true:

- `PORTAL_SESSION_SECRET` is at least 32 characters.
- `PORTAL_USERS` is a JSON list of records from `hash-password.js`. PBKDF2-SHA256, at least 600,000 iterations. Weaker records stay closed unless `PORTAL_TEST_KDF=1`, which is for the tests.
- A rate-limit store is attached. One Node process may use memory. A Worker must bind KV as `PORTAL_RATE`. Memory inside a Worker isolate is not a limit, and login stays closed without the binding.
- The request is HTTPS. `PORTAL_DEV_INSECURE=1` allows HTTP only for `127.0.0.1` or `localhost`, for the preview server.

The cookie is `HttpOnly`, `SameSite=Strict`, and `Secure` on HTTPS, with `Path` set to the bench. Sign-in is a normal form (`autocomplete="username"` and `autocomplete="current-password"`). The form carries a token that must match an HttpOnly cookie, and the `Origin` must be this host. `next` may only point back under the bench. Eight tries per username and address, and thirty per address, in fifteen minutes. A missing store, a bad secret, or a refused package id in the manifest closes the bench instead of asking for a password.

Sessions last eight hours. Sign-out revokes the session id and clears the cookie.

## Private copies

`accept-package.js` checks the zip against the secret manifest, refuses the failed Vacuum Maze id, refuses path escape, links, nested archives, and service-worker scripts, and writes a sealed tree. It does not upload. The output must be `portal/out` or a directory outside the repository. The handler serves a file only when the seal matches `PORTAL_PACKAGE_SEAL_KEY`, the zip SHA-256 matches the secret, and the file's own SHA-256 matches the seal. Every one of those responses is `private, no-store` and `X-Robots-Tag: noindex`. The zip itself has no URL.

```sh
PORTAL_USERNAME=ada node portal/hash-password.js
PORTAL_PACKAGES_MANIFEST="$(cat "$SECRET_MANIFEST")" \
PORTAL_PACKAGE_SEAL_KEY="$SEAL" \
  node portal/accept-package.js --slot maxwells-demon --zip /path/to/package.zip --out /secure/maxwell
```

The password is read from stdin. Do not pass it as an argument.

## Host still required

GitHub Pages cannot check a password. `vercel.json` is ignored there, so `gillundlabs.com/test` stays the closed plaque until a different host is placed in front of that path. This branch does not change DNS and does not move the site.

The connected Vercel account can run the same handler. `vercel.json` sends only `/test` and `/test/*` to `api/bench.mjs`. Other paths stay static files. Do not attach `gillundlabs.com` to that Vercel project: that would take the whole website off Pages. This branch does not create a project, a database, a blob store, or environment variables, and it does not deploy.

On Vercel the function stays closed, with no password form, until the project environment has all of these, outside git:

- `PORTAL_SESSION_SECRET` and `PORTAL_USERS` (from `hash-password.js`).
- A shared rate-limit store: `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Memory on one function instance is not a limit.
- When a copy should open: `PORTAL_PACKAGE_SEAL_KEY`, `PORTAL_PACKAGES_MANIFEST`, `PORTAL_PACKAGE_BASE_URL` (https), and `PORTAL_PACKAGE_TOKEN`. The function reads `packages/<id>/...` from that private URL. It does not read the git tree.

Vercel’s Node function can run PBKDF2-SHA256 at 600,000 iterations. The Cloudflare Workers free plan cannot: it allows 10 ms of CPU per request ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), checked 7 Nov 2026). Workers Paid starts at $5 per month and is not selected here. No Vercel plan was purchased, and no price for the connected account is assumed.

A separate hostname would keep service workers, caches, and save storage off the public origin. That DNS record is not part of this change. Serving `/test` on `gillundlabs.com` itself shares that origin with the public demos.

`dev-server.js` is a loopback preview. It is not the deployment.

Do not merge this branch onto Pages, and do not upload a game zip into the repository. Still open: sealing the three accepted packages on a private store, the shared rate-limit store, HTTPS on the chosen host, browser checks of those real packages, and cache isolation in a browser that has used the public demos. The experimental Fantastic Apparatus stays unavailable.
