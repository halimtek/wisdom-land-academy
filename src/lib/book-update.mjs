/**
 * Decides which stored-file columns a book update writes and which old files may
 * be removed once the transaction has committed.
 *
 * `current` must be the row as locked INSIDE the update transaction
 * (SELECT … FOR UPDATE), not a value read earlier: then a concurrent edit can
 * neither restore a cover/PDF path that was already replaced and deleted, nor
 * make this update delete a file the row no longer points to.
 *
 * Columns are written only when a new file was uploaded, so a metadata-only
 * edit leaves `filePath` and `coverImagePath` untouched.
 *
 * @param {{ filePath: string, coverImagePath: string | null }} current
 * @param {{ newFilePath?: string | null, newCoverPath?: string | null }} uploads
 * @returns {{ data: { filePath?: string, coverImagePath?: string }, removeAfterCommit: string[] }}
 */
export function planBookFileUpdate(current, { newFilePath = null, newCoverPath = null }) {
  /** @type {{ filePath?: string, coverImagePath?: string }} */
  const data = {};
  /** @type {string[]} */
  const removeAfterCommit = [];
  if (newFilePath) {
    data.filePath = newFilePath;
    if (current.filePath && current.filePath !== newFilePath) removeAfterCommit.push(current.filePath);
  }
  if (newCoverPath) {
    data.coverImagePath = newCoverPath;
    if (current.coverImagePath && current.coverImagePath !== newCoverPath) removeAfterCommit.push(current.coverImagePath);
  }
  return { data, removeAfterCommit };
}
