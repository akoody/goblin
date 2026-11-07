export const cleanDeviceModel = (value) => typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 120) : "";

export function describeLoginDevice(userAgent, suppliedModel = "") {
  const ua = String(userAgent || "");
  let device = "Компьютер";
  let os = "Не определена";
  if (/Android/i.test(ua)) {
    device = /Mobile/i.test(ua) ? "Android-телефон" : "Android-планшет";
    os = `Android ${ua.match(/Android\s+([\d.]+)/i)?.[1] || ""}`.trim();
  } else if (/iPad/i.test(ua)) {
    device = "iPad";
    os = `iPadOS ${ua.match(/OS ([\d_]+)/)?.[1]?.replaceAll("_", ".") || ""}`.trim();
  } else if (/iPhone|iPod/i.test(ua)) {
    device = /iPhone/.test(ua) ? "iPhone" : "iPod";
    os = `iOS ${ua.match(/OS ([\d_]+)/)?.[1]?.replaceAll("_", ".") || ""}`.trim();
  } else if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS X/.test(ua)) os = "macOS";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Linux/.test(ua)) os = "Linux";
  if (!ua) device = "Не определено";
  const androidModel = ua.match(/Android[^;)]*;\s*(?:[a-z]{2}(?:[-_][A-Z]{2})?;\s*)?([^;)]+?)(?:\s+Build\/[^;)]+)?\)/i)?.[1]?.trim();
  const model = cleanDeviceModel(suppliedModel) || (androidModel && androidModel !== "K" ? cleanDeviceModel(androidModel) : "");
  let browser = "Не определён";
  for (const [name, pattern] of [
    ["Edge", /(?:Edg|EdgA|EdgiOS)\/([\d.]+)/], ["Opera", /(?:OPR|OPiOS)\/([\d.]+)/],
    ["Samsung Internet", /SamsungBrowser\/([\d.]+)/], ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/], ["Safari", /Version\/([\d.]+).*Safari/],
  ]) {
    const match = ua.match(pattern);
    if (match) { browser = `${name} ${match[1]}`; break; }
  }
  return { device: model ? `${device} · ${model}` : device, os, browser };
}
