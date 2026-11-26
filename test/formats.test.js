const assert = require('assert');
const {detectFormat} = require('../src/formats.js');

describe('detectFormat', () => {
	it('recognizes MIME types, ignoring case and parameters', () => {
		assert.strictEqual(detectFormat({mime: 'application/x-bibtex'}), 'bibtex');
		assert.strictEqual(detectFormat({mime: 'text/x-bibtex; charset=utf-8'}), 'bibtex');
		assert.strictEqual(detectFormat({mime: 'Application/X-Research-Info-Systems'}), 'ris');
		assert.strictEqual(detectFormat({mime: 'application/x-endnote-refer'}), 'endnote');
		assert.strictEqual(detectFormat({mime: 'application/vnd.citationstyles.csl+json'}), 'csljson');
	});

	it('falls back to the suggested file name for generic MIME types', () => {
		assert.strictEqual(detectFormat({mime: 'application/octet-stream', filename: 'citation.bib'}), 'bibtex');
		assert.strictEqual(detectFormat({mime: 'text/plain', filename: 'C:\\Users\\x\\Downloads\\S0123.RIS'}), 'ris');
		assert.strictEqual(detectFormat({mime: 'text/plain', filename: 'export.enw'}), 'endnote');
		assert.strictEqual(detectFormat({mime: 'application/json', filename: 'refs.csl.json'}), 'csljson');
	});

	it('falls back to the URL path', () => {
		assert.strictEqual(detectFormat({mime: 'application/octet-stream', url: 'https://example.org/export/paper.bib?download=1'}), 'bibtex');
		assert.strictEqual(detectFormat({mime: '', url: 'https://example.org/cite/123.ris'}), 'ris');
	});

	it('ignores everything else', () => {
		assert.strictEqual(detectFormat({mime: 'application/pdf', filename: 'paper.pdf'}), null);
		assert.strictEqual(detectFormat({mime: 'application/json', filename: 'data.json'}), null);
		assert.strictEqual(detectFormat({mime: 'text/plain', filename: 'notes.txt'}), null);
		assert.strictEqual(detectFormat({mime: 'application/vnd.citationstyles.style+xml', filename: 'apa.csl'}), null);
		assert.strictEqual(detectFormat({filename: 'bib'}), null);
		assert.strictEqual(detectFormat({url: 'data:text/plain,x.bib'}), null);
		assert.strictEqual(detectFormat(), null);
	});
});
