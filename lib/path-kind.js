// What a repository path is, in one place.
//
// Two policies ask the same question with different answers: coverage.js ignores folders that show
// how to use a package (examples, tests, docs, benchmarks), while r5.js also ignores tooling
// (configs, build scripts, dotfiles, hidden folders). Keeping both here makes the difference explicit
// instead of leaving two regexes to drift apart.
//
// Segment based and case insensitive on purpose: a folder called "src-test" is source, not a test
// folder, and "Tests/" must not slip through because of its capital letter. Paths arrive in the GitHub
// tree form, separated by "/". A backslash path is not split into segments, so the folder rules never
// match it, and the file-name rules match it loosely, because their [^/]* parts cross backslashes.

// Their imports say nothing about what the package needs.
const NON_SOURCE = new Set([
  'example', 'examples', 'demo', 'demos', 'test', 'tests', '__tests__',
  'fixtures', 'docs', 'benchmark', 'benchmarks', 'benches', 'bench', '@types',
]);

// The wider set: nothing here ends up in the published package.
const NON_SHIPPED = new Set([
  'test', 'tests', '__tests__', '__benchmarks__', '__performance_tests__', 'spec', 'e2e',
  'fixtures', 'example', 'examples', 'demo', 'demos', 'benchmark', 'benchmarks', 'benches', 'bench',
  'doc', 'docs', 'scripts', 'tools',
]);

// Build and test configuration by file name: gulpfile, Herebyfile, Makefile, *.config.*, .*rc*,
// test.js, *.setup.*, *.jest.*, *.fatherrc.*, *.dumirc.*.
const CONFIG_FILE = /(^|\/)(?:gulpfile\.[cm]?[jt]s|gruntfile\.[cm]?[jt]s|herebyfile\.[cm]?[jt]s|makefile(?:\.[a-z]+)?\.[cm]?[jt]s|makefile|[^/]*\.(?:config|workspace)\.[^/]*\.[cm]?[jt]s|[^/]*\.(?:config|workspace)\.[cm]?[jt]s|[^/]*\.(?:test|spec)\.[cm]?[jt]s|\.[^/]*rc(?:\.[^/]*)?\.[cm]?[jt]s|test\.[cm]?[jt]s|[^/]*\.setup\.[cm]?[jt]s|[^/]*\.jest\.[^/]*\.[cm]?[jt]s|[^/]*\.jest\.[cm]?[jt]s|[^/]*\.fatherrc\.[cm]?[jt]s|[^/]*\.dumirc\.[cm]?[jt]s)$/i;

// A .test-d.ts file checks the published types; it does not ship and it is not a dependency.
const TYPE_TEST = /\.test-d\.[cm]?[jt]s$/i;

// Test-runner configuration by file name: karma.conf.js, jest.preset.js, jest-setup.js,
// vitest-setup-client.ts, nightwatch.conf.js. Kept apart from CONFIG_FILE on purpose: coverage reads
// config files by design and the env var verifier treats them as unverifiable, while only the drop rule
// needs to know that these are tooling. Measured on 1165 repositories: 22 such files.
const TOOLING_FILE = /(^|\/)(?:karma|jest|mocha|vitest|ava|wdio|nightwatch|protractor)[.-](?:conf|config|preset|setup)[^/]*\.[cm]?[jt]s$/i;

const folders = (file) => String(file ?? '').toLowerCase().split('/').slice(0, -1);
// Control characters never appear in a GitHub path, but stripping them keeps a hostile string from
// dodging the config rule: "jest.config.js\u0000" would otherwise not match the anchor and count as
// shipped source.
const clean = (file) => String(file ?? '').replace(/[\u0000-\u001F\u007F]/g, '');
const hasFolder = (file, set) => folders(clean(file)).some((s) => set.has(s));

// A folder whose name starts with a dot is tooling: .dumi is a docs build, .storybook a preview
// harness, .github CI actions. A dotfile such as .eslintrc.js is a file, so this predicate ignores it.
export const isHiddenFolder = (file) => folders(clean(file)).some((s) => s.length > 1 && s.startsWith('.'));

// A dotfile is tooling even when its name is not a known config pattern: .size-limit.ts and
// .markdown-doctest-setup.js are build configs, and both were reported as shipped source until the
// frozen corpus showed their imports. Not anchored to the root, because a workspace has its own root
// and packages/ui/.size-limit.ts is the same kind of file. The module answers "could this be package
// code", which for a dotfile is no; publication is a different question, and npm does pack dotfiles.
// A package whose entry point is a dotfile would be misclassified: main, bin and exports are not read.
const TOOLING_DOTFILE = /(^|\/)\.[^/]+$/;

// True when the file sits in a folder that only demonstrates or tests the package.
export const isNonSourceImportSite = (file) => hasFolder(file, NON_SOURCE);

// True when the file could end up in the published package.
export const isShippedSource = (file) => {
  const p = clean(file);
  return !TOOLING_DOTFILE.test(p) && !isHiddenFolder(p) && !CONFIG_FILE.test(p) && !TOOLING_FILE.test(p)
    && !hasFolder(p, NON_SHIPPED);
};

export const isConfigFile = (file) => CONFIG_FILE.test(clean(file));
export const isTypeTest = (file) => TYPE_TEST.test(clean(file));
