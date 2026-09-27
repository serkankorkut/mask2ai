(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./zip.js'));
  else root.mask2aiOffice = factory(root.mask2aiZip);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (zip) {
  const td = new TextDecoder();
  const te = new TextEncoder();
  const TEXT_PARTS = /^(word\/(document|header\d*|footer\d*|footnotes|endnotes|comments)\.xml|xl\/sharedStrings\.xml|ppt\/(slides|notesSlides)\/[^/]+\.xml)$/;
  const XML_TEXT = /(<(?:w:t|t|a:t)(?:\s[^>]*)?>)([^<]*)(<\/(?:w:t|t|a:t)>)/g;
  const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const encode = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const kind = name => /\.docx$/i.test(name) ? 'docx' : /\.xlsx$/i.test(name) ? 'xlsx' : /\.pptx$/i.test(name) ? 'pptx' : null;
  const mask = async (bytes, maskText, found) => {
    const entries = await zip.read(bytes);
    let changed = false;
    for (const e of entries) {
      if (!TEXT_PARTS.test(e.name)) continue;
      const xml = td.decode(e.data);
      const out = xml.replace(XML_TEXT, (m, open, text, close) => {
        const masked = maskText(decode(text), found);
        return masked === decode(text) ? m : open + encode(masked) + close;
      });
      if (out !== xml) {
        e.data = te.encode(out);
        changed = true;
      }
    }
    return changed ? zip.write(entries) : bytes;
  };
  return { kind, mask };
});