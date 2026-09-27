(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/office.js'));
  else root.mask2aiFiles = factory(root.mask2aiOffice);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (office) {
  const TEXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|ya?ml|log|rtf|js|ts|py|java|sql)$/i;
  const OPAQUE = /\.(pdf|png|jpe?g|gif|webp|heic|bmp|tiff?)$/i;
  const classify = name => office.kind(name) ? 'office' : TEXT.test(name) ? 'text' : OPAQUE.test(name) ? 'opaque' : 'other';
  const maskFile = async (file, maskText, found) => {
    const kind = classify(file.name);
    if (kind === 'text') {
      const masked = maskText(await file.text(), found);
      return new File([masked], file.name, { type: file.type, lastModified: file.lastModified });
    }
    if (kind === 'office') {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const masked = await office.mask(bytes, maskText, found);
      return masked === bytes ? file : new File([masked], file.name, { type: file.type, lastModified: file.lastModified });
    }
    return file;
  };
  const maskFormData = async (form, maskText, found, warn) => {
    const out = new FormData();
    for (const [key, value] of form.entries()) {
      if (value instanceof File) {
        if (classify(value.name) === 'opaque') warn(value.name);
        out.append(key, await maskFile(value, maskText, found), value.name);
      } else out.append(key, value);
    }
    return out;
  };
  return { classify, maskFile, maskFormData };
});