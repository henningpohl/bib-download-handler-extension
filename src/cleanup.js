// Cleanup rules applied to BibTeX entries before they are copied.
// Entries use citation-js' object format: {type, label, properties: {field: value}}.

const DOI_RESOLVER = /^(?:https?:\/\/)?(?:dx\.|www\.)?doi\.org\//i;
const DOI_SCHEME = /^doi:\s*/i;

function safeDecode(value) {
	try {
		return decodeURIComponent(value);
	} catch(error) {
		return value;
	}
}

// "https://doi.org/10.1145/123" / "doi:10.1145/123" -> "10.1145/123"
function normalizeDoi(value) {
	let doi = String(value).trim();
	doi = doi.replace(DOI_RESOLVER, '').replace(DOI_SCHEME, '');
	return safeDecode(doi).trim();
}

function canonicalUrl(url) {
	return safeDecode(String(url).trim()).replace(/\/+$/, '').toLowerCase();
}

// URL is a doi.org link that resolves to the given DOI.
function isDoiResolverUrl(url, doi) {
	const value = canonicalUrl(url);
	if(!DOI_RESOLVER.test(value)) {
		return false;
	}
	return value.replace(DOI_RESOLVER, '') === doi.toLowerCase();
}

// URL is any link that ends in the DOI, e.g. https://dl.acm.org/doi/10.1145/123.
function urlEndsWithDoi(url, doi) {
	return canonicalUrl(url).endsWith('/' + doi.toLowerCase());
}

const DEFAULT_OPTIONS = {
	normalizeDoi: true,
	removeDoiResolverUrls: true,
	removePublisherDoiUrls: true,
	removeHowpublishedUrl: true,
	removeUrlWithDoi: false, // drop url whenever a DOI is present, whatever it points to
	omitFields: ['abstract', 'keywords', 'file'],
	customIndent: false, // when off, entries are indented with a single tab
	indentType: 'tab', // 'tab' or 'space'
	indentSize: 1,
	citationKey: 'original', // 'original', 'doi', 'authorYear' or 'authorYearTitle'
	titleFormat: 'asIs' // 'asIs', 'titleCase' or 'protect'
};

// Braces around plain text, e.g. {GPU}, but not command arguments like \emph{x}
// or accents like {\"u}.
const SIMPLE_BRACES = /(?<!\\[A-Za-z]*)\{([^{}\\]*)\}/g;

function unwrapSimpleBraces(text) {
	let previous;
	do {
		previous = text;
		text = text.replace(SIMPLE_BRACES, '$1');
	} while(text !== previous);
	return text;
}

// Wraps the whole title in braces so BibTeX styles keep its capitalization.
function protectTitle(title) {
	return `{${unwrapSimpleBraces(String(title)).trim()}}`;
}

// Words kept lowercase in title case unless first, last or after a colon.
const MINOR_WORDS = new Set([
	'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'as', 'at', 'by', 'in',
	'of', 'off', 'on', 'per', 'to', 'up', 'via', 'vs', 'from', 'into', 'onto', 'with', 'over'
]);

function titleCaseWord(word, isEdge, lowerFirst) {
	if(!word) {
		return word;
	}
	if(lowerFirst) {
		word = word.toLowerCase();
	}
	// Acronyms and mixed case (GPU, iPhone, 3D) keep their case and get protected.
	if(/[A-Z]/.test(word.slice(1)) || /\d/.test(word)) {
		return `{${word}}`;
	}
	if(!isEdge && MINOR_WORDS.has(word.toLowerCase())) {
		return word.toLowerCase();
	}
	return word.charAt(0).toUpperCase() + word.slice(1);
}

// "Acoustic signatures of teacups: a {GPU}-based analysis"
//   -> "Acoustic Signatures of Teacups: A {GPU}-Based Analysis"
function titleCase(title) {
	const text = unwrapSimpleBraces(String(title)).trim();
	// ALL-CAPS titles are treated as lowercase (acronyms cannot be told apart).
	const allCaps = !/[a-z]/.test(plainText(text)) && /[A-Z]/.test(text);
	const tokens = text.split(/(\s+)/);
	const wordCount = tokens.filter(t => t && !/^\s+$/.test(t)).length;
	let wordIndex = 0;
	let afterBreak = true;
	return tokens.map(token => {
		if(!token || /^\s+$/.test(token)) {
			return token;
		}
		const isFirst = afterBreak;
		const isLast = wordIndex === wordCount - 1;
		wordIndex++;
		afterBreak = /[:?!.]["')\]]*$/.test(token);
		// Leave LaTeX commands and braced groups untouched.
		if(/[\\{}$]/.test(token)) {
			return token;
		}
		const [, lead, core, trail] = token.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/);
		const parts = core.split(/([-/])/);
		const cased = parts.map((part, i) => {
			if(part === '-' || part === '/') {
				return part;
			}
			return titleCaseWord(part, (isFirst && i === 0) || (isLast && i === parts.length - 1), allCaps);
		});
		return lead + cased.join('') + trail;
	}).join('');
}

function formatTitle(title, mode) {
	if(mode === 'titleCase') {
		return titleCase(title);
	}
	if(mode === 'protect') {
		return protectTitle(title);
	}
	return title;
}

const MAX_INDENT = 8;

// Words skipped when picking a title word for the citation key.
const TITLE_STOPWORDS = new Set([
	'a', 'an', 'the', 'and', 'or', 'but', 'nor', 'of', 'on', 'in', 'at', 'to', 'for', 'from',
	'by', 'with', 'without', 'into', 'onto', 'over', 'under', 'via', 'about', 'as', 'is', 'are',
	'be', 'its', 'it', 'this', 'that', 'these', 'those', 'how', 'what', 'why', 'when', 'where',
	'which', 'who', 'do', 'does', 'can', 'we', 'our', 'your', 'not', 'no', 'toward', 'towards',
	'using', 'between', 'through', 'beyond', 'versus', 'vs'
]);

// Turn a BibTeX value (possibly with LaTeX accents and braces) into plain ASCII letters/digits.
function plainText(value) {
	return String(value)
		.replace(/\\[a-zA-Z]+\s*/g, '') // \textbraceleft, \emph, ...
		.replace(/\\./g, '') // \" \' \~ ...
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[{}]/g, '');
}

function keyPart(value) {
	return plainText(value).replace(/[^A-Za-z0-9]/g, '');
}

// "Lindqvist, Astrid and Okafor, Chidi" -> "Lindqvist"; "Astrid Lindqvist" -> "Lindqvist"
function firstAuthorLastName(names) {
	if(!names) {
		return '';
	}
	const first = String(names).split(/\s+and\s+/i)[0].trim();
	if(first.includes(',')) {
		return keyPart(first.split(',')[0]);
	}
	// "First Last" form; braced names like {World Health Organization} are kept whole.
	if(/^\{.*\}$/.test(first)) {
		return keyPart(first);
	}
	const words = first.split(/\s+/);
	return keyPart(words[words.length - 1]);
}

function firstTitleWord(title) {
	if(!title) {
		return '';
	}
	const words = plainText(title).split(/[^A-Za-z0-9]+/).filter(Boolean);
	const word = words.find(w => !TITLE_STOPWORDS.has(w.toLowerCase())) || words[0] || '';
	return word.charAt(0).toUpperCase() + word.slice(1);
}

// Characters BibTeX/biber do not accept in keys.
function sanitizeKey(key) {
	return key.replace(/[\s,{}()%#~\\"'=]/g, '');
}

function citationKey(entry, mode) {
	const props = entry.properties;
	let key = '';
	if(mode === 'doi') {
		key = props.doi ? normalizeDoi(props.doi) : '';
	} else if(mode === 'authorYear' || mode === 'authorYearTitle') {
		const author = firstAuthorLastName(props.author || props.editor);
		const year = keyPart(props.year || '');
		if(author) {
			key = author + year;
			if(mode === 'authorYearTitle') {
				key += firstTitleWord(props.title);
			}
		}
	}
	key = sanitizeKey(key);
	return key || entry.label;
}

function indentString(options) {
	const opts = {...DEFAULT_OPTIONS, ...options};
	if(!opts.customIndent) {
		return '\t';
	}
	let size = parseInt(opts.indentSize, 10);
	if(Number.isNaN(size)) {
		size = DEFAULT_OPTIONS.indentSize;
	}
	size = Math.min(Math.max(size, 0), MAX_INDENT);
	return (opts.indentType === 'space' ? ' ' : '\t').repeat(size);
}

function cleanEntry(entry, options) {
	const opts = {...DEFAULT_OPTIONS, ...options};
	const props = {...entry.properties};
	const originalUrl = props.url;

	if(props.doi !== undefined) {
		if(opts.normalizeDoi) {
			props.doi = normalizeDoi(props.doi);
		}
	}

	// citation-js copies the URL into howpublished; drop that copy.
	if(opts.removeHowpublishedUrl && props.howpublished !== undefined && originalUrl !== undefined
		&& canonicalUrl(props.howpublished) === canonicalUrl(originalUrl)) {
		delete props.howpublished;
	}

	if(props.doi && (opts.removeDoiResolverUrls || opts.removePublisherDoiUrls)) {
		const doi = normalizeDoi(props.doi);
		const repeatsDoi = (url) =>
			(opts.removeDoiResolverUrls && isDoiResolverUrl(url, doi))
			|| (opts.removePublisherDoiUrls && urlEndsWithDoi(url, doi));
		for(const field of ['url', 'howpublished']) {
			if(props[field] !== undefined && repeatsDoi(props[field])) {
				delete props[field];
			}
		}
	}

	if(props.title !== undefined) {
		props.title = formatTitle(props.title, opts.titleFormat);
	}

	if(opts.removeUrlWithDoi && props.doi && normalizeDoi(props.doi)) {
		delete props.url;
	}

	const omit = new Set((opts.omitFields || []).map(f => f.trim().toLowerCase()).filter(Boolean));
	for(const field of Object.keys(props)) {
		if(omit.has(field.toLowerCase())) {
			delete props[field];
		}
	}

	// The key is built from the original fields, so omitted fields can still contribute.
	return {...entry, label: citationKey(entry, opts.citationKey), properties: props};
}

function cleanEntries(entries, options) {
	return entries.map(entry => cleanEntry(entry, options));
}

function formatEntries(entries, options) {
	const indent = indentString(options);
	return entries.map(entry => {
		const fields = Object.entries(entry.properties)
			.map(([field, value]) => `${indent}${field} = {${value}},`);
		return `@${entry.type}{${entry.label},\n${fields.join('\n')}\n}\n`;
	}).join('\n');
}

module.exports = {
	DEFAULT_OPTIONS,
	MAX_INDENT,
	indentString,
	citationKey,
	titleCase,
	protectTitle,
	normalizeDoi,
	isDoiResolverUrl,
	urlEndsWithDoi,
	cleanEntry,
	cleanEntries,
	formatEntries
};
