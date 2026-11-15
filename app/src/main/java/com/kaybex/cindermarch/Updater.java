package com.kaybex.cindermarch;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Looks for a newer release on GitHub, downloads its APK and hands it to the system installer. */
final class Updater {
    static final String ACTION_STATUS = "com.kaybex.cindermarch.INSTALL_STATUS";
    private static final String LATEST = "https://api.github.com/repos/" + BuildConfig.UPDATE_REPO + "/releases/latest";

    private Updater() { }

    /** Runs in the background; calls {@link MainActivity#offerUpdate} only when a newer APK is downloaded. */
    static void check(final MainActivity activity) {
        new Thread(() -> {
            try {
                JSONObject release = new JSONObject(new String(readAll(open(LATEST, "application/vnd.github+json")), "UTF-8"));
                final String version = release.getString("tag_name").replaceFirst("^v", "");
                if (!isNewer(version, BuildConfig.VERSION_NAME)) return;
                String assetUrl = null;
                JSONArray assets = release.getJSONArray("assets");
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject asset = assets.getJSONObject(i);
                    if (asset.getString("name").endsWith(".apk")) assetUrl = asset.getString("url");
                }
                if (assetUrl == null) return;
                final File apk = new File(activity.getCacheDir(), "update.apk");
                HttpURLConnection c = open(assetUrl, "application/octet-stream");
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    copy(in, out);
                } finally {
                    c.disconnect();
                }
                activity.runOnUiThread(() -> activity.offerUpdate(version, apk));
            } catch (Exception e) {
                // Offline, rate limited or no access: play on with the installed version.
            }
        }, "update-check").start();
    }

    /** Gives the downloaded APK to Android, which then asks the player to confirm the update. */
    static void install(Activity activity, File apk) throws IOException {
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(activity.getPackageName());
        int id = installer.createSession(params);
        PackageInstaller.Session session = installer.openSession(id);
        try {
            try (InputStream in = new FileInputStream(apk); OutputStream out = session.openWrite("update.apk", 0, apk.length())) {
                copy(in, out);
                session.fsync(out);
            }
            Intent result = new Intent(activity, MainActivity.class).setAction(ACTION_STATUS).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            session.commit(PendingIntent.getActivity(activity, id, result, flags).getIntentSender());
        } finally {
            session.close();
        }
    }

    /** GitHub answers downloads with a redirect to a signed URL, which must not receive our credentials. */
    private static HttpURLConnection open(String address, String accept) throws IOException {
        String url = address;
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(10000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "Cindermarch");
            if ("api.github.com".equals(c.getURL().getHost())) {
                c.setRequestProperty("Accept", accept);
                if (BuildConfig.UPDATE_TOKEN.length() > 0) c.setRequestProperty("Authorization", "Bearer " + BuildConfig.UPDATE_TOKEN);
            }
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String location = c.getHeaderField("Location");
                c.disconnect();
                if (location == null) throw new IOException("Redirect without a location");
                url = new URL(new URL(url), location).toString();
                continue;
            }
            if (code != 200) {
                c.disconnect();
                throw new IOException("HTTP " + code);
            }
            return c;
        }
        throw new IOException("Too many redirects");
    }

    private static byte[] readAll(HttpURLConnection c) throws IOException {
        try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            copy(in, out);
            return out.toByteArray();
        } finally {
            c.disconnect();
        }
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    /** True when version a (for example 1.0.3) is higher than version b. */
    static boolean isNewer(String a, String b) {
        String[] x = a.split("\\."), y = b.split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length ? number(x[i]) : 0, q = i < y.length ? number(y[i]) : 0;
            if (p != q) return p > q;
        }
        return false;
    }

    private static int number(String s) {
        try {
            return Integer.parseInt(s.replaceAll("[^0-9].*$", ""));
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
