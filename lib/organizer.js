import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { EventEmitter } from "node:events";

const categories = {
  Documents: [".pdf", ".docx", ".doc", ".txt", ".md", ".xlsx", ".pptx"],
  Images: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"],
  Archives: [".zip", ".rar", ".tar", ".gz", ".7z"],
  Code: [".js", ".py", ".java", ".cpp", ".html", ".css", ".json"],
  Videos: [".mp4", ".avi", ".mkv", ".mov", ".webm"],
  Other: [],
};

const STREAM_THRESHOLD = 10 * 1024 * 1024;

function getCategory(filename) {
  const extension = path.extname(filename).toLowerCase();

  for (const [category, extensions] of Object.entries(categories)) {
    if (extensions.includes(extension)) {
      return category;
    }
  }

  return "Other";
}

async function getUniquePath(directory, filename) {
  const extension = path.extname(filename);
  const basename = path.basename(filename, extension);

  let counter = 0;

  while (true) {
    const newName = counter ? `${basename}(${counter})${extension}` : filename;

    const destination = path.join(directory, newName);

    try {
      await fsp.access(destination);
      counter++;
    } catch (error) {
      if (error.code === "ENOENT") return destination;
      throw error;
    }
  }
}

export class Organizer extends EventEmitter {
  async organize(sourceDirectory, outputDirectory) {
    const source = path.resolve(sourceDirectory);
    const output = path.resolve(outputDirectory);

    if (source === output) {
      throw new Error("Source and output directories must be different");
    }

    const sourceStats = await fsp.stat(source);
    if (!sourceStats.isDirectory()) {
      throw new Error("Source must be a directory");
    }

    // Create category folders
    for (const category of Object.keys(categories)) {
      await fsp.mkdir(path.join(output, category), {
        recursive: true,
      });
    }

    const entries = await fsp.readdir(source, {
      recursive: true,
      withFileTypes: true,
    });

    const files = entries.filter((entry) => {
      if (!entry.isFile()) return false;

      const filePath = path.join(entry.parentPath, entry.name);
      const relativePath = path.relative(source, filePath);

      // Skip Git files and the output folder itself
      if (relativePath.split(path.sep).includes(".git")) return false;

      const relativeOutput = path.relative(output, filePath);
      if (
        relativeOutput === "" ||
        (!relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput))
      ) {
        return false;
      }

      return true;
    });

    const summary = Object.fromEntries(
      Object.keys(categories).map((category) => [category, 0]),
    );

    let totalCopied = 0;
    let totalSize = 0;

    for (const entry of files) {
      const sourcePath = path.join(entry.parentPath, entry.name);

      try {
        const stats = await fsp.stat(sourcePath);
        const category = getCategory(entry.name);

        const targetDirectory = path.join(output, category);
        const targetPath = await getUniquePath(targetDirectory, entry.name);

        this.emit("copy-start", {
          sourcePath,
          targetPath,
        });

        if (stats.size >= STREAM_THRESHOLD) {
          await pipeline(
            fs.createReadStream(sourcePath),
            fs.createWriteStream(targetPath, { flags: "wx" }),
          );
        } else {
          await fsp.copyFile(
            sourcePath,
            targetPath,
            fs.constants.COPYFILE_EXCL,
          );
        }

        summary[category]++;
        totalCopied++;
        totalSize += stats.size;

        this.emit("copy-complete", {
          sourcePath,
          targetPath,
          totalCopied,
          total: files.length,
        });
      } catch (error) {
        this.emit("copy-error", { sourcePath, error });
      }
    }

    const result = {
      summary,
      totalCopied,
      totalSize,
      output,
    };

    this.emit("organize-complete", result);
    return result;
  }
}
