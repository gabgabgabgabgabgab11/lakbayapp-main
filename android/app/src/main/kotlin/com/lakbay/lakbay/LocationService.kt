package com.lakbay.lakbay
/**
 * LocationService.kt
 *
 * Foreground service that requests continuous location updates and POSTs to your API.
 * Reads token/driverId/apiBase from EncryptedSharedPreferences (fallback to plain prefs).
 * Uses PendingIntent delivery (BroadcastReceiver) for robust background delivery and also
 * keeps an in-process LocationCallback as a fallback when app is foregrounded.
 *
 * Place at:
 *   android/app/src/main/kotlin/com/lakbay/lakbay/LocationService.kt
 *
 * Make sure to add these dependencies to android/app/build.gradle:
 *   implementation 'com.google.android.gms:play-services-location:21.0.1'
 *   implementation 'com.squareup.okhttp3:okhttp:4.11.0'
 *   implementation "androidx.security:security-crypto:1.0.0"
 *
 * Manifest requirements (see manifest diff below):
 *   - android:foregroundServiceType="location" on the service entry
 *   - add uses-permission for ACCESS_FINE_LOCATION, ACCESS_BACKGROUND_LOCATION, FOREGROUND_SERVICE, WAKE_LOCK
 *   - register LocationBroadcastReceiver
 */

import android.app.*
import android.content.Context
import android.content.Intent
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class LocationService : Service() {

  companion object {
    private const val TAG = "LocationService"
    private const val CHANNEL_ID = "lakbay_location_channel"
    private const val NOTIF_ID = 4455
    private const val PREFS = "lakbay_prefs"
    private const val KEY_TOKEN = "driverToken"
    private const val KEY_DRIVER_ID = "driverId"
    private const val KEY_API_BASE = "apiBase"

    // Default only used if nothing is stored via plugin.setApiBase()
    private const val DEFAULT_API_BASE = " https://hastily-quantal-giovani.ngrok-free.dev"

    private const val EXTRA_LAT = "extra_lat"
    private const val EXTRA_LNG = "extra_lng"
    private const val EXTRA_TIMESTAMP = "extra_timestamp"
  }

  private lateinit var fusedClient: FusedLocationProviderClient
  private lateinit var locationRequest: LocationRequest
  private var locationCallback: LocationCallback? = null
  private val http = OkHttpClient.Builder()
    .connectTimeout(10, TimeUnit.SECONDS)
    .readTimeout(10, TimeUnit.SECONDS)
    .build()

  private var wakeLock: PowerManager.WakeLock? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    fusedClient = LocationServices.getFusedLocationProviderClient(this)

    // Acquire a partial wake lock to help keep CPU on while we handle uploads (use sparingly)
    try {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "${packageName}:location_wakelock")
      wakeLock?.acquire(10 * 60 * 1000L) // 10 minutes
    } catch (e: Exception) {
      Log.w(TAG, "WakeLock acquire failed: ${e.message}")
    }

    locationRequest = LocationRequest.create().apply {
      interval = 5000L
      fastestInterval = 2000L
      priority = Priority.PRIORITY_HIGH_ACCURACY
      smallestDisplacement = 5f
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForeground(NOTIF_ID, buildNotification("Starting location tracking..."))

    // If intent carries a location from BroadcastReceiver, post it immediately
    intent?.let {
      if (it.hasExtra(EXTRA_LAT) && it.hasExtra(EXTRA_LNG)) {
        val lat = it.getDoubleExtra(EXTRA_LAT, Double.NaN)
        val lng = it.getDoubleExtra(EXTRA_LNG, Double.NaN)
        val ts = it.getLongExtra(EXTRA_TIMESTAMP, System.currentTimeMillis())
        if (!lat.isNaN() && !lng.isNaN()) {
          val loc = Location("broadcast").apply {
            latitude = lat
            longitude = lng
            time = ts
          }
          postLocationToServer(loc)
        }
      }
    }

    startLocationUpdates()
    return START_STICKY
  }

  override fun onDestroy() {
    stopLocationUpdates()
    try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (e: Exception) { Log.w(TAG, "WakeLock release failed", e) }
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
      this, 0, Intent(this, MainActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_SINGLE_TOP },
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

  private fun getEncryptedPrefs(): android.content.SharedPreferences {
    return try {
      val masterKey = MasterKey.Builder(applicationContext).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
      EncryptedSharedPreferences.create(
        applicationContext, PREFS, masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
      )
    } catch (e: Exception) {
      Log.w(TAG, "EncryptedSharedPreferences init failed, falling back to regular prefs", e)
      getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    }
  }

  private fun getApiBase(): String {
    val prefs = getEncryptedPrefs()
    return prefs.getString(KEY_API_BASE, DEFAULT_API_BASE) ?: DEFAULT_API_BASE
  }

  private fun postLocationToServer(location: Location) {
    val prefs = getEncryptedPrefs()
    val token = prefs.getString(KEY_TOKEN, null)
    val driverId = prefs.getString(KEY_DRIVER_ID, null)
    if (token.isNullOrEmpty() || driverId.isNullOrEmpty()) {
      Log.w(TAG, "No token/driverId in prefs; skipping post")
      return
    }

    val apiBase = getApiBase().trimEnd('/')
    val url = "$apiBase/api/jeepney-location"

    val json = JSONObject().apply {
      put("driverId", driverId.toIntOrNull() ?: driverId)
      put("lat", location.latitude)
      put("lng", location.longitude)
      put("timestamp", location.time)
    }

    val body = json.toString().toRequestBody("application/json; charset=utf-8".toMediaTypeOrNull())
    val req = Request.Builder()
      .url(url)
      .post(body)
      .addHeader("Authorization", "Bearer $token")
      .addHeader("Content-Type", "application/json")
      .build()

    http.newCall(req).enqueue(object : okhttp3.Callback {
      override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
        Log.w(TAG, "Post location failed: ${e.message}")
      }
      override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
        response.use {
          if (!it.isSuccessful) Log.w(TAG, "Post location http ${it.code}: ${it.message}")
        }
      }
    })
  }

  private fun startLocationUpdates() {
    // Build PendingIntent to deliver location updates to BroadcastReceiver
    val intent = Intent(this, LocationBroadcastReceiver::class.java)
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT else PendingIntent.FLAG_UPDATE_CURRENT
    val pendingIntent = PendingIntent.getBroadcast(this, 0, intent, flags)

    try {
      fusedClient.requestLocationUpdates(locationRequest, pendingIntent)
    } catch (se: SecurityException) {
      Log.e(TAG, "Missing location permission (PendingIntent request)", se)
      stopSelf()
      return
    } catch (e: Exception) {
      Log.w(TAG, "requestLocationUpdates(PendingIntent) failed: ${e.message}")
    }

    // Optional in-process callback as a fallback for foreground
    locationCallback = object : LocationCallback() {
      private var lastPostAt = 0L
      private val throttleMs = 2000L
      override fun onLocationResult(result: LocationResult) {
        val loc = result.lastLocation ?: return
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
      Log.e(TAG, "Missing location permission (callback request)", se)
    } catch (e: Exception) {
      Log.w(TAG, "requestLocationUpdates(callback) failed: ${e.message}")
    }
  }

  private fun stopLocationUpdates() {
    try {
      locationCallback?.let { fusedClient.removeLocationUpdates(it) }
      locationCallback = null

      val intent = Intent(this, LocationBroadcastReceiver::class.java)
      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT else PendingIntent.FLAG_UPDATE_CURRENT
      val pendingIntent = PendingIntent.getBroadcast(this, 0, intent, flags)
      fusedClient.removeLocationUpdates(pendingIntent)
    } catch (e: Exception) {
      Log.w(TAG, "stopLocationUpdates failed", e)
    }
  }

  private fun updateNotification(text: String) {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(NOTIF_ID, buildNotification(text))
  }
}