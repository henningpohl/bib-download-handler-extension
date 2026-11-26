const {DEFAULT_OPTIONS, MAX_INDENT, cleanEntries, formatEntries} = require('./cleanup.js');
const {loadSettings, saveSettings} = require('./settings.js');

const CHECKBOXES = ['normalizeDoi', 'removeDoiResolverUrls', 'removePublisherDoiUrls', 'removeUrlWithDoi', 'removeHowpublishedUrl', 'customIndent'];

function updateIndentControls() {
	const enabled = document.getElementById('customIndent').checked;
	document.getElementById('indentType').disabled = !enabled;
	document.getElementById('indentSize').disabled = !enabled;
	document.querySelector('.indent').classList.toggle('disabled', !enabled);
}

// A made-up reference in the shape citation-js produces, with the kind of
// redundancy and extra fields the settings are meant to clean up.
const SAMPLE = [{
	type: 'article',
	label: 'jik.2023.0042',
	properties: {
		author: 'Lindqvist, Astrid and Okafor, Chidi and Brennan, Maeve',
		title: 'Acoustic signatures of migrating teacups in shared office kitchens: a {GPU}-based analysis',
		journal: 'Journal of Improbable Kitchenware',
		volume: '12',
		number: '3',
		pages: '45--67',
		year: '2023',
		publisher: 'Imaginary Academic Press',
		doi: 'https://doi.org/10.5555/jik.2023.0042',
		url: 'https://doi.org/10.5555/jik.2023.0042',
		howpublished: 'https://doi.org/10.5555/jik.2023.0042',
		abstract: 'We recorded 1,412 hours of audio in eleven office kitchens and show that teacups migrate between desks at night.',
		keywords: 'teacups, acoustics, office ecology',
		file: 'Lindqvist2023.pdf:Lindqvist2023.pdf:PDF'
	}
}];

function readForm() {
	const settings = {};
	for(const id of CHECKBOXES) {
		settings[id] = document.getElementById(id).checked;
	}
	settings.omitFields = document.getElementById('omitFields').value
		.split(',').map(f => f.trim()).filter(Boolean);
	settings.citationKey = document.getElementById('citationKey').value;
	settings.titleFormat = document.getElementById('titleFormat').value;
	settings.indentType = document.getElementById('indentType').value;
	const size = parseInt(document.getElementById('indentSize').value, 10);
	settings.indentSize = Number.isNaN(size) ? DEFAULT_OPTIONS.indentSize : Math.min(Math.max(size, 0), MAX_INDENT);
	return settings;
}

function writeForm(settings) {
	for(const id of CHECKBOXES) {
		document.getElementById(id).checked = !!settings[id];
	}
	document.getElementById('omitFields').value = (settings.omitFields || []).join(', ');
	document.getElementById('citationKey').value = settings.citationKey;
	document.getElementById('titleFormat').value = settings.titleFormat;
	document.getElementById('indentType').value = settings.indentType;
	document.getElementById('indentSize').value = settings.indentSize;
	updateIndentControls();
}

function describeChanges(beforeEntry, afterEntry) {
	const before = beforeEntry.properties;
	const after = afterEntry.properties;
	const removed = Object.keys(before).filter(field => !(field in after));
	const changed = Object.keys(after).filter(field => field in before && before[field] !== after[field]);
	if(beforeEntry.label !== afterEntry.label) {
		changed.unshift('key');
	}
	const parts = [];
	if(removed.length) {
		parts.push('Removed: ' + removed.join(', '));
	}
	if(changed.length) {
		parts.push('Changed: ' + changed.join(', '));
	}
	return parts.length ? parts.join(' · ') : 'No changes';
}

function updatePreview(settings) {
	const cleaned = cleanEntries(SAMPLE, settings);
	document.getElementById('preview').textContent = formatEntries(cleaned, settings);
	document.getElementById('previewChanges').textContent =
		describeChanges(SAMPLE[0], cleaned[0]);
}

let statusTimer;
function showStatus(text) {
	const status = document.getElementById('status');
	status.textContent = text;
	clearTimeout(statusTimer);
	statusTimer = setTimeout(() => { status.textContent = ''; }, 1500);
}

async function save() {
	const settings = readForm();
	updatePreview(settings);
	await saveSettings(settings);
	showStatus('Saved');
}

document.addEventListener('DOMContentLoaded', async () => {
	const settings = await loadSettings();
	writeForm(settings);
	updatePreview(settings);

	for(const id of CHECKBOXES) {
		document.getElementById(id).addEventListener('change', save);
	}
	document.getElementById('omitFields').addEventListener('input', () => updatePreview(readForm()));
	document.getElementById('omitFields').addEventListener('change', save);
	document.getElementById('customIndent').addEventListener('change', updateIndentControls);
	document.getElementById('citationKey').addEventListener('change', save);
	document.getElementById('titleFormat').addEventListener('change', save);
	document.getElementById('indentType').addEventListener('change', save);
	document.getElementById('indentSize').addEventListener('input', () => updatePreview(readForm()));
	document.getElementById('indentSize').addEventListener('change', async () => {
		await save();
		writeForm(readForm()); // show the clamped value
	});
	document.getElementById('reset').addEventListener('click', async () => {
		writeForm(DEFAULT_OPTIONS);
		await save();
	});
});
