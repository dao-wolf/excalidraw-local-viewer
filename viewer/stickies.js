// Sticky notes with tags, built from plain Excalidraw elements (nothing here needs a newer Excalidraw).
//
// A sticky is a square rectangle with a fill colour, marked by customData { kind: 'sticky' }. Its text is Excalidraw's
// own bound text, so it wraps, and in stock Excalidraw the sticky is just a rectangle with text.
// The full list of tags is kept on the sticky: customData { kind: 'sticky', tags: ['Urgent', ...] }. What is drawn is a short
// view of it. A tag is drawn as a small rounded rectangle with bound text, marked by customData { kind: 'sticky-tag' }. At
// most three are drawn: a list of more than three shows its first two and then "+N" for the rest, and a long name is cut
// short with an ellipsis. They sit inside the sticky at the bottom right, in rows that fill upwards, and share one group with
// the sticky, so they move together. The link between a sticky and its tags is that group: the innermost group id of the sticky is the
// innermost group id of each of its tags. (A copy made by Excalidraw gets new group ids, so a copy keeps working.)
// The drawn tags are locked (Excalidraw's own `locked`), so a click or double-click on one reaches the sticky instead: tags
// are changed only in the tag box, never on the board.
// A sticky with no tags is not in that group, so a single double-click edits its text.
//
// This file only works out which elements to add, change or delete. It touches no page, so it also runs in Node.
// The page passes in `tools`: { convert, newId }. `convert` is Excalidraw's convertToExcalidrawElements, which sizes the
// text, and `newId` makes a new group id.
(function (root) {
  var SIZE = 180;
  var STEP = SIZE + 16; // distance from one sticky to the next in a row
  var VIEW_MARGIN = 16;
  var TAG_MAX = 20; // characters in one tag
  var TAGS_MAX = 10;
  var TAGS_SHOWN = 3; // most tags drawn on a sticky, the "+N" one included
  var SHOWN_CHARS = 8; // most characters of one tag drawn, the ellipsis included
  var TAG_INSET = 8; // gap between the tags and the sticky's edges
  var TAG_GAP = 4;
  var TAG_PAD_X = 6;
  var TAG_PAD_Y = 3;
  var TAG_FONT_SIZE = 14;
  var HELVETICA = 2; // the sample board's font; the tag is metadata, so it differs from the sticky's own text

  // Excalidraw's own palette (the light shades of its yellow, green, blue and red).
  var COLOURS = [
    { name: 'yellow', fill: '#ffec99' },
    { name: 'green', fill: '#b2f2bb' },
    { name: 'blue', fill: '#a5d8ff' },
    { name: 'pink', fill: '#ffc9c9' },
  ];

  function live(e) { return !e.isDeleted; }
  function kindOf(e) { return e.customData && e.customData.kind; }
  function isSticky(e) { return e.type === 'rectangle' && kindOf(e) === 'sticky'; }
  function isTag(e) { return e.type === 'rectangle' && kindOf(e) === 'sticky-tag'; }
  function boundText(elements, container) {
    return elements.filter(function (e) { return live(e) && e.type === 'text' && e.containerId === container.id; })[0] || null;
  }
  function innermost(e) { return e.groupIds.length ? e.groupIds[0] : null; }
  function indexById(elements) {
    var byId = {};
    elements.forEach(function (e) { byId[e.id] = e; });
    return byId;
  }
  function sameList(a, b) {
    return a.length === b.length && a.every(function (item, i) { return item === b[i]; });
  }

  // One tag: one line, trimmed, at most TAG_MAX characters.
  function cleanTag(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, TAG_MAX);
  }

  // What the user types in the tag box: tags separated by commas. Empty and repeated ones (ignoring case) go, and so do
  // all after the TAGS_MAX-th.
  function tagList(text) {
    var seen = {};
    return String(text || '').split(',').map(cleanTag).filter(function (t) {
      var key = t.toLowerCase();
      if (!t || seen[key]) return false;
      seen[key] = true;
      return true;
    }).slice(0, TAGS_MAX);
  }

  function colourNamed(name) {
    var found = COLOURS.filter(function (c) { return c.name === name; })[0];
    if (!found) throw new Error('Unknown sticky colour: ' + name);
    return found;
  }

  // The first spot at or after (x, y) where no live sticky starts. It moves right, beside the stickies already there. With
  // `view` ({ left, right } in board coordinates) a row that would pass the right edge starts again at the left, one row down.
  function freeSpot(elements, x, y, view) {
    var taken = elements.filter(function (e) { return live(e) && isSticky(e); });
    var wraps = view && view.right - view.left >= SIZE + 2 * VIEW_MARGIN;
    var spot = { x: Math.round(x), y: Math.round(y) };
    for (var tries = 0; tries < 1000 && taken.some(function (e) { return e.x === spot.x && e.y === spot.y; }); tries++) {
      spot = { x: spot.x + STEP, y: spot.y };
      if (wraps && spot.x + SIZE > view.right) spot = { x: Math.round(view.left + VIEW_MARGIN), y: spot.y + STEP };
    }
    return spot;
  }

  // The skeleton of one sticky, centred on `centre` ({ x, y }). Excalidraw adds the text when the user types into it.
  function stickySkeleton(elements, centre, colourName, view) {
    var spot = freeSpot(elements, centre.x - SIZE / 2, centre.y - SIZE / 2, view);
    return {
      type: 'rectangle', x: spot.x, y: spot.y, width: SIZE, height: SIZE,
      backgroundColor: colourNamed(colourName).fill, strokeColor: 'transparent', fillStyle: 'solid',
      strokeWidth: 1, roughness: 0, roundness: null, customData: { kind: 'sticky' },
    };
  }

  // A text bound to a shape counts as that shape.
  function shapeOf(byId, e) {
    if (e.type !== 'text') return e;
    return byId[e.containerId] || e;
  }

  // The live sticky whose innermost group is `group`, or null.
  function stickyInGroup(elements, group) {
    if (!group) return null;
    return elements.filter(function (s) { return live(s) && isSticky(s) && innermost(s) === group; })[0] || null;
  }

  // The sticky that a selected element belongs to: the sticky, its text, one of its tags or a tag's text.
  function ownerOf(elements, byId, e) {
    var shape = shapeOf(byId, e);
    if (isSticky(shape)) return shape;
    return isTag(shape) ? stickyInGroup(elements, innermost(shape)) : null;
  }

  // The live elements among the selected ids.
  function selectedElements(byId, selectedIds) {
    return Object.keys(selectedIds)
      .filter(function (id) { return selectedIds[id] && byId[id] && live(byId[id]); })
      .map(function (id) { return byId[id]; });
  }

  // The sticky the selection is made of, or null: the selection must hold pieces of one sticky and nothing else.
  function stickyFor(elements, selectedIds) {
    var byId = indexById(elements);
    var owners = selectedElements(byId, selectedIds).map(function (e) { return ownerOf(elements, byId, e); });
    var first = owners[0] || null;
    return owners.every(function (owner) { return owner === first; }) ? first : null;
  }

  // The live tags of a sticky (rectangles, in the order they were made).
  function pillsOf(elements, sticky) {
    var group = innermost(sticky);
    if (!group) return [];
    return elements.filter(function (e) { return live(e) && isTag(e) && innermost(e) === group; });
  }

  // The full list of tags of a sticky.
  function tagsOf(elements, sticky) {
    return (sticky.customData && sticky.customData.tags) || [];
  }

  // What is drawn for a list of tags: each name cut to SHOWN_CHARS, and with more than TAGS_SHOWN of them the first
  // TAGS_SHOWN - 1 and then "+N" for the rest.
  function shownTags(tags) {
    var labels = tags.map(function (t) { return t.length > SHOWN_CHARS ? t.slice(0, SHOWN_CHARS - 1) + '…' : t; });
    if (labels.length <= TAGS_SHOWN) return labels;
    return labels.slice(0, TAGS_SHOWN - 1).concat(['+' + (labels.length - (TAGS_SHOWN - 1))]);
  }

  // Excalidraw reads a changed version as a change, so every edit bumps it.
  function touched(e, patch) {
    var next = {};
    Object.keys(e).forEach(function (k) { next[k] = e[k]; });
    Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
    next.version = (e.version || 0) + 1;
    next.versionNonce = Math.floor(Math.random() * 2147483647);
    next.updated = Date.now();
    return next;
  }

  // Place sized tags inside the sticky, whatever size it has been resized to: rows from the bottom up, each row against the
  // right edge, a tag that no longer fits starting the next row up. `parts` is [{ rect, text }] and the result has the same
  // shape and order, moved and resized.
  function layoutTags(sticky, parts) {
    var room = sticky.width - 2 * TAG_INSET;
    var boxes = parts.map(function (p) {
      return { part: p, w: Math.ceil(p.text.width + 2 * TAG_PAD_X), h: Math.ceil(p.text.height + 2 * TAG_PAD_Y) };
    });
    var rows = [];
    var row = [];
    var used = 0;
    boxes.forEach(function (b) {
      if (row.length && used + TAG_GAP + b.w > room) { rows.push(row); row = []; used = 0; }
      used += (row.length ? TAG_GAP : 0) + b.w;
      row.push(b);
    });
    if (row.length) rows.push(row);

    var right = sticky.x + sticky.width - TAG_INSET;
    var top = sticky.y + sticky.height - TAG_INSET;
    rows.forEach(function (r) {
      var rowH = Math.max.apply(null, r.map(function (b) { return b.h; }));
      var rowW = r.reduce(function (sum, b) { return sum + b.w; }, 0) + TAG_GAP * (r.length - 1);
      var x = right - rowW;
      top -= rowH;
      r.forEach(function (b) {
        b.x = x; b.y = top; b.h = rowH;
        x += b.w + TAG_GAP;
      });
      top -= TAG_GAP;
    });
    return boxes.map(function (b) {
      var t = b.part.text;
      return {
        rect: touched(b.part.rect, { x: b.x, y: b.y, width: b.w, height: b.h }),
        text: touched(t, { x: b.x + (b.w - t.width) / 2, y: b.y + (b.h - t.height) / 2 }),
      };
    });
  }

  function tagSkeleton(sticky, text) {
    return {
      type: 'rectangle', x: sticky.x, y: sticky.y,
      backgroundColor: '#ffffff', strokeColor: '#868e96', fillStyle: 'solid', strokeWidth: 1, roughness: 0,
      roundness: { type: 3 }, customData: { kind: 'sticky-tag' },
      label: { text: text, fontSize: TAG_FONT_SIZE, fontFamily: HELVETICA, strokeColor: '#1e1e1e' },
    };
  }

  // The group a sticky shares with its drawn tags (`pills`), or null when it has none drawn.
  function tagGroup(sticky, pills) {
    return pills.length ? innermost(sticky) : null;
  }

  // The sticky's group ids once its tag group is `groupId` (null for none): that group innermost, then the groups it was
  // already in outside its tag group.
  function groupIdsFor(sticky, oldGroup, groupId) {
    var outer = oldGroup ? sticky.groupIds.slice(1) : sticky.groupIds;
    return groupId ? [groupId].concat(outer) : outer;
  }

  function stickyData(tags) {
    return tags.length ? { kind: 'sticky', tags: tags } : { kind: 'sticky' };
  }

  // `elements` with the given tags (rectangles) and their texts marked deleted.
  function withoutTags(elements, pills) {
    var gone = {};
    pills.forEach(function (pill) {
      gone[pill.id] = true;
      var text = boundText(elements, pill);
      if (text) gone[text.id] = true;
    });
    return elements.map(function (e) { return gone[e.id] ? touched(e, { isDeleted: true }) : e; });
  }

  // `elements` with the sticky and its text moved into `groupIds`, and the sticky holding `tags`.
  function regrouped(elements, sticky, groupIds, tags) {
    var text = boundText(elements, sticky);
    return elements.map(function (e) {
      if (e.id === sticky.id) return touched(e, { groupIds: groupIds, customData: stickyData(tags) });
      if (text && e.id === text.id) return sameList(e.groupIds, groupIds) ? e : touched(e, { groupIds: groupIds });
      return e;
    });
  }

  // The tags to draw for a list of tags: their short view, sized by `convert`, placed inside the sticky, in the group, locked.
  function drawTags(sticky, tags, groupIds, convert) {
    var made = convert(shownTags(tags).map(function (t) { return tagSkeleton(sticky, t); }));
    var parts = made.filter(function (e) { return e.type === 'rectangle'; }).map(function (rect) {
      return { rect: rect, text: made.filter(function (e) { return e.containerId === rect.id; })[0] };
    });
    var placed = [];
    layoutTags(sticky, parts).forEach(function (p) {
      placed.push(touched(p.rect, { groupIds: groupIds, locked: true }), touched(p.text, { groupIds: groupIds, locked: true }));
    });
    return placed;
  }

  // Set the tags of `sticky` to `tags` (an array of cleaned strings; empty removes them all). `tools` is { convert, newId }.
  // Returns { elements, groupId }: groupId is null when the sticky has no tags afterwards. Never edits an element in place:
  // changed ones are copies with a new version. Every change rebuilds all the tags, so they are always laid out as one set.
  function setTags(elements, sticky, tags, tools) {
    var olds = pillsOf(elements, sticky);
    var oldGroup = tagGroup(sticky, olds);
    if (sameList(tagsOf(elements, sticky), tags)) return { elements: elements, groupId: oldGroup };

    var groupId = tags.length ? oldGroup || tools.newId() : null;
    var groupIds = groupIdsFor(sticky, oldGroup, groupId);
    var kept = regrouped(withoutTags(elements, olds), sticky, groupIds, tags);
    if (!groupId) return { elements: kept, groupId: null };
    return { elements: kept.concat(drawTags(sticky, tags, groupIds, tools.convert)), groupId: groupId };
  }

  var api = {
    SIZE: SIZE, TAG_MAX: TAG_MAX, TAGS_MAX: TAGS_MAX, SHOWN_CHARS: SHOWN_CHARS, COLOURS: COLOURS,
    isSticky: isSticky, isTag: isTag, tagList: tagList, freeSpot: freeSpot,
    stickySkeleton: stickySkeleton, stickyFor: stickyFor, tagsOf: tagsOf, shownTags: shownTags, setTags: setTags,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Stickies = api;
})(typeof window !== 'undefined' ? window : this);
