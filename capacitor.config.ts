import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ru.cryptogoblin.app",
  appName: "Гоблин",
  webDir: "build",
  server: {
    url: "https://cryptogoblin.ru",
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
