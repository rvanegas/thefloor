package expo.modules.callservice

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Starting and stopping the foreground service, from JavaScript.
 *
 * **Both functions answer with a boolean and neither throws**, which is the
 * same contract `modules/audio-route` keeps and for the same reason: this sits
 * on the path that carries live audio, and a failure to show a notification
 * must not be able to take a call down. The one thing that genuinely fails
 * here is the start, and it fails for a reason nothing on the JavaScript side
 * can fix — see below.
 */
class CallServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallService")

    /**
     * **`startForegroundService` is refused from the background, from Android
     * 12 onwards, and that is the interesting failure.** The system permits it
     * only while the app is already foregrounded, which is fine for the case
     * this exists for — somebody opens a channel and then leaves the app — and
     * is exactly wrong for the case Android has no answer to: being *pulled*
     * into a channel by a notification while the app is not running. That is
     * `ForegroundServiceStartNotAllowedException`, and the honest response to
     * it is `false` rather than a crash.
     *
     * The type check on Android 14 fails in a way that *looks* the same and is
     * not, which is what this catch was wrongly trusted for until 2026-09-10.
     * `startForegroundService` only queues the service and returns; the
     * `RECORD_AUDIO` check happens later, inside the service's own
     * `startForeground`, so the `SecurityException` is raised on a stack this
     * `try` is no longer on. It was an uncaught crash for a week — every
     * Android 14 user, on their first channel, before they had been asked for
     * the microphone. `CallService.onStartCommand` now catches it where it is
     * actually thrown, and the guard below means it should not be thrown here
     * at all.
     *
     * **The guard is not redundant with that catch.** Catching it means not
     * crashing; declining to start means not leaving a started service to be
     * stopped, and not asking Android for something it has already said no to.
     * A channel entered without the microphone is a channel that works on
     * screen, which is what `false` has always meant here.
     */
    AsyncFunction("startCallService") { title: String, body: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      // Android 14 refuses a `microphone` service without this and says so by
      // throwing; asking first turns that into an answer. Checked on every
      // start rather than remembered, since a permission can be revoked from
      // Settings while the app is alive.
      if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
        context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
          PackageManager.PERMISSION_GRANTED
      ) {
        return@AsyncFunction false
      }
      return@AsyncFunction try {
        CallService.ensureChannel(context)
        val intent = Intent(context, CallService::class.java).apply {
          putExtra(CallService.EXTRA_TITLE, title)
          putExtra(CallService.EXTRA_BODY, body)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        true
      } catch (error: Exception) {
        false
      }
    }

    /**
     * Idempotent, and called on every teardown whether or not the start took.
     * Stopping a service that is not running is not an error on Android, which
     * is what lets the JavaScript side keep no state about whether it is up.
     */
    AsyncFunction("stopCallService") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      return@AsyncFunction try {
        context.stopService(Intent(context, CallService::class.java))
        true
      } catch (error: Exception) {
        false
      }
    }
  }
}
