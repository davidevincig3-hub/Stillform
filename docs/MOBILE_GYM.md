# Gym on a phone during local development

Use the same trusted private Wi-Fi as the Windows desktop. Keep the PC awake.
No public deployment, router port forwarding or tunnel is needed.

## Choose a mode

| Command          | URL                             | Purpose                                                             |
| ---------------- | ------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`       | `http://localhost:3000`         | Unchanged localhost-only development and integrations/OAuth         |
| `pnpm dev:lan`   | `http://<private-ip>:3000/gym`  | Existing browser-local Gym; account login is rejected over LAN HTTP |
| `pnpm dev:https` | `https://<private-ip>:3000/gym` | Trusted LAN account sign-in and shared Supabase Gym                 |

Only one mode can use port 3000 at a time. Stop the previous terminal with Ctrl+C.
`pnpm lan:url` prints current private IPv4 addresses. With multiple adapters, choose
Wi-Fi/Ethernet shared with the phone using `--host <listed-ip>`. HTTPS URL discovery:

```powershell
pnpm lan:url --https
pnpm dev:https --host <listed-ip>
```

Without `--host`, a single private interface is selected automatically. No personal
IP is saved in the repository. The launcher supplies the selected host to Next's
exact development-origin allowlist and account Gym origin checks.

## Windows: install mkcert and generate certificates

Follow [mkcert's official installation instructions](https://github.com/FiloSottile/mkcert#installation).
With Chocolatey installed, run `choco install mkcert`; alternatively use Scoop
(`scoop bucket add extras`, then `scoop install mkcert`). Neither package manager
is required: download the Windows binary matching your architecture from the
[official release](https://github.com/FiloSottile/mkcert/releases), rename it
`mkcert.exe`, and store it in ignored `certificates/tools/`.

The following commands use that project-local binary, from the repository root.
For a PATH installation replace `./certificates/tools/mkcert.exe` with `mkcert`.

```powershell
# Deliberately install your local development CA into Windows trust.
& ./certificates/tools/mkcert.exe -install
# Approve the Windows certificate/UAC prompt if shown.
pnpm lan:url
# Substitute the Wi-Fi/Ethernet address printed above; do not type the brackets.
$stillformLanIp = '<listed-ip>'
New-Item -ItemType Directory -Force ./certificates | Out-Null
& ./certificates/tools/mkcert.exe -key-file ./certificates/stillform-key.pem -cert-file ./certificates/stillform.pem localhost 127.0.0.1 ::1 $stillformLanIp
$stillformCaFolder = (& ./certificates/tools/mkcert.exe -CAROOT).Trim()
Copy-Item -LiteralPath (Join-Path $stillformCaFolder 'rootCA.pem') -Destination ./certificates/rootCA.pem
pnpm dev:https --host $stillformLanIp
```

Open `https://localhost:3000/gym` on the PC, and the printed
`https://<private-ip>:3000/gym` on the phone. The phone uses the IP, not `localhost`.
The generated leaf cert/key and public CA copy are in ignored `certificates/`,
excluded from production traces. The CA private key stays in mkcert's user-specific
`-CAROOT` folder outside the repository. **Never copy/share `rootCA-key.pem` or the
leaf private key.** Transfer only `certificates/rootCA.pem` to the phone through a
trusted file-transfer method. Certificates are not served from the app's public folder.

The launcher requires existing CA-issued files, verifies validity dates, exact IP,
localhost SAN and matching private key, and fails rather than generating an untrusted
replacement. Browser trust is separate: identity checks cannot install trust on a phone.
Custom paths remain available with `--experimental-https-cert` and
`--experimental-https-key` together; `--experimental-https-ca` is optional.
Next's HTTPS flags are development-only. No TLS verification bypass is used.

If DHCP changes the IP, run `pnpm lan:url`, regenerate the leaf with the new IP and
restart with that host. The existing CA remains valid; no new phone CA installation
is needed. A router DHCP reservation can keep the address stable. Hostnames are usable
only if they resolve from the phone and are included as certificate SANs; the supported
launcher uses an actual private IPv4 to avoid relying on local hostname resolution.

## Trust the CA on the phone

A phone must explicitly trust this CA once before entering account credentials.
Do not continue through a browser certificate warning.

### Android

Copy the public `rootCA.pem` to phone storage (rename the copy `stillform-rootCA.crt`
if the picker needs a `.crt` extension; content stays unchanged). On recent Android,
open Settings > Security & privacy > More security settings > Encryption & credentials

> Install a certificate > **CA certificate**, authenticate and select the file.
> Manufacturer labels differ; use the CA-certificate option, not a Wi-Fi/client certificate.
> Check it appears under Trusted credentials/User, then reopen Chrome and visit the
> printed HTTPS IP URL. Android may display a persistent notice about a user-installed CA.
> See [Android certificate settings](https://support.google.com/pixelphone/answer/2844832).
> Managed devices may prohibit user CA installation; do not work around device policy.

### iPhone / iPad

Transfer/open the public CA certificate, then Settings > Profile Downloaded (or
General > VPN & Device Management) > Install, using the device passcode.
Next go to Settings > General > About > Certificate Trust Settings and enable full
trust for the mkcert root. Profile installation alone does not enable SSL trust.
See [Apple's manual trust instructions](https://support.apple.com/en-gb/102390).
Reopen Safari and visit the printed HTTPS IP URL without a certificate warning.

Remove this specific CA/profile from the phone when local development is no longer
needed; `mkcert -uninstall` removes desktop trust. Keep the CA key private because
possession allows issuing certificates trusted by every device where you install it.

## Account sign-in and shared history

Gym > Account Gym > sign in with the existing Stillform account, then Check / reload
account. Supabase is the durable source of truth: both devices read the same history.
Do not bootstrap or import the existing history again on the phone. Historical pages
load on demand; active drafts and pending writes retain their existing persistence.
Leaving a workout preserves it; reload and use Workout in progress to return.
Account sign-in uses a separate encrypted HttpOnly cookie, Secure on HTTPS.
Server credentials remain server-side; no `NEXT_PUBLIC` secret or browser token copy
is introduced. Use a single device at a time for edits; revision conflicts retain
pending work for explicit reconciliation.

**Supabase dashboard: no redirect URL or allowed-origin change is required for the
implemented email/password sign-in.** The server calls the password token endpoint;
there is no browser OAuth redirect. Keep existing localhost callbacks and `APP_ORIGIN`
unchanged for Polar/Strava. LAN Gym access is independent of those integrations.
If redirect-based auth is added later, register its implemented exact HTTPS callback
under Authentication > URL Configuration > Redirect URLs; do not add broad wildcards.

Browser storage is per origin: HTTPS IP, HTTPS localhost and HTTP localhost are
separate. Signing into the cloud does not delete/overwrite the original desktop
HTTP local Gym backup. Local-only Gym remains available without Supabase, but separate
browser-local stores do not merge. JSON bootstrap is a local-only empty-store fallback,
not the phone account workflow.

## Windows firewall and troubleshooting

Use a Private Windows network profile for your trusted home network. If Node prompts,
allow Private networks only. If needed, run this narrow rule in elevated PowerShell,
substituting the address printed by `pnpm lan:url`:

```powershell
$stillformLanIp = '<listed-ip>'
$stillformNodePath = (Get-Command node).Source
New-NetFirewallRule -DisplayName 'Stillform LAN development' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -LocalAddress $stillformLanIp -RemoteAddress LocalSubnet -Profile Private -Program $stillformNodePath
# Remove when no longer needed:
Remove-NetFirewallRule -DisplayName 'Stillform LAN development'
```

HTTP and HTTPS use the same TCP port/rule. No firewall or router changes are automatic.
For unreachable pages check current IP, PC sleep, same network and Wi-Fi client isolation.
For TLS warnings check device time, CA trust and SAN/IP coverage; regenerate when needed.
Do not disable the firewall or certificate verification. Supabase sign-in errors should
be checked separately from TLS/network access. Return to `pnpm dev` after stopping
HTTPS to use the original localhost integration callbacks.

## Real-history shortcuts and Hevy continuity

Recent/frequent exercises use confirmed real history since 2026-09-01 in Europe/Rome.
Ranking sums `2^(-calendar-age-days / 28)` per exposure, with pins first and deterministic
latest-date/ID ties. Unknown muscle metadata stays unassigned; routines are never inferred.
Gym shows three recent workouts and searchable full history, not the entire exercise list.
A newer Hevy export skips identical fingerprints and adds new sessions after preview and
confirmation. Edited historical sessions require duplicate review, not silent set merging.
Keep the same source timezone and saved mappings; no historical deletion/reimport is needed.
