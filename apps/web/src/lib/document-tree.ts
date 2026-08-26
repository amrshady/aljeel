export interface DocumentTreeItem {
  id: string;
  fileName: string;
}

export type DocumentTreeNode =
  | {
      kind: 'folder';
      name: string;
      /** Relative folder path using `/` separators (no trailing slash). */
      path: string;
      children: DocumentTreeNode[];
      /** Total files under this folder (recursive). */
      fileCount: number;
    }
  | {
      kind: 'file';
      name: string;
      path: string;
      document: DocumentTreeItem;
    };

type MutableFolder = {
  kind: 'folder';
  name: string;
  path: string;
  children: Array<MutableFolder | Extract<DocumentTreeNode, { kind: 'file' }>>;
  folderMap: Map<string, MutableFolder>;
};

function splitRelativePath(fileName: string): string[] {
  return fileName
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== '.' && part !== '..');
}

function sortMutable(
  nodes: Array<MutableFolder | Extract<DocumentTreeNode, { kind: 'file' }>>,
): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  for (const node of nodes) {
    if (node.kind === 'folder') sortMutable(node.children);
  }
}

function toPublicNode(
  node: MutableFolder | Extract<DocumentTreeNode, { kind: 'file' }>,
): DocumentTreeNode {
  if (node.kind === 'file') return node;
  const children = node.children.map(toPublicNode);
  const fileCount = children.reduce(
    (sum, child) => sum + (child.kind === 'file' ? 1 : child.fileCount),
    0,
  );
  return {
    kind: 'folder',
    name: node.name,
    path: node.path,
    children,
    fileCount,
  };
}

/**
 * Builds a folder/file tree from document relative paths
 * (e.g. `root/sub/file.pdf`).
 */
export function buildDocumentTree(documents: DocumentTreeItem[]): DocumentTreeNode[] {
  const rootChildren: Array<
    MutableFolder | Extract<DocumentTreeNode, { kind: 'file' }>
  > = [];
  const rootFolders = new Map<string, MutableFolder>();

  function ensureFolder(
    parentMap: Map<string, MutableFolder>,
    parentChildren: Array<MutableFolder | Extract<DocumentTreeNode, { kind: 'file' }>>,
    name: string,
    path: string,
  ): MutableFolder {
    let folder = parentMap.get(name);
    if (!folder) {
      folder = {
        kind: 'folder',
        name,
        path,
        children: [],
        folderMap: new Map(),
      };
      parentMap.set(name, folder);
      parentChildren.push(folder);
    }
    return folder;
  }

  for (const document of documents) {
    const parts = splitRelativePath(document.fileName);
    if (parts.length === 0) continue;

    if (parts.length === 1) {
      rootChildren.push({
        kind: 'file',
        name: parts[0]!,
        path: parts[0]!,
        document,
      });
      continue;
    }

    let folderMap = rootFolders;
    let children = rootChildren;
    let pathSoFar = '';
    for (let i = 0; i < parts.length - 1; i += 1) {
      const name = parts[i]!;
      pathSoFar = pathSoFar ? `${pathSoFar}/${name}` : name;
      const folder = ensureFolder(folderMap, children, name, pathSoFar);
      folderMap = folder.folderMap;
      children = folder.children;
    }

    const fileName = parts[parts.length - 1]!;
    const filePath = pathSoFar ? `${pathSoFar}/${fileName}` : fileName;
    children.push({
      kind: 'file',
      name: fileName,
      path: filePath,
      document,
    });
  }

  sortMutable(rootChildren);
  return rootChildren.map(toPublicNode);
}

/** Folder paths that should stay open so matching files remain visible. */
export function folderPathsForDocumentIds(
  tree: DocumentTreeNode[],
  documentIds: Set<string>,
): Set<string> {
  const open = new Set<string>();
  if (documentIds.size === 0) return open;

  function walk(nodes: DocumentTreeNode[], ancestors: string[]): boolean {
    let hit = false;
    for (const node of nodes) {
      if (node.kind === 'file') {
        if (documentIds.has(node.document.id)) {
          for (const path of ancestors) open.add(path);
          hit = true;
        }
        continue;
      }
      const childHit = walk(node.children, [...ancestors, node.path]);
      if (childHit) {
        open.add(node.path);
        hit = true;
      }
    }
    return hit;
  }

  walk(tree, []);
  return open;
}

/** Default: expand only top-level folders. */
export function defaultExpandedFolderPaths(tree: DocumentTreeNode[]): Set<string> {
  const open = new Set<string>();
  for (const node of tree) {
    if (node.kind === 'folder') open.add(node.path);
  }
  return open;
}

/** Every folder path in the tree (for Expand all). */
export function allFolderPaths(tree: DocumentTreeNode[]): Set<string> {
  const open = new Set<string>();
  function walk(nodes: DocumentTreeNode[]) {
    for (const node of nodes) {
      if (node.kind !== 'folder') continue;
      open.add(node.path);
      walk(node.children);
    }
  }
  walk(tree);
  return open;
}
