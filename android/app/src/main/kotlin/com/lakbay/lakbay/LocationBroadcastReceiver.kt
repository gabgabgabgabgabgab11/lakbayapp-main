package com.lakbay.lakbay
/**
 * LocationBroadcastReceiver.kt
 *
 * Receives location updates delivered by FusedLocationProvider via a PendingIntent,
 * then starts the LocationService with the location extras so the service can upload.
 *
 * Place at:
 *   android/app/src/main/kotlin/com/lakbay/lakbay/LocationBroadcastReceiver.kt
 */

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationResult

class LocationBroadcastReceiver : BroadcastReceiver() {
  companion object { private const val TAG = "LocationBroadcastReceiver" }

  override fun onReceive(context: Context?, intent: Intent?) {
    if (context == null || intent == null) return
    try {
      val locationResult = LocationResult.extractResult(intent) ?: run {
        Log.d(TAG, "No LocationResult in intent"); return
      }
      val loc = locationResult.lastLocation ?: run { Log.d(TAG, "No lastLocation"); return }
      Log.d(TAG, "Received location via PendingIntent: ${loc.latitude}, ${loc.longitude}")

      val svcIntent = Intent(context, LocationService::class.java).apply {
        putExtra("extra_lat", loc.latitude)
        putExtra("extra_lng", loc.longitude)
        putExtra("extra_timestamp", loc.time)
      }

      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ContextCompat.startForegroundService(context, svcIntent)
        else context.startService(svcIntent)
      } catch (e: Exception) {
        Log.w(TAG, "Failed to start LocationService from BroadcastReceiver: ${e.message}")
      }
    } catch (e: Exception) {
      Log.w(TAG, "onReceive exception", e)
    }
  }
}