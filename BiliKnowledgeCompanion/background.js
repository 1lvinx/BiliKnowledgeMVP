const BILI_COOKIE_URL = "https://www.bilibili.com/";
const DESKTOP_BRIDGE = "http://127.0.0.1:31420";
const COOKIE_NAMES = ["SESSDATA", "bili_jct", "DedeUserID", "buvid3"];

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "BIZHI_GET_STATE") {
    getState().then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  if (message?.type === "BIZHI_SEND_TO_DESKTOP") {
    sendToDesktop(message.payload).then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }
  return false;
});

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

async function getCurrentPageMetadata(tab) {
  const fallback = extractMetadataFromUrl(tab?.url ?? "");
  if (!tab?.id) return fallback;
  try {
    const [response] = await chrome.tabs.sendMessage(tab.id, { type: "BIZHI_COLLECT_PAGE" });
    return { ...fallback, ...(response?.metadata ?? {}) };
  } catch {
    return fallback;
  }
}

function extractMetadataFromUrl(url) {
  const bvid = url.match(/BV[0-9A-Za-z]{10}/)?.[0] ?? "";
  return {
    url,
    bvid,
    pageType: bvid ? "video" : "unknown",
    title: "",
    uploader: "",
  };
}

async function getBiliCookies() {
  const cookies = {};
  for (const name of COOKIE_NAMES) {
    const item = await chrome.cookies.get({ url: BILI_COOKIE_URL, name });
    if (item?.value) cookies[name] = item.value;
  }
  const cookieHeader = COOKIE_NAMES.filter((name) => cookies[name]).map((name) => `${name}=${cookies[name]}`).join("; ");
  return {
    sessdata: cookies.SESSDATA ?? "",
    bili_jct: cookies.bili_jct ?? "",
    dedeuserid: cookies.DedeUserID ?? "",
    buvid3: cookies.buvid3 ?? "",
    cookie_header: cookieHeader,
    isLoggedIn: Boolean(cookies.SESSDATA),
  };
}

async function getDesktopHealth() {
  try {
    const response = await fetch(`${DESKTOP_BRIDGE}/api/browser/health`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

async function getState() {
  const tab = await getActiveTab();
  const [metadata, cookies, desktopOnline] = await Promise.all([
    getCurrentPageMetadata(tab),
    getBiliCookies(),
    getDesktopHealth(),
  ]);
  return { ok: true, metadata, cookies: { isLoggedIn: cookies.isLoggedIn }, desktopOnline };
}

async function sendToDesktop(payload = {}) {
  const tab = await getActiveTab();
  const metadata = payload.metadata ?? await getCurrentPageMetadata(tab);
  const cookies = await getBiliCookies();
  const response = await fetch(`${DESKTOP_BRIDGE}/api/browser/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bizhi-Companion": "0.1.1",
    },
    body: JSON.stringify({ ...metadata, cookies }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || `Desktop Bridge HTTP ${response.status}`);
  }
  return result;
}
