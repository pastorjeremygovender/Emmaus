package za.co.emmaus.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.webkit.CookieManager;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native Android home-screen widget for today's Emmaus Daily Rhythm.
 *
 * The widget reads the same authenticated endpoints as the Capacitor WebView,
 * reusing its secure same-origin session cookie. Only non-sensitive display
 * content is cached locally. If refresh is unavailable, the last safe content
 * remains visible and the tap target still opens Emmaus.
 */
public final class DailyRhythmWidgetProvider extends AppWidgetProvider {
    private static final String BASE_URL = "https://emmaus.co.za";
    private static final String STATE_PATH = "/api/journeys/daily-rhythm/state";
    private static final String PREFS = "emmaus_daily_rhythm_widget";
    private static final String KEY_DAY = "day";
    private static final String KEY_TITLE = "title";
    private static final String KEY_VERSE = "verse";
    private static final String KEY_REFERENCE = "reference";
    private static final String KEY_COMPLETED = "completed";
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        renderAll(context, manager, appWidgetIds);
        refresh(context);
    }

    @Override
    public void onEnabled(Context context) {
        refresh(context);
    }

    public static void refresh(Context context) {
        Context appContext = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            try {
                WidgetContent content = loadCurrentContent();
                cache(appContext, content);
            } catch (Exception ignored) {
                // Offline, signed-out, and provider failures retain the last safe cache.
            }
            AppWidgetManager manager = AppWidgetManager.getInstance(appContext);
            int[] ids = manager.getAppWidgetIds(
                new ComponentName(appContext, DailyRhythmWidgetProvider.class)
            );
            renderAll(appContext, manager, ids);
        });
    }

    private static WidgetContent loadCurrentContent() throws Exception {
        JSONObject state = requestJson(STATE_PATH);
        int day = Math.max(1, state.optInt("currentDayNumber", 1));
        String journeyId = state.optString("journeyId", "");
        String title = clean(state.optString("currentStepTitle", "Today's Daily Rhythm"));
        boolean completed = state.optBoolean("currentStepCompleted", false);

        String verse = "";
        String reference = "";
        if (!journeyId.isEmpty()) {
            JSONObject stepsBody = requestJson(
                "/api/journeys/" + Uri.encode(journeyId) + "/steps"
            );
            JSONArray steps = stepsBody.optJSONArray("steps");
            if (steps != null) {
                for (int index = 0; index < steps.length(); index++) {
                    JSONObject step = steps.optJSONObject(index);
                    if (step == null || step.optInt("day", -1) != day) continue;
                    title = clean(step.optString("title", title));
                    reference = clean(step.optString("scripture", ""));
                    JSONArray references = step.optJSONArray("scriptureReferences");
                    if (references != null && references.length() > 0) {
                        JSONObject first = references.optJSONObject(0);
                        if (first != null) {
                            reference = clean(first.optString("reference", reference));
                            verse = clean(first.optString("verseText", ""));
                        }
                    }
                    break;
                }
            }
        }
        if (verse.isEmpty() && !reference.isEmpty()) {
            try {
                verse = loadVerseExcerpt(reference);
            } catch (Exception ignored) {
                // The reference remains visible if the Bible excerpt is unavailable.
            }
        }
        return new WidgetContent(day, title, verse, reference, completed);
    }

    private static String loadVerseExcerpt(String reference) throws Exception {
        java.util.regex.Matcher matcher = java.util.regex.Pattern
            .compile("^(.+?)\\s+(\\d+)(?::(\\d+)(?:[-–—](\\d+))?)?.*$")
            .matcher(reference);
        if (!matcher.matches()) return "";

        String bookId = matcher.group(1)
            .toLowerCase(java.util.Locale.ROOT)
            .replaceAll("[^a-z0-9]+", "-")
            .replaceAll("(^-|-$)", "");
        int chapter = Integer.parseInt(matcher.group(2));
        int startVerse = matcher.group(3) == null ? 1 : Integer.parseInt(matcher.group(3));
        int endVerse = matcher.group(4) == null ? startVerse : Integer.parseInt(matcher.group(4));

        JSONObject chapterBody = requestJson(
            "/api/bible/bsb/" + Uri.encode(bookId) + "/" + chapter
        );
        JSONArray verses = chapterBody.optJSONArray("verses");
        if (verses == null) return "";

        StringBuilder excerpt = new StringBuilder();
        for (int index = 0; index < verses.length(); index++) {
            JSONObject item = verses.optJSONObject(index);
            if (item == null) continue;
            int number = item.optInt("verse", -1);
            if (number < startVerse || number > endVerse) continue;
            String text = clean(item.optString("text", ""));
            if (text.isEmpty()) continue;
            if (excerpt.length() > 0) excerpt.append(" ");
            excerpt.append(text);
            if (excerpt.length() >= 150) break;
        }
        return excerpt.toString();
    }

    private static JSONObject requestJson(String path) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(BASE_URL + path).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(8000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Cache-Control", "no-store");

        String cookies = CookieManager.getInstance().getCookie(BASE_URL);
        if (cookies != null && !cookies.trim().isEmpty()) {
            connection.setRequestProperty("Cookie", cookies);
        }

        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300
            ? connection.getInputStream()
            : connection.getErrorStream();
        String body = read(stream);
        connection.disconnect();
        if (status < 200 || status >= 300) {
            throw new IllegalStateException("Daily Rhythm refresh failed: HTTP " + status);
        }
        return new JSONObject(body);
    }

    private static String read(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(stream, StandardCharsets.UTF_8)
        )) {
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
        }
        return result.toString();
    }

    private static void cache(Context context, WidgetContent content) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt(KEY_DAY, content.day)
            .putString(KEY_TITLE, content.title)
            .putString(KEY_VERSE, content.verse)
            .putString(KEY_REFERENCE, content.reference)
            .putBoolean(KEY_COMPLETED, content.completed)
            .apply();
    }

    private static WidgetContent cached(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return new WidgetContent(
            Math.max(1, prefs.getInt(KEY_DAY, 1)),
            prefs.getString(KEY_TITLE, "Today's Daily Rhythm"),
            prefs.getString(KEY_VERSE, ""),
            prefs.getString(KEY_REFERENCE, ""),
            prefs.getBoolean(KEY_COMPLETED, false)
        );
    }

    private static void renderAll(
        Context context,
        AppWidgetManager manager,
        int[] appWidgetIds
    ) {
        WidgetContent content = cached(context);
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_daily_rhythm);
            views.setTextViewText(R.id.widget_title, "10 Minutes with Jesus");
            views.setTextViewText(R.id.widget_day_title, "Today • " + content.title);
            views.setTextViewText(R.id.widget_scripture, displayVerse(content.verse));
            views.setTextViewText(R.id.widget_reference, content.reference);
            Uri uri = Uri.parse(
                BASE_URL + "/daily-rhythm/day/" + content.day + "?source=widget"
            );
            Intent open = new Intent(Intent.ACTION_VIEW, uri, context, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                appWidgetId,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);
            views.setOnClickPendingIntent(R.id.widget_open, pendingIntent);
            manager.updateAppWidget(appWidgetId, views);
        }
    }

    private static String displayVerse(String verse) {
        String safe = clean(verse);
        if (safe.isEmpty()) return "Today’s Scripture";
        if (safe.length() > 150) safe = safe.substring(0, 147).trim() + "…";
        if (safe.startsWith("“") || safe.startsWith("\"")) return safe;
        return "“" + safe + "”";
    }

    private static String clean(String value) {
        if (value == null) return "";
        return value.replaceAll("\\s+", " ").trim();
    }

    private static final class WidgetContent {
        final int day;
        final String title;
        final String verse;
        final String reference;
        final boolean completed;

        WidgetContent(int day, String title, String verse, String reference, boolean completed) {
            this.day = day;
            this.title = title == null || title.isEmpty() ? "Today's Daily Rhythm" : title;
            this.verse = verse == null ? "" : verse;
            this.reference = reference == null ? "" : reference;
            this.completed = completed;
        }
    }
}
