module.exports = {
    env: {
        commonjs: true,
        es2021: true,
        node: true,
        jest: true, // Add jest environment for test files
    },
    extends: [
        'airbnb-base',
        'plugin:prettier/recommended', // Integrates Prettier, must be last
    ],
    parserOptions: {
        ecmaVersion: 12,
    },
    rules: {
        'prettier/prettier': 'warn', // Show Prettier issues as warnings
        'no-console': 'off', // Allow console.log/warn/error (we made them conditional)
        'no-unused-vars': [
            'warn',
            { argsIgnorePattern: '^_|req|res|next|event|e' }, // Ignore common unused params
        ],
        'no-shadow': 'warn', // Warn about variable shadowing
        'consistent-return': 'off', // Turn off for Express handlers
        'no-param-reassign': ['warn', { props: false }], // Allow reassigning props (like req.session)
        'no-use-before-define': ['error', { functions: false }], // Allow func hoisting
        camelcase: 'off', // Disable camelcase check entirely for now
        radix: ['warn', 'always'], // Enforce radix is always specified
        'no-plusplus': 'off', // Allow ++/--
        'no-restricted-syntax': [
            // Keep restrictions from airbnb, except allow ForOfStatement
            'error',
            'ForInStatement',
            // 'ForOfStatement', // Keep this commented to allow for...of
            'LabeledStatement',
            'WithStatement',
        ],
        'import/no-extraneous-dependencies': [
            'error',
            {
                devDependencies: [
                    '**/*.test.js',
                    '**/*.spec.js',
                    '.eslintrc.js',
                    '.prettierrc.js', // Add prettier config
                ],
            },
        ],
        // 'import/extensions': ['error', 'ignorePackages', { js: 'never' }], // Disable base rule, handle in overrides
    },
    overrides: [
        {
            files: ['public/js/**/*.js'], // Target files in public/js
            env: {
                browser: true, // Add browser environment
                node: false, // Remove node environment for client-side
            },
            globals: {
                bootstrap: 'readonly', // Allow bootstrap global
            },
            rules: {
                'import/extensions': ['error', 'always'], // Require extensions for browser modules
                'no-alert': 'off', // Allow alert in client-side code for now
                // Add any other client-specific rule adjustments here if needed
            },
        },
        {
            // Allow require in config files
            files: ['.eslintrc.js', '.prettierrc.js'],
            rules: {
                'import/no-commonjs': 'off',
                '@typescript-eslint/no-var-requires': 'off', // If using TS later
            },
        },
    ],
};
