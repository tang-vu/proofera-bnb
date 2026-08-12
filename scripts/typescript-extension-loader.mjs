import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import typescript from "typescript";

const RELATIVE_WITHOUT_EXTENSION = /^(?:\.\.?\/).+[^./]$/u;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "viem" && context.parentURL?.includes("/scripts/")) {
    return nextResolve(
      new URL("../packages/integrations/node_modules/viem/_esm/index.js", import.meta.url).href,
      context
    );
  }
  if (context.parentURL?.startsWith("file:") && RELATIVE_WITHOUT_EXTENSION.test(specifier)) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    try {
      await access(fileURLToPath(candidate));
      return nextResolve(candidate.href, context);
    } catch {
      // Defer non-TypeScript and missing paths to Node's standard resolver.
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:") && url.endsWith(".ts")) {
    const source = await readFile(fileURLToPath(url), "utf8");
    const transformed = typescript.transpileModule(source, {
      compilerOptions: {
        module: typescript.ModuleKind.ESNext,
        target: typescript.ScriptTarget.ES2023,
        verbatimModuleSyntax: true
      },
      fileName: fileURLToPath(url),
      reportDiagnostics: false
    });
    return { format: "module", shortCircuit: true, source: transformed.outputText };
  }
  return nextLoad(url, context);
}
