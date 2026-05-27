import { ipcMain } from 'electron'
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater'
import { getActiveWindows } from './WindowBuilder'
import rawlog from '@bksLogger'

const log = rawlog.scope('update-manager')

import platformInfo from '../common/platform_info'
import BksConfig from '@/common/bksConfig'
import { evaluateUpdateLicenseGate } from './updateLicenseGate'
import {
  DOWNLOAD_PAGE_URL,
  buildBasePayload,
  getManualUpdateReason,
  sanitizeErrorMessage,
} from './updateHelpers'

autoUpdater.autoDownload = false
autoUpdater.logger = log

function broadcast(channel: string, payload?: unknown): void {
  getActiveWindows().forEach(beeWin => beeWin.send(channel, payload))
}

function basePayload(info: UpdateInfo) {
  return buildBasePayload(
    info,
    platformInfo.appVersion,
    platformInfo.parsedAppVersion.major
  )
}

// HACK(mc, 2019-09-10): work around https://github.com/electron-userland/electron-builder/issues/4046
function dealWithAppImage() {
  if (platformInfo.isAppImage) {
    // remap temporary running AppImage to actual source
    // THIS IS PROBABLY SUPER BRITTLE AND MAKES ME WANT TO STOP USING APPIMAGE
    // eslint-disable-next-line
    // @ts-ignore
    autoUpdater.logger?.info('rewriting $APPIMAGE', {
      oldValue: process.env.APPIMAGE,
      newValue: process.env.ARGV0,
    })
    process.env.APPIMAGE = process.env.ARGV0
  } else {
    autoUpdater.logger?.info('Not running in AppImageLauncher')
  }
}

function checkForUpdates() {
  log.info('checking for updates right now')
  try {
    autoUpdater.checkForUpdates()
  } catch (error) {
    log.error(`Could not check for updates: ${error.message}`)
    broadcast('update-error', {
      message: sanitizeErrorMessage(error),
      stage: 'check',
      downloadUrl: DOWNLOAD_PAGE_URL,
    })
  }
}

export function setAllowBeta(allowBeta: boolean) {
  autoUpdater.allowPrerelease = allowBeta;
  autoUpdater.channel = allowBeta ? 'beta' : 'latest';
}

export function manageUpdates(allowBeta: boolean, debug?: boolean): void {

  if (platformInfo.environment === 'development') {
    log.info("not doing any updates in development")
    return
  }

  if (BksConfig.general.checkForUpdatesDisabled) {
    log.info("automatic update checks are disabled")
    return
  }

  // electron-updater errors on non-AppImage Linux (deb/rpm) and Snap
  // installs are managed by the Snap Store. Skip entirely to avoid
  // surfacing irrelevant errors to the user. Portable Windows builds
  // are kept enabled: the updater can still detect new versions, we just
  // convert every "update-available" into a "manual-update" prompt.
  if (platformInfo.isSnap || (platformInfo.isLinux && !platformInfo.isAppImage)) {
    log.info('skipping auto-updater for this Linux package format')
    return
  }

  setAllowBeta(allowBeta);

  dealWithAppImage();

  autoUpdater.logger?.debug?.(JSON.stringify(process.env))

  ipcMain.on('updater-ready', () => {
    checkForUpdates()
    if (debug) {
      // Synthetic event for local testing of the renderer UI.
      const fakeInfo: UpdateInfo = {
        version: `${platformInfo.parsedAppVersion.major + 1}.0.0`,
        files: [],
        path: '',
        sha512: '',
        releaseDate: new Date().toISOString(),
        releaseNotes: '## Headline Features\n\n- Fake debug release for UI testing',
      } as UpdateInfo
      handleUpdateAvailable(fakeInfo)
    }
  })

  async function handleUpdateAvailable(info: UpdateInfo) {
    const base = basePayload(info)
    const gate = await evaluateUpdateLicenseGate({ version: info.version })

    if (!gate.allowed) {
      broadcast('update-license-block', {
        ...base,
        maxAllowedVersion: gate.maxAllowedVersion,
        supportUntil: gate.supportUntil,
      })
      return
    }

    const manualReason = getManualUpdateReason(platformInfo)
    if (manualReason) {
      broadcast('manual-update', { ...base, reason: manualReason })
      return
    }

    broadcast('update-available', base)
  }

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    handleUpdateAvailable(info).catch((err) => {
      log.error('Failed to handle update-available', err)
    })
  })

  autoUpdater.on('error', (err) => {
    log.error('autoUpdater error', err)
    broadcast('update-error', {
      message: sanitizeErrorMessage(err),
      stage: 'download',
      downloadUrl: DOWNLOAD_PAGE_URL,
    })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    broadcast('update-download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    })
  })

  ipcMain.on('download-update', () => {
    // Skip if the current build can't actually install the update — the
    // renderer should already be showing the manual-download prompt.
    if (getManualUpdateReason(platformInfo)) {
      log.info('download-update ignored: manual update required')
      return
    }
    autoUpdater.downloadUpdate().catch((err) => {
      log.error('downloadUpdate failed', err)
      broadcast('update-error', {
        message: sanitizeErrorMessage(err),
        stage: 'download',
        downloadUrl: DOWNLOAD_PAGE_URL,
      })
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    broadcast('update-downloaded', basePayload(info))
  })

  ipcMain.on('install-update', () => {
    try {
      autoUpdater.quitAndInstall()
    } catch (err) {
      log.error('quitAndInstall failed', err)
      broadcast('update-error', {
        message: sanitizeErrorMessage(err),
        stage: 'install',
        downloadUrl: DOWNLOAD_PAGE_URL,
      })
    }
  })

  setInterval(() => {
    checkForUpdates()
  }, BksConfig.general.checkForUpdatesInterval)
}
