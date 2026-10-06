# Gym on a phone during local development

No public deployment or tunnel is needed. The development computer must stay on,
awake and connected to the same trusted private LAN as the phone. Local Gym needs
no integration login. Do not use guest/public Wi-Fi or forward port 3000 on a router.

## Start deliberately

Stop the existing dev process with Ctrl+C in its terminal, then run:

```powershell
pnpm lan:url
pnpm dev:lan
```

The script lists current private IPv4 interface URLs and selects the only available
address. If several exist (VPN/virtual adapters included), choose the Wi-Fi/Ethernet
address actually shared with the phone:

```powershell
pnpm lan:url --host 192.168.1.103
pnpm dev:lan --host 192.168.1.103
```

That address is an example, not a fixed configured address. Open the printed
`http://<computer-private-ip>:3000/gym` on the phone. The launcher binds port 3000
on the LAN and permits exactly the selected hostname for Next development assets/HMR.
It does not change integration origins, authentication or environment files. On the
computer `http://localhost:3000` continues to work. `pnpm dev` now explicitly binds
only 127.0.0.1; use that command again to return to desktop-only development.

## Windows firewall / network

Use a **Private** Windows network profile only for your trusted home LAN. If Windows
prompts about Node.js, allow **Private networks only**, never Public networks.
If an inbound rule is needed, this example is restricted to Private profile,
port 3000, the chosen local IP, Node and local-subnet clients. Run it yourself in
an elevated PowerShell after substituting the address printed by `pnpm lan:url`:

```powershell
$stillformLanIp = '192.168.1.103'
$stillformNodePath = (Get-Command node).Source
New-NetFirewallRule -DisplayName 'Stillform LAN development' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -LocalAddress $stillformLanIp -RemoteAddress LocalSubnet -Profile Private -Program $stillformNodePath
```

Remove the development rule when no longer needed:

```powershell
Remove-NetFirewallRule -DisplayName 'Stillform LAN development'
```

No firewall/profile/router settings are changed automatically. If the page is
unreachable, verify the current IP, PC sleep state, same network and Wi-Fi client
isolation. Inspect existing broad Node rules instead of disabling the firewall.

## Move the existing Gym history once

Local storage is **per browser and origin**, not per server. Phone LAN storage,
desktop localhost storage and desktop LAN storage are separate. A changed IP also
creates a different origin. Use the same URL/browser consistently and keep backups.

1. On the desktop's existing localhost Gym, open **Backup, export & Hevy import**.
2. Export the Stillform JSON backup. It includes exercise IDs, mappings, history,
   preferences, routines and any active workout; it contains no integration secrets.
3. Transfer that private file to your phone using a method you trust.
4. In the phone's empty Gym browser, select **Stillform JSON backup**, review the
   counts and active-workout status, check confirmation and select **Confirm JSON bootstrap**.
5. Create a routine using **Recent / frequently used exercises**, save it and start.
   Leave workout, navigate, reload and use **Workout in progress** to resume.

Bootstrap makes one validated atomic copy into an entirely empty, unmodified Gym
store. It refuses overwrites/merges into populated storage and stale previews.
It does not delete the desktop copy, infer routines or change exercise IDs/metadata.
Choose **one browser as the authoritative logger**. Logs made on the phone do not
automatically appear on desktop; export phone backups regularly. Cross-device merge
and cloud Gym sync remain future work. Do not clear browser data to reconcile copies.

LAN HTTP is intended for trusted-network local Gym only. Integration login, OAuth,
sync and credentials stay on localhost; origin checks are unchanged and reject LAN
writes. Do not enter integration passwords on the phone over LAN HTTP. Server secrets
remain server-only. Service-worker/PWA installation and secure-context APIs may be
unavailable over HTTP. IDs use cryptographic getRandomValues where randomUUID is absent.
Hevy SHA-256 preview requires a secure context: use localhost for Hevy CSV import,
then bootstrap an empty phone browser from JSON; no CSV is uploaded to hash it.

## Exercise shortlist and ongoing Hevy exports

Only confirmed real completed workouts dated **2026-09-01 or later in Europe/Rome**
contribute. Future timestamps, demos and unverified legacy data are excluded. An
exercise with recorded sets counts once per workout even across repeated blocks.
Logged sets include completed sets and unfinished sets containing recorded fields;
untouched blank sets do not count. IDs come from the existing library; no exercises,
muscle metadata or routines are generated.

Ranking is the sum, across workout exposures, of `2^(-calendar-age-days / 28)`.
Frequent and recent exposures both help; more sets alone cannot inflate ranking.
Pins come first, then score, latest timestamp, stable exercise ID. This is a navigation
heuristic, not a performance/physiology score. Pin/unpin and dismiss/restore persist.
Six suggestions initially appear on Gym, four inside editors; Show more expands in
small batches. New completed logs update suggestions. Full library/history stays searchable.

A newer complete Hevy CSV can be previewed normally against the existing store. Use
the **same source timezone**, saved mappings, review summary and explicit confirmation.
Fingerprints include source dates, metadata and workout-relative row order/content;
prepending new sessions does not alter older fingerprints. Exact matches are unchanged
duplicates; only genuinely new workouts and their sets are added. Existing IDs, sets,
provenance and nullable metadata are preserved. Added workouts/sets, skipped duplicates,
unchanged workouts and skipped set rows are reported separately.

An edited prior session (including appended sets) changes its fingerprint and is a
possible duplicate at the same start time. It requires review; **Skip** preserves the
existing session. **Import separately** is only for a genuinely distinct session.
Automatic historical editing/set merging is not supported because the CSV has no stable
workout ID. No deletion or reimport of the existing 287 sessions is required. If you
continue logging Hevy, keep importing on the authoritative browser; do not assume two
independent local stores reconcile automatically.

## Shared account Gym on the phone: trusted HTTPS

HTTP LAN still supports the existing browser-local workflow. Cloud sign-in/saves reject
HTTP outside loopback; do not send account passwords over it. After approved desktop
bootstrap and schema installation, use an explicitly trusted local TLS certificate that
covers `localhost`, `127.0.0.1` and the current private IP. Next's documented development
HTTPS supports user-supplied certificate/key files. Create certificates with a reputable
local development CA such as mkcert and install its root certificate on your phone
explicitly. Do not bypass browser certificate warnings or share the CA private key.
Certificate trust/network/firewall changes are never made by the application.

Keep certificate/key files in ignored `certificates/`. After stopping HTTP dev:

```powershell
pnpm lan:url --https --host 192.168.1.103
pnpm dev:lan --https --host 192.168.1.103 --experimental-https-key ./certificates/stillform-key.pem --experimental-https-cert ./certificates/stillform.pem
```

Open the printed `https://<private-ip>:3000/gym`, with no browser security warning.
Gym > Account Gym > sign in to the same existing Stillform account, then Check / reload
account. Do not bootstrap a separate empty phone dataset over existing cloud history.
The same HTTPS dev instance serves `https://localhost:3000`; its browser-local store is
separate from HTTP localhost, so perform initial migration from the original HTTP origin
first. Return to `pnpm dev` for unchanged HTTP localhost integrations/OAuth. HTTPS Gym
sign-in uses a separate secure HttpOnly session and does not replace Polar credentials.

The plain `--https` flag also enables Next's certificate generation, which may prompt
for local certificate-tool/trust installation; use supplied certificates for predictable
phone/IP coverage. No HTTPS setup was applied automatically. Private-network-only
firewall guidance above still applies. If IP changes, regenerate the IP certificate and
restart the launcher with the new address. Cloud authority eliminates repeated JSON copies;
previous empty-browser JSON bootstrap below remains a local-only fallback, not account sync.

For certificate creation, install mkcert using its [official Windows instructions](https://github.com/FiloSottile/mkcert#installation), then run these commands yourself
(the first deliberately installs your development CA into the desktop trust store):

```powershell
mkcert -install
New-Item -ItemType Directory -Force ./certificates
mkcert -key-file ./certificates/stillform-key.pem -cert-file ./certificates/stillform.pem localhost 127.0.0.1 192.168.1.103
mkcert -CAROOT
```

Substitute the current IP printed by `pnpm lan:url`. Transfer only `rootCA.pem` from
the printed CA folder to your phone and explicitly install/trust it using the phone's
certificate settings. On iOS, install the profile and enable full trust in Certificate
Trust Settings. Never transfer `rootCA-key.pem`. See [mkcert's mobile guidance](https://github.com/FiloSottile/mkcert#mobile-devices).
No CA, certificate, browser trust exception or firewall change has been applied by this task.
