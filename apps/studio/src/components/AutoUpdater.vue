<template>
  <div />
</template>

<script lang="ts">
import Noty from 'noty'
import Vue from 'vue'
import {
  MANUAL_REASON_COPY,
  escapeHtml,
  formatBytes,
  releaseTagUrl,
  summariseReleaseNotes,
  type ManualUpdateReason,
} from '@/lib/update/updateFormat'

interface UpdatePayload {
  version: string
  currentVersion: string
  isMajor: boolean
  releaseNotes: string
  releaseDate?: string
  downloadUrl: string
}

interface ManualUpdatePayload extends UpdatePayload {
  reason: ManualUpdateReason
}

interface DownloadProgressPayload {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

interface UpdateErrorPayload {
  message: string
  stage: 'check' | 'download' | 'install'
  downloadUrl: string
}

interface LicenseBlockPayload extends UpdatePayload {
  maxAllowedVersion?: { major: number; minor: number; patch: number }
  supportUntil?: string
}

function buildAvailableHtml(payload: UpdatePayload, manualReason?: ManualUpdateReason): string {
  const parts: string[] = []
  parts.push(
    `<div class="update-noty-title">Beekeeper Studio ${escapeHtml(payload.version)} is available.</div>`
  )
  parts.push(
    `<div class="update-noty-sub">Current version: ${escapeHtml(payload.currentVersion)}</div>`
  )
  if (payload.isMajor) {
    parts.push(
      `<div class="update-noty-major">Major update — review the changelog before installing.</div>`
    )
  }
  if (manualReason) {
    parts.push(`<div class="update-noty-reason">${escapeHtml(MANUAL_REASON_COPY[manualReason])}</div>`)
  }
  const summary = summariseReleaseNotes(payload.releaseNotes)
  if (summary) {
    parts.push(`<pre class="update-noty-notes">${escapeHtml(summary)}</pre>`)
  }
  return parts.join('')
}

export default Vue.extend({
  data() {
    return {
      activeNoty: null as Noty | null,
      /** Versions the user clicked "Not now" on this session. */
      dismissedVersions: new Set<string>(),
      /** Version currently being downloaded — used by the progress handler. */
      downloadingVersion: '' as string,
    }
  },
  mounted() {
    window.main.onUpdateEvent('update-available', (_e: unknown, payload: UpdatePayload) =>
      this.notifyUpdate(payload)
    )
    window.main.onUpdateEvent('manual-update', (_e: unknown, payload: ManualUpdatePayload) =>
      this.notifyManual(payload)
    )
    window.main.onUpdateEvent('update-downloaded', (_e: unknown, payload: UpdatePayload) =>
      this.notifyDownloaded(payload)
    )
    window.main.onUpdateEvent(
      'update-download-progress',
      (_e: unknown, payload: DownloadProgressPayload) => this.onProgress(payload)
    )
    window.main.onUpdateEvent('update-error', (_e: unknown, payload: UpdateErrorPayload) =>
      this.notifyError(payload)
    )
    window.main.onUpdateEvent('update-license-block', (_e: unknown, payload: LicenseBlockPayload) =>
      this.notifyLicenseBlock(payload)
    )
    window.main.updaterReady()
  },
  methods: {
    closeActive() {
      if (this.activeNoty) {
        this.activeNoty.close()
        this.activeNoty = null
      }
    },
    showNoty(text: string, buttons: Noty.Button[]) {
      this.closeActive()
      this.activeNoty = new Noty({
        text,
        layout: 'bottomRight',
        timeout: false,
        closeWith: [],
        buttons,
        queue: 'download',
      })
      this.activeNoty.show()
    },
    openExternal(url: string) {
      // Validated in main process by safeOpenExternal.
      window.main.openExternally(url)
    },
    dismiss(version: string) {
      if (version) this.dismissedVersions.add(version)
      this.closeActive()
    },
    notifyUpdate(payload: UpdatePayload) {
      if (!payload || this.dismissedVersions.has(payload.version)) return
      const html = buildAvailableHtml(payload)
      const notesUrl = releaseTagUrl(payload.version)
      this.showNoty(html, [
        Noty.button('Release notes', 'btn btn-flat', () =>
          this.openExternal(notesUrl)
        ),
        Noty.button('Not now', 'btn btn-flat', () => this.dismiss(payload.version)),
        Noty.button('Install update', 'btn btn-primary', () => {
          this.downloadingVersion = payload.version
          window.main.triggerDownload()
          // Replace the prompt with a downloading state immediately so
          // the user gets feedback even before the first progress event.
          this.showDownloadingNoty(payload.version, 0, 0, 0, 0)
        }),
      ])
    },
    notifyManual(payload: ManualUpdatePayload) {
      if (!payload || this.dismissedVersions.has(payload.version)) return
      const html = buildAvailableHtml(payload, payload.reason)
      const notesUrl = releaseTagUrl(payload.version)
      this.showNoty(html, [
        Noty.button('Release notes', 'btn btn-flat', () =>
          this.openExternal(notesUrl)
        ),
        Noty.button('Not now', 'btn btn-flat', () => this.dismiss(payload.version)),
        Noty.button('Download', 'btn btn-primary', () =>
          this.openExternal(payload.downloadUrl)
        ),
      ])
    },
    showDownloadingNoty(
      version: string,
      percent: number,
      transferred: number,
      total: number,
      bytesPerSecond: number
    ) {
      const pctText = `${percent.toFixed(1)}%`
      const sizeText =
        total > 0 ? ` (${formatBytes(transferred)} / ${formatBytes(total)})` : ''
      const speedText = bytesPerSecond > 0 ? ` — ${formatBytes(bytesPerSecond)}/s` : ''
      const html =
        `<div class="update-noty-title">Downloading Beekeeper Studio ${escapeHtml(version)}…</div>` +
        `<div class="update-noty-sub">${escapeHtml(pctText + sizeText + speedText)}</div>`
      this.showNoty(html, [
        Noty.button('Hide', 'btn btn-flat', () => this.closeActive()),
      ])
    },
    onProgress(payload: DownloadProgressPayload) {
      if (!this.downloadingVersion || !this.activeNoty) return
      const html =
        `<div class="update-noty-title">Downloading Beekeeper Studio ${escapeHtml(this.downloadingVersion)}…</div>` +
        `<div class="update-noty-sub">${escapeHtml(
          `${payload.percent.toFixed(1)}%` +
            (payload.total > 0
              ? ` (${formatBytes(payload.transferred)} / ${formatBytes(payload.total)})`
              : '') +
            (payload.bytesPerSecond > 0 ? ` — ${formatBytes(payload.bytesPerSecond)}/s` : '')
        )}</div>`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this.activeNoty as any).setText(html)
    },
    notifyDownloaded(payload: UpdatePayload) {
      this.downloadingVersion = ''
      const html =
        `<div class="update-noty-title">Update ready.</div>` +
        `<div class="update-noty-sub">Restart Beekeeper Studio to install ${escapeHtml(
          payload?.version ?? ''
        )}.</div>`
      this.showNoty(html, [
        Noty.button('Later', 'btn btn-flat', () => this.closeActive()),
        Noty.button('Restart now', 'btn btn-primary', () => window.main.triggerInstall()),
      ])
    },
    notifyError(payload: UpdateErrorPayload) {
      this.downloadingVersion = ''
      const html =
        `<div class="update-noty-title">Update failed.</div>` +
        `<div class="update-noty-sub">${escapeHtml(payload.message)}</div>` +
        `<div class="update-noty-sub">Download the latest version from the website.</div>`
      this.showNoty(html, [
        Noty.button('Dismiss', 'btn btn-flat', () => this.closeActive()),
        Noty.button('Download from website', 'btn btn-primary', () =>
          this.openExternal(payload.downloadUrl)
        ),
      ])
    },
    notifyLicenseBlock(payload: LicenseBlockPayload) {
      if (!payload || this.dismissedVersions.has(payload.version)) return
      const max = payload.maxAllowedVersion
      const maxText = max ? `v${max.major}.${max.minor}.x` : 'your current version'
      const html =
        `<div class="update-noty-title">Update outside your license.</div>` +
        `<div class="update-noty-sub">Covered up to ${escapeHtml(
          maxText
        )}; new release is v${escapeHtml(payload.version)}.</div>` +
        `<div class="update-noty-sub">Renew to receive updates, or download anyway from the website.</div>`
      this.showNoty(html, [
        Noty.button('Not now', 'btn btn-flat', () => this.dismiss(payload.version)),
        Noty.button('Download anyway', 'btn btn-primary', () =>
          this.openExternal(payload.downloadUrl)
        ),
      ])
    },
  },
})
</script>

<style lang="scss">
.noty_buttons {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  .btn {
    white-space: nowrap;
    flex: 0 0 auto;
    min-width: auto;
  }
}
.noty_body {
  text-align: center;
  .update-noty-title {
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .update-noty-sub {
    font-size: 0.85em;
    opacity: 0.85;
    margin-top: 0.15rem;
  }
  .update-noty-major {
    margin-top: 0.35rem;
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    background: rgba(255, 193, 7, 0.18);
    color: #ffb300;
    font-size: 0.8em;
    display: inline-block;
  }
  .update-noty-reason {
    margin-top: 0.35rem;
    font-size: 0.8em;
    opacity: 0.75;
  }
  .update-noty-notes {
    margin: 0.5rem 0 0;
    padding: 0.4rem 0.5rem;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.15);
    font-size: 0.8em;
    white-space: pre-wrap;
    max-height: 9.5em;
    overflow-y: auto;
    line-height: 1.35;
    text-align: left;
  }
}
</style>
