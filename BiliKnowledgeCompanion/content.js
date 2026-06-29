chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "BIZHI_COLLECT_PAGE") return false;
  sendResponse({ metadata: collectPageMetadata() });
  return true;
});

function collectPageMetadata() {
  const url = location.href;
  const bvid = url.match(/BV[0-9A-Za-z]{10}/)?.[0] ?? "";
  const title = cleanTitle(
    document.querySelector("h1.video-title")?.textContent ||
    document.querySelector(".video-title")?.textContent ||
    document.querySelector("meta[property='og:title']")?.content ||
    document.title ||
    ""
  );
  const uploader = cleanTitle(
    document.querySelector(".up-name")?.textContent ||
    document.querySelector(".username")?.textContent ||
    document.querySelector("meta[name='author']")?.content ||
    ""
  );
  return {
    url,
    bvid,
    title,
    uploader,
    pageType: detectPageType(url),
  };
}

function detectPageType(url) {
  if (/\/video\/BV/.test(url)) return "video";
  if (/\/favlist/.test(url)) return "favorite";
  if (/\/list\//.test(url)) return "collection";
  return "unknown";
}

function cleanTitle(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/_哔哩哔哩_bilibili$/i, "").trim();
}
