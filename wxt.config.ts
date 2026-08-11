import { defineConfig } from "wxt";

// Public key used by ordinary unpacked development builds so their Chrome
// extension ID stays stable across rebuilds and directory changes. A separate,
// explicitly supplied public key may be used for production-ID acceptance
// builds. Regular production/store builds do not include either key.
const DEVELOPMENT_EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz7HoLDJsP6nRZxnszVvL74JxMoesVvTrUQTKPZh7Ur4FeY/DVWQ3fdfgfG2gk7XvbWM9JPoUNcJaB8bLWhq2D9I6aoGh/YoRlclLoQeqvAhBII5BhyQMp3xpPHZtZ8p34/li9Q4iHU6JMQrCeXa4WM2s9LhWUDh2Yp3t8Fw/6AlHdETC60FnoQVl5Y7xbg5bl7DmmuJPJoFsP6Nj/kTEsFuFI+XvD531DtojfzPF+sFeNDupVIxCcTys/KM/RupeoAQVcf5PIurEcLJSCNW7EGbMDUbjAWdOWBzb2VAB5ieZqDbgxVe6pZPQ/zvuRaf8g9cwO0XscphV4zUo44/XOQIDAQAB";

const isLocalRelease = process.env.SMARTAINEWTAB_LOCAL_RELEASE === "1";
const localExtensionKey = isLocalRelease
  ? process.env.SMARTAINEWTAB_LOCAL_EXTENSION_KEY ?? DEVELOPMENT_EXTENSION_KEY
  : DEVELOPMENT_EXTENSION_KEY;
const localVersion = process.env.SMARTAINEWTAB_LOCAL_VERSION;
const localVersionName = process.env.SMARTAINEWTAB_LOCAL_VERSION_NAME;

if (isLocalRelease && (!localVersion || !localVersionName)) {
  throw new Error(
    "Local release builds require SMARTAINEWTAB_LOCAL_VERSION and SMARTAINEWTAB_LOCAL_VERSION_NAME",
  );
}

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: "src",
  publicDir: "public",
  manifest: ({ mode, browser }) => ({
    name: "__MSG_appName__",
    description: "__MSG_appDescription__",
    default_locale: "zh_CN",
    permissions: [
      "bookmarks",
      "storage",
      "alarms",
      "favicon",
      "identity",
    ],
    optional_host_permissions: [
      "https://*/*",
      "http://*/*",
    ],
    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      128: "icon/128.png",
    },
    ...(isLocalRelease
      ? { version: localVersion!, version_name: localVersionName! }
      : {}),
    ...((mode === "development" ||
      isLocalRelease) &&
    browser === "chrome"
      ? { key: localExtensionKey }
      : {}),
  }),
});
