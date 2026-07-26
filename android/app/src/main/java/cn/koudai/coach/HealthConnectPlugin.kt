package cn.koudai.coach

import android.content.Intent
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.runBlocking
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * Health Connect 直连插件（v1.5 跑步打卡/睡眠同步）
 * 读取：运动记录（距离/时长/热量）+ 睡眠记录。
 * 网页端永远触达不到这里（TS 侧 lib/health.ts 有 isNative 守卫）。
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {

    private val perms = setOf(
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
    )

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val status = HealthConnectClient.getSdkStatus(context)
        val ret = JSObject()
        ret.put("available", status == HealthConnectClient.SDK_AVAILABLE)
        call.resolve(ret)
    }

    @PluginMethod
    fun requestPermissions(call: PluginCall) {
        val status = HealthConnectClient.getSdkStatus(context)
        if (status != HealthConnectClient.SDK_AVAILABLE) {
            val ret = JSObject()
            ret.put("granted", false)
            ret.put("reason", "health-connect-not-available")
            call.resolve(ret)
            return
        }
        val client = HealthConnectClient.getOrCreate(context)
        runBlocking {
            val granted = client.permissionController.getGrantedPermissions()
            if (granted.containsAll(perms)) {
                val ret = JSObject()
                ret.put("granted", true)
                call.resolve(ret)
                return@runBlocking
            }
            val contract = PermissionController.createRequestPermissionResultContract()
            val intent: Intent = contract.createIntent(context, perms)
            startActivityForResult(call, intent, "onPermsResult")
        }
    }

    @ActivityCallback
    private fun onPermsResult(call: PluginCall, result: com.getcapacitor.JSObject?) {
        // 结果以实际授予状态为准（回调载荷不可靠）
        val client = HealthConnectClient.getOrCreate(context)
        runBlocking {
            val granted = client.permissionController.getGrantedPermissions()
            val ret = JSObject()
            ret.put("granted", granted.containsAll(perms))
            call.resolve(ret)
        }
    }

    @PluginMethod
    fun hasPermissions(call: PluginCall) {
        val client = HealthConnectClient.getOrCreate(context)
        runBlocking {
            val granted = client.permissionController.getGrantedPermissions()
            val ret = JSObject()
            ret.put("granted", granted.containsAll(perms))
            call.resolve(ret)
        }
    }

    /** 读取最近 days 天的运动记录（默认 1 = 今天） */
    @PluginMethod
    fun readExercise(call: PluginCall) {
        val days = call.getInt("days") ?: 1
        val zone = ZoneId.systemDefault()
        val start = LocalDate.now(zone).minusDays((days - 1).toLong()).atStartOfDay(zone).toInstant()
        val end = Instant.now()
        val client = HealthConnectClient.getOrCreate(context)
        runBlocking {
            try {
                val sessions = client.readRecords(
                    ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.between(start, end))
                ).records
                val arr = JSArray()
                for (s in sessions) {
                    val sStart = s.startTime
                    val sEnd = s.endTime
                    val minutes = (java.time.Duration.between(sStart, sEnd).seconds / 60).toInt()
                    var kcal = 0.0
                    var distM = 0.0
                    try {
                        client.readRecords(
                            ReadRecordsRequest(TotalCaloriesBurnedRecord::class, TimeRangeFilter.between(sStart, sEnd))
                        ).records.forEach { kcal += it.energy.inKilocalories }
                    } catch (_: Exception) { /* 热量记录不是每个 App 都写 */ }
                    try {
                        client.readRecords(
                            ReadRecordsRequest(DistanceRecord::class, TimeRangeFilter.between(sStart, sEnd))
                        ).records.forEach { distM += it.distance.inMeters }
                    } catch (_: Exception) { /* 同上 */ }
                    val o = JSObject()
                    o.put("title", s.title ?: s.exerciseType.toString())
                    o.put("exerciseType", s.exerciseType.toString())
                    o.put("startMillis", sStart.toEpochMilli())
                    o.put("minutes", minutes)
                    o.put("kcal", Math.round(kcal))
                    o.put("distanceKm", Math.round(distM / 10.0) / 100.0)
                    arr.put(o)
                }
                val ret = JSObject()
                ret.put("sessions", arr)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("read exercise failed: ${e.message}")
            }
        }
    }

    /** 读取最近一次睡眠（36 小时内最后一段） */
    @PluginMethod
    fun readLastSleep(call: PluginCall) {
        val zone = ZoneId.systemDefault()
        val end = Instant.now()
        val start = ZonedDateTime.ofInstant(end, zone).minusHours(36).toInstant()
        val client = HealthConnectClient.getOrCreate(context)
        runBlocking {
            try {
                val sessions = client.readRecords(
                    ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(start, end))
                ).records
                val last = sessions.maxByOrNull { it.endTime }
                val ret = JSObject()
                if (last != null) {
                    val minutes = (java.time.Duration.between(last.startTime, last.endTime).seconds / 60).toInt()
                    ret.put("found", true)
                    ret.put("minutes", minutes)
                    ret.put("hours", Math.round(minutes / 6.0) / 10.0)
                    ret.put("endMillis", last.endTime.toEpochMilli())
                    ret.put("startMillis", last.startTime.toEpochMilli())
                } else {
                    ret.put("found", false)
                }
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("read sleep failed: ${e.message}")
            }
        }
    }
}
