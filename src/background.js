const {Cite} = require('@citation-js/core')
require('@citation-js/plugin-ris')
require('@citation-js/plugin-bibtex')
require('@citation-js/plugin-csl')


function writeToClipboard(text) {
	navigator.clipboard.writeText(text),then(() => {
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
	}).then(async (res) => {
		if(res) {
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

chrome.downloads.onCreated.addListener((downloadItem) => {
	if(interceptedMimeTypes.includes(downloadItem.mime)) {
		chrome.downloads.pause(downloadItem.id);
		fetch(downloadItem.finalUrl, {"referrer": downloadItem.referrer}).then(r => r.text()).then(result => {
			handleFile(result).then((res) => {
				if(res) {
					chrome.downloads.cancel(downloadItem.id);
				} else {
					chrome.downloads.resume(downloadItem.id);
				}
			});
		});
	}
});