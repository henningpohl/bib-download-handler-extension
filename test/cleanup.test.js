const assert = require('assert');
const {Cite} = require('@citation-js/core');
require('@citation-js/plugin-ris');
require('@citation-js/plugin-bibtex');
const {normalizeDoi, cleanEntries, formatEntries, DEFAULT_OPTIONS} = require('../src/cleanup.js');

function clean(input, options = {}) {
	const entries = new Cite(input).format('bibtex', {format: 'object'});
	return cleanEntries(entries, {...DEFAULT_OPTIONS, ...options})[0].properties;
}

const ris = `TY  - JOUR
AU  - Doe, Jane
TI  - A Test Paper
JO  - Journal of Things
PY  - 2020
DO  - https://doi.org/10.1145/1234.5678
UR  - https://doi.org/10.1145/1234.5678
ER  -
`;

const bib = `@article{x, title={Hello}, author={Doe, Jane}, year={2021},
	doi={http://dx.doi.org/10.1/ABC}, url={https://dl.acm.org/doi/10.1/abc}}`;

describe('normalizeDoi', () => {
	it('strips resolver and scheme prefixes', () => {
		assert.strictEqual(normalizeDoi('https://doi.org/10.1/x'), '10.1/x');
		assert.strictEqual(normalizeDoi('http://dx.doi.org/10.1/x'), '10.1/x');
		assert.strictEqual(normalizeDoi('doi: 10.1/x'), '10.1/x');
		assert.strictEqual(normalizeDoi('https://doi.org/10.1/a%2Fb'), '10.1/a/b');
		assert.strictEqual(normalizeDoi('10.1/x'), '10.1/x');
	});
});

describe('cleanEntries', () => {
	it('removes doi.org url and duplicated howpublished by default', () => {
		const props = clean(ris);
		assert.strictEqual(props.doi, '10.1145/1234.5678');
		assert.strictEqual(props.url, undefined);
		assert.strictEqual(props.howpublished, undefined);
		assert.strictEqual(props.author, 'Doe, Jane');
	});

	it('removes publisher urls containing the doi by default', () => {
		assert.strictEqual(clean(bib).doi, '10.1/ABC');
		assert.strictEqual(clean(bib).url, undefined);
		assert.strictEqual(clean(bib, {removePublisherDoiUrls: false}).url, 'https://dl.acm.org/doi/10.1/abc');
	});

	it('removes any url when a DOI is present, if enabled', () => {
		const other = `@article{y, title={T}, author={Doe, Jane}, year={2021}, doi={10.1/abc}, url={https://example.org/landing/42}}`;
		assert.strictEqual(clean(other).url, 'https://example.org/landing/42');
		assert.strictEqual(clean(other, {removeUrlWithDoi: true}).url, undefined);
		assert.strictEqual(clean(other, {removeUrlWithDoi: true}).doi, '10.1/abc');
		const noDoi = `@article{z, title={T}, author={Doe, Jane}, year={2021}, url={https://example.org/landing/42}}`;
		assert.strictEqual(clean(noDoi, {removeUrlWithDoi: true}).url, 'https://example.org/landing/42');
	});

	it('enables all DOI cleanup and keeps the original key by default', () => {
		assert.strictEqual(DEFAULT_OPTIONS.normalizeDoi, true);
		assert.strictEqual(DEFAULT_OPTIONS.removeDoiResolverUrls, true);
		assert.strictEqual(DEFAULT_OPTIONS.removePublisherDoiUrls, true);
		assert.strictEqual(DEFAULT_OPTIONS.removeHowpublishedUrl, true);
		assert.strictEqual(DEFAULT_OPTIONS.citationKey, 'original');
	});

	it('keeps everything when options are off', () => {
		const props = clean(ris, {normalizeDoi: false, removeDoiResolverUrls: false, removePublisherDoiUrls: false, removeHowpublishedUrl: false});
		assert.strictEqual(props.doi, '10.1145/1234.5678'); // citation-js already strips RIS prefixes
		assert.strictEqual(props.url, 'https://doi.org/10.1145/1234.5678');
		assert.strictEqual(props.howpublished, 'https://doi.org/10.1145/1234.5678');
	});

	it('omits configured fields case-insensitively', () => {
		const props = clean(bib, {omitFields: ['URL', ' title ']});
		assert.strictEqual(props.url, undefined);
		assert.strictEqual(props.title, undefined);
		assert.strictEqual(props.author, 'Doe, Jane');
	});
});

describe('citation keys', () => {
	const entry = (properties, label = 'orig') => ({type: 'article', label, properties});
	const key = (props, mode) => cleanEntries([entry(props)], {citationKey: mode})[0].label;
	const base = {
		author: 'Lindqvist, Astrid and Okafor, Chidi',
		year: '2023',
		title: 'On the Acoustic Signatures of Teacups',
		doi: 'https://doi.org/10.5555/jik.2023.0042'
	};

	it('keeps the original key by default', () => {
		assert.strictEqual(cleanEntries([entry(base)])[0].label, 'orig');
	});

	it('uses the DOI without prefix', () => {
		assert.strictEqual(key(base, 'doi'), '10.5555/jik.2023.0042');
		assert.strictEqual(key({...base, doi: '10.1002/(SICI)1097-4636'}, 'doi'), '10.1002/SICI1097-4636');
	});

	it('builds author-year keys', () => {
		assert.strictEqual(key(base, 'authorYear'), 'Lindqvist2023');
		assert.strictEqual(key(base, 'authorYearTitle'), 'Lindqvist2023Acoustic');
	});

	it('handles name forms, accents and particles', () => {
		assert.strictEqual(key({...base, author: 'Astrid Lindqvist and Chidi Okafor'}, 'authorYear'), 'Lindqvist2023');
		assert.strictEqual(key({...base, author: 'M{\\"u}ller, Hans'}, 'authorYear'), 'Muller2023');
		assert.strictEqual(key({...base, author: 'Müller, Hans'}, 'authorYear'), 'Muller2023');
		assert.strictEqual(key({...base, author: 'van der Berg, Jan'}, 'authorYear'), 'vanderBerg2023');
		assert.strictEqual(key({...base, author: '{World Health Organization}'}, 'authorYear'), 'WorldHealthOrganization2023');
	});

	it('skips stopwords and LaTeX in the title word', () => {
		assert.strictEqual(key({...base, title: 'The {\\emph{Teacup}} Problem'}, 'authorYearTitle'), 'Lindqvist2023Teacup');
		assert.strictEqual(key({...base, title: 'towards better kettles'}, 'authorYearTitle'), 'Lindqvist2023Better');
	});

	it('uses the editor or no year when needed', () => {
		assert.strictEqual(key({editor: 'Okafor, Chidi', year: '2020'}, 'authorYear'), 'Okafor2020');
		assert.strictEqual(key({author: 'Okafor, Chidi'}, 'authorYear'), 'Okafor');
	});

	it('falls back to the original key', () => {
		assert.strictEqual(key({title: 'x'}, 'doi'), 'orig');
		assert.strictEqual(key({title: 'x', year: '2020'}, 'authorYearTitle'), 'orig');
	});

	it('still uses fields that are omitted from the output', () => {
		const cleaned = cleanEntries([entry(base)], {citationKey: 'authorYearTitle', omitFields: ['title', 'doi']})[0];
		assert.strictEqual(cleaned.label, 'Lindqvist2023Acoustic');
		assert.strictEqual(cleaned.properties.title, undefined);
	});

	it('works on citation-js output', () => {
		assert.strictEqual(new Cite(ris).format('bibtex', {format: 'object'}).map(e => cleanEntries([e], {citationKey: 'authorYearTitle'})[0].label)[0], 'Doe2020Test');
	});
});

describe('title formatting', () => {
	const title = (t, mode) => cleanEntries([{type: 'article', label: 'k', properties: {title: t}}], {titleFormat: mode})[0].properties.title;
	const downloaded = 'Acoustic signatures of migrating teacups in shared office kitchens: a {GPU}-based analysis';

	it('keeps the title as downloaded by default', () => {
		assert.strictEqual(cleanEntries([{type: 'article', label: 'k', properties: {title: downloaded}}])[0].properties.title, downloaded);
	});

	it('wraps the whole title in braces', () => {
		assert.strictEqual(title(downloaded, 'protect'), '{Acoustic signatures of migrating teacups in shared office kitchens: a GPU-based analysis}');
		assert.strictEqual(title('{Already Protected}', 'protect'), '{Already Protected}');
		assert.strictEqual(title('Teacups \\emph{in vivo} by M{\\" u}ller', 'protect'), '{Teacups \\emph{in vivo} by M{\\" u}ller}');
	});

	it('converts to title case', () => {
		assert.strictEqual(title(downloaded, 'titleCase'), 'Acoustic Signatures of Migrating Teacups in Shared Office Kitchens: A {GPU}-Based Analysis');
		assert.strictEqual(title('what is the kettle for?', 'titleCase'), 'What Is the Kettle For?');
		assert.strictEqual(title('iPhone use in a study of 3D printing', 'titleCase'), '{iPhone} Use in a Study of {3D} Printing');
		assert.strictEqual(title('"quoted" words and (parentheses)', 'titleCase'), '"Quoted" Words and (Parentheses)');
	});

	it('lowercases ALL-CAPS titles before title casing', () => {
		assert.strictEqual(title('ACOUSTIC {SIGNATURES} {OF} {TEACUPS}', 'titleCase'), 'Acoustic Signatures of Teacups');
	});

	it('leaves LaTeX commands and accents alone in title case', () => {
		assert.strictEqual(title('teacups \\emph{in vivo}: on M{\\" u}ller', 'titleCase'), 'Teacups \\emph{in vivo}: On M{\\" u}ller');
	});

	it('works on citation-js output', () => {
		const t = new Cite(`TY  - JOUR\nTI  - the GPU in the kitchen\nPY  - 2020\nER  - \n`).format('bibtex', {format: 'object'})[0];
		assert.strictEqual(cleanEntries([t], {titleFormat: 'titleCase'})[0].properties.title, 'The {GPU} in the Kitchen');
		assert.strictEqual(cleanEntries([t], {titleFormat: 'protect'})[0].properties.title, '{the GPU in the kitchen}');
	});
});

describe('formatEntries', () => {
	const entry = [{type: 'misc', label: 'k', properties: {title: 'T'}}];

	it('indents with a tab by default', () => {
		assert.strictEqual(formatEntries(entry), '@misc{k,\n\ttitle = {T},\n}\n');
	});

	it('ignores indent settings unless custom indentation is enabled', () => {
		assert.strictEqual(formatEntries(entry, {indentType: 'space', indentSize: 2}), '@misc{k,\n\ttitle = {T},\n}\n');
	});

	it('supports spaces and counts', () => {
		const opts = (o) => ({customIndent: true, ...o});
		assert.strictEqual(formatEntries(entry, opts({indentType: 'space', indentSize: 2})), '@misc{k,\n  title = {T},\n}\n');
		assert.strictEqual(formatEntries(entry, opts({indentType: 'tab', indentSize: 2})), '@misc{k,\n\t\ttitle = {T},\n}\n');
		assert.strictEqual(formatEntries(entry, opts({indentType: 'space', indentSize: 0})), '@misc{k,\ntitle = {T},\n}\n');
	});

	it('clamps invalid sizes', () => {
		const opts = (o) => ({customIndent: true, ...o});
		assert.strictEqual(formatEntries(entry, opts({indentType: 'space', indentSize: 99})), `@misc{k,\n${' '.repeat(8)}title = {T},\n}\n`);
		assert.strictEqual(formatEntries(entry, opts({indentType: 'space', indentSize: 'x'})), '@misc{k,\n title = {T},\n}\n');
	});

	it('produces bibtex that citation-js can read back', () => {
		const entries = cleanEntries(new Cite(bib).format('bibtex', {format: 'object'}), DEFAULT_OPTIONS);
		const text = formatEntries(entries);
		assert.ok(text.startsWith('@article{x,\n\t'));
		assert.strictEqual(new Cite(text).data[0].DOI, '10.1/ABC');
	});
});
