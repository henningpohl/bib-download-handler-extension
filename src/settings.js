const {DEFAULT_OPTIONS} = require('./cleanup.js');

const STORAGE_KEY = 'cleanup';

async function loadSettings() {
	try {
		const stored = await chrome.storage.sync.get(STORAGE_KEY);
		return {...DEFAULT_OPTIONS, ...(stored[STORAGE_KEY] || {})};
	} catch(error) {
		return {...DEFAULT_OPTIONS};
	}
}

async function saveSettings(settings) {
	await chrome.storage.sync.set({[STORAGE_KEY]: settings});
}

module.exports = {STORAGE_KEY, loadSettings, saveSettings};
