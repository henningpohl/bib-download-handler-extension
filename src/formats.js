// Which downloads count as citation files, and which parsed formats are accepted.

const FORMATS = {
	bibtex: {
		mimeTypes: ['application/x-bibtex', 'text/x-bibtex', 'application/x-bibtex-text-file', 'text/bibtex', 'application/bibtex'],
		extensions: ['bib', 'bibtex']
	},
	ris: {
		mimeTypes: ['application/x-research-info-systems', 'text/x-research-info-systems', 'application/x-ris', 'text/ris'],
		extensions: ['ris']
	},
	endnote: {
		mimeTypes: ['application/x-endnote-refer', 'text/x-endnote-refer', 'application/x-endnote'],
		extensions: ['enw']
	},
	csljson: {
		mimeTypes: ['application/vnd.citationstyles.csl+json'],
		// Plain .json is too broad to intercept.
		extensions: ['csl.json']
	}
};

function normalizeMime(mime) {
	return String(mime || '').split(';')[0].trim().toLowerCase();
}

function fileNameOf(value) {
	const name = String(value || '').split(/[\\/]/).pop();
	return name.split(/[?#]/)[0].toLowerCase();
}

function urlFileName(url) {
	try {
		const parsed = new URL(url);
		if(parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return '';
		}
		return fileNameOf(decodeURIComponent(parsed.pathname));
	} catch(error) {
		return '';
	}
}

function formatForFileName(name) {
	if(!name) {
		return null;
	}
	for(const [format, {extensions}] of Object.entries(FORMATS)) {
		if(extensions.some(ext => name.endsWith('.' + ext))) {
			return format;
		}
	}
	return null;
}

// Returns the format name for a download, or null if it is not a citation file.
// Uses the MIME type first, then the suggested file name, then the URL path.
function detectFormat({mime, filename, url} = {}) {
	const type = normalizeMime(mime);
	for(const [format, {mimeTypes}] of Object.entries(FORMATS)) {
		if(mimeTypes.includes(type)) {
			return format;
		}
	}
	return formatForFileName(fileNameOf(filename)) || formatForFileName(urlFileName(url));
}

// citation-js input types the extension accepts. Anything else (URLs, HTML,
// identifiers that would trigger network lookups) is rejected.
const ACCEPTED_TEXT_TYPES = ['@bibtex/text', '@biblatex/text', '@ris/file', '@enw/file', '@refworks/file'];
const ACCEPTED_JSON_TYPES = ['@csl/object', '@csl/list+object'];

module.exports = {FORMATS, normalizeMime, detectFormat, ACCEPTED_TEXT_TYPES, ACCEPTED_JSON_TYPES};
