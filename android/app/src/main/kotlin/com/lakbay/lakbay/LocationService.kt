package com.lakbay.lakbay

import android.app.*
import android.content.Context
import android.content.Intent
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class LocationService : Service() {
  companion object {
    private const val TAG = "LocationService"
    private const val CHANNEL_ID = "lakbay_location_channel"
    private const val NOTIF_ID = 4455
    private const val PREFS = "lakbay_prefs"
    private const val KEY_TOKEN = "driverToken"
    private const val KEY_DRIVER_ID = "driverId"

    // TODO: set this to your backend while testing or make configurable
    private const val API_BASE = "https://your-server.example.com"
  }

  private lateinit var fusedClient: FusedLocationProviderClient
  private lateinit var locationRequest: LocationRequest
  private var locationCallback: LocationCallback? = null
  private val http = OkHttpClient.Builder()
    .connectTimeout(10, TimeUnit.SECONDS)
    .readTimeout(10, TimeUnit.SECONDS)
    .build()

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    fusedClient = LocationServices.getFusedLocationProviderClient(this)
    locationRequest = LocationRequest.create().apply {
      interval = 5000L
      fastestInterval = 2000L
      priority = Priority.PRIORITY_HIGH_ACCURACY
      smallestDisplacement = 5f
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForeground(NOTIF_ID, buildNotification("Starting location tracking..."))
    startLocationUpdates()
    return START_STICKY
  }

  override fun onDestroy() {
    stopLocationUpdates()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val chan = NotificationChannel(CHANNEL_ID, "Lakbay Location", NotificationManager.IMPORTANCE_LOW)
      chan.description = "Shows when driver location tracking is active"
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(chan)
    }
  }

  private fun buildNotification(text: String): Notification {
    val pendingIntent = PendingIntent.getActivity(
      this, 0, Intent(this, MainActivity::class.java),
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Lakbay — Driving")
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentIntent(pendingIntent)
      .setOngoing(true)
      .build()
  }

  private fun startLocationUpdates() {
    if (locationCallback != null) return

    locationCallback = object : LocationCallback() {
      private var lastPostAt = 0L
      private val throttleMs = 2000L

      override fun onLocationResult(result: LocationResult) {
        val loc = result.lastLocation ?: return
        Log.d(TAG, "Location: ${loc.latitude}, ${loc.longitude}")
        val now = System.currentTimeMillis()
        if (now - lastPostAt >= throttleMs) {
          lastPostAt = now
          updateNotification("Driving: ${"%.5f".format(loc.latitude)}, ${"%.5f".format(loc.longitude)}")
          postLocationToServer(loc)
        }
      }
    }

    try {
      fusedClient.requestLocationUpdates(locationRequest, locationCallback!!, mainLooper)
    } catch (se: SecurityException) {
      Log.e(TAG, "Missing location permission", se)
      stopSelf()
    }
  }

  private fun stopLocationUpdates() {
    locationCallback?.let { fusedClient.removeLocationUpdates(it) }
    locationCallback = null
  }

  private fun updateNotification(text: String) {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(NOTIF_ID, buildNotification(text))
  }

  private fun postLocationToServer(location: Location) {
    val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val token = prefs.getString(KEY_TOKEN, null)
    val driverId = prefs.getString(KEY_DRIVER_ID, null)
    if (token.isNullOrEmpty() || driverId.isNullOrEmpty()) {
      Log.w(TAG, "No auth token/driverId in prefs; skipping post")
      return
    }

    val url = API_BASE.trimEnd('/') + "/api/jeepney-location"
    val json = JSONObject().apply {
      put("driverId", driverId.toIntOrNull() ?: driverId)
      put("lat", location.latitude)
      put("lng", location.longitude)
      put("timestamp", location.time)
    }

    val body = RequestBody.create("application/json; charset=utf-8".toMediaTypeOrNull(), json.toString())
    val req = Request.Builder()
      .url(url)
      .post(body)
      .addHeader("Authorization", "Bearer $token")
      .addHeader("Content-Type", "application/json")
      .build()

    http.newCall(req).enqueue(object : okhttp3.Callback {
      override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
        Log.w(TAG, "Post location failed", e)
      }
      override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
        response.use {
          if (!it.isSuccessful) Log.w(TAG, "Post location http ${it.code}: ${it.message}")
        }
      }
    })
  }
}