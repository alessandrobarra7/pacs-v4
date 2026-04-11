import sanitizeHtml from 'sanitize-html';

/**
 * F1-3: Configuração de sanitização HTML para laudos.
 * Permite tags de formatação médica mas bloqueia scripts, handlers de evento
 * e atributos perigosos (previne XSS armazenado).
 */
export const REPORT_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'p', 'br',
    'strong', 'em', 'u', 's', 'sub', 'sup', 'blockquote', 'hr',
    'ul', 'ol', 'li', 'a',
  ]),
  allowedAttributes: {
    '*': ['style', 'class', 'id', 'align', 'valign'],
    'a': ['href', 'target', 'rel'],
    'img': ['src', 'alt', 'width', 'height'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan'],
    'col': ['width', 'span'],
  },
  allowedSchemes: ['http', 'https', 'data'],
  disallowedTagsMode: 'discard',
};
