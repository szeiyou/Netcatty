import ts from 'typescript';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Find all TSX files recursively
function findTsxFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      findTsxFiles(fullPath, files);
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      files.push(fullPath);
    }
  }
  return files;
}

// Organize imports using TypeScript Language Service
function organizeImports(filePath) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');

  // Create a simple in-memory host
  const servicesHost = {
    getScriptFileNames: () => [filePath],
    getScriptVersion: () => '1',
    getScriptSnapshot: (fileName) => {
      if (fileName === filePath) {
        return ts.ScriptSnapshot.fromString(fileContent);
      }
      if (!fs.existsSync(fileName)) {
        return undefined;
      }
      return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, 'utf-8'));
    },
    getCurrentDirectory: () => rootDir,
    getCompilationSettings: () => ({
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowJs: true,
      skipLibCheck: true,
      noEmit: true,
    }),
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  const services = ts.createLanguageService(servicesHost, ts.createDocumentRegistry());

  // Get organize imports edits
  const edits = services.organizeImports(
    { type: 'file', fileName: filePath },
    {},
    {}
  );

  if (edits.length === 0) {
    return { changed: false, content: fileContent };
  }

  // Apply edits
  let newContent = fileContent;
  // Apply edits in reverse order to preserve positions
  for (const fileEdit of edits) {
    const textChanges = [...fileEdit.textChanges].sort((a, b) => b.span.start - a.span.start);
    for (const change of textChanges) {
      newContent =
        newContent.slice(0, change.span.start) +
        change.newText +
        newContent.slice(change.span.start + change.span.length);
    }
  }

  return { changed: newContent !== fileContent, content: newContent };
}

// Main
console.log('🔍 Searching for TSX/TS files...\n');
const files = findTsxFiles(rootDir);
console.log(`Found ${files.length} files to process.\n`);

let changedCount = 0;
let errorCount = 0;

for (const file of files) {
  const relativePath = path.relative(rootDir, file);
  try {
    const result = organizeImports(file);
    if (result.changed) {
      fs.writeFileSync(file, result.content, 'utf-8');
      console.log(`✅ Fixed: ${relativePath}`);
      changedCount++;
    } else {
      console.log(`⏭️  Skipped (no changes): ${relativePath}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${relativePath}: ${error.message}`);
    errorCount++;
  }
}

console.log('\n' + '='.repeat(50));
console.log(`📊 Summary:`);
console.log(`   Files processed: ${files.length}`);
console.log(`   Files modified:  ${changedCount}`);
console.log(`   Errors:          ${errorCount}`);
console.log('='.repeat(50));
