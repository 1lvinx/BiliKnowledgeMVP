#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import process from "node:process";
import { chromium } from "playwright-core";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

function parseArgs(argv) {
  const args = {
    config: "",
    output: "",
    maxFolders: 0,
    maxItemsPerFolder: 0,
    headless: true,
    folderId: "",
    folderTitle: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--config") {
      args.config = argv[i + 1] || "";
      i += 1;
    } else if (token === "--output") {
      args.output = argv[i + 1] || "";
      i += 1;
    } else if (token === "--max-folders") {
      args.maxFolders = Number(argv[i + 1] || "0") || 0;
      i += 1;
    } else if (token === "--max-items-per-folder") {
      args.maxItemsPerFolder = Number(argv[i + 1] || "0") || 0;
      i += 1;
    } else if (token === "--headed") {
      args.headless = false;
    } else if (token === "--folder-id") {
      args.folderId = argv[i + 1] || "";
      i += 1;
    } else if (token === "--folder-title") {
      args.folderTitle = argv[i + 1] || "";
      i += 1;
    }
  }

  if (!args.config) {
    throw new Error("Missing required --config path");
  }
  if (!args.output) {
    throw new Error("Missing required --output path");
  }
  return args;
}

function detectChromeExecutable() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error("No Chrome-like browser found. Install Google Chrome, Edge, Chromium, or Brave.");
}

function loadConfig(configPath) {
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw);
}

function buildCookieHeader(config) {
  const bilibili = config.bilibili || {};
  const rawCookie = String(bilibili.cookie || "").trim();
  if (rawCookie) {
    return rawCookie;
  }

  const parts = [];
  const mapping = [
    ["SESSDATA", bilibili.sessdata],
    ["bili_jct", bilibili.bili_jct],
    ["DedeUserID", bilibili.dedeuserid],
    ["buvid3", bilibili.buvid3],
  ];
  for (const [name, value] of mapping) {
    const normalized = String(value || "").trim();
    if (normalized) {
      parts.push(`${name}=${normalized}`);
    }
  }
  return parts.join("; ");
}

function parseCookieHeader(cookieHeader) {
  return cookieHeader
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const pivot = segment.indexOf("=");
      if (pivot === -1) {
        return null;
      }
      return {
        name: segment.slice(0, pivot).trim(),
        value: segment.slice(pivot + 1).trim(),
      };
    })
    .filter(Boolean);
}

function httpGetJson(url, cookieHeader) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        headers: {
          Cookie: cookieHeader,
          "User-Agent": USER_AGENT,
          Referer: "https://www.bilibili.com/",
          Accept: "application/json, text/plain, */*",
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error(`Request timeout: ${url}`));
    });
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLoginProfile(cookieHeader) {
  const payload = await httpGetJson("https://api.bilibili.com/x/web-interface/nav", cookieHeader);
  const data = payload.data || {};
  if (!data.isLogin) {
    throw new Error(payload.message || "SESSDATA is invalid or expired");
  }
  return data;
}

async function fetchFavoriteFolders(cookieHeader, mid) {
  const query = new URLSearchParams({ up_mid: String(mid) }).toString();
  let lastMessage = "Failed to fetch favorite folders";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const payload = await httpGetJson(
      `https://api.bilibili.com/x/v3/fav/folder/created/list-all?${query}`,
      cookieHeader,
    );
    if (payload.code === 0) {
      return (payload.data && payload.data.list) || [];
    }
    lastMessage = payload.message || lastMessage;
    const retryable = /banned|频繁|稍后|限制/i.test(lastMessage);
    if (!retryable || attempt === 4) {
      break;
    }
    await sleep(1200 * attempt);
  }
  throw new Error(lastMessage);
}

async function fetchFolderResourcesWithCookie(cookieHeader, folder, options) {
  const targetCount = Number(folder.media_count || folder.count || 0);
  const batchLimit = Number(options.maxItemsPerFolder || 0);
  const items = [];
  const seen = new Set();

  for (let pageNumber = 1; pageNumber <= 500; pageNumber += 1) {
    const query = new URLSearchParams({
      media_id: String(folder.id),
      pn: String(pageNumber),
      ps: "20",
      platform: "web",
    }).toString();
    let payload = null;
    let payloadMessage = "";
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      payload = await httpGetJson(
        `https://api.bilibili.com/x/v3/fav/resource/list?${query}`,
        cookieHeader,
      );
      if (payload && payload.code === 0) {
        break;
      }
      payloadMessage = payload?.message || "";
      const retryable = /banned|频繁|稍后|限制/i.test(payloadMessage);
      if (!retryable || attempt === 4) {
        break;
      }
      await sleep(1200 * attempt);
    }
    if (!payload || payload.code !== 0) {
      throw new Error(payloadMessage || `收藏夹接口返回异常（${folder.title || "默认收藏夹"}）`);
    }
    const medias = payload.data?.medias || [];
    for (const media of medias) {
      const bvid = media?.bvid || media?.bv_id || "";
      if (!bvid || seen.has(bvid)) {
        continue;
      }
      seen.add(bvid);
      items.push({
        bvid,
        title: media?.title || "",
        url: `https://www.bilibili.com/video/${bvid}`,
        uploader: media?.upper?.name || "",
        collected_at: "",
        duration: String(media?.duration || ""),
        favorite_folder: folder.title || "默认收藏夹",
        desc: media?.intro || "",
      });
      if (batchLimit > 0 && items.length >= batchLimit) {
        break;
      }
    }
    if (!medias.length) {
      break;
    }
    if (batchLimit > 0 && items.length >= batchLimit) {
      break;
    }
    if (targetCount > 0 && items.length >= targetCount) {
      break;
    }
    if (!payload.data?.has_more) {
      break;
    }
    await sleep(220);
  }

  return items;
}

async function seedBilibiliCookies(context, cookieHeader) {
  const cookies = parseCookieHeader(cookieHeader).map((cookie) => ({
    ...cookie,
    domain: ".bilibili.com",
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  }));
  await context.addCookies(cookies);
}

async function extractFolderPage(page, favoriteFolder) {
  return await page.evaluate((folderTitle) => {
    const isVideoId = (value) => /^BV[0-9A-Za-z]+$/.test(value);
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const timeLike = (value) => /^\d{1,2}:\d{2}$/.test(value) || /^\d{1,2}:\d{2}:\d{2}$/.test(value);
    const byBvid = new Map();

    const cards = Array.from(document.querySelectorAll(".bili-video-card__wrap"));
    for (const card of cards) {
      const titleAnchor = card.querySelector('a[href*="/video/BV"] .bili-video-card__title')
        ? card.querySelector('a[href*="/video/BV"]')
        : card.querySelector('.bili-video-card__details a[href*="/video/BV"]');
      const coverAnchor = card.querySelector('.bili-video-card__cover[href*="/video/BV"], a.bili-video-card__cover[href*="/video/BV"]');
      const anchor = titleAnchor || coverAnchor || card.querySelector('a[href*="/video/BV"]');
      if (!anchor) {
        continue;
      }

      const href = anchor.getAttribute("href") || "";
      const matched = href.match(/BV[0-9A-Za-z]+/);
      if (!matched) {
        continue;
      }
      const bvid = matched[0];

      const rowText = clean(card.innerText || card.textContent || "");
      const rowLines = (card.innerText || card.textContent || "")
        .split("\n")
        .map(clean)
        .filter(Boolean);

      const titleCandidate =
        clean(card.querySelector(".bili-video-card__title")?.textContent || "") ||
        clean(anchor.textContent || "");
      const lineTitle = rowLines
        .filter((line) => !isVideoId(line))
        .filter((line) => line !== "稍后再看" && line !== "当前")
        .filter((line) => !timeLike(line))
        .filter((line) => !/^\d+(\.\d+)?[万亿]?$/.test(line))
        .filter((line) => !line.includes("收藏于"))
        .sort((a, b) => b.length - a.length)[0] || titleCandidate;

      const metaLine = rowLines.find((line) => line.includes("· 收藏于")) || "";
      const metaMatch = metaLine.match(/^(.*?)\s*·\s*收藏于(.*)$/);
      const duration =
        clean(card.querySelector(".bili-video-card__stats__duration")?.textContent || "") ||
        rowLines.find((line) => timeLike(line)) ||
        "";
      const title = clean(lineTitle || titleCandidate);

      if (!title || title.length < 2) {
        continue;
      }

      const existing = byBvid.get(bvid);
      const currentScore = title.length;
      const existingScore = existing ? existing.title.length : -1;
      if (currentScore >= existingScore) {
        byBvid.set(bvid, {
          bvid,
          title,
          url: `https://www.bilibili.com/video/${bvid}`,
          uploader: metaMatch ? clean(metaMatch[1]) : "",
          collected_at: metaMatch ? clean(metaMatch[2]) : "",
          duration,
          favorite_folder: folderTitle,
          desc: rowText,
        });
      }
    }

    return Array.from(byBvid.values());
  }, favoriteFolder);
}

async function currentFirstBvid(page) {
  const items = await extractFolderPage(page, "");
  return items[0] ? items[0].bvid : "";
}

async function currentPagerState(page) {
  return await page.evaluate(() => {
    const active = document.querySelector(".vui_pagenation .vui_pagenation--btn-num.vui_button--active");
    const next = Array.from(document.querySelectorAll(".vui_pagenation .vui_pagenation--btn-side")).find((element) =>
      (element.textContent || "").replace(/\s+/g, " ").trim() === "下一页",
    );

    const activePage = Number((active?.textContent || "").trim()) || 0;
    const nextDisabled = !next
      || next.hasAttribute("disabled")
      || next.className.includes("vui_button--disabled");

    return {
      activePage,
      nextDisabled,
    };
  });
}

async function waitForFolderCards(page, folderTitle, options = {}) {
  const attempts = Number(options.attempts || 8);
  const delayMs = Number(options.delayMs || 800);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const items = await extractFolderPage(page, folderTitle);
    if (items.length) {
      return items;
    }

    const hasEmptyState = await page.evaluate(() =>
      (document.body.innerText || "").includes("这里还什么都没有呢"),
    );

    if (!hasEmptyState) {
      await page.waitForTimeout(delayMs);
      continue;
    }

    if (attempt < attempts - 1) {
      try {
        await page.reload({ waitUntil: "domcontentloaded" });
      } catch {
        // ignore and continue waiting
      }
      await page.waitForTimeout(delayMs);
    }
  }

  return [];
}

async function clickNextPage(page, previousFirstBvid, previousPageNumber) {
  const pagerState = await currentPagerState(page);
  if (pagerState.nextDisabled) {
    return false;
  }

  try {
    const textButton = page.getByText("下一页", { exact: true }).first();
    if ((await textButton.count()) > 0) {
      await textButton.scrollIntoViewIfNeeded();
      await textButton.click({ timeout: 5000 });
    } else {
      throw new Error("text next button not found");
    }
  } catch {
    try {
      const nextButton = page
        .locator(".vui_pagenation .vui_pagenation--btn-side", { hasText: "下一页" })
        .first();
      if ((await nextButton.count()) > 0) {
        await nextButton.scrollIntoViewIfNeeded();
        await nextButton.click({ timeout: 5000, force: true });
      } else {
        const nextPageNumber = previousPageNumber > 0 ? String(previousPageNumber + 1) : "";
        if (!nextPageNumber) {
          return false;
        }
        const nextPageButton = page
          .locator(".vui_pagenation .vui_pagenation--btn-num", { hasText: nextPageNumber })
          .first();
        if ((await nextPageButton.count()) === 0) {
          return false;
        }
        await nextPageButton.scrollIntoViewIfNeeded();
        await nextPageButton.click({ timeout: 5000, force: true });
      }
    } catch {
      return false;
    }
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(400);
    const nextFirstBvid = await currentFirstBvid(page);
    const nextPagerState = await currentPagerState(page);
    if (
      (nextFirstBvid && nextFirstBvid !== previousFirstBvid)
      || (nextPagerState.activePage > previousPageNumber && nextPagerState.activePage > 0)
    ) {
      return true;
    }
  }
  return false;
}

async function resolveFolderUrl(page, folder) {
  const baseUrl = `https://space.bilibili.com/${folder.mid}/favlist`;
  const fallbackUrl = `${baseUrl}?fid=${folder.id}&ftype=create`;

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const match = await page.evaluate(({ folderId, folderTitle }) => {
      const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
      const anchors = Array.from(document.querySelectorAll('a[href*="favlist"]'));
      for (const anchor of anchors) {
        const href = anchor.getAttribute("href") || "";
        const text = normalize(anchor.textContent || "");
        if (!href) {
          continue;
        }
        if (href.includes(`fid=${folderId}`)) {
          return href;
        }
        if (folderTitle && text === folderTitle) {
          return href;
        }
      }
      return "";
    }, { folderId: String(folder.id), folderTitle: folder.title || "" });

    if (match) {
      if (match.startsWith("http://") || match.startsWith("https://")) {
        return match;
      }
      if (match.startsWith("//")) {
        return `https:${match}`;
      }
      if (match.startsWith("/")) {
        return `https://space.bilibili.com${match}`;
      }
      return `https://space.bilibili.com/${match.replace(/^\/+/, "")}`;
    }
  } catch (error) {
    console.warn(`[浏览器同步] 解析收藏夹链接失败，回退直达地址：${error.message}`);
  }

  return fallbackUrl;
}

async function scrapeFolderOnce(context, folder, options, cookieHeader) {
  const folderTitle = folder.title || "默认收藏夹";
  const page = await context.newPage();
  try {
    const folderUrl = await resolveFolderUrl(page, folder);
    console.log(`[浏览器同步] 打开收藏夹：${folderTitle} -> ${folderUrl}`);
    await page.goto(folderUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const targetCount = Number(folder.media_count || folder.count || 0);
    const batchLimit = Number(options.maxItemsPerFolder || 0);
    const cappedTarget = batchLimit > 0 && targetCount > 0 ? Math.min(targetCount, batchLimit) : targetCount;

    let fetchedItems = [];
    try {
      const seen = new Set();
      for (let pageNumber = 1; pageNumber <= 500; pageNumber += 1) {
        const pageItems = await waitForFolderCards(page, folderTitle, {
          attempts: pageNumber === 1 ? 10 : 5,
          delayMs: targetCount > 1000 ? 1200 : 700,
        });
        for (const item of pageItems) {
          if (!item.bvid || seen.has(item.bvid)) {
            continue;
          }
          seen.add(item.bvid);
          fetchedItems.push(item);
          if (batchLimit > 0 && fetchedItems.length >= batchLimit) {
            break;
          }
        }

        if (batchLimit > 0 && fetchedItems.length >= batchLimit) {
          break;
        }
        if (targetCount > 0 && fetchedItems.length >= targetCount) {
          break;
        }

        const firstBvid = pageItems[0]?.bvid || "";
        if (!firstBvid) {
          console.warn(`[浏览器同步] ${folderTitle} 第 ${pageNumber} 页未解析到视频卡片，停止翻页`);
          break;
        }
        const pagerState = await currentPagerState(page);
        const moved = await clickNextPage(page, firstBvid, pagerState.activePage);
        if (!moved) {
          console.warn(
            `[浏览器同步] ${folderTitle} 第 ${pageNumber} 页后无法继续翻页（当前分页 ${pagerState.activePage}），停止抓取`,
          );
          break;
        }
        if (targetCount > 1000 && pageNumber % 25 === 0) {
          await page.waitForTimeout(1200);
        }
      }

      if (!fetchedItems.length && targetCount > 0) {
        throw new Error(`页面中未抓到任何视频卡片（${folderTitle}）`);
      }
    } catch (error) {
      console.warn(`[浏览器同步] ${folderTitle} 页面抓取失败，回退接口同步：${error.message}`);
      fetchedItems = await fetchFolderResourcesWithCookie(cookieHeader, folder, options);
    }

    console.log(
      `[浏览器同步] ${folderTitle} 抓取完成，累计 ${fetchedItems.length}` +
        (cappedTarget > 0 ? ` / ${cappedTarget}` : ""),
    );
    return fetchedItems;
  } finally {
    await page.close();
  }
}

function dedupeFolderItems(items) {
  const byBvid = new Map();
  for (const item of items) {
    if (!item?.bvid) {
      continue;
    }
    const existing = byBvid.get(item.bvid);
    if (!existing || String(item.title || "").length >= String(existing.title || "").length) {
      byBvid.set(item.bvid, item);
    }
  }
  return Array.from(byBvid.values());
}

async function scrapeFolder(context, folder, options, cookieHeader) {
  const targetCount = Number(folder.media_count || folder.count || 0);
  const batchLimit = Number(options.maxItemsPerFolder || 0);
  const shouldRetryLargeFolder = batchLimit <= 0 && targetCount >= 500;
  const maxAttempts = shouldRetryLargeFolder ? 3 : 1;
  let mergedItems = [];
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const beforeCount = mergedItems.length;
      const passItems = await scrapeFolderOnce(context, folder, options, cookieHeader);
      mergedItems = dedupeFolderItems([...mergedItems, ...passItems]);
      if (!shouldRetryLargeFolder) {
        return mergedItems;
      }
      if (targetCount > 0 && mergedItems.length >= targetCount) {
        break;
      }
      if (mergedItems.length === beforeCount) {
        break;
      }
      if (attempt < maxAttempts) {
        console.log(
          `[浏览器同步] ${folder.title} 第 ${attempt} 轮完成，累计 ${mergedItems.length} / ${targetCount}，准备重试补齐`,
        );
      }
    } catch (error) {
      lastError = error;
      if (!mergedItems.length && attempt === maxAttempts) {
        throw error;
      }
    }
  }

  if (!mergedItems.length && lastError) {
    throw lastError;
  }
  return mergedItems;
}

function normalizeFolders(folders, mid) {
  return folders
    .map((folder) => ({
      id: String(folder.id || ""),
      title: folder.title || "默认收藏夹",
      media_count: Number(folder.media_count || folder.count || 0),
      mid: String(mid),
    }))
    .filter((folder) => folder.id);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(args.config);
  const cookieHeader = buildCookieHeader(config);
  const usedRawCookie = Boolean(String((config.bilibili || {}).cookie || "").trim());
  if (!cookieHeader) {
    throw new Error("Missing Bilibili cookie config");
  }

  const profile = await fetchLoginProfile(cookieHeader);
  console.log(`[浏览器同步] 当前账号：${profile.uname} (${profile.mid})`);

  let folders = normalizeFolders(await fetchFavoriteFolders(cookieHeader, profile.mid), profile.mid);
  if (args.folderId) {
    folders = folders.filter((folder) => folder.id === String(args.folderId));
  } else if (args.folderTitle) {
    folders = folders.filter((folder) => folder.title === args.folderTitle);
  }
  if (args.maxFolders > 0) {
    folders = folders.slice(0, args.maxFolders);
  }
  console.log(`[浏览器同步] 待同步收藏夹：${folders.length}`);

  const browser = await chromium.launch({
    executablePath: detectChromeExecutable(),
    headless: args.headless,
  });

  try {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    await seedBilibiliCookies(context, cookieHeader);

    const seedPage = await context.newPage();
    await seedPage.goto("https://www.bilibili.com/", { waitUntil: "domcontentloaded" });
    await seedPage.waitForTimeout(1500);
    await seedPage.close();

    const items = [];
    const failedFolders = [];
    const partialFolders = [];
    const folderLatestMap = new Map();
    for (const folder of folders) {
      try {
        const folderItems = await scrapeFolder(context, folder, {
          maxItemsPerFolder: args.maxItemsPerFolder,
        }, cookieHeader);
        const latestItem = [...folderItems].sort((a, b) => {
          const aTs = Number.parseInt(String(a.pubdate || "0"), 10) || 0;
          const bTs = Number.parseInt(String(b.pubdate || "0"), 10) || 0;
          return bTs - aTs;
        })[0];
        folderLatestMap.set(folder.id, {
          latest_ts: Number.parseInt(String(latestItem?.pubdate || "0"), 10) || 0,
          latest_collected_at: String(latestItem?.collected_at || latestItem?.pubdate || ""),
        });
        const expectedCount = Number(folder.media_count || 0);
        if (expectedCount > 0 && folderItems.length < expectedCount && args.maxItemsPerFolder <= 0) {
          partialFolders.push({
            id: folder.id,
            title: folder.title,
            expected_count: expectedCount,
            actual_count: folderItems.length,
          });
          console.warn(
            `[浏览器同步] ${folder.title} 未完整抓取：${folderItems.length} / ${expectedCount}`,
          );
        }
        for (const item of folderItems) {
          items.push(item);
        }
      } catch (error) {
        failedFolders.push({
          id: folder.id,
          title: folder.title,
          media_count: folder.media_count,
          error: error.message || String(error),
        });
        console.warn(`[浏览器同步] ${folder.title} 同步失败：${error.message || error}`);
      }
      await sleep(500);
    }

    const expectedVisibleItems = folders.reduce((sum, folder) => {
      const count = Number(folder.media_count || 0);
      if (args.maxItemsPerFolder > 0) {
        return sum + Math.min(count, args.maxItemsPerFolder);
      }
      return sum + count;
    }, 0);

    if (!items.length && expectedVisibleItems > 0 && !usedRawCookie) {
      throw new Error(
        "当前仅配置了 SESSDATA 等基础字段，未拿到完整 Cookie Header。B 站收藏页不会返回真实列表，请在设置页粘贴整段浏览器 Cookie 后重试。",
      );
    }
    if (!items.length && failedFolders.length) {
      throw new Error(failedFolders[0].error || "收藏夹同步失败");
    }

    const payload = {
      profile: {
        mid: profile.mid,
        uname: profile.uname,
      },
      folders: folders
        .map(({ id, title, media_count }) => ({
          id,
          title,
          media_count,
          ...(folderLatestMap.get(id) || { latest_ts: 0, latest_collected_at: "" }),
        }))
        .sort((a, b) => {
          if ((b.latest_ts || 0) !== (a.latest_ts || 0)) {
            return (b.latest_ts || 0) - (a.latest_ts || 0);
          }
          if ((b.media_count || 0) !== (a.media_count || 0)) {
            return (b.media_count || 0) - (a.media_count || 0);
          }
          return String(a.title || "").localeCompare(String(b.title || ""), "zh-CN");
        }),
      items,
      failed_folders: failedFolders,
      partial_folders: partialFolders,
    };

    const outputPath = path.resolve(args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
    console.log(
      `[浏览器同步] 写入结果：${outputPath}（${items.length} 条，失败收藏夹 ${failedFolders.length} 个，未完整收藏夹 ${partialFolders.length} 个）`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`[浏览器同步错误] ${error.message}`);
  process.exit(1);
});
