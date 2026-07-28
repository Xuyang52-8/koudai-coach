package cn.koudai.coach

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * 口袋私教桌面小组件（2×4）：今日热量差 + 训练状态 + 连续天数。
 * 数据桥：Web 侧通过 Capacitor Preferences 把 JSON 写进 SharedPreferences("CapacitorStorage").widgetData，
 * 这里读出来渲染。主题跟随 App 设置（dark/light/parchment）。
 */
class KoudaiWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { updateOne(context, manager, it) }
    }

    companion object {
        private const val PREFS = "CapacitorStorage"
        private const val KEY = "widgetData"

        /** 主题调色板：bg / textPrimary / textSecondary / accent / warn */
        private val THEMES = mapOf(
            "dark" to intArrayOf(0xFF0A0A0B.toInt(), 0xFFF5F5F4.toInt(), 0xFFA8A29E.toInt(), 0xFF3FE1B1.toInt(), 0xFFF2B23E.toInt()),
            "light" to intArrayOf(0xFFFAFAF8.toInt(), 0xFF1C1917.toInt(), 0xFF78716C.toInt(), 0xFF0A9C73.toInt(), 0xFFB45309.toInt()),
            "parchment" to intArrayOf(0xFFF2EAD8.toInt(), 0xFF2A241A.toInt(), 0xFF6B5F49.toInt(), 0xFF0A9C73.toInt(), 0xFF8F5E00.toInt()),
        )

        fun refresh(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, KoudaiWidgetProvider::class.java))
            if (ids.isNotEmpty()) {
                KoudaiWidgetProvider().onUpdate(context, manager, ids)
            }
        }

        private fun updateOne(context: Context, manager: AppWidgetManager, id: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_koudai)

            // 读 Web 侧写入的数据（Capacitor Preferences 的存储文件）
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val raw = prefs.getString(KEY, null)
            var deficit = "--"
            var burn = 0
            var intake = 0
            var status = "打开 App 看看今天"
            var streak = 0
            var themeName = "dark"
            if (raw != null) {
                try {
                    val j = JSONObject(raw)
                    val d = j.optInt("deficit", Int.MIN_VALUE)
                    deficit = if (d == Int.MIN_VALUE) "--" else if (d >= 0) "−$d" else "+${-d}"
                    burn = j.optInt("burn", 0)
                    intake = j.optInt("intake", 0)
                    status = j.optString("status", status)
                    streak = j.optInt("streak", 0)
                    themeName = j.optString("theme", "dark")
                } catch (_: Exception) { /* 数据坏了就用默认 */ }
            }
            val t = THEMES[themeName] ?: THEMES.getValue("dark")

            views.setInt(R.id.widget_root, "setBackgroundColor", t[0])
            views.setTextColor(R.id.widget_title, t[2])
            views.setTextColor(R.id.widget_streak, t[2])
            views.setTextColor(R.id.widget_deficit, if (deficit.startsWith("+")) t[4] else t[3])
            views.setTextColor(R.id.widget_deficit_label, t[2])
            views.setTextColor(R.id.widget_numbers, t[1])
            views.setTextColor(R.id.widget_status, t[1])

            views.setTextViewText(R.id.widget_deficit, deficit)
            views.setTextViewText(R.id.widget_streak, if (streak > 0) "连续 $streak 天" else "")
            views.setTextViewText(R.id.widget_numbers, "消耗 $burn · 摄入 $intake")
            views.setTextViewText(R.id.widget_status, status)

            // 点击打开 App
            val intent = Intent(context, MainActivity::class.java)
            val pi = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_root, pi)

            manager.updateAppWidget(id, views)
        }
    }
}
