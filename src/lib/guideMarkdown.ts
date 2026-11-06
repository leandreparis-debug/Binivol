/**
 * A tiny Markdown subset for the guides shown on /aide (step 15): titles,
 * paragraphs, bullet and numbered lists, **bold**. Images are left out of the
 * page (they illustrate the files in docs/guides). Pure.
 */

export interface GuideInline {
  text: string;
  bold: boolean;
}
export type GuideBlock =
  | { type: "h1" | "h2" | "p"; content: GuideInline[] }
  | { type: "ul" | "ol"; items: GuideInline[][] };

export function inline(text: string): GuideInline[] {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**")
        ? { text: part.slice(2, -2), bold: true }
        : { text: part, bold: false },
    );
}

export function parseGuide(markdown: string): GuideBlock[] {
  const blocks: GuideBlock[] = [];
  let paragraph: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ type: "p", content: inline(paragraph.join(" ")) });
    paragraph = [];
    if (list) blocks.push({ type: list.type, items: list.items.map(inline) });
    list = null;
  };
  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim() === "" || line.startsWith("![")) {
      flush();
      continue;
    }
    const heading = /^(#{1,2}) (.*)$/.exec(line);
    const bullet = /^- (.*)$/.exec(line);
    const numbered = /^\d+\. (.*)$/.exec(line);
    const continuation = /^ {2,}(\S.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: heading[1] === "#" ? "h1" : "h2", content: inline(heading[2] ?? "") });
    } else if (bullet || numbered) {
      const type = bullet ? "ul" : "ol";
      if (paragraph.length > 0 || (list && list.type !== type)) flush();
      list ??= { type, items: [] };
      list.items.push((bullet ?? numbered)?.[1] ?? "");
    } else if (continuation && list) {
      const last = list.items.length - 1;
      list.items[last] = `${list.items[last] ?? ""} ${continuation[1] ?? ""}`;
    } else {
      if (list) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}
