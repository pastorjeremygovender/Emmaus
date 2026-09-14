import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requiredFiles = [
  'capacitor.config.ts',
  'android/gradlew',
  'android/gradle/wrapper/gradle-wrapper.properties',
  'android/variables.gradle',
  'android/app/build.gradle',
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/java/za/co/emmaus/app/DailyRhythmWidgetProvider.java',
  'android/app/src/main/java/za/co/emmaus/app/DailyRhythmDeepLinkPlugin.java',
  'android/app/src/main/java/za/co/emmaus/app/GeofenceProofPlugin.java',
  'android/app/src/main/java/za/co/emmaus/app/WelcomeAssistBluetoothPlugin.java',
  'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
];

const fail = message => {
  console.error(`[android:verify] ${message}`);
  process.exitCode = 1;
};

for (const relativePath of requiredFiles) {
  try {
    await access(resolve(root, relativePath), constants.F_OK);
  } catch {
    fail(`Missing required native file: ${relativePath}`);
  }
}

const variables = await readFile(resolve(root, 'android/variables.gradle'), 'utf8');
const gradle = await readFile(resolve(root, 'android/app/build.gradle'), 'utf8');
const manifest = await readFile(resolve(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
const wrapper = await readFile(resolve(root, 'android/gradle/wrapper/gradle-wrapper.properties'), 'utf8');

const requiredSnippets = [
  [variables, "compileSdkVersion = 36", 'compileSdk 36'],
  [variables, "targetSdkVersion = 36", 'targetSdk 36'],
  [variables, "minSdkVersion = 24", 'minSdk 24'],
  [gradle, 'versionCode = 13', 'versionCode 13'],
  [gradle, 'versionName = "1.2.0-rc11"', 'versionName 1.2.0-rc11'],
  [gradle, 'applicationId = "za.co.emmaus.app"', 'application ID'],
  [gradle, 'verifyReleaseSigning', 'release signing verification'],
  [wrapper, 'gradle-8.14.3-all.zip', 'Gradle 8.14.3'],
  [manifest, 'android.permission.CAMERA', 'camera permission'],
  [manifest, 'android.permission.RECORD_AUDIO', 'microphone permission'],
  [manifest, 'android.permission.POST_NOTIFICATIONS', 'notification permission'],
  [manifest, 'android.permission.ACCESS_BACKGROUND_LOCATION', 'background location permission'],
  [manifest, 'android.permission.BLUETOOTH_SCAN', 'Bluetooth scan permission'],
  [manifest, 'DailyRhythmWidgetProvider', 'Daily Rhythm widget'],
  [manifest, 'GeofenceProofReceiver', 'Welcome Assist geofence receiver'],
  [manifest, 'android:exported="true"', 'exported launcher activity'],
  [manifest, 'android:autoVerify="true"', 'verified app link'],
  [manifest, 'android:icon="@mipmap/ic_launcher"', 'Emmaus launcher icon'],
];

for (const [content, snippet, label] of requiredSnippets) {
  if (!content.includes(snippet)) fail(`Missing ${label} configuration.`);
}

if (process.argv.includes('--require-signing')) {
  const requiredEnv = [
    'EMMAUS_ANDROID_KEYSTORE_PATH',
    'EMMAUS_ANDROID_KEYSTORE_PASSWORD',
    'EMMAUS_ANDROID_KEY_ALIAS',
    'EMMAUS_ANDROID_KEY_PASSWORD',
  ];
  const missing = requiredEnv.filter(name => !process.env[name]);
  if (missing.length) fail(`Release signing is not configured; missing ${missing.join(', ')}.`);
}

if (!process.exitCode) {
  console.log('[android:verify] Android 16 release wrapper configuration is valid.');
}
