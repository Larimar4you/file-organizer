import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";

const DAY_MS = 24 * 60 * 60 * 1000;

export class Cleanup extends EventEmitter {
  async cleanup(directory, olderThan, confirm = false) {
    if (!Number.isFinite(olderThan) || olderThan < 0) {
      throw new Error("--older-than must be a non-negative number");
    }

    const source = path.resolve(directory);

    const sourceStats = await fs.stat(source);

    if (!sourceStats.isDirectory()) {
      throw new Error("Source must be a directory");
    }

    const entries = await fs.readdir(source, {
      recursive: true,
      withFileTypes: true,
    });

    const oldFiles = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const filePath = path.join(entry.parentPath, entry.name);
      const relativePath = path.relative(source, filePath);

      if (relativePath.split(path.sep).includes(".git")) {
        continue;
      }

      try {
        const stats = await fs.stat(filePath);
        const daysOld = (Date.now() - stats.mtimeMs) / DAY_MS;

        if (daysOld > olderThan) {
          const fileData = {
            path: filePath,
            size: stats.size,
            modified: stats.mtime,
            daysOld: Math.floor(daysOld),
          };

          oldFiles.push(fileData);
          this.emit("file-found", fileData);
        }
      } catch (error) {
        this.emit("file-error", { filePath, error });
      }
    }

    const totalSize = oldFiles.reduce((sum, file) => sum + file.size, 0);

    this.emit("files-listed", {
      files: oldFiles,
      totalSize,
    });

    let deleted = 0;
    let freedSpace = 0;

    if (confirm) {
      for (const file of oldFiles) {
        try {
          await fs.unlink(file.path);

          deleted++;
          freedSpace += file.size;

          this.emit("file-deleted", {
            ...file,
            deleted,
            total: oldFiles.length,
          });
        } catch (error) {
          this.emit("file-error", {
            filePath: file.path,
            error,
          });
        }
      }
    }

    const result = {
      files: oldFiles,
      totalFiles: oldFiles.length,
      totalSize,
      deleted,
      freedSpace,
      dryRun: !confirm,
    };

    this.emit("cleanup-complete", result);

    return result;
  }
}
