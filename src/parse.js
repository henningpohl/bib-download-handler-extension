const {Cite, plugins} = require('@citation-js/core')
require('@citation-js/plugin-ris')
require('@citation-js/plugin-bibtex')
require('@citation-js/plugin-csl')
require('@citation-js/plugin-enw')
require('@citation-js/plugin-refworks')
const {ACCEPTED_TEXT_TYPES, ACCEPTED_JSON_TYPES} = require('./formats.js')

function tryParseJson(content) {
	try {
		return JSON.parse(content);
	} catch(error) {
		return undefined;
	}
}

// Parses a downloaded citation file. Returns a Cite instance with at least one
// entry, or undefined if the content is not in an accepted format.
function parseCitationFile(content) {
	const text = String(content).replace(/^﻿/, '').trim();
	if(!text) {
		return undefined;
	}

	let input = text;
	let type;
	const json = (text.startsWith('{') || text.startsWith('[')) ? tryParseJson(text) : undefined;
	if(json !== undefined) {
		type = plugins.input.type(json);
		if(!ACCEPTED_JSON_TYPES.includes(type)) {
			return undefined;
		}
		input = json;
	} else {
		type = plugins.input.type(text);
		if(!ACCEPTED_TEXT_TYPES.includes(type)) {
			return undefined;
		}
	}

	try {
		const cite = new Cite(input, {forceType: type});
		return cite.data.length > 0 ? cite : undefined;
	} catch(error) {
		return undefined;
	}
}

module.exports = {parseCitationFile};
