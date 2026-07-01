import { spawn } from "child_process";
import path from "path";
import { loadProjectConfig } from "../config";

export async function compile(): Promise<void> {
  const config = loadProjectConfig();
  const compiler = config?.compiler || "pdflatex";
  const mainFile = config?.main_file || "main.tex";

  console.log(`Compiling with ${compiler} ${mainFile}...`);

  const child = spawn(compiler, [
    "-interaction=nonstopmode",
    "-halt-on-error",
    mainFile,
  ], {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    if (code === 0) {
      console.log("Compilation successful!");
    } else {
      console.error(`Compilation failed with exit code ${code}`);
      process.exit(1);
    }
  });

  child.on("error", (err) => {
    console.error(`Failed to run ${compiler}: ${err.message}`);
    console.error("Make sure TeX Live is installed and in your PATH.");
    process.exit(1);
  });
}
