const {parseCitationFile} = require('./parse.js')
const {detectFormat} = require('./formats.js')
const {cleanEntries, formatEntries} = require('./cleanup.js')
const {loadSettings} = require('./settings.js')


// Runs in the page context. executeScript waits for the returned promise.
function writeToClipboard(text) {
	return navigator.clipboard.writeText(text).then(() => {
		return true;
	}).catch(() => {
		return false;
	});
}

// https://stackoverflow.com/questions/67993145/how-to-get-current-tab-url-using-manifest-v3
async function getTab() {
  let queryOptions = { active: true, currentWindow: true };
  let tabs = await chrome.tabs.query(queryOptions);
  return tabs[0].id;
}

async function handleFile(content) {
	let parsed = parseCitationFile(content);
	if(parsed === undefined) {
		await chrome.notifications.create("", {
			type: "basic",
			title: chrome.i18n.getMessage("bibParseFailNotificationTitle"),
			message: chrome.i18n.getMessage("bibParseFailNotificationMessage"),
			iconUrl: "assets/img/128x128.png"
		});
		return false;
	}
	
	const settings = await loadSettings();
	const entries = cleanEntries(parsed.format('bibtex', {format: 'object'}), settings);

	return chrome.scripting.executeScript({
		target: {tabId : await getTab()},
		func: writeToClipboard,
		args: [formatEntries(entries, settings)]
	}).catch(() => {
		return undefined;
	}).then(async (res) => {
		if(res?.[0]?.result === true) {
			await chrome.notifications.create("", {
				type: "basic",
				title: chrome.i18n.getMessage("bibInterceptedNotificationTitle"),
				message: chrome.i18n.getMessage("bibInterceptedNotificationMessage"),
				iconUrl: "assets/img/128x128.png"
			});
			return true;
		} else {
			await chrome.notifications.create("", {
				type: "basic",
				title: chrome.i18n.getMessage("bibCopyFailNotificationTitle"),
				message: chrome.i18n.getMessage("bibCopyFailNotificationMessage"),
				iconUrl: "assets/img/128x128.png"
			});
			return false;
		}
	});
}

// Downloads older than this are not intercepted (safety net against
// entries restored from the download history).
const MAX_DOWNLOAD_AGE_MS = 10000;
const FETCH_TIMEOUT_MS = 15000;

function isNewDownload(downloadItem) {
	if(downloadItem.state !== chrome.downloads.State.IN_PROGRESS) {
		return false;
	}
	const started = new Date(downloadItem.startTime).getTime();
	if(Number.isNaN(started)) {
		return false;
	}
	return Date.now() - started <= MAX_DOWNLOAD_AGE_MS;
}

async function fetchDownload(downloadItem) {
	const response = await fetch(downloadItem.finalUrl || downloadItem.url, {
		referrer: downloadItem.referrer || undefined,
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
	});
	if(!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	return response.text();
}

// Returns true if the download was handled (and should be cancelled).
async function interceptDownload(downloadItem) {
	try {
		const content = await fetchDownload(downloadItem);
		return await handleFile(content);
	} catch(error) {
		return false;
	}
}

// onDeterminingFilename only fires for new downloads (not for history on
// startup) and provides the suggested file name, so formats served with a
// generic MIME type (e.g. application/octet-stream) can be recognized by
// extension. Chrome holds the download until suggest() is called, so nothing
// is written to disk while the file is being handled.
chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
	const format = detectFormat({
		mime: downloadItem.mime,
		filename: downloadItem.filename,
		url: downloadItem.finalUrl || downloadItem.url
	});
	if(!format || !isNewDownload(downloadItem)) {
		suggest();
		return;
	}

	interceptDownload(downloadItem).then(async (handled) => {
		if(handled) {
			try {
				await chrome.downloads.cancel(downloadItem.id);
				// Remove the cancelled entry from history so it doesn't linger.
				await chrome.downloads.erase({id: downloadItem.id});
			} catch(error) {
				// Download may already be gone.
			}
		}
	}).finally(() => {
		try {
			suggest();
		} catch(error) {
			// Ignored: the download was cancelled.
		}
	});
	return true; // suggest() is called asynchronously
});
