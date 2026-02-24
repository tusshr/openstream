import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier/flat";
import checkFile from "eslint-plugin-check-file";
import drizzle from "eslint-plugin-drizzle";
import n from "eslint-plugin-n";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";

export default defineConfig([
  js.configs.recommended,
  prettier,
  globalIgnores([
    "node_modules/**",
    "out/**",
    "build/**",
    ".husky/**",
    "**/*.config.{js,cjs,mjs,ts}",
  ]),
  {
    files: ["src/**/*.ts"],
    plugins: {
      "@typescript-eslint": tsPlugin,
      "check-file": checkFile,
      drizzle,
      n,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      "prefer-arrow-callback": "error",
      "prefer-template": "error",
      semi: ["error", "always"],
      quotes: ["error", "double", { avoidEscape: true }],
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
        },
      ],
      "drizzle/enforce-delete-with-where": [
        "error",
        {
          drizzleObjectName: ["db"],
        },
      ],
      "drizzle/enforce-update-with-where": [
        "error",
        {
          drizzleObjectName: ["db"],
        },
      ],
      "check-file/filename-naming-convention": [
        "error",
        {
          "src/**/*.{ts,tsx}": "KEBAB_CASE",
        },
        {
          ignoreMiddleExtensions: true,
        },
      ],
      "check-file/folder-naming-convention": [
        "error",
        {
          "src/**": "KEBAB_CASE",
        },
      ],
      "n/no-missing-import": "off",
    },
  },
]);
