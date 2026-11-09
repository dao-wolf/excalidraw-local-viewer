// Tests for viewer/stickies.js, run by tests/test_stickies.py with `node --test`. No browser: Excalidraw's own element
// builder is replaced by `convert` below, which returns the same shape (a rectangle plus its bound text).
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
      out.push({ id: textId, type: 'text', x: s.x + 5, y: s.y + 5, text: label.text, originalText: label.text, containerId: rectId, version: 1, isDeleted: false, groupIds: [], boundElements: null });
    }
  });
  return out;
}

// A sticky as Excalidraw leaves it once the user has typed into it: the rectangle and its bound text.
function stickyWithText(text) {
  const rect = convert([S.stickySkeleton([], 300, 300, 'yellow')])[0];
  const body = { id: 'body-' + rect.id, type: 'text', text: text, originalText: text, containerId: rect.id, version: 1, isDeleted: false, groupIds: [], boundElements: null };
  rect.boundElements = [{ type: 'text', id: body.id }];
  return [rect, body];
}

const live = (els) => els.filter((e) => !e.isDeleted);
const tagLabels = (els) => live(els).filter((e) => e.type === 'text' && e.containerId && S.isTag(els.find((b) => b.id === e.containerId))).map((e) => e.text);

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

test('a second sticky at the same spot is shifted so it does not hide the first', () => {
  const first = convert([S.stickySkeleton([], 500, 400, 'green')]);
  const second = S.stickySkeleton(first, 500, 400, 'green');
  assert.notEqual(second.x, first[0].x);
  assert.notEqual(second.y, first[0].y);
  first[0].isDeleted = true;
  assert.equal(S.stickySkeleton(first, 500, 400, 'green').x, 410, 'a deleted sticky does not take the spot');
});

test('a tag is added, grouped with the sticky and shown as text', () => {
  const els = stickyWithText('Pay the invoice');
  const r = S.setTag(els, els[0], '  Urgent ', convert, newId);
  assert.ok(r.groupId);
  assert.deepEqual(tagLabels(r.elements), ['Urgent']);
  assert.equal(S.tagOf(r.elements, els[0]), 'Urgent');
  const members = live(r.elements).filter((e) => e.groupIds.includes(r.groupId));
  assert.equal(members.length, 4, 'sticky, its text, the tag and its text share one group');
  const pill = live(r.elements).find(S.isTag);
  assert.equal(pill.customData.for, els[0].id);
  assert.ok(pill.y < els[0].y && pill.y + pill.height > els[0].y, 'the tag crosses the sticky top edge');
});

test('a tag is changed: the old one is deleted, the new one takes its place in the same group', () => {
  const els = stickyWithText('x');
  const one = S.setTag(els, els[0], 'Urgent', convert, newId);
  const two = S.setTag(one.elements, one.elements[0], 'Later', convert, newId);
  assert.equal(two.groupId, one.groupId);
  assert.deepEqual(tagLabels(two.elements), ['Later']);
  assert.equal(live(two.elements).filter(S.isTag).length, 1);
  assert.equal(two.elements.filter((e) => e.isDeleted).length, 2);
});

test('an empty tag removes it and ungroups the sticky', () => {
  const els = stickyWithText('x');
  const one = S.setTag(els, els[0], 'Urgent', convert, newId);
  const gone = S.setTag(one.elements, one.elements[0], '   ', convert, newId);
  assert.equal(gone.groupId, null);
  assert.equal(S.tagOf(gone.elements, els[0]), '');
  live(gone.elements).forEach((e) => assert.deepEqual(e.groupIds, []));
  assert.equal(live(gone.elements).length, 2);
});

test('the same tag again, or no tag on an untagged sticky, changes nothing', () => {
  const els = stickyWithText('x');
  assert.equal(S.setTag(els, els[0], '', convert, newId).elements, els);
  const one = S.setTag(els, els[0], 'Urgent', convert, newId);
  assert.equal(S.setTag(one.elements, one.elements[0], 'Urgent', convert, newId).elements, one.elements);
});

test('tags are one short line', () => {
  assert.equal(S.cleanTag('a\n  b\tc'), 'a b c');
  assert.equal(S.cleanTag('x'.repeat(100)).length, S.TAG_MAX);
  assert.equal(S.cleanTag(null), '');
});

test('setTag never edits the elements it was given', () => {
  const els = stickyWithText('x');
  const before = JSON.stringify(els);
  const one = S.setTag(els, els[0], 'Urgent', convert, newId);
  const afterOne = JSON.stringify(one.elements);
  S.setTag(one.elements, one.elements[0], '', convert, newId);
  assert.equal(JSON.stringify(els), before);
  assert.equal(JSON.stringify(one.elements), afterOne);
});

test('each change bumps the version of the elements it touches', () => {
  const els = stickyWithText('x');
  const r = S.setTag(els, els[0], 'Urgent', convert, newId);
  assert.ok(r.elements[0].version > els[0].version);
  assert.ok(r.elements[1].version > els[1].version);
});

test('selecting any piece of a sticky finds the sticky', () => {
  const els = stickyWithText('x');
  const r = S.setTag(els, els[0], 'Urgent', convert, newId).elements;
  const [sticky, body] = r;
  const pill = r.find(S.isTag);
  const pillText = r.find((e) => e.containerId === pill.id);
  [sticky, body, pill, pillText].forEach((piece) => assert.equal(S.stickyFor(r, { [piece.id]: true }), sticky));
  assert.equal(S.stickyFor(r, {}), null);
  assert.equal(S.stickyFor([{ id: 'plain', type: 'rectangle', isDeleted: false, groupIds: [] }], { plain: true }), null);
});

// The reload case: a board file saved by the viewer (through Excalidraw's own save) with one tagged sticky.
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tagged-sticky.excalidraw'), 'utf8'));

test('a saved board brings the sticky and its tag back', () => {
  const els = fixture.elements;
  const sticky = els.find(S.isSticky);
  assert.ok(sticky);
  assert.equal(S.tagOf(els, sticky), 'Later');
  assert.equal(S.stickyFor(els, { [els.find(S.isTag).id]: true }), sticky);
});

test('a tag can be changed and removed on a reloaded board', () => {
  const els = fixture.elements;
  const sticky = els.find(S.isSticky);
  const changed = S.setTag(els, sticky, 'Urgent', convert, newId);
  assert.equal(S.tagOf(changed.elements, sticky), 'Urgent');
  const removed = S.setTag(changed.elements, sticky, '', convert, newId);
  assert.equal(S.tagOf(removed.elements, sticky), '');
});

test('the board stays plain Excalidraw JSON: stock element fields plus customData, nothing else', () => {
  const stock = new Set(['id', 'type', 'x', 'y', 'width', 'height', 'angle', 'strokeColor', 'backgroundColor', 'fillStyle', 'strokeWidth',
    'strokeStyle', 'roughness', 'opacity', 'groupIds', 'frameId', 'roundness', 'seed', 'version', 'versionNonce', 'isDeleted',
    'boundElements', 'updated', 'link', 'locked', 'customData', 'text', 'fontSize', 'fontFamily', 'textAlign', 'verticalAlign',
    'baseline', 'containerId', 'originalText', 'lineHeight']);
  fixture.elements.forEach((e) => {
    Object.keys(e).forEach((k) => assert.ok(stock.has(k), 'unexpected field ' + k));
    if (e.customData) assert.ok(['sticky', 'sticky-tag'].includes(e.customData.kind));
  });
  assert.deepEqual(JSON.parse(JSON.stringify(fixture)), fixture);
  fixture.elements.filter((e) => e.type === 'text').forEach((t) => {
    const box = fixture.elements.find((b) => b.id === t.containerId);
    assert.ok(box.boundElements.some((b) => b.id === t.id), 'bound text is listed by its container');
  });
});
