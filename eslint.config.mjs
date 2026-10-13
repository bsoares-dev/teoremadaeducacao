import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".next/**", ".data/**", "node_modules/**", "next-env.d.ts", "out/**", "motion/**"] },
  ...tseslint.configs.recommended,
  { rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }] } }
);
