// Sticky notes with a tag, built from plain Excalidraw elements (nothing here needs a newer Excalidraw).
//
// A sticky is a square rectangle with a fill colour, marked by customData { kind: 'sticky' }. Its text is Excalidraw's
// own bound text, so it wraps, and in stock Excalidraw the sticky is just a rectangle with text.
// A tag is a small rounded rectangle with bound text, marked by customData { kind: 'sticky-tag', for: <sticky id> }.
// It sits across the sticky's top edge and shares one group with the sticky, so the two move together.
// A sticky with no tag is not in a group, so a single double-click edits its text.
//
// This file only works out which elements to add, change or delete. It touches no page, so it also runs in Node.
// The page passes in `convert` (Excalidraw's convertToExcalidrawElements), which sizes the text.
(function (root) {
  var SIZE = 180;
  var TAG_MAX = 40;
  var TAG_OFFSET_X = 8;
  var TAG_OVERLAP = 14; // how far the tag reaches above the sticky's top edge
  var STAGGER = 24;

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

  // Short text for a tag: one line, trimmed, at most TAG_MAX characters.
  function cleanTag(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, TAG_MAX);
  }

  function colourNamed(name) {
    var found = COLOURS.filter(function (c) { return c.name === name; })[0];
    if (!found) throw new Error('Unknown sticky colour: ' + name);
    return found;
  }

  // The first spot at or after (x, y) where no live sticky starts, so new stickies do not hide each other.
  function freeSpot(elements, x, y) {
    var taken = elements.filter(function (e) { return live(e) && isSticky(e); });
    var spot = { x: Math.round(x), y: Math.round(y) };
    while (taken.some(function (e) { return e.x === spot.x && e.y === spot.y; })) {
      spot = { x: spot.x + STAGGER, y: spot.y + STAGGER };
    }
    return spot;
  }

  // The skeleton of one sticky, centred on (cx, cy). Excalidraw adds the text when the user types into it.
  function stickySkeleton(elements, cx, cy, colourName) {
    var spot = freeSpot(elements, cx - SIZE / 2, cy - SIZE / 2);
    return {
      type: 'rectangle', x: spot.x, y: spot.y, width: SIZE, height: SIZE,
      backgroundColor: colourNamed(colourName).fill, strokeColor: 'transparent', fillStyle: 'solid',
      strokeWidth: 1, roughness: 0, roundness: null, customData: { kind: 'sticky' },
    };
  }

  // The sticky that any selected piece belongs to (the sticky, its text, its tag or the tag's text), else null.
  function stickyFor(elements, selectedIds) {
    var byId = {};
    elements.forEach(function (e) { byId[e.id] = e; });
    for (var i = 0; i < elements.length; i++) {
      var e = elements[i];
      if (!live(e) || !selectedIds[e.id]) continue;
      if (isSticky(e)) return e;
      if (isTag(e) && byId[e.customData.for] && live(byId[e.customData.for])) return byId[e.customData.for];
      if (e.type === 'text' && e.containerId && byId[e.containerId]) {
        var box = byId[e.containerId];
        if (isSticky(box)) return box;
        if (isTag(box) && byId[box.customData.for] && live(byId[box.customData.for])) return byId[box.customData.for];
      }
    }
    return null;
  }

  function tagPartsOf(elements, sticky) {
    var pill = elements.filter(function (e) { return live(e) && isTag(e) && e.customData.for === sticky.id; })[0] || null;
    return { pill: pill, text: pill ? boundText(elements, pill) : null };
  }

  function tagOf(elements, sticky) {
    var parts = tagPartsOf(elements, sticky);
    return parts.text ? parts.text.text : '';
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

  function withoutGroup(e, groupId) {
    return touched(e, { groupIds: e.groupIds.filter(function (g) { return g !== groupId; }) });
  }

  function withGroup(e, groupId) {
    return e.groupIds.indexOf(groupId) >= 0 ? e : touched(e, { groupIds: e.groupIds.concat([groupId]) });
  }

  // Set, change or remove (empty text) the tag of `sticky`. Returns { elements, groupId }; groupId is null when
  // the sticky has no tag afterwards. Never edits an element in place: changed ones are copies with a new version.
  function setTag(elements, sticky, text, convert, newId) {
    var tag = cleanTag(text);
    var old = tagPartsOf(elements, sticky);
    var stickyText = boundText(elements, sticky);
    var groupId = old.pill ? old.pill.groupIds[old.pill.groupIds.length - 1] : null;
    var drop = {};
    if (old.pill) drop[old.pill.id] = true;
    if (old.text) drop[old.text.id] = true;

    if (!tag) {
      if (!groupId) return { elements: elements, groupId: null };
      return {
        elements: elements.map(function (e) {
          if (drop[e.id]) return touched(e, { isDeleted: true });
          if (e.id === sticky.id || (stickyText && e.id === stickyText.id)) return withoutGroup(e, groupId);
          return e;
        }),
        groupId: null,
      };
    }

    if (old.text && old.text.text === tag) return { elements: elements, groupId: groupId };
    groupId = groupId || newId();
    var skeleton = {
      type: 'rectangle', x: sticky.x + TAG_OFFSET_X, y: sticky.y - TAG_OVERLAP,
      backgroundColor: '#ffffff', strokeColor: '#1e1e1e', fillStyle: 'solid', strokeWidth: 1, roughness: 0,
      roundness: { type: 3 }, customData: { kind: 'sticky-tag', for: sticky.id },
      label: { text: tag, fontSize: 14, strokeColor: '#1e1e1e' },
    };
    var made = convert([skeleton]).map(function (e) { return touched(e, { groupIds: [groupId] }); });
    var kept = elements.map(function (e) {
      if (drop[e.id]) return touched(e, { isDeleted: true });
      if (e.id === sticky.id || (stickyText && e.id === stickyText.id)) return withGroup(e, groupId);
      return e;
    });
    return { elements: kept.concat(made), groupId: groupId };
  }

  var api = {
    SIZE: SIZE, TAG_MAX: TAG_MAX, COLOURS: COLOURS,
    isSticky: isSticky, isTag: isTag, cleanTag: cleanTag, freeSpot: freeSpot,
    stickySkeleton: stickySkeleton, stickyFor: stickyFor, tagOf: tagOf, setTag: setTag,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Stickies = api;
})(typeof window !== 'undefined' ? window : this);
