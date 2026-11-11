import tseslint from 'typescript-eslint';

/**
 * Lint rules that hold the house rules a linter can see (CLAUDE.md,
 * docs/contributing.md). Not the recommended sets: type errors are tsc's
 * (`npm run typecheck`, `npm run typecheck:tests`), and each rule here is a
 * stated rule, so a finding is a defect rather than a style debate.
 * `./scripts/dev.sh vet` (and dev.ps1) runs it as `npm run lint`.
 *
 * The parser is typescript-eslint's, without type information, for the .ts
 * and the .js/.mjs files alike.
 */

/** Console output skips the logger's level filter and its component tag. */
const NO_CONSOLE = {
    object: 'console',
    message: 'Log through logger.withTag(<component>) from src/core/logger.ts: the console skips the level filter and the component tag.',
};

/** Module code reaches only its own container (Architecture Anchors 3). */
const NO_GET_BY_ID = {
    object: 'document',
    property: 'getElementById',
    message: "Scope DOM lookups to the module's container; required() for the elements it owns (CLAUDE.md, DOM Access).",
};

export default [
    {
        files: ['src/**/*.{ts,js}', 'tests/**/*.ts', 'scripts/**/*.mjs', '*.config.{ts,mjs}'],
        languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
        plugins: { '@typescript-eslint': tseslint.plugin },
        linterOptions: { reportUnusedDisableDirectives: 'error' },
        rules: {
            // Dead code hides intent and drifts. A leading _ marks a parameter
            // kept for its position.
            '@typescript-eslint/no-unused-vars': ['error', {
                args: 'after-used',
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrors: 'none',
                ignoreRestSiblings: true,
            }],
        },
    },
    {
        files: ['src/**/*.{ts,js}'],
        rules: {
            // A blocking browser dialog: use the app's toast or modal.
            'no-alert': 'error',
            'no-restricted-properties': ['error', NO_GET_BY_ID, NO_CONSOLE],
            // An SDK error carries its reason in .message, a session event in
            // .infoStr; `e.message || fallback` drops the second, which is how
            // one module showed the broker's reason while another showed a
            // generic fallback for the same failure. solaceErrorText(e, fallback)
            // (src/core/utils.ts) reads both.
            'no-restricted-syntax': ['error',
                {
                    selector: "LogicalExpression[operator='||'][left.type='MemberExpression'][left.property.name='message']",
                    message: 'Use solaceErrorText(e, fallback) from src/core/utils.ts: `e.message || fallback` drops an SDK event\'s .infoStr.',
                },
                {
                    selector: "LogicalExpression[operator='||'][left.type='ChainExpression'][left.expression.property.name='message']",
                    message: 'Use solaceErrorText(e, fallback) from src/core/utils.ts: `e?.message || fallback` drops an SDK event\'s .infoStr.',
                },
            ],
        },
    },
    {
        // The shell, not a module: it owns the page around the module
        // containers (the sidebar, the status bar, the toast stack; the demo's
        // banner).
        files: ['src/core/kernel.ts', 'src/core/toast.ts', 'src/mock-broker/shell.ts'],
        rules: { 'no-restricted-properties': ['error', NO_CONSOLE] },
    },
    {
        // The one place that writes to the console. (src/index.html's inline
        // script is not linted: ESLint reads no HTML here.)
        files: ['src/core/logger.ts'],
        rules: { 'no-restricted-properties': ['error', NO_GET_BY_ID] },
    },
];
