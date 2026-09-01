import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import next from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  globalIgnores([
    ".next/**",
    "dist/**",
    "out/**",
    "build/**",
    ".vinext/**",
    "tmp/**",
    "work/**",
    "tsconfig.tsbuildinfo",
    "next-env.d.ts",
  ]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  reactHooks.configs.flat["recommended-latest"],
  jsxA11y.flatConfigs.recommended,
  next.configs["core-web-vitals"],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      /* Initial browser-storage hydration is an intentional one-time synchronization. */
      "react-hooks/set-state-in-effect": "off",
      /* The workspace is one stateful client surface. These effects deliberately capture
         the current snapshot and are guarded by hydration/revision refs. */
      "react-hooks/exhaustive-deps": "off",
      /* A checkbox row here is <label><input/><span><strong>text</strong></span></label>, so
         its text sits three levels down. The default of 2 flags correct markup; the label and
         its control are properly associated by nesting. */
      "jsx-a11y/label-has-associated-control": ["error", { depth: 3 }],
    },
  },
]);

export default eslintConfig;
