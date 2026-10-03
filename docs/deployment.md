# Google Cloud deployment

- Repository: `faresd/pixelforge-photo-editor`
- Google account: `cheaply.fr@gmail.com`
- Dedicated Google Cloud / Firebase project: `photoeditor-cheaply` (`893177923518`)
- Hosting site: `photoeditor-cheaply`
- Origin: `https://photoeditor-cheaply.web.app`
- Custom domain: `https://photoeditor.cheaply.fr`
- DNS: Cloudflare, `cheaply.fr` zone

Image editing runs client-side and Firebase Hosting serves the Vite build over HTTPS. Optional shared-session authentication and cloud project storage are provided by the existing Cheaply Marketplace backend; no account is required for editing. This migration uses the existing GitHub editor, including its menu fixes; the older Sites publication is a separate deployment.

## CI/CD

`.github/workflows/ci-cd.yml` checks pull requests and pushes to `main`. Validation includes lint, TypeScript, a production build, release-artifact checks, and Playwright desktop/mobile workflows. Failed checks prevent the deployment job. Browser failure traces are retained for seven days; build artifacts for fourteen days.

Only `main` can deploy. Production deploys are serialized. The deploy job downloads the already-tested artifact and authenticates through Google Workload Identity Federation. No long-lived Google service-account key is stored in GitHub.

The provider permits repository ID `1357642782`, owner ID `1819120`, `refs/heads/main`, and this repository's `ci-cd.yml` workflow. The dedicated service account is `github-photoeditor-deploy@photoeditor-cheaply.iam.gserviceaccount.com`, with Firebase Hosting administration and Service Usage Consumer permissions in this dedicated project.

After publication, both the Google origin and custom domain must return the expected Git commit from `/release.json` and `/api/readyz.json`. An HTTP 200 alone is not a successful deployment check. TLS errors or revision mismatches fail the workflow.

## Routine release

1. Open a pull request and wait for `Validate editor`.
2. Merge it to `main`.
3. Wait for `Deploy production`, including both live URL checks.
4. Confirm the commit at `/release.json` if investigating a cache or release issue.

The Actions `Run workflow` control can redeploy the current `main` revision. It runs all checks again.

## Rollback

For a normal rollback, revert the faulty change through a pull request. The reverted build follows the same checks and deployment path. For an urgent hosting-only rollback, choose a previously verified release in Firebase Hosting's release history, then reconcile `main` with a revert before another deployment. Do not use an old artifact without checking its embedded commit and compatibility.

## DNS and certificates

Use the exact DNS records returned by Firebase's custom-domain setup. Keep ownership verification records in place. Use DNS-only records while Firebase validates the domain and issues its certificate. Do not modify the zone apex or unrelated application records. Firebase's domain state and a successful HTTPS request are the completion checks.

## Troubleshooting

- Authentication denial: inspect the numeric repository/owner claims, branch and workflow name against the provider condition. Do not broaden the provider to all repositories to bypass an error.
- Deploy authorization: verify the dedicated account's project roles and the WIF service-account binding.
- Origin succeeds but custom domain fails: inspect Cloudflare DNS, Firebase domain/certificate state and DNS propagation.
- Build succeeds but browser tests fail: inspect the attached Playwright trace; fix the editor before deploying.
- Verification finds the wrong commit: check the target project/site and cached release metadata. Only hashed assets are cached immutably.

The editor build uses static hosting. Optional project storage runs through Marketplace in project blissful-scout-290322, using a separate private EU bucket blissful-scout-290322-pixelforge-projects. The existing Marketplace session cookie remains host-only and HttpOnly; the project API accepts only the exact photoeditor.cheaply.fr origin. Local photos upload only after an explicit save action. Cloud saves are version-checked and limited to 16 MB per document, 30 projects and 256 MB per library. Deleted cloud objects have a seven-day provider recovery period. Firebase usage quotas still apply; monitor the project's usage before scaling traffic or adding paid processing.

## Editor release status

The editor top bar displays the package version from `/release.json` and a compact server state derived from `/api/readyz.json`. The indicator is **Server online** only when both artifacts are valid, identify `pixelforge-photo-editor`, and report the same commit and version with `ready: true`. A readiness failure or commit mismatch is shown as **Server degraded**; an unavailable or malformed artifact falls back to **Offline · local editing** so anonymous editing remains usable. Both requests are no-store reads, time out after five seconds and are polled every 30 seconds. The service worker bypasses these paths so cached shell metadata cannot report an offline server as healthy. The baked app version remains visible when a probe fails; mobile shows the state text as well as the coloured dot. The status has an accessible live label containing the version and current state.
