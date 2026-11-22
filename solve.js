// A fast drop-in for csv-reader 1.0.0 (make.fun's reference CSV reader).
//
// run(input) returns exactly csv-reader's answer for {text, header}: {columns, rows, errors}, under the same
// broken-row policy: a U+FEFF at the start is dropped; a record ends at LF or CRLF and an empty line is no
// record; a stray CR outside quotes is dropped (stray_cr); a quoted field runs to the next undoubled quote,
// "" inside it is one quote, CRLF and lone CR inside it read as LF, text after the closing quote is appended
// as it stands (quote_junk), and a quote that never closes is a literal character whose text is read again
// as unquoted (unterminated_quote); fields stay strings; rows are padded (short_row) or cut (long_row) to
// the first record's width; errors are {code, line, row} in the order met.
//
// Where the reference walks the text a character at a time and builds every field a character at a time,
// this reader slices whole fields out of the text: an unquoted field is one slice unless a stray CR splits
// it, and a quoted field is found with indexOf and sliced segment by segment. Pure: nothing is kept from
// one call to the next.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input, computed faster. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field being read: its value, how it ended (COMMA / LINE_BREAK / END) and, for the quote_junk test,
  // how many characters an unquoted read kept.
  let fVal = '';
  let fEnded = END;
  let fAdded = 0;

  // Reads unquoted characters onto `init` up to the next comma or line break: a CR not followed by LF is
  // dropped (stray_cr). Sets fVal, fEnded and fAdded.
  //
  // The common field holds no CR at all: find its end with indexOf (the scans stay inside the record: a
  // comma or a line break is always near), slice it out, and check the slice for a CR — a scan of the
  // whole text for one could run to a CR far away. The slice's only CR may be the line break's own, at
  // its last character. Any other CR means a stray is present, and the field is read a character at a
  // time below.
  function readUnquoted(init) {
    const start = pos;
    const comma = text.indexOf(',', start);
    const lf = text.indexOf('\n', start);
    let end = n;
    let ended = END;
    if (comma !== -1 && (lf === -1 || comma < lf)) {
      end = comma;
      ended = COMMA;
    } else if (lf !== -1) {
      end = lf;
      ended = LINE_BREAK;
    }
    const seg = text.slice(start, end);
    const cr = seg.indexOf('\r');
    if (cr === -1 || (cr === seg.length - 1 && ended === LINE_BREAK)) {
      const kept = cr === -1 ? seg : seg.slice(0, seg.length - 1);
      fVal = init + kept;
      fAdded = kept.length;
      fEnded = ended;
      if (ended === LINE_BREAK) line += 1;
      pos = ended === END ? n : end + 1;
      return;
    }
    readUnquotedSlow(init);
  }

  // readUnquoted, a character at a time, for a field that holds a stray CR.
  function readUnquotedSlow(init) {
    let i = pos;
    let seg = i; // the start of the segment being scanned
    let parts = null; // the kept segments, once a stray CR has split the field
    let kept = 0; // characters kept in the segments already pushed
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c > 44) {
        // Above the comma: no special lives there, and most field characters do.
        i += 1;
        continue;
      }
      if (c === 44) {
        // ','
        fEnded = COMMA;
        pos = i + 1;
        if (parts === null) {
          fVal = init + text.slice(seg, i);
          fAdded = i - seg;
        } else {
          parts.push(text.slice(seg, i));
          fVal = parts.join('');
          fAdded = kept + (i - seg);
        }
        return;
      }
      if (c === 10) {
        // LF
        fEnded = LINE_BREAK;
        pos = i + 1;
        line += 1;
        if (parts === null) {
          fVal = init + text.slice(seg, i);
          fAdded = i - seg;
        } else {
          parts.push(text.slice(seg, i));
          fVal = parts.join('');
          fAdded = kept + (i - seg);
        }
        return;
      }
      if (c === 13) {
        // CR: a line break when LF follows, a dropped stray otherwise
        if (text.charCodeAt(i + 1) === 10) {
          fEnded = LINE_BREAK;
          pos = i + 2;
          line += 1;
          if (parts === null) {
            fVal = init + text.slice(seg, i);
            fAdded = i - seg;
          } else {
            parts.push(text.slice(seg, i));
            fVal = parts.join('');
            fAdded = kept + (i - seg);
          }
          return;
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        if (parts === null) parts = [init, text.slice(seg, i)];
        else parts.push(text.slice(seg, i));
        kept += i - seg;
        i += 1;
        seg = i;
        continue;
      }
      i += 1;
    }
    fEnded = END;
    pos = n;
    if (parts === null) {
      fVal = init + text.slice(seg, n);
      fAdded = n - seg;
    } else {
      parts.push(text.slice(seg, n));
      fVal = parts.join('');
      fAdded = kept + (n - seg);
    }
  }

  // The value of the quoted segment text[a..b): each CRLF or lone CR inside it becomes one LF, and `line`
  // advances past every line break inside it. The segment is sliced first so every scan stays inside it:
  // an indexOf on the whole text would run on to the next CR or LF anywhere in the file, however far away.
  function segmentText(a, b) {
    const seg = text.slice(a, b);
    if (seg.indexOf('\r') === -1) {
      // No CR: the segment stands as it is; count its LFs.
      let j = seg.indexOf('\n');
      while (j !== -1) {
        line += 1;
        j = seg.indexOf('\n', j + 1);
      }
      return seg;
    }
    // A CR is present: split at every break (CRLF, lone CR, LF) and rejoin with LF; each break is one line.
    const pieces = seg.split(/\r\n|\r|\n/);
    line += pieces.length - 1;
    return pieces.join('\n');
  }

  // Reads a quoted field whose opening quote is at pos. Sets fVal and fEnded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let i = pos + 1;
    let segStart = i;
    let parts = null; // the value's pieces, once a doubled quote splits it
    while (true) {
      const q = text.indexOf('"', i);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        readUnquoted('"');
        return;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: the segment before it, then one literal quote.
        if (parts === null) parts = [];
        parts.push(segmentText(segStart, q));
        parts.push('"');
        i = q + 2;
        segStart = i;
        continue;
      }
      // The closing quote.
      let value;
      if (parts === null) {
        value = segmentText(segStart, q);
      } else {
        parts.push(segmentText(segStart, q));
        value = parts.join('');
      }
      pos = q + 1;
      if (pos >= n) {
        fVal = value;
        fEnded = END;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fVal = value;
        fEnded = COMMA;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fVal = value;
        fEnded = LINE_BREAK;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fVal = value;
        fEnded = LINE_BREAK;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the next comma or line break.
      readUnquoted(value);
      if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      return;
    }
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fVal);
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
