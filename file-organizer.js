import { Cleanup } from "./lib/cleanup.js";
import { Organizer } from "./lib/organizer.js";
import { DuplicateFinder } from "./lib/duplicates.js";
import path from "node:path";
import { Scanner } from "./lib/scanner.js";

const [command, directory] = process.argv.slice(2);

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 ** 3) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function drawProgressBar(current, total) {
  const width = 20;
  const filled = total ? Math.round((current / total) * width) : 0;
  const bar = "█".repeat(filled) + "░".repeat(width - filled);

  return `${bar} ${current}/${total}`;
}

async function runScan(directoryPath) {
  const scanner = new Scanner();
  let processed = 0;

  scanner.on("file-found", () => {
    processed++;
    process.stdout.write(`\rProcessing: ${processed} files`);
  });

  scanner.on("file-error", ({ filePath, error }) => {
    console.error(`\n❌ Cannot read ${filePath}: ${error.message}`);
  });

  scanner.on("scan-complete", (stats) => {
    console.log("\n\n📊 Scan Results");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`Total files: ${stats.totalFiles}`);
    console.log(`Total size: ${formatSize(stats.totalSize)}`);

    console.log("\nBy File Type:");

    for (const [extension, data] of Object.entries(stats.byType)) {
      console.log(
        `  ${extension}: ${data.count} files, ${formatSize(data.totalSize)}`,
      );
    }

    console.log("\nFile Age:");
    console.log(`  Last 7 days: ${stats.age.last7Days}`);
    console.log(`  Last 30 days: ${stats.age.last30Days}`);
    console.log(`  Older than 90 days: ${stats.age.olderThan90Days}`);

    console.log("\nLargest Files:");

    stats.largestFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${file.name} — ${formatSize(file.size)}`);
    });

    if (stats.oldestFile) {
      const oldest = stats.oldestFile;
      const daysOld = Math.floor(
        (Date.now() - oldest.mtime.getTime()) / (1000 * 60 * 60 * 24),
      );

      console.log(`\nOldest file: ${oldest.name} (${daysOld} days old)`);
    }

    console.log(`\n${drawProgressBar(processed, stats.totalFiles)}`);
  });

  console.log(`📂 Scanning: ${directoryPath}`);
  await scanner.scan(directoryPath);
}

async function runDuplicates(directoryPath) {
  const finder = new DuplicateFinder();

  finder.on("file-processed", ({ processed, total }) => {
    process.stdout.write(
      `\rCalculating hashes... ${drawProgressBar(processed, total)}`,
    );
  });

  finder.on("file-error", ({ filePath, error }) => {
    console.error(`\n❌ Cannot process ${filePath}: ${error.message}`);
  });

  finder.on("duplicates-found", (result) => {
    console.log(`\n\nFound ${result.duplicates.length} duplicate groups`);

    result.duplicates.forEach((group, index) => {
      console.log(`\nGroup ${index + 1}:`);
      console.log(`SHA-256: ${group.hash}`);

      group.files.forEach((file) => {
        console.log(`  📄 ${file.path}`);
      });

      console.log(`Wasted space: ${formatSize(group.wastedSpace)}`);
    });

    console.log(
      `\n💾 Total wasted space: ${formatSize(result.totalWastedSpace)}`,
    );
  });

  console.log(`🔍 Searching for duplicates in: ${directoryPath}`);
  await finder.find(directoryPath);
}

async function runOrganize(sourceDirectory, outputDirectory) {
  const organizer = new Organizer();

  organizer.on("copy-complete", ({ totalCopied, total }) => {
    process.stdout.write(
      `\rCopying files... ${drawProgressBar(totalCopied, total)}`,
    );
  });

  organizer.on("copy-error", ({ sourcePath, error }) => {
    console.error(`\n❌ Cannot copy ${sourcePath}: ${error.message}`);
  });

  organizer.on("organize-complete", (result) => {
    console.log("\n\n✅ Organization complete!");
    console.log("\nSummary:");

    for (const [category, count] of Object.entries(result.summary)) {
      console.log(`  ${category}: ${count} files`);
    }

    console.log(`\nTotal copied: ${result.totalCopied}`);
    console.log(`Total size: ${formatSize(result.totalSize)}`);
    console.log(`Output: ${result.output}`);
  });

  console.log(`📦 Organizing: ${sourceDirectory}`);
  console.log(`Target: ${outputDirectory}`);

  await organizer.organize(sourceDirectory, outputDirectory);
}

async function runCleanup(directoryPath, olderThan, confirm) {
  const cleaner = new Cleanup();

  cleaner.on("file-error", ({ filePath, error }) => {
    console.error(`\n❌ Cannot process ${filePath}: ${error.message}`);
    process.exitCode = 1;
  });

  cleaner.on("file-deleted", ({ deleted, total }) => {
    process.stdout.write(`\rDeleting... ${drawProgressBar(deleted, total)}`);
  });

  cleaner.on("files-listed", ({ files, totalSize }) => {
    console.log(`\nFound ${files.length} old files:`);

    for (const file of files) {
      console.log(`\n📄 ${file.path}`);
      console.log(`   Size: ${formatSize(file.size)}`);
      console.log(`   Modified: ${file.modified.toISOString().slice(0, 10)}`);
      console.log(`   Age: ${file.daysOld} days`);
    }

    console.log(`\nTotal: ${files.length} files (${formatSize(totalSize)})`);

    if (confirm && files.length > 0) {
      console.log(
        `\n⚠️ Deleting ${files.length} files. This cannot be undone!`,
      );
    }
  });

  cleaner.on("cleanup-complete", (result) => {
    if (result.dryRun) {
      console.log("\n⚠️ DRY RUN MODE: No files were deleted.");
      console.log("Use --confirm to delete these files.");
    } else {
      console.log("\n\n✅ Cleanup complete!");
      console.log(
        `Deleted: ${result.deleted} files (${formatSize(result.freedSpace)} freed)`,
      );
    }
  });

  console.log(`🧹 Cleanup: ${directoryPath}`);
  console.log(`Looking for files older than ${olderThan} days...`);

  await cleaner.cleanup(directoryPath, olderThan, confirm);
}

async function main() {
  if (!command || !directory) {
    console.log("Usage: node file-organizer.js scan <directory>");
    process.exitCode = 1;
    return;
  }

  const directoryPath = path.resolve(directory);

  try {
    switch (command) {
      case "scan":
        await runScan(directoryPath);
        break;

      case "duplicates":
        await runDuplicates(directoryPath);
        break;

      case "organize": {
        const outputIndex = process.argv.indexOf("--output");
        const outputDirectory = process.argv[outputIndex + 1];

        if (
          outputIndex === -1 ||
          !outputDirectory ||
          outputDirectory.startsWith("--")
        ) {
          throw new Error("Please specify --output <directory>");
        }

        await runOrganize(directoryPath, outputDirectory);
        break;
      }

      case "cleanup": {
        const olderThanIndex = process.argv.indexOf("--older-than");
        const olderThanValue = process.argv[olderThanIndex + 1];

        if (
          olderThanIndex === -1 ||
          !olderThanValue ||
          olderThanValue.startsWith("--")
        ) {
          throw new Error("Please specify --older-than <days>");
        }

        const olderThan = Number(olderThanValue);
        const confirm = process.argv.includes("--confirm");

        await runCleanup(directoryPath, olderThan, confirm);
        break;
      }

      default:
        console.error(`❌ Unknown command: ${command}`);
        process.exitCode = 1;
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      console.error(`❌ Directory not found: ${directoryPath}`);
    } else if (error.code === "EACCES" || error.code === "EPERM") {
      console.error(`❌ Permission denied: ${directoryPath}`);
    } else {
      console.error(`❌ Unexpected error: ${error.message}`);
    }

    process.exitCode = 1;
  }
}

await main();
