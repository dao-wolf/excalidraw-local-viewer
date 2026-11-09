// The sticky toolbar: four colour buttons that add a sticky at the centre of the view, and a tag box for the selected sticky.
// The rules for what a sticky and a tag are live in stickies.js; this file only wires them to the page and to Excalidraw.
(function () {
  var bar = document.getElementById('stickies');
  var input = document.getElementById('sticky-tag');
  var clear = document.getElementById('sticky-tag-clear');
  var edit = document.getElementById('sticky-edit');
  var swatches = document.getElementById('sticky-colours');
  var current = null; // the sticky whose tag the box shows

  function newId() { return Math.random().toString(36).slice(2, 12) + Date.now().toString(36); }
  function convert(skeletons) { return ExcalidrawLib.convertToExcalidrawElements(skeletons); }
  function ready() { return !!window.api; }

  // Excalidraw hears keys on its own container only, so Enter is sent there: it opens the text box of the selected shape.
  function startTyping() {
    var box = document.querySelector('.excalidraw');
    if (!box) return;
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
  }

  function addSticky(colour) {
    if (!ready()) return;
    var state = window.api.getAppState();
    var all = window.api.getSceneElementsIncludingDeleted();
    var cx = state.width / 2 / state.zoom.value - state.scrollX;
    var cy = state.height / 2 / state.zoom.value - state.scrollY;
    var made = convert([Stickies.stickySkeleton(all, cx, cy, colour)])[0];
    var selected = {};
    selected[made.id] = true;
    window.api.updateScene({ elements: all.concat([made]), appState: { selectedElementIds: selected, selectedGroupIds: {} }, commitToHistory: true });
    setTimeout(startTyping, 50);
  }

  function applyTag() {
    if (!ready() || !current) return;
    var all = window.api.getSceneElementsIncludingDeleted();
    var sticky = all.filter(function (e) { return e.id === current; })[0];
    if (!sticky) return;
    var result = Stickies.setTag(all, sticky, input.value, convert, newId);
    if (result.elements === all) { input.value = Stickies.tagOf(all, sticky); return; }
    var selected = {};
    var groups = {};
    if (result.groupId) {
      groups[result.groupId] = true;
      result.elements.forEach(function (e) { if (!e.isDeleted && e.groupIds.indexOf(result.groupId) >= 0) selected[e.id] = true; });
    } else {
      selected[sticky.id] = true;
    }
    window.api.updateScene({ elements: result.elements, appState: { selectedElementIds: selected, selectedGroupIds: groups }, commitToHistory: true });
  }

  // A tagged sticky is in a group, so a double-click first selects the group's piece, and a second one edits. This does it in one.
  function editText() {
    if (!ready() || !current) return;
    var selected = {};
    selected[current] = true;
    window.api.updateScene({ appState: { selectedElementIds: selected, selectedGroupIds: {} } });
    setTimeout(startTyping, 50);
  }

  Stickies.COLOURS.forEach(function (c) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sticky-swatch';
    b.style.background = c.fill;
    b.title = 'Add a ' + c.name + ' sticky';
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', function () { addSticky(c.name); });
    swatches.appendChild(b);
  });

  input.maxLength = Stickies.TAG_MAX;
  input.addEventListener('change', applyTag);
  input.addEventListener('keydown', function (ev) {
    ev.stopPropagation(); // Delete, Backspace and letters here must not reach the board
    if (ev.key === 'Enter') applyTag();
  });
  clear.addEventListener('click', function () { input.value = ''; applyTag(); });
  edit.addEventListener('click', editText);

  // Called by app.js on every change of the board or the selection.
  window.stickiesUi = {
    sync: function (elements, appState) {
      var sticky = Stickies.stickyFor(elements, appState.selectedElementIds || {});
      current = sticky ? sticky.id : null;
      input.disabled = clear.disabled = edit.disabled = !sticky;
      input.placeholder = sticky ? 'Tag, for example Urgent' : 'Select a sticky to tag it';
      if (document.activeElement !== input) input.value = sticky ? Stickies.tagOf(elements, sticky) : '';
      bar.setAttribute('data-sticky', sticky ? 'selected' : 'none');
    },
  };
})();
