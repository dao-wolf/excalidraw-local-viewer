// Loads one board from /boards/ and shows it in Excalidraw. Usage: /?board=name.excalidraw (default sample.excalidraw)
(function () {
  var board = new URLSearchParams(location.search).get('board') || 'sample.excalidraw';
  var valid = /^[A-Za-z0-9][A-Za-z0-9._ -]*\.excalidraw$/.test(board) && board.indexOf('..') < 0;
  var base = valid ? board.replace(/\.excalidraw$/, '') : 'board';

  function title(elements) {
    var n = elements.filter(function (e) { return !e.isDeleted; }).length;
    document.title = base + ' (' + n + ' elements) | Excalidraw local viewer';
  }

  function render(initial) {
    var App = function () {
      return React.createElement(ExcalidrawLib.Excalidraw, {
        initialData: initial,
        excalidrawAPI: function (api) { window.api = api; },
        onChange: function (elements) { title(elements); },
      });
    };
    ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(App));
  }

  if (!valid) { console.error('Not a board name: ' + board); render(null); return; }
  fetch('boards/' + encodeURIComponent(board))
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      render({ elements: data.elements || [], appState: { viewBackgroundColor: '#ffffff', name: base }, scrollToContent: true });
    })
    .catch(function (err) { console.error('Could not load ' + board + ': ' + err.message); render(null); });
})();
