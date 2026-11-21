// Tests for viewer/stickies.js, run by tests/test_stickies.py with `node --test`. No browser: Excalidraw's own element
// builder is replaced by `convert` below, which returns the same shape (a rectangle plus its bound text, with the text sized).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../viewer/stickies.js');

let counter = 0;
function newId() { counter += 1; return 'g' + counter; }

function convert(skeletons) {
  const out = [];
  skeletons.forEach(function (s) {
    counter += 1;
    const rectId = 'r' + counter;
    const textId = 't' + counter;
    const label = s.label;
    const rect = Object.assign({ width: 50, height: 28 }, s, { id: rectId, version: 1, isDeleted: false, groupIds: [], boundElements: label ? [{ type: 'text', id: textId }] : null });
    delete rect.label;
    out.push(rect);
    if (label) {
      out.push({ id: textId, type: 'text', x: 0, y: 0, width: label.text.length * 8, height: 17.5, text: label.text, originalText: label.text, containerId: rectId, version: 1, isDeleted: false, groupIds: [], boundElements: null });
    }
  });
  return out;
}

// A sticky as Excalidraw leaves it once the user has typed into it: the rectangle and its bound text.
function stickyWithText(text, x, y) {
  const rect = convert([S.stickySkeleton([], (x || 300) + S.SIZE / 2, (y || 300) + S.SIZE / 2, 'yellow')])[0];
  const body = { id: 'body-' + rect.id, type: 'text', text: text, originalText: text, containerId: rect.id, version: 1, isDeleted: false, groupIds: [], boundElements: null };
  rect.boundElements = [{ type: 'text', id: body.id }];
  return [rect, body];
}

const live = (els) => els.filter((e) => !e.isDeleted);
const byId = (els, id) => els.find((e) => e.id === id);
const pillsOf = (els) => live(els).filter(S.isTag);
const textOf = (els, pill) => els.find((e) => e.type === 'text' && e.containerId === pill.id && !e.isDeleted);
const tagLabels = (els) => pillsOf(els).map((p) => textOf(els, p).text);
const tag = (els, sticky, tags) => S.setTags(els, sticky, tags, convert, newId);

test('a sticky is a roughly square, filled rectangle centred where asked', () => {
  const sk = S.stickySkeleton([], 500, 400, 'yellow');
  assert.equal(sk.type, 'rectangle');
  assert.equal(sk.width, sk.height);
  assert.equal(sk.x + sk.width / 2, 500);
  assert.equal(sk.y + sk.height / 2, 400);
  assert.equal(sk.backgroundColor, '#ffec99');
  assert.equal(sk.fillStyle, 'solid');
  assert.deepEqual(sk.customData, { kind: 'sticky' });
});

test('there are four colours and each makes a different fill', () => {
  const fills = S.COLOURS.map((c) => S.stickySkeleton([], 0, 0, c.name).backgroundColor);
  assert.deepEqual(S.COLOURS.map((c) => c.name), ['yellow', 'green', 'blue', 'pink']);
  assert.equal(new Set(fills).size, 4);
  assert.throws(() => S.stickySkeleton([], 0, 0, 'purple'), /Unknown sticky colour/);
});

test('a sticky at an occupied spot moves right, beside the first, not on top of it', () => {
  const first = convert([S.stickySkeleton([], 500, 400, 'green')]);
  const second = S.stickySkeleton(first, 500, 400, 'green');
  assert.equal(second.y, first[0].y);
  assert.ok(second.x >= first[0].x + S.SIZE, 'the two stickies do not overlap');
  first[0].isDeleted = true;
  assert.equal(S.stickySkeleton(first, 500, 400, 'green').x, first[0].x, 'a deleted sticky does not take the spot');
});

test('when the row reaches the edge of the view the next sticky starts a new row', () => {
  const view = { left: 0, right: 700 };
  let els = [];
  const spots = [];
  for (let i = 0; i < 5; i++) {
    const sk = S.stickySkeleton(els, 350, 100, 'blue', view);
    spots.push([sk.x, sk.y]);
    els = els.concat(convert([sk]));
  }
  spots.forEach(([x]) => assert.ok(x >= view.left && x + S.SIZE <= view.right, 'inside the view: ' + x));
  assert.equal(new Set(spots.map((s) => s.join(','))).size, 5, 'no two share a spot');
  assert.ok(spots[4][1] > spots[0][1], 'the later ones are on a lower row');
});

test('tags are typed as a comma-separated list: trimmed, one line each, no repeats, a few at most', () => {
  assert.deepEqual(S.tagList(' Urgent , later,,  '), ['Urgent', 'later']);
  assert.deepEqual(S.tagList('Urgent, urgent, URGENT'), ['Urgent']);
  assert.deepEqual(S.tagList('a\n b\tc'), ['a b c']);
  assert.equal(S.tagList('x'.repeat(100))[0].length, S.TAG_MAX);
  assert.equal(S.tagList('1,2,3,4,5,6,7').length, S.TAGS_MAX);
  assert.deepEqual(S.tagList(''), []);
  assert.deepEqual(S.tagList(null), []);
});

test('tags are added, grouped with the sticky and shown as text', () => {
  const els = stickyWithText('Pay the invoice');
  const r = tag(els, els[0], ['Urgent', 'Finance']);
  assert.ok(r.groupId);
  assert.deepEqual(tagLabels(r.elements), ['Urgent', 'Finance']);
  assert.deepEqual(S.tagsOf(r.elements, byId(r.elements, els[0].id)), ['Urgent', 'Finance']);
  const members = live(r.elements).filter((e) => e.groupIds.includes(r.groupId));
  assert.equal(members.length, 6, 'sticky, its text, and each tag with its text share one group');
});

test('tags sit inside the sticky at the bottom right, in rows that stay inside it', () => {
  const els = stickyWithText('x');
  const sticky = els[0];
  const one = tag(els, sticky, ['Urgent']).elements;
  const pill = pillsOf(one)[0];
  assert.equal(Math.round(pill.x + pill.width), sticky.x + S.SIZE - 8, 'right edge inset 8 from the sticky right edge');
  assert.equal(Math.round(pill.y + pill.height), sticky.y + S.SIZE - 8, 'bottom edge inset 8 from the sticky bottom edge');
  const four = tag(els, sticky, ['Alpha', 'Bravo', 'Charlie', 'Delta']).elements;
  const boxes = pillsOf(four);
  assert.equal(boxes.length, 4);
  boxes.forEach((p) => {
    assert.ok(p.x >= sticky.x && p.x + p.width <= sticky.x + S.SIZE, 'inside horizontally');
    assert.ok(p.y >= sticky.y && p.y + p.height <= sticky.y + S.SIZE, 'inside vertically');
    const t = textOf(four, p);
    assert.ok(t.x >= p.x && t.x + t.width <= p.x + p.width && t.y >= p.y && t.y + t.height <= p.y + p.height, 'text inside its pill');
  });
  boxes.forEach((a, i) => boxes.forEach((b, j) => {
    if (i < j) assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, 'no two tags overlap');
  }));
  assert.ok(new Set(boxes.map((p) => p.y)).size >= 2, 'four wide tags need more than one row');
});

test('changing the tags deletes the old ones and keeps the same group', () => {
  const els = stickyWithText('x');
  const one = tag(els, els[0], ['Urgent', 'Finance']);
  const two = tag(one.elements, one.elements[0], ['Later']);
  assert.equal(two.groupId, one.groupId);
  assert.deepEqual(tagLabels(two.elements), ['Later']);
  assert.equal(two.elements.filter((e) => e.isDeleted).length, 4, 'both old tags and their texts are deleted');
});

test('no tags removes them all and takes the sticky out of the tag group', () => {
  const els = stickyWithText('x');
  const one = tag(els, els[0], ['Urgent', 'Later']);
  const gone = tag(one.elements, one.elements[0], []);
  assert.equal(gone.groupId, null);
  assert.deepEqual(S.tagsOf(gone.elements, byId(gone.elements, els[0].id)), []);
  live(gone.elements).forEach((e) => assert.deepEqual(e.groupIds, []));
  assert.equal(live(gone.elements).length, 2);
});

test('the same tags again, or none on an untagged sticky, change nothing', () => {
  const els = stickyWithText('x');
  assert.equal(tag(els, els[0], []).elements, els);
  const one = tag(els, els[0], ['Urgent', 'Later']);
  assert.equal(tag(one.elements, one.elements[0], ['Urgent', 'Later']).elements, one.elements);
});

test('tagging never edits the elements it was given', () => {
  const els = stickyWithText('x');
  const before = JSON.stringify(els);
  const one = tag(els, els[0], ['Urgent']);
  const afterOne = JSON.stringify(one.elements);
  tag(one.elements, one.elements[0], []);
  assert.equal(JSON.stringify(els), before);
  assert.equal(JSON.stringify(one.elements), afterOne);
});

test('each change bumps the version of the elements it touches', () => {
  const els = stickyWithText('x');
  const r = tag(els, els[0], ['Urgent']);
  assert.ok(r.elements[0].version > els[0].version);
  assert.ok(r.elements[1].version > els[1].version);
});

test('a sticky already in a bigger group keeps it: the tag group sits inside it', () => {
  const els = stickyWithText('x');
  els[0].groupIds = ['outer'];
  els[1].groupIds = ['outer'];
  const r = tag(els, els[0], ['Urgent']);
  const sticky = byId(r.elements, els[0].id);
  assert.deepEqual(sticky.groupIds, [r.groupId, 'outer']);
  pillsOf(r.elements).forEach((p) => assert.deepEqual(p.groupIds, [r.groupId, 'outer']));
  const gone = tag(r.elements, sticky, []);
  assert.deepEqual(byId(gone.elements, els[0].id).groupIds, ['outer']);
});

test('a copy of a tagged sticky has its own tags: the link is the group, not an id', () => {
  const els = stickyWithText('x');
  const r = tag(els, els[0], ['Urgent', 'Later']).elements;
  // What Excalidraw does on duplicate: new ids everywhere, one new id for each group, customData copied as it was.
  const copy = r.filter((e) => !e.isDeleted).map((e) => Object.assign({}, JSON.parse(JSON.stringify(e)), {
    id: 'copy-' + e.id,
    containerId: e.containerId ? 'copy-' + e.containerId : null,
    boundElements: e.boundElements && e.boundElements.map((b) => ({ type: b.type, id: 'copy-' + b.id })),
    groupIds: e.groupIds.map((g) => 'copy-' + g),
  }));
  const all = r.concat(copy);
  const copySticky = copy.find(S.isSticky);
  assert.deepEqual(S.tagsOf(all, copySticky), ['Urgent', 'Later']);
  const changed = tag(all, copySticky, ['Other']);
  assert.deepEqual(S.tagsOf(changed.elements, byId(changed.elements, els[0].id)), ['Urgent', 'Later'], 'the original keeps its tags');
  assert.deepEqual(S.tagsOf(changed.elements, byId(changed.elements, copySticky.id)), ['Other']);
});

test('selecting only pieces of one sticky finds the sticky; anything else selected finds none', () => {
  const els = stickyWithText('x');
  const r = tag(els, els[0], ['Urgent']).elements;
  const [sticky, body] = r;
  const pill = pillsOf(r)[0];
  const pillText = textOf(r, pill);
  [sticky, body, pill, pillText].forEach((piece) => assert.equal(S.stickyFor(r, { [piece.id]: true }), sticky));
  assert.equal(S.stickyFor(r, { [sticky.id]: true, [body.id]: true, [pill.id]: true, [pillText.id]: true }), sticky);
  assert.equal(S.stickyFor(r, {}), null);
  const plain = { id: 'plain', type: 'rectangle', isDeleted: false, groupIds: [] };
  assert.equal(S.stickyFor(r.concat([plain]), { plain: true }), null);
  assert.equal(S.stickyFor(r.concat([plain]), { [sticky.id]: true, plain: true }), null, 'a sticky plus another shape is not "a sticky"');
  const other = stickyWithText('y', 700, 700);
  assert.equal(S.stickyFor(r.concat(other), { [sticky.id]: true, [other[0].id]: true }), null, 'two stickies are not "a sticky"');
});

// The reload case: a board file saved by the viewer (through Excalidraw's own save) with one sticky and two tags.
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tagged-sticky.excalidraw'), 'utf8'));

test('a saved board brings the sticky and its tags back', () => {
  const els = fixture.elements;
  const sticky = els.find(S.isSticky);
  assert.ok(sticky);
  assert.deepEqual(S.tagsOf(els, sticky), ['Urgent', 'Finance']);
  assert.equal(S.stickyFor(els, { [els.find(S.isTag).id]: true }), sticky);
});

test('tags can be changed and removed on a reloaded board', () => {
  const els = fixture.elements;
  const sticky = els.find(S.isSticky);
  const changed = tag(els, sticky, ['Later']);
  assert.deepEqual(S.tagsOf(changed.elements, sticky), ['Later']);
  assert.deepEqual(S.tagsOf(tag(changed.elements, sticky, []).elements, sticky), []);
});

test('the board stays plain Excalidraw JSON: stock element fields plus customData, nothing else', () => {
  const stock = new Set(['id', 'type', 'x', 'y', 'width', 'height', 'angle', 'strokeColor', 'backgroundColor', 'fillStyle', 'strokeWidth',
    'strokeStyle', 'roughness', 'opacity', 'groupIds', 'frameId', 'roundness', 'seed', 'version', 'versionNonce', 'isDeleted',
    'boundElements', 'updated', 'link', 'locked', 'customData', 'text', 'fontSize', 'fontFamily', 'textAlign', 'verticalAlign',
    'baseline', 'containerId', 'originalText', 'lineHeight']);
  fixture.elements.forEach((e) => {
    Object.keys(e).forEach((k) => assert.ok(stock.has(k), 'unexpected field ' + k));
    if (e.customData) assert.deepEqual(Object.keys(e.customData), ['kind']);
    if (e.customData) assert.ok(['sticky', 'sticky-tag'].includes(e.customData.kind));
  });
  assert.deepEqual(JSON.parse(JSON.stringify(fixture)), fixture);
  fixture.elements.filter((e) => e.type === 'text').forEach((t) => {
    const box = fixture.elements.find((b) => b.id === t.containerId);
    assert.ok(box.boundElements.some((b) => b.id === t.id), 'bound text is listed by its container');
  });
});
