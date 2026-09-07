const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s) {
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

export function parseXml(source) {
  const root = { name: "#root", local: "#root", attrs: {}, children: [] };
  const stack = [root];
  let i = 0;

  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt === -1) break;

    if (lt > i) {
      const text = source.slice(i, lt);
      if (text.trim() || /[ \t]/.test(text)) {
        stack[stack.length - 1].children.push({ text: decodeEntities(text) });
      }
    }

    // Declarations, comments and processing instructions carry nothing we need.
    if (source.startsWith("<!--", lt)) { i = source.indexOf("-->", lt) + 3 || source.length; continue; }
    if (source.startsWith("<?", lt)) { i = source.indexOf("?>", lt) + 2 || source.length; continue; }
    if (source.startsWith("<!", lt)) { i = source.indexOf(">", lt) + 1 || source.length; continue; }

    const gt = findTagEnd(source, lt);
    if (gt === -1) break;
    const raw = source.slice(lt + 1, gt);

    if (raw[0] === "/") {
      if (stack.length > 1) stack.pop();
      i = gt + 1;
      continue;
    }

    const selfClosing = raw.endsWith("/");
    const inner = selfClosing ? raw.slice(0, -1) : raw;
    const nameEnd = inner.search(/[\s/]/);
    const name = nameEnd === -1 ? inner : inner.slice(0, nameEnd);
    const node = {
      name,
      local: name.includes(":") ? name.slice(name.indexOf(":") + 1) : name,
      attrs: nameEnd === -1 ? {} : parseAttrs(inner.slice(nameEnd)),
      children: [],
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
    i = gt + 1;
  }
  return root;
}

// A ">" inside an attribute value does not end the tag.
function findTagEnd(source, from) {
  let quote = null;
  for (let i = from + 1; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === ">") return i;
  }
  return -1;
}

function parseAttrs(s) {
  const attrs = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const key = m[1];
    attrs[key] = decodeEntities(m[3] ?? m[4] ?? "");
    // Also keyed without the prefix, so callers can ask for "val" rather than "w:val".
    const local = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
    if (!(local in attrs)) attrs[local] = attrs[key];
  }
  return attrs;
}

export function isElement(node) {
  return Boolean(node && node.name);
}

export function childrenNamed(node, local) {
  return (node?.children || []).filter((c) => isElement(c) && c.local === local);
}

export function childNamed(node, local) {
  return childrenNamed(node, local)[0] || null;
}

export function findAll(node, local, out = []) {
  for (const child of node?.children || []) {
    if (!isElement(child)) continue;
    if (child.local === local) out.push(child);
    findAll(child, local, out);
  }
  return out;
}

export function findFirst(node, local) {
  for (const child of node?.children || []) {
    if (!isElement(child)) continue;
    if (child.local === local) return child;
    const deeper = findFirst(child, local);
    if (deeper) return deeper;
  }
  return null;
}

export function textOf(node) {
  let out = "";
  for (const child of node?.children || []) {
    if (isElement(child)) out += textOf(child);
    else out += child.text;
  }
  return out;
}

export function attr(node, name) {
  return node?.attrs?.[name];
}
