import * as fs from "node:fs";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { Options, format } from "prettier";

const prettierConfig: Options = {
  parser: "nginx",
  plugins: ["./dist"],
};

let exitCode = 0;

const testRoot = path.resolve(import.meta.dirname);
let testDirectories: string[] = [];
const testFiles = fs.readdirSync(path.join(testRoot, "files"));
for (const i of testFiles) {
  const directoryName = path.join(testRoot, "files", i);
  if (fs.lstatSync(directoryName).isDirectory()) {
    if (!fs.existsSync(path.join(directoryName, "nginx.conf"))) break;
    if (!fs.existsSync(path.join(directoryName, "options.json"))) break;
    testDirectories.push(directoryName);
  }
}

for (const testDir of testDirectories) {
  const input = fs.readFileSync(path.join(testDir, "nginx.conf"), {
    encoding: "utf-8",
  });
  const options = JSON.parse(
    fs.readFileSync(path.join(testDir, "options.json")).toString()
  ) as { filename: string; options: Options }[];

  for (const option of options) {
    if (!option.filename) {
      throw TypeError("Option does not have filename property");
    }
    if (!option.options) {
      throw TypeError("Option does not have option property");
    }
    const outputPath = path.join(testDir, option.filename);
    if (!fs.existsSync(outputPath)) {
      throw Error(`Option output path "${outputPath}" does not exist`);
    }
    const expectedResult = fs
      .readFileSync(outputPath, { encoding: "utf-8" })
      .replace("\r", "");
    const result = (
      await format(input, {
        ...prettierConfig,
        ...option.options,
      })
    ).replace("\r", "");
    writeFileSync(path.join(testDir, option.filename + ".out"), result);
    let failAlert: string[] = [];
    if (expectedResult.length != result.length) {
      failAlert.push(
        `The expected length (${expectedResult.length}) ` +
          `does not match the result length (${result.length})`
      );
    }
    let lineCount = 1;
    let resultLine = "";
    let expectedLine = "";
    for (let i = 0; i < expectedResult.length; i++) {
      if (expectedResult[i] === "\n") {
        lineCount += 1;
        resultLine = "";
        expectedLine = "";
      }
      expectedLine += expectedResult[i];
      resultLine += i < result.length ? result[i] : "";
      if (i >= result.length || expectedResult[i] != result[i]) {
        failAlert.push(
          `Result does not match expected output ` +
            `(Char ${i}, Line ${lineCount}, Col ${expectedLine.length})`
        );

        let isExpected = true;
        [expectedLine, resultLine].forEach((line) => {
          failAlert.push(
            "\t" +
              (isExpected ? "Expected" : "Result") +
              " (Len " +
              line.length.toString() +
              ")" +
              ": " +
              line.replace(" ", "·").replace("\t", "⸻").replace("\n", "⮒")
          );
          isExpected = !isExpected;
        });
        break;
      }
    }
    if (failAlert.length > 0) {
      failAlert.splice(
        0,
        0,
        `Test "${path.basename(testDir)}" failed on "${option.filename}":`
      );
      const formattedAlert = failAlert.join("\n\t");
      console.error(formattedAlert);
      exitCode += 1;
    }
  }
}

process.exit(exitCode);
