# File Organizer

A command-line file management tool built with Node.js.

File Organizer helps users analyze directories, find duplicate
files, organize files by category, and remove outdated files.

## Features

- Recursive directory scanning and file statistics
- Duplicate detection using SHA-256 hashes
- Automatic file organization by extension
- Safe cleanup with dry-run mode
- EventEmitter-based progress tracking
- Stream-based processing of large files
- Error handling for file system operations

## Requirements

- Node.js 20 or later
- npm

## Installation

Clone the repository:

```bash
git clone https://github.com/Larimar4you/file-organizer.git
cd file-organizer
```

No external dependencies are required.

## Commands

### 1. Scan

Analyze a directory recursively:

```bash
node file-organizer.js scan ./test-files
```

Displays:

- Total number of files and total size
- File statistics grouped by extension
- File age distribution
- Three largest files
- Oldest file

### 2. Duplicates

Find files with identical content:

```bash
node file-organizer.js duplicates ./test-files
```

Uses SHA-256 hashing and readable streams.

Displays duplicate groups, file paths, hashes,
and wasted disk space.

### 3. Organize

Copy files into categorized folders:

```bash
node file-organizer.js organize ./test-files --output ./test-output
```

Supported categories:

- Documents
- Images
- Archives
- Code
- Videos
- Other

Original files are preserved.

Filename conflicts are resolved automatically:
file.txt, file(1).txt, file(2).txt.

Files smaller than 10 MB use fs.copyFile().
Files of 10 MB or more use streams with pipeline().

### 4. Cleanup

Preview files older than 90 days:

```bash
node file-organizer.js cleanup ./test-files --older-than 90
```

Dry-run mode does not delete files.

Delete matching files:

```bash
node file-organizer.js cleanup ./test-files --older-than 90 --confirm
```

WARNING: The --confirm option permanently deletes
matching files. Use dry-run mode before deleting.

## Project Structure

```text
file-organizer/
├── lib/
│   ├── scanner.js
│   ├── duplicates.js
│   ├── organizer.js
│   └── cleanup.js
├── file-organizer.js
├── package.json
├── .gitignore
└── README.md
```

## Architecture

Each command is implemented as a class extending
Node.js EventEmitter.

Events are used to track scanning, hashing,
copying, and deletion progress.

Built-in Node.js modules:

- fs and fs/promises
- path
- crypto
- events
- stream/promises

## Error Handling

File operations use try/catch.

Common errors:

- ENOENT: File or directory not found
- EACCES: Permission denied
- EPERM: Operation not permitted

## Author

GitHub: [Larimar4you](https://github.com/Larimar4you)
