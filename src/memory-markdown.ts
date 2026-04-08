import { fromMarkdown } from 'mdast-util-from-markdown';

export type MarkdownHeadingRecord = {
  depth: number;
  line: number;
  title: string;
};

type MarkdownPoint = {
  line?: number;
};

type MarkdownPosition = {
  start?: MarkdownPoint;
};

type MarkdownNode = {
  type: string;
  depth?: number;
  value?: string;
  alt?: string | null;
  children?: MarkdownNode[];
  position?: MarkdownPosition;
};

const hasChildren = (node: MarkdownNode): node is MarkdownNode & { children: MarkdownNode[] } => {
  return Array.isArray(node.children);
};

const toHeadingText = (node: MarkdownNode): string => {
  if (typeof node.value === 'string') {
    return node.value;
  }

  if (typeof node.alt === 'string') {
    return node.alt;
  }

  if (!hasChildren(node)) {
    return '';
  }

  return node.children.map((child) => toHeadingText(child)).join('');
};

const visitHeadings = (
  node: MarkdownNode,
  maxHeadingDepth: number,
  headings: MarkdownHeadingRecord[],
): void => {
  if (node.type === 'heading' && typeof node.depth === 'number' && node.depth <= maxHeadingDepth) {
    const line = node.position?.start?.line;

    if (typeof line === 'number') {
      headings.push({
        depth: node.depth,
        line,
        title: toHeadingText(node).trim(),
      });
    }
  }

  if (!hasChildren(node)) {
    return;
  }

  for (const child of node.children) {
    visitHeadings(child, maxHeadingDepth, headings);
  }
};

export const parseMarkdownHeadings = (
  content: string,
  maxHeadingDepth: number,
): MarkdownHeadingRecord[] => {
  const root = fromMarkdown(content) as unknown as MarkdownNode;
  const headings: MarkdownHeadingRecord[] = [];

  visitHeadings(root, maxHeadingDepth, headings);

  return headings.sort((left, right) => {
    return left.line - right.line || left.depth - right.depth || left.title.localeCompare(right.title);
  });
};
