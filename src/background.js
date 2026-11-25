const {Cite} = require('@citation-js/core')
require('@citation-js/plugin-ris')
require('@citation-js/plugin-bibtex')
require('@citation-js/plugin-csl')


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

function parseContent(content) {
	try {
		return new Cite(content);
	} catch(error) {
		return undefined;
	}
}

async function handleFile(content) {
	let parsed = parseContent(content);
	if(parsed === undefined) {
		await chrome.notifications.create("", {
			type: "basic",
			title: chrome.i18n.getMessage("bibParseFailNotificationTitle"),
			message: chrome.i18n.getMessage("bibParseFailNotificationMessage"),
			iconUrl: "assets/img/128x128.png"
		});
		return false;
	}
	
	if(parsed.data.length == 0) {
		await chrome.notifications.create("", {
			type: "basic",
			title: chrome.i18n.getMessage("bibParseFailNotificationTitle"),
			message: chrome.i18n.getMessage("bibParseFailNotificationMessage"),
			iconUrl: "assets/img/128x128.png"
		});
		return false;
	}
	
	return chrome.scripting.executeScript({
		target: {tabId : await getTab()},
		func: writeToClipboard,
		args: [parsed.format('bibtex')]
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

let interceptedMimeTypes = [
	"application/x-research-info-systems",
	"application/x-bibtex",
	"application/vnd.citationstyles.style+xml"
];

// Downloads older than this are not intercepted. On startup, Chrome fires
// onCreated for entries loaded from the download history.
const MAX_DOWNLOAD_AGE_MS = 10000;

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

chrome.downloads.onCreated.addListener((downloadItem) => {
	if(!isNewDownload(downloadItem)) {
		return;
	}

	if(interceptedMimeTypes.includes(downloadItem.mime)) {
		chrome.downloads.pause(downloadItem.id);
		fetch(downloadItem.finalUrl, {"referrer": downloadItem.referrer})
			.then(r => {
				if(!r.ok) {
					throw new Error(`HTTP ${r.status}`);
				}
				return r.text();
			})
			.then(result => handleFile(result))
			.then(async (res) => {
				if(res) {
					await chrome.downloads.cancel(downloadItem.id);
					// Remove the cancelled entry from history so it doesn't linger.
					await chrome.downloads.erase({id: downloadItem.id});
				} else {
					await chrome.downloads.resume(downloadItem.id);
				}
			})
			.catch(() => {
				chrome.downloads.resume(downloadItem.id).catch(() => {});
			});
	}
});