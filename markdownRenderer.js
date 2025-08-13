(function() {
  'use strict';

  function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      const protocol = parsed.protocol.toLowerCase();
      if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:' || protocol === 'tel:') {
        return parsed.href;
      }
    } catch (e) {}
    return '#';
  }

  function renderInline(md) {
    // code -> strong/em -> em -> links
    // inline code
    md = md.replace(/`([^`\n]+)`/g, function(_, code) {
      return '<code>' + escapeHtml(code) + '</code>';
    });

    // bold italic ***text***
    md = md.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    // bold **text**
    md = md.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // italic *text*
    md = md.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

    // links [text](url)
    md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(_, text, url) {
      return '<a href="' + sanitizeUrl(url) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
    });

    return md;
  }

  function convertLists(lines, i, isOrdered) {
    const tag = isOrdered ? 'ol' : 'ul';
    const out = [];
    out.push('<' + tag + '>');
    while (i < lines.length) {
      const line = lines[i];
      const match = isOrdered ? line.match(/^\s*\d+\.\s+(.*)$/) : line.match(/^\s*[-*+]\s+(.*)$/);
      if (!match) break;
      out.push('<li>' + renderInline(match[1]) + '</li>');
      i++;
    }
    out.push('</' + tag + '>');
    return { html: out.join(''), nextIndex: i };
  }

  function convertTable(lines, i) {
    // minimal pipe table support
    const headerLine = lines[i];
    const sepLine = lines[i + 1] || '';
    const hasPipes = /\|/.test(headerLine) && /\|/.test(sepLine);
    const isSep = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(sepLine);
    if (!hasPipes || !isSep) return null;

    function splitRow(row) {
      const cells = row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
      return cells.map(c => renderInline(c.trim()));
    }

    const headerCells = splitRow(headerLine);
    const body = [];
    let j = i + 2;
    while (j < lines.length && /\|/.test(lines[j])) {
      const rowCells = splitRow(lines[j]);
      body.push('<tr>' + rowCells.map(c => '<td>' + c + '</td>').join('') + '</tr>');
      j++;
    }
    const thead = '<thead><tr>' + headerCells.map(c => '<th>' + c + '</th>').join('') + '</tr></thead>';
    const tbody = '<tbody>' + body.join('') + '</tbody>';
    return { html: '<table>' + thead + tbody + '</table>', nextIndex: j };
  }

  function renderMarkdown(md) {
    if (!md) return '';
    // Normalize
    md = md.replace(/\r\n?/g, '\n');

    // Extract fenced code blocks first
    const codeBlocks = [];
    md = md.replace(/```([a-zA-Z0-9#.+_-]*)\n([\s\s]*?)```/g, function(_, lang, code) {
      const idx = codeBlocks.length;
      const language = lang ? (' language-' + lang) : '';
      const html = '<pre><code class="' + language + '">' + escapeHtml(code.replace(/\n$/, '')) + '</code></pre>';
      codeBlocks.push(html);
      return '@@MD_CODE_' + idx + '@@';
    });

    // Escape everything else for safety before block-level transforms
    md = escapeHtml(md);

    // Split into lines for block processing
    const lines = md.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      let line = lines[i];

      // Empty line -> paragraph break
      if (/^\s*$/.test(line)) { out.push(''); i++; continue; }

      // Headings
      let m;
      if ((m = line.match(/^\s*######\s+(.*)$/))) { out.push('<h6>' + renderInline(m[1]) + '</h6>'); i++; continue; }
      if ((m = line.match(/^\s*#####\s+(.*)$/))) { out.push('<h5>' + renderInline(m[1]) + '</h5>'); i++; continue; }
      if ((m = line.match(/^\s*####\s+(.*)$/))) { out.push('<h4>' + renderInline(m[1]) + '</h4>'); i++; continue; }
      if ((m = line.match(/^\s*###\s+(.*)$/))) { out.push('<h3>' + renderInline(m[1]) + '</h3>'); i++; continue; }
      if ((m = line.match(/^\s*##\s+(.*)$/))) { out.push('<h2>' + renderInline(m[1]) + '</h2>'); i++; continue; }
      if ((m = line.match(/^\s*#\s+(.*)$/))) { out.push('<h1>' + renderInline(m[1]) + '</h1>'); i++; continue; }

      // Horizontal rule
      if (/^\s*(\*\s*\*\s*\*|---|___)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

      // Blockquote (single-line level, simple)
      if ((m = line.match(/^\s*>\s?(.*)$/))) {
        const quote = [renderInline(m[1])];
        i++;
        while (i < lines.length) {
          const mm = lines[i].match(/^\s*>\s?(.*)$/);
          if (!mm) break;
          quote.push(renderInline(mm[1]));
          i++;
        }
        out.push('<blockquote>' + quote.join('<br>') + '</blockquote>');
        continue;
      }

      // Lists
      if (/^\s*[-*+]\s+/.test(line)) {
        const res = convertLists(lines, i, false);
        out.push(res.html);
        i = res.nextIndex;
        continue;
      }
      if (/^\s*\d+\.\s+/.test(line)) {
        const res = convertLists(lines, i, true);
        out.push(res.html);
        i = res.nextIndex;
        continue;
      }

      // Tables
      const tableRes = convertTable(lines, i);
      if (tableRes) {
        out.push(tableRes.html);
        i = tableRes.nextIndex;
        continue;
      }

      // Paragraph: accumulate until blank line
      const para = [line];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i])) {
        // stop if next line begins a block element
        if (/^\s*(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+|\*\s*\*\s*\*|---|___)\s*/.test(lines[i])) break;
        para.push(lines[i]);
        i++;
      }
      out.push('<p>' + renderInline(para.join(' ')) + '</p>');
    }

    let html = out.join('\n');

    // Restore code blocks
    html = html.replace(/@@MD_CODE_(\d+)@@/g, function(_, idx) {
      return codeBlocks[Number(idx)] || '';
    });

    return html;
  }

  function renderInto(element, markdown) {
    if (!element) return;
    if (!element.classList.contains('markdown-body')) {
      element.classList.add('markdown-body');
    }
    element.innerHTML = renderMarkdown(markdown);
  }

  function ensureStylesInjected() {
    try {
      if (document.getElementById('ext-markdown-css')) return;
      const link = document.createElement('link');
      link.id = 'ext-markdown-css';
      link.rel = 'stylesheet';
      link.href = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('markdown.css')
        : 'markdown.css';
      document.head.appendChild(link);
    } catch (e) {
      // ignore
    }
  }

  window.MarkdownRenderer = {
    render: renderMarkdown,
    renderInto: renderInto,
    ensureStylesInjected: ensureStylesInjected
  };
})();