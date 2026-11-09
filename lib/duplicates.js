import fs from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

function calculateHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export class DuplicateFinder extends EventEmitter {
  async find(directory) {
    const entries = await readdir(directory, {
      recursive: true,
      withFileTypes: true,
    });

    const files = entries.filter((entry) => entry.isFile());
    const hashes = new Map();

    let processed = 0;

    for (const entry of files) {
      const filePath = path.join(entry.parentPath, entry.name);

      try {
        const fileStats = await stat(filePath);
        const hash = await calculateHash(filePath);

        if (!hashes.has(hash)) {
          hashes.set(hash, []);
        }

        hashes.get(hash).push({
          path: filePath,
          size: fileStats.size,
        });
      } catch (error) {
        this.emit("file-error", { filePath, error });
      }

      processed++;
      this.emit("file-processed", {
        processed,
        total: files.length,
      });
    }

    const duplicates = [];
    let totalWastedSpace = 0;

    for (const [hash, group] of hashes) {
      if (group.length > 1) {
        const wastedSpace = group[0].size * (group.length - 1);

        duplicates.push({
          hash,
          files: group,
          wastedSpace,
        });

        totalWastedSpace += wastedSpace;
      }
    }

    const result = {
      duplicates,
      totalWastedSpace,
    };

    this.emit("duplicates-found", result);

    return result;
  }
}
