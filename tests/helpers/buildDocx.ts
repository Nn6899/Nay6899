import JSZip from 'jszip';

/** Tạo nhanh một file .docx tối giản để kiểm thử bộ đọc Word */
export interface DocxParts {
  body: string; // nội dung bên trong <w:body>
  numbering?: string; // nội dung bên trong <w:numbering>
  styles?: string; // nội dung bên trong <w:styles>
  rels?: { id: string; type: string; target: string }[];
  files?: Record<string, Uint8Array | string>;
}

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
  'xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" ' +
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" ' +
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';

export async function buildDocx(parts: DocxParts): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
      '<Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.oleObject"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  );
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>${parts.body}</w:body></w:document>`);
  const rels = (parts.rels || [])
    .map(r => `<Relationship Id="${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${r.type}" Target="${r.target}"/>`)
    .join('');
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`
  );
  if (parts.numbering) zip.file('word/numbering.xml', `<?xml version="1.0" encoding="UTF-8"?><w:numbering ${NS}>${parts.numbering}</w:numbering>`);
  if (parts.styles) zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8"?><w:styles ${NS}>${parts.styles}</w:styles>`);
  for (const [path, data] of Object.entries(parts.files || {})) zip.file(path, data);
  return zip.generateAsync({ type: 'arraybuffer' });
}

/** Đoạn văn đơn giản */
export const p = (...runs: string[]) => `<w:p>${runs.join('')}</w:p>`;
/** Run chữ thường */
export const r = (text: string, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
export const tab = '<w:r><w:tab/></w:r>';
export const U = '<w:u w:val="single"/>';
export const RED = '<w:color w:val="FF0000"/>';
export const BLUE_BOLD = '<w:b/><w:color w:val="0000FF"/>';
/** Đoạn văn được Word tự đánh số */
export const numbered = (numId: number, ilvl: number, ...runs: string[]) =>
  `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${runs.join('')}</w:p>`;
/** Công thức MathType nhúng dạng OLE */
export const mathTypeObject = (imageRid: string, oleRid: string) =>
  `<w:r><w:object w:dxaOrig="600" w:dyaOrig="300"><v:shape id="_x0000_i1025" type="#_x0000_t75" style="width:30pt;height:15pt" o:ole=""><v:imagedata r:id="${imageRid}" o:title=""/></v:shape><o:OLEObject Type="Embed" ProgID="Equation.DSMT4" ShapeID="_x0000_i1025" DrawAspect="Content" ObjectID="_1700000000" r:id="${oleRid}"/></w:object></w:r>`;
/** Ảnh nhúng dạng DrawingML */
export const drawing = (rid: string) =>
  `<w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${rid}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

// PNG 1x1 hợp lệ
export const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  c => c.charCodeAt(0)
);
