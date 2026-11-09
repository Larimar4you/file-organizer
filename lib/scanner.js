import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";

export class Scanner extends EventEmitter {
  async scan(directory) {
    const files = [];

    const entries = await fs.readdir(directory, {
      recursive: true,
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const relativePath = path.relative(
        directory,
        path.join(entry.parentPath, entry.name),
      );

      if (relativePath.split(path.sep).includes(".git")) {
        continue;
      }

      const filePath = path.join(entry.parentPath, entry.name);

      try {
        const stats = await fs.stat(filePath);

        const fileData = {
          path: filePath,
          name: entry.name,
          extension: path.extname(entry.name).toLowerCase() || "(other)",
          size: stats.size,
          mtime: stats.mtime,
        };

        files.push(fileData);
        this.emit("file-found", fileData);
      } catch (error) {
        this.emit("file-error", { filePath, error });
      }
    }

    const statistics = {
      totalFiles: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
      byType: {},
      age: {
        last7Days: 0,
        last30Days: 0,
        olderThan90Days: 0,
      },
      largestFiles: [...files].sort((a, b) => b.size - a.size).slice(0, 3),
      oldestFile: [...files].sort((a, b) => a.mtime - b.mtime)[0] ?? null,
    };

    for (const file of files) {
      const type = file.extension;

      statistics.byType[type] ??= { count: 0, totalSize: 0 };
      statistics.byType[type].count++;
      statistics.byType[type].totalSize += file.size;

      const daysOld =
        (Date.now() - file.mtime.getTime()) / (1000 * 60 * 60 * 24);

      if (daysOld <= 7) statistics.age.last7Days++;
      if (daysOld <= 30) statistics.age.last30Days++;
      if (daysOld > 90) statistics.age.olderThan90Days++;
    }

    this.emit("scan-complete", statistics);
    return statistics;
  }
}
