// The sticky bar: four colour buttons that add a sticky at the centre of the view, and a box for the tags of the selected sticky.
// The rules for what a sticky and a tag are live in stickies.js; this file only wires them to the page and to Excalidraw.
(function () {
  var bar = document.getElementById('stickies');
  var input = document.getElementById('sticky-tags');
  var swatches = document.getElementById('sticky-colours');
  var current = null; // the sticky the board has selected now
  var target = null; // the sticky the box was opened for: the tags go to it, whatever is selected by the time they are applied
  var before = ''; // what the box held when it was opened

  function newId() { return Math.random().toString(36).slice(2, 12) + Date.now().toString(36); }
  function convert(skeletons) { return ExcalidrawLib.convertToExcalidrawElements(skeletons); }
  var tools = { convert: convert, newId: newId }; // what stickies.js needs from the page
  function ready() { return !!window.api; }
  function board() { return document.querySelector('.excalidraw'); }
  function find(all, id) { return all.filter(function (e) { return e.id === id && !e.isDeleted; })[0] || null; }

  // Excalidraw hears keys on its own container only, so Enter is sent there: it opens the text box of the selected shape.
  function startTyping() {
    var box = board();
    if (box) box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
  }

  function select(ids, groups) {
    var selected = {};
    var grouped = {};
    ids.forEach(function (id) { selected[id] = true; });
    groups.forEach(function (id) { grouped[id] = true; });
    return { selectedElementIds: selected, selectedGroupIds: grouped };
  }

  function addSticky(colour) {
    if (!ready()) return;
    var state = window.api.getAppState();
    var all = window.api.getSceneElementsIncludingDeleted();
    var left = -state.scrollX;
    var right = left + state.width / state.zoom.value;
    var cx = left + (right - left) / 2;
    var cy = state.height / 2 / state.zoom.value - state.scrollY;
    var made = convert([Stickies.stickySkeleton(all, { x: cx, y: cy }, colour, { left: left, right: right })])[0];
    window.api.updateScene({ elements: all.concat([made]), appState: select([made.id], []), commitToHistory: true });
    setTimeout(startTyping, 50);
  }

  // The selection once tags have been applied to the sticky `id`: the sticky and its tags if it is still the selection, so
  // that it stays selected, or null if the user has already clicked something else, so that their selection is left alone.
  function selectionAfter(all, id, result) {
    var still = Stickies.stickyFor(all, window.api.getAppState().selectedElementIds);
    if (!still || still.id !== id) return null;
    if (!result.groupId) return select([id], []);
    var members = result.elements.filter(function (e) { return !e.isDeleted && e.groupIds.indexOf(result.groupId) >= 0; });
    return select(members.map(function (e) { return e.id; }), [result.groupId]);
  }

  // Apply what is in the box to the sticky it was opened for.
  function applyTags() {
    var id = target;
    target = null;
    if (!ready() || !id) return;
    var all = window.api.getSceneElementsIncludingDeleted();
    var sticky = find(all, id);
    if (!sticky) return;
    var result = Stickies.setTags(all, sticky, Stickies.tagList(input.value), tools);
    if (result.elements === all) { input.value = Stickies.tagsOf(all, sticky).join(', '); return; }
    var update = { elements: result.elements, commitToHistory: true };
    var selection = selectionAfter(all, id, result);
    if (selection) update.appState = selection;
    window.api.updateScene(update);
  }

  // A tagged sticky is in a group, so Excalidraw's Enter (which wants exactly one selected shape) does nothing on it, and
  // a double-click takes two goes. This makes Enter work: it selects the sticky alone and opens its text.
  function editText(id) {
    window.api.updateScene({ appState: select([id], []) });
    setTimeout(startTyping, 50);
  }

  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' || ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey || !ready()) return;
    if (ev.target.closest && ev.target.closest('input, textarea, [contenteditable]')) return;
    var state = window.api.getAppState();
    if (state.editingElement || Object.keys(state.selectedElementIds).length < 2) return;
    var sticky = Stickies.stickyFor(window.api.getSceneElements(), state.selectedElementIds);
    if (!sticky) return;
    ev.preventDefault();
    ev.stopPropagation();
    editText(sticky.id);
  }, true);

  Stickies.COLOURS.forEach(function (c) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sticky-swatch';
    b.textContent = '+';
    b.style.background = c.fill;
    b.title = 'Add a ' + c.name + ' sticky';
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', function () { addSticky(c.name); });
    swatches.appendChild(b);
  });

  input.addEventListener('focus', function () { target = current; before = input.value; });
  input.addEventListener('change', applyTags);
  input.addEventListener('keydown', function (ev) {
    ev.stopPropagation(); // Delete, Backspace and letters here must not reach the board
    if (ev.key !== 'Enter' && ev.key !== 'Escape') return;
    ev.preventDefault();
    if (ev.key === 'Escape') input.value = before; // leaving with the old text applies nothing
    input.blur(); // leaving the box is what applies the tags
    if (board()) board().focus(); // so that Ctrl or Cmd + Z, Delete and Enter act on the board again
  });

  // Called by app.js on every change of the board or the selection.
  window.stickiesUi = {
    sync: function (elements, appState) {
      var sticky = Stickies.stickyFor(elements, appState.selectedElementIds || {});
      current = sticky ? sticky.id : null;
      input.disabled = !sticky;
      input.placeholder = sticky ? 'Tags, separated by commas' : 'Select a sticky to tag it';
      if (document.activeElement !== input) input.value = sticky ? Stickies.tagsOf(elements, sticky).join(', ') : '';
      bar.setAttribute('data-sticky', sticky ? 'selected' : 'none');
    },
  };
})();
