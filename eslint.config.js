import js from '@eslint/js';
import globals from 'globals';
import vitest from '@vitest/eslint-plugin';

// Dependency rule (HANDOFF 4.2): logic <- bots/net/ui <- game <- main
// Folder names alone are not enough: engine/network packages and ambient browser globals are layer
// violations too, and dynamic import() must not be a way around the rule.
const folders = (...names) => names.flatMap((n) => [`**/${n}/**`, `**/${n}`]);
const NO_DYNAMIC_IMPORT = { selector: 'ImportExpression', message: 'Dynamic import() is not allowed: it bypasses the layer rule.' };

function layer({ banFolders, banPackages = [], pure = false }) {
  const rules = {
    'no-restricted-imports': ['error', {
      paths: banPackages.map((name) => ({ name, message: `Layer rule: ${name} is not allowed in this folder (HANDOFF 4.2)` })),
      patterns: [
        { group: folders(...banFolders), message: `Layer rule: this folder may not import from ${banFolders.join('/, ')}/ (HANDOFF 4.2)` },
        ...banPackages.filter((p) => p.endsWith('/*') || p.startsWith('@')).map((p) => ({ group: [p.endsWith('/*') ? p : `${p}/*`], message: `Layer rule: ${p} is not allowed in this folder` })),
      ],
    }],
    'no-restricted-syntax': ['error', NO_DYNAMIC_IMPORT],
  };
  if (pure) {
    rules['no-restricted-globals'] = ['error',
      ...['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'fetch', 'WebSocket', 'requestAnimationFrame']
        .map((name) => ({ name, message: 'logic/bots must be pure: inject what you need (HANDOFF 4.2)' })),
    ];
    rules['no-restricted-properties'] = ['error',
      { object: 'Math', property: 'random', message: 'Use the seeded rng from logic/rng.js so runs are reproducible.' },
    ];
  }
  return rules;
}

const PHASER = ['phaser'];
const SUPABASE = ['@supabase/supabase-js', '@supabase/*'];

export default [
  { ignores: ['dist/**', '.smoke/**', 'node_modules/**', 'playwright-report/**'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  { files: ['src/logic/**/*.js'], rules: layer({ banFolders: ['game', 'net', 'bots', 'ui'], banPackages: [...PHASER, ...SUPABASE], pure: true }) },
  { files: ['src/bots/**/*.js'], rules: layer({ banFolders: ['game', 'net', 'ui'], banPackages: [...PHASER, ...SUPABASE], pure: true }) },
  // Supabase may only be used inside net/
  { files: ['src/net/**/*.js'], rules: layer({ banFolders: ['game', 'bots', 'ui'], banPackages: PHASER }) },
  { files: ['src/ui/**/*.js'], rules: layer({ banFolders: ['game', 'net', 'bots'], banPackages: [...PHASER, ...SUPABASE] }) },
  { files: ['src/game/**/*.js'], rules: layer({ banFolders: ['net', 'ui'], banPackages: SUPABASE }) },
  {
    files: ['tests/unit/**/*.js'],
    plugins: { vitest },
    rules: {
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
      'vitest/no-commented-out-tests': 'error',
    },
  },
];
