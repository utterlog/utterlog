import { lstatSync, mkdirSync, renameSync, rmdirSync, unlinkSync } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { config } from '../config';

async function destinationRoot(directory: string) {
  let parent = resolve(directory);
  const missing: string[] = [];
  while (!lstatSync(parent, { throwIfNoEntry: false })) {
    missing.unshift(basename(parent));
    parent = dirname(parent);
  }
  const anchor = await realpath(parent);
  return { root: join(anchor, ...missing), anchor };
}

type StagedFile = {
  anchor: string;
  target: string;
  staged: string;
  previous: string;
  previousMoved: boolean;
  installed: boolean;
};

export async function stageRestoreFiles(extracted: string, entries: string[]) {
  const files = new Map<string, StagedFile>();
  const workDirs: { root: string; staging: string }[] = [];
  const createdDirs: string[] = [];
  const ensureDirectory = (path: string, anchor: string, create: boolean): void => {
    if (path !== anchor) ensureDirectory(dirname(path), anchor, create);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat?.isDirectory()) return;
    if (stat || path === anchor) throw new Error(`恢复目标包含非目录路径：${path}`);
    if (create) {
      mkdirSync(path);
      createdDirs.push(path);
    }
  };

  const cleanup = async () => {
    await Promise.all(workDirs.map(({ staging }) => rm(staging, { recursive: true, force: true }).catch((error) => {
      console.error('Failed to remove backup restore staging directory:', staging, error);
    })));
  };

  try {
    for (const [prefix, directory] of [['uploads/', config.uploadDir], ['content/', config.contentDir]]) {
      const group = entries.filter((name) => name.startsWith(prefix));
      if (group.length === 0) continue;
      const { root, anchor } = await destinationRoot(directory);
      const work = await mkdtemp(join(anchor, '.utterlog-restore-'));
      workDirs.push({ root, staging: work });
      for (const entry of group) {
        const source = join(extracted, entry);
        if (!(await lstat(source)).isFile()) throw new Error(`备份条目不是普通文件：${entry}`);
        const relativePath = entry.slice(prefix.length);
        const target = join(root, relativePath);
        ensureDirectory(dirname(target), anchor, false);
        const existing = lstatSync(target, { throwIfNoEntry: false });
        if (files.has(target) || (existing && !existing.isFile())) throw new Error(`恢复目标不是普通文件：${entry}`);
        const staged = join(work, `new-${files.size}`);
        const previous = join(work, 'previous', relativePath);
        await mkdir(dirname(previous), { recursive: true });
        await copyFile(source, staged);
        files.set(target, { anchor, target, staged, previous, previousMoved: false, installed: false });
      }
    }
  } catch (error) {
    await cleanup();
    throw error;
  }

  return {
    workDirs,
    publish() {
      for (const file of files.values()) {
        ensureDirectory(dirname(file.target), file.anchor, true);
        const existing = lstatSync(file.target, { throwIfNoEntry: false });
        if (existing) {
          if (!existing.isFile()) throw new Error(`恢复目标不是普通文件：${file.target}`);
          renameSync(file.target, file.previous);
          file.previousMoved = true;
        }
        renameSync(file.staged, file.target);
        file.installed = true;
      }
    },
    rollback() {
      const errors: unknown[] = [];
      for (const file of [...files.values()].reverse()) {
        try {
          if (file.previousMoved) renameSync(file.previous, file.target);
          else if (file.installed) unlinkSync(file.target);
        } catch (error) { errors.push(error); }
      }
      for (const directory of createdDirs.reverse()) {
        try { rmdirSync(directory); }
        catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, `无法回滚恢复文件。原文件保留在：${workDirs.map(({ staging }) => staging).join(', ')}`);
    },
    cleanup,
  };
}
