package expo.modules.callservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * The foreground service that lets a channel survive the app being backgrounded.
 *
 * **This is Android's whole answer to `UIBackgroundModes: ["audio"]`, and it is
 * not a smaller one.** On iOS the background mode is a line in `Info.plist` and
 * the system does the rest. Android will kill a process that is capturing audio
 * with no visible foreground component, so keeping a call alive means running a
 * service, typed `microphone`, with a notification the user can see for as long
 * as the channel is open. That notification is not decoration and cannot be
 * suppressed — it is the thing that buys the process its life.
 *
 * Confirmed on hardware on 2026-09-01, before this existed: an Android call
 * dies when the app is backgrounded. See planning/ANDROID.md.
 *
 * Three things about the shape of this that are not guessable from the code:
 *
 * - **`START_NOT_STICKY`.** A sticky service is restarted by the system after
 *   the process dies, with a null intent and no room, no token and no channel
 *   behind it — a notification saying a call is running when nothing is. This
 *   service exists only for as long as JavaScript says so.
 * - **The type is stated twice**, here and in the manifest, and Android 14
 *   rejects the start unless they agree.
 * - **`startForeground` is caught here, and it is the only place it can be.**
 *   The module's `try` wraps `startForegroundService`, which merely *queues*
 *   this service and returns; the permission check Android 14 does happens
 *   later, inside `startForeground` below, on the main thread of this process.
 *   An exception there is therefore invisible to that catch and is a crash.
 *   That is not hypothetical — it took the app down on every entry to a
 *   channel, for every Android 14 user who had not yet granted `RECORD_AUDIO`,
 *   from 2026-09-03 until this was written. See planning/ANDROID.md.
 * - **`stopSelf` on that path, and only that path.** A service that could not
 *   go foreground is a started service with no notification, which Android
 *   will kill on its own schedule and complain about first; stopping it is
 *   tidying up something that never began. The audio does not go down with it
 *   — the channel works on screen either way, which is the whole reason a
 *   failure here is reported rather than raised.
 */
class CallService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: DEFAULT_TITLE
    val body = intent?.getStringExtra(EXTRA_BODY) ?: DEFAULT_BODY

    ensureChannel(this)
    val notification = build(title, body)

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        )
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (error: Exception) {
      // `SecurityException` when `RECORD_AUDIO` is not granted and
      // `ForegroundServiceStartNotAllowedException` when the process was
      // backgrounded between the module's call and this one — but caught as
      // `Exception`, on the same reasoning the module states: this is a list of
      // classes that grows with the API level, and every entry on it means the
      // same thing here. There is nothing to do beyond not dying.
      stopSelf()
    }

    return START_NOT_STICKY
  }

  /**
   * The notification, which is the user-visible half of the bargain.
   *
   * `setOngoing` so it cannot be swiped away while the channel is open —
   * dismissing it would not stop the service, only hide why the microphone is
   * on. The tap target is the app's own launcher intent rather than a deep
   * link: this app has exactly one deep link and it belongs to a notification
   * that does not exist yet (see planning/ANDROID.md, push), and a launcher
   * intent returns to whatever screen was left, which for somebody who
   * backgrounded a live channel is the channel.
   *
   * The small icon is a system drawable on purpose. A notification's small icon
   * is drawn as a silhouette, and this app's launcher icon is a full-colour
   * adaptive one — handing that over produces a white blob. `ic_btn_speak_now`
   * is a microphone and is the truthful glyph for what the service is doing.
   */
  private fun build(title: String, body: String): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pending = launch?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    return builder
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setOngoing(true)
      .setContentIntent(pending)
      .build()
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"

    private const val DEFAULT_TITLE = "In a channel"
    private const val DEFAULT_BODY = "The Floor is open."

    private const val CHANNEL_ID = "channel-open"
    private const val NOTIFICATION_ID = 1

    /**
     * Android 8 and up will drop a notification onto the floor, silently and
     * with no error anywhere, if its channel does not exist. Creating one that
     * is already there is a no-op, so this is asserted at every start rather
     * than once somewhere at boot.
     *
     * `IMPORTANCE_LOW` is deliberate: no sound and no heads-up banner. A
     * notification that pings every time somebody opens a channel is one they
     * turn off, and turning it off is not free here — a foreground service
     * whose notification the user has silenced still runs, but the app has
     * spent the goodwill for nothing.
     */
    fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(NotificationManager::class.java) ?: return
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Open channels",
        NotificationManager.IMPORTANCE_LOW
      )
      channel.description = "Shown while you are in a channel, so the audio keeps running."
      channel.setShowBadge(false)
      manager.createNotificationChannel(channel)
    }
  }
}
